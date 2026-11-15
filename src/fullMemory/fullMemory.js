// fullMemory: the Memory in a tab (design-review/v2-addenda/step5-fullmemory.html).
// - 1200px and wider: tag sidebar, sortable table, detail pane of the current paper;
//   900 to 1200px: the pane is a drawer (a row's ⓘ or d); below 900px: the popup's rows.
// - The search (field, pills, sort menu, tag list) is the popup's (popup/js/memory.js drives
//   the same element ids); the table is rendered here, through setListRenderer.
// - Memory writes go through the background queue (memoryOp). The views follow
//   chrome.storage changes, held while an edit form, a dialog or a bulk action is in progress,
//   then applied; the selection, the focused row and the open pane stay.
import { state, descendingSortKeys } from "@pmu/config.js";
import {
    warn,
    delay,
    escapeHtml,
    cleanPapers,
    miniHash,
    copyTextToClipboard,
    downloadTextFile,
} from "@pmu/functions.js";
import { shouldSync, pushToRemote, initSyncAndState } from "@pmu/sync.js";
import { readJournalAbbreviations, sortMemory } from "@pmu/state.js";
import {
    onPapersChange,
    getDefaultKeyboardAction,
    deletePaperInStorage,
    updateDuplicatedUrls,
} from "@pmu/data.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import { formatVenue } from "@pmu/venues.js";
import { addListener } from "@pmu/miniquery.js";
import {
    applyMemoryChanges,
    applyMemorySearch,
    clearMemorySearch,
    copyAndConfirmMemoryItem,
    loadMoreMemoryItems,
    makeMemoryHTML,
    mountMemoryEditForm,
    openEditors,
    openMemoryItemEdit,
    saveFavoriteItem,
    saved,
    setListRenderer,
    setMemorySort,
    showOnlyTag,
    toggleFavouritesFilter,
    toggleSortMenu,
    toggleTagFilter,
    toggleTagPanel,
} from "@pm/popup/js/memory.js";
import {
    displayOnScroll,
    expandRowAuthors,
    handleCopyBibtex,
    handleCopyHyperLink,
    handleCopyMarkdownLink,
    handleCopyPDFLink,
    handleEditKeys,
    handleOpenItemAlphaxiv,
    handleOpenItemAr5iv,
    handleOpenItemHuggingface,
    handleOpenItemLink,
    handleOpenItemScirate,
    handleOpenItemWebsiteURL,
    isComposing,
    paperBibtex,
} from "@pm/popup/js/handlers.js";
import {
    authorList,
    dateAndTime,
    getMemoryEmptyHTML,
    getPaperInfoHTML,
    timeAgo,
} from "@pm/popup/js/templates.js";
import { showToast } from "@pm/popup/js/popup.js";
import { icon, paintIcons } from "@pm/popup/js/icons.js";
import {
    closeInfoPanel,
    infoPanelIsOpen,
    setupInfoPanel,
    toggleInfoPanel,
} from "@pm/popup/js/infopanel.js";
import { setupTooltips } from "@pm/popup/js/tooltip.js";
import { createTagField, tagCounts } from "@pm/popup/js/tagfield.js";
import { setupTopbar } from "@pm/shared/js/topbar.js";
import { askDialog, confirmDialog } from "@pm/options/dialog.js";

const TABLE = matchMedia("(min-width: 900px)"); // table, sidebar, bulk select
const WIDE = matchMedia("(min-width: 1200px)"); // the detail pane is a column, not a drawer
/** The layout the window's width asks for: wide | mid (drawer) | narrow (popup rows) */
const wantedLayout = () => (WIDE.matches ? "wide" : TABLE.matches ? "mid" : "narrow");
// The layout shown (body[data-layout], the CSS follows it): it changes once the open edit
// forms are saved (applyLayout), so an edit form that could not be saved stays visible
document.body.dataset.layout = wantedLayout();
const isTable = () => document.body.dataset.layout !== "narrow";
const isDrawer = () => document.body.dataset.layout === "mid";

const ui = {
    current: null, // id of the current paper: highlighted row, detail pane
    editing: null, // id of the paper edited in the detail pane
    selected: new Set(),
    expanded: new Set(), // rows showing all their authors
    busy: 0, // dialogs and bulk actions in progress
    pending: new Set(), // papers changed meanwhile: the views follow once it is over
    stale: false, // the whole list must be drawn again (after a sync)
};

const $ = (id) => document.getElementById(id);
const searchText = () => $("memory-search")?.value.trim() ?? "";
const rowOf = (id) =>
    id ? $("m-tbody").querySelector(`tr[data-id="${CSS.escape(id)}"]`) : null;
/** The popup's handlers read the paper's id from their event's row */
const ev = (id) => ({ target: { closest: () => ({ id: `memory-container--${id}` }) } });
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------------------
// -----  The table -----
// ---------------------

/** "Vaswani, Shazeer, Parmar +5" (escaped); every author once "+5" or + was used */
const rowAuthors = (paper) => {
    const authors = authorList(paper.author);
    if (ui.expanded.has(paper.id)) return escapeHtml(authors.join(", "));
    const names = escapeHtml(
        authors
            .slice(0, 3)
            .map((a) => a.split(" ").pop())
            .join(", "),
    );
    const extra = authors.length - 3;
    return extra > 0
        ? `${names} <button type="button" class="pm-item-authors-more" tabindex="-1" aria-label="Show all ${authors.length} authors (+)" data-tip="Show all authors" data-tip-key="+">+${extra}</button>`
        : names;
};

/** The venue without its year (the table has a Year column) */
const venueName = (paper) => formatVenue(paper).short.replace(/\s+(19|20)\d{2}$/, "");

const glyph = (name, label) =>
    `<span class="m-glyph" role="img" aria-label="${label}" data-tip="${label}">${icon(name)}</span>`;

const favLabel = (fav) => (fav ? "Remove from favourites" : "Add to favourites");

/**
 * A paper's table row: one Tab stop (the row); its controls have tabindex -1 and keys
 * @param {object} paper
 * @returns {string} HTML, every user / remote text escaped
 */
const rowHTML = (paper) => {
    const id = escapeHtml(paper.id);
    const title = escapeHtml(paper.title.replace(/\s+/g, " "));
    const fav = !!paper.favorite;
    const selected = ui.selected.has(paper.id);
    const venue = venueName(paper);
    const opened = escapeHtml(dateAndTime(paper.lastOpenDate));
    const tags = (paper.tags ?? [])
        .map(
            (t) =>
                `<button type="button" class="pm-tg" tabindex="-1" data-tag="${escapeHtml(t)}" aria-label="Show only the papers tagged ${escapeHtml(t)}">${escapeHtml(t)}</button>`,
        )
        .join("");
    const cls = ["m-row"];
    if (selected) cls.push("is-selected");
    if (paper.id === ui.current) cls.push("is-current");
    return /*html*/ `<tr class="${cls.join(" ")}" tabindex="0" data-id="${id}" aria-label="${title}">
        <td class="c-check"><input type="checkbox" class="pm-check m-select" tabindex="-1" aria-label="Select ${title}"${selected ? " checked" : ""} /></td>
        <td class="c-fav"><button type="button" class="m-star" tabindex="-1" aria-pressed="${fav}" aria-label="${favLabel(fav)}" data-tip="${favLabel(fav)}">${icon("star")}</button></td>
        <td class="c-paper"><div class="m-t">${title}</div><div class="m-a"><span class="m-authors">${rowAuthors(paper)}</span>${paper.note ? glyph("doc", "Has a note") : ""}${paper.codeLink ? glyph("code", "Has a code link") : ""}</div></td>
        <td class="c-venue">${venue ? `<span class="m-venue">${escapeHtml(venue)}</span>` : ""}</td>
        <td class="c-year">${escapeHtml(paper.year ?? "")}</td>
        <td class="c-tags"><div class="m-tags">${tags}</div></td>
        <td class="c-open c-num"><time datetime="${escapeHtml(paper.lastOpenDate ?? "")}" data-tip="Last opened ${opened}" aria-label="Last opened ${opened}">${escapeHtml(timeAgo(paper.lastOpenDate))}</time></td>
        <td class="c-visits c-num">${escapeHtml(paper.count ?? "")}</td>
        <td class="c-info"><button type="button" class="pm-info-btn m-details" tabindex="-1" aria-label="Details (d)" data-tip="Details" data-tip-key="d" aria-controls="m-detail" aria-expanded="false">${icon("info")}</button></td>
    </tr>`;
};

/** Native title on the titles cut at 2 lines, and only on those */
const markTruncated = (root) =>
    requestAnimationFrame(() =>
        root.querySelectorAll(".m-t").forEach((el) => {
            if (el.scrollHeight > el.clientHeight + 1) el.title = el.textContent;
            else el.removeAttribute("title");
        }),
    );

/**
 * memory.js's list renderer (setListRenderer): a page of state.papersList as table rows,
 * when the window is wide enough; page 0 replaces the table
 * @param {number} pagination
 * @returns {boolean} Whether the table was rendered (otherwise: the popup's rows)
 */
const renderTable = (pagination) => {
    if (!isTable()) return false;
    const n = state.memoryItemsPerPage;
    const rows = [];
    for (const paper of state.papersList.slice(pagination * n, (pagination + 1) * n)) {
        try {
            rows.push(rowHTML(paper));
        } catch (error) {
            warn("Could not show a paper:", error, paper);
        }
    }
    const tbody = $("m-tbody");
    if (pagination === 0) {
        tbody.innerHTML = rows.join("");
        const empty = $("m-empty");
        empty.hidden = state.papersList.length > 0;
        empty.innerHTML = empty.hidden
            ? ""
            : getMemoryEmptyHTML(
                  searchText(),
                  Object.keys(cleanPapers(state.papers)).length === 0,
              );
        afterSearch();
    } else {
        tbody.insertAdjacentHTML("beforeend", rows.join(""));
        setDrawer(drawerIsOpen()); // the new rows' ⓘ
    }
    markTruncated(tbody);
    return true;
};

/** After a search: selection, current paper, headers, sidebar, pane */
const afterSearch = () => {
    const shown = new Set(state.papersList.map((p) => p.id));
    for (const id of ui.selected) if (!shown.has(id)) ui.selected.delete(id);
    if (!ui.editing && !shown.has(ui.current)) {
        ui.current = state.papersList[0]?.id ?? null;
        rowOf(ui.current)?.classList.add("is-current");
    }
    renderSelection();
    renderSortHeaders();
    renderSidebar();
    renderPane();
    setDrawer(drawerIsOpen());
};

/** Title, Year, Opened, Visits sort the table; the active one shows its direction */
const renderSortHeaders = () => {
    document.querySelectorAll(".m-table th .m-sort").forEach((btn) => {
        const th = btn.closest("th");
        const key = btn.dataset.sort;
        if (key !== state.sortKey) return th.removeAttribute("aria-sort");
        const descending = descendingSortKeys.includes(key) !== !!state.sortReversed;
        th.setAttribute("aria-sort", descending ? "descending" : "ascending");
    });
};

/** A header click: that sort, or the other direction when it is already the sort */
const sortByHeader = (key) =>
    setMemorySort(key, key === state.sortKey ? !state.sortReversed : false);

// -------------------------------
// -----  Current paper, pane -----
// -------------------------------

/**
 * The current paper: highlighted row, shown in the detail pane. Pinned while its edit form
 * is open.
 * @param {string} id
 */
const setCurrent = (id) => {
    if (ui.editing || id === ui.current || !state.papers[id]) return;
    ui.current = id;
    $("m-tbody")
        .querySelectorAll("tr.is-current")
        .forEach((tr) => tr.classList.remove("is-current"));
    rowOf(id)?.classList.add("is-current");
    renderPane();
    setDrawer(drawerIsOpen());
};

/** 900 to 1200px: the pane is a drawer, closed until a row's ⓘ or d opens it */
const setDrawer = (open) => {
    document.body.dataset.pane = open ? "open" : "closed";
    $("m-tbody")
        .querySelectorAll(".m-details")
        .forEach((b) =>
            b.setAttribute(
                "aria-expanded",
                String(open && b.closest("tr").dataset.id === ui.current),
            ),
        );
};
const drawerIsOpen = () => document.body.dataset.pane === "open";

/** Closes the drawer (saving its edit form first); the focus goes back to the current row */
const closeDrawer = async () => {
    // the edit form first: saved and closed, or (not saved) the drawer stays with it
    if (ui.editing && !(await paneForm()?.finish(true))) return;
    setDrawer(false);
    rowOf(ui.current)?.focus({ preventScroll: true });
};

const ELSEWHERE = [
    ["checkAr5iv", "5", "ar5iv"],
    ["checkAlphaxiv", "x", "alphaXiv"],
    ["checkHuggingface", "f", "Hugging Face"],
    ["checkScirate", "s", "SciRate"],
];
/** ar5iv, alphaXiv… enabled in the settings, for arXiv papers */
const elsewhere = (paper) =>
    paper.source === "arxiv" ? ELSEWHERE.filter(([pref]) => state.prefs[pref]) : [];

const hasFile = (id) => {
    const file = state.files?.[id];
    return !!file && (!!file.id || file.id === 0);
};

/**
 * The detail pane of a paper: actions with their keys, "Also on" (↗), notes (tags, code
 * link, note) with Edit, the Info panel's fields, Delete
 * @param {object} paper
 * @returns {string} HTML, every user / remote text escaped
 */
const paneHTML = (paper) => {
    const fav = !!paper.favorite;
    const venue = formatVenue(paper).short || String(paper.year ?? "").trim();
    const target = state.prefs.checkPreferPdf ? "PDF" : "abstract page";
    const act = (key, label, title) =>
        `<button type="button" class="pm-btn" data-act="${key}" aria-label="${title} (${key})">${label} <span class="pm-kbd">${key}</span></button>`;
    const also = elsewhere(paper)
        .map(
            ([, key, name]) =>
                `<button type="button" class="pm-quiet" data-act="${key}" aria-label="Open on ${name} (${key})" data-tip="Open on ${name}" data-tip-key="${key}">${name}<span class="pm-out-mark" aria-hidden="true"> ↗</span> <span class="pm-kbd">${key}</span></button>`,
        )
        .join("");
    const tags = (paper.tags ?? [])
        .map((t) => `<span class="pm-chip">${escapeHtml(t)}</span>`)
        .join("");
    const link = paper.codeLink || "";
    const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    const code = link
        ? `<a class="pm-out" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-tip="Open ${escapeHtml(href)} in a new tab">${escapeHtml(link.replace(/^https?:\/\//, ""))}</a>`
        : `<span class="pm-ph">No code link</span>`;
    const note = paper.note
        ? `<div class="m-note">${escapeHtml(paper.note)}</div>`
        : `<span class="pm-ph">No note</span>`;
    return /*html*/ `
        <div class="m-d-top">
            <h2 class="m-d-title">${escapeHtml(paper.title.replace(/\s+/g, " "))}</h2>
            <button type="button" class="pm-iconbtn m-d-fav" data-act="fav" aria-pressed="${fav}" aria-label="${favLabel(fav)}" data-tip="${favLabel(fav)}">${icon("star")}</button>
            <button type="button" class="pm-iconbtn m-d-close" data-act="close" aria-label="Close details (d)" data-tip="Close details" data-tip-key="d">${icon("x")}</button>
        </div>
        <p class="m-d-authors">${escapeHtml(authorList(paper.author).join(", "))}</p>
        ${venue ? `<p class="m-d-venue">${escapeHtml(venue)}</p>` : ""}
        <div class="m-acts">
            ${paper.source === "website" ? act("o", "Open", "Open the page in a new tab") : act("o", "Open", `Open the ${target}`)}
            ${act("c", "URL", `Copy the URL of the ${target}`)}
            ${act("h", "Rich link", "Copy the title as a clickable link, for docs, Slack, email…")}
            ${act("m", "Markdown", "Copy a Markdown link")}
            ${act("b", "BibTeX", "Copy the BibTeX citation")}
            ${hasFile(paper.id) ? `<button type="button" class="pm-btn" data-act="pdf" aria-label="Open the downloaded PDF">PDF file ${icon("pdf", "pm-i-sm")}</button>` : ""}
        </div>
        ${also ? `<div class="m-also">Also on ${also}</div>` : ""}
        <div class="m-d-h">
            <h3 class="pm-section-title">Your notes</h3>
            <button type="button" class="pm-quiet m-d-edit" data-act="e" aria-label="Edit tags, code link and note (e)">${icon("edit")}Edit <span class="pm-kbd">e</span></button>
        </div>
        <div class="m-fields">
            <div class="m-field"><span>Tags</span><div class="m-chips">${tags || '<span class="pm-ph">No tags</span>'}</div></div>
            <div class="m-field"><span>Code</span><div>${code}</div></div>
            <div class="m-field"><span>Note</span>${note}</div>
        </div>
        <div class="m-editslot"></div>
        <div class="m-d-h"><h3 class="pm-section-title">Info</h3></div>
        <dl class="m-info">${getPaperInfoHTML(paper)}</dl>
        <div class="m-d-foot">
            <button type="button" class="pm-quiet" data-act="Backspace" aria-label="Delete this paper (⌫)">${icon("trash")}Delete <span class="pm-kbd">⌫</span></button>
        </div>`;
};

/** Draws the pane of the current paper again (not while its edit form is open) */
const renderPane = () => {
    const pane = $("m-detail");
    if (!pane || ui.editing) return;
    const paper = ui.current && state.papers[ui.current];
    // a button of the pane that had the focus has it again
    const act = pane.contains(document.activeElement)
        ? document.activeElement.dataset?.act
        : null;
    pane.innerHTML = paper
        ? paneHTML(paper)
        : `<div class="pm-empty m-d-empty">${icon("doc")}<p>No paper to show.</p></div>`;
    if (act)
        pane.querySelector(`[data-act="${CSS.escape(act)}"]`)?.focus({
            preventScroll: true,
        });
    if (!paper && drawerIsOpen()) setDrawer(false);
};

const paneForm = () => $("m-detail").querySelector(".pm-edit");

/** e: the edit form in the pane (the drawer opens for it) */
const openPaneEdit = () => {
    if (ui.editing) return paneForm()?.querySelector(".pm-tagin")?.focus();
    const id = ui.current;
    if (!state.papers[id]) return;
    if (isDrawer()) setDrawer(true);
    const pane = $("m-detail");
    ui.editing = id;
    pane.classList.add("is-edit");
    mountMemoryEditForm(pane.querySelector(".m-editslot"), id, {
        onClose: () => closePaneEdit(id),
    });
};

/** The pane's form is saved: the pane shows the paper again, the focus goes back to its row */
const closePaneEdit = (id) => {
    openEditors.delete(id);
    if (ui.editing !== id) return;
    ui.editing = null;
    $("m-detail").classList.remove("is-edit");
    renderPane();
    rowOf(id)?.focus({ preventScroll: true });
    flushChanges();
    applyLayout();
};

// -----------------------
// -----  Selection  -----
// -----------------------

/** Rows, header checkbox and bulk bar after a change of the selection */
const renderSelection = () => {
    for (const tr of $("m-tbody").rows) {
        const on = ui.selected.has(tr.dataset.id);
        tr.classList.toggle("is-selected", on);
        const box = tr.querySelector(".m-select");
        if (box) box.checked = on;
    }
    const n = ui.selected.size;
    const total = state.papersList.length;
    const all = $("m-select-all");
    all.checked = n > 0 && n === total;
    all.indeterminate = n > 0 && n < total;
    all.classList.toggle("is-mixed", all.indeterminate);
    const label =
        n > 0 && n === total
            ? "Clear the selection"
            : `Select all ${plural(total, "paper")}`;
    all.setAttribute("aria-label", label);
    all.dataset.tip = label;
    const bar = $("m-bulk");
    bar.hidden = n === 0;
    $("m-bulk-count").textContent = `${n} selected`;
    bar.setAttribute("aria-label", `Actions for the ${plural(n, "selected paper")}`);
};

const toggleSelected = (id, on = !ui.selected.has(id)) => {
    on ? ui.selected.add(id) : ui.selected.delete(id);
    renderSelection();
};

const toggleSelectAll = () => {
    const all =
        state.papersList.length > 0 && ui.selected.size === state.papersList.length;
    ui.selected = all ? new Set() : new Set(state.papersList.map((p) => p.id));
    renderSelection();
};

/**
 * The selected papers' BibTeX, one after the other
 * @param {string[]} ids
 * @returns {{text: string, n: number, missing: number}} n entries; missing: papers left out
 *   (no BibTeX, or one that cannot be read)
 */
const selectionBibtex = (ids) => {
    const entries = ids
        .map((id) => {
            try {
                return paperBibtex(state.papers[id]).trim();
            } catch (e) {
                warn("No BibTeX for", id, e);
                return "";
            }
        })
        .filter(Boolean);
    return {
        text: entries.join("\n\n"),
        n: entries.length,
        missing: ids.length - entries.length,
    };
};

/** "· 1 paper left out (no readable BibTeX)" */
const leftOut = (missing) =>
    missing ? ` · ${plural(missing, "paper")} left out (no readable BibTeX)` : "";

/** "Add tag…": tags typed in the popup's tag field (suggestions with counts) */
const askTags = async (n) => {
    const root = document.createElement("div");
    root.className = "m-addtags";
    const field = createTagField({ root, tags: [] });
    const help = document.createElement("p");
    help.textContent = "They are added to the tags each paper already has.";
    // ↵ on an empty field adds the tags typed so far
    root.addEventListener(
        "keydown",
        (e) => {
            if (
                e.key !== "Enter" ||
                field.input.value.trim() ||
                !field.getTags().length
            )
                return;
            e.preventDefault();
            e.stopPropagation();
            $("o-dialog-foot").querySelector('[value="add"]')?.click();
        },
        true,
    );
    setTimeout(() => field.focus());
    const answer = await askDialog({
        title: `Add tags to ${plural(n, "paper")}`,
        body: [root, help],
        actions: [{ label: "Add tags", value: "add", kind: "primary" }],
    });
    if (answer !== "add") return [];
    field.commitPending();
    return field.getTags();
};

/** What deletePaperInStorage removes besides the Memory, for papers deleted in bulk */
const forgetDeleted = async (papers) => {
    for (const paper of papers.filter(Boolean)) {
        if (paper.title) delete state.titleHashToIds[miniHash(paper.title)];
        await updateDuplicatedUrls(null, paper.id, true);
    }
};

/**
 * The bulk bar's actions, on the selected papers. A write is one queued operation (batch).
 * @param {string} action tag | fav | copy | export | delete | clear
 */
const bulk = async (action) => {
    const ids = [...ui.selected].filter((id) => state.papers[id]);
    if (action === "clear" || !ids.length) {
        ui.selected.clear();
        return renderSelection();
    }
    const n = ids.length;
    if (action === "copy" || action === "export") {
        const bib = selectionBibtex(ids);
        if (!bib.n) return showToast(`No readable BibTeX in ${plural(n, "paper")}`);
        if (action === "copy") {
            copyTextToClipboard(bib.text);
            return showToast(
                `BibTeX of ${plural(bib.n, "paper")} copied${leftOut(bib.missing)}`,
            );
        }
        const stamp = new Date().toJSON().slice(0, 10);
        downloadTextFile(
            bib.text,
            `PaperMemory-${bib.n}-papers-${stamp}.bib`,
            "text/plain",
        );
        return showToast(`${plural(bib.n, "paper")} exported${leftOut(bib.missing)}`);
    }
    ui.busy++;
    try {
        if (action === "fav") {
            const date = new Date().toJSON();
            const ops = ids
                .filter((id) => !state.papers[id].favorite)
                .map((id) => ({
                    op: "patch",
                    id,
                    fields: { favorite: true, favoriteDate: date },
                }));
            if (ops.length && !saved(await memoryOp({ op: "batch", ops }))) return;
            showToast(`${plural(n, "paper")} in your favourites`);
        } else if (action === "tag") {
            const tags = [
                ...new Set((await askTags(n)).map((t) => t.trim()).filter(Boolean)),
            ];
            // papers deleted elsewhere while the dialog was open are left out
            const live = ids.filter((id) => state.papers[id]);
            if (!tags.length || !live.length) return;
            const ops = live.map((id) => ({ op: "addTags", id, tags }));
            if (!saved(await memoryOp({ op: "batch", ops }))) return;
            showToast(
                `${plural(tags.length, "tag")} added to ${plural(live.length, "paper")}`,
            );
        } else if (action === "delete") {
            const ok = await confirmDialog({
                title: n === 1 ? "Delete 1 paper?" : `Delete ${n} papers?`,
                body: [
                    "They are deleted from your Memory with their tags, code links and notes.",
                ],
                confirm: "Delete",
                danger: true,
            });
            if (!ok) return;
            // papers deleted elsewhere while the dialog was open are already gone
            const papers = ids.map((id) => state.papers[id]).filter(Boolean);
            if (papers.length) {
                const ops = papers.map((p) => ({ op: "delete", id: p.id }));
                if (!saved(await memoryOp({ op: "batch", ops }))) return; // still selected
                await forgetDeleted(papers);
            }
            ui.selected.clear();
            showToast(`${plural(papers.length, "paper")} deleted`);
        }
    } finally {
        ui.busy--;
        ids.forEach((id) => ui.pending.add(id));
        flushChanges();
    }
};

// -------------------------------
// -----  Actions on a paper  -----
// -------------------------------

/** Deletes a paper after a confirmation; the focus goes to the paper now in its place */
const confirmDelete = async (id) => {
    const paper = state.papers[id];
    if (!paper) return;
    const index = state.papersList.findIndex((p) => p.id === id);
    const back = document.activeElement;
    let deleted = false;
    ui.busy++;
    try {
        const ok = await confirmDialog({
            title: "Delete this paper from your Memory?",
            body: [
                paper.title.replace(/\s+/g, " "),
                "Its tags, code link and note are deleted with it.",
            ],
            confirm: "Delete",
            danger: true,
        });
        if (!ok) return;
        deleted = await deletePaperInStorage(id);
        if (!deleted) return saved({ ok: false, error: "delete failed" });
        ui.selected.delete(id);
        ui.expanded.delete(id);
    } finally {
        ui.busy--;
        ui.pending.add(id);
        flushChanges();
        if (!deleted && back?.isConnected) back.focus({ preventScroll: true });
    }
    // the next paper (or the previous one) takes its place
    const next = state.papersList[Math.min(index, state.papersList.length - 1)];
    if (!next) return $("memory-search").focus();
    if (isTable()) {
        setCurrent(next.id);
        rowOf(next.id)?.focus();
    } else $(`memory-container--${next.id}`)?.focus();
};

const openLocal = (id) => {
    if (!hasFile(id)) return;
    memoryOp({ op: "visit", id });
    chrome.downloads.open(state.files[id].id);
};

const openPaper = (id) => {
    const paper = state.papers[id];
    if (paper.source === "website") return handleOpenItemWebsiteURL(ev(id));
    if (state.prefs.checkEnterLocalPdf && hasFile(id)) return openLocal(id);
    return handleOpenItemLink(ev(id));
};

const toggleFavourite = async (id) => {
    await saveFavoriteItem(id, !state.papers[id].favorite);
    ui.pending.add(id);
    flushChanges();
};

/** `+`: every author of a row */
const expandAuthors = (id) => {
    if (!isTable()) return expandRowAuthors($(`memory-container--${id}`));
    ui.expanded.add(id);
    const span = rowOf(id)?.querySelector(".m-authors");
    if (span) span.textContent = authorList(state.papers[id].author).join(", ");
};

/** `d`: the drawer (900 to 1200px), or the row's Info panel (below 900px) */
const toggleDetails = (id) => {
    if (!isTable()) {
        const row = $(`memory-container--${id}`);
        return row && toggleInfoPanel(row, row.querySelector(".memory-item-info"), id);
    }
    if (!isDrawer()) return;
    if (drawerIsOpen() && (ui.current === id || ui.editing)) return closeDrawer();
    setCurrent(id);
    setDrawer(true);
};

/**
 * A key (or a pane button) on a paper: the popup's keys, as on a Memory row
 * @param {string} key
 * @param {string} id
 * @returns {boolean} Whether the key did something
 */
const runKey = (key, id) => {
    const paper = state.papers[id];
    if (!paper) return false;
    const copies = {
        c: handleCopyPDFLink,
        h: handleCopyHyperLink,
        m: handleCopyMarkdownLink,
        b: handleCopyBibtex,
    };
    const opens = {
        5: handleOpenItemAr5iv,
        x: handleOpenItemAlphaxiv,
        f: handleOpenItemHuggingface,
        s: handleOpenItemScirate,
    };
    if (key === "o") openPaper(id);
    else if (copies[key]) copies[key](ev(id));
    else if (opens[key]) {
        if (!elsewhere(paper).some(([, k]) => k === key)) return false;
        opens[key](ev(id));
    } else if (key === "t")
        copyAndConfirmMemoryItem({
            id,
            textToCopy: paper.title,
            feedbackText: "Title copied",
        });
    else if (key === "e") isTable() ? openPaneEdit() : openMemoryItemEdit(id);
    else if (key === "Backspace") confirmDelete(id);
    else if (key === "+") expandAuthors(id);
    else if (key === "d") toggleDetails(id);
    else if (key === "fav") toggleFavourite(id);
    else if (key === "pdf") openLocal(id);
    else if (key === "close") closeDrawer();
    else return false;
    return true;
};

// --------------------------
// -----  Live refresh  -----
// --------------------------

const dialogIsOpen = () => !!$("o-dialog")?.open;
/** An action in progress: the views wait for it before following the Memory's changes */
const isBusy = () => ui.busy > 0 || dialogIsOpen() || openEditors.size > 0;

/** Where the focus is in the list, to find it again once the list is drawn again */
const focusMemo = () => {
    const row = document.activeElement?.closest?.("tr.m-row");
    if (!row) return null;
    return { id: row.dataset.id, index: [...$("m-tbody").rows].indexOf(row) };
};

/** The table drawn again where it is: as many rows, same scroll, same focused row */
const redrawTable = () => {
    const shown = $("m-tbody").rows.length;
    const memo = focusMemo();
    const top = window.scrollY;
    applyMemorySearch();
    while ($("m-tbody").rows.length < shown && loadMoreMemoryItems());
    window.scrollTo({ top });
    if (!memo) return;
    const rows = $("m-tbody").rows;
    (rowOf(memo.id) ?? rows[Math.min(memo.index, rows.length - 1)])?.focus({
        preventScroll: true,
    });
};

/**
 * Applies the Memory's changes to the views, unless an action is in progress (then once it
 * ends). Open edit forms take at once the new values of the fields they did not edit.
 */
const flushChanges = () => {
    if (!ui.pending.size && !ui.stale) return;
    for (const id of ui.pending) {
        if (state.papers[id]) {
            openEditors.get(id)?.(state.papers[id]);
            continue;
        }
        // deleted elsewhere while edited here: its form goes (a row's with its row, below)
        openEditors.delete(id);
        if (ui.editing === id) {
            ui.editing = null;
            $("m-detail").classList.remove("is-edit");
        }
    }
    if (isBusy()) return;
    const ids = [...ui.pending];
    ui.pending.clear();
    for (const id of ids) {
        if (state.papers[id]) continue;
        ui.selected.delete(id);
        ui.expanded.delete(id);
    }
    const all = ui.stale;
    ui.stale = false;
    // a change (title, visits, last opened…) can move a paper: sorted again first
    sortMemory();
    if (state.sortReversed) state.sortedPapers.reverse();
    if (isTable()) redrawTable();
    else if (all) applyMemorySearch();
    else applyMemoryChanges(ids, { paperView: () => false });
    renderSidebar();
};

// ---------------------
// -----  Sidebar  -----
// ---------------------

const renderTagList = () => {
    const counts = tagCounts();
    const q = $("m-tag-filter").value.trim().toLowerCase();
    const on = new Set(
        state.memoryFilters.filter((f) => f.type === "tag").map((f) => f.value),
    );
    const tags = [...counts.keys()]
        .filter((t) => t.toLowerCase().includes(q))
        .sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
    $("m-taglist").innerHTML =
        tags
            .map(
                (t) =>
                    `<button type="button" class="m-tag" data-tag="${escapeHtml(t)}" aria-pressed="${on.has(t)}"><span>${escapeHtml(t)}</span><span class="pm-count">${counts.get(t)}</span></button>`,
            )
            .join("") ||
        `<p class="m-tag-none">${counts.size ? "No tag matches" : "No tags yet. Add some with Edit (e)."}</p>`;
};

const renderSidebar = () => {
    const favOn = state.memoryFilters.some((f) => f.type === "fav");
    const tagOn = state.memoryFilters.some((f) => f.type === "tag");
    $("m-all").setAttribute("aria-current", String(!favOn && !tagOn));
    $("m-favs").setAttribute("aria-current", String(favOn));
    $("m-fav-count").textContent = state.sortedPapers.filter((p) => p.favorite).length;
    $("m-tag-count").textContent = tagCounts().size;
    renderTagList();
};

// -----------------------
// -----  Sync status -----
// -----------------------

const sync = { status: null, at: 0, sort: null };

/** "Synced · 2 min ago" / "Syncing…" / "Sync failed": sidebar, and above the rows */
const renderSync = () => {
    const { status } = sync;
    const s = (Date.now() - sync.at) / 1e3;
    const ago = s < 60 ? "just now" : `${timeAgo(new Date(sync.at))} ago`;
    const text = { syncing: "Syncing…", error: "Sync failed", synced: "Synced" }[
        status
    ];
    for (const el of [$("m-sync"), $("m-sync-narrow")]) {
        el.hidden = !status;
        if (!status) continue;
        el.classList.toggle("is-error", status === "error");
        el.querySelector(".pm-dot").className =
            `pm-dot${status === "syncing" ? " is-busy" : status === "error" ? " is-error" : ""}`;
        el.querySelector(".m-sync-text").textContent =
            status === "synced" && el.id === "m-sync" ? `${text} · ${ago}` : text;
    }
    $("m-sync").querySelector(".m-sync-link").hidden = status !== "error";
};

/** sync.js announces each sync (a pull); a pull resets the sort: it is put back */
const setupSyncStatus = () => {
    document.addEventListener("pm-sync-status", (e) => {
        sync.status = e.detail;
        if (e.detail === "syncing") {
            sync.sort ??= { key: state.sortKey, reversed: state.sortReversed };
        } else {
            sync.at = Date.now();
            if (sync.sort && state.papersReady && window.__pmFullMemoryReady) {
                state.sortKey = sync.sort.key;
                state.sortReversed = sync.sort.reversed;
                sortMemory();
                if (state.sortReversed) state.sortedPapers.reverse();
                ui.stale = true;
                flushChanges();
            }
            sync.sort = null;
        }
        renderSync();
    });
    setInterval(() => sync.status === "synced" && renderSync(), 60e3);
};

/** Leaving the tab: push this browser's Memory, then pull (10 s later) */
const syncOnBlur = async () => {
    if (!(await shouldSync())) return;
    window.addEventListener(
        "blur",
        delay(async () => {
            await pushToRemote();
            await initSyncAndState();
        }, 10e3),
    );
};

// ---------------------
// -----  Layouts  -----
// ---------------------

let layoutChanging = false;
/**
 * The window crossed 900px or 1200px: the layout follows. Crossing 900px draws the list
 * again (table / rows): the open edit forms are saved and closed first; when one cannot be
 * saved it stays open, visible, in the current layout, and the layout changes once it is
 * closed (closePaneEdit, pm-memory-edit-closed call this again).
 */
const applyLayout = async () => {
    const next = wantedLayout();
    const prev = document.body.dataset.layout;
    if (next === prev || layoutChanging) return;
    if ((next === "narrow") !== (prev === "narrow")) {
        layoutChanging = true;
        const forms = [...document.querySelectorAll(".pm-edit")];
        const closed = await Promise.all(forms.map((form) => form.finish(true)));
        layoutChanging = false;
        if (closed.includes(false)) return;
        if (wantedLayout() !== next) return applyLayout();
        document.body.dataset.layout = next;
        closeInfoPanel();
        toggleTagPanel(false);
        if (next !== "narrow") $("memory-table").textContent = "";
        else {
            $("m-tbody").textContent = "";
            ui.selected.clear();
            renderSelection();
        }
        applyMemorySearch();
    } else document.body.dataset.layout = next;
    // wide ⇄ mid: an edit form in the pane stays in view (the drawer opens for it)
    setDrawer(next === "mid" && !!ui.editing);
};

// --------------------------
// -----  Events, keys  -----
// --------------------------

/** The paper a key acts on: the focused row's, or the pane's */
const keyTarget = (el) => {
    const tr = el?.closest?.("tr.m-row");
    if (tr) return tr.dataset.id;
    const row = el?.closest?.("#memory-table .memory-container");
    if (row) return row.id.split("--")[1];
    if (el?.closest?.("#m-detail")) return ui.current;
    return null;
};

/** ⌘↵ / Ctrl+↵ and Esc while the pane's edit form is shown, wherever the focus is */
const handlePaneFormKeys = (e) => {
    const form = paneForm();
    if (!form || form.offsetParent === null) return false;
    const submit = e.key === "Enter" && (e.ctrlKey || e.metaKey);
    if (!submit && e.key !== "Escape") return false;
    e.preventDefault();
    if (submit) form.requestSubmit();
    else form.dispatchEvent(new CustomEvent("pm-edit-close"));
    return true;
};

/** Esc (never advertised): closes what floats, then the drawer */
const handleEscape = (e) => {
    if (infoPanelIsOpen()) closeInfoPanel();
    else if (!$("memory-sort-menu").hidden) toggleSortMenu(false);
    else if (!$("memory-tag-panel").hidden) toggleTagPanel(false);
    else if (isDrawer() && drawerIsOpen()) closeDrawer();
    else return;
    e.preventDefault();
};

const handleKeydown = async (e) => {
    if (isComposing(e) || dialogIsOpen()) return;
    if (handlePaneFormKeys(e) || handleEditKeys(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let key = e.code === "NumpadAdd" ? "+" : e.key;
    const el = document.activeElement;
    if (["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName)) return;
    if (key === "Escape") return handleEscape(e);
    if (key === "/") {
        e.preventDefault();
        return $("memory-search").focus();
    }
    const id = keyTarget(el);
    if (!id) return;
    const onControl = el.matches("button, a, input");
    if (key === " ") {
        if (!isTable() || !el.matches("tr.m-row")) return;
        e.preventDefault();
        return toggleSelected(id);
    }
    if (key === "Enter") {
        if (onControl) return;
        e.preventDefault();
        key = await getDefaultKeyboardAction();
    }
    if (key.length > 1 && key !== "Backspace") return;
    if (runKey(key, id)) e.preventDefault();
};

const handleTableClick = (e) => {
    const t = e.target;
    const row = t.closest("tr.m-row");
    if (!row || !state.papers[row.dataset.id]) return;
    const id = row.dataset.id;
    if (t.closest(".m-select")) return; // its "change" event selects
    if (t.closest(".m-star")) return toggleFavourite(id);
    const tag = t.closest(".pm-tg");
    if (tag) return showOnlyTag(tag.dataset.tag);
    if (t.closest(".pm-item-authors-more")) return expandAuthors(id);
    if (t.closest(".m-details")) return toggleDetails(id);
    setCurrent(id);
    if (!t.closest("a, button")) row.focus({ preventScroll: true });
};

/** The empty state's buttons (table): clear the search; the sidebar's tag filter */
const handleEmptyClick = (e) => {
    if (e.target.closest("#memory-empty-clear")) {
        clearMemorySearch();
        $("memory-search").focus();
    } else if (e.target.closest("#memory-empty-tags")) $("m-tag-filter").focus();
};

const setupEvents = () => {
    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("scroll", displayOnScroll(false), { passive: true });
    const tbody = $("m-tbody");
    tbody.addEventListener("click", handleTableClick);
    tbody.addEventListener("change", (e) => {
        const box = e.target.closest(".m-select");
        if (box) toggleSelected(box.closest("tr").dataset.id, box.checked);
    });
    tbody.addEventListener("focusin", (e) => {
        const row = e.target.closest("tr.m-row");
        if (!row) return;
        // a checkbox click selects without changing the current paper
        if (!e.target.closest(".m-select")) setCurrent(row.dataset.id);
        // Tab reaching the last rendered row renders the next ones
        if (row === tbody.lastElementChild) loadMoreMemoryItems();
    });
    $("m-select-all").addEventListener("change", toggleSelectAll);
    document
        .querySelectorAll(".m-table th .m-sort")
        .forEach((btn) =>
            btn.addEventListener("click", () => sortByHeader(btn.dataset.sort)),
        );
    $("m-empty").addEventListener("click", handleEmptyClick);
    $("m-bulk").addEventListener("click", (e) => {
        const b = e.target.closest("[data-bulk]");
        b && bulk(b.dataset.bulk);
    });
    $("m-detail").addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (!b || b.closest(".pm-edit") || !ui.current) return;
        runKey(b.dataset.act, ui.current);
    });
    // rows below 900px: their delete button asks with this page's dialog
    $("memory-table").addEventListener(
        "click",
        (e) => {
            const del = e.target.closest(".memory-delete");
            if (!del) return;
            e.stopImmediatePropagation();
            confirmDelete(del.closest(".memory-container").id.split("--")[1]);
        },
        true,
    );
    // sidebar
    addListener("m-all", "click", (e) => {
        e.preventDefault();
        clearMemorySearch();
    });
    addListener("m-favs", "click", (e) => {
        e.preventDefault();
        toggleFavouritesFilter();
    });
    addListener("m-tag-filter", "input", renderTagList);
    addListener("m-taglist", "click", (e) => {
        const b = e.target.closest(".m-tag");
        b && toggleTagFilter(b.dataset.tag);
    });
    $("o-dialog").addEventListener("close", () => setTimeout(flushChanges));
    TABLE.addEventListener("change", applyLayout);
    WIDE.addEventListener("change", applyLayout);
    // a row's edit form closed (below 900px): the changes it held, a layout change it held
    document.addEventListener("pm-memory-edit-closed", () =>
        setTimeout(() => {
            flushChanges();
            applyLayout();
        }),
    );
};

// -----------------
// -----  Start -----
// -----------------

(async () => {
    // the Memory is this page's only view: sync.js does not draw it again after a pull
    state.memoryIsOpen = true;
    state.memoryItemsPerPage = 50;
    paintIcons();
    setupTopbar("fullMemory");
    setupSyncStatus();
    // journal abbreviations for the venues; until then venues show their cleaned name
    const journalsReady = readJournalAbbreviations().catch((e) =>
        warn("Could not read the journal abbreviations", e),
    );
    let stateReady;
    const ready = new Promise((resolve) => (stateReady = resolve));
    const remote = initSyncAndState({ stateIsReady: stateReady }).catch((e) => {
        warn("initSyncAndState failed", e);
        stateReady();
    });
    await ready;
    await journalsReady;
    setListRenderer(renderTable);
    setupInfoPanel();
    setupTooltips();
    setupEvents();
    onPapersChange((ids) => {
        ids.forEach((id) => ui.pending.add(id));
        flushChanges();
    });
    makeMemoryHTML();
    window.__pmFullMemoryReady = true;
    await remote;
    syncOnBlur();
})();

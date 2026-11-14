// ES Module imports
import { state } from "@pmu/config.js";
import { knownPaperPages } from "@pmu/sources/index.js";
import { getDisplayId, isPdfUrl, escapeHtml, arxivIdFromPaperID } from "@pmu/functions.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { formatVenue } from "@pmu/venues.js";
import { icon } from "@pm/popup/js/icons.js";
/** "2 h", "1 d", "3 wk", then "Mar 2025": how long ago a paper was last opened */
export const timeAgo = (date) => {
    const d = new Date(date);
    const s = (Date.now() - d.getTime()) / 1e3;
    if (!(s >= 0)) return "";
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
    if (s < 86400) return `${Math.round(s / 3600)} h`;
    if (s < 7 * 86400) return `${Math.round(s / 86400)} d`;
    if (s < 35 * 86400) return `${Math.round(s / (7 * 86400))} wk`;
    return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
};

/**
 * "Vaswani, Shazeer, Parmar +5", and " · 2023" when the paper has no venue line (escaped).
 * "+5" is a button: click (or +) shows every author, in place (handlers.js expandRowAuthors).
 */
const memoryItemMeta = (paper, hasVenue) => {
    const authors = authorList(paper.author);
    const names = escapeHtml(authors.slice(0, 3).map((a) => a.split(" ").pop()).join(", "));
    const extra = authors.length - 3;
    const more =
        extra > 0
            ? ` <button type="button" class="pm-item-authors-more" tabindex="-1" aria-expanded="false" aria-label="Show all ${authors.length} authors (+)" data-tip="Show all authors" data-tip-key="+">+${extra}</button>`
            : "";
    const year = hasVenue ? "" : String(paper.year ?? "").trim();
    return `${names}${more}${year ? `<span class="pm-item-year"> · ${escapeHtml(year)}</span>` : ""}`;
};

/** ↗ after a control that leaves the popup (links use the CSS ::after of .pm-out instead) */
const OUT_MARK = `<span class="pm-out-mark" aria-hidden="true">\u00a0\u2197</span>`;

/** "14 Nov 2026, 09:12" */
const dateAndTime = (date) => {
    const d = new Date(date);
    if (isNaN(d)) return "";
    return `${shortDate(d)}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};

/** "Today, 09:12", "Yesterday, 17:40", else "3 Mar 2025" */
const openedDate = (date) => {
    const d = new Date(date);
    if (isNaN(d)) return "";
    const day = (x) => new Date(x).toDateString();
    const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    if (day(d) === day(Date.now())) return `Today, ${time}`;
    if (day(d) === day(Date.now() - 864e5)) return `Yesterday, ${time}`;
    return shortDate(d);
};

/** "arXiv 1703.10593", "Nature s41467-018-0", a website's host */
const sourceAndId = (paper) => {
    if (paper.source === "website")
        return (paper.pdfLink ?? "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    if (paper.source === "arxiv") return `arXiv ${arxivIdFromPaperID(paper.id)}`;
    const name = knownPaperPages[paper.source]?.name ?? paper.source ?? "";
    let id = "";
    try {
        id = getDisplayId(paper);
    } catch (e) {}
    // ids often start with the source ("Nature-s41467…"): not repeated after its name
    for (const prefix of [paper.source, name]) {
        if (prefix && id.toLowerCase().startsWith(`${prefix}-`.toLowerCase()))
            id = id.slice(prefix.length + 1);
    }
    return [name, id].filter(Boolean).join(" ");
};

/**
 * The seven details of a paper (the ⓘ Info panel of rows and of the paper view): added, last opened,
 * visits, source + ID, publication (only with a venue), citation key, PDF file (only with
 * one). Escaped.
 * @param {object} paper
 * @returns {string} <dt>/<dd> pairs
 */
export const getPaperInfoHTML = (paper) => {
    let citationKey = "";
    try {
        citationKey = bibtexToObject(paper.bibtex).citationKey ?? "";
    } catch (e) {}
    const file = state.files?.[paper.id];
    return [
        ["Added", shortDate(paper.addDate)],
        ["Last opened", openedDate(paper.lastOpenDate)],
        ["Visits", paper.count ?? ""],
        ["Source", sourceAndId(paper)],
        ["Publication", formatVenue(paper).full],
        ["Citation key", citationKey, "pm-mono"],
        ["PDF file", file?.filename ? file.filename.split(/[\\/]/).slice(-2).join("/") : ""],
    ]
        .filter(([, v]) => String(v).trim())
        .map(
            ([k, v, cls]) =>
                `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ""}>${escapeHtml(String(v))}</dd>`,
        )
        .join("");
};

/**
 * The ⓘ panel: floats over the content (rows and paper view), filled with getPaperInfoHTML
 * @param {object} paper
 * @param {string} panelId Id of the panel (aria-controls of its button)
 * @returns {string} HTML
 */
export const getInfoPanelHTML = (paper, panelId) =>
    `<div class="pm-sugg pm-info-pop" id="${escapeHtml(panelId)}" role="dialog" aria-label="Paper details"><dl>${getPaperInfoHTML(paper)}</dl></div>`;

/** The quiet ⓘ button that opens the panel */
const infoButton = (cls, label, attrs = "") =>
    `<button type="button" class="pm-info-btn ${cls}" ${attrs} aria-label="${label}" data-tip="Info" data-tip-key="d" aria-haspopup="dialog" aria-expanded="false">${icon("info")}</button>`;

/**
 * A paper in the Memory list (design-review/v2/popup.html frames 2 and 2b): title, favourite
 * and last-opened time, venue · authors, all tags, the note (3 lines, then "more…") and the
 * quiet action line. The row is the only Tab stop: its buttons have tabindex -1 and keys.
 * Class names (memory-container, memory-item-*, memory-delete…) are the ones the keyboard
 * handler, fullMemory and the tests look for.
 * @param {object} paper A paper object
 * @returns {string} HTML string
 */
export const getMemoryItemHTML = (paper) => {
    const id = escapeHtml(paper.id); // only used in attributes
    const prefs = state.prefs;
    const isArxiv = paper.source === "arxiv";
    const fav = !!paper.favorite;
    const target = prefs.checkPreferPdf ? "PDF" : "abstract page";
    const act = (cls, label, key, title) =>
        key
            ? `<button type="button" class="pm-ia ${cls}" tabindex="-1" aria-label="${title} (${key})">${label} <span class="pm-kbd">${key}</span></button>`
            : `<button type="button" class="pm-ia ${cls}" tabindex="-1" aria-label="${title}">${label}</button>`;
    const open =
        paper.source === "website"
            ? act("memory-website-url", "Open", "o", "Open the page in a new tab")
            : act("memory-item-link", "Open", "o", `Open the ${target}`);
    const local = state.files.hasOwnProperty(paper.id)
        ? act("memory-item-openLocal", "PDF", "", "Open the downloaded PDF")
        : "";
    const elsewhere = [
        ["checkAr5iv", "ar5iv", "ar5iv", "5"],
        ["checkAlphaxiv", "alphaxiv", "alphaXiv", "x"],
        ["checkHuggingface", "huggingface", "Hugging Face", "f"],
        ["checkScirate", "scirate", "SciRate", "s"],
    ]
        .filter(([pref]) => isArxiv && prefs[pref])
        .map(
            ([, cls, name, key]) =>
                `<button type="button" role="menuitem" class="memory-item-${cls}" tabindex="-1" aria-label="Open on ${name} (${key})" data-tip="Open on ${name}" data-tip-key="${key}"><span>${name}${OUT_MARK}</span> <span class="pm-kbd">${key}</span></button>`,
        )
        .join("");
    const tags = (paper.tags ?? [])
        .map(
            (t) =>
                `<button type="button" class="pm-tg memory-tag" tabindex="-1" aria-label="Show only the papers tagged ${escapeHtml(t)}">${escapeHtml(t)}</button>`,
        )
        .join("");
    const lastOpen = timeAgo(paper.lastOpenDate);
    const venue = formatVenue(paper).short;

    return /*html*/ `
        <article class="pm-item memory-container${fav ? " favorite" : ""}" tabindex="0" id="memory-container--${id}" aria-label="${escapeHtml(paper.title)}">
            <div class="pm-item-head">
                <h3 class="pm-item-title memory-title">${escapeHtml(paper.title.replace(/\s+/g, " "))}</h3>
                <p class="pm-item-meta memory-authors">${memoryItemMeta(paper, !!venue)}</p>
                ${venue ? `<p class="pm-item-venue memory-venue">${escapeHtml(venue)}</p>` : ""}
            </div>
            <div class="pm-item-side">
                <button type="button" class="pm-item-fav memory-item-favorite" tabindex="-1" aria-pressed="${fav}" aria-label="${fav ? "Remove from favourites" : "Add to favourites"}" data-tip="${fav ? "Remove from favourites" : "Add to favourites"}">${icon("star")}</button>
                <time datetime="${escapeHtml(paper.lastOpenDate ?? "")}" data-tip="Last opened ${escapeHtml(dateAndTime(paper.lastOpenDate))}" aria-label="Last opened ${escapeHtml(dateAndTime(paper.lastOpenDate))}">${escapeHtml(lastOpen)}</time>
                ${infoButton("memory-item-info", "Info (d)", 'tabindex="-1"')}
            </div>
            ${tags ? `<div class="pm-item-tags">${icon("tag")}${tags}</div>` : ""}
            ${paper.note ? `<div class="pm-item-note memory-note-div"><p>${escapeHtml(paper.note)}</p><button type="button" class="pm-note-more" tabindex="-1" hidden>more…</button></div>` : ""}
            <div class="pm-item-actions memory-item-actions">
                ${open}
                ${act("memory-item-copy-link", "URL", "c", `Copy the URL of the ${target}`)}
                ${act("memory-item-copy-hyperlink", "Rich link", "h", "Copy the title as a clickable link, for docs, Slack, email…")}
                ${act("memory-item-md", "Markdown", "m", "Copy a Markdown link")}
                ${act("memory-item-bibtex", "BibTeX", "b", "Copy the BibTeX citation")}
                ${act("memory-item-edit", "Edit", "e", "Edit tags, code link and note")}
                ${local}
                ${elsewhere ? `<button type="button" class="pm-ia pm-more memory-item-more" tabindex="-1" aria-label="Open on ar5iv, alphaXiv, Hugging Face, SciRate" data-tip="Open on ar5iv, alphaXiv, Hugging Face, SciRate" aria-haspopup="menu" aria-expanded="false">${icon("more", "pm-i-sm")}</button>` : ""}
                <button type="button" class="pm-ia pm-del memory-delete" tabindex="-1" aria-label="Delete (⌫)" data-tip="Delete" data-tip-key="⌫">${icon("trash", "pm-i-sm")}</button>
                <span class="pm-item-feedback memory-item-feedback" role="status" hidden></span>
            </div>
            ${elsewhere ? `<div class="pm-pop" role="menu"><span class="pm-label-caps">Open on</span>${elsewhere}</div>` : ""}
        </article>`;
};

/**
 * The row edit form (design-review/v2/popup.html frame 5): tags, code link, note; saved as
 * you type, Done (⌘↵) closes it. The note's value is set in JS: inside <textarea> markup a
 * leading line break would be dropped by the HTML parser.
 * @param {object} paper
 * @returns {string} HTML
 */
export const getMemoryEditHTML = (paper) => /*html*/ `
    <form class="pm-edit extended-item" novalidate>
        <label>Tags</label>
        <div class="pm-edit-tags"></div>
        <label>Code</label>
        <div>
            <div class="pm-field pm-codefield">
                <input class="form-code-input" type="text" placeholder="github.com/org/repo" autocomplete="off" spellcheck="false" aria-label="Code link" value="${escapeHtml(paper.codeLink || "")}" />
                <button type="button" class="pm-quiet pm-ic pm-code-open" tabindex="-1" aria-label="Open this link in a new tab" data-tip="Open this link in a new tab">${icon("open")}</button>
            </div>
            <p class="pm-field-msg pm-code-msg" hidden></p>
        </div>
        <label>Note</label>
        <textarea class="pm-textarea form-note-textarea" rows="3" placeholder="Anything to note?" aria-label="Note"></textarea>
        <div class="pm-edit-foot">
            <span class="pm-edit-hint">Changes are saved as you type</span>
            <span class="pm-spacer"></span>
            <button type="submit" class="pm-btn pm-btn-primary pm-btn-sm memory-edit-done">Done <span class="pm-kbd" data-mod-enter>⌘↵</span></button>
        </div>
    </form>`;

/**
 * Memory list with nothing to show (popup-states.html frame 12)
 * @param {string} query The free text typed in the search field
 * @param {boolean} empty Whether the Memory itself is empty
 * @returns {string} HTML
 */
export const getMemoryEmptyHTML = (query, empty) =>
    empty
        ? /*html*/ `
        <div class="pm-empty pm-mv-empty">
            ${icon("doc")}
            <h2>Your Memory is empty</h2>
            <p>Open a paper on arXiv, OpenReview, Nature and many other sites and PaperMemory saves it here, in your browser.</p>
        </div>`
        : /*html*/ `
        <div class="pm-empty pm-mv-empty">
            ${icon("search")}
            <h2>${query ? `No paper matches “${escapeHtml(query)}”` : "No paper matches these filters"}</h2>
            <p>Search looks at titles, authors and notes. Filters: <span class="pm-kbd">t:</span> tag, <span class="pm-kbd">c:</span> code link, <span class="pm-kbd">y:</span> year, then <span class="pm-kbd">tab</span>.</p>
            <div class="pm-empty-btns">
                <button type="button" class="pm-btn" id="memory-empty-clear">Clear search</button>
                <button type="button" class="pm-btn" id="memory-empty-tags">Browse tags</button>
            </div>
        </div>`;

// ---------------------------------------------------------------------------------------
// -----  Popup paper view and states (design-review/v2/popup.html, popup-states.html)  -----
// ---------------------------------------------------------------------------------------

const REPORT_URL = "https://github.com/vict0rsch/PaperMemory/issues/new";

/** "Ashish Vaswani and Shazeer, Noam" -> ["Ashish Vaswani", "Noam Shazeer"] */
export const authorList = (author) =>
    (author ?? "")
        .replace(/[{}]/g, "")
        .split(" and ")
        .map((a) =>
            a.includes(",")
                ? a
                      .split(",")
                      .map((s) => s.trim())
                      .reverse()
                      .join(" ")
                : a.trim(),
        )
        .filter(Boolean);

/** 3 Mar 2025 */
export const shortDate = (date) =>
    new Date(date).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });

/** Code-link field content when not editing: the link + pencil, or "No code link" + Add */
export const getPopupCodeLinkHTML = (paper) => {
    const link = paper.codeLink || "";
    if (!link) {
        return /*html*/ `
            <span class="pm-ph">No code link</span>
            <button class="pm-quiet pm-pv-add" id="popup-code-edit" aria-label="Add a code link (e)">
                ${icon("plus")}Add
            </button>
            <a id="popup-code-link" hidden></a>`;
    }
    const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    return /*html*/ `
        <div class="pm-codelink">
            <a id="popup-code-link" href="${escapeHtml(href)}" data-tip="Open ${escapeHtml(href)} in a new tab"
                ><span>${escapeHtml(link.replace(/^https?:\/\//, ""))}</span>${icon("open")}</a
            ><button class="pm-quiet" id="popup-code-edit" aria-label="Edit the code link (e)" data-tip="Edit the code link" data-tip-key="e">
                ${icon("edit")}
            </button>
        </div>`;
};

/** Note field content when not editing (line breaks kept by CSS) */
export const getPopupNoteHTML = (paper) =>
    paper.note
        ? `<button class="pm-pv-note" id="popup-note-display" aria-keyshortcuts="e">${escapeHtml(paper.note)}</button>`
        : `<button class="pm-pv-note pm-ph" id="popup-note-display" aria-label="Add a note (e)">Add a note…</button>`;

/**
 * The paper view: status line, title, authors, venue, action strip, fields, "Also on",
 * bottom line (Info, Remove). Ids keep the names the keyboard handler and tests look for
 * (popup-memory-item-<action>--<id>, popup-memory-delete--<id>, …).
 * @param {object} paper
 * @param {string} currentUrl The active tab's url
 * @param {object} is isPaper(currentUrl)
 * @param {object} opts {downloadKey: shortcut label for the PDF action}
 * @returns {string} HTML
 */
export const getPopupPaperHTML = (paper, currentUrl, is, { downloadKey }) => {
    const id = escapeHtml(paper.id); // only used in attributes
    const prefs = state.prefs;
    const isWebsite = paper.source === "website";
    const isArxiv = paper.source === "arxiv";

    // ----- authors: first 3, the rest behind "+N more"
    const authors = authorList(paper.author);
    const shown = authors.slice(0, 3).map(escapeHtml).join(", ");
    const more =
        authors.length > 3
            ? ` <button class="pm-pv-more" id="popup-authors-more" aria-label="Show all ${authors.length} authors">+${authors.length - 3} more</button>`
            : "";

    // ----- venue line (only with a venue); otherwise the year follows the authors
    const venue = formatVenue(paper).short;
    const year = !venue && String(paper.year ?? "").trim();

    // ----- six actions; tooltips open below, pinned to the edge on the first and last
    const onPdf = isPdfUrl(currentUrl);
    const hasLocal =
        prefs.checkStore &&
        (is.localFile || is.stored || state.files.hasOwnProperty(paper.id));
    const actions = [
        isWebsite
            ? ["memory-website-url", "open", "Open", "Open the page in this tab", "o"]
            : onPdf
              ? ["memory-item-link", "open", "Abstract", "Open the abstract page in this tab", "o"]
              : ["memory-item-link", "open", "Open PDF", "Open the PDF in this tab", "o"],
        ["memory-item-copy-link", "link", "URL", "Copy the paper's URL", "c"],
        [
            "memory-item-copy-hyperlink",
            "rich",
            "Rich link",
            "Copy the title as a clickable link (docs, Slack…)",
            "h",
            "Copy the title as a clickable link, for docs, Slack, email…",
        ],
        ["memory-item-md", "md", "Markdown", "Copy Markdown link", "m"],
        ["memory-item-bibtex", "bib", "BibTeX", "Copy BibTeX", "b"],
        hasLocal
            ? ["memory-item-openLocal", "book", "PDF", "Open the downloaded PDF", ""]
            : ["memory-item-download", "pdf", "PDF", "Download PDF", downloadKey],
    ];
    const strip = actions
        .map(([cls, ic, label, tip, key, title], i) => {
            const pin =
                i === 0 ? "pm-tip-start" : i === actions.length - 1 ? "pm-tip-end" : "";
            const kbd = key ? ` <span class="pm-kbd">${key}</span>` : "";
            return /*html*/ `<button class="pm-pv-act" id="popup-${cls}--${id}" aria-label="${title ?? tip}${key ? ` (${key})` : ""}">
                ${icon(ic)}${label}<span class="pm-tip ${pin}">${tip}${kbd}</span></button>`;
        })
        .join("");

    // ----- "Also on" (arXiv papers, when enabled in the settings)
    const also = [
        ["checkAr5iv", "ar5iv", "ar5iv", "5", "ar5iv.labs.arxiv.org"],
        ["checkAlphaxiv", "alphaxiv", "alphaXiv", "x", "alphaxiv.org"],
        ["checkHuggingface", "huggingface", "Hugging Face", "f", "huggingface.co/papers/"],
        ["checkScirate", "scirate", "SciRate", "s", "scirate.com"],
    ]
        .filter(([pref, , , , host]) => prefs[pref] && isArxiv && !currentUrl.includes(host))
        .map(
            ([, cls, name, key]) =>
                `<button class="pm-pv-also-btn" id="popup-memory-item-${cls}--${id}" aria-label="Open on ${name} (${key})" data-tip="Open on ${name}" data-tip-key="${key}">${name}${OUT_MARK}</button>`,
        )
        .join("");

    const visits = `${escapeHtml(paper.count)} visit${paper.count === 1 ? "" : "s"}`;

    return /*html*/ `
        <div class="pm-pv">
          <div class="pm-pv-main" id="popup-paper-main">
            <div class="pm-pv-status">
                <span class="pm-badge pm-badge-ok">${icon("check", "pm-i-sm")}In your Memory</span>
                <span>Added ${escapeHtml(shortDate(paper.addDate))} · ${visits}</span>
                <span class="pm-spacer"></span>
                ${infoButton("pm-pv-info", "Info (d)", 'id="popup-info-button" aria-controls="popup-info-panel"')}
                <button class="pm-iconbtn pm-pv-fav" id="checkFavorite--${id}" aria-pressed="${!!paper.favorite}" aria-label="Favourite" data-tip="Favourite">
                    ${icon("star")}
                </button>
            </div>
            <h1 class="pm-pv-title" id="popup-paper-title">${escapeHtml(paper.title.replaceAll("\n", " "))}</h1>
            <p class="pm-pv-authors" id="popup-authors">${shown}${more}${year ? `<span class="pm-pv-year"> · ${escapeHtml(year)}</span>` : ""}</p>
            ${venue ? `<p class="pm-pv-venue" id="popup-venue">${escapeHtml(venue)}</p>` : ""}

            <div class="pm-pv-actions" role="group" aria-label="Paper actions" id="popup-copy-icons">${strip}</div>

            <div class="pm-pv-group" id="popup-memory-edit">
                <div class="pm-pv-frow">
                    <label for="popup-tags-input">Tags</label>
                    <div class="pm-pv-val pm-pv-tags" id="popup-item-tags--${id}"></div>
                </div>
                <div class="pm-pv-frow">
                    <label>Code</label>
                    <div class="pm-pv-val" id="popup-code-val">${getPopupCodeLinkHTML(paper)}</div>
                </div>
                <div class="pm-pv-frow">
                    <label for="popup-form-note-textarea--${id}">Note</label>
                    <div class="pm-pv-val pm-pv-noteval">
                        <span id="popup-note-val">${getPopupNoteHTML(paper)}</span>
                        <textarea class="pm-textarea" id="popup-form-note-textarea--${id}" rows="3" placeholder="Anything to note?" hidden></textarea>
                    </div>
                </div>
            </div>
            <!-- edit state (e, or a field opened): same quiet hint as the row edit form -->
            <div class="pm-edit-foot pm-pv-editfoot" id="popup-edit-foot" hidden>
                <span class="pm-edit-hint">Changes are saved as you type</span>
                <span class="pm-spacer"></span>
                <button type="button" class="pm-btn pm-btn-primary pm-btn-sm" id="popup-edit-done">Done <span class="pm-kbd" data-mod-enter>⌘↵</span></button>
            </div>

            ${also ? `<div class="pm-pv-also">Also on ${also}</div>` : ""}
          </div>

            <!-- outside the scrolling part: always visible above the footer -->

            <div class="pm-pv-bar" id="popup-paper-bar">
                <button type="button" class="pm-btn pm-btn-ghost pm-btn-sm pm-pv-info-open" id="popup-info-open" aria-label="Info (d)" aria-haspopup="dialog" aria-expanded="false" aria-controls="popup-info-panel-bar">
                    ${icon("info", "pm-i-sm")}Info <span class="pm-kbd">d</span>
                </button>
                <span class="pm-spacer"></span>
                <button class="pm-btn pm-btn-ghost pm-btn-sm" id="popup-memory-delete--${id}" aria-label="Remove this paper from your Memory (⌫)">
                    ${icon("trash", "pm-i-sm")}Remove <span class="pm-kbd">⌫</span>
                </button>
            </div>
        </div>`;
};

/**
 * The body when the page is not a paper: intro, parsing, or parse error
 * @param {"intro" | "parsing" | "error"} mode
 * @param {object} opts {canParse, nSources, url}
 * @returns {string} HTML
 */
export const getNotPaperHTML = (mode, { canParse = false, nSources = 30, url = "" } = {}) => {
    if (mode === "parsing") {
        return /*html*/ `
            <div class="pm-empty">
                <span class="pm-spinner pm-spinner-lg"></span>
                <h2>Reading this page…</h2>
                <p>Looking for a title, authors and a year on<br /><span class="pm-empty-strong">${escapeHtml(url.replace(/^https?:\/\/(www\.)?/, ""))}</span></p>
                <div class="pm-empty-btns"><button class="pm-btn" id="website-parse-cancel">Cancel</button></div>
            </div>`;
    }
    if (mode === "error") {
        return /*html*/ `
            <div class="pm-empty">
                ${icon("doc")}
                <h2>This page is not a paper</h2>
                <div class="pm-banner pm-banner-err" id="website-parsing-error">
                    ${icon("alert")}<div><b>Couldn’t read this page</b>No title or authors were found. You can try again or fill the details in yourself.</div>
                </div>
                <div class="pm-empty-btns">
                    <button class="pm-btn" id="website-parse-retry">Try again</button>
                    <button class="pm-btn pm-btn-primary" id="website-parse-manual">Fill in by hand</button>
                </div>
                <div class="pm-empty-links"><a class="link-in-new-tab" href="${REPORT_URL}" data-tip="Report a problem on GitHub">Report a problem</a></div>
            </div>`;
    }
    return /*html*/ `
        <div class="pm-empty">
            ${icon("doc")}
            <h2>This page is not a paper</h2>
            <p>Open a paper on arXiv, OpenReview, Nature or ${nSources} other sites and PaperMemory saves it here, in your browser.</p>
            <div class="pm-empty-btns">
                <button class="pm-btn pm-btn-primary" id="notArxiv-open-memory">Open Memory <span class="pm-kbd">a</span></button>
                ${canParse ? '<button class="pm-btn" id="website-trigger-btn">Parse this page</button>' : ""}
            </div>
            <div class="pm-empty-links">
                <a class="link-in-new-tab" href="https://papermemory.org/features/#venues" data-tip="Open the supported sites list on papermemory.org">Supported sites</a>
                <a class="link-in-new-tab" href="https://github.com/vict0rsch/PaperMemory/issues/13" data-tip="Request a site on GitHub">Request a site</a>
                <a class="link-in-new-tab" href="https://papermemory.org/getting-started/" data-tip="Open the user guide on papermemory.org">User guide</a>
                <a href="#" id="whats-new-container">What’s new</a>
            </div>
        </div>`;
};

/**
 * The body on a paper page whose paper is not in the Memory (was the "no paper" modal)
 * @param {string} url
 * @returns {string} HTML
 */
export const getNoMemoryHTML = (url) => /*html*/ `
    <div class="pm-empty pm-empty-top">
        ${icon("doc")}
        <h2>This paper is not in your Memory</h2>
        <p>${escapeHtml(url.replace(/^https?:\/\/(www\.)?/, ""))}</p>
        <div id="manual-parsing-error"></div>
        <div class="pm-empty-btns">
            <button class="pm-btn pm-btn-primary" id="manual-trigger-btn">Add it now</button>
        </div>
        <details class="pm-why">
            <summary>${icon("right", "pm-i-sm pm-caret-i")}Why wasn’t it saved?</summary>
            <ul>
                <li>Recording is set to PDF pages only, or automatic recording is off.</li>
                <li>This source is turned off in the options.</li>
                <li>Firefox does not let extensions run on PDF pages. Open the abstract page instead.</li>
                <li>You deleted it, here or on another synced computer. Reload the page to add it back.</li>
                <li>The page could not be read. <a class="link-in-new-tab" href="${REPORT_URL}" data-tip="Report a problem on GitHub">Report a problem</a></li>
            </ul>
        </details>
    </div>`;

/** Notice banner shown above the paper / states (opens the notice sheet) */
export const getNoticeBannerHTML = () => /*html*/ `
    <button class="pm-banner" id="warning-button">
        ${icon("alert")}<div><b>Custom tab titles are changing</b>Read the notice</div>
    </button>`;

// ES Module imports
import { state } from "@pmu/config.js";
import { knownPaperPages } from "@pmu/sources/index.js";
import { getDisplayId, isPdfUrl, escapeHtml, arxivIdFromPaperID } from "@pmu/functions.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
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

/** "NeurIPS 2017 · Vaswani, Shazeer, Parmar +5" (escaped) */
const memoryItemMeta = (paper) => {
    const where =
        paper.source === "website"
            ? (paper.pdfLink ?? "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0]
            : paper.venue || knownPaperPages[paper.source]?.name || "";
    const authors = authorList(paper.author);
    const names = authors.slice(0, 3).map((a) => a.split(" ").pop());
    const more = authors.length > 3 ? ` +${authors.length - 3}` : "";
    const head = [where, paper.year].filter(Boolean).join(" ");
    return escapeHtml([head, names.join(", ") + more].filter(Boolean).join(" · "));
};

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
            ? `<button type="button" class="pm-ia ${cls}" tabindex="-1" title="${title} (${key})">${label} <span class="pm-kbd">${key}</span></button>`
            : `<button type="button" class="pm-ia ${cls}" tabindex="-1" title="${title}">${label}</button>`;
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
                `<button type="button" role="menuitem" class="memory-item-${cls}" tabindex="-1" title="Open on ${name} (${key})">${name} <span class="pm-kbd">${key}</span></button>`,
        )
        .join("");
    const tags = (paper.tags ?? [])
        .map(
            (t) =>
                `<button type="button" class="pm-tg memory-tag" tabindex="-1" title="Show the papers tagged ${escapeHtml(t)}">${escapeHtml(t)}</button>`,
        )
        .join("");
    const lastOpen = timeAgo(paper.lastOpenDate);
    const details = [
        ["Added", shortDate(paper.addDate)],
        ["Last opened", shortDate(paper.lastOpenDate)],
        ["Visits", paper.count],
        ["ID", getDisplayId(paper)],
        ["Source", knownPaperPages[paper.source]?.name ?? paper.source],
    ]
        .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`)
        .join("");

    return /*html*/ `
        <article class="pm-item memory-container${fav ? " favorite" : ""}" tabindex="0" id="memory-container--${id}" aria-label="${escapeHtml(paper.title)}">
            <div class="pm-item-head">
                <h3 class="pm-item-title memory-title">${escapeHtml(paper.title.replace(/\s+/g, " "))}</h3>
                <p class="pm-item-meta memory-authors">${memoryItemMeta(paper)}</p>
            </div>
            <div class="pm-item-side">
                <button type="button" class="pm-item-fav memory-item-favorite" tabindex="-1" aria-pressed="${fav}" title="${fav ? "Remove from favourites" : "Add to favourites"}">${icon("star")}</button>
                <time title="Last opened ${escapeHtml(shortDate(paper.lastOpenDate))}">${escapeHtml(lastOpen)}</time>
            </div>
            ${tags ? `<div class="pm-item-tags">${icon("tag")}${tags}</div>` : ""}
            ${paper.note ? `<div class="pm-item-note memory-note-div"><p>${escapeHtml(paper.note)}</p><button type="button" class="pm-note-more" tabindex="-1" hidden>more…</button></div>` : ""}
            <dl class="pm-item-details memory-display-id" hidden>${details}</dl>
            <div class="pm-item-actions memory-item-actions">
                ${open}
                ${act("memory-item-copy-link", "URL", "c", `Copy the URL of the ${target}`)}
                ${act("memory-item-copy-hyperlink", "Rich link", "h", "Copy the title as a clickable link, for docs, Slack, email…")}
                ${act("memory-item-md", "Markdown", "m", "Copy a Markdown link")}
                ${act("memory-item-bibtex", "BibTeX", "b", "Copy the BibTeX citation")}
                ${act("memory-item-edit", "Edit", "e", "Edit tags, code link and note")}
                ${local}
                ${elsewhere ? `<button type="button" class="pm-ia pm-more memory-item-more" tabindex="-1" title="Open on ar5iv, alphaXiv, Hugging Face, SciRate" aria-label="Open elsewhere" aria-haspopup="menu" aria-expanded="false">${icon("more", "pm-i-sm")}</button>` : ""}
                <button type="button" class="pm-ia pm-del memory-delete" tabindex="-1" title="Delete (⌫)" aria-label="Delete">${icon("trash", "pm-i-sm")}</button>
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
                <button type="button" class="pm-quiet pm-ic pm-code-open" tabindex="-1" title="Open this link in a new tab" aria-label="Open this link in a new tab">${icon("open")}</button>
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
            <button class="pm-quiet pm-pv-add" id="popup-code-edit" title="Add a code link (e)">
                ${icon("plus")}Add
            </button>
            <a id="popup-code-link" hidden></a>`;
    }
    const href = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    return /*html*/ `
        <div class="pm-codelink">
            <a id="popup-code-link" href="${escapeHtml(href)}" title="Open the repository in a new tab"
                ><span>${escapeHtml(link.replace(/^https?:\/\//, ""))}</span>${icon("open")}</a
            ><button class="pm-quiet" id="popup-code-edit" title="Edit the code link (e)" aria-label="Edit the code link">
                ${icon("edit")}
            </button>
        </div>`;
};

/** Note field content when not editing (line breaks kept by CSS) */
export const getPopupNoteHTML = (paper) =>
    paper.note
        ? `<button class="pm-pv-note" id="popup-note-display" title="Edit the note (e)">${escapeHtml(paper.note)}</button>`
        : `<button class="pm-pv-note pm-ph" id="popup-note-display" title="Add a note (e)">Add a note…</button>`;

/**
 * The paper view: status line, title, authors, venue, action strip, fields, "Also on",
 * Details. Ids keep the names the keyboard handler and tests look for
 * (popup-memory-item-<action>--<id>, popup-memory-delete--<id>, …).
 * @param {object} paper
 * @param {string} currentUrl The active tab's url
 * @param {object} is isPaper(currentUrl)
 * @param {object} opts {downloadKey: shortcut label for the PDF action, detailsOpen: bool}
 * @returns {string} HTML
 */
export const getPopupPaperHTML = (paper, currentUrl, is, { downloadKey, detailsOpen }) => {
    const id = escapeHtml(paper.id); // only used in attributes
    const prefs = state.prefs;
    const isWebsite = paper.source === "website";
    const isArxiv = paper.source === "arxiv";

    // ----- authors: first 3, the rest behind "+N more"
    const authors = authorList(paper.author);
    const shown = authors.slice(0, 3).map(escapeHtml).join(", ");
    const more =
        authors.length > 3
            ? ` <button class="pm-pv-more" id="popup-authors-more" title="Show all authors">+${authors.length - 3} more</button>`
            : "";

    // ----- venue line
    const venue = paper.venue
        ? `<b>${escapeHtml(paper.venue)} ${escapeHtml(paper.year)}</b>`
        : escapeHtml(paper.year);
    const where = isWebsite
        ? escapeHtml(paper.pdfLink.replace(/^https?:\/\//, "").replace(/\/$/, ""))
        : isArxiv
          ? `arXiv ${escapeHtml(arxivIdFromPaperID(paper.id))}`
          : escapeHtml(getDisplayId(paper));

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
            return /*html*/ `<button class="pm-pv-act" id="popup-${cls}--${id}" title="${title ?? tip}${key ? ` (${key})` : ""}">
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
                `<button class="pm-pv-also-btn" id="popup-memory-item-${cls}--${id}" title="Open on ${name} (${key})">${name}</button>`,
        )
        .join("");

    // ----- Details
    let citationKey = "";
    try {
        citationKey = bibtexToObject(paper.bibtex).citationKey ?? "";
    } catch (e) {}
    const file = state.files[paper.id];
    const details = [
        ["Published in", paper.venue ? `${escapeHtml(paper.venue)} ${escapeHtml(paper.year)}` : ""],
        ["Citation key", citationKey ? `<span class="pm-mono">${escapeHtml(citationKey)}</span>` : ""],
        ["PDF file", file?.filename ? escapeHtml(file.filename.split(/[\\/]/).slice(-2).join("/")) : ""],
        ["Source", escapeHtml(knownPaperPages[paper.source]?.name ?? paper.source)],
        ["Last opened", escapeHtml(shortDate(paper.lastOpenDate))],
    ]
        .filter(([, v]) => v)
        .map(([k, v]) => `<dt>${k}</dt><dd title="${v.replace(/<[^>]+>/g, "")}">${v}</dd>`)
        .join("");

    const visits = `${escapeHtml(paper.count)} visit${paper.count === 1 ? "" : "s"}`;

    return /*html*/ `
        <div class="pm-pv">
          <div class="pm-pv-main" id="popup-paper-main">
            <div class="pm-pv-status">
                <span class="pm-badge pm-badge-ok">${icon("check", "pm-i-sm")}In your Memory</span>
                <span>Added ${escapeHtml(shortDate(paper.addDate))} · ${visits}</span>
                <span class="pm-spacer"></span>
                <button class="pm-iconbtn pm-pv-fav" id="checkFavorite--${id}" aria-pressed="${!!paper.favorite}" title="Favourite" aria-label="Favourite">
                    ${icon("star")}
                </button>
            </div>
            <h1 class="pm-pv-title" id="popup-paper-title">${escapeHtml(paper.title.replaceAll("\n", " "))}</h1>
            <p class="pm-pv-authors" id="popup-authors">${shown}${more}</p>
            <p class="pm-pv-venue">${venue} · ${where}</p>

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

            ${also ? `<div class="pm-pv-also">Also on ${also}</div>` : ""}
          </div>

            <!-- outside the scrolling part: always visible above the footer -->

            <div class="pm-pv-details">
                <div class="pm-pv-details-bar">
                    <button class="pm-pv-details-toggle" id="popup-details-toggle" aria-expanded="${!!detailsOpen}" aria-controls="popup-details-body" title="Show or hide the details (d)">
                        ${icon("right", "pm-i-sm pm-caret-i")}Details <span class="pm-kbd">d</span>
                    </button>
                    <span class="pm-spacer"></span>
                    <button class="pm-btn pm-btn-ghost pm-btn-sm" id="popup-memory-delete--${id}" title="Remove this paper from your Memory (⌫)">
                        ${icon("trash", "pm-i-sm")}Remove <span class="pm-kbd">⌫</span>
                    </button>
                </div>
                <dl id="popup-details-body" ${detailsOpen ? "" : "hidden"}>${details}</dl>
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
                <div class="pm-empty-links"><a class="link-in-new-tab" href="${REPORT_URL}">Report a problem</a></div>
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
                <a class="link-in-new-tab" href="https://papermemory.org/features/#venues">Supported sites</a>
                <a class="link-in-new-tab" href="https://github.com/vict0rsch/PaperMemory/issues/13">Request a site</a>
                <a class="link-in-new-tab" href="https://papermemory.org/getting-started/">User guide</a>
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
                <li>The page could not be read. <a class="link-in-new-tab" href="${REPORT_URL}">Report a problem</a></li>
            </ul>
        </details>
    </div>`;

/** Notice banner shown above the paper / states (opens the notice sheet) */
export const getNoticeBannerHTML = () => /*html*/ `
    <button class="pm-banner" id="warning-button">
        ${icon("alert")}<div><b>Custom tab titles are changing</b>Read the notice</div>
    </button>`;

// ES Module imports
import { state, svgActionsHoverTitles } from "@pmu/config.js";
import { knownPaperPages } from "@pmu/sources/index.js";
import {
    getDisplayId,
    tablerSvg,
    isPdfUrl,
    cutAuthors,
    escapeHtml,
    arxivIdFromPaperID,
} from "@pmu/functions.js";
import { getTagsOptions } from "@pmu/state.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { icon } from "@pm/popup/js/icons.js";
/**
 * Return a formatted HTML string describing some metadata about a paper
 * added date, last open date, number of visits, venue if available
 * @param {object} paper A paper object
 * @returns {string} HTML string
 */
export const getPaperInfoTable = (paper) => {
    const addDate = new Date(paper.addDate).toLocaleString().replace(",", "");
    const lastOpenDate = new Date(paper.lastOpenDate).toLocaleString().replace(",", "");
    const tableData = [
        ["Added", addDate],
        ["Last open", lastOpenDate],
        ["Visits", paper.count],
        ["Source", knownPaperPages[paper.source].name],
    ];
    if (paper.venue)
        tableData.push([
            "Publication",
            `<strong>${escapeHtml(paper.venue)} ${escapeHtml(String(paper.year))}</strong>`,
        ]);
    return /*html*/ `
        <table class="paper-info-table">
            ${tableData
                .map((row) => {
                    return /*html*/ `
                        <tr>
                            <td><div class="info-table-key">${row[0]}</div></td>
                            <td><div class="info-table-value">${row[1]}</div></td>
                        </tr>
                    `;
                })
                .join("")}
        </table>
    `;
};

/**
 * Return a formatted HTML string from a paper
 * @param {object} paper A paper object
 * @returns HTML string
 */
export const getMemoryItemHTML = (paper) => {
    const displayId = getDisplayId(paper);
    const note = paper.note || "";
    const id = escapeHtml(paper.id); // only used in attributes
    const tags = new Set(paper.tags);
    const tagOptions = getTagsOptions(paper);
    const favoriteClass = paper.favorite ? "favorite" : "";
    const titles = { ...svgActionsHoverTitles };
    // titles behave differently in build/watch mode. This works in build
    titles.pdfLink = `Open tab to ${escapeHtml(paper.title)}`;
    titles.copyLink = `Copy URL to the paper's ${
        state.prefs.checkPreferPdf ? "PDF" : "abstract"
    }`;
    titles.displayId = `Click to see metadata`;
    let codeDiv = /*html*/ `
        <small class="memory-item-faded">

            <div class="memory-code-link"> ${escapeHtml(
                paper.codeLink.replace(/^https?:\/\//, "") || "",
            )} </div>
            <div class="memory-website-url">
                ${
                    (paper.source == "website" &&
                        escapeHtml(paper.pdfLink.replace(/^https?:\/\//, ""))) ||
                    ""
                }
            </div>
        </small>
    `;
    let noteDiv = /*html*/ `<div class="memory-note-div memory-item-faded"></div>`;
    if (paper.note) {
        noteDiv = /*html*/ `
            <div class="memory-note-div memory-item-faded">
                <span class="note-content-header">Note:</span>
                <span class="note-content">${escapeHtml(note)}</span>
            </div>
        `;
    }

    const openLocalDiv = state.files.hasOwnProperty(paper.id)
        ? /*html*/ `
            <div
                class="memory-item-openLocal memory-item-svg-div"
                title='${titles.openLocal}'
            >
                ${tablerSvg("vocabulary", "", ["memory-icon-svg"])}
            </div>`
        : ``;

    const openLinkDiv =
        paper.source === "website"
            ? ""
            : /*html*/ `
            <div
                class="memory-item-link memory-item-svg-div"
                title='${titles.pdfLink}'
            >
                ${tablerSvg("external-link", "", ["memory-icon-svg"])}
            </div>`;

    let scirate = "";
    if (state.prefs.checkScirate && paper.source === "arxiv") {
        scirate = /*html*/ `
        <div
            class="memory-item-scirate memory-item-svg-div"
            title="Open on SciRate"
        >
            ${tablerSvg("messages", "", ["memory-icon-svg"])}
        </div>`;
    }

    let alphaxiv = "";
    if (state.prefs.checkAlphaxiv && paper.source === "arxiv") {
        alphaxiv = /*html*/ `
        <div
            class="memory-item-alphaxiv memory-item-svg-div"
            title="Open on AlphaXiv"
        >
            ${tablerSvg("alphaxiv", "", ["memory-icon-svg", "alphaxiv-icon"])}
        </div>`;
    }

    let ar5iv = "";
    if (state.prefs.checkAr5iv && paper.source === "arxiv") {
        ar5iv = /*html*/ `
        <div
            class="memory-item-ar5iv memory-item-svg-div"
            title="Open on ar5iv"
        >
            ${tablerSvg("ar5iv", "", ["memory-icon-svg"])}
        </div>`;
    }

    let huggingface = "";
    if (state.prefs.checkHuggingface && paper.source === "arxiv") {
        huggingface = /*html*/ `
        <div
            class="memory-item-huggingface memory-item-svg-div"
            title="Open on HuggingFace Papers"
        >
            ${tablerSvg("huggingface", "", ["memory-icon-svg"])}
        </div>`;
    }

    const titleInfoTable = getPaperInfoTable(paper);

    return /*html*/ `
        <div
            class="memory-container ${favoriteClass}"
            tabindex="0"
            id="memory-container--${id}"
        >
            <h4 class="memory-title">
                <span class="memory-item-favorite">
                    ${tablerSvg("star", "", [
                        "memory-item-favorite-svg",
                        favoriteClass,
                    ])}
                </span>
                ${escapeHtml(paper.title)}
                <div class="title-tooltip" style="display: none;">
                    ${titleInfoTable}
                </div>
            </h4>
            <div class="my-1 mx-0">
                <small class="tag-list">
                    ${[...tags]
                        .map((t) => `<span class="memory-tag" >${escapeHtml(t)}</span>`)
                        .join("")}
                </small>
                <div class="edit-tags p-0" style="display: none">
                    <div class="flex-center-between">
                        <span class="label">Tags:</span>
                        <select
                            class="memory-item-tags"
                            id="memory-item-tags--${id}"
                            multiple="multiple"
                        >
                            ${tagOptions}
                        </select>
                    </div>
                </div>
            </div>
            <small class="memory-authors">${cutAuthors(escapeHtml(paper.author))}</small>

            <div class="code-and-note">${codeDiv} ${noteDiv}</div>

            <div class="memory-item-actions flex-center-between mt-2">
                <div class="d-flex align-items-center">
                    <div
                        class="memory-item-edit memory-item-svg-div me-2"
                        title='${titles.edit}'
                    >
                        ${tablerSvg("writing", "", ["memory-icon-svg"])}
                    </div>

                    <small class="memory-item-faded memory-display-id" title='${
                        titles.displayId
                    }'>
                        ${escapeHtml(displayId)}
                    </small>
                </div>

                ${openLocalDiv}
                ${openLinkDiv}
                ${huggingface}
                ${alphaxiv}
                ${ar5iv}
                ${scirate}


                <div
                    class="memory-item-copy-link memory-item-svg-div"
                    title='${titles.copyLink}'
                >
                    ${tablerSvg("link", "", ["memory-icon-svg"])}
                </div>

                <div
                    class="memory-item-copy-hyperlink memory-item-svg-div"
                    title='${titles.copyHypeLink}'
                >
                    ${tablerSvg("device-desktop-code", "", ["memory-icon-svg"])}
                </div>



                <div class="memory-item-md memory-item-svg-div" title='${
                    titles.copyMd
                }'>
                    ${tablerSvg("markdown", "", ["memory-icon-svg"])}
                </div>

                <div
                    class="memory-item-bibtex memory-item-svg-div"
                    title='${titles.copyBibtext}'
                >
                    ${tablerSvg("math-function", "", ["memory-icon-svg"])}
                </div>

                <span style="display: none" class="memory-item-feedback"></span>

            </div>

            <div class="extended-item" style="display: none">
                <div class="item-note">
                    <form class="form-note">
                        <div class="flex-center-start">
                            <span class="label">Code:</span>
                            <input
                                type="text"
                                class="form-code-input"
                                value="${escapeHtml(paper.codeLink || "")}"
                                placeholder="Add link"
                            />
                        </div>
                        <div class="flex-center-start">
                            <span class="label">Note:</span>
                            <textarea
                                rows="2"
                                class="form-note-textarea"
                                placeholder="Anything to note?"
                            >
${escapeHtml(note)}</textarea
                            >
                        </div>
                        <div class="form-note-buttons">
                            <button class="done-note-form back-to-focus">
                                Done
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="memory-delete" title="Delete from Memory">-</div>
        </div>
    `;
};


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

    const visits = `${paper.count} visit${paper.count === 1 ? "" : "s"}`;

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
                    <label for="popup-item-tags--${id}-ts-control">Tags</label>
                    <div class="pm-pv-val pm-pv-tags">
                        <select id="popup-item-tags--${id}" multiple="multiple">${getTagsOptions(paper)}</select>
                    </div>
                </div>
                <div class="pm-pv-frow">
                    <label>Code</label>
                    <div class="pm-pv-val" id="popup-code-val">${getPopupCodeLinkHTML(paper)}</div>
                </div>
                <div class="pm-pv-frow">
                    <label for="popup-form-note-textarea--${id}">Note</label>
                    <div class="pm-pv-val pm-pv-noteval">
                        <span id="popup-note-val">${getPopupNoteHTML(paper)}</span>
                        <textarea class="pm-textarea" id="popup-form-note-textarea--${id}" rows="3" placeholder="Anything to note?" hidden>${escapeHtml(paper.note || "")}</textarea>
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

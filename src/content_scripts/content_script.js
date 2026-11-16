// ES Module imports
import { querySelector, queryAll } from "@pmu/miniquery.js";
import {
    copyTextToClipboard,
    isPdfUrl,
    warn,
    log,
    info,
    logError,
    sendMessageToBackground,
    downloadURI,
    dummyEvent,
    escapeHtml,
} from "@pmu/functions.js";
import { bibtexToString, bibtexToObject } from "@pmu/bibtexParser.js";
import {
    getStorage,
    deletePaperInStorage,
    getDefaultKeyboardAction,
    themeFromPrefs,
} from "@pmu/data.js";
import { isPaper, addOrUpdatePaper } from "@pmu/paper.js";
import { state } from "@pmu/config.js";
import { getSource } from "@pmu/sources/index.js";
import { initSyncAndState, sleep } from "@pmu/sync.js";
import { formatVenue } from "@pmu/venues.js";
import {
    handleOpenItemAr5iv,
    handleCopyBibtex,
    handleCopyPDFLink,
    handleOpenItemLink,
    handleCopyMarkdownLink,
    handleOpenItemHuggingface,
    handleOpenItemAlphaxiv,
    handleOpenItemScirate,
    handleCopyHyperLink,
} from "@pm/popup/js/handlers.js";
import { icon } from "@pm/popup/js/icons.js";
import { stateTitleFunction } from "@pmu/state.js";
import { parseIdFromUrl, isSourceURL, isArxivAbstractUrl } from "@pmu/urls.js";
import tokensCss from "../../public/tokens.css?raw";
import uiCss from "./content_ui.css?raw";

// ---------------------------------------------------------------------------------------
// PaperMemory's UI on web pages: the arXiv block, notices (bottom right) and tooltips.
// Each lives in a shadow root (content_ui.css): the page's CSS cannot restyle it, and none
// of ours reaches the page. Every text from the page or the Memory is set with textContent.
// ---------------------------------------------------------------------------------------

// tokens.css without its @font-face rules (they move to the page, below) and with :root
// mapped to the notices' own root, which carries data-theme
const FONT_FACES = tokensCss.match(/@font-face\s*{[^}]*}/g) ?? [];
const SHADOW_CSS =
    FONT_FACES.reduce((css, face) => css.replace(face, ""), tokensCss).replaceAll(
        ":root",
        ".pm-layer",
    ) + uiCss;

let fontsAdded = false;
/** Bundled Inter, as "PaperMemory Inter" (no clash with a page's own Inter), from the
 * extension's web-accessible fonts/: @font-face is ignored inside a shadow root in Chrome */
const addFonts = () => {
    if (fontsAdded) return;
    fontsAdded = true;
    const style = document.createElement("style");
    style.textContent = FONT_FACES.map((face) =>
        face
            .replace('"Inter"', '"PaperMemory Inter"')
            .replace(
                /url\("fonts\/([\w.-]+)"\)/,
                (_, file) => `url("${chrome.runtime.getURL(`fonts/${file}`)}")`,
            ),
    ).join("\n");
    (document.head ?? document.documentElement).append(style);
};

/**
 * A DOM element. attrs: class, text (textContent), on<event> listeners, other attributes
 * (skipped when null / undefined / false); children: nodes or strings (as text)
 */
const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === undefined || value === null || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? "" : value);
    }
    el.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
    return el;
};
/** An icon (constant markup from icons.js) */
const svgIcon = (name, cls = "") => {
    const tpl = document.createElement("template");
    tpl.innerHTML = icon(name, cls);
    return tpl.content.firstElementChild;
};

/** A shadow host with the UI's styles */
const makeHost = (tag) => {
    const host = document.createElement(tag);
    const root = host.attachShadow({ mode: "open" });
    root.append(h("style", { text: SHADOW_CSS }));
    addFonts();
    setupTooltips(root);
    return { host, root };
};

// ----- notices' theme: the PaperMemory theme; "System" follows the computer -----
const darkMedia = matchMedia("(prefers-color-scheme: dark)");
const noticeTheme = () => {
    const theme = themeFromPrefs(state.prefs);
    return theme === "system" ? (darkMedia.matches ? "dark" : "light") : theme;
};

let layer = null; // {host, el}: notices and tooltips, on top of the page
const getLayer = () => {
    if (!layer?.host.isConnected) {
        const { host, root } = makeHost("papermemory-notices");
        const el = h("div", { class: "pm-layer" });
        root.append(el);
        document.body.append(host);
        layer = { host, el };
    }
    layer.el.dataset.theme = noticeTheme();
    return layer;
};
darkMedia.addEventListener("change", () => {
    if (layer) layer.el.dataset.theme = noticeTheme();
});

// ----- tooltips: hover and keyboard focus; Escape closes them (never advertised) -----
const TIP_DELAY = 400; // ms, as in the popup
const TIP_MARGIN = 6;
let tip = null;
let tipFor = null;
let tipTimer = null;

const hideTip = () => {
    clearTimeout(tipTimer);
    tipTimer = null;
    tipFor = null;
    if (tip) tip.hidden = true;
};
const showTip = (el) => {
    if (!el.isConnected) return hideTip();
    const { el: root } = getLayer();
    if (!tip?.isConnected) {
        tip = h("span", { class: "pm-tip", "aria-hidden": "true" });
        root.append(tip);
    }
    tip.textContent = el.dataset.tip;
    tip.classList.remove("is-long");
    tip.style.maxWidth = "";
    tip.style.left = "0px";
    tip.style.top = "0px";
    tip.hidden = false;
    // one line, unless wider than the max width (a long URL): then it wraps
    const maxWidth = Math.min(320, window.innerWidth - 2 * TIP_MARGIN);
    if (tip.getBoundingClientRect().width > maxWidth) {
        tip.classList.add("is-long");
        tip.style.maxWidth = `${maxWidth}px`;
    }
    // under the control (above when there is no room), kept inside the window
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const left = Math.max(
        TIP_MARGIN,
        Math.min(
            r.left + r.width / 2 - t.width / 2,
            window.innerWidth - TIP_MARGIN - t.width,
        ),
    );
    let top = r.bottom + TIP_MARGIN;
    if (top + t.height > window.innerHeight - TIP_MARGIN)
        top = r.top - TIP_MARGIN - t.height;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(Math.max(top, TIP_MARGIN))}px`;
    tipFor = el;
};
const scheduleTip = (el) => {
    hideTip();
    tipTimer = setTimeout(() => showTip(el), TIP_DELAY);
};
/** Tooltips of the controls with data-tip in a shadow root */
const setupTooltips = (root) => {
    const target = (e) => e.target?.closest?.("[data-tip]");
    root.addEventListener("mouseover", (e) => {
        const el = target(e);
        if (el && el !== tipFor) scheduleTip(el);
    });
    root.addEventListener("mouseout", (e) => {
        const el = target(e);
        if (!el || !el.contains(e.relatedTarget)) hideTip();
    });
    root.addEventListener("focusin", (e) => {
        const el = target(e);
        if (el && el.matches(":focus-visible")) scheduleTip(el);
        else hideTip();
    });
    root.addEventListener("focusout", hideTip);
    root.addEventListener("mousedown", hideTip, true);
};
document.addEventListener(
    "keydown",
    (e) => e.key === "Escape" && (tipFor || tipTimer) && hideTip(),
    true,
);
window.addEventListener("scroll", () => (tipFor || tipTimer) && hideTip(), true);

// ----- notices: bottom right, one at a time -----
const NOTICE_MS = 3500; // auto-hiding notices leave after this, unless hovered / focused
const notice = {
    el: null,
    kind: null,
    timer: null,
    autoHide: false,
    hover: false,
    focus: false,
};
let pendingNotice = null; // asked for before the page has a body

const clearNotice = () => {
    pendingNotice = null; // a notice queued before <body> is older than this change
    clearTimeout(notice.timer);
    notice.el?.remove();
    Object.assign(notice, { el: null, kind: null, timer: null });
};
const armNotice = () => {
    clearTimeout(notice.timer);
    if (notice.autoHide && !notice.hover && !notice.focus)
        notice.timer = setTimeout(clearNotice, NOTICE_MS);
};

/**
 * Shows a notice (replacing the current one)
 * @param {object} opts kind ("loading", "saved", "removed", "copied", "error", "text"),
 *   role ("status" | "alert"), autoHide, small (the loading look), children
 */
const showNotice = (opts) => {
    if (!document.body) {
        if (!pendingNotice)
            document.addEventListener("DOMContentLoaded", () => {
                const next = pendingNotice;
                pendingNotice = null;
                next && showNotice(next);
            });
        pendingNotice = opts;
        return;
    }
    const { kind, role = "status", autoHide = true, small = false, children } = opts;
    const { el: root } = getLayer();
    hideTip();
    clearNotice();
    const el = h(
        "div",
        { class: `pm-toast${small ? " small" : ""}`, role },
        ...children,
    );
    el.addEventListener("mouseenter", () => ((notice.hover = true), armNotice()));
    el.addEventListener("mouseleave", () => ((notice.hover = false), armNotice()));
    el.addEventListener("focusin", () => ((notice.focus = true), armNotice()));
    el.addEventListener("focusout", (e) => {
        if (el.contains(e.relatedTarget)) return;
        notice.focus = false;
        armNotice();
    });
    root.append(el);
    Object.assign(notice, { el, kind, autoHide, hover: false, focus: false });
    armNotice();
};

const dismissButton = () =>
    h(
        "button",
        {
            type: "button",
            class: "pm-iconbtn",
            "aria-label": "Dismiss",
            "data-tip": "Dismiss",
            onclick: () => (hideTip(), clearNotice()),
        },
        svgIcon("x", "pm-i-sm"),
    );

const noticeLoading = () =>
    showNotice({
        kind: "loading",
        small: true,
        autoHide: false,
        children: [
            h("span", { class: "pm-spinner" }),
            h("span", { text: "Reading this paper…" }),
        ],
    });
const hideLoadingNotice = () => {
    if (pendingNotice?.kind === "loading") pendingNotice = null;
    if (notice.kind === "loading") clearNotice();
};

const noticeCopied = (text) =>
    showNotice({
        kind: "copied",
        children: [svgIcon("check", "ok"), h("span", { text })],
    });

const noticeSaved = (paper) =>
    showNotice({
        kind: "saved",
        children: [
            svgIcon("mark"),
            h("span", { text: "Saved to your Memory" }),
            h(
                "button",
                { type: "button", class: "pm-btn", onclick: () => undoSave(paper) },
                svgIcon("undo", "pm-i-sm"),
                "Undo",
            ),
            dismissButton(),
        ],
    });

/** "Couldn’t save this paper" + Try again; stays until dismissed */
const noticeError = (reason) =>
    showNotice({
        kind: "error",
        role: "alert",
        autoHide: false,
        children: [
            svgIcon("alert", "err"),
            h("span", {}, "Couldn’t save this paper", h("small", { text: reason })),
            h(
                "button",
                { type: "button", class: "pm-btn", onclick: () => savePaper() },
                "Try again",
            ),
            dismissButton(),
        ],
    });

/** Undo of "Saved": the same deletion as the popup's (a background Memory operation); the
 * paper is not added again until the page is reloaded */
const undoSave = async (paper) => {
    state.deleted[paper.id] = true; // set first: the preprint update must not re-create it
    if (!(await deletePaperInStorage(paper.id))) {
        delete state.deleted[paper.id];
        showNotice({
            kind: "error",
            role: "alert",
            autoHide: false,
            children: [
                svgIcon("alert", "err"),
                h("span", { text: "Couldn’t remove this paper" }),
                dismissButton(),
            ],
        });
        return;
    }
    showNotice({
        kind: "removed",
        children: [
            svgIcon("mark"),
            h("span", { text: "Removed from your Memory" }),
            dismissButton(),
        ],
    });
    renderArxivBlock();
};

/**
 * Feedback from addOrUpdatePaper (contentScriptCallbacks.feedback)
 * @param {object} opts loading; paper: a new paper was saved; error: "write" (the
 *   background did not save it) or "read" (the page could not be parsed); text: anything else
 */
const feedback = ({ text, paper = null, loading = false, error = null }) => {
    if (error) {
        settleBlock();
        return noticeError(
            error === "write"
                ? "Your Memory could not be updated"
                : "The page could not be read",
        );
    }
    if (loading) return noticeLoading();
    if (paper) return noticeSaved(paper);
    if (text) showNotice({ kind: "text", children: [h("span", { text })] });
};

let runMain = null; // (manualTrigger) => contentScriptMain on this page, set by initContentScript
// each contentScriptMain run gets a number: callbacks of an older run (e.g. the late
// preprint update of a metadata-only run) cannot change the block or the notices any more
let activeRun = 0;

/** The active run is over: the block shows its status again, a manual save may start */
const settleBlock = () => {
    block.pending = false;
    block.saving = false;
    renderArxivBlock();
};

/** "Add to Memory" and "Try again": parse and store this page now (once at a time) */
const savePaper = () => {
    if (block.saving) return;
    for (const id of [block.id, block.paper?.id]) if (id) delete state.deleted[id];
    block.saving = true;
    block.pending = true;
    renderArxivBlock();
    noticeLoading();
    runMain?.(true);
};

const makePaperMemoryHTMLDiv = (paper) => {
    return paper.venue
        ? /*html*/ `
         <div
            id="pm-container"
            style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 0.8rem;"
        >
            <div
                style="display: flex; justify-content: center; align-items: center;"
                id="pm-venue"
            >
                <span id="pm-venue-name">${escapeHtml(paper.venue)}</span>
                <span id="pm-venue-year">${escapeHtml(bibtexToObject(paper.bibtex).year)}</span>
            </div>
            <p
                style="text-align: center; font-size: 12px; color: #666; margin: 0;"
            >
                (PaperMemory)
            </p>
         </div>
         `
        : "";
};

const handleDefaultAction = async () => {
    const action = await getDefaultKeyboardAction();
    let id;
    try {
        id = await parseIdFromUrl(window.location.href);
    } catch (e) {
        console.log("Unknown url:", window.location.href);
    }
    if (!id) return;
    const e = dummyEvent(id);
    const paper = state.papers[id];
    let text;
    if (!paper) return;
    switch (action) {
        case "o":
            handleOpenItemLink(e);
            break;
        case "c":
            handleCopyPDFLink(e);
            text = "URL copied";
            break;
        case "m":
            handleCopyMarkdownLink(e);
            text = "Markdown link copied";
            break;
        case "b":
            handleCopyBibtex(e);
            text = "BibTeX copied";
            break;
        case "h":
            handleCopyHyperLink(e);
            text = "Rich link copied";
            break;
        case "d":
            console.log("Invalid action:", action);
            break;
        case "e":
            console.log("Invalid action:", action);
            break;
        case "5":
            handleOpenItemAr5iv(e);
            break;
        case "f":
            handleOpenItemHuggingface(e);
            break;
        case "x":
            handleOpenItemAlphaxiv(e);
            break;
        case "s":
            handleOpenItemScirate(e);
            break;
        default:
            warn("Unknown action:", action);
    }
    text && noticeCopied(text);
};

/** Whether or not to ignore the current paper based on its `is` object
 * and the dictionary of sources to ignore
 * @param {object} is The `is` object of the current paper
 * @param {object} ignoreSources The dictionary of sources to ignore
 * @returns {boolean} Whether or not to ignore the current paper
 * */
const ignorePaper = (is, ignoreSources) => {
    const sources = Object.entries(ignoreSources)
        .filter(([name, ignore]) => ignore)
        .map(([name, ignore]) => name);
    const papers = Object.entries(is)
        .filter(([source, isSource]) => isSource)
        .map(([name, isSource]) => name);
    return papers.some((paper) => sources.includes(paper));
};

/**
 * Queries an element from the DOM, waiting for it to appear if necessary
 * @param {object} opts The options for the query
 * @param {string} opts.query The query to search for
 * @param {number} opts.interval The interval to wait between queries
 * @param {number} opts.iters The maximum number of iterations
 * @param {boolean} opts.all Whether to query all elements or a single element
 * @param {HTMLElement} opts.dom The DOM to query
 * @returns {HTMLElement} The queried element
 */
const queryOrWait = async ({
    query,
    interval = 200,
    iters = 50,
    all = false,
    dom = null,
}) => {
    let iter = 0;
    const func = all ? queryAll : querySelector;
    let el = func(query);
    while ((all && !el.length) || (!all && !el)) {
        await sleep(interval);
        iter += 1;
        if (iter > iters) {
            break;
        }
        el = func(query);
    }
    return el;
};

/**
 * Adds markdown link, bibtex citation and download button on arxiv.
 * Also, if the current website is a known paper source (isPaper), adds or updates the current paper
 * @param {object} checks The user's stored preferences regarding menu options
 */
const contentScriptMain = async ({
    url,
    stateIsReady,
    manualTrigger = false,
    paperUpdateDoneCallbacks = {},
    run = activeRun,
} = {}) => {
    console.log("url: ", url);
    const isActive = () => run === activeRun;
    // the arXiv block shows no status until this run says whether the paper is saved
    block.pending = true;
    if (!stateIsReady) {
        let remoteReadyPromise;
        const stateReadyPromise = new Promise((stateResolve) => {
            remoteReadyPromise = new Promise((remoteResolve) => {
                initSyncAndState({
                    isContentScript: true,
                    stateIsReady: stateResolve,
                    remoteIsReady: remoteResolve,
                });
            });
        });
        await stateReadyPromise;
        tryArxivDisplay({ url });
        await remoteReadyPromise;
    }
    const prefs = state.prefs;

    let is = await isPaper(url, true);

    let ignoreSources = (await getStorage("ignoreSources")) ?? {};

    let update;
    const isIgnored = ignorePaper(is, ignoreSources); // source is not ignored
    const isPdfPrevented = prefs.checkPdfOnly && !isPdfUrl(url); // pdf only is not checked or it is a pdf
    const isAutoDisabled = prefs.checkNoAuto && !manualTrigger; // no auto is not checked or it is a manual trigger
    if (
        manualTrigger || // force parsing
        (!isIgnored && ((!isPdfPrevented && !isAutoDisabled) || is.arxiv))
    ) {
        const store = !(isPdfPrevented || isAutoDisabled) || manualTrigger;
        try {
            update = await addOrUpdatePaper({
                url,
                is,
                prefs,
                store,
                contentScriptCallbacks: paperUpdateDoneCallbacks,
            });
        } catch (error) {
            logError("Could not parse the paper:", error);
        }
        if (!update && isActive()) {
            // parsing failed: say so when the paper was to be saved (else the loading
            // notice of a metadata-only read just ends)
            settleBlock();
            hideLoadingNotice();
            store && feedback({ error: "read" });
        }
    } else {
        if (isActive()) settleBlock();
        if (ignorePaper(is, ignoreSources)) {
            warn(
                "Paper is being ignored because its source has been disabled in the Advanced Options.",
            );
        } else if (prefs.checkPdfOnly && !isPdfUrl(url)) {
            warn(
                `Paper is being ignored because you have checked the PDF-Only option ` +
                    `and the current URL (${url}) is not that of a pdf's.`,
            );
        } else if (prefs.checkNoAuto && !manualTrigger) {
            warn(
                "Paper is being ignored because you disabled automatic parsing" +
                    " in the menu.",
            );
        }
    }

    let id;
    if (update) {
        id = update.id;
    }

    if (id && prefs.checkPdfTitle) {
        const makeTitle = async (id) => {
            if (!state.papers.hasOwnProperty(id)) return;
            const paper = state.papers[id];
            const maxWait = 60 * 1000;
            const maxIters = 20;
            let pdfTitleIters = 0;
            while (pdfTitleIters < maxIters) {
                const waitTime = Math.min(maxWait, 250 * 2 ** pdfTitleIters);
                await sleep(waitTime);
                document.title = "";
                document.title = paper.title;
                pdfTitleIters++;
            }
        };
        makeTitle(id);
    }
};

/**
 * Adds the venue badge to HuggingFace paper pages
 * @param {object} paper The paper object
 * @param {string} url The current url
 */
const huggingfacePapers = (paper, url) => {
    if (!paper || !paper.venue) return;
    if (!url || !url.includes("huggingface.co/papers/")) return;

    const venueDiv = /*html*/ `
        <div id="pm-publication-wrapper">
            <div id="pm-publication-venue">
                <span id="pm-venue-name">${escapeHtml(paper.venue)}</span>
                <span id="pm-venue-year">${escapeHtml(bibtexToObject(paper.bibtex).year)}</span>
                <span id="pm-hf-label">(PaperMemory)</span>
            </div>
        </div>`;
    const abstractH2 = queryAll("h2").find((h) => h.innerText.trim() === "Abstract");
    if (!abstractH2) {
        log("Missing 'Abstract' h2 title on HuggingFace paper page.");
        return;
    }
    const authorDiv = abstractH2.parentElement.previousElementSibling;
    log("Adding venue to HuggingFace paper page.");
    setTimeout(() => {
        [...authorDiv.childNodes].last().insertAdjacentHTML("beforeend", venueDiv);
    }, 100);
};

// ---------------------------------------------------------------------------------------
// arXiv abstract page: one compact block at the end of arXiv's "Access Paper" column, at
// arXiv's own width. Its colours come from the page's text colour (content_ui.css).
// ---------------------------------------------------------------------------------------
const COPIED_MS = 1500;
const block = {
    root: null, // the block's shadow root
    id: null, // id from the url
    paper: null, // the paper parsed or saved
    pdfUrl: null,
    pending: false, // a save may be running: no status yet
    saving: false, // an "Add to Memory" / "Try again" save is running
    bibOpen: false,
    copied: null, // timer while BibTeX's Copy reads "Copied"
    hasFile: false, // the PDF is in the downloads (PaperMemoryStore)
    downloaded: false, // a Download from this page completed: never back to "Download"
    downloading: false, // a Download is in flight: its button is disabled
    downloadId: null, // its id, once the background answered
    earlyDone: {}, // id → ok: ends reported before that answer
};

/** The paper as stored in the Memory, or undefined */
const storedPaper = () =>
    state.papers?.[block.paper?.id] ?? state.papers?.[block.id] ?? undefined;

/** An http(s) URL, else null */
const safeHttpUrl = (value) => {
    try {
        const url = new URL(String(value).trim());
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (e) {
        return null;
    }
};

const bibText = (paper) => bibtexToString(paper.bibtex).replaceAll("\t", "  ");

const blockButton = (act, iconName, label, onclick, extra = {}) =>
    h(
        "button",
        { type: "button", class: "pmx-btn", "data-act": act, onclick, ...extra },
        svgIcon(iconName),
        label,
    );
const blockRow = (label, ...buttons) =>
    h(
        "div",
        { class: "pmx-row" },
        h("span", { class: "pmx-label", text: label }),
        h("span", { class: "pmx-acts" }, ...buttons),
    );

const downloadPdf = async () => {
    if (block.downloading) return;
    const id = block.id;
    let pdfUrl = block.pdfUrl ?? querySelector(".abs-button.download-pdf")?.href;
    if (!pdfUrl) {
        console.error(
            "Could not parse the PDF URL from HTML element: `.abs-button.download-pdf`",
        );
        return;
    }
    if (!state.papers.hasOwnProperty(id)) {
        const title = await fetch(
            `https://export.arxiv.org/api/query?id_list=${id.split("-")[1]}`,
        ).then((data) => {
            return $($(data).find("entry title")[0]).text();
        });
        downloadURI(pdfUrl, `${title}.pdf`);
    } else {
        let title = stateTitleFunction(id);
        if (!title.endsWith(".pdf")) {
            title += ".pdf";
        }
        // the background starts it and answers at once; "pdfDownloadDone" comes when it
        // ends (only this button's downloads are reported to this tab)
        block.downloading = true;
        renderArxivBlock();
        const answer = await sendMessageToBackground({
            type: "download-pdf-to-store",
            pdfUrl,
            title,
            store: !!state.prefs.checkStore,
        });
        const early = block.earlyDone;
        block.earlyDone = {};
        if (!answer?.ok) return endDownload(false);
        block.downloadId = answer.id;
        if (answer.id in early) endDownload(early[answer.id]);
    }
};

const endDownload = (ok) => {
    block.downloading = false;
    block.downloadId = null;
    if (ok) block.downloaded = block.hasFile = true;
    renderArxivBlock();
};
/** The background's report on a download of this tab: only this page's counts (another
 * paper opened earlier in the tab may have started one) */
const onPdfDownloadDone = ({ id, ok }) => {
    if (!block.downloading) return;
    if (block.downloadId === null)
        block.earlyDone[id] = ok; // before the answer
    else if (id === block.downloadId) endDownload(ok);
};

/** Whether the saved paper's PDF is in the downloads (the background owns that API) */
const checkStoredPdf = async () => {
    const id = storedPaper()?.id;
    if (!id || !state.prefs?.checkDownload) return;
    const answer = await sendMessageToBackground({ type: "stored-pdf", id });
    const found = !!answer?.found || block.downloaded;
    if (found !== block.hasFile) {
        block.hasFile = found;
        renderArxivBlock();
    }
};
const showStoredPdf = async () => {
    const id = storedPaper()?.id;
    const answer =
        id && (await sendMessageToBackground({ type: "stored-pdf", id, show: true }));
    if (!answer?.found) {
        // the file is gone (deleted, erased from the downloads)
        block.hasFile = block.downloaded = false;
        renderArxivBlock();
    }
};

const copyMarkdown = () => {
    const title = storedPaper()?.title ?? document.title;
    copyTextToClipboard(`[${title}](${block.pdfUrl})`);
    noticeCopied("Markdown link copied");
};
const copyBibtex = () => {
    const paper = storedPaper() ?? block.paper;
    if (!paper?.bibtex) return;
    copyTextToClipboard(bibText(paper));
    clearTimeout(block.copied);
    block.copied = setTimeout(() => {
        block.copied = null;
        renderArxivBlock();
    }, COPIED_MS);
    renderArxivBlock();
    noticeCopied("BibTeX copied");
};
const toggleBibtex = () => {
    block.bibOpen = !block.bibOpen;
    renderArxivBlock();
};

/** (Re)draws the block from the current state; keeps the keyboard focus */
const renderArxivBlock = () => {
    if (!block.root) return;
    const prefs = state.prefs ?? {};
    const stored = storedPaper();
    const paper = stored ?? block.paper;
    const focused = block.root.activeElement?.dataset?.act;

    const rows = [
        h(
            "div",
            { class: "pmx-head" },
            svgIcon("mark"),
            h("span", { text: "PaperMemory" }),
        ),
    ];
    // status row (none while a save may be running); not saved: automatic recording off,
    // the source ignored, a failed save, or Undo
    if (!block.pending)
        rows.push(
            stored
                ? h(
                      "div",
                      { class: "pmx-row" },
                      h(
                          "span",
                          { class: "pmx-label pmx-status" },
                          svgIcon("check", "pm-i-sm"),
                          "In your Memory",
                      ),
                  )
                : blockRow(
                      "Not saved",
                      blockButton("add", "plus", "Add to Memory", savePaper),
                  ),
        );
    if (prefs.checkDownload)
        rows.push(
            blockRow(
                "PDF",
                stored && block.hasFile
                    ? blockButton(
                          "show-file",
                          "folder",
                          "Show in folder",
                          showStoredPdf,
                      )
                    : blockButton("download", "download", "Download", downloadPdf, {
                          "data-tip": prefs.checkStore
                              ? "Download to Downloads/PaperMemoryStore"
                              : null,
                          disabled: block.downloading,
                      }),
            ),
        );
    if (prefs.checkMd)
        rows.push(
            blockRow("Markdown link", blockButton("md", "copy", "Copy", copyMarkdown)),
        );
    if (prefs.checkBib && paper?.bibtex) {
        rows.push(
            blockRow(
                "BibTeX",
                blockButton(
                    "bib-show",
                    "down",
                    block.bibOpen ? "Hide" : "Show",
                    toggleBibtex,
                    {
                        "aria-expanded": String(block.bibOpen),
                        "aria-controls": "pm-bibtex",
                    },
                ),
                block.copied
                    ? blockButton("bib-copy", "check", "Copied", copyBibtex, {
                          class: "pmx-btn ok",
                      })
                    : blockButton("bib-copy", "copy", "Copy", copyBibtex),
            ),
            h("pre", { id: "pm-bibtex", hidden: !block.bibOpen, text: bibText(paper) }),
        );
    }
    const venue = paper?.venue ? formatVenue(paper).short : "";
    if (venue)
        rows.push(
            h(
                "div",
                { class: "pmx-row venue" },
                h("em", { text: "Published in" }),
                ` ${venue}`,
            ),
        );
    const codeUrl = paper?.codeLink && safeHttpUrl(paper.codeLink);
    if (codeUrl) {
        const shown = String(paper.codeLink).trim();
        rows.push(
            h(
                "div",
                { class: "pmx-row info" },
                h("em", { text: "Code" }),
                h(
                    "a",
                    {
                        class: "pmx-val",
                        href: codeUrl,
                        target: "_blank",
                        rel: "noopener",
                        "data-act": "code",
                        "data-tip": shown,
                    },
                    shown.replace(/^https?:\/\//i, ""),
                    h("span", { class: "pm-sr", text: " (opens in new tab)" }),
                ),
                h("span", { class: "pmx-out", "aria-hidden": "true", text: "↗" }),
            ),
        );
    }

    block.root.querySelector(".pmx")?.remove();
    block.root.append(
        h("div", { class: "pmx", role: "group", "aria-label": "PaperMemory" }, ...rows),
    );
    if (focused) block.root.querySelector(`[data-act="${focused}"]`)?.focus();
};

/**
 * Draws the PaperMemory block on an arXiv abstract page (once; later calls redraw it)
 * @param {string} url The page's url
 * @returns {void}
 * */
const arxiv = async (url) => {
    const isArxivAbs = url.includes("https://arxiv.org/abs/");

    if (!isArxivAbs) return;

    const id = await parseIdFromUrl(url);
    const column = await queryOrWait({ query: ".extra-services .full-text" });
    if (!column) return;
    if (!block.root?.host.isConnected) {
        const { host, root } = makeHost("papermemory-block");
        column.append(host);
        block.root = root;
    }
    block.id = id;
    block.pdfUrl = (await queryOrWait({ query: ".abs-button.download-pdf" }))?.href;
    if (!block.paper) {
        try {
            block.paper = state.papers.hasOwnProperty(id)
                ? state.papers[id]
                : await getSource("arxiv").parse(url, null, {});
        } catch (error) {
            warn("Could not read the arXiv paper for PaperMemory's block:", error);
        }
    }
    renderArxivBlock();
    checkStoredPdf();
};

/** A paper was saved or updated (contentScriptCallbacks.update / preprints) */
const onPaperUpdate = (paper) => {
    hideLoadingNotice();
    if (paper) block.paper = paper;
    settleBlock();
    checkStoredPdf();
};

// Because Puppeteer does not receive content script logs as "console" events,
// we need another way to signal parsing completion to the testing script.
const updateCompleteSecretHTML = (paper) => {
    let intervalId = null;
    intervalId = setInterval(() => {
        if (document?.querySelector("head")?.insertAdjacentHTML) {
            clearInterval(intervalId);
            document
                .querySelector("head")
                .insertAdjacentHTML(
                    "beforeend",
                    /*html*/ `<meta name="pm-complete-secret-html" content="${escapeHtml(paper.id)}">`,
                );
        }
    }, 50);
};

const tryArxivDisplay = async ({
    url = null,
    paper = null,
    preprintsPromise = null,
} = {}) => {
    // a paper was parsed

    // paper.source may not be "arxiv" even on arxiv.org
    // because of the existing paper matching mechanism
    let is = await isPaper(url, true);

    if (is.arxiv && !isPdfUrl(url) && isArxivAbstractUrl(url)) {
        // display arxiv paper metadata
        await arxiv(url);
        huggingfacePapers(paper, url);

        // wait for publication databases to be queried
        if (preprintsPromise) {
            paper = await preprintsPromise;
        } else {
            const id = await parseIdFromUrl(url);
            const paperExists = state.papers.hasOwnProperty(id);
            if (!paperExists) return;
            paper = state.papers[id];
        }

        // update bibtex, venue and code link
        if (paper) block.paper = paper;
        renderArxivBlock();
    }
};

export async function initContentScript() {
    log("Running PaperMemory's content script");
    var prefs, paper;
    var paperPromise, preprintsPromise, paperResolve, preprintsResolve;
    const url = window.location.href;

    // state will be initialized if the source is known
    // but not on files
    let stateIsReady = false;
    if (url.startsWith("file://")) {
        await initSyncAndState({ isContentScript: true });
        prefs = state.prefs;
        stateIsReady = true;
    }

    // check the background script is reachable
    if (!(await sendMessageToBackground({ type: "hello" }))) {
        warn("Cannot connect to background script");
    }

    /** contentScriptMain as a new run: only its callbacks act while it is the latest */
    const startRun = (opts) => {
        const run = ++activeRun;
        const active = () => run === activeRun;
        return contentScriptMain({
            ...opts,
            stateIsReady,
            run,
            paperUpdateDoneCallbacks: {
                update: (p) => {
                    paperResolve(p);
                    active() && onPaperUpdate(p);
                },
                preprints: (p) => {
                    preprintsResolve(p);
                    active() && onPaperUpdate(p);
                },
                done: updateCompleteSecretHTML,
                feedback: (f) => active() && feedback(f),
            },
        }).catch((error) => {
            // a run that failed before addOrUpdatePaper answered: no notice left running
            logError("PaperMemory could not process this page:", error);
            if (!active()) return;
            settleBlock();
            opts.manualTrigger ? feedback({ error: "read" }) : hideLoadingNotice();
        });
    };
    // "Add to Memory" and "Try again"
    runMain = (manualTrigger) => startRun({ url, manualTrigger });

    // listen to the background script for :
    //  1. tab url updates (SPAs)
    //  2. manual parsing keyboard shortcuts
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.message === "tabUrlUpdate") {
            info("Running PaperMemory's content script for url update");
            startRun({ url: request.url, manualTrigger: false });
        } else if (request.message === "manualParsing") {
            info("Triggering manual parsing");
            runMain(true);
        } else if (request.message === "defaultAction") {
            handleDefaultAction();
        } else if (request.message === "pdfDownloadDone") {
            onPdfDownloadDone(request);
        }
    });

    // 2 Promises:
    //   1. fetch paper data
    //   2. fetch preprints data
    preprintsPromise = new Promise(async (pre) => {
        preprintsResolve = pre;
        paperPromise = new Promise(async (par) => {
            // if the url is associated to a known source: trigger
            // the main functions.
            paperResolve = par;
            if (await isSourceURL(url, true)) {
                runMain(false);
            } else {
                // if the url is not associated to a known source:
                paperResolve(null);
                preprintsResolve();
            }
        });
    });

    // Promise resolved when the DOM is loaded
    const domReadyPromise = new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve);
    });

    // wait for the paper to be parsed and the DOM to be loaded
    const results = await Promise.all([paperPromise, domReadyPromise]);

    paper = results[0];
    if (paper) {
        tryArxivDisplay({ url, paper, preprintsPromise });
        if (url.match(/ar5iv\.labs\.arxiv\.org/)) {
            log("Adding PaperMemory to ar5iv.labs.arxiv.org");
            const pmDiv = makePaperMemoryHTMLDiv(paper);
            setTimeout(() => {
                document.body.insertAdjacentHTML("afterbegin", pmDiv);
            }, 1000);
        }
    }
} // end initContentScript

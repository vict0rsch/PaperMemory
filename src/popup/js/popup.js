// ES Module imports
import { prefsCheckDefaultFalse, prefsCheckNames, state } from "@pmu/config.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import {
    arxivIdFromPaperID,
    delay,
    firstNonStopLowercase,
    isPdfUrl,
    log,
    miniHash,
    normalizeCodeLink,
    shouldWarn,
    urlToWebsiteId,
    warn,
} from "@pmu/functions.js";
import {
    addListener,
    dispatch,
    findEl,
    hideId,
    queryAll,
    setHTML,
    showId,
    val,
} from "@pmu/miniquery.js";
import {
    getDefaultKeyboardAction,
    getPrefs,
    getStorage,
    onPrefsChange,
    saveThemePref,
    themeFromPrefs,
    updatePrefs,
    setDefaultKeyboardAction,
    setStorage,
    validatePaper,
} from "@pmu/data.js";
import {
    addOrUpdatePaper,
    initPaper,
    isPaper,
    makeMdLink,
    paperToAbs,
    paperToPDF,
} from "@pmu/paper.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { initSyncAndState, pushToRemote } from "@pmu/sync.js";
import { getSource, knownPaperPages } from "@pmu/sources/index.js";
import {
    authorList,
    getNotPaperHTML,
    getNoticeBannerHTML,
    getPopupCodeLinkHTML,
    getPopupNoteHTML,
    getPopupPaperHTML,
} from "@pm/popup/js/templates.js";
import {
    closePopupModal,
    handlePopupDeletePaper,
    handlePopupKeydown,
    handlePrefsCheckChange,
} from "@pm/popup/js/handlers.js";
import {
    closeMemory,
    copyAndConfirmMemoryItem,
    followMemoryChanges,
    focusExistingOrCreateNewURLTab,
    makeMemoryHTML,
    openMemory,
    saveCodeLink,
    saveFavoriteItem,
    saveNote,
    savePaperTags,
    SAVE_ERROR,
    updatePopupPaperNoMemory,
} from "@pm/popup/js/memory.js";
import { icon, paintIcons } from "@pm/popup/js/icons.js";
import { createTagField } from "@pm/popup/js/tagfield.js";
import { hideTooltip, setupTooltips } from "@pm/popup/js/tooltip.js";
import {
    isMac,
    loadShortcuts,
    openShortcutSettings,
    shortcuts,
} from "@pm/popup/js/shortcuts.js";
import {
    closeInfoPanel,
    infoPanelIsOpen,
    setupInfoPanel,
    toggleInfoPanel,
} from "@pm/popup/js/infopanel.js";
import { downloadPaperPdf, readJournalAbbreviations } from "@pmu/state.js";
import { parseIdFromUrl, getCurrentUserTab } from "@pmu/urls.js";
import { findLocalFile } from "@pmu/files.js";

let currentTab = null; // the user's active tab when the popup opened
let parseRun = 0; // incremented to ignore the result of a cancelled website parse
let whatsNewUnseen = false;
let manualWebsitePaper = null; // the parsed website shown in the "Check the details" sheet
let paperTagField = null; // the paper view's tag field (tagfield.js)
let codeEdit = null; // the paper view's code link input and its commit (editCodeLink)
let paperEditing = false; // the paper view's edit state: from `e` / a field opened to Done, ⌘↵, Esc

/** Enters / leaves the paper view's edit state (and its "Done ⌘↵" hint) */
const setPaperEditing = (on) => {
    paperEditing = on;
    const foot = findEl({ element: "popup-edit-foot" });
    if (foot) foot.hidden = !on;
};

// ----------------------------
// -----  Header and tabs -----
// ----------------------------

/**
 * Selects the Paper or Memory tab from state (none while the settings menu is open)
 */
export const setActiveTab = () => {
    const paper = !state.prefsIsOpen && !state.memoryIsOpen;
    const memory = !state.prefsIsOpen && state.memoryIsOpen;
    findEl({ element: "tab-paper" })?.setAttribute("aria-selected", String(paper));
    findEl({ element: "tab-memory" })?.setAttribute("aria-selected", String(memory));
};

/**
 * Close the settings menu; the header button goes back to the gear
 */
export const closeMenu = () => {
    hideId("menu-container");
    const btn = findEl({ element: "menu-switch" });
    if (btn) {
        btn.className = "pm-iconbtn";
        btn.innerHTML = icon("gear");
        btn.setAttribute("aria-label", "Settings (p)");
        btn.dataset.tip = "Settings"; // icon only: the tooltip names it
        btn.dataset.tipKey = "p";
        btn.setAttribute("aria-expanded", "false");
    }
    const wasOpen = state.prefsIsOpen;
    state.prefsIsOpen = false;
    setActiveTab();
    // give the focus back to where it was before the menu opened
    if (wasOpen && findEl({ element: "menu-container" })?.contains(document.activeElement))
        state.menuReturnFocus?.isConnected &&
            state.menuReturnFocus.focus({ preventScroll: true });
    state.menuReturnFocus = null;
};

/**
 * Open the settings menu (at the top); the header button becomes "× Close"
 */
export const openMenu = () => {
    if (!state.prefsIsOpen) state.menuReturnFocus = document.activeElement;
    showId("menu-container", "flex");
    const body = findEl({ element: "menu-body" });
    body.scrollTop = 0;
    const btn = findEl({ element: "menu-switch" });
    btn.className = "pm-btn pm-btn-ghost pm-btn-sm";
    btn.innerHTML = `${icon("x", "pm-i-sm")}Close`;
    btn.setAttribute("aria-label", "Close settings (p)");
    delete btn.dataset.tip; // "× Close" has its text
    delete btn.dataset.tipKey;
    hideTooltip();
    btn.setAttribute("aria-expanded", "true");
    state.prefsIsOpen = true;
    setActiveTab();
    setHTML("pm-version", chrome.runtime.getManifest().version);
    body.focus({ preventScroll: true });
};

// ---------------------
// -----  Sheets  ------
// ---------------------

/**
 * Opens a bottom sheet by its name (#modal-<name>-content) and focuses its first control
 * @param {string} name
 */
export const showPopupModal = (name) => {
    if (!state.modalIsOpen) state.modalReturnFocus = document.activeElement;
    state.modalIsOpen = name;
    queryAll(".popup-modal-content").forEach(hideId);
    const sheet = findEl({ element: `modal-${name}-content` });
    showId(sheet, "flex");
    showId("popup-modal-wrapper", "flex");
    sheet.querySelector(".pm-sheet-body, .pm-keys")?.scrollTo?.(0, 0);
    // forms: the first field; otherwise the sheet itself (Tab then reaches its buttons)
    (sheet.querySelector("input, textarea") ?? sheet).focus({ preventScroll: true });
};

/**
 * Shows "Copied" feedback: a toast in the popup
 * @param {string} text
 */
let toastTimer;
export const showToast = (text) => {
    const toast = findEl({ element: "popup-feedback-copied" });
    if (!toast) return;
    toast.querySelector("span").textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 1500);
};

// -------------------------
// -----  Settings menu -----
// -------------------------

const setThemeButtons = (theme) =>
    queryAll("#theme-select button").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.value === theme)),
    );

/** checkNoAuto is shown inverted ("Record papers automatically") */
const setCheck = (el, value) => {
    el.checked = el.hasAttribute("data-invert") ? !value : value;
};

/**
 * Parses prefs options from the storage and adds events listeners for their change.
 * Notably, if a key in `prefsCheckNames` is missing from `prefs` it is set to true
 * @param {object} prefs The user preferences, from getPrefs() (so prefs.theme is set)
 * @param {string []} prefsCheckNames The array of all expected prefs options
 */
export const getAndTrackPopupMenuChecks = (prefs, prefsCheckNames) => {
    let setValues = {};
    for (const key of prefsCheckNames) {
        setValues[key] = prefs.hasOwnProperty(key)
            ? prefs[key]
            : prefsCheckDefaultFalse.indexOf(key) >= 0
              ? false
              : true;
        const el = findEl({ element: key });
        if (el) setCheck(el, setValues[key]);
    }
    setValues.theme = prefs.theme;
    setThemeButtons(prefs.theme);
    // store the defaults of keys missing from storage, without overwriting the others
    updatePrefs((stored) =>
        Object.fromEntries(
            Object.entries(setValues).filter(([key]) => !stored.hasOwnProperty(key)),
        ),
    );

    for (const key of prefsCheckNames) {
        addListener(key, "change", handlePrefsCheckChange);
    }
    queryAll("#theme-select button").forEach((b) =>
        addListener(b, "click", () => {
            setThemeButtons(b.dataset.value);
            saveThemePref(b.dataset.value);
        }),
    );

    // prefs changed elsewhere (options page, another popup): re-sync the menu controls
    onPrefsChange((stored) => {
        for (const key of prefsCheckNames) {
            const el = findEl({ element: key });
            if (el && stored.hasOwnProperty(key)) setCheck(el, stored[key]);
        }
        setThemeButtons(themeFromPrefs(stored));
    });
};

/**
 * Settings menu: prefs, ↵ action, links that open pages in a new tab
 */
const setupMenu = async (prefs) => {
    getAndTrackPopupMenuChecks(prefs, prefsCheckNames);
    val("memory-item-default-action", await getDefaultKeyboardAction());
    addListener("memory-item-default-action", "change", (e) => {
        setDefaultKeyboardAction(e.target.value);
    });
    addListener("advanced-configuration", "click", () => {
        chrome.runtime.openOptionsPage();
    });
    addListener("full-memory", "click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("fullMemory.html") });
    });
    addListener("bib-matcher", "click", () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("bibMatcher.html") });
    });
};

// ------------------------------
// -----  Clicks (one time) -----
// ------------------------------

const openWhatsNew = () => {
    chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
        const version = chrome.runtime.getManifest().version;
        chrome.storage.local.set({ whatsnew: { ...(whatsnew ?? {}), [version]: true } });
        whatsNewUnseen = false;
        findEl({ element: "whats-new-container" })?.classList.remove("pm-newdot");
        showPopupModal("whatsnew");
    });
};

/**
 * Creates click events on the popup
 */
export const setStandardPopupClicks = () => {
    // every link marked .link-in-new-tab (also in sheets and rendered states)
    addListener(document, "click", (e) => {
        const a = e.target.closest?.("a.link-in-new-tab");
        if (!a) return;
        e.preventDefault();
        chrome.tabs.create({ url: a.getAttribute("href") });
    });

    addListener("tab-paper", "click", () => {
        state.prefsIsOpen && closeMenu();
        state.memoryIsOpen && closeMemory();
    });
    addListener("tab-memory", "click", () => {
        state.prefsIsOpen && closeMenu();
        !state.memoryIsOpen && openMemory();
    });
    addListener("menu-switch", "click", () => {
        state.prefsIsOpen ? closeMenu() : openMenu();
    });
    addListener("sync-popup-error", "click", (e) => {
        e.preventDefault();
        chrome.tabs.create({
            url: chrome.runtime.getURL("options.html#online-synchronization"),
        });
    });

    // sheets: Close buttons, scrim, shortcut links
    queryAll(".pm-sheet-close").forEach((el) =>
        addListener(el, "click", closePopupModal),
    );
    addListener("popup-modal-scrim", "click", closePopupModal);
    queryAll(".pm-open-shortcuts").forEach((el) =>
        addListener(el, "click", (e) => {
            e.preventDefault();
            openShortcutSettings();
        }),
    );
    addListener("ar5iv-modal-cancel-button", "click", closePopupModal);
    addListener("delete-paper-modal-scrim", "click", () =>
        dispatch("delete-paper-modal-cancel-button", "click"),
    );

    // manual website form
    addListener("manual-website-form", "submit", (e) => {
        e.preventDefault();
        saveManualWebsite();
    });
    addListener("manual-website-form", "keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            saveManualWebsite();
        }
    });

    shouldWarn("pdf-title", (displayWarning) => {
        // keep as demo ; remove when another shouldWarn is added
        if (displayWarning) {
            setHTML("popup-notice-slot", getNoticeBannerHTML());
            paintIcons(findEl({ element: "popup-notice-slot" }));
            addListener("warning-button", "click", async () => {
                showPopupModal("warning-pdf-title");
                let warnings = (await getStorage("userWarnings")) ?? {};
                warnings["pdf-title"] = true;
                setStorage("userWarnings", warnings);
                setHTML("popup-notice-slot", "");
            });
        }
    });
};

// -----------------------------------
// -----  Manual website parsing -----
// -----------------------------------

const MANUAL_FIELDS = ["pdfLink", "title", "author", "year", "note"];

const setFieldError = (key, message) => {
    const msg = findEl({ element: `manual-website-${key}-msg` });
    const input = findEl({ element: `manual-website-${key}` });
    input?.classList.toggle("is-invalid", !!message);
    if (!msg) return;
    msg.hidden = !message;
    msg.innerHTML = message ? `${icon("info", "pm-i-sm")}${message}` : "";
};

/**
 * Opens the "Check the details" sheet for a parsed (or blank) website paper
 * @param {Object} parsedPaper the parsed paper from addOrUpdatePaper
 * @param {string} url the url of the parsed paper
 */
export const editManualWebsite = (parsedPaper, url) => {
    manualWebsitePaper = { paper: parsedPaper, url };
    const values = {
        ...parsedPaper,
        author: (parsedPaper.author ?? "").split(" and ").join(", "),
    };
    for (const key of MANUAL_FIELDS) {
        val(`manual-website-${key}`, values[key] ?? "");
        setFieldError(key, "");
    }
    hideId("manual-website-validation");
    showPopupModal("manual-website");
};

/**
 * Validates the "Check the details" form; stores the paper when every field is valid
 */
const saveManualWebsite = async () => {
    if (!manualWebsitePaper) return;
    const { paper: parsedPaper, url } = manualWebsitePaper;
    const [pdfLink, title, authors, year, note] = MANUAL_FIELDS.map((k) =>
        val(`manual-website-${k}`).trim(),
    );
    // "a, , b" -> ["a", "b"]: empty names are dropped before checking
    const authorNames = authors
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
    let validUrl = false;
    try {
        const { protocol, hostname } = new URL(pdfLink);
        validUrl = ["http:", "https:"].includes(protocol) && !!hostname;
    } catch (e) {}
    const errors = {
        pdfLink: validUrl ? "" : "Enter the page’s web address, starting with https://",
        title: title ? "" : "Add a title.",
        author: authorNames.length ? "" : "Add at least one author.",
        year: /^\d{4}$/.test(year) ? "" : "Year needs four digits, for example 2021.",
    };
    for (const [key, message] of Object.entries(errors)) setFieldError(key, message);
    const firstError = Object.keys(errors).find((k) => errors[k]);
    if (firstError) {
        findEl({ element: `manual-website-${firstError}` }).focus();
        return;
    }

    const author = authorNames.join(" and ");
    const citationKey = `${miniHash(
        authorNames[0].split(" ").last(),
    )}${year}${firstNonStopLowercase(title)}`;
    // identity and derived fields follow the final URL and values
    let updatedPaper = {
        ...parsedPaper,
        id: `Website_${urlToWebsiteId(pdfLink)}`,
        key: citationKey,
        md: `[${title}](${pdfLink})`,
        title,
        author,
        year,
        note,
        pdfLink,
    };
    updatedPaper.bibtex = bibtexToString({
        ...bibtexToObject(updatedPaper.bibtex),
        author,
        year,
        title,
        citationKey,
        url: pdfLink,
    });
    const box = findEl({ element: "manual-website-validation" });
    let checked;
    try {
        checked = validatePaper(updatedPaper);
    } catch (error) {
        checked = { warnings: { paper: [String(error.message ?? error)] } };
    }
    const messages = Object.values(checked.warnings).flat();
    if (messages.length > 0) {
        // don't store the paper yet
        box.textContent = messages.join(" ");
        showId(box, "flex");
        return;
    }
    const paper = checked.paper;
    // a page already in the Memory keeps its other fields (tags, visits…); the form's win
    const answer = await memoryOp({
        op: "merge",
        paper,
        overwrites: ["title", "author", "year", "note", "lastOpenDate"],
    });
    if (!answer.ok) {
        // not saved: the sheet stays open with every field; nothing is uploaded
        warn("Could not save the page:", answer.error);
        box.textContent = SAVE_ERROR;
        showId(box, "flex");
        return;
    }
    await pushToRemote();
    manualWebsitePaper = null;
    closePopupModal();
    // rebuild the sorted lists and tag index from storage, then the Memory list
    await initSyncAndState({ forceInit: true });
    makeMemoryHTML();
    showPaperView(paper.id, url, {});
};

/**
 * Not a paper: intro (Open Memory, Parse this page…), parsing, or parse error
 * @param {"intro" | "parsing" | "error"} mode
 */
const renderNotPaper = (mode) => {
    const canParse = !!(currentTab && state.prefs.checkWebsiteParsing);
    const nSources = Object.keys(knownPaperPages).length - 4; // minus website + the 3 named
    setHTML(
        "notArxiv",
        getNotPaperHTML(mode, { canParse, nSources, url: currentTab?.url ?? "" }),
    );
    showId("notArxiv", "flex");
    if (whatsNewUnseen)
        findEl({ element: "whats-new-container" })?.classList.add("pm-newdot");
    addListener("notArxiv-open-memory", "click", openMemory);
    addListener("whats-new-container", "click", (e) => {
        e.preventDefault();
        openWhatsNew();
    });
    addListener("website-trigger-btn", "click", parseWebsite);
    addListener("website-parse-retry", "click", parseWebsite);
    addListener("website-parse-cancel", "click", () => {
        parseRun++;
        renderNotPaper("intro");
    });
    addListener("website-parse-manual", "click", async () => {
        const src = getSource("website");
        const title = currentTab.title || new URL(currentTab.url).hostname;
        const paper = await initPaper({
            ...src.fromMeta(currentTab.url, title),
            source: src.name,
        });
        editManualWebsite(paper, currentTab.url);
    });
};

/** "Parse this page": reads the current website, then asks the user to check the result */
const parseWebsite = async () => {
    const run = ++parseRun;
    renderNotPaper("parsing");
    let update;
    try {
        update = await addOrUpdatePaper({
            tab: currentTab,
            url: currentTab.url,
            store: false,
        });
    } catch (error) {
        console.log("error: ", error);
    }
    if (run !== parseRun) return; // cancelled
    if (update?.paper) {
        renderNotPaper("intro");
        editManualWebsite(update.paper, currentTab.url);
    } else {
        renderNotPaper("error");
    }
};

// ------------------------
// -----  Paper view  -----
// ------------------------

/**
 * The paper view's Info panel: from the status line's ⓘ ("status"), the bottom line's Info
 * button ("bar"), or `d` ("key": opens it on the bottom line, closes any open one).
 * @param {"status" | "bar" | "key"} from
 */
export const togglePaperInfo = (from = "bar") => {
    if (from === "key" && infoPanelIsOpen()) return closeInfoPanel();
    const bar = from !== "status";
    const button = findEl({ element: bar ? "popup-info-open" : "popup-info-button" });
    if (!button || !state.papers[state.currentId]) return;
    const host = bar ? findEl({ element: "popup-paper-bar" }) : button.parentElement;
    toggleInfoPanel(host, button, state.currentId);
};

/** Code link: plain input; Enter or leaving the field saves when the value is valid */
const editCodeLink = (focus = true) => {
    const id = state.currentId;
    if (findEl({ element: `popup-form-codeLink--${id}` })) {
        focus && findEl({ element: `popup-form-codeLink--${id}` }).focus();
        return;
    }
    // built with the DOM: the paper id (from a URL) never goes through HTML
    const box = document.createElement("div");
    box.className = "pm-pv-codeedit";
    const input = document.createElement("input");
    Object.assign(input, {
        className: "pm-input",
        type: "text",
        id: `popup-form-codeLink--${id}`,
        placeholder: "github.com/org/repo",
        autocomplete: "off",
        spellcheck: false,
    });
    const msg = document.createElement("p");
    msg.className = "pm-field-msg";
    msg.id = "popup-code-msg";
    msg.hidden = true;
    box.append(input, msg);
    findEl({ element: "popup-code-val" }).replaceChildren(box);
    input.value = state.papers[id].codeLink ?? "";
    const check = (showError) => {
        const result = normalizeCodeLink(input.value);
        input.classList.toggle("is-invalid", !!(showError && result.error));
        msg.classList.toggle("is-error", !!(showError && result.error));
        if (showError && result.error) {
            msg.innerHTML = `${icon("info", "pm-i-sm")}${result.error}`;
            msg.hidden = false;
        } else if (result.url && result.url !== input.value.trim()) {
            msg.textContent = `Will be saved as ${result.url}`;
            msg.hidden = false;
        } else {
            msg.hidden = true;
        }
        return result;
    };
    const commit = () => {
        const result = check(true);
        if (result.error) return false;
        saveCodeLink(id, result.url).then((ok) => {
            if (ok) return;
            // not saved (saveCodeLink showed why): the field opens again with the link
            editCodeLink(false);
            const again = findEl({ element: `popup-form-codeLink--${id}` });
            if (again) {
                again.value = result.url;
                again.dataset.dirty = "1";
            }
        });
        setHTML("popup-code-val", getPopupCodeLinkHTML({ codeLink: result.url }));
        paintIcons(findEl({ element: "popup-code-val" }));
        return true;
    };
    codeEdit = { input, commit };
    addListener(input, "input", () => {
        input.dataset.dirty = "1";
        check(false);
    });
    addListener(input, "keydown", (e) => {
        if (e.isComposing || e.keyCode === 229) return; // IME composing: not a commit
        // ⌘↵ / Ctrl+↵ goes on to the page: it closes the whole edit state (finishPaperEdit)
        if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            commit() && findEl({ element: "popup-code-edit" })?.focus();
        }
    });
    addListener(input, "blur", () => {
        // the input is replaced on commit: blur fires once more on a detached node
        input.isConnected && commit();
    });
    check(false);
    focus && input.focus();
};

/** Grows a textarea with its text (up to 8 lines; then it scrolls) */
export const fitTextarea = (textarea) => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight + 2, 170)}px`;
};

/** Note: the text is shown with its line breaks; editing it uses a textarea (autosaved) */
const editNote = (focus = true) => {
    const id = state.currentId;
    const textarea = findEl({ element: `popup-form-note-textarea--${id}` });
    hideId("popup-note-val");
    textarea.hidden = false;
    fitTextarea(textarea);
    if (focus) {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
    }
};

const endNoteEdit = () => {
    const id = state.currentId;
    const textarea = findEl({ element: `popup-form-note-textarea--${id}` });
    if (!textarea || textarea.hidden) return;
    const close = () => {
        textarea.hidden = true;
        setHTML("popup-note-val", getPopupNoteHTML({ note: textarea.value }));
        showId("popup-note-val", "inline");
    };
    if (!textarea.dataset.dirty) return close();
    // edited: the editor stays open (its text kept, refreshes ignore it) until the save is
    // acknowledged; a failed save leaves it open with the text (saveNote shows the error)
    const value = textarea.value;
    if (textarea.dataset.saving === value) return; // this text is already being saved
    textarea.dataset.saving = value;
    saveNote(id, value).then((ok) => {
        delete textarea.dataset.saving;
        if (!ok || textarea.value !== value) return fitTextarea(textarea);
        delete textarea.dataset.dirty;
        if (document.activeElement !== textarea) close();
    });
};

/**
 * Whether the paper view is being edited, whatever has the focus: the edit state (`e`, a field
 * opened), a field still open, or tag text typed and not added yet
 */
export const paperEditIsOpen = () => {
    const id = state.currentId;
    if (!id || !findEl({ element: "popup-memory-edit" })) return false;
    return (
        paperEditing ||
        !!paperTagField?.input.value.trim() ||
        !!findEl({ element: `popup-form-codeLink--${id}` }) ||
        findEl({ element: `popup-form-note-textarea--${id}` })?.hidden === false ||
        (!!paperTagField && document.activeElement === paperTagField.input)
    );
};

/**
 * Ends the paper view's edit state, wherever the focus is: ⌘↵ / Ctrl+↵ (silent = false) saves
 * a typed tag and the code link (an invalid link keeps its field open), Esc (silent = true)
 * closes without the typed tag and drops an invalid link. Everything else is already saved.
 * @param {boolean} silent
 */
export const finishPaperEdit = (silent = false) => {
    const id = state.currentId;
    const input = findEl({ element: `popup-form-codeLink--${id}` });
    if (input && codeEdit?.input === input && !codeEdit.commit()) {
        if (!silent) return input.focus();
        setHTML("popup-code-val", getPopupCodeLinkHTML(state.papers[id]));
        paintIcons(findEl({ element: "popup-code-val" }));
    }
    endNoteEdit();
    if (paperTagField) {
        !silent && paperTagField.commitPending();
        paperTagField.input.value = "";
    }
    setPaperEditing(false);
    document.activeElement?.blur?.();
};

/** `e`: edit tags, code link and note; the tag input gets the focus */
export const startPaperEdit = () => {
    if (!state.currentId || !findEl({ element: "popup-memory-edit" })) return;
    setPaperEditing(true);
    editCodeLink(false);
    editNote(false);
    paperTagField?.focus();
};

/**
 * The paper was changed from its Memory row: re-render the paper view's tags, code link and
 * note (each one only when it is not being edited)
 * @param {string} id
 */
export const refreshPaperViewFields = (id) => {
    const paper = state.papers[id];
    if (state.currentId !== id || !paper || !findEl({ element: "popup-memory-edit" })) return;
    // a field being typed in keeps its text; untouched ones (even open) take the stored value
    if (
        paperTagField &&
        document.activeElement !== paperTagField.input &&
        !paperTagField.input.value.trim()
    )
        paperTagField.setTags(paper.tags ?? []);
    const codeInput = findEl({ element: `popup-form-codeLink--${id}` });
    if (!codeInput) {
        setHTML("popup-code-val", getPopupCodeLinkHTML(paper));
        paintIcons(findEl({ element: "popup-code-val" }));
    } else if (!codeInput.dataset.dirty && document.activeElement !== codeInput) {
        codeInput.value = paper.codeLink ?? "";
    }
    const textarea = findEl({ element: `popup-form-note-textarea--${id}` });
    if (textarea?.hidden && !textarea.dataset.dirty) {
        textarea.value = paper.note || "";
        setHTML("popup-note-val", getPopupNoteHTML(paper));
    } else if (textarea && !textarea.dataset.dirty && document.activeElement !== textarea) {
        textarea.value = paper.note || "";
        fitTextarea(textarea);
    }
};

/** Tags of the paper view: chips, suggestions with counts, near-duplicate hint; autosaved */
const mountPaperTags = (id) => {
    paperTagField = createTagField({
        root: findEl({ element: `popup-item-tags--${id}` }),
        tags: state.papers[id].tags ?? [],
        inputId: "popup-tags-input",
        onChange: (tags) => savePaperTags(id, tags),
    });
};

/**
 * Renders the paper view for a paper of the Memory
 * @param {string} id
 * @param {string} url The active tab's url
 * @param {object} is isPaper(url)
 */
const showPaperView = (id, url, is) => {
    state.currentId = id;
    paperEditing = false; // a fresh view is not being edited
    const paper = state.papers[id];
    const prefs = state.prefs;
    log("Popup paper:", paper);

    hideId("notArxiv");
    setHTML(
        "isArxiv",
        getPopupPaperHTML(paper, url, is, {
            downloadKey: shortcuts.downloadPdf ?? "",
        }),
    );
    showId("isArxiv", "flex");
    paintIcons(findEl({ element: "isArxiv" }));

    // ----- fields
    mountPaperTags(id);
    const note = findEl({ element: `popup-form-note-textarea--${id}` });
    note.value = paper.note || ""; // not in the markup: a leading line break would be lost
    addListener(note, "input", () => (note.dataset.dirty = "1"));
    addListener(
        note,
        "input",
        delay(async () => {
            if (note.hidden) return;
            const value = note.value;
            // saved: clean again (unless typed meanwhile); not saved: stays marked edited
            if ((await saveNote(id, value)) && note.value === value)
                delete note.dataset.dirty;
        }, 300),
    );
    addListener(note, "input", () => fitTextarea(note));
    addListener(note, "blur", endNoteEdit);
    // code link and note display are re-rendered after saves: delegate their clicks
    addListener("popup-memory-edit", "click", async (e) => {
        if (e.target.closest("#popup-code-edit")) return setPaperEditing(true), editCodeLink();
        if (e.target.closest("#popup-note-display")) return setPaperEditing(true), editNote();
        const codeLink = e.target.closest("#popup-code-link");
        if (codeLink) {
            e.preventDefault();
            await focusExistingOrCreateNewURLTab(state.papers[id].codeLink);
            window.close && window.close();
        }
    });
    addListener(`checkFavorite--${id}`, "click", () =>
        saveFavoriteItem(id, !state.papers[id].favorite),
    );
    addListener("popup-authors-more", "click", () => {
        // every author; a preprint keeps its " · year"
        const authors = findEl({ element: "popup-authors" });
        const year = authors.querySelector(".pm-pv-year");
        authors.textContent = authorList(paper.author).join(", ");
        year && authors.append(year);
    });
    addListener("popup-info-button", "click", () => togglePaperInfo("status"));
    addListener("popup-info-open", "click", () => togglePaperInfo("bar"));
    addListener("popup-edit-done", "click", () => finishPaperEdit(false));
    const modEnter = findEl({ element: "popup-edit-foot" })?.querySelector("[data-mod-enter]");
    if (modEnter) modEnter.textContent = isMac ? "⌘↵" : "Ctrl ↵";
    addListener(`popup-memory-delete--${id}`, "click", handlePopupDeletePaper(id));

    // ----- "Also on"
    const arxivId = () => arxivIdFromPaperID(paper.id);
    const goTo = (target) => {
        chrome.tabs.update({ url: target });
        window.close();
    };
    addListener(`popup-memory-item-scirate--${id}`, "click", () =>
        goTo(`https://scirate.com/arxiv/${arxivId()}`),
    );
    addListener(`popup-memory-item-alphaxiv--${id}`, "click", () =>
        goTo(`https://alphaxiv.org/abs/${arxivId()}`),
    );
    addListener(`popup-memory-item-huggingface--${id}`, "click", () =>
        goTo(`https://huggingface.co/papers/${arxivId()}`),
    );
    addListener(`popup-memory-item-ar5iv--${id}`, "click", () => {
        const aid = arxivId();
        const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${aid}`;
        const paperYear = 2000 + parseInt(aid.split(".")[0].slice(0, 2), 10);
        const paperMonth = parseInt(aid.split(".")[0].slice(-2), 10);
        const now = new Date();
        if (paperYear === now.getFullYear() && paperMonth === now.getMonth() + 1) {
            showPopupModal("ar5iv");
            findEl({ element: "ar5iv-modal-ok-button" }).onclick = () => goTo(ar5ivURL);
        } else {
            goTo(ar5ivURL);
        }
    });

    // ----- action strip
    const linkName =
        paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
    addListener(`popup-memory-item-link--${id}`, "click", () => {
        chrome.tabs.update({ url: isPdfUrl(url) ? paperToAbs(paper) : paperToPDF(paper) });
        window.close();
    });
    addListener(`popup-memory-website-url--${id}`, "click", async () => {
        await focusExistingOrCreateNewURLTab(paper.pdfLink);
        window.close && window.close();
    });
    addListener(`popup-memory-item-copy-link--${id}`, "click", async () => {
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper),
            feedbackText: `${linkName} URL copied`,
            context: "popup",
        });
    });
    addListener(`popup-memory-item-copy-hyperlink--${id}`, "click", async () => {
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper),
            feedbackText: "Rich link copied",
            context: "popup",
            hyperLinkTitle: paper.title,
        });
    });
    addListener(`popup-memory-item-md--${id}`, "click", async () => {
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: makeMdLink(paper, prefs),
            feedbackText: "Markdown link copied",
            context: "popup",
        });
    });
    addListener(`popup-memory-item-bibtex--${id}`, "click", async () => {
        let bibobj = bibtexToObject(state.papers[id].bibtex);
        if (!bibobj.hasOwnProperty("url")) {
            bibobj.url = paperToAbs(state.papers[id]);
        }
        if (!bibobj.hasOwnProperty("pdf")) {
            bibobj.pdf = paperToPDF(state.papers[id]);
        }
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: bibtexToString(bibobj),
            feedbackText: "BibTeX copied",
            context: "popup",
        });
    });
    addListener(`popup-memory-item-openLocal--${id}`, "click", async () => {
        const file = (await findLocalFile(paper)) || state.files[paper.id];
        if (file) {
            chrome.downloads.open(file.id);
        } else {
            chrome.tabs.create({ url: paper.pdfLink });
        }
    });
    addListener(`popup-memory-item-download--${id}`, "click", async () => {
        downloadPaperPdf(paper);
    });
};

/**
 * Main function when opening the window:
 * + Display the appropriate html depending on whether the user is currently looking at a paper
 * + Add event listeners (clicks and keyboard)
 * @param {str} url Currently focused and active tab's url.
 */
export const popupMain = async (url, is, manualTrigger = false, tab = null) => {
    if (manualTrigger) {
        // manual trigger: do not re-create standard listeners
        // but update the current state and rebuild the Memory's HTML
        hideId("isArxiv");
        showId("popup-loading", "flex");
        await initSyncAndState({ forceInit: true });
        makeMemoryHTML();
    } else {
        // Set click events (regardless of paper)
        currentTab = tab;
        addListener(document, "keydown", handlePopupKeydown);
        setupInfoPanel();
        setupTooltips();
        setStandardPopupClicks();
        // refreshPaperViewFields leaves the fields being edited alone
        followMemoryChanges();
        await setupMenu(await getPrefs());
        await loadShortcuts();
        chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
            const version = chrome.runtime.getManifest().version;
            whatsNewUnseen = !whatsnew || !whatsnew.hasOwnProperty(version);
            whatsNewUnseen &&
                findEl({ element: "whats-new-container" })?.classList.add("pm-newdot");
        });
    }
    const prefs = await getPrefs();
    hideId("popup-loading");
    findEl({ element: "pm-shell" }).classList.remove("pm-is-loading");

    // Display popup metadata
    if (Object.values(is).some((i) => i)) {
        const id = await parseIdFromUrl(url);
        state.currentId = id;

        if (!id || !state.papers.hasOwnProperty(id)) {
            log("Unknown id " + id);
            await updatePopupPaperNoMemory(url);
            if (prefs.checkDirectOpen && !prefs.checkNoAuto) {
                openMemory();
            }
            window.__pmPopupReady = true;
            return;
        }
        showPaperView(id, url, is);
    } else {
        if (prefs.checkDirectOpen && !manualTrigger) {
            openMemory();
        }
        renderNotPaper("intro");
    }
    window.__pmPopupReady = true;
};

// ------------------------------
// -----  Script Execution  -----
// ------------------------------
(async () => {
    if (
        typeof window !== "undefined" &&
        (window.location.href.includes("popup") ||
            window.location.pathname.startsWith("/action")) &&
        !window.paperMemoryPopupInitialized
    ) {
        // This is a global variable to track whether the popup has been initialized.
        // In DEV mode, this would be run twice by the additional injection of debug.bundle.js
        window.paperMemoryPopupInitialized = true;
        const tab = await getCurrentUserTab();
        // after the first await: every module of the (circular) popup graph is evaluated
        // (state.js included): journal abbreviations for the venue lines; until they are
        // read, venues show their cleaned name
        const journalsReady = readJournalAbbreviations().catch((e) =>
            log("Could not read the journal abbreviations", e),
        );
        paintIcons();
        findEl({ element: "pm-shell" }).classList.add("pm-is-loading");
        const url = tab.url;
        chrome.runtime.connect({ name: "PaperMemoryPopupSync" });

        let stateReadyPromise, remoteIsReadyPromise;
        remoteIsReadyPromise = new Promise((remoteReadyResolve) => {
            stateReadyPromise = new Promise((stateReadyResolve) => {
                initSyncAndState({
                    stateIsReady: stateReadyResolve,
                    remoteIsReady: remoteReadyResolve,
                }).catch((e) => {
                    console.error("initSyncAndState failed", e);
                    stateReadyResolve();
                    remoteReadyResolve();
                });
            });
        });

        await stateReadyPromise;

        const is = await isPaper(url);
        await journalsReady;

        makeMemoryHTML();
        popupMain(url, is, false, tab).catch((e) => {
            console.error("popupMain error:", e);
            window.__pmPopupReady = true;
        });
        if (navigator.userAgent.search("Firefox") > -1) {
            hideId("overwrite-container");
        }

        await remoteIsReadyPromise;

        if (state.currentId && !state.papers[state.currentId]) {
            state.currentId = null;
            makeMemoryHTML();
            await updatePopupPaperNoMemory(url);
        }
    }
})();

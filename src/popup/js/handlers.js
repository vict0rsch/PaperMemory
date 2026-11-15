// ES Module imports
import { eventId, arxivIdFromPaperID, delay, info, isPdfUrl, log } from "@pmu/functions.js";
import { parseIdFromUrl } from "@pmu/urls.js";
import { findEl, dispatch, addListener, hideId, showId } from "@pmu/miniquery.js";
import { state } from "@pmu/config.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import {
    getDefaultKeyboardAction,
    deletePaperInStorage,
    updatePrefs,
} from "@pmu/data.js";
import { bibtexToString, bibtexToObject } from "@pmu/bibtexParser.js";
import { paperToAbs, paperToPDF, makeMdLink } from "@pmu/paper.js";
import { sortMemory } from "@pmu/state.js";
import {
    applyMemorySearch,
    clearMemorySearch,
    closeMemory,
    commitSearchFilter,
    copyAndConfirmMemoryItem,
    flushMemorySearch,
    focusExistingOrCreateNewURLTab,
    handleSortMenuClick,
    handleTagPanelClick,
    hideSearchSuggestions,
    loadMoreMemoryItems,
    moveSearchSuggestion,
    openMemory,
    openMemoryItemEdit,
    pickSearchSuggestion,
    removeFilter,
    flushSearchSuggestions,
    scheduleSearchSuggestions,
    saveFavoriteItem,
    saved,
    scheduleMemorySearch,
    setMemoryScrolled,
    setMemorySort,
    setMemorySortArrow,
    showOnlyTag,
    toggleFavouritesFilter,
    toggleSortMenu,
    toggleTagPanel,
    updateMemoryCount,
    updatePopupPaperNoMemory,
    updateSearchClear,
} from "@pm/popup/js/memory.js";
import {
    closeMenu,
    openMenu,
    showPopupModal,
    finishPaperEdit,
    paperEditIsOpen,
    startPaperEdit,
    togglePaperInfo,
} from "@pm/popup/js/popup.js";
import { authorList } from "@pm/popup/js/templates.js";
import {
    closeInfoPanel,
    infoPanelIsOpen,
    toggleInfoPanel,
} from "@pm/popup/js/infopanel.js";

/**
 * Closes the open bottom sheet and gives the focus back to where it was
 */

/**
 * Counts a visit (count, last opened), computed by the background on the paper as stored
 * @param {string} id
 * @returns {Promise}
 */
const recordVisit = (id) => memoryOp({ op: "visit", id });

export const closePopupModal = () => {
    state.modalIsOpen = false;
    hideId("popup-modal-wrapper");
    state.modalReturnFocus?.isConnected &&
        state.modalReturnFocus.focus({ preventScroll: true });
    state.modalReturnFocus = null;
};

/**
 * Looks for an open tab to the paper: either its local or online pdf, or html page.
 * If both a local pdf tab exists, focus it.
 * Otherwise, if a remote pdf tab exists, focus it.
 * Otherwise, if an html page exist, focus the it.
 * If none exist, create a new tab to the local file if it exists, to the online pdf otherwise.
 * @param {object} paper The paper whose pdf should be opened
 */
export const focusExistingOrCreateNewPaperTab = async (paper, fromMemoryItem) => {
    if (!chrome.tabs) {
        focusExistingOrCreateNewURLTab(
            isPdfUrl(window.location.href) ? paperToAbs(paper) : paperToPDF(paper),
        );
        return;
    }
    chrome.tabs.query({}, async (tabs) => {
        // find user's preferences
        const prefs = state.prefs;

        let paperTabs = []; // tabs to the paper
        for (const tab of tabs) {
            let tabPaperId;
            try {
                // try and parse a paper id
                tabPaperId = tab.url && (await parseIdFromUrl(tab.url));
            } catch (error) {}

            if (tabPaperId && tabPaperId === paper.id) {
                // an id is found and its the paper's: store the tab
                paperTabs.push(tab);
            }
        }

        let tabToFocus;
        // choose favorite tabs
        const favoriteTabs = prefs.checkPreferPdf
            ? paperTabs.filter((tab) => tab.url && isPdfUrl(tab.url))
            : paperTabs.filter((tab) => tab.url && !isPdfUrl(tab.url));

        if (favoriteTabs.length > 0) {
            // favor tabs to local files
            const fileTabs =
                fromMemoryItem && state.files.hasOwnProperty(paper.id)
                    ? []
                    : paperTabs.filter((tab) => tab.url.startsWith("file://"));
            if (fileTabs.length > 0) {
                tabToFocus = fileTabs[0];
            } else {
                tabToFocus = favoriteTabs[0];
            }
        } else if (paperTabs.length > 0) {
            // no pdf tab: go to abs url
            tabToFocus = paperTabs[0];
        }

        if (tabToFocus) {
            // a tab was found: focus it by starting to focus its window
            chrome.windows.getCurrent((w) => {
                if (w.id !== tabToFocus.windowId) {
                    // tab is in a different window: focus the window
                    chrome.windows.update(
                        tabToFocus.windowId,
                        { focused: true },
                        () => {
                            // focus the tab
                            chrome.tabs.update(tabToFocus.id, { active: true });
                        },
                    );
                } else {
                    // tab is in the same window: focus the tab
                    chrome.tabs.update(tabToFocus.id, { active: true });
                }
            });
        } else {
            // no tab was found
            const hasFile = state.files.hasOwnProperty(paper.id);
            if (hasFile && !fromMemoryItem) {
                // this paper has a local file
                chrome.downloads.open(state.files[paper.id].id);
            } else {
                // no tab open or local file: open a new tab to the paper's pdf
                chrome.tabs.create({
                    url: prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper),
                });
            }
        }

        recordVisit(paper.id);
    });
};

/**
 * Delete a paper ; display a modal first to get uer confirmation
 * @param {string} id Id of the paper to delete
 */
export const showConfirmDeleteModal = (id) => {
    const title = state.papers[id].title;
    state.deleteReturnFocus = document.activeElement;
    findEl({ element: "delete-modal-title" }).textContent = title.replace(/\s+/g, " ");
    findEl({ element: "delete-paper-modal-hidden-id" }).textContent = id;
    showId("delete-paper-modal", "flex");
    // the sheet (popup) or the confirm button (fullMemory) takes the focus: Enter confirms
    (
        document.querySelector("#delete-paper-modal .pm-sheet") ??
        findEl({ element: "delete-paper-modal-confirm-button" })
    )?.focus({ preventScroll: true });
};

/** Whether the delete confirmation is shown */
const deleteModalIsOpen = () =>
    findEl({ element: "delete-paper-modal" })?.style.display === "flex";

/**
 * Infinite list: the next rows are rendered when the list is scrolled near its end
 * (fullMemory: the window; the popup uses its own scroller, see addEventsToMemoryControls)
 * @param {boolean} isPopup
 */
export const displayOnScroll = (isPopup) =>
    delay(() => {
        const scroller = isPopup ? findEl({ element: "memory-scroll" }) : null;
        const bottom = scroller
            ? scroller.scrollTop + scroller.clientHeight
            : window.scrollY + window.innerHeight;
        const height = scroller ? scroller.scrollHeight : document.body.scrollHeight;
        if (height - bottom < 400) loadMoreMemoryItems();
    }, 50);

export const handleDeleteItem = (e) => {
    const id = eventId(e);
    showConfirmDeleteModal(id);
};

export const handleOpenItemLink = (e) => {
    const id = eventId(e);
    focusExistingOrCreateNewPaperTab(state.papers[id], true);
};

export const handleOpenItemScirate = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const scirateURL = `https://scirate.com/arxiv/${arxivId}`;
    focusExistingOrCreateNewURLTab(scirateURL);
    recordVisit(id);
};
export const handleOpenItemAlphaxiv = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const alphaxivURL = `https://alphaxiv.org/abs/${arxivId}`;
    focusExistingOrCreateNewURLTab(alphaxivURL);
    recordVisit(id);
};
export const handleOpenItemAr5iv = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
    const paperMonth = parseInt(arxivId.split(".")[0].slice(-2), 10);
    const paperYear = 2000 + parseInt(arxivId.split(".")[0].slice(0, 2), 10);
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    if (paperYear === currentYear && paperMonth === currentMonth) {
        showPopupModal("ar5iv");
        addListener("ar5iv-modal-ok-button", "click", () => {
            focusExistingOrCreateNewURLTab(ar5ivURL);
            recordVisit(id);
            closePopupModal();
        });
    } else {
        focusExistingOrCreateNewURLTab(ar5ivURL);
        recordVisit(id);
    }
};
export const handleOpenItemHuggingface = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const huggingFaceURL = `https://huggingface.co/papers/${arxivId}`;
    focusExistingOrCreateNewURLTab(huggingFaceURL);
    recordVisit(id);
};

export const handleOpenItemWebsiteURL = async (e) => {
    const id = eventId(e);
    const url = state.papers[id].pdfLink;
    await recordVisit(id);
    await focusExistingOrCreateNewURLTab(url);
};

export const handleCopyMarkdownLink = async (e) => {
    const id = eventId(e);
    const prefs = state.prefs;
    const paper = state.papers[id];
    const md = makeMdLink(paper, prefs);
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: md,
        feedbackText: "Markdown link copied",
    });
};

export const handleCopyBibtex = async (e) => {
    const id = eventId(e);
    const bibtex = state.papers[id].bibtex;
    let bibobj = bibtexToObject(bibtex);
    if (!bibobj.hasOwnProperty("url")) {
        bibobj.url = paperToAbs(state.papers[id]);
    }
    if (!bibobj.hasOwnProperty("pdf") && state.papers[id].source !== "website") {
        bibobj.pdf = paperToPDF(state.papers[id]);
    }
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: bibtexToString(bibobj),
        feedbackText: "BibTeX copied",
    });
};

export const handleCopyPDFLink = async (e) => {
    const id = eventId(e);
    const prefs = state.prefs;
    const paper = state.papers[id];
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    const text =
        paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: link,
        feedbackText: `${text} URL copied`,
    });
};

export const handleCopyHyperLink = async (e) => {
    const id = eventId(e);
    const prefs = state.prefs;
    const paper = state.papers[id];
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: link,
        feedbackText: "Rich link copied",
        hyperLinkTitle: paper.title,
    });
};

export const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    saveFavoriteItem(id, !state.papers[id].favorite);
};

export const handleMemoryOpenLocal = (e) => {
    const id = eventId(e);
    const file = state.files[id];
    const paper = state.papers[id];
    recordVisit(id);
    if (file && (file.id || file.id === 0)) {
        chrome.downloads.open(file.id);
    }
    window?.close && window.close();
};

export const handleCancelModalClick = () => {
    hideId("delete-paper-modal");
    state.deleteReturnFocus?.isConnected &&
        state.deleteReturnFocus.focus({ preventScroll: true });
};

export const handleConfirmDeleteModalClick = async (e) => {
    const id = findEl({ element: "delete-paper-modal-hidden-id" }).textContent;
    const title = state.papers[id].title;
    const url = state.papers[id].pdfLink;
    // the row that takes the focus once this one is gone: the next one, or the previous one
    const rows = [...document.querySelectorAll("#memory-table .memory-container")];
    const index = rows.findIndex((r) => r.id === `memory-container--${id}`);
    const returnToRow = state.memoryIsOpen && !!rows[index]?.contains(state.deleteReturnFocus);
    if (!(await deletePaperInStorage(id))) {
        handleCancelModalClick(); // the focus goes back where it was
        return saved({ ok: false, error: "delete failed" }); // quiet error, paper kept
    }
    sortMemory();
    if (state.sortReversed) state.sortedPapers.reverse();
    applyMemorySearch();
    hideId("delete-paper-modal");
    info(`Successfully deleted "${title}" (${id}) from PaperMemory`);
    if (state.currentId === id) {
        await updatePopupPaperNoMemory(url);
    }
    updateMemoryCount();
    if (returnToRow) {
        const left = document.querySelectorAll("#memory-table .memory-container");
        (
            left[Math.min(index, left.length - 1)] ??
            findEl({ element: "memory-search" })
        )?.focus();
    } else {
        state.deleteReturnFocus?.isConnected &&
            state.deleteReturnFocus.focus({ preventScroll: true });
    }
};

/** A tag in a row: the search becomes that tag alone (popup and fullMemory) */
export const handleTagClick = (e) => showOnlyTag(e.target.closest(".memory-tag").textContent);

/**
 * fullMemory's keys (it has no popup keyboard handler): `d` opens / closes the Info panel of the
 * focused row, `+` shows all its authors, Escape closes the panel
 * @param {KeyboardEvent} e
 */
export const handleFullMemoryKeydown = (e) => {
    if (isComposing(e) || handleEditKeys(e)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape" && infoPanelIsOpen()) {
        e.preventDefault();
        return closeInfoPanel();
    }
    const focused = document.activeElement;
    const key = e.code === "NumpadAdd" ? "+" : e.key;
    if (!["d", "+"].includes(key) || ["INPUT", "TEXTAREA", "SELECT"].includes(focused?.tagName))
        return;
    const row = focused?.closest?.("#memory-table .memory-container");
    if (!row || row.classList.contains("is-edit")) return;
    e.preventDefault();
    if (key === "+") return expandRowAuthors(row);
    toggleInfoPanel(row, row.querySelector(".memory-item-info"), row.id.split("--")[1]);
};

/** Clears the search field and every filter */
export const handleClearSearch = () => clearMemorySearch();

/**
 * Edit forms (row edit form, paper view fields): ⌘↵ / Ctrl+↵ saves and closes, Esc closes,
 * wherever the focus is while the form is shown (a field's own handler runs first and stops
 * the event). Returns whether the key was used.
 * @param {KeyboardEvent} e
 */
export const handleEditKeys = (e) => {
    if (isComposing(e)) return false;
    const submit = e.key === "Enter" && (e.ctrlKey || e.metaKey);
    if (!submit && e.key !== "Escape") return false;
    if (deleteModalIsOpen() || state.modalIsOpen || state.prefsIsOpen) return false;
    // a row editor shown on screen (popup Memory tab or fullMemory), else the paper view's
    const form = [
        ...document.querySelectorAll("#memory-table .memory-container.is-edit .pm-edit"),
    ].find((f) => f.offsetParent !== null);
    const paperEdit = !state.memoryIsOpen && paperEditIsOpen();
    if (!form && !paperEdit) return false;
    e.preventDefault();
    // Esc dismisses what floats over the editor first, and only that
    if (!submit && dismissPopovers()) return true;
    if (form) submit ? form.requestSubmit() : form.dispatchEvent(new CustomEvent("pm-edit-close"));
    else finishPaperEdit(!submit);
    return true;
};

/** A key typed while an input method composes text (IME) is never a shortcut */
export const isComposing = (e) => e.isComposing || e.keyCode === 229;

/**
 * Esc: closes the Info panel, a row's "…" menu, the search's tag suggestions or a tag field's
 * suggestions (with its near-duplicate hint). Returns whether something was closed.
 */
const dismissPopovers = () => {
    if (infoPanelIsOpen()) return closeInfoPanel(), true;
    if (document.querySelector("#memory-table .memory-container.menu-open"))
        return closeRowMenus(), true;
    const searchSugg = findEl({ element: "memory-tag-suggestions" });
    if (searchSugg && !searchSugg.hidden) return hideSearchSuggestions(), true;
    const tagSugg = [...document.querySelectorAll(".pm-tagsugg")].find((el) => !el.hidden);
    if (tagSugg) return (tagSugg.hidden = true), true;
    return false;
};

/** A row's "+N": every author, in place (the row grows only on this explicit action) */
export const expandRowAuthors = (row) => {
    const id = row?.id.split("--")[1];
    const meta = row?.querySelector(".memory-authors");
    const btn = meta?.querySelector(".pm-item-authors-more");
    if (!btn || !state.papers[id]) return;
    const year = meta.querySelector(".pm-item-year");
    const hadFocus = btn.contains(document.activeElement);
    meta.textContent = authorList(state.papers[id].author).join(", ");
    year && meta.append(year);
    meta.classList.add("is-open");
    hadFocus && row.focus({ preventScroll: true });
};

export const handlePopupKeydown = async (e) => {
    if (isComposing(e)) return;
    // "+" whether the layout needs Shift for it or not, and the keypad's +
    let key = e.code === "NumpadAdd" ? "+" : e.key;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isEnter = key === "Enter" && !isCtrlOrMeta;
    if (handleEditKeys(e)) return;
    if (isCtrlOrMeta) return;
    if (
        [
            "Backspace",
            "Enter",
            "Escape",
            "a",
            "e",
            "o",
            "c",
            "m",
            "b",
            "h",
            "p",
            "t",
            "d",
            "5",
            "f",
            "x",
            "s",
            "+",
            "?",
            "/",
        ].indexOf(key) < 0
    ) {
        return;
    }

    const focused = document.activeElement;
    const inputIsFocused = ["INPUT", "TEXTAREA"].includes(focused?.tagName);

    // Escape is never advertised (Firefox closes the whole popup with it) but keeps
    // working where the browser lets the popup see it.

    // delete confirmation sheet: Enter confirms
    if (deleteModalIsOpen()) {
        if (key === "Enter" && focused?.matches?.("#delete-paper-modal button")) {
            return; // Cancel / Delete buttons do their own thing
        }
        if (key === "Enter") {
            e.preventDefault();
            dispatch("delete-paper-modal-confirm-button", "click");
        } else if (key === "Escape") {
            e.preventDefault();
            dispatch("delete-paper-modal-cancel-button", "click");
        }
        return;
    }

    if (state.modalIsOpen) {
        const closesSheet =
            key === "Escape" ||
            (key === "?" && state.modalIsOpen === "shortcuts" && !inputIsFocused);
        if (closesSheet) {
            e.preventDefault();
            closePopupModal();
        }
        return;
    }

    // no sheet is open

    if (key === "?") {
        // ? opens the shortcut sheet from anywhere (and closes it, above)
        if (!inputIsFocused) {
            e.preventDefault();
            showPopupModal("shortcuts");
        }
        return;
    }

    if (state.prefsIsOpen) {
        if (key === "Escape" || key === "p") {
            // p (or escape) closes the menu
            e.preventDefault();
            closeMenu();
        } else if (key === "a") {
            e.preventDefault();
            openMemory();
        }
        return;
    }

    // Menu is closed. Typing in a field never triggers a shortcut.
    if (inputIsFocused && key !== "Escape") {
        return;
    }

    // no input is focused

    if (key === "a") {
        // a opens the Memory, and closes it again
        e.preventDefault();
        if (state.memoryIsOpen) closeMemory();
        else state.papers && openMemory();
        return;
    }
    if (key === "p") {
        e.preventDefault();
        openMenu();
        return;
    }
    if (key === "/") {
        // / focuses the search field, in the Memory only
        if (state.memoryIsOpen) {
            e.preventDefault();
            findEl({ element: "memory-search" })?.focus();
        }
        return;
    }

    // a focused button or link does its own thing with Enter
    if (isEnter && focused?.matches?.("button, a, summary, select")) return;

    let id, paperItem;
    if (state.memoryIsOpen) {
        // the focused row, or the row of the focused control
        paperItem = focused?.closest?.("#memory-table .memory-container");
        if (key === "Escape") {
            if (infoPanelIsOpen()) {
                closeInfoPanel();
                return e.preventDefault();
            }
            if (paperItem?.classList.contains("menu-open")) {
                closeRowMenus();
                return e.preventDefault();
            }
            e.preventDefault();
            return closeMemory();
        }
        if (!paperItem) return;
        id = paperItem.id.split("--")[1];
        if (!state.papers[id]) return;
    } else if (state.currentId) {
        // the paper view (not the "not in your Memory" state)
        if (key === "Escape" && infoPanelIsOpen()) {
            e.preventDefault();
            return closeInfoPanel();
        }
        if (!state.papers[state.currentId] || key === "Escape") return;
        id = state.currentId;
    } else {
        return;
    }

    if (isEnter) {
        key = await getDefaultKeyboardAction();
    }

    if (!paperItem) {
        // paper view: edit fields in place, Info panel
        if (key === "e") {
            e.preventDefault();
            return startPaperEdit();
        }
        if (key === "d") return togglePaperInfo("key");
        if (key === "+") return findEl({ element: "popup-authors-more" })?.click();
    }

    // the control for an action: in the row, or the paper view's #popup-<class>--<id>
    const control = (cls) =>
        paperItem
            ? paperItem.querySelector(`.${cls}`)
            : findEl({ element: `popup-${cls}--${id}` });
    // .click(): a bubbling click, which the rows' delegated listener receives
    const click = (cls) => control(cls)?.click();

    if (key === "Backspace") {
        e.preventDefault();
        click("memory-delete");
    } else if (key === "o") {
        const target =
            state.papers[id].source === "website"
                ? control("memory-website-url")
                : (state.prefs.checkEnterLocalPdf &&
                      control("memory-item-openLocal")) ||
                  control("memory-item-link");
        target?.click();
    } else if (key === "e") {
        e.preventDefault();
        openMemoryItemEdit(id);
    } else if (key === "+" && paperItem) {
        expandRowAuthors(paperItem);
    } else if (key === "d") {
        // the row's Info panel; the focus stays on the row
        toggleInfoPanel(paperItem, paperItem.querySelector(".memory-item-info"), id);
    } else if (key === "t") {
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: state.papers[id].title,
            feedbackText: "Title copied",
        });
    } else {
        const classes = {
            c: "memory-item-copy-link",
            m: "memory-item-md",
            b: "memory-item-bibtex",
            h: "memory-item-copy-hyperlink",
            5: "memory-item-ar5iv",
            x: "memory-item-alphaxiv",
            f: "memory-item-huggingface",
            s: "memory-item-scirate",
        };
        classes[key] && click(classes[key]);
    }
};

export const handlePrefsCheckChange = async (e) => {
    const key = e.target.id;
    const el = findEl({ element: key });
    // "Record papers automatically" is checkNoAuto, inverted
    const value = el.hasAttribute("data-invert") ? !el.checked : el.checked;
    updatePrefs({ [key]: value }).then(() =>
        log(`Settings saved for ${key} (${value})`),
    );
    if (value && key === "checkNoAuto") {
        // explain how to add papers from now on, with the browser shortcut
        showPopupModal("manualParsing");
    }
};

export const handlePopupDeletePaper = (id) => () => {
    showConfirmDeleteModal(id);
};

/** Closes the rows' "…" menus (all, or all but one row's) */
const closeRowMenus = (except = null) =>
    document
        .querySelectorAll("#memory-table .memory-container.menu-open")
        .forEach((r) => {
            if (r === except) return;
            r.classList.remove("menu-open");
            r.querySelector(".memory-item-more")?.setAttribute(
                "aria-expanded",
                "false",
            );
        });

/** Clicks in the Memory list (one delegated listener: rows are re-rendered freely) */
const handleMemoryTableClick = (e) => {
    const t = e.target;
    if (t.closest("#memory-empty-clear")) {
        clearMemorySearch();
        return findEl({ element: "memory-search" })?.focus();
    }
    if (t.closest("#memory-empty-tags")) return toggleTagPanel(true);
    const row = t.closest(".memory-container");
    if (!row || t.closest(".pm-edit")) return;
    const id = row.id.split("--")[1];
    if (!state.papers[id]) return;
    if (t.closest(".pm-note-more")) {
        const note = t.closest(".pm-item-note");
        const open = note.classList.toggle("is-open");
        t.closest(".pm-note-more").textContent = open ? "less" : "more…";
        return;
    }
    if (t.closest(".pm-info-pop")) return;
    if (t.closest(".pm-item-authors-more")) return expandRowAuthors(row);
    if (t.closest(".memory-item-info"))
        return toggleInfoPanel(row, t.closest(".memory-item-info"), id);
    if (t.closest(".memory-tag")) return handleTagClick(e);
    if (t.closest(".memory-item-more")) {
        closeRowMenus(row);
        const open = row.classList.toggle("menu-open");
        row.querySelector(".memory-item-more").setAttribute(
            "aria-expanded",
            String(open),
        );
        return;
    }
    if (t.closest(".memory-item-edit")) return openMemoryItemEdit(id);
    const actions = [
        [".memory-delete", handleDeleteItem],
        [".memory-item-link", handleOpenItemLink],
        [".memory-website-url", handleOpenItemWebsiteURL],
        [".memory-item-openLocal", handleMemoryOpenLocal],
        [".memory-item-scirate", handleOpenItemScirate],
        [".memory-item-alphaxiv", handleOpenItemAlphaxiv],
        [".memory-item-ar5iv", handleOpenItemAr5iv],
        [".memory-item-huggingface", handleOpenItemHuggingface],
        [".memory-item-md", handleCopyMarkdownLink],
        [".memory-item-bibtex", handleCopyBibtex],
        [".memory-item-copy-link", handleCopyPDFLink],
        [".memory-item-copy-hyperlink", handleCopyHyperLink],
        [".memory-item-favorite", handleAddItemToFavorites],
    ];
    for (const [selector, handler] of actions) {
        if (t.closest(selector)) {
            closeRowMenus();
            return handler(e);
        }
    }
};

/**
 * Click handling of the Memory rows. Delegated to #memory-table, so it is set once and works
 * for every row rendered later.
 */
export const addEventsToMemoryItems = () => {
    const table = findEl({ element: "memory-table" });
    if (!table || table.dataset.events) return;
    table.dataset.events = "1";
    table.addEventListener("click", handleMemoryTableClick);
    // Tab reaching the last rendered row renders the next ones
    table.addEventListener("focusin", (e) => {
        if (e.target === table.lastElementChild) loadMoreMemoryItems();
    });
};

/** Keys in the search field: filters, tag suggestions, Backspace on an empty field */
const handleSearchKeydown = (e) => {
    if (isComposing(e)) return;
    const input = e.target;
    if (["ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) flushSearchSuggestions();
    const suggOpen = !findEl({ element: "memory-tag-suggestions" })?.hidden;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggOpen) {
        e.preventDefault();
        moveSearchSuggestion(e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        commitSearchFilter() && applyMemorySearch();
    } else if (e.key === "Tab" && !e.shiftKey) {
        // a complete filter becomes a pill; otherwise Tab moves on to the list
        if (commitSearchFilter()) {
            e.preventDefault();
            applyMemorySearch();
        } else {
            flushMemorySearch(); // the list is final before the focus enters it
        }
    } else if (e.key === "Backspace" && !input.value && state.memoryFilters.length) {
        e.preventDefault();
        removeFilter(state.memoryFilters.length - 1);
    } else if (e.key === "Escape" && suggOpen) {
        e.preventDefault();
        e.stopPropagation();
        hideSearchSuggestions();
    }
};

/**
 * The tab header scrolls away with the list and returns on a wheel or touch scroll-up, never
 * on the scroll caused by Tab moving the focus. The search field stays.
 */
const setupMemoryScroll = () => {
    const scroller = findEl({ element: "memory-scroll" });
    if (!scroller) return;
    let lastTop = 0;
    scroller.addEventListener(
        "scroll",
        () => {
            const top = scroller.scrollTop;
            if (top > lastTop && top > 4) setMemoryScrolled(true);
            lastTop = top;
        },
        { passive: true },
    );
    scroller.addEventListener("scroll", displayOnScroll(true), { passive: true });
    scroller.addEventListener(
        "wheel",
        (e) => e.deltaY < 0 && setMemoryScrolled(false),
        {
            passive: true,
        },
    );
    let touchY = null;
    scroller.addEventListener("touchstart", (e) => (touchY = e.touches[0]?.clientY), {
        passive: true,
    });
    scroller.addEventListener(
        "touchmove",
        (e) => {
            if (touchY !== null && e.touches[0]?.clientY - touchY > 6)
                setMemoryScrolled(false);
        },
        { passive: true },
    );
    // a control of the hidden header that gets the focus (Shift+Tab) shows it
    addListener("popup-header", "focusin", () => setMemoryScrolled(false));
    addListener("memory-filter-chip", "click", () => setMemoryScrolled(false));
};

let memoryControlsReady = false;
/**
 * Search field, filter controls, tag list, sort menu, delete sheet (popup); search,
 * favourites and the legacy sort controls (fullMemory). Set once.
 */
export const addEventsToMemoryControls = () => {
    if (memoryControlsReady) return;
    memoryControlsReady = true;

    const search = findEl({ element: "memory-search" });
    addListener(search, "input", () => {
        updateSearchClear();
        scheduleSearchSuggestions();
        scheduleMemorySearch();
    });
    // programmatic searches (tests, fullMemory) dispatch keypress / clear-search
    addListener(search, "keypress", scheduleMemorySearch);
    addListener(search, "clear-search", applyMemorySearch);
    addListener(search, "keydown", handleSearchKeydown);
    addListener(search, "blur", () => setTimeout(hideSearchSuggestions, 150));
    const sugg = findEl({ element: "memory-tag-suggestions" });
    addListener(sugg, "mousedown", (e) => e.preventDefault()); // keep the focus
    addListener(sugg, "click", (e) => {
        const row = e.target.closest(".pm-sugg-row");
        row && pickSearchSuggestion(Number(row.dataset.i));
    });

    addListener("delete-paper-modal-cancel-button", "click", handleCancelModalClick);
    addListener(
        "delete-paper-modal-confirm-button",
        "click",
        handleConfirmDeleteModalClick,
    );
    addListener("filter-favorites", "click", toggleFavouritesFilter);
    // the × in the field: text, pills and favourites-only go; the field keeps the focus
    addListener("memory-search-x", "click", () => {
        clearMemorySearch();
        findEl({ element: "memory-search" })?.focus();
    });
    addListener("memory-tags-button", "click", () => toggleTagPanel());
    addListener("memory-sort-button", "click", () => toggleSortMenu());
    addListener("memory-tag-panel", "click", handleTagPanelClick);
    addListener("memory-sort-menu", "click", handleSortMenuClick);
    // a click elsewhere closes the tag list, the sort menu and the rows' "…" menus
    addListener(document, "mousedown", (e) => {
        const t = e.target;
        if (!t.closest?.("#memory-tag-panel, #memory-tags-button, #memory-empty-tags"))
            toggleTagPanel(false);
        if (!t.closest?.("#memory-sort-menu, #memory-sort-button"))
            toggleSortMenu(false);
        if (!t.closest?.(".memory-item-more, .pm-pop")) closeRowMenus();
    });
    setupMemoryScroll();

    // fullMemory: sort select + direction arrow
    addListener("memory-select", "change", (e) => {
        setMemorySort(e.target.value, false);
        setMemorySortArrow("down");
    });
    addListener("memory-sort-arrow", "click", () => {
        setMemorySort(state.sortKey, !state.sortReversed);
        setMemorySortArrow(state.sortReversed ? "up" : "down");
    });
};

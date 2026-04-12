// ES Module imports
import {
    eventId,
    arxivIdFromPaperID,
    copyTextToClipboard,
    copyHyperLinkToClipboard,
    sendMessageToBackground,
    textareaFocusEnd,
    parseTags,
    getPaperEdits,
    cutAuthors,
    delay,
    log,
    info,
    warn,
    arraysIdentical,
} from "@pmu/functions.js";
import {
    findEl,
    slideUp,
    slideDown,
    setHTML,
    setTextId,
    dispatch,
    addListener,
    queryAll,
    hideId,
    showId,
    style,
    val,
    querySelector,
    addEventToClass,
    hasClass,
    addClass,
    removeClass,
    setPlaceholder,
} from "@pmu/miniquery.js";
import { state, select2Options } from "@pmu/config.js";
import {
    setStorage,
    getStorage,
    getDefaultKeyboardAction,
    deletePaperInStorage,
} from "@pmu/data.js";
import { bibtexToString, bibtexToObject } from "@pmu/bibtexParser.js";
import { initSyncAndState } from "@pmu/sync.js";
import { updatePaperVisits, paperToAbs, paperToPDF, makeMdLink } from "@pmu/paper.js";
import { getTagsOptions, sortMemory } from "@pmu/state.js";
import {
    displayMemoryTable,
    openMemory,
    closeMemory,
    focusExistingOrCreateNewURLTab,
    saveFavoriteItem,
    updatePopupPaperNoMemory,
    searchMemoryByTags,
    searchMemory,
    searchMemoryByYear,
    searchMemoryByCode,
    copyAndConfirmMemoryItem,
    updatePaperTags,
    saveNote,
    saveCodeLink,
    toggleTagsCollapse,
    reverseMemory,
    setMemorySortArrow,
    setMemorySearchPlaceholder,
} from "@pm/popup/js/memory.js";
import { showPopupModal, closeMenu } from "@pm/popup/js/popup.js";

/**
 * Closes the popup modal
 */
export const closePopupModal = () => {
    state.modalIsOpen = false;
    style("popup-modal-wrapper", "display", "none");
};

export const hideAllTooltips = () => {
    queryAll(".title-tooltip,#popup-title-tooltip").forEach((el) => {
        hideId(el);
    });
    state.tooltipIsOpen = false;
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

        state.papers[paper.id] = updatePaperVisits(state.papers[paper.id]);
        chrome.storage.local.set({ papers: state.papers });
    });
};

/**
 * Delete a paper ; display a modal first to get uer confirmation
 * @param {string} id Id of the paper to delete
 */
export const showConfirmDeleteModal = (id) => {
    const title = state.papers[id].title;
    setTextId("delete-modal-title", title);
    setHTML("delete-paper-modal-hidden-id", id);
    showId("delete-paper-modal", "flex");
};

/**
 * Monitors the popup's paper edits or the memory's table of papers' edits.
 * Triggers `handleMemorySaveEdits` or `handlePopupSaveEdits` (depending on `isPopup`)
 * if a change is detected.
 *
 * @param {string} id Optional id of the paper to monitor (when called for the popup edit form)
 * @param {boolean} isPopup Whether the function is called to monitor the single
 * popup edit form or the set of memory-items' forms
 */
export const monitorPaperEdits = (id, isPopup) => (e) => {
    let paperId;
    if (typeof id === "undefined") {
        paperId = eventId(e);
    } else {
        paperId = id;
    }
    const edits = getPaperEdits(paperId, isPopup);
    const paper = state.papers[paperId];
    let change = false;
    let refs = {};
    for (const key in edits) {
        const ref = paper[key];
        refs[key] = ref;
        const value = edits[key];
        if (key === "tags") {
            if (!arraysIdentical(ref, value)) change = true;
        } else {
            if (ref !== value) {
                change = true;
            }
        }
    }
    if (change) {
        log("Updating meta data for", paperId);
        if (isPopup) {
            handlePopupSaveEdits(paperId);
        } else {
            handleMemorySaveEdits(paperId);
        }
    }
};

export const displayOnScroll = (isPopup) =>
    delay(() => {
        const { bottom } = findEl({ element: "memory-table" }).getBoundingClientRect();
        const height = isPopup
            ? findEl({ element: "memory-container" }).getBoundingClientRect().height
            : window.innerHeight;
        const currentPapers = state.currentMemoryPagination * state.memoryItemsPerPage;
        if (
            Math.abs(bottom - height) < height &&
            currentPapers < state.papersList.length
        ) {
            state.currentMemoryPagination += 1;
            displayMemoryTable(state.currentMemoryPagination);
        }
    }, 50);

export const handleBackToFocus = (e) => {
    const id = eventId(e);
    setTimeout(() => {
        dispatch(`memory-container--${id}`, "focus");
    }, 250);
};

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
    state.papers[id] = updatePaperVisits(state.papers[id]);
    setStorage("papers", state.papers);
};
export const handleOpenItemAlphaxiv = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const alphaxivURL = `https://alphaxiv.org/abs/${arxivId}`;
    focusExistingOrCreateNewURLTab(alphaxivURL);
    state.papers[id] = updatePaperVisits(state.papers[id]);
    setStorage("papers", state.papers);
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
            state.papers[id] = updatePaperVisits(state.papers[id]);
            setStorage("papers", state.papers);
            closePopupModal();
        });
    } else {
        focusExistingOrCreateNewURLTab(ar5ivURL);
        state.papers[id] = updatePaperVisits(state.papers[id]);
        setStorage("papers", state.papers);
    }
};
export const handleOpenItemHuggingface = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(state.papers[id].id);
    const huggingFaceURL = `https://huggingface.co/papers/${arxivId}`;
    focusExistingOrCreateNewURLTab(huggingFaceURL);
    state.papers[id] = updatePaperVisits(state.papers[id]);
    setStorage("papers", state.papers);
};

export const handleOpenItemCodeLink = async (e) => {
    const id = eventId(e);
    const url = state.papers[id].codeLink;
    await focusExistingOrCreateNewURLTab(url);
};

export const handleOpenItemWebsiteURL = async (e) => {
    const id = eventId(e);
    const url = state.papers[id].pdfLink;
    state.papers[id] = updatePaperVisits(state.papers[id]);
    await setStorage("papers", state.papers);
    await focusExistingOrCreateNewURLTab(url);
};

export const handleCopyMarkdownLink = async (e) => {
    const id = eventId(e);
    const prefs = state.prefs;
    const paper = state.papers[id];
    const text =
        paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
    const md = makeMdLink(paper, prefs);
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: md,
        feedbackText: `Markdown ${text} link copied!`,
        context: state.memoryIsOpen ? "memory" : "popup",
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
        feedbackText: "Bibtex copied!",
        context: state.memoryIsOpen ? "memory" : "popup",
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
        feedbackText: `${text} link copied!`,
        context: state.memoryIsOpen ? "memory" : "popup",
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
        feedbackText: `Hyperlink copied!`,
        hyperLinkTitle: paper.title,
        context: state.memoryIsOpen ? "memory" : "popup",
    });
};

export const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    const isFavorite = hasClass(`memory-container--${id}`, "favorite");
    saveFavoriteItem(id, !isFavorite);
};

export const handleMemoryOpenLocal = (e) => {
    const id = eventId(e);
    const file = state.files[id];
    const paper = state.papers[id];
    state.papers[id] = updatePaperVisits(paper);
    setStorage("papers", state.papers);
    if (file && (file.id || file.id === 0)) {
        chrome.downloads.open(file.id);
    }
    window?.close && window.close();
};

export const handleTextareaFocus = (e) => {
    textareaFocusEnd(e.target);
};

export const handleMemorySaveEdits = (id) => {
    const { note, codeLink } = getPaperEdits(id);

    // Update metadata
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    updatePaperTags(id, "memory-item-tags");
};

export const handleCancelPaperEdit = (e) => {
    e.preventDefault();
    const id = eventId(e);
    const paper = state.papers[id];
    val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }), paper.note);
    setHTML(
        findEl({ paperId: id, memoryItemClass: "memory-item-tags" }),
        getTagsOptions(paper),
    );
    dispatch(findEl({ paperId: id, memoryItemClass: "memory-item-edit" }), "click");
};

export const handleTogglePaperEdit = (e) => {
    e.preventDefault();
    // find elements
    const id = eventId(e);
    const container = findEl({ element: `memory-container--${id}` });
    const codeAndNote = findEl({ paperId: id, memoryItemClass: "code-and-note" });
    const editPaper = findEl({ paperId: id, memoryItemClass: "extended-item" });
    const tagList = findEl({ paperId: id, memoryItemClass: "tag-list" });
    const authors = findEl({ paperId: id, memoryItemClass: "memory-authors" });
    const tagEdit = findEl({ paperId: id, memoryItemClass: "edit-tags" });
    const actions = findEl({ paperId: id, memoryItemClass: "memory-item-actions" });
    const tagSelect2 = $(findEl({ paperId: id, memoryItemClass: "memory-item-tags" }));

    if (hasClass(container, "expand-open")) {
        // The edit form is open
        removeClass(container, "expand-open");
        // Open display elements
        slideDown(codeAndNote, 150);
        slideDown(tagList, 150);
        slideDown(actions, 150);
        slideDown(authors, 150);
        // Close inputs
        slideUp(editPaper, 150);
        slideUp(tagEdit, 150);
        // destroy to enable options update in HTML
        setTimeout(() => {
            tagSelect2.select2("destroy");
        }, 500);
    } else {
        // The edit form is closed
        addClass(container, "expand-open");
        // Enable select2 tags input
        tagSelect2.select2({
            select2Options,
            width: "86%",
        });
        if (!hasClass(container, "has-monitoring")) {
            // only listen for changes once
            tagSelect2.on("change", monitorPaperEdits(id, false));
        }
        // monitorPaperEdits listener has been added
        container.classList.add("has-monitoring");
        // Close display elements
        slideUp(codeAndNote, 150);
        slideUp(tagList, 150);
        slideUp(actions, 150);
        slideUp(authors, 150);
        // Show form
        slideDown(editPaper, 150);
        slideDown(tagEdit, 150);
    }
};

export const handleMemorySelectChange = (e) => {
    const sort = e.target.value;
    state.sortKey = sort;
    sortMemory();
    displayMemoryTable();
    setMemorySortArrow("down");
};

export const handleMemorySortArrow = (e) => {
    if (querySelector("#memory-sort-arrow svg").id === "memory-sort-arrow-down") {
        setMemorySortArrow("up");
    } else {
        setMemorySortArrow("down");
    }
    reverseMemory();
    displayMemoryTable();
};

export const handleFilterFavorites = () => {
    const showFavorites = !state.showFavorites;
    state.showFavorites = showFavorites;
    if (showFavorites) {
        addClass(
            findEl({ element: "filter-favorites" }).querySelector("svg"),
            "favorite",
        );
        sortMemory();
        state.papersList = state.papersList.filter((p) => p.favorite);
        displayMemoryTable();
        setMemorySortArrow("down");
        findEl({
            element: "memory-select",
        }).innerHTML += `<option value="favoriteDate">Last favoured</option>`;
        setMemorySearchPlaceholder();
    } else {
        removeClass(
            findEl({ element: "filter-favorites" }).querySelector("svg"),
            "favorite",
        );

        if (val("memory-select") === "favoriteDate") {
            val("memory-select", "lastOpenDate");
            state.sortKey = "lastOpenDate";
        }
        querySelector(`#memory-select option[value="favoriteDate"]`).remove();
        sortMemory();
        setMemorySortArrow("down");

        if (val("memory-search").trim()) {
            dispatch("memory-search", "keypress");
        } else {
            state.papersList = state.sortedPapers;
            displayMemoryTable();
        }
        setMemorySearchPlaceholder();
    }
};

export const handleMemorySearchKeyPress = (allowEmptySearch) => (e) => {
    // read input, return if empty (after trim)
    const query = val("memory-search").trim();

    log(query);

    if (!query) {
        setTimeout(() => {
            style("memory-search-clear-icon", "visibility", "hidden");
        }, 0);
    }

    if (!query) {
        if (state.papersList.length !== state.sortedPapers.length) {
            // empty query but not all papers are displayed
            state.papersList = state.sortedPapers;
            displayMemoryTable();
            return;
        }
        if (!allowEmptySearch && e.key !== "Backspace") {
            return;
        }
    }
    style("memory-search-clear-icon", "visibility", "visible");
    if (query.startsWith("t:")) {
        // look into tags
        searchMemoryByTags(query);
    } else if (query.startsWith("c:")) {
        // look into code links
        searchMemoryByCode(query);
    } else if (query.startsWith("y:")) {
        // look into publication year
        searchMemoryByYear(query);
    } else {
        // look into title & authors & notes & conf
        searchMemory(query);
    }
    // display filtered papers
    toggleTagsCollapse(query.startsWith("t:"));
    displayMemoryTable();
};

export const handleMemorySearchKeyUp = (e) => {
    // keyup because keypress does not listen to backspaces
    if (e.key == "Backspace") {
        var backspaceEvent = new Event("keypress");
        backspaceEvent.key = "Backspace";
        dispatch("memory-search", backspaceEvent);
    }
    if (e.target.id === "memory-search") {
        dispatch("memory-search", "keypress");
    }
};

export const handleCancelModalClick = () => {
    hideId("delete-paper-modal");
};

export const handleConfirmDeleteModalClick = async (e) => {
    const id = findEl({ element: "delete-paper-modal-hidden-id" }).innerHTML;
    const title = state.papers[id].title;
    const url = state.papers[id].pdfLink;
    await deletePaperInStorage(id, state.papers);
    displayMemoryTable();
    hideId("delete-paper-modal");
    info(`Successfully deleted "${title}" (${id}) from PaperMemory`);
    if (state.currentId === id) {
        await updatePopupPaperNoMemory(url);
    }
    setPlaceholder("memory-search", `Search ${state.papersList.length} entries ...`);
    addListener("memory-switch", "click", handleMemorySwitchClick);
};

export const handleTagClick = (e) => {
    const tagEl = e.target;
    const query = tagEl.textContent;
    val("memory-search", `t: ${query}`);
    dispatch("memory-search", "keypress");
};

export const handleClearSearch = (e) => {
    val("memory-search", "");
    dispatch("memory-search", "clear-search");
    style("memory-search-clear-icon", "visibility", "hidden");
};

export const handleMemorySwitchClick = () => {
    state.memoryIsOpen ? closeMemory() : openMemory();
};

export const handlePopupKeydown = async (e) => {
    let key = e.key;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isEnter = key === "Enter" && !isCtrlOrMeta;
    const isCmdEnter = key === "Enter" && isCtrlOrMeta;
    if (isCtrlOrMeta && !isCmdEnter) return;
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
        ].indexOf(key) < 0
    ) {
        return;
    }

    if (state.modalIsOpen) {
        if (key === "Escape") {
            e.preventDefault();
            closePopupModal();
        }
        return;
    }

    // no modal is open

    if (state.prefsIsOpen) {
        if (key === "Escape") {
            // escape closes menu
            e.preventDefault();
            closeMenu();
        } else if (key === "Enter") {
            let el = querySelector("#menu-switch:focus");
            if (el) closeMenu();
        }
        return;
    }

    if (isCmdEnter) {
        if (eventId(e)) {
            const id = eventId(e);
            const div = findEl({ paperId: id, memoryItemClass: "extended-item" });
            const isVisible = div.style.display !== "none";
            const doneButton = div.querySelector(".done-note-form");
            if (doneButton && isVisible) {
                doneButton.click();
            }
        }
    }

    // Menu is closed

    const inputIsFocused = queryAll(":focus").some((el) =>
        ["INPUT", "TEXTAREA"].includes(el.tagName),
    );
    if (inputIsFocused && key !== "Escape") {
        return;
    }

    // no input is focused

    if (key === "Escape" && state.tooltipIsOpen) {
        handleHideAllTitleTooltips(e);
        e.preventDefault();
        return;
    }

    // no tooltip is open

    if (!state.memoryIsOpen) {
        if (key === "a") {
            // a opens the arxiv memory
            state.papers && dispatch("memory-switch", "click");
        } else if (key === "Enter") {
            // enter on the arxiv memory button opens it
            const focused = querySelector(":focus");
            // if (!focused || !focused.length < 1) return;
            if (focused?.id === "memory-switch-open") {
                return dispatch("memory-switch", "click");
            } else if (focused?.id === "menu-switch") {
                dispatch("menu-switch", "click");
                return dispatch("menu-switch", "blur");
            } else if (hasClass(focused, "memory-item-svg-div")) {
                return dispatch(focused, "click");
            }
        } else if (key === "p") {
            if (!state.prefsIsOpen) {
                return dispatch("menu-switch", "click");
            }
        }
    }

    // Memory is open

    if (isEnter) {
        // enable Enter on favorites and sort arrows
        const favoriteBtn = querySelector("#filter-favorites:focus");
        if (favoriteBtn) {
            return dispatch("filter-favorites", "click");
        }
        const arrowBtn = querySelector("#memory-sort-arrow:focus");
        if (arrowBtn) {
            return dispatch("memory-sort-arrow", "click");
        }
    }

    // Memory is open and Enter was not pressed on a button

    let id, paperItem;
    if (state.currentId && !state.memoryIsOpen) {
        id = state.currentId;
    } else {
        paperItem = querySelector(".memory-container:focus");
        if (key !== "Escape") {
            if (!paperItem) return;
            id = paperItem.id.split("--")[1];
        }
    }

    if (isEnter) {
        key = await getDefaultKeyboardAction();
    }

    const localFindEl = ({ id, memoryItemClass, paperItem }) => {
        if (paperItem) {
            // memory select
            return findEl({ paperId: id, memoryItemClass });
        } else {
            // popup select
            return findEl({ element: `popup-${memoryItemClass}--${id}` });
        }
    };

    if (key === "Backspace") {
        // delete
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-delete" }),
            "click",
        );
    } else if (key === "o") {
        // open paper
        const target =
            state.papers[id].source === "website"
                ? localFindEl({ id, paperItem, memoryItemClass: "memory-website-url" })
                : (state.prefs.checkEnterLocalPdf &&
                      localFindEl({
                          id,
                          paperItem,
                          memoryItemClass: "memory-item-openLocal",
                      })) ||
                  localFindEl({ id, paperItem, memoryItemClass: "memory-item-link" });
        dispatch(target, "click");
    } else if (key === "Escape") {
        // close paper edits or memory
        if (paperItem && hasClass(paperItem, "expand-open")) {
            e.preventDefault();
            handleTogglePaperEdit(e);
        } else {
            if (state.memoryIsOpen) {
                e.preventDefault();
                closeMemory();
            }
        }
    } else if (key === "e") {
        // edit item
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-edit" }),
            "click",
        );
    } else if (key === "c") {
        // copy link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-copy-link" }),
            "click",
        );
    } else if (key === "m") {
        // copy link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-md" }),
            "click",
        );
    } else if (key === "b") {
        // copy bibtex
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-bibtex" }),
            "click",
        );
    } else if (key === "5") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-ar5iv" }),
            "click",
        );
    } else if (key === "x") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-alphaxiv" }),
            "click",
        );
    } else if (key === "f") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-huggingface" }),
            "click",
        );
    } else if (key === "s") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-scirate" }),
            "click",
        );
    } else if (key === "h") {
        // copy hyperlink
        dispatch(
            localFindEl({
                id,
                paperItem,
                memoryItemClass: "memory-item-copy-hyperlink",
            }),
            "click",
        );
    } else if (key === "t") {
        // copy title
        const title = state.papers[id].title;
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: title,
            feedbackText: "Title copied!",
            context: Boolean(paperItem) ? "memory" : "popup",
        });
    } else if (key === "d") {
        // display id
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-display-id" }),
            "click",
        );
    }
};

export const handlePrefsCheckChange = async (e) => {
    const key = e.target.id;
    const checked = findEl({ element: key }).checked;
    if (state && state.prefs) {
        state.prefs[key] = checked;
        setStorage("prefs", state.prefs, function () {
            log(`Settings saved for ${key} (${checked})`);
        });
    } else {
        const prefs = (await getStorage("prefs")) ?? {};
        prefs[key] = checked;
        setStorage("prefs", prefs, function () {
            log(`Settings saved for ${key} (${checked})`);
        });
    }
    if (checked && key === "checkNoAuto") {
        chrome.commands.getAll((commands) => {
            const { shortcut } = commands.find(
                (command) => command.name === "manualParsing",
            );
            console.log("shortcut: ", shortcut);
            if (!shortcut) {
                showPopupModal("manualParsing");
            }
        });
    }
};

export const handlePopupSaveEdits = (id) => {
    const { note, codeLink, favorite } = getPaperEdits(id, true);
    updatePaperTags(id, `#popup-item-tags--${id}`);
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    saveFavoriteItem(id, favorite);
};

export const handlePopupDeletePaper = (id) => () => {
    showConfirmDeleteModal(id);
};

export const showTitleTooltip = (id, isPopup) => {
    const div = isPopup
        ? findEl({ element: "popup-title-tooltip" })
        : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
    if (!div) return;
    hideAllTooltips();
    state.tooltipIsOpen = true;
    showId(div);
};
export const hideTitleTooltip = (id, isPopup) => {
    const div = isPopup
        ? findEl({ element: "popup-title-tooltip" })
        : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
    if (!div) return;
    hideId(div);
    state.tooltipIsOpen = false;
};

export const getHandleTitleTooltip = (func, delay, isPopup) => {
    return (e) => {
        const id = isPopup ? state.currentId : eventId(e);
        let timerId = state.timerIdMap.get(e.target) ?? 0;
        clearTimeout(timerId);
        timerId = setTimeout(() => func(id, isPopup), delay);
        state.timerIdMap.set(e.target, timerId);
    };
};

export const handleExpandAuthors = (e) => {
    let id, authorsEl;
    if (e.target.parentElement?.id === "popup-authors") {
        id = state.currentId;
        authorsEl = findEl({ element: "popup-authors" });
    } else {
        id = eventId(e);
        authorsEl = findEl({ paperId: id, memoryItemClass: "memory-authors" });
    }
    setHTML(authorsEl, cutAuthors(state.papers[id].author, 100000));
};

export const handleHideAllTitleTooltips = (e) => {
    if (!e.composedPath().some((el) => el.classList?.contains("title-tooltip"))) {
        hideAllTooltips();
    }
};

/**
 * Sets the form edit listeners on the 4 inputs: tags, code, note, favorite
 * @param {string} id Optional id (for the popup's paper)
 * @param {*} isPopup Is the function called from the popup?
 */
export const setFormChangeListener = (id, isPopup) => {
    let refTags, refNote, refCodeLink, refFavorite;
    if (isPopup) {
        refTags = `#popup-item-tags--${id.replace(".", "\\.")}`;
        refCodeLink = `popup-form-codeLink--${id}`;
        refNote = `popup-form-note-textarea--${id}`;
        refFavorite = `checkFavorite--${id}`;

        $(refTags).on("change", delay(monitorPaperEdits(id, isPopup), 300)); // select2 required
        addListener(refCodeLink, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
        addListener(refNote, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
        addListener(refFavorite, "change", delay(monitorPaperEdits(id, isPopup), 300));
    } else {
        // tags listeners is set in handleTogglePaperEdit
        refTags = ".memory-item-tags";
        refCodeLink = ".form-code-input";
        refNote = ".form-note-textarea";

        addEventToClass(
            refCodeLink,
            "keyup",
            delay(monitorPaperEdits(undefined, isPopup), 300),
        );
        addEventToClass(
            refNote,
            "keyup",
            delay(monitorPaperEdits(undefined, isPopup), 300),
        );
    }
};

export const addEventsToMemoryItems = () => {
    // Add events
    // after a click on such a button, the focus returns to the
    // container to navigate with tab
    addEventToClass(".back-to-focus", "click", handleBackToFocus);
    // delete memory item
    addEventToClass(".memory-delete", "click", handleDeleteItem);
    // Open paper page
    addEventToClass(".memory-item-link", "click", handleOpenItemLink);
    // Open on Scirate
    addEventToClass(".memory-item-scirate", "click", handleOpenItemScirate);
    // Open on Alphaxiv
    addEventToClass(".memory-item-alphaxiv", "click", handleOpenItemAlphaxiv);
    // Open on Ar5iv
    addEventToClass(".memory-item-ar5iv", "click", handleOpenItemAr5iv);
    // Open on Huggingface Papers
    addEventToClass(".memory-item-huggingface", "click", handleOpenItemHuggingface);
    // Open code page
    addEventToClass(".memory-code-link", "click", handleOpenItemCodeLink);
    // Open Website URL
    addEventToClass(".memory-website-url", "click", handleOpenItemWebsiteURL);
    // Copy markdown link
    addEventToClass(".memory-item-md", "click", handleCopyMarkdownLink);
    // Copy bibtex citation
    addEventToClass(".memory-item-bibtex", "click", handleCopyBibtex);
    // Copy pdf link
    addEventToClass(".memory-item-copy-link", "click", handleCopyPDFLink);
    // Copy hyperlink
    addEventToClass(".memory-item-copy-hyperlink", "click", handleCopyHyperLink);
    // Open local file
    addEventToClass(".memory-item-openLocal", "click", handleMemoryOpenLocal);
    // Add to favorites
    addEventToClass(".memory-item-favorite", "click", handleAddItemToFavorites);
    // Cancel edits: bring previous values from state back
    addEventToClass(".done-note-form", "click", handleCancelPaperEdit);
    // When clicking on the edit button, either open or close the edit form
    addEventToClass(".memory-item-edit", "click", handleTogglePaperEdit);
    // When clicking on a tag, search for it
    addEventToClass(".memory-tag", "click", handleTagClick);
    // Monitor form changes
    setFormChangeListener(undefined, false);
    // show / remove title tooltips
    addEventToClass(
        ".memory-display-id",
        "click",
        getHandleTitleTooltip(showTitleTooltip, 0),
    );
    addEventToClass(
        ".memory-display-id",
        "mouseleave",
        getHandleTitleTooltip(hideTitleTooltip, 10000),
    );
    // expand authorlist on click
    addEventToClass(".expand-paper-authors", "click", handleExpandAuthors);

    // Put cursor at the end of the textarea's text on focus
    // (default puts the cursor at the beginning of the text)
    addEventToClass(".form-note-textarea", "focus", handleTextareaFocus);
};

export const addEventsToMemoryControls = () => {
    // Calculate delay time based on number of papers
    let delayTime = 300;
    if (state.papersList.length < 20) {
        delayTime = 0;
    } else if (state.papersList.length < 100) {
        delayTime = 150;
    }

    addListener(
        "memory-search",
        "keypress",
        delay(handleMemorySearchKeyPress(), delayTime),
    );
    addListener("memory-search", "clear-search", handleMemorySearchKeyPress(true));
    addListener("memory-search", "keyup", handleMemorySearchKeyUp);
    addListener("delete-paper-modal-cancel-button", "click", handleCancelModalClick);
    addListener(
        "delete-paper-modal-confirm-button",
        "click",
        handleConfirmDeleteModalClick,
    );
    addListener("filter-favorites", "click", handleFilterFavorites);
    // listen to sorting feature change
    addListener("memory-select", "change", handleMemorySelectChange);
    // listen to sorting direction change
    addListener("memory-sort-arrow", "click", handleMemorySortArrow);
    addListener("memory-container", "scroll", displayOnScroll(true));
};

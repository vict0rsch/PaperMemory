const handleBackToFocus = (e) => {
    const id = eventId(e);
    setTimeout(() => {
        dispatch(`memory-container--${id}`, "focus");
    }, 250);
};

const handleDeleteItem = (e) => {
    const id = eventId(e);
    showConfirmDeleteModal(id);
};

const handleOpenItemLink = (e) => {
    const id = eventId(e);
    focusExistingOrCreateNewPaperTab(global.state.papers[id], true);
};
const handleOpenItemScirate = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(global.state.papers[id].id);
    const scirateURL = `https://scirate.com/arxiv/${arxivId}`;
    focusExistingOrCreateNewURLTab(scirateURL);
    global.state.papers[id] = updatePaperVisits(global.state.papers[id]);
    setStorage("papers", global.state.papers);
};
const handleOpenItemAlphaxiv = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(global.state.papers[id].id);
    const alphaxivURL = `https://alphaxiv.org/abs/${arxivId}`;
    focusExistingOrCreateNewURLTab(alphaxivURL);
    global.state.papers[id] = updatePaperVisits(global.state.papers[id]);
    setStorage("papers", global.state.papers);
};
const handleOpenItemAr5iv = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(global.state.papers[id].id);
    const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
    focusExistingOrCreateNewURLTab(ar5ivURL);
    global.state.papers[id] = updatePaperVisits(global.state.papers[id]);
    setStorage("papers", global.state.papers);
};
const handleOpenItemHuggingface = (e) => {
    const id = eventId(e);
    const arxivId = arxivIdFromPaperID(global.state.papers[id].id);
    const huggingFaceURL = `https://huggingface.co/papers/${arxivId}`;
    focusExistingOrCreateNewURLTab(huggingFaceURL);
    global.state.papers[id] = updatePaperVisits(global.state.papers[id]);
    setStorage("papers", global.state.papers);
};

const handleOpenItemCodeLink = async (e) => {
    const id = eventId(e);
    const url = global.state.papers[id].codeLink;
    await focusExistingOrCreateNewURLTab(url);
};

const handleOpenItemWebsiteURL = async (e) => {
    const id = eventId(e);
    const url = global.state.papers[id].pdfLink;
    global.state.papers[id] = updatePaperVisits(global.state.papers[id]);
    await setStorage("papers", global.state.papers);
    await focusExistingOrCreateNewURLTab(url);
};

const handleCopyMarkdownLink = async (e) => {
    const id = eventId(e);
    const prefs = global.state.prefs;
    const paper = global.state.papers[id];
    const text =
        paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
    const md = makeMdLink(paper, prefs);
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: md,
        feedbackText: `Markdown ${text} link copied!`,
    });
};

const handleCopyBibtex = async (e) => {
    const id = eventId(e);
    const bibtex = global.state.papers[id].bibtex;
    let bibobj = bibtexToObject(bibtex);
    if (!bibobj.hasOwnProperty("url")) {
        bibobj.url = paperToAbs(global.state.papers[id]);
    }
    if (!bibobj.hasOwnProperty("pdf") && global.state.papers[id].source !== "website") {
        bibobj.pdf = paperToPDF(global.state.papers[id]);
    }
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: bibtexToString(bibobj),
        feedbackText: "Bibtex copied!",
    });
};

const handleCopyPDFLink = async (e) => {
    const id = eventId(e);
    const prefs = global.state.prefs;
    const paper = global.state.papers[id];
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    const text =
        paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: link,
        feedbackText: `${text} link copied!`,
    });
};

const handleCopyHyperLink = async (e) => {
    const id = eventId(e);
    const prefs = global.state.prefs;
    const paper = global.state.papers[id];
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    await copyAndConfirmMemoryItem({
        id,
        textToCopy: link,
        feedbackText: `Hyperlink copied!`,
        hyperLinkTitle: paper.title,
    });
};

const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    const isFavorite = hasClass(`memory-container--${id}`, "favorite");
    saveFavoriteItem(id, !isFavorite);
};

const handleMemoryOpenLocal = (e) => {
    const id = eventId(e);
    const file = global.state.files[id];
    const paper = global.state.papers[id];
    global.state.papers[id] = updatePaperVisits(paper);
    setStorage("papers", global.state.papers);
    if (file && (file.id || file.id === 0)) {
        chrome.downloads.open(file.id);
    }
    window?.close && window.close();
};

const handleTextareaFocus = () => {
    var that = this;
    textareaFocusEnd(that);
};

const handleMemorySaveEdits = (id) => {
    const { note, codeLink } = getPaperEdits(id);

    // Update metadata
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    updatePaperTags(id, "memory-item-tags");
};

const handleCancelPaperEdit = (e) => {
    e.preventDefault();
    const id = eventId(e);
    const paper = global.state.papers[id];
    val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }), paper.note);
    setHTML(
        findEl({ paperId: id, memoryItemClass: "memory-item-tags" }),
        getTagsOptions(paper)
    );
    dispatch(findEl({ paperId: id, memoryItemClass: "memory-item-edit" }), "click");
};

const handleTogglePaperEdit = (e) => {
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
            ...global.select2Options,
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

const handleMemorySelectChange = (e) => {
    const sort = e.target.value;
    global.state.sortKey = sort;
    sortMemory();
    displayMemoryTable();
    setMemorySortArrow("down");
};

const handleMemorySortArrow = (e) => {
    if (querySelector("#memory-sort-arrow svg").id === "memory-sort-arrow-down") {
        setMemorySortArrow("up");
    } else {
        setMemorySortArrow("down");
    }
    reverseMemory();
    displayMemoryTable();
};

const handleFilterFavorites = () => {
    const showFavorites = !global.state.showFavorites;
    global.state.showFavorites = showFavorites;
    if (showFavorites) {
        addClass(
            findEl({ element: "filter-favorites" }).querySelector("svg"),
            "favorite"
        );
        sortMemory();
        global.state.papersList = global.state.papersList.filter((p) => p.favorite);
        displayMemoryTable();
        setMemorySortArrow("down");
        findEl(
            "memory-select"
        ).innerHTML += `<option value="favoriteDate">Last favoured</option>`;
        const n = global.state.papersList.length;
        setPlaceholder("memory-search", `Search ${n} entries...`);
    } else {
        removeClass(
            findEl({ element: "filter-favorites" }).querySelector("svg"),
            "favorite"
        );

        if (val("memory-select") === "favoriteDate") {
            val("memory-select", "lastOpenDate");
            global.state.sortKey = "lastOpenDate";
        }
        querySelector(`#memory-select option[value="favoriteDate"]`).remove();
        sortMemory();
        setMemorySortArrow("down");

        if (val("memory-search").trim()) {
            dispatch("memory-search", "keypress");
        } else {
            global.state.papersList = global.state.sortedPapers;
            displayMemoryTable();
        }
        const n = global.state.sortedPapers.length;
        setPlaceholder("memory-search", `Search ${n} entries...`);
    }
};

const handleMemorySearchKeyPress = (allowEmptySearch) => (e) => {
    // read input, return if empty (after trim)
    const query = val("memory-search").trim();

    log(query);

    if (!query) {
        setTimeout(() => {
            style("memory-search-clear-icon", "visibility", "hidden");
        }, 0);
    }

    if (!query) {
        if (global.state.papersList.length !== global.state.sortedPapers.length) {
            // empty query but not all papers are displayed
            global.state.papersList = global.state.sortedPapers;
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

const handleMemorySearchKeyUp = (e) => {
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

const handleCancelModalClick = () => {
    hideId("delete-paper-modal");
};

const handleConfirmDeleteModalClick = async (e) => {
    const id = findEl({ element: "delete-paper-modal-hidden-id" }).innerHTML;
    const title = global.state.papers[id].title;
    const url = global.state.papers[id].pdfLink;
    await deletePaperInStorage(id, global.state.papers);
    displayMemoryTable();
    hideId("delete-paper-modal");
    info(`Successfully deleted "${title}" (${id}) from PaperMemory`);
    if (global.state.currentId === id) {
        await updatePopupPaperNoMemory(url);
    }
    setPlaceholder(
        "memory-search",
        `Search ${global.state.papersList.length} entries ...`
    );
    addListener("memory-switch", "click", handleMemorySwitchClick);
};

const handleTagClick = (e) => {
    const tagEl = e.target;
    const query = tagEl.textContent;
    val("memory-search", `t: ${query}`);
    dispatch("memory-search", "keypress");
};

const handleClearSearch = (e) => {
    val("memory-search", "");
    dispatch("memory-search", "clear-search");
    style("memory-search-clear-icon", "visibility", "hidden");
};

const handleMemorySwitchClick = () => {
    global.state.memoryIsOpen ? closeMemory() : openMemory();
};

const handlePopupKeydown = async (e) => {
    let key = e.key;
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    const isEnter = key === "Enter" && !isCtrlOrMeta;
    const isCmdEnter = key === "Enter" && isCtrlOrMeta;
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

    if (global.state.modalIsOpen) {
        if (key === "Escape") {
            e.preventDefault();
            closePopupModal();
        }
        return;
    }

    // no modal is open

    if (global.state.prefsIsOpen) {
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
            const doneButton = div.querySelector(".cancel-note-form");
            if (doneButton && isVisible) {
                doneButton.click();
            }
        }
    }

    // Menu is closed

    const inputIsFocused = queryAll(":focus").some((el) =>
        ["INPUT", "TEXTAREA"].includes(el.tagName)
    );
    if (inputIsFocused && key !== "Escape") {
        return;
    }

    // no input is focused

    if (key === "Escape" && global.state.tooltipIsOpen) {
        handleHideAllTitleTooltips(e);
        e.preventDefault();
        return;
    }

    // no tooltip is open

    if (!global.state.memoryIsOpen) {
        if (key === "a") {
            // a opens the arxiv memory
            global.state.papers && dispatch("memory-switch", "click");
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
            if (!global.state.prefsIsOpen) {
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
    if (global.state.currentId && !global.state.memoryIsOpen) {
        id = global.state.currentId;
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
            "click"
        );
    } else if (key === "o") {
        // open paper
        const target =
            global.state.papers[id].source === "website"
                ? localFindEl({ id, paperItem, memoryItemClass: "memory-website-url" })
                : (global.state.prefs.checkEnterLocalPdf &&
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
            if (global.state.memoryIsOpen) {
                e.preventDefault();
                closeMemory();
            }
        }
    } else if (key === "e") {
        // edit item
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-edit" }),
            "click"
        );
    } else if (key === "c") {
        // copy link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-copy-link" }),
            "click"
        );
    } else if (key === "m") {
        // copy link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-md" }),
            "click"
        );
    } else if (key === "b") {
        // copy bibtex
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-bibtex" }),
            "click"
        );
    } else if (key === "5") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-ar5iv" }),
            "click"
        );
    } else if (key === "x") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-alphaxiv" }),
            "click"
        );
    } else if (key === "f") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-huggingface" }),
            "click"
        );
    } else if (key === "s") {
        // copy pdf link
        dispatch(
            localFindEl({ id, paperItem, memoryItemClass: "memory-item-scirate" }),
            "click"
        );
    } else if (key === "h") {
        // copy hyperlink
        dispatch(
            localFindEl({
                id,
                paperItem,
                memoryItemClass: "memory-item-copy-hyperlink",
            }),
            "click"
        );
    } else if (key === "t") {
        // copy title
        const title = global.state.papers[id].title;
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
            "click"
        );
    }
};

const handlePrefsCheckChange = async (e) => {
    const key = e.target.id;
    const checked = findEl({ element: key }).checked;
    if (global.state && global.state.prefs) {
        global.state.prefs[key] = checked;
        setStorage("prefs", global.state.prefs, function () {
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
                (command) => command.name === "manualParsing"
            );
            console.log("shortcut: ", shortcut);
            if (!shortcut) {
                showPopupModal("manualParsing");
            }
        });
    }
};

const handlePopupSaveEdits = (id) => {
    const { note, codeLink, favorite } = getPaperEdits(id, true);
    updatePaperTags(id, `#popup-item-tags--${id}`);
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    saveFavoriteItem(id, favorite);
};

const handlePopupDeletePaper = (id) => () => {
    showConfirmDeleteModal(id);
};

const showTitleTooltip = (id, isPopup) => {
    const div = isPopup
        ? findEl({ element: "popup-title-tooltip" })
        : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
    if (!div) return;
    hideAllTooltips();
    global.state.tooltipIsOpen = true;
    showId(div);
};
const hideTitleTooltip = (id, isPopup) => {
    const div = isPopup
        ? findEl({ element: "popup-title-tooltip" })
        : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
    if (!div) return;
    hideId(div);
    global.state.tooltipIsOpen = false;
};

const getHandleTitleTooltip = (func, delay, isPopup) => {
    return (e) => {
        const id = isPopup ? global.state.currentId : eventId(e);
        let timerId = global.state.timerIdMap.get(e.target) ?? 0;
        clearTimeout(timerId);
        timerId = setTimeout(() => func(id, isPopup), delay);
        global.state.timerIdMap.set(e.target, timerId);
    };
};

const handleExpandAuthors = (e) => {
    let id, authorsEl;
    if (e.target.parentElement?.id === "popup-authors") {
        id = global.state.currentId;
        authorsEl = findEl({ element: "popup-authors" });
    } else {
        id = eventId(e);
        authorsEl = findEl({ paperId: id, memoryItemClass: "memory-authors" });
    }
    setHTML(authorsEl, cutAuthors(global.state.papers[id].author, 100000));
};

const handleHideAllTitleTooltips = (e) => {
    if (!e.composedPath().some((el) => el.classList?.contains("title-tooltip"))) {
        hideAllTooltips();
    }
};

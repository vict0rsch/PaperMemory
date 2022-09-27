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

const handleOpenItemCodeLink = (e) => {
    const id = eventId(e);
    const url = global.state.papers[id].codeLink;
    focusExistingOrCreateNewCodeTab(url);
};

const handleCopyMarkdownLink = async (e) => {
    const id = eventId(e);
    const prefs = global.state.prefs;
    const text = prefs.checkPreferPdf ? "PDF" : "Abstract";
    const paper = global.state.papers[id];
    const md = makeMdLink(paper, prefs);
    copyAndConfirmMemoryItem(id, md, `Markdown ${text} link copied!`);
};

const handleCopyBibtex = (e) => {
    const id = eventId(e);
    const bibtex = global.state.papers[id].bibtex;
    copyAndConfirmMemoryItem(id, bibtexToString(bibtex), "Bibtex copied!");
};

const handleCopyPDFLink = async (e) => {
    const id = eventId(e);
    const prefs = global.state.prefs;
    const paper = global.state.papers[id];
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    const text = prefs.checkPreferPdf ? "PDF" : "Abstract";
    copyAndConfirmMemoryItem(id, link, `${text} link copied!`);
};

const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    const isFavorite = hasClass(`memory-container--${id}`, "favorite");
    saveFavoriteItem(id, !isFavorite);
};

const handleMemoryOpenLocal = (e) => {
    const id = eventId(e);
    const file = global.state.files[id];
    if (file && (file.id || file.id === 0)) {
        chrome.downloads.open(file.id);
    }
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
    val(findEl(id, "form-note-textarea"), paper.note);
    setHTML(findEl(id, "memory-item-tags"), getTagsOptions(paper));
    dispatch(findEl(id, "memory-item-edit"), "click");
};

const handleTogglePaperEdit = (e) => {
    e.preventDefault();
    // find elements
    const id = eventId(e);
    const container = findEl(`memory-container--${id}`);
    const codeAndNote = findEl(id, "code-and-note");
    const editPaper = findEl(id, "extended-item");
    const tagList = findEl(id, "tag-list");
    const authors = findEl(id, "memory-authors");
    const tagEdit = findEl(id, "edit-tags");
    const actions = findEl(id, "memory-item-actions");
    const tagSelect2 = $(findEl(id, "memory-item-tags"));

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
    if (
        document.querySelector("#memory-sort-arrow svg").id === "memory-sort-arrow-down"
    ) {
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
        addClass(findEl("filter-favorites").querySelector("svg"), "favorite");
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
        removeClass(findEl("filter-favorites").querySelector("svg"), "favorite");

        if (val("memory-select") === "favoriteDate") {
            val("memory-select", "lastOpenDate");
            global.state.sortKey = "lastOpenDate";
        }
        document.querySelector(`#memory-select option[value="favoriteDate"]`).remove();
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
    const id = findEl("delete-paper-modal-hidden-id").innerHTML;
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

const handlePopupKeydown = (e) => {
    const key = e.key;
    if (["Backspace", "Enter", "Escape", "a", "e"].indexOf(key) < 0) {
        return;
    }

    if (global.state.prefsIsOpen) {
        if (key === "Escape") {
            // escape closes menu
            e.preventDefault();
            closeMenu();
        } else if (key === "Enter") {
            let el = document.querySelector("#menu-switch:focus");
            if (el) closeMenu();
        }
        return;
    }

    if (!global.state.memoryIsOpen) {
        if (key === "a") {
            // a opens the arxiv memory
            const focused = queryAll(document, ":focus");
            if (focused && focused.length) {
                if (focused.some((el) => hasClass(el, "noMemoryOnA"))) {
                    return;
                }
            }
            global.state.papers && dispatch("memory-switch", "click");
        } else if (key === "Enter") {
            // enter on the arxiv memory button opens it
            let focused = document.querySelector(":focus");
            // if (!focused || !focused.length < 1) return;
            if (focused.id === "memory-switch-open") {
                dispatch("memory-switch", "click");
            } else if (focused.id === "menu-switch") {
                dispatch("menu-switch", "click");
                dispatch("menu-switch", "blur");
            } else if (hasClass(focused, "memory-item-svg-div")) {
                dispatch(focused, "click");
            }
        }
        return;
    }

    // Now memory is open

    if (key === "Enter") {
        // enable Enter on favorites and sort arrows
        const favoriteBtn = document.querySelector("#filter-favorites:focus");
        if (favoriteBtn) {
            dispatch("filter-favorites", "click");
            return;
        }
        const arrowBtn = document.querySelector("#memory-sort-arrow:focus");
        if (arrowBtn && key === "Enter") {
            dispatch("memory-sort-arrow", "click");
            return;
        }
    }

    let id;
    const paperItem = document.querySelector(".memory-container:focus");
    if (key !== "Escape") {
        if (!paperItem) return;
        id = paperItem.id.split("--")[1];
    }

    if (key === "Backspace") {
        // delete
        dispatch(findEl(id, "memory-delete"), "click");
    } else if (key === "Enter") {
        // open paper
        dispatch(findEl(id, "memory-item-link"), "click");
    } else if (key === "Escape") {
        // close memory
        e.preventDefault();
        if (paperItem && hasClass(paperItem, "expand-open")) {
            handleTogglePaperEdit(e);
        } else {
            closeMemory();
        }
    } else if (key === "e") {
        // edit item
        dispatch(findEl(id, "memory-item-edit"), "click");
    }
};

const handlePrefsCheckChange = async (e) => {
    const key = e.target.id;
    const checked = findEl(key).checked;
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

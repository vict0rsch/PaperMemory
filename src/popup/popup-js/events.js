const addEventToClass = (className, eventName, fn) => {
    document.querySelectorAll(className).forEach((el) => {
        el.addEventListener(eventName, fn);
    });
};

const handleBackToFocus = (e) => {
    const id = eventId(e);
    setTimeout(() => {
        document
            .getElementById(`memory-item-container--${id}`)
            .dispatchEvent(new Event("focus"));
    }, 250);
};

const handleDeleteItem = (e) => {
    const id = eventId(e);
    confirmDelete(id);
};

const handleOpenItemLink = (e) => {
    const id = eventId(e);
    focusExistingOrCreateNewPaperTab(_state.papers[id]);
};

const handleOpenItemCodeLink = (e) => {
    const id = eventId(e);
    const url = _state.papers[id].codeLink;
    focusExistingOrCreateNewCodeTab(url);
};

const handleCopyMarkdownLink = (e) => {
    const id = eventId(e);
    const md = _state.papers[id].md;
    copyAndConfirmMemoryItem(id, md, "Markdown link copied!");
};

const handleCopyBibtex = (e) => {
    const id = eventId(e);
    const bibtext = _state.papers[id].bibtext;
    copyAndConfirmMemoryItem(id, bibtext, "Bibtex copied!");
};

const handleCopyPDFLink = (e) => {
    const id = eventId(e);
    const pdfLink = _state.papers[id].pdfLink;
    copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!");
};

const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    const isFavorite = hasClass(`memory-item-container--${id}`, "favorite");
    saveFavoriteItem(id, !isFavorite);
};

const handleTextareaFocus = () => {
    var that = this;
    textareaFocusEnd(that);
};

const handleEditPaperFormSubmit = (e) => {
    e.preventDefault();

    // Get content
    const id = eventId(e);
    const { note, codeLink } = getPaperEdits(id);

    // Update metadata
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    updatePaperTags(id, "memory-item-tags");

    // Close edit form
    dispatch(findEl(id, "memory-item-edit"), "click");
    findEl(id, "memory-item-save-edits").disabled = true;
};

const handleCancelPaperEdit = (e) => {
    e.preventDefault();
    const id = eventId(e);
    const paper = _state.papers[id];
    val(findEl(id, "form-note-textarea"), paper.note);
    setHTMLEl(findEl(id, "memory-item-tags"), getTagsHTMLOptions(paper));
    dispatch(findEl(id, "memory-item-edit"), "click");
    findEl(id, "memory-item-save-edits").disabled = true;
};

const handleTogglePaperEdit = (e) => {
    e.preventDefault();
    // find elements
    const id = eventId(e);
    const edit = findEl(id, "memory-item-edit");

    const codeAndNote = $(findEl(id, "code-and-note"));
    const editPaper = $(findEl(id, "extended-item"));
    const tagList = $(findEl(id, "tag-list"));
    const tagEdit = $(findEl(id, "edit-tags"));
    const tagSelect = $(findEl(id, "memory-item-tags"));
    const actions = $(findEl(id, "memory-item-actions"));

    if (edit.classList.contains("expand-open")) {
        // The edit form is open
        edit.classList.remove("expand-open");
        // Open display elements
        codeAndNote.slideDown(250);
        tagList.slideDown(250);
        actions.slideDown(250);
        // Close inputs
        editPaper.slideUp(250);
        tagEdit.slideUp(250);
        // destroy to enable options update in HTML
        tagSelect.select2("destroy");
    } else {
        // The edit form is closed
        edit.classList.add("expand-open");
        // Enable select2 tags input
        tagSelect.select2({
            ..._select2Options,
            width: "75%",
        });
        if (!hasClass(edit, "has-monitoring")) {
            // only listen for changes once
            tagSelect.on("change", monitorPaperEdits(id, false));
        }
        // monitorPaperEdits listener has been added
        edit.classList.add("has-monitoring");
        // Close display elements
        codeAndNote.slideUp(250);
        tagList.slideUp(250);
        actions.slideUp(250);
        // Show form
        editPaper.slideDown(250);
        tagEdit.slideDown(250);
    }
};

const handleMemorySelectChange = (e) => {
    const sort = e.target.value;
    _state.sortKey = sort;
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
    const showFavorites = !_state.showFavorites;
    _state.showFavorites = showFavorites;
    if (showFavorites) {
        addClass(
            document.getElementById("filter-favorites").querySelector("svg"),
            "favorite"
        );
        sortMemory();
        _state.papersList = _state.papersList.filter((p) => p.favorite);
        displayMemoryTable();
        setMemorySortArrow("down");
        document.getElementById(
            "memory-select"
        ).innerHTML += `<option value="favoriteDate">Last favoured</option>`;
        const n = _state.papersList.length;
        setPlaceholder("memory-search", `Search ${n} entries...`);
    } else {
        removeClass(
            document.getElementById("filter-favorites").querySelector("svg"),
            "favorite"
        );

        if (document.getElementById("memory-select").value === "favoriteDate") {
            document.getElementById("memory-select").value = "lastOpenDate";
            _state.sortKey = "lastOpenDate";
        }
        document.querySelector(`#memory-select option[value="favoriteDate"]`).remove();
        sortMemory();
        setMemorySortArrow("down");

        if (val("memory-search").trim()) {
            dispatch("memory-search", "keypress");
        } else {
            _state.papersList = _state.sortedPapers;
            displayMemoryTable();
        }
        const n = _state.sortedPapers.length;
        setPlaceholder("memory-search", `Search ${n} entries...`);
    }
};

const handleMemorySearchKeyPress = (allowEmptySearch) => (e) => {
    // read input, return if empty (after trim)
    const query = val("memory-search").trim();
    if (!query && !allowEmptySearch && e.key !== "Backspace") return;

    if (query.startsWith("t:")) {
        // look into tags
        filterMemoryByTags(query);
    } else if (query.startsWith("c:")) {
        // look into code links
        filterMemoryByCode(query);
    } else {
        // look into title & authors & notes & conf
        filterMemoryByString(query);
    }
    // display filtered papers
    displayMemoryTable();
};

const handleMemorySearchKeyUp = (e) => {
    // keyup because keypress does not listen to backspaces
    if (e.key == "Backspace") {
        var backspaceEvent = new Event("keypress");
        backspaceEvent.key = "Backspace";
        dispatch("memory-search", backspaceEvent);
    }
};

const handleCancelModalClick = () => {
    document.getElementById("confirm-modal").remove();
};

const handleConfirmModalClick = (e) => {
    const id = e.target.id.split("--")[1];
    delete _state.papers[id];
    chrome.storage.local.set({ papers: _state.papers }, () => {
        _state.papersList = Object.values(cleanPapers(_state.papers));
        sortMemory();
        displayMemoryTable();
        document.getElementById("confirm-modal").remove();
        console.log("Successfully deleted '" + title + "' from ArxivMemory");
        if (_state.currentId === id) {
            updatePopupPaperNoMemory();
        }
        setPlaceholder(
            "memory-search",
            `Search ${_state.papersList.length} entries ...`
        );
    });
};

const handleTagClick = (e) => {
    const tagEl = e.target;
    const query = tagEl.textContent;
    val("memory-search", `t: ${query}`);
    dispatch("memory-search", "keypress");
};

const handleClearSearch = (e) => {
    if (e.target.value === "") {
        dispatch("memory-search", "clear-search");
    }
};

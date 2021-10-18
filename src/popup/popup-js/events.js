const addEventToClass = (className, eventName, fn) => {
    document.querySelectorAll(className).forEach((el) => {
        el.addEventListener(eventName, fn);
    });
};

const handleBackToFocus = (e) => {
    const { id } = eventId(e);
    setTimeout(() => {
        document
            .getElementById(`memory-item-container--${id}`)
            .dispatchEvent(new Event("focus"));
    }, 250);
};

const handleDeleteItem = (e) => {
    const { id } = eventId(e);
    confirmDelete(id);
};

const handleOpenItemLink = (e) => {
    const { id } = eventId(e);
    focusExistingOrCreateNewPaperTab(_state.papers[id]);
};

const handleOpenItemCodeLink = (e) => {
    const { id } = eventId(e);
    const url = _state.papers[id].codeLink;
    focusExistingOrCreateNewCodeTab(url);
};

const handleCopyMarkdownLink = (e) => {
    const { id } = eventId(e);
    const md = _state.papers[id].md;
    copyAndConfirmMemoryItem(id, md, "Markdown link copied!");
};

const handleCopyBibtex = (e) => {
    const { id } = eventId(e);
    const bibtext = _state.papers[id].bibtext;
    copyAndConfirmMemoryItem(id, bibtext, "Bibtex copied!");
};

const handleCopyPDFLink = (e) => {
    const { id } = eventId(e);
    const pdfLink = _state.papers[id].pdfLink;
    copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!");
};

const handleAddItemToFavorites = (e) => {
    const { id } = eventId(e);
    const isFavorite = document
        .getElementById(`memory-item-container--${id}`)
        .classList.contains("favorite");
    saveFavoriteItem(id, !isFavorite);
};

const handleTextareaFocus = () => {
    var that = this;
    textareaFocusEnd(that);
};

const handleEditPaperFormSubmit = (e) => {
    e.preventDefault();

    // Get content
    const { id } = eventId(e);
    const note = findEl(id, "form-note-textarea").value;
    const codeLink = findEl(id, "form-code-input").value;

    // Update metadata
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    updatePaperTags(id, "memory-item-tags");

    // Close edit form
    findEl(id, "memory-item-edit").dispatchEvent(new Event("click"));
};

const handleCancelPaperEdit = (e) => {
    e.preventDefault();
    const { id } = eventId(e);
    const paper = _state.papers[id];
    findEl(id, "form-note-textarea").value = paper.note;
    findEl(id, "memory-item-tags").innerHTML = getTagsHTMLOptions(paper);
    findEl(id, "memory-item-edit").dispatchEvent(new Event("click"));
};

const handleTogglePaperEdit = (e) => {
    e.preventDefault();
    // find elements
    const { id } = eventId(e);
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
    } else {
        // The edit form is closed
        edit.classList.add("expand-open");
        // Enable select2 tags input
        tagSelect.select2({
            ..._select2Options,
            width: "75%",
        });
        // Close display elements
        codeAndNote.slideUp(250);
        tagList.slideUp(250);
        actions.slideUp(250);
        // Show form
        editPaper.slideDown(250);
        tagEdit.slideDown(250);
    }
};

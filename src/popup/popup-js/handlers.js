const addEventToClass = (className, eventName, fn) => {
    document.querySelectorAll(className).forEach((el) => {
        el.addEventListener(eventName, fn);
    });
};

const handleBackToFocus = (e) => {
    const id = eventId(e);
    setTimeout(() => {
        document
            .getElementById(`memory-container--${id}`)
            .dispatchEvent(new Event("focus"));
    }, 250);
};

const handleDeleteItem = (e) => {
    const id = eventId(e);
    showConfirmDeleteModal(id);
};

const handleOpenItemLink = (e) => {
    const id = eventId(e);
    focusExistingOrCreateNewPaperTab(global.state.papers[id]);
};

const handleOpenItemCodeLink = (e) => {
    const id = eventId(e);
    const url = global.state.papers[id].codeLink;
    focusExistingOrCreateNewCodeTab(url);
};

const handleCopyMarkdownLink = (e) => {
    const id = eventId(e);
    const md = global.state.papers[id].md;
    copyAndConfirmMemoryItem(id, md, "Markdown link copied!");
};

const handleCopyBibtex = (e) => {
    const id = eventId(e);
    const bibtex = global.state.papers[id].bibtex;
    copyAndConfirmMemoryItem(id, bibtex, "Bibtex copied!");
};

const handleCopyPDFLink = (e) => {
    const id = eventId(e);
    const pdfLink = global.state.papers[id].pdfLink;
    copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!");
};

const handleAddItemToFavorites = (e) => {
    const id = eventId(e);
    const isFavorite = hasClass(`memory-container--${id}`, "favorite");
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
    disable(findEl(id, "memory-item-save-edits"));
};

const handleCancelPaperEdit = (e) => {
    e.preventDefault();
    const id = eventId(e);
    const paper = global.state.papers[id];
    val(findEl(id, "form-note-textarea"), paper.note);
    setHTML(findEl(id, "memory-item-tags"), getTagsOptions(paper));
    dispatch(findEl(id, "memory-item-edit"), "click");
    disable(findEl(id, "memory-item-save-edits"));
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
    findEl("confirm-modal").remove();
    addListener("memory-switch", "click", handleMemorySwitchClick);
};

const handleConfirmDeleteModalClick = (e) => {
    const id = e.target.id.split("--")[1];
    const title = global.state.papers[id].title;
    delete global.state.papers[id];
    chrome.storage.local.set({ papers: global.state.papers }, () => {
        global.state.papersList = Object.values(cleanPapers(global.state.papers));
        sortMemory();
        displayMemoryTable();
        findEl("confirm-modal").remove();
        console.log(`Successfully deleted "${title}" (${id}) from ArxivMemory`);
        if (global.state.currentId === id) {
            updatePopupPaperNoMemory();
        }
        setPlaceholder(
            "memory-search",
            `Search ${global.state.papersList.length} entries ...`
        );
        addListener("memory-switch", "click", handleMemorySwitchClick);
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

const handleMemorySwitchClick = () => {
    global.state.memoryIsOpen ? closeMemory() : openMemory();
};

const handlePopupKeydown = (e) => {
    const key = e.key;
    if (["Backspace", "Enter", "Escape", "a", "e"].indexOf(key) < 0) {
        return;
    }

    if (global.state.menuIsOpen) {
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
            const focused = document.querySelectorAll(":focus");
            if (focused && focused.length) {
                if (Array.from(focused).some((el) => hasClass(el, "noMemoryOnA"))) {
                    return;
                }
            }
            global.state.papers && dispatch("memory-switch", "click");
        } else if (key === "Enter") {
            // enter on the arxiv memory button opens it
            let el = document.querySelector("#memory-switch-open:focus");
            if (el) {
                dispatch("memory-switch", "click");
                return;
            }
            // enter on the menu button opens it
            el = document.querySelector("#menu-switch:focus");
            if (el) {
                dispatch("menu-switch", "click");
                dispatch("menu-switch", "blur");
                return;
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

const handleMenuCheckChange = (e) => {
    const key = e.target.id;
    const checked = findEl(key).checked;
    chrome.storage.local.set({ [key]: checked }, function () {
        console.log(`Settings saved for ${key} (${checked})`);
    });
};

const handleDownloadMemoryClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        const version = versionToSemantic(papers.__dataVersion);
        downloadTextFile(
            JSON.stringify(papers),
            `memory-data-${version}-${date}-${time}.json`,
            "text/json"
        );
    });
};
const handleDownloadBibtexJsonClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.keys(papers).reduce((obj, k) => {
            obj[k] = papers[k].bibtex || "";
            return obj;
        }, {});
        downloadTextFile(
            JSON.stringify(bibtex),
            `memory-bibtex-${version}-${date}-${time}.json`,
            "text/json"
        );
    });
};
const handleDownloadBibtexPlainClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.values(papers)
            .map((v, k) => {
                let b = v.bibtex;
                if (!b) {
                    b = "";
                    console.log(v);
                }
                return b;
            })
            .join("\n");
        downloadTextFile(
            JSON.stringify(bibtex),
            `memory-bibtex-${version}-${date}-${time}.bib`,
            "text/plain"
        );
    });
};

const handleOverwriteMemory = () => {
    var file = document.getElementById("overwrite-arxivmemory-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            const overwritingPapers = JSON.parse(e.target.result);
            showId("overwriteFeedback");
            setHTML(
                "overwriteFeedback",
                `<div class="flex-center-center"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>`
            );
            const confirm = `<button id="confirm-overwrite">Confirm</button>`;
            const cancel = `<button id="cancel-overwrite">Cancel</button>`;
            const tile = `<h4 style="width: 100%; font-size: 0.9rem; font-family: 'Fira Code', monospace;">Be careful, you will not be able to revert this operation. Make sure you have downloaded a backup of your memory before overwriting it.</h4>`;
            const overwriteDiv = `<div id="overwrite-buttons"> ${tile} <div class="flex-center-evenly w-100">${cancel} ${confirm}</div></div>`;
            setTimeout(async () => {
                const { success, message, warning, papersToWrite } =
                    await overwriteMemory(overwritingPapers);
                if (success) {
                    if (warning) {
                        const nWarnings = (warning.match(/<br\/>/g) || []).length;
                        setHTML(
                            "overwriteFeedback",
                            `<h5 class="errorTitle">Done with ${nWarnings} warnings. Confirm overwrite?</h5>${warning}${overwriteDiv}`
                        );
                    } else {
                        style("overwriteFeedback", "text-align", "center");
                        setHTML(
                            "overwriteFeedback",
                            `<h4>Data is valid. Confirm overwrite?</h4>${overwriteDiv}`
                        );
                    }
                    addListener(
                        "confirm-overwrite",
                        "click",
                        handleConfirmOverwrite(papersToWrite, warning)
                    );
                    addListener("cancel-overwrite", "click", handleCancelOverwrite);
                } else {
                    setHTML("overwriteFeedback", message);
                }
            }, 1500);
        } catch (error) {
            setHTML(
                "overwriteFeedback",
                `<br/><strong>Error:</strong><br/>${stringifyError(error)}`
            );
        }
    };
    reader.readAsText(file);
};

const handleConfirmOverwrite = (papersToWrite, warning) => (e) => {
    setHTML(
        "overwriteFeedback",
        `<div style="display: flex; justify-content: center;"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>`
    );
    setTimeout(async () => {
        if (warning) {
            for (const id in papersToWrite) {
                if (papersToWrite.hasOwnProperty(id) && !id.startsWith("__")) {
                    const { paper, warnings } = validatePaper(papersToWrite[id], false);
                    papersToWrite[id] = paper;
                    console.log(warnings);
                }
            }
        }
        await setStorage("papers", papersToWrite);
        setHTML(
            "overwriteFeedback",
            `<h4>Memory overwritten. Close & Re-open the extension for the update to be effective.</h4>`
        );
        val("overwrite-arxivmemory-input", "");
    }, 700);
};
const handleCancelOverwrite = (e) => {
    hideId("overwriteFeedback");
    setHTML("overwriteFeedback", ``);
    val("overwrite-arxivmemory-input", "");
};

const handleCustomPDFFunctionSave = () => {
    const code = val("customPdfTitleTextarea").trim();
    try {
        // check code: it can be evaluated and it runs without error
        const fn = eval(code);
        const tested = fn("test", "1.2");
        if (typeof tested !== "string") {
            throw Error(
                "Custom function returns the wrong type:",
                typeof tested,
                tested
            );
        }
        // no error so far: all good!
        const savedFeedback = /*html*/ `<span style="color: green">Saved!</span>`;
        setHTML("customPdfFeedback", savedFeedback);
        // save function string
        chrome.storage.local.set({ pdfTitleFn: code });
        global.state.pdfTitleFn = fn;
        setTimeout(() => {
            setHTML("customPdfFeedback", "");
        }, 1000);
    } catch (error) {
        // something went wrong!
        console.log("setAndHandleCustomPDFFunction error:");
        const errorFeedback = /*html*/ `<span style="color: red">${error}</span>`;
        savedFeedback("customPdfFeedback", errorFeedback);
    }
};

const handleDefaultPDFFunctionClick = () => {
    const code = defaultPDFTitleFn.toString();
    const savedFeedback = /*html*/ `<span style="color: var(--green)">Saved!</span>`;
    chrome.storage.local.set({ pdfTitleFn: code });
    global.state.pdfTitleFn = defaultPDFTitleFn;
    val("customPdfTitleTextarea", code);
    setHTML("customPdfFeedback", savedFeedback);
    setTimeout(() => {
        setHTML("customPdfFeedback", "");
    }, 1000);
};

const handlePopupSaveEdits = (id) => () => {
    const { note, codeLink, favorite } = getPaperEdits(id, true);
    updatePaperTags(id, `#popup-item-tags--${id}`);
    saveNote(id, note);
    saveCodeLink(id, codeLink);
    saveFavoriteItem(id, favorite);
    setHTML("popup-feedback-copied", "Saved tags, code, note & favorite!");
    fadeIn("popup-feedback-copied");
    setTimeout(() => {
        fadeOut("popup-feedback-copied");
    }, 2000);
    disable(`popup-save-edits--${id}`);
};

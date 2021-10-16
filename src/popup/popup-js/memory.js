/**
 * Find a JQuery element with class className within #memory-item-container--${eid}
 * @param {string} eid The escaped id for the paper (id.replaceAll(".", "\\."))
 * @param {string} className The class of the element to find within the container with id^
 * @returns Jquery element
 */
const findEl = (eid, className) => {
    return $(`#memory-item-container--${eid}`).find(`.${className}`).first();
};

const getTagsHTMLOptions = (paper) => {
    const tags = new Set(paper.tags);
    return Array.from(_state.paperTags)
        .sort()
        .map((t, i) => {
            let h = `<option value="${t}"`;
            if (tags.has(t)) {
                h += ' selected="selected" ';
            }
            return h + `>${t}</option>`;
        })
        .join("");
};

const updatePopupPaperNoMemory = () => {
    $("#isArxiv").html(/*html*/ `
        <div style="font-size: 1.5rem;">This paper is not in your memory</div>
        <h4> Refresh the page to add it back </h4>
    `);
};

/**
 * Delete a paper ; display a modal first to get uer confirmation
 * @param {string} id Id of the paper to delete
 */
const confirmDelete = (id) => {
    const title = _state.papers[id].title;
    $("body").append(/*html*/ `
    <div id="confirm-modal">
        <div style="width: 80%; padding: 32px 32px; text-align: center; font-size: 1.1rem;">
            Are you sure you want to delete:<p>${title}</p>?
        </div>
        <div style="width: 100%; text-align: center; padding: 32px;">
            <button style="padding: 8px 16px;" id="cancel-modal-button">Cancel</button>
            <span style="min-width: 32px;"></span>
            <button style="padding: 8px 16px;" id="confirm-modal-button">Confirm</button>
        </div>
    </div>`);
    $("#cancel-modal-button").on("click", () => {
        $("#confirm-modal").remove();
    });
    $("#confirm-modal-button").on("click", () => {
        delete _state.papers[id];
        chrome.storage.local.set({ papers: _state.papers }, () => {
            _state.papersList = Object.values(cleanPapers(_state.papers));
            sortMemory();
            displayMemoryTable();
            $("#confirm-modal").remove();
            console.log("Successfully deleted '" + title + "' from ArxivMemory");
            if (_state.currentId === id) {
                updatePopupPaperNoMemory();
            }
        });
    });
};

/**
 * Copy a text to the clipboard and display a feedback text
 * @param {string} id Id of the paper to display the feedback in the memory item
 * @param {string} textToCopy Text to copy to the clipboard
 * @param {string} feedbackText Text to display as feedback
 * @param {boolean} isPopup If the action took place in the main popup or in the memory
 */
const copyAndConfirmMemoryItem = (id, textToCopy, feedbackText, isPopup) => {
    copyTextToClipboard(textToCopy);
    const eid = id.replace(".", "\\.");
    const element = isPopup
        ? $(`#popup-feedback-copied`)
        : findEl(eid, "memory-item-feedback");
    element.text(feedbackText);
    element.fadeIn();
    setTimeout(() => {
        element.fadeOut();
    }, 1000);
};

/**
 * Looks for an open tab with the code of the paper. Matches are not exact:
 * a tab url needs only to include the codeLink to be valid. If no existing
 * tab matches the codeLink, a new tab is created
 * @param {string} codeLink URL of the code repository to open
 */
const focusExistingOrCreateNewCodeTab = (codeLink) => {
    const { origin } = new URL(codeLink);
    chrome.tabs.query({ url: `${origin}/*` }, (tabs) => {
        for (const tab of tabs) {
            if (tab.url.includes(codeLink)) {
                const tabUpdateProperties = { active: true };
                const windowUpdateProperties = { focused: true };
                chrome.windows.getCurrent((w) => {
                    if (w.id !== tab.windowId) {
                        chrome.windows.update(
                            tab.windowId,
                            windowUpdateProperties,
                            () => {
                                chrome.tabs.update(tab.id, tabUpdateProperties);
                            }
                        );
                    } else {
                        chrome.tabs.update(tab.id, tabUpdateProperties);
                    }
                });
                return;
            }
        }
        chrome.tabs.create({ url: codeLink });
    });
};

/**
 * Looks for an open tab to the paper: either its pdf or html page.
 * If both a pdf and an html page exist, focus the pdf.
 * If none exist, create a new tab.
 * @param {object} paper The paper whose pdf should be opened
 */
const focusExistingOrCreateNewPaperTab = (paper) => {
    const hostname = parseUrl(paper.pdfLink).hostname;

    // create the match string to look for in existing tabs
    let match = paper.pdfLink
        .split("/") // split on parts of the path
        .reverse()[0] // get the last one
        .replace("-Paper.pdf", "") // clean neurips-specific end
        .replace(".pdf", ""); // remove .pdf
    if (match.match(/\d{5}v\d+$/) && paper.source === "arxiv") {
        // remove potential pdf version on arxiv
        match = match.split("v")[0];
    }

    chrome.tabs.query({ url: `*://${hostname}/*` }, (tabs) => {
        let validTabsIds = [];
        let pdfTabsIds = [];
        const urls = tabs.map((t) => t.url);
        let idx = 0;
        for (const u of urls) {
            if (u.indexOf(match) >= 0) {
                validTabsIds.push(idx);
                if (u.endsWith(".pdf")) {
                    pdfTabsIds.push(idx);
                }
            }
            idx += 1;
        }
        if (validTabsIds.length > 0) {
            let tab;
            if (pdfTabsIds.length > 0) {
                tab = tabs[pdfTabsIds[0]];
            } else {
                tab = tabs[validTabsIds[0]];
            }
            const tabUpdateProperties = { active: true };
            const windowUpdateProperties = { focused: true };
            chrome.windows.getCurrent((w) => {
                if (w.id !== tab.windowId) {
                    chrome.windows.update(tab.windowId, windowUpdateProperties, () => {
                        chrome.tabs.update(tab.id, tabUpdateProperties);
                    });
                } else {
                    chrome.tabs.update(tab.id, tabUpdateProperties);
                }
            });
        } else {
            chrome.tabs.create({ url: paper.pdfLink });
        }

        _state.papers[paper.id].count += 1;
        chrome.storage.local.set({ papers: _state.papers });
    });
};

/**
 * Trim then save in chrome.storage.local the content of the note for a paper.
 * Also updates this paper's memory table display and the main popup's textarea
 * (if the paper being edited from the memory is actually the one currently opened
 * and which is therefore being displayed by the popup)
 * @param {string} id The id of the paper whose note is being saved
 * @param {string} note The content of the note
 */
const saveNote = (id, note) => {
    note = $.trim(note);
    _state.papers[id].note = note;
    const eid = id.replace(".", "\\.");
    chrome.storage.local.set({ papers: _state.papers }, () => {
        console.log("Updated the note for " + _state.papers[id].title);

        findEl(eid, "memory-note-div").html(
            note
                ? /*html*/ `
        <div class="memory-note-div memory-item-faded">
            <span class="note-content-header">Note:</span>
            <span class="note-content">${note}</span>
        </div>`
                : /*html*/ `<div class="memory-note-div memory-item-faded"></div>`
        );
        $(`#popup-form-note-textarea--${eid}`).val(note);
        findEl(eid, "form-note-textarea").val(note);
    });
};

/**
 * Trim then save in chrome.storage.local the code link for a paper.
 * Also updates this paper's memory table display and the main popup's code input
 * (if the paper being edited from the memory is actually the one currently opened
 * and which is therefore being displayed by the popup)
 * @param {string} id The id of the paper whose code is being saved
 * @param {string} codeLink The link to the paper's code
 */
const saveCodeLink = (id, codeLink) => {
    codeLink = $.trim(codeLink);
    _state.papers[id].codeLink = codeLink;
    const eid = id.replace(".", "\\.");
    chrome.storage.local.set({ papers: _state.papers }, () => {
        console.log(`Updated the code for ${_state.papers[id].title} to ${codeLink}`);
        findEl(eid, "memory-item-code-link").html(codeLink);
        $(`#popup-code-link`).text(codeLink);
        findEl(eid, "form-code-input").val(codeLink);
        codeLink ? $("#popup-code-link").show() : $("#popup-code-link").hide();
    });
};

const saveFavoriteItem = (id, favorite) => {
    _state.papers[id].favorite = favorite;
    _state.papers[id].favoriteDate = new Date().toJSON();
    const eid = id.replace(".", "\\.");
    chrome.storage.local.set({ papers: _state.papers }, () => {
        console.log(`${_state.papers[id].title} is favorite: ${favorite}`);
        if (favorite) {
            $(`#memory-item-container--${eid}`).addClass("favorite");
            findEl(eid, "memory-item-favorite")
                .find("svg")
                .first()
                .addClass("favorite");
        } else {
            $(`#memory-item-container--${eid}`).removeClass("favorite");
            findEl(eid, "memory-item-favorite")
                .find("svg")
                .first()
                .removeClass("favorite");
        }

        if (_state.sortKey === "favoriteDate") {
            if (!favorite) {
                sortMemory();
                displayMemoryTable();
            }
            const n = _state.sortedPapers.filter((p) => p.favorite).length;
            $("#memory-search").prop("placeholder", `Search ${n} entries`);
        }

        $(`#checkFavorite--${eid}`).prop("checked", favorite);
    });
};

/**
 * Function to change the html content of #memory-sort-arrow to an up or down arrow
 * @param {string} direction up/down string to change the arrow's direction
 */
const setMemorySortArrow = (direction) => {
    let arrow;
    if (direction === "up") {
        arrow = /*html*/ `<svg class="memory-sort-arrow-svg" id="memory-sort-arrow-up">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-arrow-narrow-up" />
                </svg>`;
    } else {
        arrow = /*html*/ `<svg class="memory-sort-arrow-svg" id="memory-sort-arrow-down">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-arrow-narrow-down" />
                </svg>`;
    }

    $("#memory-sort-arrow").html(arrow);
};

/**
 * Function to produce the sorting order of papers: it compares 2 papers and
 * returns -1 or 1 depending on which should come first.
 * addDate count and lastOpenDate are sorted descending by default.
 * Others (id, title) are sorted ascending by default.
 * @param {object} paper1 First item in the comparison
 * @param {object} paper2 Second item to compare
 * @returns {number} 1 or -1 depending on the prevalence of paper1/paper2
 */
const orderPapers = (paper1, paper2) => {
    let val1 = paper1[_state.sortKey];
    let val2 = paper2[_state.sortKey];

    if (typeof val1 === "undefined") {
        val1 = "";
    }
    if (typeof val2 === "undefined") {
        val2 = "";
    }

    if (typeof val1 === "string") {
        val1 = val1.toLowerCase();
        val2 = val2.toLowerCase();
    }
    if (_descendingSortKeys.indexOf(_state.sortKey) >= 0) {
        return val1 > val2 ? -1 : 1;
    }
    return val1 > val2 ? 1 : -1;
};

/**
 * Execute the sort operation on _state.sortedPapers using orderPapers, removing the
 * __dataVersion element in _state.papers.
 */
const sortMemory = () => {
    _state.sortedPapers = Object.values(cleanPapers(_state.papers));
    _state.sortedPapers.sort(orderPapers);
    _state.papersList.sort(orderPapers);
};

/**
 * Reverses the _state's 2 ordered lists: sortedPapers and papersList
 */
const reverseMemory = () => {
    _state.sortedPapers.reverse();
    _state.papersList.reverse();
};

/**
 * Function to filter the sortedPapers list into papersList, keeping papers whose
 * title, author or note includes all the words in the query.
 * e.g.: "cli ga" will look for all papers for which either their note, authors or title
 *        contains both the strings "cli" and "ga".
 * @param {string} letters The user's string query.
 */
const filterMemoryByString = (letters) => {
    const words = letters.split(" ");
    let papersList = [];
    for (const paper of _state.sortedPapers) {
        const title = paper.title.toLowerCase();
        const author = paper.author.toLowerCase();
        const note = paper.note.toLowerCase();
        const displayId = paper.id.split("-")[0].toLowerCase();
        if (
            words.every(
                (w) =>
                    title.includes(w) ||
                    author.includes(w) ||
                    note.includes(w) ||
                    displayId.includes(w)
            )
        ) {
            if (!_state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    _state.papersList = papersList;
};

/**
 * Filters the sortedPapers into papersList, keeping papers whose tags match the query: all
 * papers whose tags contain all words in the query. Triggered when a query starts with "t: ".
 * e.g.: "cli ga" will look for all papers which have at least 1 tag containing the substring "cli"
 *        AND at least 1 tag containing the substring "ga"
 * @param {string} letters The string representing the tags query, deleting "t:" and splitting on " "
 */
const filterMemoryByTags = (letters) => {
    const tags = letters.replace("t:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of _state.sortedPapers) {
        const paperTags = paper.tags.map((t) => t.toLowerCase());
        if (tags.every((t) => paperTags.some((pt) => pt.indexOf(t) >= 0))) {
            if (!_state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    _state.papersList = papersList;
};

/**
 * Filters the sortedPapers into papersList, keeping papers whose code matches the query. Similar
 * to filterMemoryByString but looks into the codeLink attribute. Triggered when a query starts with "c: ".
 * @param {string} letters The string representing the code query, deleting "c:" and splitting on " "
 */
const filterMemoryByCode = (letters) => {
    const words = letters.replace("c:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of _state.sortedPapers) {
        let paperCode = paper.codeLink || "";
        paperCode = paperCode.toLowerCase();
        if (words.every((w) => paperCode.includes(w))) {
            if (!_state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    _state.papersList = papersList;
};

/**
 * Updates a paper's tag HTML list from the object's tags array.
 * @param {string} id The paper's id
 */
const updatePaperTagsHTML = (id) => {
    const eid = id.replace(".", "\\.");
    findEl(eid, "tag-list").html(
        _state.papers[id].tags
            .map((t) => `<span class="memory-tag">${t}</span>`)
            .join("")
    );
};

/**
 * Update the select2 input for tags, with options from the paper's tags array attribute,
 * using getTagsHTMLOptions.
 * @param {string} id The paper's id
 */
const updateTagOptions = (id) => {
    const eid = id.replace(".", "\\.");
    const tagOptions = getTagsHTMLOptions(id);
    findEl(eid, "memory-item-tags").html(tagOptions);
    $(`#popup-item-tags--${eid}`).html(tagOptions);
};

/**
 * Update a paper's tags array attribute from the user's selection in a select2 multi-select input.
 * @param {string} id The paper's id
 * @param {string} elementId The paper's html element selector (either an id for the popup main tags, or a class for a memory item)
 */
const updatePaperTags = (id, elementId) => {
    let ref;
    // elementId may be an ID selector (in the main popup)
    // or a class selector (in the memory)
    if (elementId.startsWith("#")) {
        ref = $(elementId);
    } else {
        const eid = id.replace(".", "\\.");
        ref = findEl(eid, elementId);
    }
    // Store :selected <options> in the tags array
    let tags = [];
    ref.find(":selected").each((k, el) => {
        const t = $.trim($(el).val());
        if (t !== "") tags.push(t);
    });

    // sort tags alphabetically to compare with the existing array of tags
    // for this paper
    tags.sort();
    updated = false;
    if (_state.papers[id].tags !== tags) updated = true;
    _state.papers[id].tags = tags;

    console.log("Update tags to: " + tags.join(", "));

    // If there's a change: update the global set of tags:
    // we need to add or remove tags to the global suggestions array
    // for select2
    if (updated) {
        chrome.storage.local.set({ papers: _state.papers }, () => {
            // update the selected tags in the select2 input for this paper
            updateTagOptions(id);
            // update the displayed tags for this paper
            updatePaperTagsHTML(id);
            // update the global set of tags
            makeTags();
        });
    }
};

/**
 * Create the set of all tags used in papers. If a tag used for a paper is new,
 * it is added to this list, if a tag is never used after it's deleted from its
 * last paper, it is removed from the list.
 */
const makeTags = () => {
    let tags = new Set();
    for (const p of _state.sortedPapers) {
        for (const t of p.tags) {
            tags.add(t);
        }
    }
    _state.paperTags = Array.from(tags);
    _state.paperTags.sort();
};

/**
 * Iterates over all papers in the papersList (sorted and filtered),
 * creates each paper's HTML template and appends it to #memory-table.
 * Also creates the relevant events.
 */
const displayMemoryTable = () => {
    const start = Date.now();

    // Clear existing items
    var memoryTable = document.getElementById("memory-table");
    memoryTable.innerHTML = "";
    // Add relevant sorted papers (papersList may be smaller than sortedPapers
    // depending on the search query)
    let table = [];
    for (const paper of _state.papersList) {
        try {
            table.push(getMemoryItemHTML(paper));
        } catch (error) {
            console.log(error);
            console.log(paper);
        }
    }
    // https://stackoverflow.com/questions/18393981/append-vs-html-vs-innerhtml-performance
    memoryTable.innerHTML = table.join("");

    const end = Date.now();

    console.log("Rendering duration (s): " + (end - start) / 1000);

    // after a click on such a button, the focus returns to the
    // container to navigate with tab
    $(".back-to-focus").on("click", (e) => {
        const { id, eid } = eventId(e);
        setTimeout(() => {
            $(`#memory-item-container--${eid}`).trigger("focus");
        }, 250);
    });
    // delete memory item
    $(".delete-memory-item").on("click", (e) => {
        const { id, eid } = eventId(e);
        confirmDelete(id);
    });
    // Open paper page
    $(".memory-item-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        focusExistingOrCreateNewPaperTab(_state.papers[id]);
    });
    // Open code page
    $(".memory-item-code-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        const url = _state.papers[id].codeLink;
        focusExistingOrCreateNewCodeTab(url);
    });
    // Copy markdown link
    $(".memory-item-md").on("click", (e) => {
        const { id, eid } = eventId(e);
        const md = _state.papers[id].md;
        copyAndConfirmMemoryItem(id, md, "Markdown link copied!");
    });
    // Copy bibtex citation
    $(".memory-item-bibtext").on("click", (e) => {
        const { id, eid } = eventId(e);
        const bibtext = _state.papers[id].bibtext;
        copyAndConfirmMemoryItem(id, bibtext, "Bibtex copied!");
    });
    // Copy pdf link
    $(".memory-item-copy-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        const pdfLink = _state.papers[id].pdfLink;
        copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!");
    });
    $(".memory-item-favorite").on("click", (e) => {
        const { id, eid } = eventId(e);
        const isFavorite = $(`#memory-item-container--${eid}`).hasClass("favorite");
        saveFavoriteItem(id, !isFavorite);
    });
    // Put cursor at the end of the textarea's text on focus
    // (default puts the cursor at the beginning of the text)
    $(".form-note-textarea").focus(function () {
        var that = this;
        textareaFocusEnd(that);
    });
    // Save fields on edits save
    $(".form-note").on("submit", (e) => {
        e.preventDefault();

        // Get content
        const { id, eid } = eventId(e);
        const note = findEl(eid, "form-note-textarea").val();
        const codeLink = findEl(eid, "form-code-input").val();

        // Update metadata
        saveNote(id, note);
        saveCodeLink(id, codeLink);
        updatePaperTags(id, "memory-item-tags");

        // Close edit form
        findEl(eid, "memory-item-edit").trigger("click");
    });
    // Cancel edits: bring previous values from _state back
    $(".cancel-note-form").on("click", (e) => {
        e.preventDefault();
        const { id, eid } = eventId(e);
        findEl(eid, "form-note-textarea").val(_state.papers[id].note);
        findEl(eid, "memory-item-tags").html(getTagsHTMLOptions(id));
        findEl(eid, "memory-item-edit").trigger("click");
    });
    // When clicking on the edit button, either open or close the edit form
    $(".memory-item-edit").on("click", (e) => {
        e.preventDefault();
        // find elements
        const { id, eid } = eventId(e);
        const edit = findEl(eid, "memory-item-edit");
        const codeAndNote = findEl(eid, "code-and-note");
        const editPaper = findEl(eid, "extended-item");
        const tagList = findEl(eid, "tag-list");
        const tagEdit = findEl(eid, "edit-tags");
        const tagSelect = findEl(eid, "memory-item-tags");
        const actions = findEl(eid, "memory-item-actions");

        if (edit.hasClass("expand-open")) {
            // The edit form is open
            edit.removeClass("expand-open");
            // Open display elements
            codeAndNote.slideDown(250);
            tagList.slideDown(250);
            actions.slideDown(250);
            // Close inputs
            editPaper.slideUp(250);
            tagEdit.slideUp(250);
        } else {
            // The edit form is closed
            edit.addClass("expand-open");
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
    });
    const end2 = Date.now();

    console.log("Listeners duration (s): " + (end2 - end) / 1000);
};

/**
 * Main function called after the user clicks on the ArxivMemory button
 * or presses `a`.
 * + closes the menu if it is open (should not be)
 */
const openMemory = () => {
    var openTime = Date.now();

    _state.menuIsOpen && closeMenu();
    _state.memoryIsOpen = true;

    chrome.storage.local.get("papers", async function ({ papers }) {
        await initState(papers);

        // Fill-in input placeholder
        $("#memory-search").attr(
            "placeholder",
            `Search ${_state.papersList.length} entries ...`
        );

        // Show paper list

        // wait a little before sliding up
        $("#memory-container").slideDown({
            duration: 250,
            easing: "easeOutQuint",
            complete: () => {
                setTimeout(() => {
                    $("#memory-search").trigger("focus");
                    displayMemoryTable();
                    console.log(
                        "Time to display (s): " + (Date.now() - openTime) / 1000
                    );
                }, 100);
            },
        });

        // add input search delay if there are many papers:
        // wait for some time between keystrokes before firing the search
        if (_state.papersList.length < 20) {
            delayTime = 0;
        } else if (_state.papersList.length < 50) {
            delayTime = 300;
        }
        // search keypress events.
        $("#memory-search")
            .on(
                "keypress", // deprecated fix: https://stackoverflow.com/questions/49278648/alternative-for-events-deprecated-keyboardevent-which-property
                delay((e) => {
                    // read input, return if empty (after trim)
                    const query = $.trim($(e.target).val());
                    if (!query && e.key !== "Backspace") return;

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
                }, delayTime)
            )
            .on("keyup", (e) => {
                // keyup because keypress does not listen to backspaces
                if (e.key == "Backspace") {
                    var backspaceEvent = $.Event("keypress");
                    backspaceEvent.key = "Backspace";
                    $("#memory-search").trigger(backspaceEvent);
                }
            });
    });

    // hide menu button
    $("#tabler-menu").fadeOut();
    // set default sort to lastOpenDate
    $("#memory-select").val("lastOpenDate");
    // set default sort direction arrow down
    setMemorySortArrow("down");

    // remove ArxivMemory button and show the (x) to close it
    $("#memory-switch-text-on").fadeOut(() => {
        $("#memory-switch-text-off").fadeIn();
    });
    $("#filter-favorites").on("click", () => {
        const showFavorites = !_state.showFavorites;
        _state.showFavorites = showFavorites;
        if (showFavorites) {
            $("#filter-favorites").find("svg").first().addClass("favorite");
            sortMemory();
            _state.papersList = _state.papersList.filter((p) => p.favorite);
            displayMemoryTable();
            setMemorySortArrow("down");
            $("#memory-select").append(
                `<option value="favoriteDate">Last favoured</option>`
            );
            const n = _state.papersList.length;
            $("#memory-search").prop("placeholder", `Search ${n} entries...`);
        } else {
            $("#filter-favorites").find("svg").first().removeClass("favorite");
            if ($("#memory-select").val() === "favoriteDate") {
                $("#memory-select").val("lastOpenDate");
                _state.sortKey = "lastOpenDate";
            }
            $(`#memory-select option[value="favoriteDate"]`).remove();
            sortMemory();
            setMemorySortArrow("down");

            if ($.trim($("#memory-search").val())) {
                $("#memory-search").trigger("keypress");
            } else {
                _state.papersList = _state.sortedPapers;
                displayMemoryTable();
            }
            const n = _state.sortedPapers.length;
            $("#memory-search").prop("placeholder", `Search ${n} entries...`);
        }
    });
    // listen to sorting feature change
    $("#memory-select").on("change", (e) => {
        const sort = $(e.target).val();
        _state.sortKey = sort;
        sortMemory();
        displayMemoryTable();
        setMemorySortArrow("down");
    });
    // listen to sorting direction change
    $("#memory-sort-arrow").on("click", (e) => {
        if ($("#memory-sort-arrow svg").first()[0].id === "memory-sort-arrow-down") {
            setMemorySortArrow("up");
        } else {
            setMemorySortArrow("down");
        }
        reverseMemory();
        displayMemoryTable();
    });
};

/**
 * Closes the memory overlay with slideUp
 */
const closeMemory = () => {
    $("#memory-container").slideUp({
        duration: 300,
        easing: "easeOutQuint",
    });
    $("#memory-switch-text-off").fadeOut(() => {
        $("#memory-switch-text-on").fadeIn();
    });
    $("#tabler-menu").fadeIn();
    $("#memory-search").val("");
    _state.memoryIsOpen = false;
};

/**
 * TODO: docstrings
 * TODO: miniquery for content_script.js
 *
 * TODO: add advanced option to customize storage folder
 */

/**
 * Get a the HTML string listing all the <option>tag</option> of all known tags,
 * setting the <option>'s "selected" attribute according to the paper's own tags
 * @param {object} paper The paper whose options' HTML string are being created
 * @returns {string} The HTML string of the paper's options
 */
const getTagsOptions = (paper) => {
    const tags = new Set(paper.tags);

    return Array.from(global.state.paperTags)
        .sort()
        .map((t, i) => {
            let h = '<option value="' + t + '"'; // not string literal here for minification
            if (tags.has(t)) {
                h += ' selected="selected" ';
            }
            return h + `>${t}</option>`;
        })
        .join("");
};
/**
 * Updates all the papers' options HTML list
 */
const updateAllMemoryPaperTagOptions = () => {
    for (const id in global.state.papers) {
        if (global.state.papers.hasOwnProperty(id) && id !== "__dataVersion") {
            const paper = global.state.papers[id];
            setHTML(`memory-item-tags--${id}`, getTagsOptions(paper));
        }
    }
};

const updatePopupPaperNoMemory = (url) => {
    let noMemoryHTML = /*html*/ `
        <div style="font-size: 1.5rem; width: 100%; text-align: center;">
            This paper is not in your memory
        </div>
        <ul>
            It can be for one of 4 reasons:
            <li style="margin-top: 4px">
                On Firefox, content scripts are not triggered on pdfs.
                <ul>
                    <li>
                        This is not something I can do anything about, it's a known
                        issue but a design choice by Firefox's developers.
                    </li>
                    <li>
                        The extension would work on the paper's <i>page</i> (for
                        instance arxiv.org/<strong>abs</strong>/1106.0245)
                    </li>
                </ul>
            </li>
            <li style="margin-top: 4px">
                You deleted the paper (refresh the page to add it back)
            </li>
            <li style="margin-top: 4px">
                There was an error parsing the paper's data (you can check the console
                if you think this is an issue)
            </li>
            <li style="margin-top: 4px">
                You are actually not on a paper page but the extension made a mistake
            </li>
            <p style="font-size: 0.9rem">
                Open an issue on
                <a href="https://github.com/vict0rsch/PaperMemory/issues">Github</a> if
                you think you encountered a malfunction.
            </p>
        </ul>
    `;
    if (navigator.userAgent.search("Firefox") > -1) {
        noMemoryHTML += `<div id="manual-firefox">Try manual trigger</div>`;
    }
    const previousIsArxiv = findEl("isArxiv").innerHTML;
    setHTML("isArxiv", noMemoryHTML);

    if (navigator.userAgent.search("Firefox") > -1) {
        addListener("manual-firefox", "click", async () => {
            const is = await isPaper(url);
            let paper;
            const update = await addOrUpdatePaper(url, is);
            if (update) {
                paper = update.paper;
            } else {
                return;
            }
            if (paper) {
                setHTML("isArxiv", previousIsArxiv);
                popupMain(url, is, true);
            }
        });
    }
};

/**
 * Delete a paper ; display a modal first to get uer confirmation
 * @param {string} id Id of the paper to delete
 */
const showConfirmDeleteModal = (id) => {
    const title = global.state.papers[id].title;
    setTextId("delete-modal-title", title);
    setHTML("hidden-modal-id", id);
    showId("confirm-modal", "flex");
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
    const element = isPopup
        ? findEl(`popup-feedback-copied`)
        : findEl(id, "memory-item-feedback");
    if (!element) return;
    element.innerText = feedbackText;
    fadeIn(element);
    setTimeout(() => {
        fadeOut(element);
    }, 2000);
};

/**
 * Looks for an open tab with the code of the paper. Matches are not exact:
 * a tab url needs only to include the codeLink to be valid. If no existing
 * tab matches the codeLink, a new tab is created
 * @param {string} codeLink URL of the code repository to open
 */
const focusExistingOrCreateNewCodeTab = (codeLink) => {
    codeLink = codeLink.replace("http://", "https://");
    if (!codeLink.startsWith("https://")) {
        codeLink = "https://" + codeLink;
    }
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
    // as ~ : focusTab = url.contains(match)
    let match = paper.pdfLink
        .split("/") // split on parts of the path
        .reverse()[0] // get the last one (all)
        .replace("-Paper.pdf", "") // (neurips)
        .replace(".pdf", "") // remove .pdf (cvf)
        .split("?") // remove get args if any
        .reverse()[0]; // find id (openreview)
    if (paper.source === "biorxiv") {
        match = cleanBiorxivURL(paper.pdfLink);
    }
    if (match.match(/\d{5}v\d+$/) && paper.source === "arxiv") {
        // remove potential pdf version on arxiv
        match = match.split("v")[0];
    }

    chrome.tabs.query({ url: `*://${hostname}/*` }, async (tabs) => {
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
        } else if (global.state.menu.checkStore) {
            const file = await findLocalFile(paper);
            if (file) {
                chrome.downloads.open(file.id);
            } else {
                chrome.tabs.create({ url: paper.pdfLink });
            }
        } else {
            chrome.tabs.create({ url: paper.pdfLink });
        }

        global.state.papers[paper.id].count += 1;
        chrome.storage.local.set({ papers: global.state.papers });
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
    global.state.papers[id].note = note;
    chrome.storage.local.set({ papers: global.state.papers }, () => {
        // log("Updated the note for " + global.state.papers[id].title);

        setHTML(
            findEl(id, "memory-note-div"),
            note
                ? /*html*/ ` <div class="memory-note-div memory-item-faded">
                      <span class="note-content-header">Note:</span>
                      <span class="note-content">${note}</span>
                  </div>`
                : /*html*/ `<div class="memory-note-div memory-item-faded"></div>`
        );
        const textarea = findEl(`popup-form-note-textarea--${id}`);
        val(textarea, note);
        val(findEl(id, "form-note-textarea"), note);
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
    codeLink = codeLink.trim();
    global.state.papers[id].codeLink = codeLink;
    chrome.storage.local.set({ papers: global.state.papers }, () => {
        // log(`Updated the code for ${global.state.papers[id].title} to ${codeLink}`);
        const displayLink = codeLink.replace(/^https?:\/\//, "");
        setHTML(findEl(id, "memory-code-link"), displayLink);
        setHTML(`popup-code-link`, displayLink);
        val(findEl(id, "form-code-input"), codeLink);
        codeLink ? showId("popup-code-link") : hideId("popup-code-link");
        const codeInput = findEl(`popup-form-codeLink--${id}`);
        val(codeInput, codeLink);
    });
};

const saveFavoriteItem = (id, favorite) => {
    global.state.papers[id].favorite = favorite;
    global.state.papers[id].favoriteDate = new Date().toJSON();
    chrome.storage.local.set({ papers: global.state.papers }, () => {
        // log(`${global.state.papers[id].title} is favorite: ${favorite}`);
        if (favorite) {
            addClass(`memory-container--${id}`, "favorite");
            addClass(
                findEl(id, "memory-item-favorite").querySelector("svg"),
                "favorite"
            );
        } else {
            removeClass(`memory-container--${id}`, "favorite");
            removeClass(
                findEl(id, "memory-item-favorite").querySelector("svg"),
                "favorite"
            );
        }

        if (global.state.sortKey === "favoriteDate") {
            if (!favorite) {
                sortMemory();
                displayMemoryTable();
            }
            const n = global.state.sortedPapers.filter((p) => p.favorite).length;
            const memSearch = findEl("memory-search");
            if (memSearch) {
                setPlaceholder(memSearch, `Search ${n} entries`);
            }
        }

        let checkFavorite = findEl(`checkFavorite--${id}`);
        if (checkFavorite) {
            checkFavorite.checked = favorite;
        }
    });
};

/**
 * Function to change the html content of #memory-sort-arrow to an up or down arrow
 * @param {string} direction up/down string to change the arrow's direction
 */
const setMemorySortArrow = (direction) => {
    let arrow;
    if (direction === "up") {
        arrow = /*html*/ `<svg
            viewBox="0 0 24 24"
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-up"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="9" x2="12" y2="5" />
            <line x1="8" y1="9" x2="12" y2="5" />
        </svg>`;
    } else {
        arrow = /*html*/ `<svg
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-down"
            viewBox="0 0 24 24"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="15" x2="12" y2="19" />
            <line x1="8" y1="15" x2="12" y2="19" />
        </svg>`;
    }

    setHTML("memory-sort-arrow", arrow);
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
    let val1 = paper1[global.state.sortKey];
    let val2 = paper2[global.state.sortKey];

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
    if (global.descendingSortKeys.indexOf(global.state.sortKey) >= 0) {
        return val1 > val2 ? -1 : 1;
    }
    return val1 > val2 ? 1 : -1;
};

/**
 * Execute the sort operation on global.state.sortedPapers using orderPapers, removing the
 * __dataVersion element in global.state.papers.
 */
const sortMemory = () => {
    global.state.sortedPapers = Object.values(cleanPapers(global.state.papers));
    global.state.sortedPapers.sort(orderPapers);
    global.state.papersList.sort(orderPapers);
};

/**
 * Reverses the global.state's 2 ordered lists: sortedPapers and papersList
 */
const reverseMemory = () => {
    global.state.sortedPapers.reverse();
    global.state.papersList.reverse();
};

/**
 * Function to filter the sortedPapers list into papersList, keeping papers whose
 * title, author or note includes all the words in the query.
 * e.g.: "cli ga" will look for all papers for which either their note, authors or title
 *        contains both the strings "cli" and "ga".
 * @param {string} letters The user's string query.
 */
const filterMemoryByString = (letters) => {
    const words = letters.toLowerCase().split(" ");
    let papersList = [];
    for (const paper of global.state.sortedPapers) {
        const title = paper.title.toLowerCase();
        const author = paper.author.toLowerCase();
        const note = paper.note.toLowerCase();
        const tags = paper.tags.join(" ").toLowerCase();
        const displayId = getDisplayId(paper.id).toLowerCase();
        if (
            words.every(
                (w) =>
                    title.includes(w) ||
                    author.includes(w) ||
                    note.includes(w) ||
                    tags.includes(w) ||
                    displayId.includes(w)
            )
        ) {
            if (!global.state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    global.state.papersList = papersList;
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
    for (const paper of global.state.sortedPapers) {
        const paperTags = paper.tags.map((t) => t.toLowerCase());
        if (tags.every((t) => paperTags.some((pt) => pt.indexOf(t) >= 0))) {
            if (!global.state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    global.state.papersList = papersList;
};

/**
 * Filters the sortedPapers into papersList, keeping papers whose code matches the query. Similar
 * to filterMemoryByString but looks into the codeLink attribute. Triggered when a query starts with "c: ".
 * @param {string} letters The string representing the code query, deleting "c:" and splitting on " "
 */
const filterMemoryByCode = (letters) => {
    const words = letters.replace("c:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of global.state.sortedPapers) {
        let paperCode = paper.codeLink || "";
        paperCode = paperCode.toLowerCase();
        if (words.every((w) => paperCode.includes(w))) {
            if (!global.state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    global.state.papersList = papersList;
};

/**
 * Updates a paper's tag HTML list from the object's tags array.
 * @param {string} id The paper's id
 */
const updatePaperTagsHTML = (id) => {
    setHTML(
        findEl(id, "tag-list"),
        global.state.papers[id].tags
            .map((t) => `<span class="memory-tag">${t}</span>`)
            .join("")
    );
};

/**
 * Update the select2 input for tags, with options from the paper's tags array attribute,
 * using getTagsOptions.
 * @param {string} id The paper's id
 */
const updateTagOptions = (id) => {
    updateAllMemoryPaperTagOptions();
    // update popup tags if the current paper is being edited in the memory
    const tagOptions = getTagsOptions(global.state.papers[id]);
    setHTML(`popup-item-tags--${id}`, tagOptions);
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
        ref = findEl(elementId.replace("#", ""));
    } else {
        ref = findEl(id, elementId);
    }
    const tags = parseTags(ref);
    updated = false;
    let newTags = new Set();
    if (!arraysIdentical(global.state.papers[id].tags, tags)) updated = true;
    global.state.papers[id].tags = tags;

    // If there's a change: update the global set of tags:
    // we need to add or remove tags to the global suggestions array
    // for select2
    if (updated) {
        chrome.storage.local.set({ papers: global.state.papers }, () => {
            // update the global set of tags
            makeTags();
            // update the selected tags in the select2 input for this paper
            updateTagOptions(id);
            // update the displayed tags for this paper
            updatePaperTagsHTML(id);
            const tagEls = Array.from(
                findEl(id, "tag-list").querySelectorAll(".memory-tag")
            );
            for (const el of tagEls) {
                addListener(el, "click", handleTagClick);
            }
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
    for (const p of global.state.sortedPapers) {
        for (const t of p.tags) {
            tags.add(t);
        }
    }
    global.state.paperTags = Array.from(tags);
    global.state.paperTags.sort();
};

/**
 * Iterates over all papers in the papersList (sorted and filtered),
 * creates each paper's HTML template and appends it to #memory-table.
 * Also creates the relevant events.
 */
const displayMemoryTable = () => {
    const start = Date.now();

    // Clear existing items
    var memoryTable = findEl("memory-table");
    setHTML(memoryTable, "");

    // Define SVG hover titles:
    const titles = {
        edit: `"Edit paper details&#13;&#10;(or press 'e' when this paper is focused,&#13;&#10; i.e. when you navigated to it with 'tab')"`,
        copyPdfLink: `"Copy pdf link"`,
        copyMd: `"Copy Markdown-formatted link"`,
        copyBibtext: `"Copy Bibtex citation"`,
        visits: `"Number of times you have loaded&#13;&#10;the paper's Page or PDF"`,
        openLocal: `"Open downloaded pdf"`,
    };

    // Add relevant sorted papers (papersList may be smaller than sortedPapers
    // depending on the search query)
    let table = [];
    for (const paper of global.state.papersList) {
        try {
            table.push(
                getMemoryItemHTML(paper, titles, global.state.idsToFiles[paper.id])
            );
        } catch (error) {
            log("displayMemoryTable error:");
            log(error);
            log(paper);
        }
    }
    // https://stackoverflow.com/questions/18393981/append-vs-html-vs-innerhtml-performance
    setHTML(memoryTable, table.join(""));

    // Add events
    // after a click on such a button, the focus returns to the
    // container to navigate with tab
    addEventToClass(".back-to-focus", "click", handleBackToFocus);
    // delete memory item
    addEventToClass(".memory-delete", "click", handleDeleteItem);
    // Open paper page
    addEventToClass(".memory-item-link", "click", handleOpenItemLink);
    // Open code page
    addEventToClass(".memory-code-link", "click", handleOpenItemCodeLink);
    // Copy markdown link
    addEventToClass(".memory-item-md", "click", handleCopyMarkdownLink);
    // Copy bibtex citation
    addEventToClass(".memory-item-bibtex", "click", handleCopyBibtex);
    // Copy pdf link
    addEventToClass(".memory-item-copy-link", "click", handleCopyPDFLink);
    // Add to favorites
    addEventToClass(".memory-item-favorite", "click", handleAddItemToFavorites);
    // Cancel edits: bring previous values from global.state back
    addEventToClass(".cancel-note-form", "click", handleCancelPaperEdit);
    // When clicking on the edit button, either open or close the edit form
    addEventToClass(".memory-item-edit", "click", handleTogglePaperEdit);
    // When clicking on a tag, search for it
    addEventToClass(".memory-tag", "click", handleTagClick);
    // Monitor form changes
    setFormChangeListener(undefined, false);

    // Put cursor at the end of the textarea's text on focus
    // (default puts the cursor at the beginning of the text)
    addEventToClass(".form-note-textarea", "focus", handleTextareaFocus);
    // Save fields on edits save (submit)
    const end = Date.now();

    log("[displayMemoryTable] Display duration (s): " + (end - start) / 1000);
};

/**
 * Main function called after the user clicks on the PaperMemory button
 * or presses `a`.
 * + closes the menu if it is open (should not be)
 */
const makeMemoryHTML = async () => {
    const tstart = Date.now() / 1000;
    // Fill-in input placeholder
    setPlaceholder(
        "memory-search",
        `Search ${global.state.papersList.length} entries ...`
    );

    displayMemoryTable();

    // add input search delay if there are many papers:
    // wait for some time between keystrokes before firing the search
    let delayTime = 300;
    if (global.state.papersList.length < 20) {
        delayTime = 0;
    } else if (global.state.papersList.length < 100) {
        delayTime = 150;
    }

    // search keypress events.
    // deprecated fix: https://stackoverflow.com/questions/49278648/alternative-for-events-deprecated-keyboardevent-which-property
    addListener(
        "memory-search",
        "keypress",
        delay(handleMemorySearchKeyPress(), delayTime)
    );
    addListener("memory-search", "clear-search", handleMemorySearchKeyPress(true));
    addListener("memory-search", "keyup", handleMemorySearchKeyUp);
    addListener("cancel-modal-button", "click", handleCancelModalClick);
    addListener("confirm-modal-button", "click", handleConfirmDeleteModalClick);
    addListener("filter-favorites", "click", handleFilterFavorites);
    // listen to sorting feature change
    addListener("memory-select", "change", handleMemorySelectChange);
    // listen to sorting direction change
    addListener("memory-sort-arrow", "click", handleMemorySortArrow);
    const tend = Date.now() / 1000;
    log("Total time to make the memory HTML (async) (s):" + (tend - tstart));
};

const openMemory = () => {
    global.state.menuIsOpen && closeMenu();
    global.state.memoryIsOpen = true;
    // hide menu button
    hideId("memory-switch-open");
    showId("memory-switch-close");
    hideId("menu-switch");
    dispatch("memory-switch", "blur");
    slideDown("memory-container", 200, () => {
        setTimeout(() => {
            dispatch("memory-search", "focus");
        }, 100);
    });
    setTimeout(() => {
        addListener("memory-search-clear-icon", "click", handleClearSearch);
        // set default sort to lastOpenDate
        val("memory-select", "lastOpenDate");
        // set default sort direction arrow down
        setMemorySortArrow("down");
    }, 200);
};

/**
 * Closes the memory overlay with slideUp
 */
const closeMemory = () => {
    dispatch("memory-switch", "blur");
    hideId("memory-switch-close");
    showId("memory-switch-open");
    slideUp("memory-container", 200, () => {
        val("memory-search", "");
        dispatch("memory-search", "clear-search");
        global.state.memoryIsOpen = false;
        if (global.state.showFavorites) {
            dispatch("filter-favorites", "click");
        }
        showId("menu-switch", "flex");
    });
};

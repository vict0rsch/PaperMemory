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
    return Array.from(STATE.paperTags)
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

/**
 * Delete a paper ; display a modal first to get uer confirmation
 * @param {string} id Id of the paper to delete
 */
const confirmDelete = (id) => {
    const title = STATE.papers[id].title;
    $("body").append(`
    <div style="width: 100%; height: 100%; background-color:  #e0e0e0; position: absolute; top: 0; left: 0; z-index: 100; display:  flex; justify-content:  center; align-items: center; flex-direction: column" id="confirm-modal">
    
    <div style="width: 80%; padding: 32px 32px; text-align: center; font-size: 1.1rem;">
        Are you sure you want to delete:
         <p>${title}</p>
         ?
    </div>
    
    <div style="width: 100%; text-align: center; padding: 32px;">
        <button style="padding: 8px 16px;" id="cancel-modal-button">Cancel</button>
        <span style="min-width: 32px;"></span>
        <button style="padding: 8px 16px;" id="confirm-modal-button">Confirm</button>
    </div>
    
    </div>
    `);
    $("#cancel-modal-button").on("click", () => {
        $("#confirm-modal").remove();
    });
    $("#confirm-modal-button").on("click", () => {
        delete STATE.papers[id];
        chrome.storage.local.set({ papers: STATE.papers }, () => {
            STATE.papersList = Object.values(STATE.papers);
            displayMemoryTable();
            $("#confirm-modal").remove();
            console.log("Successfully deleted '" + title + "' from ArxivMemory");
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
    let match = paper.pdfLink
        .split("/")
        .reverse()[0]
        .replace("-Paper.pdf", "")
        .replace(".pdf", "");
    if (match.match(/\d{5}v\d+$/) && paper.source === "arxiv") {
        match = match.split("v")[0];
    }

    chrome.tabs.query({ url: `*://${hostname}/*` }, (tabs) => {
        console.log({ hostname, match, tabs });

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

        STATE.papers[paper.id].count += 1;
        chrome.storage.local.set({ papers: STATE.papers });
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
    STATE.papers[id].note = note;
    const eid = id.replace(".", "\\.");
    chrome.storage.local.set({ papers: STATE.papers }, () => {
        console.log("Updated the note for " + STATE.papers[id].title);

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
    STATE.papers[id].codeLink = codeLink;
    const eid = id.replace(".", "\\.");
    chrome.storage.local.set({ papers: STATE.papers }, () => {
        console.log(`Updated the code for ${STATE.papers[id].title} to ${codeLink}`);
        findEl(eid, "memory-item-code-link").html(codeLink);
        $(`#popup-code-link`).text(codeLink);
        findEl(eid, "form-code-input").val(codeLink);
        codeLink ? $("#popup-code-link").show() : $("#popup-code-link").hide();
    });
};

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

const orderPapers = (paper1, paper2) => {
    let val1 = paper1[STATE.sortKey];
    let val2 = paper2[STATE.sortKey];

    if (typeof val1 === "string") {
        val1 = val1.toLowerCase();
        val2 = val2.toLowerCase();
    }
    if (["addDate", "count", "lastOpenDate"].indexOf(STATE.sortKey) >= 0) {
        return val1 > val2 ? -1 : 1;
    }
    return val1 > val2 ? 1 : -1;
};

const sortMemory = () => {
    STATE.sortedPapers = Object.values(cleanPapers(STATE.papers));
    STATE.sortedPapers.sort(orderPapers);
    STATE.papersList.sort(orderPapers);
};

const reverseMemory = () => {
    STATE.sortedPapers.reverse();
    STATE.papersList.reverse();
};

const filterMemoryByString = (letters) => {
    const words = letters.split(" ");
    let papersList = [];
    for (const paper of STATE.sortedPapers) {
        const title = paper.title.toLowerCase();
        const author = paper.author.toLowerCase();
        const note = paper.note.toLowerCase();
        if (
            words.every(
                (w) => title.includes(w) || author.includes(w) || note.includes(w)
            )
        ) {
            papersList.push(paper);
        }
    }
    STATE.papersList = papersList;
};

const filterMemoryByTags = (letters) => {
    const tags = letters.replace("t:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of STATE.sortedPapers) {
        const paperTags = paper.tags.map((t) => t.toLowerCase());
        if (tags.every((t) => paperTags.some((pt) => pt.indexOf(t) >= 0))) {
            papersList.push(paper);
        }
    }
    STATE.papersList = papersList;
};

const filterMemoryByCode = (letters) => {
    const words = letters.replace("c:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of STATE.sortedPapers) {
        let paperCode = paper.codeLink || "";
        paperCode = paperCode.toLowerCase();
        if (words.every((w) => paperCode.includes(w))) {
            papersList.push(paper);
        }
    }
    STATE.papersList = papersList;
};

const updatePaperTagsHTML = (id) => {
    const eid = id.replace(".", "\\.");
    findEl(eid, "tag-list").html(
        STATE.papers[id].tags
            .map((t) => `<span class="memory-tag">${t}</span>`)
            .join("")
    );
};

const updateTagOptions = (id) => {
    const eid = id.replace(".", "\\.");
    const tagOptions = getTagsHTMLOptions(id);
    findEl(eid, "memory-item-tags").html(tagOptions);
    $(`#popup-item-tags--${eid}`).html(tagOptions);
};

const updatePaperTags = (id, elementId) => {
    let tags = [];
    let ref;
    if (elementId.startsWith("#")) {
        ref = $(elementId);
    } else {
        const eid = id.replace(".", "\\.");
        ref = findEl(eid, elementId);
    }
    ref.find(":selected").each((k, el) => {
        const t = $.trim($(el).val());
        if (t !== "") tags.push(t);
    });

    tags.sort();
    updated = false;
    if (STATE.papers[id].tags !== tags) updated = true;
    STATE.papers[id].tags = tags;

    console.log("Update tags to: " + tags.join(", "));

    if (updated) {
        chrome.storage.local.set({ papers: STATE.papers }, () => {
            updateTagOptions(id);
            updatePaperTagsHTML(id);
            makeTags();
        });
    }
};

const makeTags = () => {
    let tags = new Set();
    for (const p of STATE.sortedPapers) {
        for (const t of p.tags) {
            tags.add(t);
        }
    }
    STATE.paperTags = Array.from(tags);
    STATE.paperTags.sort();
};

const displayMemoryTable = () => {
    const start = Date.now();

    var memoryTable = document.getElementById("memory-table");
    memoryTable.innerHTML = "";
    for (const paper of STATE.papersList) {
        memoryTable.insertAdjacentHTML("beforeend", getMemoryItemHTML(paper));
    }

    const end = Date.now();

    console.log("Rendering duration (s): " + (end - start) / 1000);

    $(".back-to-focus").on("click", (e) => {
        const { id, eid } = eventId(e);
        $(`#memory-item-container--${eid}`).focus();
    });
    $(".delete-memory-item").on("click", (e) => {
        const { id, eid } = eventId(e);
        confirmDelete(id);
    });
    $(".memory-item-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        focusExistingOrCreateNewPaperTab(STATE.papers[id]);
    });
    $(".memory-item-code-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        const url = STATE.papers[id].codeLink;
        focusExistingOrCreateNewCodeTab(url);
    });
    $(".memory-item-md").on("click", (e) => {
        const { id, eid } = eventId(e);
        const md = STATE.papers[id].md;
        copyAndConfirmMemoryItem(id, md, "Markdown link copied!");
    });
    $(".memory-item-bibtext").on("click", (e) => {
        const { id, eid } = eventId(e);
        const bibtext = STATE.papers[id].bibtext;
        copyAndConfirmMemoryItem(id, bibtext, "Bibtex copied!");
    });
    $(".memory-item-copy-link").on("click", (e) => {
        const { id, eid } = eventId(e);
        const pdfLink = STATE.papers[id].pdfLink;
        copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!");
    });
    $(".form-note-textarea").focus(function () {
        var that = this;
        textareaFocusEnd(that);
    });
    $(".form-note").submit((e) => {
        e.preventDefault();

        const { id, eid } = eventId(e);
        const note = findEl(eid, "form-note-textarea").val();
        const codeLink = findEl(eid, "form-code-input").val();

        saveNote(id, note);
        saveCodeLink(id, codeLink);
        updatePaperTags(id, "memory-item-tags");

        findEl(eid, "memory-item-edit").trigger("click");
    });
    $(".cancel-note-form").on("click", (e) => {
        e.preventDefault();
        const { id, eid } = eventId(e);
        findEl(eid, "form-note-textarea").val(STATE.papers[id].note);
        findEl(eid, "memory-item-tags").html(getTagsHTMLOptions(id));
        findEl(eid, "memory-item-edit").trigger("click");
    });
    $(".memory-item-edit").on("click", (e) => {
        e.preventDefault();
        const { id, eid } = eventId(e);
        const edit = findEl(eid, "memory-item-edit");
        const codeAndNote = findEl(eid, "code-and-note");
        const editPaper = findEl(eid, "extended-item");
        const tagList = findEl(eid, "tag-list");
        const tagEdit = findEl(eid, "edit-tags");
        const tagSelect = findEl(eid, "memory-item-tags");
        const actions = findEl(eid, "memory-item-actions");

        if (edit.hasClass("expand-open")) {
            edit.removeClass("expand-open");

            codeAndNote.slideDown(250);
            tagList.slideDown(250);
            actions.slideDown(250);

            editPaper.slideUp(250);
            tagEdit.slideUp(250);
        } else {
            edit.addClass("expand-open");

            tagSelect.select2({
                ...select2Options,
                width: "75%",
            });

            codeAndNote.slideUp(250);
            tagList.slideUp(250);
            actions.slideUp(250);

            editPaper.slideDown(250);
            tagEdit.slideDown(250);
            // findEl(eid, "memory-item-tags").focus()
        }
    });
    const end2 = Date.now();

    console.log("Listeners duration (s): " + (end2 - end) / 1000);
};

const openMemory = () => {
    var openTime = Date.now();
    STATE.menuIsOpen && closeMenu();

    STATE.memoryIsOpen = true;
    chrome.storage.local.get("papers", async function ({ papers }) {
        await initState(papers);

        $("#memory-search").attr(
            "placeholder",
            `Search ${STATE.papersList.length} entries ...`
        );

        if (STATE.papersList.length < 20) {
            delayTime = 0;
        } else if (STATE.papersList.length < 50) {
            delayTime = 200;
        } else {
            delayTime = 350;
        }

        $("#memory-search")
            .keypress(
                delay((e) => {
                    const query = $.trim($(e.target).val());
                    if (query.startsWith("t:")) {
                        filterMemoryByTags(query);
                    } else if (query.startsWith("c:")) {
                        filterMemoryByCode(query);
                    } else {
                        filterMemoryByString(query);
                    }
                    displayMemoryTable();
                }, delayTime)
            )
            .keyup((e) => {
                if (e.keyCode == 8) {
                    $("#memory-search").trigger("keypress");
                }
            });

        displayMemoryTable();
        setTimeout(() => {
            $("#memory-container").slideDown({
                duration: 200,
                easing: "easeOutQuint",
                complete: () => {
                    setTimeout(() => {
                        $("#memory-search").focus();
                        console.log(
                            "Time to display (s): " + (Date.now() - openTime) / 1000
                        );
                    }, 50);
                },
            });
        }, 100);
    });

    $("#tabler-menu").fadeOut();
    $("#memory-select").val("lastOpenDate");
    setMemorySortArrow("down");

    $("#memory-switch-text-on").fadeOut(() => {
        $("#memory-switch-text-off").fadeIn();
    });
    $("#memory-select").change((e) => {
        const sort = $(e.target).val();
        STATE.sortKey = sort;
        sortMemory();
        displayMemoryTable();
        setMemorySortArrow("down");
    });
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
    STATE.memoryIsOpen = false;
};

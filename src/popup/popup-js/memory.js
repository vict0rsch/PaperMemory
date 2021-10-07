/*
TODO: add code to paper popup | esc to close edit

*/

const getMemoryItemHTML = (item) => {
    const addDate = (new Date(item.addDate)).toLocaleString().replace(",", "")
    const lastOpenDate = (new Date(item.lastOpenDate)).toLocaleString().replace(",", "")
    const displayId = item.id.indexOf("_") < 0 ? item.id : item.id.split("_")[0];
    const note = item.note || "";
    const id = item.id;
    const tags = new Set(item.tags);
    const tagOptions = getTagsHTMLOptions(id)
    let codeDiv = `
    <small class="memory-item-faded">
    <span class="memory-item-code-link">${item.codeLink || ""}</span>
    </small>
    `
    let noteDiv = `<div class="memory-note-div memory-item-faded"></div>`;
    if (item.note) {
        noteDiv = `
        <div class="memory-note-div memory-item-faded">
            <span class="note-content-header">Note:</span>
            <span class="note-content">${note}</span>
        </div>
        `
    }

    return `
    <div class="memory-item-container" tabindex="0" id="memory-item-container--${id}">

        <h4 class="memory-item-title" title="Added ${addDate}&#13;&#10;Last open ${lastOpenDate}">
            ${item.title}
        </h4>
        <div class="memory-item-tags-div">
            <small class="tag-list">
                ${Array.from(tags).map(t => `<span class="memory-tag">${t}</span>`).join("")}
            </small>
            <div class="edit-tags">
                <div style="display:flex; align-items: center"; justify-content: space-between">
                    <select class="memory-item-tags" multiple="multiple">
                        ${tagOptions}
                    </select>
                </div>
            </div>
        </div>
        <small class="authors">${item.author}</small>
        
        <div class="code-and-note">
            ${codeDiv}
            ${noteDiv}
        </div>

        <div class="memory-item-actions">

            <div style="display: flex; align-items: center">
                <div class="memory-item-edit memory-item-svg-div" title="Edit paper details">
                    <svg >
                        <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-writing" />
                    </svg>
                </div>
                
                <small class="memory-item-faded">
                        ${displayId}
                </small>
                        
            </div>

            <div class="memory-item-link memory-item-svg-div"  title="Open ${item.pdfLink}" >
                <svg >
                   <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-external-link" />
                </svg>
            </div>
                
            <div class="memory-item-copy-link memory-item-svg-div" title="Copy pdf link" >
                <svg >
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-link" />
                </svg>
            </div>

            <div class="memory-item-md memory-item-svg-div" title="Copy Markdown-formatted link" >
                <svg >
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-clipboard-list" />
                </svg>
            </div>

            <div class="memory-item-bibtext memory-item-svg-div" title="Copy Bibtex citation" >
                <svg >
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-archive" />
                </svg>
            </div>

            <span style="color: green; display: none" class="memory-item-feedback"></span>
            
            <div title="Number of times you have loaded&#13;&#10;the paper's Page or PDF"  class="memory-item-faded">
                Visits: ${item.count}
            </div>

        </div>

        <div class="extended-item" style="display: none">
            <div class="item-note">
                <form class="form-note">
                    <div class="textarea-wrapper">
                        <span class="label">Code:</span>
                        <input type="text" class="form-code-input" value="${item.codeLink || ''}">
                    </div>
                    <div class="textarea-wrapper">
                        <span class="label">Note:</span>
                        <textarea rows="3" class="form-note-textarea">${note}</textarea>
                    </div>
                    <div class="form-note-buttons">
                        <button type="submit">Save</button>
                        <button class="cancel-note-form back-to-focus">Cancel</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="delete-memory-item"> - </div>
    </div>
    `
}

const findEl = (eid, className) => {
    return $(`#memory-item-container--${eid}`).find(`.${className}`).first()
}


const getTagsHTMLOptions = id => {
    const item = state.papers[id];
    const tags = new Set(item.tags);
    return Array.from(state.paperTags).sort().map((t, i) => {
        let h = `<option value="${t}"`;
        if (tags.has(t)) {
            h += ' selected="selected" '
        }
        return h + `>${t}</option>`
    }).join("");
}

const confirmDelete = id => {
    const title = state.papers[id].title;
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
    `)
    $("#cancel-modal-button").click(() => {
        $("#confirm-modal").remove()
    })
    $("#confirm-modal-button").click(() => {
        delete state.papers[id]
        chrome.storage.local.set({ "papers": state.papers }, () => {
            state.papersList = Object.values(state.papers);
            displayMemoryTable()
            $("#confirm-modal").remove()
            console.log("Successfully deleted '" + title + "' from ArxivMemory")
        })
    })

}

const copyAndConfirmMemoryItem = (id, textToCopy, feedbackText, isPopup) => {
    copyTextToClipboard(textToCopy)
    const eid = id.replace(".", "\\.");
    const elementId = isPopup ? `#popup-feedback-copied` : findEl(eid, "memory-item-feedback");
    $(elementId).text(feedbackText)
    $(elementId).fadeIn()
    setTimeout(
        () => {
            $(elementId).text("")
        },
        1000
    )
}

const focusExistingOrCreateNewCodeTab = (codeLink) => {
    const { origin } = new URL(codeLink);
    chrome.tabs.query({ url: `${origin}/*` }, tabs => {
        for (const tab of tabs) {
            if (tab.url.includes(codeLink)) {
                const tabUpdateProperties = { 'active': true };
                const windowUpdateProperties = { 'focused': true };
                chrome.windows.getCurrent((w) => {
                    if (w.id !== tab.windowId) {
                        chrome.windows.update(tab.windowId, windowUpdateProperties, () => {
                            chrome.tabs.update(tab.id, tabUpdateProperties);
                        });
                    } else {
                        chrome.tabs.update(tab.id, tabUpdateProperties);
                    }
                })
                return
            }
        }
        chrome.tabs.create({ url: codeLink });
    });

}

const focusExistingOrCreateNewPaperTab = (paperUrl, id) => {
    chrome.tabs.query({ url: "https://arxiv.org/*" }, (tabs) => {
        let validTabsIds = [];
        let pdfTabsIds = [];
        const urls = tabs.map(t => t.url);
        let idx = 0;
        for (const u of urls) {
            if (u.indexOf(id) >= 0) {
                validTabsIds.push(idx);
                if (u.endsWith(".pdf")) {
                    pdfTabsIds.push(idx);
                }
            }
            idx += 1
        }
        if (validTabsIds.length > 0) {
            let tab;
            if (pdfTabsIds.length > 0) {
                tab = tabs[pdfTabsIds[0]];
            } else {
                tab = tabs[validTabsIds[0]];
            }
            const tabUpdateProperties = { 'active': true };
            const windowUpdateProperties = { 'focused': true };
            chrome.windows.getCurrent((w) => {
                if (w.id !== tab.windowId) {
                    chrome.windows.update(tab.windowId, windowUpdateProperties, () => {
                        chrome.tabs.update(tab.id, tabUpdateProperties);
                    });
                } else {
                    chrome.tabs.update(tab.id, tabUpdateProperties);
                }
            })
        } else {
            chrome.tabs.create({ url: paperUrl });
        }

        state.papers[id].count += 1;
        chrome.storage.local.set({ "papers": state.papers });

    });
}


const saveNote = (id, note) => {
    note = $.trim(note);
    state.papers[id].note = note;
    const eid = id.replace(".", "\\.")
    chrome.storage.local.set({ "papers": state.papers }, () => {
        console.log("Updated the note for " + state.papers[id].title);

        findEl(eid, "memory-note-div").html(note ? `
        <div class="memory-note-div memory-item-faded">
            <span class="note-content-header">Note:</span>
            <span class="note-content">${note}</span>
        </div>
        ` : `<div class="memory-note-div memory-item-faded"></div>`);
        $(`#popup-form-note-textarea--${eid}`).val(note);
        findEl(eid, "form-note-textarea").val(note);
    })
}
const saveCodeLink = (id, codeLink) => {
    codeLink = $.trim(codeLink);
    state.papers[id].codeLink = codeLink;
    const eid = id.replace(".", "\\.")
    chrome.storage.local.set({ "papers": state.papers }, () => {
        console.log("Updated the code for " + state.papers[id].title + " to " + codeLink);
        findEl(eid, "memory-item-code-link").html(codeLink);
        $(`#popup-code-link`).text(codeLink); // TODO
        findEl(eid, "form-code-input").val(codeLink);
        if (codeLink) {
            $("#popup-code-link").show();
        } else {
            $("#popup-code-link").hide();
        }
    })
}

const setMemorySortArrow = direction => {
    let arrow;
    if (direction === "up") {
        arrow = `<svg class="memory-sort-arrow-svg" id="memory-sort-arrow-up">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-arrow-narrow-up" />
                </svg>`
    } else {
        arrow = `<svg class="memory-sort-arrow-svg" id="memory-sort-arrow-down">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-arrow-narrow-down" />
                </svg>`
    }

    $("#memory-sort-arrow").html(arrow)
}


const orderPapers = (paper1, paper2) => {
    let val1 = paper1[state.sortKey];
    let val2 = paper2[state.sortKey];

    if (typeof val1 === "string") {
        val1 = val1.toLowerCase();
        val2 = val2.toLowerCase();
    }
    if (["addDate", "count", "lastOpenDate"].indexOf(state.sortKey) >= 0) {
        return val1 > val2 ? -1 : 1
    }
    return val1 > val2 ? 1 : -1
}

const sortMemory = () => {
    state.sortedPapers = Object.values(state.papers)
    state.sortedPapers.sort(orderPapers)
    state.papersList.sort(orderPapers);
}

const reverseMemory = () => {
    state.sortedPapers.reverse()
    state.papersList.reverse()
}

const filterMemoryByString = (letters) => {
    const words = letters.split(" ")
    let papersList = [];
    for (const paper of state.sortedPapers) {
        const title = paper.title.toLowerCase();
        const author = paper.author.toLowerCase();
        const note = paper.note.toLowerCase();
        if (
            words.every(w => title.includes(w) || author.includes(w) || note.includes(w))
        ) {
            papersList.push(paper)
        }
    }
    state.papersList = papersList;
}

const filterMemoryByTags = (letters) => {
    const tags = letters.replace("t:", "").toLowerCase().split(" ")
    let papersList = [];
    for (const paper of state.sortedPapers) {
        const paperTags = paper.tags.map(t => t.toLowerCase());
        if (
            tags.every(t => paperTags.some(pt => pt.indexOf(t) >= 0))
        ) {
            papersList.push(paper)
        }
    }
    state.papersList = papersList;
}

const updatePaperTagsHTML = id => {
    const eid = id.replace(".", "\\.");
    findEl(eid, "tag-list").html(
        state.papers[id].tags.map(t => `<span class="memory-tag">${t}</span>`).join("")
    )
}

const updateTagOptions = id => {
    const eid = id.replace(".", "\\.");
    const tagOptions = getTagsHTMLOptions(id);
    findEl(eid, "memory-item-tags").html(tagOptions)
    $(`#popup-item-tags--${eid}`).html(tagOptions);
}


const updatePaperTags = (id, elementId) => {

    let tags = [];
    let ref;
    if (elementId.startsWith("#")) {
        ref = $(elementId);
    } else {
        const eid = id.replace(".", "\\.");
        ref = findEl(eid, elementId)
    }
    ref.find(":selected").each((k, el) => {
        const t = $.trim($(el).val());
        if (t !== "") tags.push(t)
    });

    tags.sort();
    updated = false;
    if (state.papers[id].tags !== tags) updated = true;
    state.papers[id].tags = tags;

    console.log("Update tags to: " + tags.join(", "))

    if (updated) {
        chrome.storage.local.set({ "papers": state.papers }, () => {
            updateTagOptions(id)
            updatePaperTagsHTML(id)
            makeTags()
        });
    }
}

const makeTags = () => {
    let tags = new Set();
    for (const p of state.sortedPapers) {
        for (const t of p.tags) {
            tags.add(t)
        }
    }
    state.paperTags = Array.from(tags);
    state.paperTags.sort();
}

const displayMemoryTable = () => {

    const start = Date.now();

    var memoryTable = document.getElementById("memory-table");
    memoryTable.innerHTML = "";
    for (const paper of state.papersList) {
        memoryTable.insertAdjacentHTML('beforeend', getMemoryItemHTML(paper));
    }

    const end = Date.now();

    console.log("Rendering duration (s): " + (end - start) / 1000)

    $(".back-to-focus").click((e) => {
        const { id, eid } = eventId(e);
        $(`#memory-item-container--${eid}`).focus();
    })
    $(".delete-memory-item").click((e) => {
        const { id, eid } = eventId(e);
        confirmDelete(id)
    })
    $(".memory-item-link").click((e) => {
        const { id, eid } = eventId(e);
        const url = state.papers[id].pdfLink;
        focusExistingOrCreateNewPaperTab(url, id)
    })
    $(".memory-item-code-link").click((e) => {
        const { id, eid } = eventId(e);
        const url = state.papers[id].codeLink;
        focusExistingOrCreateNewCodeTab(url);
    })
    $(".memory-item-md").click((e) => {
        const { id, eid } = eventId(e);
        const md = state.papers[id].md;
        copyAndConfirmMemoryItem(id, md, "Markdown link copied!")
    })
    $(".memory-item-bibtext").click((e) => {
        const { id, eid } = eventId(e);
        const bibtext = state.papers[id].bibtext;
        copyAndConfirmMemoryItem(id, bibtext, "Bibtex copied!")
    })
    $(".memory-item-copy-link").click((e) => {
        const { id, eid } = eventId(e);
        const pdfLink = state.papers[id].pdfLink;
        copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!")
    })
    $(".form-note").submit((e) => {
        e.preventDefault();

        const { id, eid } = eventId(e);
        const note = findEl(eid, "form-note-textarea").val()
        const codeLink = findEl(eid, "form-code-input").val()

        saveNote(id, note);
        saveCodeLink(id, codeLink);
        updatePaperTags(id, "memory-item-tags");

        findEl(eid, "memory-item-edit").click()
    });
    $(".cancel-note-form").click((e) => {
        e.preventDefault();
        const { id, eid } = eventId(e);
        findEl(eid, "form-note-textarea").val(state.papers[id].note)
        findEl(eid, "memory-item-tags").html(getTagsHTMLOptions(id));
        findEl(eid, "memory-item-edit").click()
    })
    $(".memory-item-edit").click((e) => {
        e.preventDefault();
        const { id, eid } = eventId(e);
        const edit = findEl(eid, "memory-item-edit");
        const codeAndNote = findEl(eid, "code-and-note");
        const editPaper = findEl(eid, "extended-item");
        const tagList = findEl(eid, "tag-list");
        const tagEdit = findEl(eid, "edit-tags");
        const tagSelect = findEl(eid, "memory-item-tags");
        const actions = findEl(eid, "memory-item-actions");


        if (edit.hasClass('expand-open')) {

            edit.removeClass("expand-open");

            codeAndNote.slideDown(250);
            tagList.slideDown(250);
            actions.slideDown(250);

            editPaper.slideUp(250);
            tagEdit.slideUp(250)

        } else {

            edit.addClass("expand-open");

            tagSelect.select2({
                placeholder: "Tag paper...",
                maximumSelectionLength: 5,
                allowClear: true,
                tags: true,
                width: "75%",
                tokenSeparators: [',', ' ']
            });

            codeAndNote.slideUp(250);
            tagList.slideUp(250);
            actions.slideUp(250);

            editPaper.slideDown(250);
            tagEdit.slideDown(250)
            // findEl(eid, "memory-item-tags").focus()
        }
    })
    const end2 = Date.now();

    console.log("Listeners duration (s): " + (end2 - end) / 1000)

}

const openMemory = () => {
    var openTime = Date.now();
    state.menuIsOpen && closeMenu();

    state.memoryIsOpen = true;
    chrome.storage.local.get("papers", async function ({ papers }) {

        await initState(papers);

        $("#memory-search").attr("placeholder", `Search ${state.papersList.length} entries ...`);

        if (state.papersList.length < 20) {
            delayTime = 0;
        } else if (state.papersList.length < 50) {
            delayTime = 200;
        } else {
            delayTime = 350;
        }

        $("#memory-search").keypress(delay((e) => {
            const query = $.trim($(e.target).val());
            if (query.startsWith("t:")) {
                filterMemoryByTags(query)
            } else {
                filterMemoryByString(query);
            }
            displayMemoryTable();
        }, delayTime)).keyup((e) => {
            if (e.keyCode == 8) {
                $('#memory-search').trigger('keypress');
            }
        })

        displayMemoryTable()
        setTimeout(() => {
            $("#memory-container").slideDown({
                duration: 200,
                easing: "easeOutQuint",
                complete: () => {
                    setTimeout(() => {
                        $("#memory-search").focus();
                        console.log("Time to display (s): " + (Date.now() - openTime) / 1000)
                    }, 50);
                }
            });
        }, 100);

    })

    $("#tabler-menu").fadeOut();
    $("#memory-select").val("lastOpenDate");
    setMemorySortArrow("down");

    $("#memory-switch-text-on").fadeOut(() => {
        $("#memory-switch-text-off").fadeIn()
    });
    $("#memory-select").change((e) => {
        const sort = $(e.target).val();
        state.sortKey = sort;
        sortMemory();
        displayMemoryTable();
        setMemorySortArrow("down")
    })
    $("#memory-sort-arrow").click((e) => {
        if ($("#memory-sort-arrow svg").first()[0].id === "memory-sort-arrow-down") {
            setMemorySortArrow("up")
        } else {
            setMemorySortArrow("down")
        }
        reverseMemory()
        displayMemoryTable()
    })
    $(document).on('keydown', function (e) {
        if (!state.memoryIsOpen) {
            return
        }
        if ([8, 13, 69, 78].indexOf(e.which) < 0) {
            return
        }

        const el = $(".memory-item-container:focus").first();
        if (el.length !== 1) return
        e.preventDefault();
        const id = el.attr('id').split("--")[1];
        const eid = id.replace(".", "\\.");

        if (e.which == 13) { // enter
            findEl(eid, "memory-item-link").click();
        }
        else if (e.which == 8) { // delete
            findEl(eid, "delete-memory-item").click()
        }
        else if (e.which == 69) { // e
            findEl(eid, "memory-item-edit").click();
        }
        else if (e.which == 78) { // n
            findEl(eid, "memory-item-edit").click();
            findEl(eid, "memory-item-tag").click();
            findEl(eid, "form-note-textarea").focus();
        }
    });
}

const closeMemory = () => {
    $("#memory-container").slideUp({
        duration: 300,
        easing: "easeOutQuint"
    });
    $("#memory-switch-text-off").fadeOut(() => {
        $("#memory-switch-text-on").fadeIn()
    });
    $("#tabler-menu").fadeIn()
    state.memoryIsOpen = false;
}
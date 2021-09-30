const closeMenu = () => {
    $("#menuDiv").slideUp({
        duration: 500,
        easing: "easeOutQuint"
    }) && $("#tabler-menu").fadeOut(() => {
        $("#tabler-menu").html(`
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-adjustments" />
                </svg>
            `);
        $("#tabler-menu").fadeIn()
    })
}

const openMenu = () => {
    $("#menuDiv").slideDown({
        duration: 500,
        easing: "easeOutQuint"
    }) && $("#tabler-menu").fadeOut(() => {
        $("#tabler-menu").html(`
        <svg class="tabler-icon menu-svg">
            <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-circle-x" />
        </svg>
    `);
        $("#tabler-menu").fadeIn()
    })
}



const main = tab => {

    var feedbackTimeout = null;
    var feedbackPrevent = false;

    const feedback = () => {
        try {
            clearTimeout(feedbackTimeout)
            $("#feedback-notif").remove();
            feedbackPrevent = true;
        } catch (error) {
            console.log("No feedback to remove.")
        }
        $("#menuDiv").append(`
            <div id="check-feedback">
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-floppy-disk" />
                </svg>
            </div>
        `)
        $("#check-feedback").animate({
            right: "12px",
            opacity: "1"
        }, 300, "easeInOutBack");
        feedbackTimeout = setTimeout(() => {
            $("#check-feedback").animate({
                right: "-100px",
                opacity: "0"
            }, 300, "easeInOutBack", () => {
                !feedbackPrevent && $("#check-feedback").remove();
                feedbackPrevent = false;
            });

        }, 1500)
    }

    const url = parseUrl(tab.url);
    // console.log(url);


    $("#helpGithubLink").click(() => {
        chrome.tabs.update({
            url: "https://github.com/vict0rsch/ArxivTools"
        });
    })
    $("#coblock").click(() => {
        chrome.tabs.update({
            url: "https://marketplace.visualstudio.com/items?itemName=vict0rsch.coblock"
        });
    })
    $(document).on('keydown', function (e) {
        if (state.memoryIsOpen) {
            return
        }
        if (e.which == 13) {
            const el = $("#memory-switch-text-on:focus").first();
            if (el.length !== 1) return
            $("#memory-switch-text-on").click()
        }
    })

    $("#tabler-menu").click(() => {
        state.menuIsOpen ?
            closeMenu()
            :
            openMenu()
        state.menuIsOpen = !state.menuIsOpen;
    })

    $("#memory-switch").click(() => {
        state.memoryIsOpen ?
            closeMemory()
            :
            openMemory()
        state.memoryIsOpen = !state.memoryIsOpen;
    })

    $("#download-arxivmemory").click(() => {
        const now = (new Date()).toLocaleString();
        chrome.storage.local.get("papers", ({ papers }) => {
            downloadTextFile(JSON.stringify(papers), `arxiv-memory-${now}.json`, "text/json")
        })
    })

    const checks = ["checkBib", "checkMd", "checkDownload", "checkPdfTitle", "checkVanity", "checkMemory"]
    chrome.storage.local.get(checks, function (items) {

        const hasKey = {};
        for (const key of checks) {
            hasKey[key] = items.hasOwnProperty(key);
        }
        const setValues = {}
        for (const key of checks) {
            setValues[key] = hasKey[key] ? items[key] : true;
        }
        chrome.storage.local.set(setValues, function () {
            chrome.storage.local.get(checks, function (items) {
                for (const key of checks) {
                    $("#" + key).prop("checked", items[key]);
                    setValues[key] = hasKey[key] ? items[key] : true;
                }
            });
        });

        for (const key of checks) {
            $("#" + key).change(function () {
                const checked = this.checked;
                chrome.storage.local.set({ [key]: checked }, function () {
                    feedback()
                    console.log(`Settings saved for ${key} (${checked})`);
                });
            });
        }


        if (url.hostname === "arxiv.org") {
            $("#notArxiv").hide();
            $("#notPdf").hide();
            $("#isArxiv").show();
            const id = url.href.split("/").reverse()[0].replace(".pdf", "").split("v")[0];

            chrome.storage.local.get("papers", ({ papers }) => {
                if (!papers.hasOwnProperty(id)) return
                initState(papers)
                const paper = papers[id];
                $("#popup-paper-title").text(paper.title);
                $("#popup-authors").text(paper.author);
                const eid = id.replace(".", "\\.");
                const tagOptions = getTagsHTMLOptions(id);
                const note = paper.note || "";
                // ----------------------------------
                // -----  Customize Popup html  -----
                // ----------------------------------
                $("#popup-memory-edit").append(`
                    <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                        <span style="margin-right: 4px">Tags:</span>
                        <select id="popup-item-tags--${id}"class="memory-item-tags" multiple="multiple">
                            ${tagOptions}
                        </select>
                        <button class="back-to-focus" id="popup-save-tag-edit--${id}">Save</button>
                    </div>
                    <form 
                        class="form-note" 
                        id="popup-form-note--${id}" 
                        style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: 8px;"
                    >
                        <span style="margin-right: 4px">Note:</span>
                        <textarea 
                            rows="3" 
                            style="width:68%; border-radius: 4px; border-color: #aaaaaa" 
                            id="popup-form-note-textarea--${id}"
                        >${note}</textarea>
                        <button type="submit">Save</button>
                    </form>
                    
                `)
                $("#popup-copy-icons").html(`
                    <div
                        class="memory-item-svg-div" 
                        id="popup-memory-item-link--${id}"
                        title="Open Paper Arxiv Page"
                        style="display: ${url.href.indexOf(".pdf") < 0 ? "none" : "inherit"}"
                    >
                        <svg  style="height: 25px; width: 25px; pointer-events: none;" >
                        <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-external-link" />
                        </svg>
                    </div>
                    <div 
                        class="memory-item-svg-div"
                        id="popup-memory-item-copy-link--${id}"
                        title="Copy pdf link" 
                    >
                        <svg style="height: 25px; width: 25px; pointer-events: none;" >
                            <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-link" />
                        </svg>
                    </div>
        
                    <div 
                        class="memory-item-svg-div"
                        id="popup-memory-item-md--${id}"
                        title="Copy Markdown-formatted link" 
                    >
                        <svg style="height: 25px; width: 25px; pointer-events: none;" >
                            <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-clipboard-list" />
                        </svg>
                    </div>
                    <div 
                        class="memory-item-svg-div"
                        id="popup-memory-item-bibtex--${id}"
                        title="Copy Bibtex citation" 
                    >
                        <svg style="height: 25px; width: 25px; pointer-events: none;" >
                            <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-archive" />
                        </svg>
                    </div>
                `)
                // ------------------------------------
                // -----  Paper attributes edits  -----
                // ------------------------------------
                $(`#popup-item-tags--${eid}`).select2({
                    placeholder: "Tag paper...",
                    maximumSelectionLength: 5,
                    allowClear: true,
                    tags: true,
                    width: "70%",
                    tokenSeparators: [',', ' ']
                });
                $("body").css("height", "auto")
                $(`#popup-save-tag-edit--${eid}`).click(() => {
                    updatePaperTags(id, `#popup-item-tags--${eid}`);
                    $("#popup-feedback-copied").text("Saved tags!")
                    $("#popup-feedback-copied").fadeIn()
                    setTimeout(() => { $("#popup-feedback-copied").text("") }, 1000)
                });
                $(`#popup-form-note--${eid}`).submit((e) => {
                    e.preventDefault();
                    const note = $(`#popup-form-note-textarea--${eid}`).val()
                    saveNote(id, note)
                    $("#popup-feedback-copied").text("Saved note!")
                    $("#popup-feedback-copied").fadeIn()
                    setTimeout(() => { $("#popup-feedback-copied").text("") }, 1000)
                });
                // ------------------------
                // -----  SVG clicks  -----
                // ------------------------
                $(`#popup-memory-item-link--${eid}`).click(() => {
                    chrome.tabs.update({
                        url: `https://arxiv.org/abs/${paper.id}`
                    });
                    window.close()
                })
                $(`#popup-memory-item-copy-link--${eid}`).click(() => {
                    const pdfLink = state.papers[id].pdfLink;
                    copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!", true)
                })
                $(`#popup-memory-item-md--${eid}`).click(() => {
                    const md = state.papers[id].md;
                    copyAndConfirmMemoryItem(id, md, "MarkDown link copied!", true)
                })
                $(`#popup-memory-item-bibtex--${eid}`).click(() => {
                    const bibtext = state.papers[id].bibtext;
                    copyAndConfirmMemoryItem(id, bibtext, "Bibtex citation copied!", true)
                })
            })

        }
    });
}

$(() => {

    chrome.tabs.query({
        'active': true,
        'lastFocusedWindow': true
    }, function (tabs) {
        var url = tabs[0].url;
        main(tabs[0])
    });

});

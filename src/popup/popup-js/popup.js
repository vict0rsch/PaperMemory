const closeMenu = () => {
    $("#menuDiv").slideUp({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            $("#tabler-menu").html(`
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-adjustments" />
                </svg>
            `);
            $("#tabler-menu").fadeIn();
        });
    state.menuIsOpen = false;
};

const openMenu = () => {
    $("#menuDiv").slideDown({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            $("#tabler-menu").html(`
            <svg class="tabler-icon menu-svg">
                <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-circle-x" />
            </svg>`);
            $("#tabler-menu").fadeIn();
        });
    state.menuIsOpen = true;
};

var feedbackTimeout = null;
var feedbackPrevent = false;

const feedback = () => {
    try {
        clearTimeout(feedbackTimeout);
        $("#feedback-notif").remove();
        feedbackPrevent = true;
    } catch (error) {
        console.log("No feedback to remove.");
    }
    $("#menuDiv").append(`
        <div id="check-feedback">
            <svg class="tabler-icon">
                <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-floppy-disk" />
            </svg>
        </div>
    `);
    $("#check-feedback").animate(
        {
            right: "12px",
            opacity: "1",
        },
        300,
        "easeInOutBack"
    );
    feedbackTimeout = setTimeout(() => {
        $("#check-feedback").animate(
            {
                right: "-100px",
                opacity: "0",
            },
            300,
            "easeInOutBack",
            () => {
                !feedbackPrevent && $("#check-feedback").remove();
                feedbackPrevent = false;
            }
        );
    }, 1500);
};

const main = (tab) => {
    const url = parseUrl(tab.url);
    const checks = [
        "checkBib",
        "checkMd",
        "checkDownload",
        "checkPdfTitle",
        "checkVanity",
    ];
    let storageKeys = [...checks, "pdfTitleFn"];

    $("#helpGithubLink").on("click", () => {
        chrome.tabs.update({
            url: "https://github.com/vict0rsch/ArxivMemory",
        });
    });

    $("#coblock").on("click", () => {
        chrome.tabs.update({
            url: "https://marketplace.visualstudio.com/items?itemName=vict0rsch.coblock",
        });
    });

    $("#tabler-menu").on("click", () => {
        state.menuIsOpen ? closeMenu() : openMenu();
    });

    $("#memory-switch").on("click", () => {
        state.memoryIsOpen ? closeMemory() : openMemory();
    });

    $("#download-arxivmemory").on("click", () => {
        const now = new Date().toLocaleString();
        chrome.storage.local.get("papers", ({ papers }) => {
            downloadTextFile(
                JSON.stringify(papers),
                `arxiv-memory-${now}.json`,
                "text/json"
            );
        });
    });

    $(document).on("keydown", handlePopupKeydown);

    chrome.storage.local.get(storageKeys, function (dataItems) {
        // Set checkboxes

        const hasKey = {};
        for (const key of checks) {
            hasKey[key] = dataItems.hasOwnProperty(key);
        }
        const setValues = {};
        for (const key of checks) {
            setValues[key] = hasKey[key] ? dataItems[key] : true;
        }
        chrome.storage.local.set(setValues, function () {
            chrome.storage.local.get(checks, function (dataItems) {
                for (const key of checks) {
                    $("#" + key).prop("checked", dataItems[key]);
                    setValues[key] = hasKey[key] ? dataItems[key] : true;
                }
            });
        });

        for (const key of checks) {
            $("#" + key).change(function () {
                const checked = this.checked;
                chrome.storage.local.set({ [key]: checked }, function () {
                    feedback();
                    console.log(`Settings saved for ${key} (${checked})`);
                });
            });
        }

        // Set PDF title function

        if (dataItems.pdfTitleFn && typeof dataItems.pdfTitleFn === "string") {
            state.pdfTitleFn = getPdfFn(dataItems.pdfTitleFn);
        }

        chrome.storage.local.set({ pdfTitleFn: state.pdfTitleFn.toString() });
        $("#customPdfTitleTextarea").val(pdfTitleFn.toString());
        $("#saveCustomPdf").on("click", () => {
            const code = $.trim($("#customPdfTitleTextarea").val());
            try {
                const fn = eval(code);
                fn("test", "1.2");
                $("#customPdfFeedback").html(
                    `<span style="color: green">Saved!</span>`
                );
                chrome.storage.local.set({ pdfTitleFn: code });
                state.pdfTitleFn = fn;
                setTimeout(() => {
                    $("#customPdfFeedback").html("");
                }, 1000);
            } catch (error) {
                $("#customPdfFeedback").html(
                    `<span style="color: red">${error}</span>`
                );
            }
        });
        $("#defaultCustomPdf").on("click", () => {
            const code = defaultPDFTitleFn.toString();
            chrome.storage.local.set({ pdfTitleFn: code });
            state.pdfTitleFn = defaultPDFTitleFn;
            $("#customPdfTitleTextarea").val(code);
            $("#customPdfFeedback").html(`<span style="color: green">Saved!</span>`);
            setTimeout(() => {
                $("#customPdfFeedback").html("");
            }, 1000);
        });

        // Display popup metadata

        const is = isPaper(tab.url);

        if (Object.values(is).some((i) => i)) {
            $("#notArxiv").hide();
            $("#notPdf").hide();
            $("#isArxiv").show();
            const id = parseIdFromUrl(tab.url);

            chrome.storage.local.get("papers", async ({ papers }) => {
                await initState(papers);
                if (!papers.hasOwnProperty(id)) {
                    console.log("Unknown id " + id);
                    return;
                }

                const paper = state.papers[id];
                $("#popup-paper-title").text(paper.title);
                $("#popup-authors").text(paper.author);
                if (paper.codeLink) {
                    $("#popup-code-link").show();
                    $("#popup-code-link").text(paper.codeLink);
                }
                const eid = id.replace(".", "\\.");
                const tagOptions = getTagsHTMLOptions(id);
                const note = paper.note || "";
                // ----------------------------------
                // -----  Customize Popup html  -----
                // ----------------------------------
                $("#popup-memory-edit").append(getPopupItemHTML(paper));
                $("#popup-copy-icons").html(getPopupIconsHTML(paper, url));
                // ------------------------------------
                // -----  Paper attributes edits  -----
                // ------------------------------------
                $(`#popup-item-tags--${eid}`).select2({
                    ...select2Options,
                    width: "87%",
                });
                $("body").css("height", "auto");
                $(`#popup-form-note-textarea--${eid}`).focus(function () {
                    var that = this;
                    setTimeout(function () {
                        that.selectionStart = that.selectionEnd = 10000;
                    }, 0);
                });
                $(`#popup-save-edits--${eid}`).on("click", () => {
                    const note = $(`#popup-form-note-textarea--${eid}`).val();
                    const codeLink = $(`#popup-form-note--${eid}`)
                        .find(".form-code-input")
                        .first()
                        .val();
                    updatePaperTags(id, `#popup-item-tags--${eid}`);
                    saveNote(id, note);
                    saveCodeLink(id, codeLink);
                    $("#popup-feedback-copied").text("Saved tags, code & note!");
                    $("#popup-feedback-copied").fadeIn();
                    setTimeout(() => {
                        $("#popup-feedback-copied").fadeOut();
                    }, 1000);
                });
                // ------------------------
                // -----  SVG clicks  -----
                // ------------------------
                $(`#popup-memory-item-link--${eid}`).on("click", () => {
                    chrome.tabs.update({
                        url: `https://arxiv.org/abs/${paper.id.replace("Arxiv-", "")}`,
                    });
                    window.close();
                });
                $(`#popup-code-link`).on("click", () => {
                    const codeLink = $(`#popup-code-link`).text();
                    if (codeLink) {
                        focusExistingOrCreateNewCodeTab(codeLink);
                    }
                });
                $(`#popup-memory-item-copy-link--${eid}`).on("click", () => {
                    const pdfLink = state.papers[id].pdfLink;
                    copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!", true);
                });
                $(`#popup-memory-item-md--${eid}`).on("click", () => {
                    const md = state.papers[id].md;
                    copyAndConfirmMemoryItem(id, md, "MarkDown link copied!", true);
                });
                $(`#popup-memory-item-bibtex--${eid}`).on("click", () => {
                    const bibtext = formatBibtext(state.papers[id].bibtext);
                    copyAndConfirmMemoryItem(
                        id,
                        bibtext,
                        "Bibtex citation copied!",
                        true
                    );
                });
                $(`#popup-memory-item-download--${eid}`).on("click", () => {
                    let pdfTitle = statePdfTitle(paper.title, paper.id);
                    console.log({ pdfTitle });
                    chrome.downloads.download({
                        url: paper.pdfLink,
                        filename: pdfTitle.replaceAll(":", "_"),
                    });
                });
            });
        }
    });
};

$(() => {
    chrome.tabs.query(
        {
            active: true,
            lastFocusedWindow: true,
        },
        async function (tabs) {
            var url = tabs[0].url;
            main(tabs[0]);
        }
    );
});

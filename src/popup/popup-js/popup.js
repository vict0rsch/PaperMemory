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
    // $(document).on('keydown', function (e) {
    //     if (state.memoryIsOpen) {
    //         return
    //     }
    //     if (e.which == 13) {
    //         const el = $("#memory-switch-text-on:focus").first();
    //         if (el.length !== 1) return
    //         $("#memory-switch-text-on").click()
    //     }
    // })

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
            $("#notPdf").show();
            $("#bibtex-card-content").slideUp();
            if (url.href.endsWith(".pdf")) {
                $("#notPdf").hide();
                $("#isArxiv").show();
                const paperId = url.href.split("/").reverse()[0].replace(".pdf", "");
                const newURL = `https://arxiv.org/abs/` + paperId;
                $("#goToAbstract").text(paperId);
                $("#abstract-card").click((e) => {
                    chrome.tabs.update({
                        url: newURL
                    });
                    window.close();
                })
                $.get(`https://export.arxiv.org/api/query?id_list=${paperId}`).then(data => {
                    const { bibvars, bibtext } = parseArxivBibtex(data)
                    $("#abstract-card-title").text(bibvars.title);
                    $("#bibtex-card-content").text(bibtext);
                    $("#bibtex-card-header").click((e) => {
                        copyTextToClipboard($("#bibtex-card-content").text());
                        $("#bibtex-svg").fadeOut(() => {
                            $("#clipboard-ok").fadeIn(() => {
                                setTimeout(() => {
                                    $("#clipboard-ok").fadeOut(() => {
                                        $("#bibtex-svg").fadeIn()
                                    })
                                }, 1500)
                            })
                        })
                    })
                });
            }
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

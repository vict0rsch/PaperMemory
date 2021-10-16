var timeout = null;
var prevent = false;

/**
 * Centralizes HTML svg codes
 * @param {string} name svg type
 * @returns {string} the HTML code for a specific svg
 */
const svg = (name) => {
    switch (name) {
        case "download":
            return /*html*/ `<svg
                        width="52px" height="42px" viewBox="0 0 22 16"
                    >
                        <path d="M2,10 L6,13 L12.8760559,4.5959317 C14.1180021,3.0779974 16.2457925,2.62289624 18,3.5 L18,3.5 C19.8385982,4.4192991 21,6.29848669 21,8.35410197 L21,10 C21,12.7614237 18.7614237,15 16,15 L1,15" id="check"></path>
                        <polyline points="4.5 8.5 8 11 11.5 8.5" class="svg-out"></polyline>
                        <path d="M8,1 L8,11" class="svg-out"></path>
                    </svg>`;
        case "clipboard-default":
            return /*html*/ `<svg
                class="copy-feedback tabler-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="64" height="32" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="rgb(0, 119, 255)" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <line x1="9" y1="12" x2="9.01" y2="12" />
                <line x1="13" y1="12" x2="15" y2="12" />
                <line x1="9" y1="16" x2="9.01" y2="16" />
                <line x1="13" y1="16" x2="15" y2="16" />
            </svg>`;

        case "clipboard-default-ok":
            return /*html*/ `<svg
                xmlns="http://www.w3.org/2000/svg"
                class="tabler-icon copy-feedback-ok"
                style="display:none"
                width="64" height="64" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="rgb(0, 200, 84)" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z"/>
                <path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <path d="M9 14l2 2l4 -4" />
            </svg>`;

        case "vanity-close":
            return /*html*/ `<svg
                xmlns="http://www.w3.org/2000/svg"
                class="tabler-icon"
                width="24" height="24" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="#b31b1b" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z"/>
                <circle cx="12" cy="12" r="9" />
                <path d="M10 10l4 4m0 -4l-4 4" />
            </svg>`;

        case "vanity-clipboard":
            return /*html*/ `<svg
                class="copy-feedback tabler-icon" xmlns="http://www.w3.org/2000/svg"
                width="24" height="24" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="rgb(0, 119, 255)" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z"/>
                <path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <line x1="9" y1="12" x2="9.01" y2="12" />
                <line x1="13" y1="12" x2="15" y2="12" />
                <line x1="9" y1="16" x2="9.01" y2="16" />
                <line x1="13" y1="16" x2="15" y2="16" />
            </svg>`;

        case "vanity-clipboard-ok":
            return /*html*/ `<svg
                xmlns="http://www.w3.org/2000/svg"
                class="tabler-icon copy-feedback-ok"
                style="display:none"
                width="64" height="64" viewBox="0 0 24 24"
                stroke-width="1.25" stroke="rgb(0, 200, 84)" fill="none"
                stroke-linecap="round" stroke-linejoin="round"
            >
                <path stroke="none" d="M0 0h24v24H0z"/>
                <path d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="2" />
                <path d="M9 14l2 2l4 -4" />
            </svg>`;

        default:
            break;
    }
};

/**
 * Adds citation hovers on arxiv-vanity, markdown link, bibtext citation and download button on arxiv.
 * Also, if the current website is a known paper source (isPaper), adds or updates the current paper
 * @param {object} checks The user's stored preferences regarding menu options
 */
const main = (checks) => {
    let is = isPaper(window.location.href);
    is["vanity"] = window.location.href.indexOf("arxiv-vanity.com") > -1;

    if (is.arxiv) {
        arxiv(checks);
    } else if (is.vanity && checks.checkVanity) {
        vanity();
    }

    if (is.arxiv || is.neurips || is.cvf) {
        addOrUpdatePaper(is, checks);
    }
};

/**
 * Slides a div in then out, bottom right, with some text to give the user
 * a feedback on some action performed
 * @param {string} text the text to display in the slider div
 */
const feedback = (text) => {
    try {
        clearTimeout(timeout);
        $("#feedback-notif").remove();
        prevent = true;
    } catch (error) {
        console.log("No feedback to remove.");
    }
    $("body").append(/*html*/ `
        <div id="feedback-notif">${text}</div>
    `);
    $("#feedback-notif").animate(
        {
            right: "64px",
            opacity: "1",
        },
        400,
        "easeInOutBack"
    );
    timeout = setTimeout(() => {
        $("#feedback-notif").animate(
            {
                right: "-200px",
                opacity: "0",
            },
            400,
            "easeInOutBack",
            () => {
                !prevent && $("#feedback-notif").remove();
                prevent = false;
            }
        );
    }, 2000);
};

const addOrUpdatePaper = (is, checks) => {
    const url = window.location.href;

    // get papers already stored
    chrome.storage.local.get("papers", async function ({ papers }) {
        // no paper in storage
        if (typeof papers === "undefined") {
            papers = {};
            papers["__dataVersion"] = manifestDataVersion();
        }

        papers = await initState(papers, true);

        let paper, isNew;

        // Extract id from url
        const id = parseIdFromUrl(url);

        if (papers.hasOwnProperty(id)) {
            // Update paper if it exists
            papers = updatePaper(papers, id);
            paper = papers[id];
            isNew = false;
        } else {
            // Or create a new one if it does not
            paper = await makePaper(is, url, id);
            papers[id] = paper;
            isNew = true;
        }

        chrome.storage.local.set({ papers: papers }, () => {
            if (isNew) {
                console.log("Added '" + paper.title + "' to ArxivMemory");
                // display red slider feedback if the user did not disable it
                // from the menu
                checks.checkFeedback && feedback("Added to your ArxivMemory!");
            } else {
                console.log("Updated '" + paper.title + "' in ArxivMemory");
            }
        });
    });
};

const makePaper = async (is, url, id) => {
    let paper;
    if (is.arxiv) {
        const data = await fetchArxivXML(id);
        const { bibvars, bibtext } = parseArxivBibtex(data);
        paper = bibvars;
        paper.bibtext = bibtext;
        paper.source = "arxiv";
        // paper.codes = await fetchCodes(paper)
    } else if (is.neurips) {
        const data = await fetchNeuripsHTML(url);
        paper = parseNeuripsHTML(url, data);
        paper.source = "neurips";
        // paper.codes = await fetchCodes(paper);
    } else if (is.cvf) {
        const data = await fetchCvfHTML(url);
        paper = parseCvfHTML(url, data);
        paper.source = "cvf";
    }

    return initPaper(paper);
};

const initPaper = (paper) => {
    paper.md = `[${paper.title}](${paper.pdfLink})`;
    paper.note = "";
    paper.tags = [];
    paper.codeLink = "";
    paper.favorite = false;
    paper.favoriteDate = "";
    paper.addDate = new Date().toJSON();
    paper.lastOpenDate = paper.addDate;
    paper.count = 1;

    validatePaper(paper);

    return paper;
};

const updatePaper = (papers, id) => {
    papers[id].count += 1;
    papers[id].lastOpenDate = new Date().toJSON();
    return papers;
};

const arxiv = (checks) => {
    const { checkMd, checkBib, checkDownload, checkPdfTitle, pdfTitleFn } = checks;

    // console.log({ checks })

    var h = $(".extra-services .full-text h2").first();

    const url = window.location.href;
    const id = url.match(/\d{4}\.\d{4,5}\d/g)[0];
    const isArxivAbs = window.location.href.includes("https://arxiv.org/abs/");
    const pdfUrl =
        "https://arxiv.org" +
        $(".abs-button.download-pdf").first().attr("href") +
        ".pdf";

    _state.pdfTitleFn = pdfTitleFn;

    // -----------------------------
    // -----  Download Button  -----
    // -----------------------------
    if (checkDownload && isArxivAbs) {
        const button = /*html*/ `
            <div class="arxivTools-container">
                <div id="arxiv-button">
                    ${svg("download")}
                </div>
            </div>
            `;
        h.parent().append(button);
        var downloadTimeout;
        $("#arxiv-button").on("click", async () => {
            $("#arxiv-button").removeClass("downloaded");
            $("#arxiv-button").addClass("downloaded");
            downloadTimeout && clearTimeout(downloadTimeout);
            downloadTimeout = setTimeout(() => {
                $("#arxiv-button").hasClass("downloaded") &&
                    $("#arxiv-button").removeClass("downloaded");
            }, 1500);
            const title = await $.get(
                `https://export.arxiv.org/api/query?id_list=${id}`
            ).then((data) => {
                return $($(data).find("entry title")[0]).text();
            });
            download_file(pdfUrl, statePdfTitle(title, id));
        });
    }
    // ---------------------------
    // -----  Markdown Link  -----
    // ---------------------------
    if (checkMd && isArxivAbs) {
        h.parent().append(/*html*/ `
            <div id="markdown-container">
                <div id="markdown-header" class="arxivTools-header">
                    <h3>Markdown</h3>
                    ${svg("clipboard-default")}
                    ${svg("clipboard-default-ok")}
                </div>
                <div id="markdown-link" class="arxivTools-codify">[${
                    document.title
                }](${pdfUrl})</div>
            </div>
        `);
        $("#markdown-header .copy-feedback").on("click", (e) => {
            $("#markdown-header .copy-feedback").fadeOut(200, () => {
                $("#markdown-header .copy-feedback-ok").fadeIn(200, () => {
                    setTimeout(() => {
                        $("#markdown-header .copy-feedback-ok").fadeOut(200, () => {
                            $("#markdown-header .copy-feedback").fadeIn(200);
                        });
                    }, 1500);
                });
            });
            copyTextToClipboard($("#markdown-link").text());
            feedback("Markdown Link Copied!");
        });
    }

    if (checkPdfTitle) {
        const getArxivTitle = async (id) => {
            return await $.get(`https://export.arxiv.org/api/query?id_list=${id}`).then(
                (data) => {
                    return $($(data).find("entry title")[0]).text();
                }
            );
        };
        const makeTitle = async (id, url) => {
            let title = await getArxivTitle(id);
            title = statePdfTitle(title, id);
            window.document.title = title;
            chrome.runtime.sendMessage({
                type: "update-title",
                options: { title, url },
            });
        };

        makeTitle(id, url);
    }

    if (checkBib && isArxivAbs) {
        h.parent().append(/*html*/ `
                <div id="loader-container" class="arxivTools-container">
                    <div class="sk-folding-cube">
                        <div class="sk-cube1 sk-cube"></div>
                        <div class="sk-cube2 sk-cube"></div>
                        <div class="sk-cube4 sk-cube"></div>
                        <div class="sk-cube3 sk-cube"></div>
                    </div>
                </div>
            `);

        $.get(`https://export.arxiv.org/api/query?id_list=${id}`).then((data) => {
            const { bibvars, bibtext } = parseArxivBibtex(data);

            const bibtexDiv = /*html*/ `
                    <div id="bibtexDiv">
                        <div id="texHeader" class="arxivTools-header">
                            <h3>BibTex:</h3>
                            ${svg("clipboard-default")}
                            ${svg("clipboard-default-ok")}
                        </div>
                        <div id="texTextarea" class="arxivTools-codify">${bibtext}</div>
                    </div>
                `;

            $("#loader-container").fadeOut(() => {
                $("#loader-container").remove();
                h.parent().append(bibtexDiv);
                $("#texHeader .copy-feedback").on("click", (e) => {
                    $("#texHeader .copy-feedback").fadeOut(200, () => {
                        $("#texHeader .copy-feedback-ok").fadeIn(200, () => {
                            setTimeout(() => {
                                $("#texHeader .copy-feedback-ok").fadeOut(200, () => {
                                    $("#texHeader .copy-feedback").fadeIn(200);
                                });
                            }, 1500);
                        });
                    });
                    copyTextToClipboard($("#texTextarea").text());
                    feedback("Bibtex Citation Copied!");
                });
            });
        });
    }
};

const vanity = () => {
    var citationtimeout;
    $(".ltx_ref").on("mouseenter", (e) => {
        clearTimeout(citationtimeout);
        $(".arxivTools-card").remove();
        if (!$(e.target).hasClass("ltx_engrafo_tooltip")) {
            return;
        }
        citationtimeout = setTimeout(() => {
            const popper = $($(".tippy-popper:visible")[0]);
            const journal = $(popper.find(".ltx_bib_journal")[0]);
            let query;
            let id;
            let vanityTitle;
            let isArxivCitation = false;
            if (journal.text().indexOf("arXiv:") > -1) {
                id = journal.text().split("arXiv:");
                id = id[id.length - 1];
                query = `https://export.arxiv.org/api/query?id_list=${id}`;
                isArxivCitation = true;
            } else {
                vanityTitle = $(popper.find(".ltx_bib_title")[0]).text();
                query = `https://export.arxiv.org/api/query?search_query=all:${vanityTitle}&max_results=1`;
            }

            $.get(query).then((data) => {
                $(".arxivTools-card").remove();
                const { bibvars, bibtext } = parseArxivBibtex(data);
                if (
                    !isArxivCitation &&
                    bibvars.title.toLowerCase().replace(/[^a-z]/gi, "") !==
                        vanityTitle.toLowerCase().replace(/[^a-z]/gi, "")
                ) {
                    console.log(
                        "Wrong title from Arxiv API:",
                        vanityTitle,
                        bibvars.title
                    );
                    return;
                }

                const offset = $(e.target).offset();
                $("body").append(/*html*/ `
                        <div id="arxivTools-${
                            bibvars.id
                        }" class="arxivTools-card" style="top:${offset.top + 30}px">
                            <div class="arxivTools-card-body">
                                <div class="arxivTools-card-header">
                                    ArxivTools: BibTex citation
                                </div>
                                <div class="arxivTools-bibtex" id="arxivTools-bibtex-${
                                    bibvars.id
                                }">
                                    ${bibtext}
                                </div>
                                <div class="arxivTools-buttons">
                                    <div class="arxivTools-close">
                                        ${svg("vanity-close")}
                                    </div>
                                    <div class="arxivTools-copy" id="arxivTools-copy-${
                                        bibvars.id
                                    }">
                                        ${svg("vanity-clipboard")}
                                        ${svg("vanity-clipboard-ok")}
                                    </div>
                                </div>
                            </div>
                        </div>
                        `);

                $(".arxivTools-close").on("click", () => {
                    $(".arxivTools-card").remove();
                });
                $(".arxivTools-copy").on("click", (e) => {
                    let id = $(
                        $(e.target).parent().parent().find(".arxivTools-copy")[0]
                    )
                        .attr("id")
                        .split("-");
                    id = id[id.length - 1];
                    copyTextToClipboard($("#arxivTools-bibtex-" + id).text());
                    $(".copy-feedback").fadeOut(() => {
                        $(".copy-feedback-ok").fadeIn(() => {
                            setTimeout(() => {
                                $(".copy-feedback-ok").fadeOut(() => {
                                    $(".copy-feedback").fadeIn();
                                });
                            }, 1000);
                        });
                    });
                });
            });
        }, 400);
    });
};

$(() => {
    const url = window.location.href;

    if (
        !Object.values(_knownPaperPages)
            .reduce((a, b) => a.concat(b), [])
            .some((d) => url.includes(d))
    ) {
        // not on a paper page
        return;
    }

    console.log("Executing Arxiv Tools content script");

    chrome.storage.local.get(_menuStorageKeys, (storedMenu) => {
        let menu = {};
        for (const m of _menuCheckNames) {
            menu[m] = storedMenu.hasOwnProperty(m) ? storedMenu[m] : true;
        }

        menu.pdfTitleFn =
            menu.pdfTitleFn && typeof menu.pdfTitleFn === "string"
                ? getPdfFn(menu.pdfTitleFn)
                : defaultPDFTitleFn;

        main(menu);
    });
});

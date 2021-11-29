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
            return /*html*/ `<svg width="52px" height="42px" viewBox="0 0 22 16">
                <path
                    d="M2,10 L6,13 L12.8760559,4.5959317 C14.1180021,3.0779974 16.2457925,2.62289624 18,3.5 L18,3.5 C19.8385982,4.4192991 21,6.29848669 21,8.35410197 L21,10 C21,12.7614237 18.7614237,15 16,15 L1,15"
                    id="check"
                ></path>
                <polyline points="4.5 8.5 8 11 11.5 8.5" class="svg-out"></polyline>
                <path d="M8,1 L8,11" class="svg-out"></path>
            </svg>`;
        case "clipboard-default":
            return /*html*/ `<svg
                class="copy-feedback tabler-icon"
                xmlns="http://www.w3.org/2000/svg"
                width="64"
                height="32"
                viewBox="0 0 24 24"
                stroke-width="1.25"
                stroke="rgb(0, 119, 255)"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path
                    d="M9 5H7a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2V7a2 2 0 0 0 -2 -2h-2"
                />
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

        case "notif-cancel":
            return /*html*/ `<svg
                width="25"
                height="25"
                viewBox="0 0 24 24"
                stroke-width="1"
                fill="none"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke="white"
            >
                <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
                <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
            </svg>`;

        default:
            break;
    }
};

/**
 * Adds markdown link, bibtex citation and download button on arxiv.
 * Also, if the current website is a known paper source (isPaper), adds or updates the current paper
 * @param {object} checks The user's stored preferences regarding menu options
 */
const contentScriptMain = async (url) => {
    const storedMenu = await getStorage(global.menuStorageKeys);
    await initState(undefined, true);
    let menu = {};
    for (const m of global.menuCheckNames) {
        menu[m] = storedMenu.hasOwnProperty(m) ? storedMenu[m] : true;
    }

    menu.pdfTitleFn =
        menu.pdfTitleFn && typeof menu.pdfTitleFn === "string"
            ? getPdfFn(menu.pdfTitleFn)
            : defaultPDFTitleFn;

    let is = isPaper(url);

    if (is.arxiv) {
        arxiv(menu);
    }

    if (Object.values(is).some((i) => i)) {
        const { id } = await addOrUpdatePaper(url, is, menu);

        if (menu.checkPdfTitle) {
            const makeTitle = async (id, url) => {
                let title = global.state.papers.hasOwnProperty(id)
                    ? global.state.papers[id].title
                    : "";
                if (!title) return;
                title = statePdfTitle(title, id);
                window.document.title = title;
                chrome.runtime.sendMessage({
                    type: "update-title",
                    options: { title, url },
                });
            };
            makeTitle(id, url);
        }
    }
};

/**
 * Slides a div in then out, bottom right, with some text to give the user
 * a feedback on some action performed
 * @param {string} text the text to display in the slider div
 */
const feedback = (text, paper = null) => {
    try {
        clearTimeout(timeout);
        findEl("feedback-notif").remove();
        prevent = true;
    } catch (error) {}

    if (paper) {
        text = /*html*/ ` <div id="notif-text">
                <div>${text}</div>
            </div>
            <div title="Cancel" id="notif-cancel">
                <div>${svg("notif-cancel")}</div>
            </div>`;
    } else {
        text = /*html*/ ` <div id="notif-text">
                <div>${text}</div>
            </div>`;
    }

    $("body").append(/*html*/ ` <div id="feedback-notif">${text}</div> `);
    style("feedback-notif", "padding", "0px");
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
            { right: "-200px", opacity: "0" },
            400,
            "easeInOutBack",
            () => {
                !prevent && $("#feedback-notif").remove();
                prevent = false;
            }
        );
    }, 3000);
    addListener("notif-cancel", "click", () => {
        clearTimeout(timeout);
        delete global.state.papers[paper.id];
        chrome.storage.local.set({ papers: global.state.papers }, () => {
            timeout = setTimeout(() => {
                $("#feedback-notif").animate(
                    { right: "-200px", opacity: "0" },
                    400,
                    "easeInOutBack",
                    () => {
                        !prevent && $("#feedback-notif").remove();
                        prevent = false;
                    }
                );
            }, 1500);
            setHTML("notif-text", "<div>Removed from memory</div>");
        });
    });
};

const updatePaper = (papers, id) => {
    papers[id].count += 1;
    papers[id].lastOpenDate = new Date().toJSON();
    return papers;
};

const arxiv = (checks) => {
    const { checkMd, checkBib, checkDownload, pdfTitleFn } = checks;
    global.state.pdfTitleFn = pdfTitleFn;

    // console.log({ checks })

    const url = window.location.href;
    const isArxivAbs = url.includes("https://arxiv.org/abs/");

    if (!isArxivAbs) return;

    const id = parseIdFromUrl(url);
    const arxivAbsCol = document.querySelector(
        ".extra-services .full-text h2"
    ).parentElement;
    const pdfUrl =
        "https://arxiv.org" +
        document.querySelector(".abs-button.download-pdf").href +
        ".pdf";

    // -----------------------------
    // -----  Download Button  -----
    // -----------------------------
    if (checkDownload) {
        const button = /*html*/ `
            <div class="arxivTools-container">
                <div id="arxiv-button">${svg("download")}</div>
            </div>
        `;
        arxivAbsCol.innerHTML += button;
        var downloadTimeout;
        $("#arxiv-button").on("click", async () => {
            removeClass("arxiv-button", "downloaded");
            addClass("arxiv-button", "downloaded");
            downloadTimeout && clearTimeout(downloadTimeout);
            downloadTimeout = setTimeout(() => {
                hasClass("arxiv-button", "downloaded") &&
                    removeClass("arxiv-button", "downloaded");
            }, 1500);
            const title = await $.get(
                `https://export.arxiv.org/api/query?id_list=${id.split("-")[1]}`
            ).then((data) => {
                return $($(data).find("entry title")[0]).text();
            });
            downloadFile(pdfUrl, statePdfTitle(title, id));
        });
    }
    // ---------------------------
    // -----  Markdown Link  -----
    // ---------------------------
    if (checkMd) {
        arxivAbsCol.innerHTML += /*html*/ ` <div id="markdown-container">
            <div id="markdown-header" class="arxivTools-header">
                <h3>Markdown</h3>
                ${svg("clipboard-default")} ${svg("clipboard-default-ok")}
            </div>
            <div id="markdown-link" class="arxivTools-codify">[${
                global.state.papers.hasOwnProperty(id)
                    ? global.state.papers[id].title
                    : document.title
            }](${pdfUrl})
            </div>
        </div>`;
    }

    if (checkBib) {
        arxivAbsCol.innerHTML += /*html*/ `
            <div id="loader-container" class="arxivTools-container">
                <div class="sk-folding-cube">
                    <div class="sk-cube1 sk-cube"></div>
                    <div class="sk-cube2 sk-cube"></div>
                    <div class="sk-cube4 sk-cube"></div>
                    <div class="sk-cube3 sk-cube"></div>
                </div>
            </div>
        `;

        $.get(`https://export.arxiv.org/api/query?id_list=${id.split("-")[1]}`).then(
            async (data) => {
                const paper = await parseArxivBibtex(id, data);

                const bibtexDiv = /*html*/ `
                    <div id="bibtexDiv">
                        <div id="texHeader" class="arxivTools-header">
                            <h3>BibTex:</h3>
                            ${svg("clipboard-default")} ${svg("clipboard-default-ok")}
                        </div>
                        <div id="texTextarea" class="arxivTools-codify">${
                            paper.bibtex
                        }</div>
                    </div>
                `;

                $("#loader-container").fadeOut(() => {
                    findEl("loader-container").remove();
                    arxivAbsCol.innerHTML += bibtexDiv;
                    addListener(
                        document.querySelector("#texHeader .copy-feedback"),
                        "click",
                        (e) => {
                            $("#texHeader .copy-feedback").fadeOut(200, () => {
                                $("#texHeader .copy-feedback-ok").fadeIn(200, () => {
                                    setTimeout(() => {
                                        $("#texHeader .copy-feedback-ok").fadeOut(
                                            200,
                                            () => {
                                                $("#texHeader .copy-feedback").fadeIn(
                                                    200
                                                );
                                            }
                                        );
                                    }, 1500);
                                });
                            });
                            copyTextToClipboard(findEl("texTextarea").innerText);
                            feedback("Bibtex Citation Copied!");
                        }
                    );
                    addListener(
                        document.querySelector("#markdown-header .copy-feedback"),
                        "click",
                        (e) => {
                            console.log("click");
                            $("#markdown-header .copy-feedback").fadeOut(200, () => {
                                $("#markdown-header .copy-feedback-ok").fadeIn(
                                    200,
                                    () => {
                                        setTimeout(() => {
                                            $(
                                                "#markdown-header .copy-feedback-ok"
                                            ).fadeOut(200, () => {
                                                $(
                                                    "#markdown-header .copy-feedback"
                                                ).fadeIn(200);
                                            });
                                        }, 1500);
                                    }
                                );
                            });
                            copyTextToClipboard(
                                findEl("markdown-link").innerText.replaceAll("\n", "")
                            );
                            feedback("Markdown Link Copied!");
                        }
                    );
                });
            }
        );
    }
};

$(() => {
    const url = window.location.href;
    info("Executing Paper Memory content script");
    if (
        Object.values(global.knownPaperPages)
            .reduce((a, b) => a.concat(b), [])
            .some((d) => url.includes(d))
    ) {
        info("Running contentScriptMain for", url);
        contentScriptMain(url);
    }

    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        // listen for messages sent from background.js
        if (request.message === "hello!") {
            info("Running content_script for url update");
            console.log(request.url); // new url is now in content scripts!
            contentScriptMain(request.url);
        }
    });
});

/**
 * Adds markdown link, bibtex citation and download button on arxiv.
 * Also, if the current website is a known paper source (isPaper), adds or updates the current paper
 * @param {object} checks The user's stored preferences regarding menu options
 */
const arxivMain = async (url) => {
    const menu = await getMenu();

    let is = isPaper(url);

    if (is.arxiv) {
        arxiv(menu);
    }
};

const arxiv = async (checks) => {
    const { checkMd, checkBib, checkDownload } = checks;
    global.state.titleFunction = (await getTitleFunction()).titleFunction;

    const url = window.location.href;
    const isArxivAbs = url.includes("https://arxiv.org/abs/");

    if (!isArxivAbs) return;

    const id = parseIdFromUrl(url);
    const arxivAbsCol = document.querySelector(
        ".extra-services .full-text h2"
    ).parentElement;
    const pdfUrl = document.querySelector(".abs-button.download-pdf").href;

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
            if (!global.state.papers.hasOwnProperty(id)) {
                const title = await $.get(
                    `https://export.arxiv.org/api/query?id_list=${id.split("-")[1]}`
                ).then((data) => {
                    return $($(data).find("entry title")[0]).text();
                });
                downloadFile(pdfUrl, `${title}.pdf`);
            } else {
                let title = stateTitleFunction(id);
                if (!title.endsWith(".pdf")) {
                    title += ".pdf";
                }
                downloadFile(pdfUrl);
            }
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
                const paper = await makeArxivPaper(id, data);

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
                            feedback({ notifText: "Bibtex Citation Copied!" });
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
                            feedback({ notifText: "Markdown Link Copied!" });
                        }
                    );
                });
            }
        );
    }
};

$(() => {
    const location = window.location;
    if (location.host === "arxiv.org") {
        if (location.href.includes("arxiv.org/abs/")) {
            info("Running arxivMain for", location.href);
            arxivMain(location.href);
        }
    }
});

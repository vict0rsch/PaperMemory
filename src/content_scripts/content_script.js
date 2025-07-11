/*
 * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
 *
 * Uses the built in easing capabilities added In jQuery 1.1
 * to offer multiple easing options
 *
 * TERMS OF USE - jQuery Easing
 *
 * Open source under the BSD License.
 *
 * Copyright 2008 George McGinley Smith
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 *
 * Neither the name of the author nor the names of contributors may be used to endorse
 * or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 *
 * Open source under the BSD License.
 *
 * Copyright 2001 Robert Penner
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice, this list of
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list
 * of conditions and the following disclaimer in the documentation and/or other materials
 * provided with the distribution.
 *
 * Neither the name of the author nor the names of contributors may be used to endorse
 * or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 * GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED
 * OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

// t: current time, b: begInnIng value, c: change In value, d: duration
$.extend($.easing, {
    easeInOutBack: (x, t, b, c, d, s) => {
        if (s == undefined) s = 1.70158;
        if ((t /= d / 2) < 1)
            return (c / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
        return (c / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
    },
});

var PDF_TITLE_ITERS = 0;

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
                class="copy-feedback pm-tabler-icon"
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
                class="pm-tabler-icon copy-feedback-ok"
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

const injectNotifCSS = () => {
    let el = document.createElement("style");
    el.type = "text/css";
    el.innerText = `
        .pm-notif-loader {
            width: 24px;
            height: 24px;
            border: 2px solid #FFF;
            border-bottom-color: transparent;
            border-radius: 50%;
            display: inline-block;
            box-sizing: border-box;
            animation: rotation 1s linear infinite;
            }

        @keyframes rotation {
            0% {
                transform: rotate(0deg);
            }
            100% {
                transform: rotate(360deg);
            }
        } 
    `;
    document.head.appendChild(el);
    return el;
};

const makePaperMemoryHTMLDiv = (paper) => {
    return paper.venue
        ? /*html*/ `
         <div 
            id="pm-container"
            style="position: absolute; top: 10px; left: 50%; transform: translateX(-50%); font-family: 'Noto Sans','Noto Sans Fallback',sans-serif; font-size: 0.8rem;"
        >
            <div 
                style="display: flex; justify-content: center; align-items: center;" 
                id="pm-venue"
            >
                <span id="pm-venue-name">${paper.venue}</span>
                <span id="pm-venue-year">${bibtexToObject(paper.bibtex).year}</span>
            </div>
            <p
                style="text-align: center; font-size: 12px; color: #666; margin: 0;"
            >
                (PaperMemory)
            </p>
         </div>
         `
        : "";
};

const handleDefaultAction = async () => {
    const action = await getDefaultKeyboardAction();
    let id;
    try {
        id = await parseIdFromUrl(window.location.href);
    } catch (e) {
        console.log("Unknown url:", window.location.href);
    }
    if (!id) return;
    const e = dummyEvent(id);
    const paper = global.state.papers[id];
    let text;
    if (!paper) return;
    switch (action) {
        case "o":
            handleOpenItemLink(e);
            break;
        case "c":
            handleCopyPDFLink(e);
            text = "Link to paper copied!";
            break;
        case "m":
            handleCopyMarkdownLink(e);
            text = "Markdown link copied!";
            break;
        case "b":
            handleCopyBibtex(e);
            text = "Bibtex citation copied!";
            break;
        case "h":
            handleCopyHyperLink(e);
            text = "Hyperlink copied!";
            break;
        case "d":
            console.log("Invalid action:", action);
            break;
        case "e":
            console.log("Invalid action:", action);
            break;
        case "5":
            handleOpenItemAr5iv(e);
            break;
        case "f":
            handleOpenItemHuggingface(e);
            break;
        case "x":
            handleOpenItemAlphaxiv(e);
            break;
        case "s":
            handleOpenItemScirate(e);
            break;
        default:
            warn("Unknown action:", action);
    }
    text && feedback({ text });
};

/** Whether or not to ignore the current paper based on its `is` object
 * and the dictionary of sources to ignore
 * @param {object} is The `is` object of the current paper
 * @param {object} ignoreSources The dictionary of sources to ignore
 * @returns {boolean} Whether or not to ignore the current paper
 * */
const ignorePaper = (is, ignoreSources) => {
    const sources = Object.entries(ignoreSources)
        .filter(([name, ignore]) => ignore)
        .map(([name, ignore]) => name);
    const papers = Object.entries(is)
        .filter(([source, isSource]) => isSource)
        .map(([name, isSource]) => name);
    return papers.some((paper) => sources.includes(paper));
};

/**
 * Queries an element from the DOM, waiting for it to appear if necessary
 * @param {object} opts The options for the query
 * @param {string} opts.query The query to search for
 * @param {number} opts.interval The interval to wait between queries
 * @param {number} opts.iters The maximum number of iterations
 * @param {boolean} opts.all Whether to query all elements or a single element
 * @param {HTMLElement} opts.dom The DOM to query
 * @returns {HTMLElement} The queried element
 */
const queryOrWait = async ({
    query,
    interval = 200,
    iters = 50,
    all = false,
    dom = null,
}) => {
    let iter = 0;
    const func = all ? queryAll : querySelector;
    let el = func(query);
    while ((all && !el.length) || (!all && !el)) {
        await sleep(interval);
        iter += 1;
        if (iter > iters) {
            break;
        }
        el = func(query);
    }
    return el;
};

/**
 * Adds markdown link, bibtex citation and download button on arxiv.
 * Also, if the current website is a known paper source (isPaper), adds or updates the current paper
 * @param {object} checks The user's stored preferences regarding menu options
 */
const contentScriptMain = async ({
    url,
    stateIsReady,
    manualTrigger = false,
    paperUpdateDoneCallbacks = {},
} = {}) => {
    console.log("url: ", url);
    if (!stateIsReady) {
        let remoteReadyPromise;
        const stateReadyPromise = new Promise((stateResolve) => {
            remoteReadyPromise = new Promise((remoteResolve) => {
                initSyncAndState({
                    isContentScript: true,
                    stateIsReady: stateResolve,
                    remoteIsReady: remoteResolve,
                });
            });
        });
        await stateReadyPromise;
        tryArxivDisplay({ url });
        await remoteReadyPromise;
    }
    const prefs = global.state.prefs;

    let is = await isPaper(url, true);

    let ignoreSources = (await getStorage("ignoreSources")) ?? {};

    let update;
    const isIgnored = ignorePaper(is, ignoreSources); // source is not ignored
    const isPdfPrevented = prefs.checkPdfOnly && !isPdfUrl(url); // pdf only is not checked or it is a pdf
    const isAutoDisabled = prefs.checkNoAuto && !manualTrigger; // no auto is not checked or it is a manual trigger
    if (
        manualTrigger || // force parsing
        (!isIgnored && ((!isPdfPrevented && !isAutoDisabled) || is.arxiv))
    ) {
        const store = !(isPdfPrevented || isAutoDisabled) || manualTrigger;
        update = await addOrUpdatePaper({
            url,
            is,
            prefs,
            store,
            contentScriptCallbacks: paperUpdateDoneCallbacks,
        });
    } else {
        if (ignorePaper(is, ignoreSources)) {
            warn(
                "Paper is being ignored because its source has been disabled in the Advanced Options."
            );
        } else if (prefs.checkPdfOnly && !isPdfUrl(url)) {
            warn(
                `Paper is being ignored because you have checked the PDF-Only option ` +
                    `and the current URL (${url}) is not that of a pdf's.`
            );
        } else if (prefs.checkNoAuto && !manualTrigger) {
            warn(
                "Paper is being ignored because you disabled automatic parsing" +
                    " in the menu."
            );
        }
    }

    let id;
    if (update) {
        id = update.id;
    }

    if (id && prefs.checkPdfTitle) {
        const makeTitle = async (id) => {
            if (!global.state.papers.hasOwnProperty(id)) return;
            const paper = global.state.papers[id];
            const maxWait = 60 * 1000;
            while (1) {
                const waitTime = Math.min(maxWait, 250 * 2 ** PDF_TITLE_ITERS);
                await sleep(waitTime);
                document.title = "";
                document.title = paper.title;
                PDF_TITLE_ITERS++;
            }
        };
        makeTitle(id);
    }
};

const makeNotif = () => {
    if (global.notif.element) return;
    const notif = /*html*/ ` <div id="feedback-notif"></div> `;
    document.body.insertAdjacentHTML("beforeend", notif);
    global.notif.element = $("#feedback-notif");
    style("feedback-notif", "padding", "0px");
};

const hideNotif = () =>
    new Promise(async (resolve) => {
        const end = ({ dontWait = false } = {}) => {
            global.notif.prevent = false;
            global.notif.isLoading = false;
            setTimeout(resolve, dontWait ? 0 : 150);
        };

        if (!global.notif.element) {
            warn("[PM][hideNotif] Notif element not found");
            end({ dontWait: true });
            return;
        }

        global.notif.element.animate(
            { right: "-200px", opacity: "0" },
            global.notif.hideSpeed,
            "easeInOutBack",
            end
        );
        // sometimes animate does not call the callback
        setTimeout(end, global.notif.hideSpeed + 50);
    });

const setNotifContent = (text) => {
    if (!global.notif.element) {
        warn("[PM][setNotifContent] Notif element not found");
        return;
    }
    global.notif.element.html(text);
};

const showNotif = () =>
    new Promise((resolve) => {
        if (!global.notif.element) {
            console.warn("[PM][showNotif] Notif element not found");
            makeNotif();
        }
        global.notif.element.animate(
            {
                right: "64px",
                opacity: "1",
            },
            global.notif.showSpeed,
            "easeInOutBack",
            resolve
        );
    });

/**
 * Slides a div in then out, bottom right, with some text to give the user
 * a feedback on some action performed
 * @param {string} text the text to display in the slider div
 * @returns {void}
 */
const feedback = async ({
    text,
    paper = null,
    displayDuration = global.notif.displayDuration,
    loading = false,
}) => {
    if (document.readyState === "loading") {
        setTimeout(() => feedback({ text, paper, displayDuration, loading }), 250);
        return;
    }
    makeNotif();
    if (global.notif.prevent && !global.notif.isLoading) {
        setTimeout(() => feedback({ text, paper, displayDuration, loading }), 100);
        return;
    }
    try {
        clearTimeout(global.notif.timeout);
        await hideNotif();
        global.notif.prevent = true;
    } catch (error) {}

    let content = "";
    global.notif.isLoading = false;

    if (paper) {
        content = /*html*/ ` <div id="notif-text">
                <div>${text}</div>
            </div>
            <div title="Cancel" id="notif-cancel">
                <div>${svg("notif-cancel")}</div>
            </div>`;
    } else if (loading) {
        global.notif.isLoading = true;
        content = /*html*/ `<div id="notif-text"><span class="pm-notif-loader"></span></div>`;
    } else {
        content = /*html*/ ` <div id="notif-text">
                <div style="display: flex;">${text}</div>
            </div>`;
    }

    setNotifContent(content);
    await showNotif();
    global.notif.timeout = setTimeout(hideNotif, displayDuration);

    paper &&
        addListener("notif-cancel", "click", async () => {
            clearTimeout(global.notif.timeout);
            await deletePaperInStorage(paper.id, global.state.papers);
            if (!global.state.deleted) {
                global.state.deleted = {};
            }
            global.state.deleted[paper.id] = true;
            setTimeout(() => delete global.state.deleted[paper.id], 30 * 1000);
            global.notif.timeout = setTimeout(hideNotif, displayDuration);
            setHTML("notif-text", "<div>Removed from memory</div>");
        });
};

/**
 * Changes the width of the arxiv columns: left is smaller, right is bigger
 * @param {string} newColWidth the new width of the left column
 * @returns {void}
 */
const adjustArxivColWidth = (newColWidth = "33%") => {
    document
        .querySelector(".leftcolumn")
        ?.setAttribute("style", `width: calc(100% - ${newColWidth}) !important`);
    document
        .querySelector(".extra-services")
        ?.setAttribute("style", `width: ${newColWidth} !important`);
};

/** Adds a paper's venue html element to the arxiv page
 * @param {object} paper The paper object
 * @returns {void}
 * */
const displayPaperVenue = (paper) => {
    if (!paper.venue) {
        return;
    }
    const venueDiv = /*html*/ `
        <div id="pm-publication-wrapper">
            <div id="pm-publication-venue">
                <span id="pm-venue-name">${paper.venue}</span>
                <span id="pm-venue-year">${bibtexToObject(paper.bibtex).year}</span>
            </div>
        </div>`;
    findEl({ element: "pm-publication-wrapper" })?.remove();
    findEl({ element: "pm-header-content" })?.insertAdjacentHTML(
        "afterbegin",
        venueDiv
    );
};

/** Adds a paper's code html element to the arxiv page
 * @param {object} paper The paper object
 * @returns {void}
 * */
const displayPaperCode = (paper) => {
    if (!paper.codeLink) {
        return;
    }
    const code = /*html*/ `
        <div id="pm-code">
        <h3>Code:</h3> <a id="pm-code-link" href="${paper.codeLink}">${paper.codeLink}</a>
        </div>
    `;
    findEl({ element: "pm-code" })?.remove();
    findEl({ element: "pm-extras" })?.insertAdjacentHTML("afterbegin", code);
};

/**
 * Adds the venue badge to HuggingFace paper pages
 * @param {object} paper The paper object
 * @param {string} url The current url
 */
const huggingfacePapers = (paper, url) => {
    if (!paper || !paper.venue) return;
    if (!url || !url.includes("huggingface.co/papers/")) return;

    const venueDiv = /*html*/ `
        <div id="pm-publication-wrapper">
            <div id="pm-publication-venue">
                <span id="pm-venue-name">${paper.venue}</span>
                <span id="pm-venue-year">${bibtexToObject(paper.bibtex).year}</span>
                <span id="pm-hf-label">(PaperMemory)</span>
            </div>
        </div>`;
    abstractH2 = queryAll("h2").find((h) => h.innerText.trim() === "Abstract");
    if (!abstractH2) {
        log("Missing 'Abstract' h2 title on HuggingFace paper page.");
    }
    const authorDiv = abstractH2.parentElement.previousElementSibling;
    log("Adding venue to HuggingFace paper page.");
    setTimeout(() => {
        [...authorDiv.childNodes].last().insertAdjacentHTML("beforeend", venueDiv);
    }, 100);
};

/**
 * Handle the ArXiv UI enhancements
 * @param {object} checks The user's stored preferences regarding menu options
 * @returns {void}
 * */
const arxiv = async (checks) => {
    const { checkMd, checkBib, checkDownload, checkStore } = checks;

    const url = window.location.href;
    const isArxivAbs = url.includes("https://arxiv.org/abs/");

    if (!isArxivAbs) return;

    const id = await parseIdFromUrl(url);
    const previousHTML = querySelector(".extra-services .full-text")?.innerHTML || "";
    const pmTitle = '<h2 id="pm-col-title">PaperMemory:</h2>';
    setHTML(
        querySelector(".extra-services .full-text"),
        /*html*/ `<div>${previousHTML}</div>
        <div id="pm-download-wrapper" class="pm-container">
            <div id="pm-header" style="width: 100%">
                ${previousHTML.includes(pmTitle) ? "" : pmTitle}
                <div id="pm-header-content"></div>
            </div>
        </div>
        <div id="pm-extras"></div>`
    );
    let pdfUrlButton = await queryOrWait({ query: ".abs-button.download-pdf" });
    let pdfUrl = pdfUrlButton?.href;
    const arxivPMDiv = await queryOrWait({ query: "#pm-extras" });

    // -----------------------------
    // -----  Download Button  -----
    // -----------------------------
    if (checkDownload) {
        const button = /*html*/ `
            <div id="pm-arxiv-direct-download" class="pm-container" style="align-items: end;">
                <div id="arxiv-button">${svg("download")}</div>
                <div style="font-size: 0.6rem; color: #cac7c7; padding-bottom: 0.6rem;">Download to<br/>PaperMemoryStore</div>
            </div>
        `;
        findEl({ element: "pm-arxiv-direct-download" })?.remove();
        (await queryOrWait({ query: "#pm-header-content" }))?.insertAdjacentHTML(
            "beforeend",
            button
        );
        var downloadTimeout;
        addListener("arxiv-button", "click", async () => {
            removeClass("arxiv-button", "downloaded");
            addClass("arxiv-button", "downloaded");
            downloadTimeout && clearTimeout(downloadTimeout);
            downloadTimeout = setTimeout(() => {
                hasClass("arxiv-button", "downloaded") &&
                    removeClass("arxiv-button", "downloaded");
            }, 1500);
            if (!pdfUrl) {
                pdfUrl = querySelector(".abs-button.download-pdf")?.href;
            }
            if (!pdfUrl) {
                console.error(
                    "Could not parse the PDF URL from HTML element: `.abs-button.download-pdf`"
                );
                return;
            }
            if (!global.state.papers.hasOwnProperty(id)) {
                const title = await fetch(
                    `https://export.arxiv.org/api/query?id_list=${id.split("-")[1]}`
                ).then((data) => {
                    return $($(data).find("entry title")[0]).text();
                });
                downloadURI(pdfUrl, `${title}.pdf`);
            } else {
                let title = stateTitleFunction(id);
                if (!title.endsWith(".pdf")) {
                    title += ".pdf";
                }
                checkStore
                    ? sendMessageToBackground({
                          type: "download-pdf-to-store",
                          pdfUrl,
                          title,
                      })
                    : downloadURI(pdfUrl, title);
            }
        });
    }
    // ---------------------------
    // -----  Markdown Link  -----
    // ---------------------------

    let paper = global.state.papers.hasOwnProperty(id)
        ? global.state.papers[id]
        : await makeArxivPaper(url);

    if (paper.venue) {
        displayPaperVenue(paper);
    }

    if (paper.codeLink) {
        displayPaperCode(paper);
    }

    if (checkMd) {
        const mdTitle = global.state.papers.hasOwnProperty(id)
            ? global.state.papers[id].title
            : document.title;
        const mdContent = `[${mdTitle}](${pdfUrl})`;
        const mdHtml = /*html*/ `
        <div id="markdown-container">
            <div id="markdown-header" class="pm-sub-header">
                <h3>Markdown</h3>
                ${svg("clipboard-default")} ${svg("clipboard-default-ok")}
            </div>
            <div id="markdown-link" class="pm-codify">${mdContent}</div>
        </div>`;
        findEl({ element: "markdown-container" })?.remove();
        arxivPMDiv?.insertAdjacentHTML("beforeend", mdHtml);
    }

    if (checkBib) {
        const bibLoader = /*html*/ `
            <div id="loader-container" class="pm-container">
                <div class="sk-folding-cube">
                    <div class="sk-cube1 sk-cube"></div>
                    <div class="sk-cube2 sk-cube"></div>
                    <div class="sk-cube4 sk-cube"></div>
                    <div class="sk-cube3 sk-cube"></div>
                </div>
            </div>
        `;
        arxivPMDiv?.insertAdjacentHTML("beforeend", bibLoader);
        findEl({ element: "bibtexDiv" })?.remove();
        const bibtexDiv = /*html*/ `
            <div id="bibtexDiv">
                <div id="texHeader" class="pm-sub-header">
                    <h3>BibTex:</h3>
                    ${svg("clipboard-default")} ${svg("clipboard-default-ok")}
                </div>
                <div id="pm-bibtex-textarea" class="pm-codify">${bibtexToString(
                    paper.bibtex
                ).replaceAll("\t", "  ")}</div>
            </div>
        `;

        (await queryOrWait({ query: "#loader-container" }))?.remove();
        arxivPMDiv?.insertAdjacentHTML("beforeend", bibtexDiv);
        addListener(querySelector("#texHeader .copy-feedback"), "click", (e) => {
            $("#texHeader .copy-feedback").fadeOut(200, () => {
                $("#texHeader .copy-feedback-ok").fadeIn(200, () => {
                    setTimeout(() => {
                        $("#texHeader .copy-feedback-ok").fadeOut(200, () => {
                            $("#texHeader .copy-feedback").fadeIn(200);
                        });
                    }, 1500);
                });
            });
            copyTextToClipboard(findEl({ element: "pm-bibtex-textarea" }).innerText);
            feedback({ text: "Bibtex Citation Copied!" });
        });
        addListener(querySelector("#markdown-header .copy-feedback"), "click", (e) => {
            $("#markdown-header .copy-feedback").fadeOut(200, () => {
                $("#markdown-header .copy-feedback-ok").fadeIn(200, () => {
                    setTimeout(() => {
                        $("#markdown-header .copy-feedback-ok").fadeOut(200, () => {
                            $("#markdown-header .copy-feedback").fadeIn(200);
                        });
                    }, 1500);
                });
            });
            copyTextToClipboard(
                findEl({ element: "markdown-link" }).innerText.replaceAll("\n", "")
            );
            feedback({ text: "Markdown Link Copied!" });
        });
    }
};

const tryArxivDisplay = async ({
    url = null,
    paper = null,
    preprintsPromise = null,
} = {}) => {
    // a paper was parsed

    // user preferences
    const prefs = global.state.prefs;

    // paper.source may not be "arxiv" even on arxiv.org
    // because of the existing paper matching mechanism
    let is = await isPaper(url, true);

    if (is.arxiv && !isPdfUrl(url)) {
        // larger arxiv column
        adjustArxivColWidth();

        // display arxiv paper metadata
        await arxiv(prefs);
        huggingfacePapers(paper, url);

        // wait for publication databases to be queried
        if (preprintsPromise) {
            paper = await preprintsPromise;
        } else {
            const id = await parseIdFromUrl(url);
            const paperExists = global.state.papers.hasOwnProperty(id);
            if (!paperExists) return;
            paper = global.state.papers[id];
        }

        // update bibtex
        if (prefs.checkBib) {
            if (findEl({ element: "pm-bibtex-textarea" })) {
                findEl({ element: "pm-bibtex-textarea" }).innerHTML = bibtexToString(
                    paper.bibtex
                ).replaceAll("\t", "  ");
            }
        }

        // update venue
        displayPaperVenue(paper);

        // update codeLink
        displayPaperCode(paper);
    }
};

(async () => {
    var prefs, paper;
    var paperPromise, preprintsPromise, paperResolve, preprintsResolve;
    const url = window.location.href;

    // state will be initialized if the source is known
    // but not on files
    let stateIsReady = false;
    if (url.startsWith("file://")) {
        await initSyncAndState({ isContentScript: true });
        prefs = global.state.prefs;
        stateIsReady = true;
    }

    // check the background script is reachable
    if (!(await sendMessageToBackground({ type: "hello" }))) {
        warn("Cannot connect to background script");
    }

    // listen to the background script for :
    //  1. tab url updates (SPAs)
    //  2. manual parsing keyboard shortcuts
    chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        if (request.message === "tabUrlUpdate") {
            info("Running PaperMemory's content script for url update");
            contentScriptMain({
                url: request.url,
                stateIsReady,
                manualTrigger: false,
                paperUpdateDoneCallbacks: {
                    update: paperResolve,
                    preprints: preprintsResolve,
                },
            });
        } else if (request.message === "manualParsing") {
            info("Triggering manual parsing");
            contentScriptMain({
                url,
                stateIsReady,
                manualTrigger: true,
                paperUpdateDoneCallbacks: {
                    update: paperResolve,
                    preprints: preprintsResolve,
                },
            });
        } else if (request.message === "defaultAction") {
            handleDefaultAction();
        }
    });

    // 2 Promises:
    //   1. fetch paper data
    //   2. fetch preprints data
    preprintsPromise = new Promise(async (pre) => {
        preprintsResolve = pre;
        paperPromise = new Promise(async (par) => {
            // if the url is associated to a known source: trigger
            // the main functions.
            paperResolve = par;
            if (await isSourceURL(url, true)) {
                contentScriptMain({
                    url,
                    stateIsReady,
                    manualTrigger: false,
                    paperUpdateDoneCallbacks: {
                        update: paperResolve,
                        preprints: preprintsResolve,
                    },
                });
            } else {
                // if the url is not associated to a known source:
                paperResolve(null);
                preprintsResolve();
            }
        });
    });

    // Promise resolved when the DOM is loaded
    const domReadyPromise = new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", () => {
            injectNotifCSS();
            resolve();
        });
    });

    // wait for the paper to be parsed and the DOM to be loaded
    const results = await Promise.all([paperPromise, domReadyPromise]);

    paper = results[0];
    if (paper) {
        tryArxivDisplay({ url, paper, preprintsPromise });
        if (url.match(/ar5iv\.labs\.arxiv\.org/)) {
            log("Adding PaperMemory to ar5iv.labs.arxiv.org");
            const pmDiv = makePaperMemoryHTMLDiv(paper);
            setTimeout(() => {
                document.body.insertAdjacentHTML("afterbegin", pmDiv);
            }, 1000);
        }
    }
    await hideNotif();
})();

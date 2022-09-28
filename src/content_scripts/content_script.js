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

// t: current time, b: begInnIng value, c: change In value, d: duration
$.easing.jswing = $.easing.swing;

$.extend($.easing, {
    def: "easeOutQuad",
    swing: (x, t, b, c, d) => {
        //alert($.easing.default);
        return $.easing[$.easing.def](x, t, b, c, d);
    },
    easeInQuad: (x, t, b, c, d) => {
        return c * (t /= d) * t + b;
    },
    easeOutQuad: (x, t, b, c, d) => {
        return -c * (t /= d) * (t - 2) + b;
    },
    easeInOutQuad: (x, t, b, c, d) => {
        if ((t /= d / 2) < 1) return (c / 2) * t * t + b;
        return (-c / 2) * (--t * (t - 2) - 1) + b;
    },
    easeInCubic: (x, t, b, c, d) => {
        return c * (t /= d) * t * t + b;
    },
    easeOutCubic: (x, t, b, c, d) => {
        return c * ((t = t / d - 1) * t * t + 1) + b;
    },
    easeInOutCubic: (x, t, b, c, d) => {
        if ((t /= d / 2) < 1) return (c / 2) * t * t * t + b;
        return (c / 2) * ((t -= 2) * t * t + 2) + b;
    },
    easeInQuart: (x, t, b, c, d) => {
        return c * (t /= d) * t * t * t + b;
    },
    easeOutQuart: (x, t, b, c, d) => {
        return -c * ((t = t / d - 1) * t * t * t - 1) + b;
    },
    easeInOutQuart: (x, t, b, c, d) => {
        if ((t /= d / 2) < 1) return (c / 2) * t * t * t * t + b;
        return (-c / 2) * ((t -= 2) * t * t * t - 2) + b;
    },
    easeInQuint: (x, t, b, c, d) => {
        return c * (t /= d) * t * t * t * t + b;
    },
    easeOutQuint: (x, t, b, c, d) => {
        return c * ((t = t / d - 1) * t * t * t * t + 1) + b;
    },
    easeInOutQuint: (x, t, b, c, d) => {
        if ((t /= d / 2) < 1) return (c / 2) * t * t * t * t * t + b;
        return (c / 2) * ((t -= 2) * t * t * t * t + 2) + b;
    },
    easeInSine: (x, t, b, c, d) => {
        return -c * Math.cos((t / d) * (Math.PI / 2)) + c + b;
    },
    easeOutSine: (x, t, b, c, d) => {
        return c * Math.sin((t / d) * (Math.PI / 2)) + b;
    },
    easeInOutSine: (x, t, b, c, d) => {
        return (-c / 2) * (Math.cos((Math.PI * t) / d) - 1) + b;
    },
    easeInExpo: (x, t, b, c, d) => {
        return t == 0 ? b : c * Math.pow(2, 10 * (t / d - 1)) + b;
    },
    easeOutExpo: (x, t, b, c, d) => {
        return t == d ? b + c : c * (-Math.pow(2, (-10 * t) / d) + 1) + b;
    },
    easeInOutExpo: (x, t, b, c, d) => {
        if (t == 0) return b;
        if (t == d) return b + c;
        if ((t /= d / 2) < 1) return (c / 2) * Math.pow(2, 10 * (t - 1)) + b;
        return (c / 2) * (-Math.pow(2, -10 * --t) + 2) + b;
    },
    easeInCirc: (x, t, b, c, d) => {
        return -c * (Math.sqrt(1 - (t /= d) * t) - 1) + b;
    },
    easeOutCirc: (x, t, b, c, d) => {
        return c * Math.sqrt(1 - (t = t / d - 1) * t) + b;
    },
    easeInOutCirc: (x, t, b, c, d) => {
        if ((t /= d / 2) < 1) return (-c / 2) * (Math.sqrt(1 - t * t) - 1) + b;
        return (c / 2) * (Math.sqrt(1 - (t -= 2) * t) + 1) + b;
    },
    easeInElastic: (x, t, b, c, d) => {
        var s = 1.70158;
        var p = 0;
        var a = c;
        if (t == 0) return b;
        if ((t /= d) == 1) return b + c;
        if (!p) p = d * 0.3;
        if (a < Math.abs(c)) {
            a = c;
            var s = p / 4;
        } else var s = (p / (2 * Math.PI)) * Math.asin(c / a);
        return (
            -(
                a *
                Math.pow(2, 10 * (t -= 1)) *
                Math.sin(((t * d - s) * (2 * Math.PI)) / p)
            ) + b
        );
    },
    easeOutElastic: (x, t, b, c, d) => {
        var s = 1.70158;
        var p = 0;
        var a = c;
        if (t == 0) return b;
        if ((t /= d) == 1) return b + c;
        if (!p) p = d * 0.3;
        if (a < Math.abs(c)) {
            a = c;
            var s = p / 4;
        } else var s = (p / (2 * Math.PI)) * Math.asin(c / a);
        return (
            a * Math.pow(2, -10 * t) * Math.sin(((t * d - s) * (2 * Math.PI)) / p) +
            c +
            b
        );
    },
    easeInOutElastic: (x, t, b, c, d) => {
        var s = 1.70158;
        var p = 0;
        var a = c;
        if (t == 0) return b;
        if ((t /= d / 2) == 2) return b + c;
        if (!p) p = d * (0.3 * 1.5);
        if (a < Math.abs(c)) {
            a = c;
            var s = p / 4;
        } else var s = (p / (2 * Math.PI)) * Math.asin(c / a);
        if (t < 1)
            return (
                -0.5 *
                    (a *
                        Math.pow(2, 10 * (t -= 1)) *
                        Math.sin(((t * d - s) * (2 * Math.PI)) / p)) +
                b
            );
        return (
            a *
                Math.pow(2, -10 * (t -= 1)) *
                Math.sin(((t * d - s) * (2 * Math.PI)) / p) *
                0.5 +
            c +
            b
        );
    },
    easeInBack: (x, t, b, c, d, s) => {
        if (s == undefined) s = 1.70158;
        return c * (t /= d) * t * ((s + 1) * t - s) + b;
    },
    easeOutBack: (x, t, b, c, d, s) => {
        if (s == undefined) s = 1.70158;
        return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    },
    easeInOutBack: (x, t, b, c, d, s) => {
        if (s == undefined) s = 1.70158;
        if ((t /= d / 2) < 1)
            return (c / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + b;
        return (c / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + b;
    },
    easeInBounce: (x, t, b, c, d) => {
        return c - $.easing.easeOutBounce(x, d - t, 0, c, d) + b;
    },
    easeOutBounce: (x, t, b, c, d) => {
        if ((t /= d) < 1 / 2.75) {
            return c * (7.5625 * t * t) + b;
        } else if (t < 2 / 2.75) {
            return c * (7.5625 * (t -= 1.5 / 2.75) * t + 0.75) + b;
        } else if (t < 2.5 / 2.75) {
            return c * (7.5625 * (t -= 2.25 / 2.75) * t + 0.9375) + b;
        } else {
            return c * (7.5625 * (t -= 2.625 / 2.75) * t + 0.984375) + b;
        }
    },
    easeInOutBounce: (x, t, b, c, d) => {
        if (t < d / 2) return $.easing.easeInBounce(x, t * 2, 0, c, d) * 0.5 + b;
        return $.easing.easeOutBounce(x, t * 2 - d, 0, c, d) * 0.5 + c * 0.5 + b;
    },
});

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
        const makeTitle = async (id, url) => {
            if (!global.state.papers.hasOwnProperty(id)) return;
            const paper = global.state.papers[id];
            title = stateTitleFunction(paper);
            chrome.runtime.sendMessage(
                {
                    type: "update-title",
                    options: { title, url },
                },
                () => {
                    window.document.title = title;
                }
            );
        };
        makeTitle(id, url);
    }
};

/**
 * Slides a div in then out, bottom right, with some text to give the user
 * a feedback on some action performed
 * @param {string} text the text to display in the slider div
 */
const feedback = (text, paper = null) => {
    if (document.readyState === "loading") {
        setTimeout(() => feedback(text, paper), 250);
        return;
    }
    const notifTime = 3000;
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
    document.body.insertAdjacentHTML(
        "beforeend",
        /*html*/ ` <div id="feedback-notif">${text}</div> `
    );
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
    }, notifTime);
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
            }, notifTime);
            setHTML("notif-text", "<div>Removed from memory</div>");
        });
    });
};

const adjustArxivColWidth = (newColWidth = "33%") => {
    document
        .getElementsByClassName("leftcolumn")[0]
        .setAttribute("style", `width: calc(100% - ${newColWidth}) !important`);
    document
        .getElementsByClassName("extra-services")[0]
        .setAttribute("style", `width: ${newColWidth} !important`);
};

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
    findEl("pm-publication-wrapper")?.remove();
    findEl("pm-header-content")?.insertAdjacentHTML("afterbegin", venueDiv);
};

const displayPaperCode = (paper) => {
    if (!paper.codeLink) {
        return;
    }
    const code = /*html*/ `
        <div id="pm-code">
        <h3>Code:</h3> <a id="pm-code-link" href="${paper.codeLink}">${paper.codeLink}</a>
        </div>
    `;
    findEl("pm-code")?.remove();
    findEl("pm-extras")?.insertAdjacentHTML("afterbegin", code);
};

const arxiv = async (checks) => {
    const { checkMd, checkBib, checkDownload, checkStore } = checks;
    global.state.titleFunction = (await getTitleFunction()).titleFunction;

    const url = window.location.href;
    const isArxivAbs = url.includes("https://arxiv.org/abs/");

    if (!isArxivAbs) return;

    const id = await parseIdFromUrl(url);
    document.querySelector(".extra-services .full-text").innerHTML = /*html*/ `
        <div>${document.querySelector(".extra-services .full-text").innerHTML}</div>
        <div id="pm-download-wrapper" class="pm-container">
            <div id="pm-header" style="width: 100%"><h2 id="pm-col-title">PaperMemory:</h2>
                <div id="pm-header-content"></div>
            </div>
        </div>
        <div id="pm-extras"></div>
    `;
    const pdfUrl = document.querySelector(".abs-button.download-pdf").href;
    const arxivPMDiv = findEl("pm-extras");

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
        findEl("pm-arxiv-direct-download")?.remove();
        document
            .getElementById("pm-header-content")
            .insertAdjacentHTML("beforeend", button);
        var downloadTimeout;
        addListener("arxiv-button", "click", async () => {
            removeClass("arxiv-button", "downloaded");
            addClass("arxiv-button", "downloaded");
            downloadTimeout && clearTimeout(downloadTimeout);
            downloadTimeout = setTimeout(() => {
                hasClass("arxiv-button", "downloaded") &&
                    removeClass("arxiv-button", "downloaded");
            }, 1500);
            if (!global.state.papers.hasOwnProperty(id)) {
                const title = await fetch(
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
                checkStore
                    ? sendMessageToBackground({
                          type: "download-pdf-to-store",
                          pdfUrl,
                          title,
                      })
                    : downloadFile(pdfUrl, title);
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
        findEl("markdown-container")?.remove();
        arxivPMDiv.insertAdjacentHTML("beforeend", mdHtml);
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
        arxivPMDiv.insertAdjacentHTML("beforeend", bibLoader);
        findEl("bibtexDiv")?.remove();
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

        findEl("loader-container").remove();
        arxivPMDiv.insertAdjacentHTML("beforeend", bibtexDiv);
        addListener(
            document.querySelector("#texHeader .copy-feedback"),
            "click",
            (e) => {
                $("#texHeader .copy-feedback").fadeOut(200, () => {
                    $("#texHeader .copy-feedback-ok").fadeIn(200, () => {
                        setTimeout(() => {
                            $("#texHeader .copy-feedback-ok").fadeOut(200, () => {
                                $("#texHeader .copy-feedback").fadeIn(200);
                            });
                        }, 1500);
                    });
                });
                copyTextToClipboard(findEl("pm-bibtex-textarea").innerText);
                feedback("Bibtex Citation Copied!");
            }
        );
        addListener(
            document.querySelector("#markdown-header .copy-feedback"),
            "click",
            (e) => {
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
                    findEl("markdown-link").innerText.replaceAll("\n", "")
                );
                feedback("Markdown Link Copied!");
            }
        );
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
            if (findEl("pm-bibtex-textarea")) {
                findEl("pm-bibtex-textarea").innerHTML = bibtexToString(
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
    var paperPromise, preprintsPromise;
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
        }
    });

    // 2 Promises:
    //   1. fetch paper data
    //   2. fetch preprints data
    preprintsPromise = new Promise(async (preprintsResolve) => {
        paperPromise = new Promise(async (paperResolve) => {
            // if the url is associated to a known source: trigger
            // the main functions.
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
            resolve();
        });
    });

    // wait for the paper to be parsed and the DOM to be loaded
    const results = await Promise.all([paperPromise, domReadyPromise]);

    paper = results[0];
    if (paper) {
        tryArxivDisplay({ url, paper, preprintsPromise });
    }
})();

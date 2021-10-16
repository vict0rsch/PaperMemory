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

const defaultPDFTitleFn = (title, id) => {
    title = title.replaceAll("\n", " ").replace(/\s\s+/g, " ");
    return `${title} - ${id}.pdf`;
};

const delay = (fn, ms) => {
    // https://stackoverflow.com/questions/1909441/how-to-delay-the-keyup-handler-until-the-user-stops-typing
    let timer = 0;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(fn.bind(this, ...args), ms || 0);
    };
};

const cleanPapers = (papers) => {
    let cleaned = { ...papers };
    delete cleaned["__dataVersion"];
    return cleaned;
};

const fallbackCopyTextToClipboard = (text) => {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand("copy");
        var msg = successful ? "successful" : "unsuccessful";
        console.log("Fallback: Copying text command was " + msg);
    } catch (err) {
        console.error("Fallback: Oops, unable to copy", err);
    }

    document.body.removeChild(textArea);
};

const copyTextToClipboard = (text) => {
    if (!navigator.clipboard) {
        fallbackCopyTextToClipboard(text);
        return;
    }
    navigator.clipboard.writeText(text).then(
        () => {
            console.log("Async: Copying to clipboard was successful!");
        },
        (err) => {
            console.error("Async: Could not copy text: ", err);
        }
    );
};

const parseUrl = (url) => {
    var a = document.createElement("a");
    a.href = url;
    return a;
};

const downloadTextFile = (content, fileName, contentType) => {
    var a = document.createElement("a");
    var file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
};

const eventId = (e) => {
    const el = $(e.target);
    const id = el.closest(".memory-item-container").attr("id").split("--")[1];
    const eid = id.replace(".", "\\.");
    return { id, eid };
};

const download_file = (fileURL, fileName) => {
    // for non-IE
    if (!window.ActiveXObject) {
        var save = document.createElement("a");
        save.href = fileURL;
        save.target = "_blank";
        var filename = fileURL.substring(fileURL.lastIndexOf("/") + 1);
        save.download = fileName || filename;
        if (
            navigator.userAgent.toLowerCase().match(/(ipad|iphone|safari)/) &&
            navigator.userAgent.search("Chrome") < 0
        ) {
            document.location = save.href;
            // window event not working here
        } else {
            var evt = new MouseEvent("click", {
                view: window,
                bubbles: true,
                cancelable: false,
            });
            save.dispatchEvent(evt);
            (window.URL || window.webkitURL).revokeObjectURL(save.href);
        }
    }

    // for IE < 11
    else if (!!window.ActiveXObject && document.execCommand) {
        var _window = window.open(fileURL, "_blank");
        _window.document.close();
        _window.document.execCommand("SaveAs", true, fileName || fileURL);
        _window.close();
    }
};

/**
 * Tries to parse the text input by the user to define the function that takes
 * a paper's title and ID in order to create the custom page title / pdf filename.
 * If there is an error, it uses the built-in function defaultPDFTitleFn.
 * @param {string} code The string describing the code function.
 * @returns {function} Either the user's function if it runs without errors, or the built-in
 * formatting function
 */
const getPdfFn = (code) => {
    try {
        pdfTitleFn = eval(code);
    } catch (error) {
        console.log("Error parsing pdf title function. Function string then error:");
        console.log(code);
        console.log(error);
        pdfTitleFn = defaultPDFTitleFn;
    }
    try {
        pdfTitleFn("test", "1.2");
    } catch (error) {
        console.log(
            "Error testing the user's pdf title function. Function string then error:"
        );
        console.log(code);
        console.log(error);
        pdfTitleFn = defaultPDFTitleFn;
    }

    return pdfTitleFn;
};

const migrateData = async (papers, dataVersion) => {
    if (typeof papers === "undefined") {
        return { papers: { __dataVersion: dataVersion }, success: true };
    }
    const currentVersion = papers["__dataVersion"] || -1;
    var deleteIds = [];

    try {
        if (papers.hasOwnProperty("__dataVersion")) {
            if (papers["__dataVersion"] === dataVersion) {
                return { papers: papers, success: true };
            }
        }

        backupData({ ...papers });

        delete papers["__dataVersion"];

        for (const id in papers) {
            if (currentVersion < 5) {
                // pre-0.2.8 and manifestDataVersion()
                if (!papers[id].hasOwnProperty("bibtext")) {
                    papers[id].bibtext = "";
                    console.log("Migrating bibtext for " + id);
                }
                if (!papers[id].pdfLink.endsWith(".pdf")) {
                    papers[id].pdfLink = papers[id].pdfLink + ".pdf";
                }
                if (!papers[id].codeLink) {
                    papers[id].codeLink = "";
                }
                if (!papers[id].source) {
                    if (papers[id].id.includes("NeurIPS")) {
                        papers[id].source = "neurips";
                    } else {
                        papers[id].source = "arxiv";
                    }
                }
            }
            if (currentVersion < 208) {
                // 0.2.8
                if (
                    papers[id].source !== "arxiv" &&
                    papers[id].md.includes("https://arxiv.com/abs/")
                ) {
                    papers[id].md = `[${papers[id].title}](${papers[id].pdfLink})`;
                }
                if (
                    papers[id].source !== "arxiv" &&
                    papers[id].pdfLink.includes("arxiv.org/pdf/")
                ) {
                    papers[id].source = "arxiv";
                }
                if (id.match(/^\d/) && papers[id].source === "arxiv") {
                    const newId = `Arxiv-${id}`;
                    let newPaper = { ...papers[id], id: newId };
                    papers[newId] = newPaper;
                    deleteIds.push(id);
                }
            }
            if (currentVersion < 209) {
                if (!papers[id].hasOwnProperty("favorite")) {
                    papers[id].favorite = false;
                    papers[id].favoriteDate = "";
                }
            }

            // need to fix https://github.com/vict0rsch/ArxivTools/issues/10
            // if (!papers[id].hasOwnProperty("codes")) {
            //     papers[id].codes = await fetchCodes(papers[id])
            // }
        }

        deleteIds.forEach((id, k) => {
            delete papers[id];
            console.log("Deleting " + id);
        });

        let newPapers = { ...papers };
        newPapers["__dataVersion"] = dataVersion;

        chrome.storage.local.set({ papers: newPapers }, () => {
            console.log("Migrated papers:");
            console.log(newPapers);
            console.log("Data version is now " + dataVersion);
        });

        return { papers: newPapers, success: true };
    } catch (error) {
        console.log(
            `Error migrating data from version ${currentVersion} to ${dataVersion}: `
        );
        console.log(error);
        return { papers: newPapers, success: false };
    }
};

const logStorage = (key) => {
    chrome.storage.local.get(key, (data) => {
        console.log(data[key]);
    });
};

const getStorage = async (key) => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (data) => {
            if (typeof key === "string") {
                resolve(data[key]);
            } else {
                resolve(data);
            }
        });
    });
};

const setStorage = async (key, value) => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            resolve(true);
        });
    });
};

const backupData = async (papers) => {
    chrome.storage.local.get("papersBackup", ({ papersBackup }) => {
        if (typeof papersBackup === "undefined") {
            papersBackup = {};
        }

        const oldestKeys = Object.keys(papersBackup)
            .map((v) => parseInt(v))
            .sort((a, b) => (a < b ? 1 : -1))
            .slice(4);

        for (const key of oldestKeys) {
            delete papersBackup[key];
        }

        papersBackup[papers["__dataVersion"]] = papers;

        chrome.storage.local.set({ papersBackup }, () => {
            console.log("Backed up data with version: " + papers["__dataVersion"]);
        });
    });
};

const statePdfTitle = (title, id) => {
    let name;
    try {
        name = _state.pdfTitleFn(title, id);
    } catch (error) {
        name = defaultPDFTitleFn(title, id);
    }

    return name.replaceAll("\n", " ").replace(/\s\s+/g, " ");
};

const manifestDataVersion = () => {
    // ArxivTools version a.b.c => data version a * 10^4 + b * 10^2 + c
    // (with 10^2 and 10^1, 0.3.1 would be lower than 0.2.12)
    const manifest = chrome.runtime.getManifest();
    return manifest.version
        .split(".")
        .map((v, k) => parseInt(v) * 10 ** (4 - 2 * k))
        .reduce((a, b) => a + b);
};

const initState = async (papers, isContentScript) => {
    if (typeof papers === "undefined") {
        papers = await getStorage("papers");
    }
    console.log("Found papers:", papers);

    _state.dataVersion = manifestDataVersion();
    _state.pdfTitleFn = defaultPDFTitleFn;

    const migration = await migrateData(papers, _state.dataVersion);
    papers = migration.papers;

    if (isContentScript) return papers;

    _state.papers = papers;
    _state.papersList = Object.values(cleanPapers(papers));
    _state.sortKey = "lastOpenDate";
    _state.papersReady = true;
    sortMemory();
    makeTags();
};

const hashCode = (s) => {
    return s.split("").reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
    }, 0);
};

const parseCVFUrl = (url) => {
    // model: https://openaccess.thecvf.com/content_ICCV_2017/papers/Campbell_Globally-Optimal_Inlier_Set_ICCV_2017_paper.pdf
    // or   : https://openaccess.thecvf.com/content/ICCV2021/html/Jang_C2N_Practical_Generative_Noise_Modeling_for_Real-World_Denoising_ICCV_2021_paper.html
    const confAndYear = url
        .replace("https://openaccess.thecvf.com/content", "")
        .slice(1)
        .split("/")[0]
        .split("_");
    let conf, year;
    if (confAndYear.length === 1) {
        conf = confAndYear[0].slice(0, -4);
        year = confAndYear[0].slice(-4);
    } else {
        conf = confAndYear[0].toUpperCase();
        year = confAndYear[1];
    }
    const titleUrl = url.split("/").reverse()[0].split(".")[0];
    const hash = (hashCode(titleUrl) + "").replace("-", "").slice(0, 8);
    const id = `${conf}-${year}_${hash}`;

    return { conf, year, id };
};

const isPaper = (url) => {
    const a = parseUrl(url);
    let is = {};
    for (const source in _knownPaperPages) {
        const paths = _knownPaperPages[source];
        is[source] = false;
        for (const path of paths) {
            if (url.includes(path)) {
                is[source] = true;
            }
        }
    }

    return is;
};

const parseIdFromUrl = (url) => {
    const is = isPaper(url);
    if (is.arxiv) {
        const arxivId = url.split("/").reverse()[0].replace(".pdf", "").split("v")[0];
        return `Arxiv-${arxivId}`;
    } else if (is.neurips) {
        const year = url.split("/paper/")[1].split("/")[0];
        const hash = url.split("/").reverse()[0].split("-")[0].slice(0, 8);
        return `NeurIPS-${year}_${hash}`;
    } else if (is.cvf) {
        return parseCVFUrl(url).id;
    } else {
        throw Error("unknown paper url");
    }
};

const handlePopupKeydown = (e) => {
    const key = e.key;
    if (["Backspace", "Enter", "Escape", "a", "e"].indexOf(key) < 0) {
        return;
    }

    if (_state.menuIsOpen) {
        if (key === "Escape") {
            // escape closes menu
            e.preventDefault();
            closeMenu();
        }
        return;
    }

    if (!_state.memoryIsOpen) {
        if (key === "a") {
            // a opens the arxiv memory
            const focused = $(":focus");
            if (focused.length && focused.hasClass("noMemoryOnA")) return;
            $("#memory-switch").trigger("click");
        } else if (key === "Enter") {
            // enter on the arxiv memory button opens it
            let el = $("#memory-switch-text-on:focus").first();
            if (el.length > 0) {
                $("#memory-switch").trigger("click");
                return;
            }
            // enter on the menu button opens it
            el = $("#tabler-menu:focus").first();
            if (el.length > 0) {
                $("#tabler-menu").trigger("click");
                $("#tabler-menu").trigger("blur");
                return;
            }
        }
        return;
    }

    // Now memory is open

    let id, eid;
    const el = $(".memory-item-container:focus").first();
    if (key !== "Escape") {
        if (el.length !== 1) return;
        id = el.attr("id").split("--")[1];
        eid = id.replace(".", "\\.");
    }

    if (key === "Backspace") {
        // delete
        findEl(eid, "delete-memory-item").trigger("click");
    } else if (key === "Enter") {
        // open paper
        findEl(eid, "memory-item-link").trigger("click");
    } else if (key === "Escape") {
        // close memory
        e.preventDefault();
        closeMemory();
    } else if (key === "e") {
        // edit item
        findEl(eid, "memory-item-edit").trigger("click");
    }
};

const focusEndTextarea = (element) => {
    setTimeout(() => {
        element.selectionStart = element.selectionEnd = 10000;
    }, 0);
};

const formatBibtext = (text) => {
    let bib = $.trim(text).split("\n").join("");
    const matches = bib.match(/\w+\ ?=/g);
    if (matches) {
        for (const m of matches) {
            bib = bib.replace(m, `\n  ${m}`);
        }
    }
    if (bib.slice(-2) === "}}") {
        bib = bib.slice(0, -1) + "\n}";
    }
    return bib;
};

const validatePaper = (paper) => {
    const expectedKeys = [
        "addDate", //      {string}    the paper's date of addition to the Memory
        "author", //       {string}    ` and `-separated authors `${firstName} ${lastName}`
        "bibtext", //      {string}    BibTex citation with new lines (`\n`)
        "codeLink", //     {string}    to the paper's code link
        "count", //        {int}       the paper's number of visits
        "favorite", //     {boolean}   user wants to star the paper
        "favoriteDate", // {string}    date the paper was added as a favorite
        "id", //           {string}    Unique ArxivTools ID
        "key", //          {string}    BibTex citation key
        "lastOpenDate", // {string}    When the paper was last opened
        "md", //           {string}    markdown-formatted string `[${title}](${pdfLink})`
        "note", //         {string}    of the user's note for this paper
        "pdfLink", //      {string}    of the link to the paper's pdf
        "source", //       {string}    describing the paper's source
        "tags", //         {string []} the user's tags for this paper
        "year", //         {string}    year of publication
    ];

    let warn = false;

    for (const key of expectedKeys) {
        if (!paper.hasOwnProperty(key)) {
            warn = true;
            console.warn(`Key ${key} absent from paper ${paper}`);
        }
    }

    const sources = Object.keys(_knownPaperPages);
    if (sources.indexOf(paper.source) < 0) {
        warn = true;
        console.warn(`Unknown source ${paper.source} for paper ${paper}`);
    }

    return warn;
};

const showId = (id, display) => {
    if (typeof display === "undefined") display = "block";
    document.getElementById(id).style.display = display;
};
const hideId = (id) => {
    document.getElementById(id).style.display = "none";
};
const setTextId = (id, text) => {
    document.getElementById(id).innerText = text;
};
const setHTMLId = (id, html) => {
    document.getElementById(id).innerHTML = html;
};

const tablerSvg = (pathName, id, classNames) => {
    if (typeof id === "undefined") {
        id = "";
    }
    if (typeof classNames === "undefined") {
        classNames = [];
    }

    if (id) {
        id = `id="${id}"`;
    }

    classNames = classNames.filter((c) => c);
    if (classNames) {
        classNames = `class="${classNames.join(" ")}"`;
    }

    switch (pathName) {
        case "adjustments":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <circle cx="6" cy="10" r="2" />
            <line x1="6" y1="4" x2="6" y2="8" />
            <line x1="6" y1="12" x2="6" y2="20" />
            <circle cx="12" cy="16" r="2" />
            <line x1="12" y1="4" x2="12" y2="14" />
            <line x1="12" y1="18" x2="12" y2="20" />
            <circle cx="18" cy="7" r="2" />
            <line x1="18" y1="4" x2="18" y2="5" />
            <line x1="18" y1="9" x2="18" y2="20" />
            </svg>`;

        case "circle-x":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <circle cx="12" cy="12" r="9" />
            <path d="M10 10l4 4m0 -4l-4 4" />
            </svg>`;

        case "star":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z" />
            </svg>`;

        case "writing":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M20 17v-12c0 -1.121 -.879 -2 -2 -2s-2 .879 -2 2v12l2 2l2 -2z" />
            <path d="M16 7h4" />
            <path d="M18 19h-13a2 2 0 1 1 0 -4h4a2 2 0 1 0 0 -4h-3" />
            </svg>`;

        case "file-symlink":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M4 21v-4a3 3 0 0 1 3 -3h5" />
            <path d="M9 17l3 -3l-3 -3" />
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M5 11v-6a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2h-9.5" />
            </svg>`;

        case "link":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M10 14a3.5 3.5 0 0 0 5 0l4 -4a3.5 3.5 0 0 0 -5 -5l-.5 .5" />
            <path d="M14 10a3.5 3.5 0 0 0 -5 0l-4 4a3.5 3.5 0 0 0 5 5l.5 -.5" />
            </svg>`;

        case "clipboard-list":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="2" />
            <line x1="9" y1="12" x2="9.01" y2="12" />
            <line x1="13" y1="12" x2="15" y2="12" />
            <line x1="9" y1="16" x2="9.01" y2="16" />
            <line x1="13" y1="16" x2="15" y2="16" />
            </svg>`;

        case "archive":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <rect x="3" y="4" width="18" height="4" rx="2" />
            <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" />
            <line x1="10" y1="12" x2="14" y2="12" />
            </svg>`;

        case "external-link":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M11 7h-5a2 2 0 0 0 -2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2 -2v-5" />
            <line x1="10" y1="14" x2="20" y2="4" />
            <polyline points="15 4 20 4 20 9" />
            </svg>`;

        case "file-download":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M14 3v4a1 1 0 0 0 1 1h4" />
            <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <polyline points="9 14 12 17 15 14" />
             </svg>`;

        case "external-link":
            return ``;

        case "external-link":
            return ``;

        default:
            return "";
    }
};

const loadJSONToMemory = async (jsonString) => {
    let error = true;
    let warning = false;
    let message = "";
    try {
        const data = JSON.parse(jsonString);
        if (!data.__dataVersion) {
            data.__dataVersion = 1;
        }
        const migration = await migrateData(data, manifestDataVersion());
        if (!migration.success) {
            alert("Bug");
            return;
        }
        const { papers } = migration;
        for (const id in papers) {
            if (!id.startsWith("__")) {
                paperWarning = validatePaper(papers[id]);
                if (paperWarning) {
                    warning = true;
                }
            }
        }
        if (warning) {
            const prevPapers = await getStorage("papers");
            setStorage("uploadBackup", prevPapers);
        }
        setStorage("papers", papers);
        error = false;
    } catch (err) {
        message = err;
    }
    return { success: error, message: message };
};

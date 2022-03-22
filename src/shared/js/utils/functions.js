const logTrace = typeof LOGTRACE !== "undefined" && LOGTRACE;

const log = (...args) => {
    const stack = new Error().stack;
    const debugMessage = logTrace
        ? "\n\nLog trace:\n" + stack.split("\n").slice(2).join("\n")
        : "";
    console.log("[PM] ", ...args, debugMessage);
};

const info = (...args) => log("%c[PM] " + args.join(" "), "color: #328DD2");

const getDisplayId = (id) => {
    const baseId = id;
    id = id.split("_")[0].split(".")[0];
    if (!id.startsWith("OR-")) {
        id = id.split("-").slice(0, 2).join("-");
    }
    if (global.state.papers.hasOwnProperty(baseId)) {
        const paper = global.state.papers[baseId];
        if (paper.source === "nature") {
            if (paper.note.match(/^Published\ @.+\(\d+\)$/)) {
                const journal = paper.note.split("@")[1].split("(")[0].trim();
                id += `-${journal
                    .split(" ")
                    .map((j) => j[0].toUpperCase())
                    .join("")}`;
            }
            id += `-${paper.year}`;
        }
    }
    return id;
};

const isObject = (obj) =>
    typeof obj === "object" && !Array.isArray(obj) && obj !== null;

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

const capitalize = (s) => {
    return s.charAt(0).toUpperCase() + s.slice(1);
};

const firstNonStopLowercase = (title) => {
    let t = title.toLowerCase();
    let words = t.split(" ").map((w) => w.replace(/[^0-9a-z]/gi, ""));
    let meaningful = words.filter((w) => global.englishStopWords.has(w));
    if (meaningful.length > 0) {
        return meaningful[0];
    }
    return words[0];
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
        log("Fallback: Copying text command was " + msg);
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
            log("Async: Copying to clipboard was successful!");
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
    if (contentType === "text/plain") {
        content = content.replace(/\\n/g, "%0D%0A").replace(/"/g, "");
        a.download = fileName;
        a.href = "data:text/plain," + content;
    } else {
        var file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
    }
    a.click();
};

const eventId = (e) => {
    return e.target.closest(".memory-container").id.split("--")[1];
};

const downloadFile = (fileURL, fileName) => {
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

const cleanBiorxivURL = (url) => {
    url = url.replace(".full.pdf", "");
    if (!url.match(/\d$/)) {
        url = url.split(".").slice(0, -1).join(".");
    }
    return url;
};

const textareaFocusEnd = (element) => {
    setTimeout(() => {
        element.selectionStart = element.selectionEnd = 10000;
    }, 0);
};

const formatBibtext = (text) => {
    let bib = text.trim().split("\n").join("").replace(/\s+=/g, " =");
    const spaceMatches = bib.match(/\ \w+\ ?=\ ?{/g) || [];
    const commaMatches = bib.match(/,\w+\ ?=\ ?{/g) || [];
    if (spaceMatches && spaceMatches.length > 0) {
        for (const m of spaceMatches) {
            bib = bib.replace(m, `\n ${m}`);
        }
    }
    if (commaMatches && commaMatches.length > 0) {
        for (const m of commaMatches) {
            const key = m.replace(",", "");
            bib = bib.replace(m, `,\n  ${key}`);
        }
    }
    if (bib.slice(-2) === "}}") {
        bib = bib.slice(0, -1) + "\n}";
    }
    return bib.replaceAll("{ ", "{").replaceAll(" }", "}").replaceAll(" = ", "=");
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

        case "cirlce-x":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
			<path stroke="none" d="M0 0h24v24H0z" fill="none" />
			<circle cx="12" cy="12" r="9" />
			<path d="M10 10l4 4m0 -4l-4 4" />
		    </svg>`;

        case "settings":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
            <path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" />
            <circle cx="12" cy="12" r="3" />
            </svg>`;

        case "messages":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" />
                <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
            </svg>`;

        case "vocabulary":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M10 19h-6a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1h6a2 2 0 0 1 2 2a2 2 0 0 1 2 -2h6a1 1 0 0 1 1 1v14a1 1 0 0 1 -1 1h-6a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2z" />
                <path d="M12 5v16" />
                <path d="M7 7h1" />
                <path d="M7 11h1" />
                <path d="M16 7h1" />
                <path d="M16 11h1" />
                <path d="M16 15h1" />
            </svg>`;

        case "database-export":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <ellipse cx="12" cy="6" rx="8" ry="3" />
                <path d="M4 6v6c0 1.657 3.582 3 8 3a19.84 19.84 0 0 0 3.302 -.267m4.698 -2.733v-6" />
                <path d="M4 12v6c0 1.599 3.335 2.905 7.538 2.995m8.462 -6.995v-2m-6 7h7m-3 -3l3 3l-3 3" />
            </svg>`;
        case "eyeglass":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M8 4h-2l-3 10" />
                <path d="M16 4h2l3 10" />
                <line x1="10" y1="16" x2="14" y2="16" />
                <path d="M21 16.5a3.5 3.5 0 0 1 -7 0v-2.5h7v2.5" />
                <path d="M10 16.5a3.5 3.5 0 0 1 -7 0v-2.5h7v2.5" />
            </svg>`;

        case "markdown":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M7 15v-6l2 2l2 -2v6" />
                <path d="M14 13l2 2l2 -2m-2 2v-6" />
            </svg>`;

        case "math-function":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>            
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M14 10h1c1 0 1 1 2.016 3.527c.984 2.473 .984 3.473 1.984 3.473h1" />
                <path d="M13 17c1.5 0 3 -2 4 -3.5s2.5 -3.5 4 -3.5" />
                <path d="M3 19c0 1.5 .5 2 2 2s2 -4 3 -9s1.5 -9 3 -9s2 .5 2 2" />
                <line x1="5" y1="12" x2="11" y2="12" />
            </svg>`;

        default:
            return "";
    }
};

const stringifyError = (e) => {
    const extId = chrome.runtime.id;
    return e.stack
        .split("\n")
        .map((line) =>
            line
                .split(" ")
                .map((word) => word.split(extId).reverse()[0])
                .join(" ")
        )
        .join("<br/>");
};

const arraysIdentical = (a, b) => {
    var i = a.length;
    if (i != b.length) return false;
    while (i--) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

const parseTags = (el) => {
    let tags = Array.from(el.selectedOptions, (e) => e.value.trim()).filter((e) => e);
    tags.sort();
    return tags;
};

const getPaperEdits = (id, isPopup) => {
    let note, tags, codeLink, favorite;

    if (isPopup) {
        note = val(`popup-form-note-textarea--${id}`);
        codeLink = val(
            document
                .getElementById(`popup-form-note--${id}`)
                .querySelector(".form-code-input")
        );
        tags = parseTags(findEl(`popup-item-tags--${id}`));
        favorite = findEl(`checkFavorite--${id}`).checked;
    } else {
        note = val(findEl(id, "form-note-textarea"));
        codeLink = val(findEl(id, "form-code-input"));
        tags = parseTags(findEl(id, "memory-item-tags"));
        favorite = hasClass(`memory-container--${id}`, "favorite");
    }

    return { note, tags, codeLink, favorite };
};

const setFormChangeListener = (id, isPopup) => {
    let refTags, refNote, refCodeLink, refFavorite;
    if (isPopup) {
        refTags = `#popup-item-tags--${id.replace(".", "\\.")}`;
        refCodeLink = `popup-form-codeLink--${id}`;
        refNote = `popup-form-note-textarea--${id}`;
        refFavorite = `checkFavorite--${id}`;

        $(refTags).on("change", delay(monitorPaperEdits(id, isPopup), 300)); // select2 required
        addListener(refCodeLink, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
        addListener(refNote, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
        addListener(refFavorite, "change", delay(monitorPaperEdits(id, isPopup), 300));
    } else {
        refTags = ".memory-item-tags";
        refCodeLink = ".form-code-input";
        refNote = ".form-note-textarea";

        addEventToClass(
            refCodeLink,
            "keyup",
            delay(monitorPaperEdits(id, isPopup), 300)
        );
        addEventToClass(refNote, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
    }
};

const monitorPaperEdits = (id, isPopup) => (e) => {
    if (typeof id === "undefined") {
        id = eventId(e);
    }
    const edits = getPaperEdits(id, isPopup);
    const paper = global.state.papers[id];
    let change = false;
    let refs = {};
    for (const key in edits) {
        const ref = paper[key];
        refs[key] = ref;
        const value = edits[key];
        if (key === "tags" && !arraysIdentical(ref, value)) {
            change = true;
        } else if (key !== "tags") {
            if (ref !== value) {
                change = true;
            }
        }
    }
    if (change) {
        console.log("Updating", id, isPopup);
        if (isPopup) {
            handlePopupSaveEdits(id);
        } else {
            handleMemorySaveEdits(id);
        }
    }
};

const cutAuthors = (text, maxLen, separator) => {
    if (typeof maxLen === "undefined") {
        maxLen = 140;
    }
    if (typeof separator === "undefined") {
        separator = ", ";
    }
    let cutAuthors = "";
    const authArray = text.split(" and ");
    const lastAuthor = authArray[authArray.length - 1];
    for (const candidate of authArray) {
        if (
            5 +
                cutAuthors.length +
                separator.length +
                candidate.length +
                lastAuthor.length <
            maxLen
        ) {
            if (cutAuthors) {
                cutAuthors += ", " + candidate;
            } else {
                cutAuthors = candidate;
            }
        } else {
            cutAuthors += " ... " + lastAuthor;
            break;
        }
    }
    return cutAuthors;
};

/**
 * Promise wrapper around content script => background script message passing
 * @param {object} payload Data to transfer to the background script
 * @returns Promise that resolves the response
 */
const sendMessageToBackground = (payload) =>
    new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, (response) => {
            resolve(response);
        });
    });

const getStoredFiles = () =>
    new Promise((resolve) => {
        chrome.downloads.search(
            {
                filenameRegex: "PaperMemoryStore/.*",
            },
            (files) => resolve(files.filter((f) => f.exists && f.state === "complete"))
        );
    });

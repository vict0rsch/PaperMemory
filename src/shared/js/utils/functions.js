// ES Module imports
import {
    state,
    descendingSortKeys,
    svgActionsHoverTitles,
    consolHeaderStyle,
    englishStopWords,
} from "@pmu/config.js";
import { getSource } from "@pmu/sources/index.js";
import { LOGTRACE } from "@pmu/logTrace.js";
import { val, hasClass, findEl } from "@pmu/miniquery.js";

/**
 * Escapes HTML special characters to prevent XSS when inserting into HTML.
 * @param {string} str The string to escape
 * @returns {string} The escaped string
 */
export const escapeHtml = (str) => {
    if (typeof str !== "string") return String(str ?? "");
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
};

/**
 * Generate a random integer between 0 and max
 * @param {number} max The maximum value of the random integer
 * @returns {number} The random integer
 */
export function getRandomInt(max) {
    // https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    return Math.floor(Math.random() * max);
}

/** Function to log to console with a prefix
 * @param {any} args The list of arguments to log
 * @returns {void}
 */
export const log = (...args) => {
    let messageConfig = "%c%s ";

    let isInfo = false;
    let isWarn = false;
    let isError = false;
    let isDebug = false;
    let isOk = false;
    if (args[0] === "[info]") {
        isInfo = true;
        args = args.slice(1);
    } else if (args[0] === "[warn]") {
        isWarn = true;
        args = args.slice(1);
    } else if (args[0] === "[error]") {
        isError = true;
        args = args.slice(1);
    } else if (args[0] === "[ok]") {
        isOk = true;
        args = args.slice(1);
    } else if (args[0] === "[debug]") {
        isDebug = true;
        args = args.slice(1);
    }

    if (
        (isError && LOGTRACE >= 1) ||
        (isWarn && LOGTRACE >= 2) ||
        (isInfo && LOGTRACE >= 3) ||
        (isDebug && LOGTRACE >= 4) ||
        LOGTRACE >= 5
    ) {
        const stack = new Error().stack;
        args.push("\n\nLog trace:\n" + stack.split("\n").slice(2).join("\n"));
    }
    // https://stackoverflow.com/questions/55643825/how-to-apply-colors-to-console-log-when-using-multiple-arguments
    args.forEach((argument) => {
        const type = typeof argument;
        switch (type) {
            case "bigint":
            case "number":
                messageConfig += "%d   ";
                break;

            case "string":
                messageConfig += "%s   ";
                break;

            case "object":
            case "undefined":
            case "boolean":
            default:
                messageConfig += "%o   ";
        }
    });
    console.log(
        messageConfig,
        `color: ${
            isInfo
                ? "#8BB4F7; font-weight:bold;"
                : isWarn
                  ? "#f3bd1e; font-weight:bold;"
                  : isError
                    ? "#FF4F54; font-weight:bold;"
                    : isOk
                      ? "#23F62B; font-weight:bold;"
                      : isDebug
                        ? "#BA357E; font-weight:bold;"
                        : "tan"
        }`,
        "[PM]",
        ...args,
    );
};

/** Log an info message in blue
 * @param {any} args The list of arguments to log
 * @returns {void}
 */
export const info = (...args) => log(...["[info]", ...args]);

/** Log a warning message in yellow
 * @param {any} args The list of arguments to log
 * @returns {void}
 * */
export const warn = (...args) => log(...["[warn]", ...args]);

/** Log a debug message in purple
 * @param {any} args The list of arguments to log
 * @returns {void}
 * */
export const debug = (...args) => log(...["[debug]", ...args]);

/** Log a success message in green
 * @param {any} args The list of arguments to log
 * @returns {void}
 */
export const logOk = (...args) => log(...["[ok]", ...args]);

/** Log an error message in red
 * @param {any} args The list of arguments to log
 * @returns {void}
 * */
export const logError = (...args) => log(...["[error]", ...args]);

/** Create a group of logs in the console
 *  @param {string} text The text to display in the group
 */
export const consoleHeader = (text) =>
    console.groupCollapsed(`%c${text}`, consolHeaderStyle);

/** Gets the string to display from a paper (id + source-specific suffixes).
 * @param {object} paper The paper (uses paper.id)
 * @returns {string} The string to display
 */
export const getDisplayId = (paper) => {
    const fullId = paper.id;
    let id = fullId.split("_")[0].split(".")[0];
    if (!id.startsWith("OR-")) {
        id = id.split("-").slice(0, 2).join("-");
    }
    const src = getSource(paper.source);
    return src ? src.displayId(paper, id) : id;
};

/** Whether or not a variable is an object
 * @param {any} obj The variable to test
 * @returns {boolean} Whether or not the variable is an object
 */
export const isObject = (obj) =>
    typeof obj === "object" && !Array.isArray(obj) && obj !== null;

/** Whether or not this url leads to a pdf
 * @param {string} url The url to test
 * @returns {boolean} Whether or not the url leads to a pdf
 */
export const isPdfUrl = (url) => {
    return (
        url.endsWith(".pdf") ||
        url.endsWith("/pdf") ||
        url.includes("openreview.net/pdf") ||
        url.match(/\/e?pdf\//g) ||
        url.includes("ieee.org/stamp/stamp.jsp?tp=&arnumber=") ||
        url.includes("articlepdf")
    );
};

/** Delay the execution of a function for sometime and reset the timer if called again
 * @param {function} fn The function to delay
 * @param {number} ms The number of milliseconds to delay the function
 * @returns {function} The delayed function
 */
export function delay(fn, ms) {
    // https://stackoverflow.com/questions/1909441/how-to-delay-the-keyup-handler-until-the-user-stops-typing
    let timer = 0;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(fn.bind(this, ...args), ms || 0);
    };
}

/** Remove the `__dataVersion` property from a dict of papers
 * @param {Object} papers The dict of papers to clean
 * @returns {Object} The cleaned dict of papers
 */
export const cleanPapers = (papers) => {
    let cleaned = { ...papers };
    Object.keys(cleaned).forEach((k) => {
        if (k.startsWith("__")) {
            delete cleaned[k];
        }
    });
    return cleaned;
};

/**
 * Gets the lowercased first non english stop word from a title using the
 * global english stop words set in config.js. If no stop words are found,
 * the first word is returned.
 * @param {string} title The title to get the first non stop word from
 * @returns {string} The first non stop word
 */
export const firstNonStopLowercase = (title) => {
    let t = title.toLowerCase();
    let words = t.split(" ").map(miniHash);
    let meaningful = words.filter((w) => !englishStopWords.has(w));
    if (meaningful.length > 0) {
        return meaningful[0];
    }
    return words[0];
};

/** Custom simple hash function that returns a lowercase string
 * with no special characters (only letters and numbers are allowed)
 * @param {string} str The string to hash
 * @param {string} replace The string to replace non-alphanumeric characters with (default is "")
 * @returns {string} The hashed string
 */
export const miniHash = (str, replace) => {
    if (typeof replace === "undefined") {
        replace = "";
    }
    return str.toLowerCase().replace(/\W/g, replace);
};

/**
 * Fallback method to copy some text to the clipboard if the user's browser
 * does not support the Clipboard API (navigator.clipboard)
 * @param {string} text The text to copy to the clipboard
 * @returns {void}
 */
export const fallbackCopyTextToClipboard = (text) => {
    // Only available in DOM context, not in service workers
    if (typeof document === "undefined") {
        warn(
            "fallbackCopyTextToClipboard called in service worker context - not supported",
        );
        return;
    }

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

/** Copy some text to the clipboard using the Clipboard API,
 * if available, or fallback to the fallbackCopyTextToClipboard function
 * @param {string} text The text to copy to the clipboard
 * @returns {void}
 * */
export const copyTextToClipboard = (text) => {
    // Only available in DOM context, not in service workers
    if (typeof navigator === "undefined" || typeof document === "undefined") {
        warn("copyTextToClipboard called in service worker context - not supported");
        return;
    }

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
        },
    );
};

/** Paste richly formatted text.
 *
 * @param {string} rich - the text formatted as HTML
 * @param {string} plain - a plain text fallback
 */
async function pasteRich(rich, plain) {
    // Only available in DOM context, not in service workers
    if (typeof document === "undefined" || typeof navigator === "undefined") {
        warn("pasteRich called in service worker context - not supported");
        return;
    }

    if (typeof ClipboardItem !== "undefined") {
        // Shiny new Clipboard API, not fully supported in Firefox.
        // https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#browser_compatibility
        const html = new Blob([rich], { type: "text/html" });
        const text = new Blob([plain], { type: "text/plain" });
        const data = new ClipboardItem({ "text/html": html, "text/plain": text });
        await navigator.clipboard.write([data]);
    } else {
        // Fallback using the deprecated `document.execCommand`.
        // https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand#browser_compatibility
        const cb = (e) => {
            e.clipboardData.setData("text/html", rich);
            e.clipboardData.setData("text/plain", plain);
            e.preventDefault();
        };
        document.addEventListener("copy", cb);
        document.execCommand("copy");
        document.removeEventListener("copy", cb);
    }
}

/** Copy a hyperlink to the clipboard using the Clipboard API,
 * if available, or fallback to the fallbackCopyTextToClipboard function
 * @param {string} url The url to copy to the clipboard
 * @param {string} title The title of the url to copy to the clipboard
 * @returns {void}
 * */
export const copyHyperLinkToClipboard = (url, title) => {
    const linkHtml = `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
    pasteRich(linkHtml, `${title} ${url}`);
};

/**
 * Parse a url and return an object with the url's components
 * @param {string} url The url to parse
 * @returns {HTMLAnchorElement} The parsed url
 */
export const parseUrl = (url) => {
    var a = document.createElement("a");
    a.href = url;
    return a;
};

/** Download a file to the user's computer
 * @param {string} content The content of the file to download
 * @param {string} fileName The name of the file to download
 * @param {string} contentType The type of the file to download
 * @returns {void}
 * */
export const downloadTextFile = (content, fileName, contentType) => {
    // Only available in DOM context, not in service workers
    if (typeof document === "undefined") {
        warn("downloadTextFile called in service worker context - not supported");
        return;
    }

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

export const dummyEvent = (id) => {
    return {
        target: {
            closest: () => ({ id: `memory-container--${id}` }),
        },
    };
};

/**
 * Get the id of a paper from a click event inside a .memory-container for
 * a memory item.
 * @param {Event} e The click event
 * @returns {string} The id of the paper
 */
export const eventId = (e) => {
    return e.target.closest(".memory-container")?.id?.split("--")[1];
};

/**
 * Download a file from a url
 * @param {string} url The url of the file to download
 * @param {string} name The name of the file to download
 * @returns {void}
 * */
export async function downloadURI(url, name) {
    // Only available in DOM context, not in service workers
    if (typeof document === "undefined") {
        warn("downloadURI called in service worker context - not supported");
        return;
    }

    name = name.replace(/[^\w\s]/gi, "");
    let blob = await fetch(url).then((r) => r.blob());
    var f = new FileReader();
    f.readAsDataURL(blob);
    f.onload = (d) => {
        var uri = d.target.result;
        var link = document.createElement("a");
        link.download = name;
        link.href = uri;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
}

/**
 * Download a file from a url
 * @param {string} fileURL The url of the file to download
 * @param {string} fileName The name of the file to download
 * @returns {void}
 * */
export const downloadFile = (fileURL, fileName) => {
    // Only available in DOM context, not in service workers
    if (typeof window === "undefined") {
        warn("downloadFile called in service worker context - not supported");
        return;
    }

    // for non-IE
    if (!window.ActiveXObject) {
        var save = document.createElement("a");
        save.href = fileURL;
        save.target = "_blank";
        save.download = fileName;
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
 * Computes a hash code from a string
 * @param {string} s The string to hash
 * @returns {number} The hash code
 * */
export const hashCode = (s) => {
    return s.split("").reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0);
        return a & a;
    }, 0);
};

/**
 * Parse { conf, year, id } from a url
 * @param {String} url URL to parse data from
 * @returns {Object} { conf, year, id }
 */
export const parseCVFUrl = (url) => {
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
    const titleUrl = url.split("/").last().split(".")[0];
    const hash = (hashCode(titleUrl) + "").replace("-", "").slice(0, 8);
    const id = `${conf}-${year}_${hash}`;

    return { conf, year, id };
};

/**
 * Cleans-up a biorxiv url: no pdf ref and no trailing section refs:
 * eg:
 * @param {string} url The url to a biorxiv paper to clean up
 * @returns {string}
 */
export const cleanBiorxivURL = (url) => {
    url = url.replace(".full.pdf", "");
    if (!url.match(/\d$/)) {
        url = url.split(".").slice(0, -1).join(".");
    }
    return url;
};

/**
 * Sets the cursor at the end of a text area on focus
 * @param {HTMLElement} element The textarea to focus
 */
export const textareaFocusEnd = (element) => {
    setTimeout(() => {
        element.selectionStart = element.selectionEnd = 10e3;
    }, 0);
};

/**
 * Get the html string of an svg icon with id and classes
 * @param {string} pathName The name of the svg to return
 * @param {string} id Optional html id for the svg tag
 * @param {array} classNames An optional array of classNames to add to the svg tag
 * @returns {string} A string of html for the svg tag
 */
export const tablerSvg = (pathName, id, classNames) => {
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

        case "circle-x":
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

        case "ar5iv":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 2l.642 .005l.616 .017l.299 .013l.579 .034l.553 .046c4.687 .455 6.65 2.333 7.166 6.906l.03 .29l.046 .553l.041 .727l.006 .15l.017 .617l.005 .642l-.005 .642l-.017 .616l-.013 .299l-.034 .579l-.046 .553c-.455 4.687 -2.333 6.65 -6.906 7.166l-.29 .03l-.553 .046l-.727 .041l-.15 .006l-.617 .017l-.642 .005l-.642 -.005l-.616 -.017l-.299 -.013l-.579 -.034l-.553 -.046c-4.687 -.455 -6.65 -2.333 -7.166 -6.906l-.03 -.29l-.046 -.553l-.041 -.727l-.006 -.15l-.017 -.617l-.004 -.318v-.648l.004 -.318l.017 -.616l.013 -.299l.034 -.579l.046 -.553c.455 -4.687 2.333 -6.65 6.906 -7.166l.29 -.03l.553 -.046l.727 -.041l.15 -.006l.617 -.017c.21 -.003 .424 -.005 .642 -.005zm2 5h-4a1 1 0 0 0 -.993 .883l-.007 .117v4a1 1 0 0 0 .883 .993l.117 .007h3v2h-2l-.007 -.117a1 1 0 0 0 -1.993 .117a2 2 0 0 0 1.85 1.995l.15 .005h2a2 2 0 0 0 1.995 -1.85l.005 -.15v-2a2 2 0 0 0 -1.85 -1.995l-.15 -.005h-2v-2h3a1 1 0 0 0 .993 -.883l.007 -.117a1 1 0 0 0 -.883 -.993l-.117 -.007z" stroke-width="0" fill="#7c7f8b"></path>
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
        case "device-desktop-code":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
                <path d="M12.5 16h-8.5a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v8"></path>
                <path d="M7 20h4"></path>
                <path d="M9 16v4"></path>
                <path d="M20 21l2 -2l-2 -2"></path>
                <path d="M17 17l-2 2l2 2"></path>
            </svg>`;
        case "info-square-rounded":
            return `<svg viewBox="0 0 24 24" ${id} ${classNames}>
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <path d="M12 9h.01" /><path d="M11 12h1v4h1" />
                <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9 -9 9s-9 -1.8 -9 -9s1.8 -9 9 -9z" />
            </svg>`;

        case "huggingface":
            return `<img
                src="${chrome.runtime.getURL(
                    state.prefs.checkDarkMode
                        ? "src/shared/hf-logo-transparent-darktheme.svg"
                        : "src/shared/hf-logo-transparent-lighttheme.svg",
                )}"
                ${id}
                ${classNames}
            >`;
        case "alphaxiv":
            return `
            <svg viewBox="0 0 718.41 504.47" ${id} ${classNames}>
                <polygon points="591.15 258.54 718.41 385.73 663.72 440.28 536.57 313.62 591.15 258.54"></polygon>
                <path d="M273.86.3c34.56-2.41,67.66,9.73,92.51,33.54l94.64,94.63-55.11,54.55-96.76-96.55c-16.02-12.7-37.67-12.1-53.19,1.11L54.62,288.82,0,234.23,204.76,29.57C223.12,13.31,249.27,2.02,273.86.3Z"></path>
                <path d="M663.79,1.29l54.62,54.58-418.11,417.9c-114.43,95.94-263.57-53.49-167.05-167.52l160.46-160.33,54.62,54.58-157.88,157.77c-33.17,40.32,18.93,91.41,58.66,57.48L663.79,1.29Z"></path>
            </svg>`;

        default:
            return "";
    }
};

/**
 * Turns an Error object into an informative string
 * @param {object} e Error to stringify
 * @returns {string}
 */
export const stringifyError = (e) => {
    const extId = chrome.runtime.id;
    return e.stack
        .split("\n")
        .map((line) =>
            escapeHtml(
                line
                    .split(" ")
                    .map((word) => word.split(extId).last())
                    .join(" "),
            ),
        )
        .join("<br/>");
};

/**
 * Are `a` and `b` identical arrays?
 * @param {array} a
 * @param {array} b
 * @returns {boolean}
 */
export const arraysIdentical = (a, b) => {
    var i = a.length;
    if (i != b.length) return false;
    while (i--) {
        if (a[i] !== b[i]) return false;
    }
    return true;
};

/**
 * Parses an element's `selectedOptions` into a sorted array of tags
 * @param {HTMLElement} el the dom element to read tags from (`el.selectedOptions`)
 * @returns
 */
export const parseTags = (el) => {
    let tags = Array.from(el.selectedOptions, (e) => e.value.trim()).filter((e) => e);
    tags.sort();
    return tags;
};

/**
 * Gets the current state of the 4 user inputs for a given paper and returns it as an object:
 * {note, codeLink, tags, favorite}
 * @param {string} id The paper to find the form values for, either in the popup or the memory
 * @param {boolean} isPopup Whether the paper to monitor is in the popup or the memory
 * @returns {object} {note, codeLink, tags, favorite}
 */
export const getPaperEdits = (id, isPopup) => {
    let note, tags, codeLink, favorite;

    if (isPopup) {
        note = val(`popup-form-note-textarea--${id}`);
        codeLink = val(
            document
                .getElementById(`popup-form-note--${id}`)
                .querySelector(".form-code-input"),
        );
        tags = parseTags(findEl({ element: `popup-item-tags--${id}` }));
        favorite = findEl({ element: `checkFavorite--${id}` }).checked;
    } else {
        note = val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }));
        codeLink = val(findEl({ paperId: id, memoryItemClass: "form-code-input" }));
        tags = parseTags(findEl({ paperId: id, memoryItemClass: "memory-item-tags" }));
        favorite = hasClass(`memory-container--${id}`, "favorite");
    }

    return { note, tags, codeLink, favorite };
};

/**
 * Replaces authors with `...` such that:
 * 1/ the resulting string is <= maxLen
 * 2/ the last author is still there
 *
 * eg:
 * "Oliver E. J. Wing and William Lehman and Paul D. Bates and Christopher C. Sampson
 *   and Niall Quinn and Andrew M. Smith and Jeffrey C. Neal
 *   and Jeremy R. Porter and Carolyn Kousky"
 * -> "Oliver E. J. Wing, William Lehman, Paul D. Bates, Christopher C. Sampson,
 *   Niall Quinn, Andrew M. Smith, Jeffrey C. Neal ... Carolyn Kousky"
 *
 * @param {string} text The string of authors to split on " and "
 * @param {number} maxLen The maximum length of the resulting string (defaults to 140)
 * @param {string} separator The separator to use between authors (defaults to ", ")
 * @returns {string} The author string with "..." if it was too long, keeping the last author
 */
export const cutAuthors = (text, maxLen, separator) => {
    if (typeof maxLen === "undefined") {
        maxLen = 140;
    }
    if (typeof separator === "undefined") {
        separator = ", ";
    }
    let cutAuthors = "";
    const authArray = text.split(" and ");
    const lastAuthor = authArray[authArray.length - 1];
    for (let [c, candidate] of authArray.entries()) {
        if (
            5 +
                cutAuthors.length +
                separator.length +
                candidate.length +
                lastAuthor.length <
                maxLen ||
            c == authArray.length - 1
        ) {
            if (candidate.includes(",")) {
                candidate = candidate
                    .split(",")
                    .map((c) => c.trim())
                    .reverse()
                    .join(" ");
            }
            if (cutAuthors) {
                cutAuthors += ", " + candidate;
            } else {
                cutAuthors = candidate;
            }
        } else {
            cutAuthors +=
                " <span class='expand-paper-authors'>...</span> " + lastAuthor;
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
export const sendMessageToBackground = (payload) =>
    new Promise((resolve) => {
        chrome.runtime.sendMessage(payload, (response) => {
            resolve(response);
        });
    });

/**
 * Returns the list of files stored by the extension in the user's
 * PaperMemoryStore/ folder
 * @returns {Promise} Promise that resolves the list of stored files
 */
export const getStoredFiles = () =>
    new Promise((resolve) => {
        chrome.downloads.search(
            {
                filenameRegex: "(PaperMemoryStore/)?.*.pdf",
            },
            (files) =>
                resolve(
                    files.filter(
                        (f) =>
                            f.exists &&
                            f.state === "complete" &&
                            !f.filename.toLowerCase().includes("readme.txt"),
                    ),
                ),
        );
    });

/**
 * Splits url on # and ?
 * @param {string} url The url to check
 */
export const noParamUrl = (url) => {
    return url.split("?")[0].split("#")[0];
};

/**
 * get a hash of a website's url, ignoring the protocol, www, and trailing #
 * @param {string} url
 * @returns {string} hash of the url
 */
export const urlToWebsiteId = (url) => {
    const last = url.split("/").last();
    if (last.includes("#")) {
        const n = url.split("#").length - 1;
        url = url.split("#").slice(0, n).join("#");
    }
    return miniHash(
        url.replace("https://", "").replace("http://", "").replace("www.", ""),
    );
};

/**
 * Wraps a promise in a timeout to resolve it after a given time
 * @param {Promise} prom The promise to wrap
 * @param {number} time The time after which to resolve the promise
 * @returns {Promise} The wrapped promise
 */
export const silentPromiseTimeout = (prom, time = 2000) => {
    // https://advancedweb.hu/how-to-add-timeout-to-a-promise-in-javascript/
    let timer;
    return Promise.race([
        prom,
        new Promise((res, rej) => (timer = setTimeout(res, time))),
    ]).finally(() => clearTimeout(timer));
};

/**
 * Checks whether a warning should be shown to the user
 * @param {string} warningName Name of the warning to check
 * @param {function} callback Function to call if the warning should be shown
 * @returns {Promise} Promise that resolves the callback
 */
export const shouldWarn = async (warningName, callback = () => {}) => {
    return callback(false);
};

/**
 * Converts a camelCase string to same case with spaces
 * eg: "camelCase" -> "camel Case"
 * @param {string} str
 * @returns {string} camelCase string with spaces
 */
export const spaceCamelCase = (str) =>
    str.replace(/([A-Z](?=[a-z]+)|[A-Z]+(?![a-z]))/g, " $1").trim();

/**
 * Replaces multiple spaces with a single space
 * @param {string} str
 * @returns {string} string with single spaces
 */
export const toSingleSpace = (str) => str.replace(/\s\s+/g, " ");

/**
 * Dedents a string by removing leading spaces
 * @param {string} str
 * @returns {string} dedented string
 */
export const dedent = (str) => {
    return ("" + str).replace(/(\n)\s+/g, "$1");
};

/**
 * Returns the ArXiv ID from a paper ID
 * eg: "Arxiv-2306.11715" -> "2306.11715"
 * @param {string} paperId
 * @returns {string} ArXiv ID
 */
export const arxivIdFromPaperID = (paperId) =>
    paperId.split("-").last().replace("_", "/");

/**
 * Delete non-alphanumerical characters except spaces
 * @param {string} str - The string to clean
 * @returns {string} The cleaned string
 */
export const cleanStr = (str) => str.replace(/[^a-zA-Z0-9 ]/g, "");

/**
 * Returns the ArXiv ID for a URL from: arxiv.org, alphaxiv.org, ar5iv.labs.arxiv.org, huggingface.co/papers/
 * @param {string} url The URL to parse
 * @returns {string} ArXiv ID
 */
export const arxivIdFromURL = (url) =>
    url.includes("scirate.com/arxiv/")
        ? url.split("scirate.com/arxiv/")[1].match(/\d+\.\d+/)[0]
        : url.match(/alphaxiv\.org\/(abs|pdf)\//)
          ? url.split("alphaxiv.org/")[1].match(/\d+\.\d+/)[0]
          : url.includes("ar5iv.labs.arxiv.org/html/")
            ? url.split("ar5iv.labs.arxiv.org/html/")[1].match(/\d+\.\d+/)[0]
            : url.includes("huggingface.co/papers/")
              ? url.split("huggingface.co/papers/")[1].match(/\d+\.\d+/)[0]
              : noParamUrl(url)
                    .replace("/abs/", "/pdf/")
                    .split("/pdf/")[1]
                    .replace(".pdf", "")
                    .split("v")[0]
                    .replace("/", "_");

export const getBrowserName = async () => {
    let browserName = navigator.appName;
    const nAgt = navigator.userAgent;
    let verOffset;

    // In Opera, the true version is after "OPR" or after "Version"
    if ((verOffset = nAgt.indexOf("OPR")) != -1) {
        browserName = "Opera";
    } else if ((navigator.brave && (await navigator.brave.isBrave())) || false) {
        browserName = "Brave";
    }
    // In MS Edge, the true version is after "Edg" in userAgent
    else if ((verOffset = nAgt.indexOf("Edg")) != -1) {
        browserName = "Microsoft Edge";
    }
    // In MSIE, the true version is after "MSIE" in userAgent
    else if ((verOffset = nAgt.indexOf("MSIE")) != -1) {
        browserName = "Microsoft Internet Explorer";
    }
    // In Chrome, the true version is after "Chrome"
    else if ((verOffset = nAgt.indexOf("Chrome")) != -1) {
        browserName = "Chrome";
    }
    // In Safari, the true version is after "Safari" or after "Version"
    else if ((verOffset = nAgt.indexOf("Safari")) != -1) {
        browserName = "Safari";
    }
    // In Firefox, the true version is after "Firefox"
    else if ((verOffset = nAgt.indexOf("Firefox")) != -1) {
        browserName = "Firefox";
    }

    return browserName;
};

export const getRandomToken = () => {
    // https://stackoverflow.com/questions/23822170/getting-unique-clientid-from-chrome-extension
    // E.g. 8 * 32 = 256 bits token
    var randomPool = new Uint8Array(32);
    crypto.getRandomValues(randomPool);
    var hex = "";
    for (var i = 0; i < randomPool.length; ++i) {
        hex += randomPool[i].toString(16);
    }
    // E.g. db18458e2782b2b77e36769c569e263a53885a9944dd0a861e5064eac16f1a
    return hex;
};

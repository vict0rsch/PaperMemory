(function () {
    'use strict';

    /**
     * Prototypes
     */

    if (!Array.prototype.last) {
        Object.defineProperty(Array.prototype, "last", {
            value: function (i = 0) {
                return this.reverse()[i];
            },
            configurable: true,
        });
    }

    if (!String.prototype.capitalize) {
        Object.defineProperty(String.prototype, "capitalize", {
            value: function (all = false) {
                if (all)
                    return this.split(" ")
                        .map((s) => s.capitalize())
                        .join(" ");
                return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
            },
            configurable: true,
        });
    }

    /**
     * Global variable & constants are stored in this file to be used by
     * other files such as functions.js, parsers.js, memory.js, popup.js
     */

    /**
     * Set uninstall URL
     */
    if (typeof chrome !== "undefined" && chrome?.runtime?.setUninstallURL) {
        chrome.runtime.setUninstallURL("https://forms.gle/1GjtXGhZjs8Q817y5");
    }

    /**
     * The popup's global state to store data across functions
     */
    const state = {
        currentMemoryPagination: 0,
        dataVersion: 0,
        deleted: {}, // (id => bool)
        files: {},
        ignoreSources: {}, // (source => bool)
        lastRefresh: new Date(),
        memoryIsOpen: false,
        memoryItemsPerPage: 10,
        menuIsOpen: false,
        modalIsOpen: false,
        tooltipIsOpen: false,
        papers: {}, // (id => object)
        papersList: [], // [papers]
        papersReady: false,
        paperTags: new Set(), // (Set(string))
        pdfTitleFn: null, // function(paper) => string
        prefs: {}, // (prefsCheckKey => bool)
        showFavorites: false,
        sortedPapers: [], // [papers]
        sortKey: "",
        timerIdMap: new WeakMap(), // memory title tooltips
        titleHashToIds: {}, // (miniHash(title) -> [ids])
        titleFunction: null, // function(paper) => string
        urlHashToId: {}, // (miniHash(url) => id)
    };

    state.titleFunction = (paper) => {
        const title = paper.title.replaceAll("\n", "");
        const id = paper.id;
        let name = `${title} - ${id}`;
        name = name.replaceAll(":", " ").replace(/\s\s+/g, " ");
        return name;
    };

    const descendingSortKeys = [
        "addDate",
        "count",
        "lastOpenDate",
        "favoriteDate",
        "year",
    ];

    const svgActionsHoverTitles = {
        edit: "Edit paper details",
        copyMd: "Copy Markdown-formatted link",
        copyBibtext: "Copy Bibtex citation",
        visits: "Number of times you have opened this paper",
        openLocal: "Open downloaded pdf",
        copyLink: "Copy paper url",
        copyHypeLink: "Copy url as hyperlink",
    };

    /**
     * Shared configuration for the Tags' select2 inputs
     */
    const select2Options = {
        placeholder: "Tag paper",
        maximumSelectionLength: 5,
        allowClear: true,
        tags: true,
        tokenSeparators: [",", " "],
    };

    /**
     * The array of keys in the menu, i.e. options the user can dis/enable in the menu
     */
    const prefsCheckNames = [
        "checkBib",
        "checkMd",
        "checkDownload",
        "checkPdfTitle",
        "checkFeedback",
        "checkDarkMode",
        "checkDirectOpen",
        "checkStore",
        "checkScirate",
        "checkAlphaxiv",
        "checkAr5iv",
        "checkHuggingface",
        "checkOfficialRepos",
        "checkPdfOnly",
        "checkNoAuto",
        "checkMdYearVenue",
        "checkEnterLocalPdf",
        "checkWebsiteParsing",
        "checkPreferPdf",
    ];
    /**
     * Menu check names which should not default to true but to false
     */
    const prefsCheckDefaultFalse = [
        "checkDarkMode",
        "checkStore",
        "checkScirate",
        "checkAlphaxiv",
        "checkAr5iv",
        "checkHuggingface",
        "checkOfficialRepos",
        "checkPdfOnly",
        "checkNoAuto",
        "checkMdYearVenue",
        "checkPreferPdf",
    ];
    /**
     * All keys to retrieve from the menu, the checkboxes + the custom pdf function
     */
    const prefsStorageKeys = [...prefsCheckNames, "pdfTitleFn"];

    /**
     * Extra data per source
     */
    const sourceExtras = {
        springer: {
            types: ["chapter", "article", "book", "referenceworkentry"],
        },
    };

    /**
     * Sources which are preprints (important for de-duplication)
     */
    const preprintSources = ["arxiv", "biorxiv"];

    /**
     * Map of known data sources to the associated paper urls: pdf urls and web-pages urls.
     * IMPORTANT: paper page before pdf (see background script)
     * Notes:
     *  ijcai -> papers < 2015 will not be parsed due to website changes
     *           (open an issue if that's problematic)
     */
    const knownPaperPages = {
        acl: {
            patterns: ["aclanthology.org/"],
            name: "ACL Anthology (Association for Computational Linguistics)",
        },
        acm: {
            patterns: ["dl.acm.org/doi/"],
            name: "ACM (Association for Computing Machinery)",
        },
        aps: {
            patterns: [
                (url) => Boolean(url.match(/journals\.aps\.org\/\w+\/(abstract|pdf)\//g)),
            ],
            name: "APS (American Physical Society)",
        },
        acs: {
            patterns: ["pubs.acs.org/doi/"],
            name: "ACS (American Chemical Society)",
        },
        arxiv: {
            patterns: [
                "arxiv.org/abs/",
                "arxiv.org/pdf/",
                "scirate.com/arxiv/",
                "ar5iv.labs.arxiv.org/html/",
                "alphaxiv.org/abs/",
                "alphaxiv.org/pdf/",
                (url) =>
                    url.includes("huggingface.co/papers/") &&
                    url.split("huggingface.co/papers/")[1].match(/\d+\.\d+/),
            ],
            name: "ArXiv",
        },
        biorxiv: {
            patterns: ["biorxiv.org/content"],
            name: "BioRxiv",
        },
        cell: {
            patterns: [
                (url) =>
                    url.includes("cell.com/") &&
                    url.split("cell.com/")[1].match(/\d{4}-\d{3}[0-9X]/),
            ],
            name: "Cell",
        },
        chemrxiv: {
            patterns: [
                "chemrxiv.org/engage/chemrxiv/article-details/",
                (url) =>
                    url.includes(
                        "https://chemrxiv.org/engage/api-gateway/chemrxiv/assets"
                    ) && url.endsWith(".pdf"),
            ],
            name: "ChemRxiv",
        },
        cvf: {
            patterns: ["openaccess.thecvf.com/content"],
            name: "CVF (Computer Vision Foundation)",
        },
        frontiers: {
            patterns: [
                "frontiersin.org/articles",
                (url) => url.match(/frontiersin\.org\/.+\/articles\//),
            ],
            name: "Frontiers",
        },
        hal: {
            patterns: [
                (url) => /hal\.science\/\w+-\d+(v\d+)?(\/document)?$/gi.test(url),
                (url) => /hal\.science\/\w+-\d+(v\d+)?\/file\/.+\.pdf$/gi.test(url),
            ],
            name: "HAL",
        },
        ihep: {
            patterns: ["inspirehep.net/literature/", "inspirehep.net/files/"],
            name: "IHEP (INSPIRE - High Energy Physics)",
        },
        ijcai: {
            patterns: [(url) => /ijcai\.org\/proceedings\/\d{4}\/\d+/gi.test(url)],
            name: "IJCAI (International Joint Conferences on Artificial Intelligence)",
        },
        ieee: {
            patterns: [
                "ieeexplore.ieee.org/document/",
                "ieeexplore.ieee.org/abstract/document/",
                "ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=",
            ],
            name: "IEEE (Institute of Electrical and Electronics Engineers)",
        },
        iop: {
            patterns: ["iopscience.iop.org/article/"],
            name: "IOP (Institute Of Physics)",
        },
        jmlr: {
            patterns: [(url) => url.includes("jmlr.org/papers/v") && !url.endsWith("/")],
            name: "JMLR (Journal of Machine Learning Research)",
        },
        mdpi: {
            patterns: [(url) => /mdpi\.com\/\d+-.+/gi.test(url)],
            name: "MDPI (Multidisciplinary Digital Publishing Institute)",
        },
        nature: {
            patterns: ["nature.com/articles/"],
            name: "Nature",
        },
        neurips: {
            patterns: [
                "neurips.cc/paper/",
                "neurips.cc/paper_files/paper/",
                "nips.cc/paper/",
                "nips.cc/paper_files/paper/",
            ],
            name: "NeurIPS (Neural Information Processing Systems)",
        },
        openreview: {
            patterns: [
                "openreview.net/forum",
                "openreview.net/pdf",
                "openreview.net/attachment",
            ],
            name: "OpenReview",
        },
        oup: {
            patterns: [
                (url) =>
                    (url
                        .split("https://academic.oup.com/")[1]
                        ?.split("/")[1]
                        ?.indexOf("article") ?? -1) >= 0,
            ],
            name: "OUP (Oxford University Press)",
        },
        plos: {
            patterns: [(url) => /journals\.plos\.org\/.+\/article.+id=/gi.test(url)],
            name: "PLOS (Public Library of Science)",
        },
        pmc: {
            patterns: [
                "ncbi.nlm.nih.gov/pmc/articles/PMC",
                "ncbi.nlm.nih.gov/articles/PMC",
                (url) => url.match(/ncbi.nlm.nih.gov\/\d+/),
            ],
            name: "PMC (PubMed Central)",
        },
        pmlr: {
            patterns: ["proceedings.mlr.press/"],
            name: "PMLR (Proceedings of Machine Learning Research)",
        },
        pnas: {
            patterns: ["pnas.org/content/", "pnas.org/doi/"],
            name: "PNAS (Proceedings of the National Academy of Sciences)",
        },
        rsc: {
            patterns: ["pubs.rsc.org/en/content/article"],
            name: "RSC (Royal Society of Chemistry)",
        },
        science: {
            patterns: [
                (url) => Boolean(url.match(/science\.org\/doi\/?(abs|full|pdf|epdf)?\//g)),
            ],
            name: "Science",
        },
        sciencedirect: {
            patterns: [
                "sciencedirect.com/science/article/pii/",
                "sciencedirect.com/science/article/abs/pii/",
                "reader.elsevier.com/reader/sd/pii/",
            ],
            name: "ScienceDirect",
        },
        springer: {
            patterns: [
                ...sourceExtras.springer.types.map((type) => `link.springer.com/${type}/`),
                "link.springer.com/content/pdf/",
            ],
            name: "Springer",
        },
        website: {
            // special case, manual parsing of arbitrary websites
            patterns: [],
            name: "Manually parsed website",
        },
        wiley: {
            patterns: [
                (url) =>
                    Boolean(
                        url.match(
                            /onlinelibrary\.wiley\.com\/doi\/(abs\/|full\/|pdf\/|epdf\/|10\.)/g
                        )
                    ),
            ],
            name: "Wiley",
        },
        aip: {
            patterns: [
                (url) =>
                    Boolean(
                        url.match(
                            /pubs.aip.org\/aip\/.+\/(article|article-abstract|article-split)\//g
                        ) || url.match(/watermark.silverchair.com\/.+\.pdf/g)
                    ),
            ],
            name: "AIP (American Institute of Physics)",
        },
    };

    const overrideORConfs = {
        "robot-learning": "CoRL",
        ijcai: "IJCAI",
    };
    const overridePMLRConfs = {
        "Conference on Learning Theory": "CoLT",
        "International Conference on Machine Learning": "ICML",
        "Conference on Uncertainty in Artificial Intelligence": "UAI",
        "Conference on Robot Learning": "CoRL",
        "International Conference on Artificial Intelligence and Statistics": "AISTATS",
        "International Conference on Algorithmic Learning Theory": "ALT",
    };

    const consolHeaderStyle =
        "@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300');font-family:'Fira Code' monospace;font-size:1rem;font-weight:300;display:inline-block;border:2px solid #A41716;border-radius: 4px;padding: 12px; margin: 12px;";

    const storeReadme = `
/!\\ Warning: This folder has been created automatically by your PaperMemory browser extension.\n
/!\\ It has to stay in your downloads for PaperMemory to be able to access your papers.\n
/!\\ To be able to open files from this folder instead of re-downloading them, PaperMemory will match their titles and downloaded urls.\n
/!\\ If you change the default title function in the Advanced Options and do not include a paper's title in the file name, PaperMemory may not be able to open the file and will instead open the pdf url.\n
/!\\ Unfortunately, PaperMemory cannot detect papers that have not been *downloaded there* so putting papers in this folder will not make them discoverable by the \`browser.downloads\` API PaperMemory uses.
`;
    /**
     * English words to ignore when creating an arxiv paper's BibTex key.
     */
    const englishStopWords = new Set([
        "i",
        "me",
        "my",
        "myself",
        "we",
        "our",
        "ours",
        "ourselves",
        "you",
        "your",
        "yours",
        "yourself",
        "yourselves",
        "he",
        "him",
        "his",
        "himself",
        "she",
        "her",
        "hers",
        "herself",
        "it",
        "its",
        "itself",
        "they",
        "them",
        "their",
        "theirs",
        "themselves",
        "what",
        "which",
        "who",
        "whom",
        "this",
        "that",
        "these",
        "those",
        "am",
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "have",
        "has",
        "had",
        "having",
        "do",
        "does",
        "did",
        "doing",
        "a",
        "an",
        "the",
        "and",
        "but",
        "if",
        "or",
        "because",
        "as",
        "until",
        "while",
        "of",
        "at",
        "by",
        "for",
        "with",
        "about",
        "against",
        "between",
        "into",
        "through",
        "during",
        "before",
        "after",
        "above",
        "below",
        "to",
        "from",
        "up",
        "down",
        "in",
        "out",
        "on",
        "off",
        "over",
        "under",
        "again",
        "further",
        "then",
        "once",
        "here",
        "there",
        "when",
        "where",
        "why",
        "how",
        "all",
        "any",
        "both",
        "each",
        "few",
        "more",
        "most",
        "other",
        "some",
        "such",
        "no",
        "nor",
        "not",
        "only",
        "own",
        "same",
        "so",
        "than",
        "too",
        "very",
        "s",
        "t",
        "can",
        "will",
        "just",
        "don",
        "should",
        "now",
    ]);

    const journalAbbreviations = {};

    // use in the log() function util
    // 0 => no trace
    // 1 => trace errors
    // 2 => trace warnings
    // 3 => trace info
    // 4 => trace debug
    // 5 => trace all
    const LOGTRACE = 2;

    // ES Module imports

    /** Function to log to console with a prefix
     * @param {any} args The list of arguments to log
     * @returns {void}
     */
    const log = (...args) => {
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
            ...args
        );
    };

    /** Log an info message in blue
     * @param {any} args The list of arguments to log
     * @returns {void}
     */
    const info = (...args) => log(...["[info]", ...args]);

    /** Log a warning message in yellow
     * @param {any} args The list of arguments to log
     * @returns {void}
     * */
    const warn = (...args) => log(...["[warn]", ...args]);

    /** Log a success message in green
     * @param {any} args The list of arguments to log
     * @returns {void}
     */
    const logOk = (...args) => log(...["[ok]", ...args]);

    /** Log an error message in red
     * @param {any} args The list of arguments to log
     * @returns {void}
     * */
    const logError = (...args) => log(...["[error]", ...args]);

    /** Create a group of logs in the console
     *  @param {string} text The text to display in the group
     */
    const consoleHeader = (text) =>
        console.groupCollapsed(`%c${text}`, consolHeaderStyle);

    /** Gets the string to display from a paper's id, typically
     * splitting on _ and taking the first part
     * @param {string} id The id of the paper
     * @returns {string} The string to display
     */
    const getDisplayId = (id) => {
        const baseId = id;
        id = id.split("_")[0].split(".")[0];
        if (!id.startsWith("OR-")) {
            id = id.split("-").slice(0, 2).join("-");
        }
        if (state.papers.hasOwnProperty(baseId)) {
            const paper = state.papers[baseId];
            if (paper.source === "nature") {
                if (paper.note.match(/^Published\ @.+\(\d+\)$/)) {
                    const journal = paper.note.split("@")[1].split("(")[0].trim();
                    id += `-${journal
                    .split(" ")
                    .map((j) => j[0].toUpperCase())
                    .join("")}`;
                }
                if (!id.includes(paper.year + "")) {
                    id += `-${paper.year}`;
                }
            }
            if (paper.source === "acs") {
                if (!id.includes(paper.year + "")) {
                    id += `-${paper.year}`;
                }
            }
            if (paper.source === "iop") {
                if (!id.includes(paper.year + "")) {
                    id += `-${paper.year}`;
                }
            }
        }
        return id;
    };

    /** Whether or not this url leads to a pdf
     * @param {string} url The url to test
     * @returns {boolean} Whether or not the url leads to a pdf
     */
    const isPdfUrl$1 = (url) => {
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
    function delay(fn, ms) {
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
    const cleanPapers = (papers) => {
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
    const firstNonStopLowercase = (title) => {
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
    const miniHash = (str, replace) => {
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
    const fallbackCopyTextToClipboard = (text) => {
        // Only available in DOM context, not in service workers
        if (typeof document === "undefined") {
            warn(
                "fallbackCopyTextToClipboard called in service worker context - not supported"
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
    const copyTextToClipboard = (text) => {
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
            }
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
    const copyHyperLinkToClipboard = (url, title) => {
        const linkHtml = `<a href="${url}">${title}</a>`;
        pasteRich(linkHtml, `${title} ${url}`);
    };

    /**
     * Parse a url and return an object with the url's components
     * @param {string} url The url to parse
     * @returns {HTMLAnchorElement} The parsed url
     */
    const parseUrl = (url) => {
        var a = document.createElement("a");
        a.href = url;
        return a;
    };

    /**
     * Get the id of a paper from a click event inside a .memory-container for
     * a memory item.
     * @param {Event} e The click event
     * @returns {string} The id of the paper
     */
    const eventId = (e) => {
        return e.target.closest(".memory-container")?.id?.split("--")[1];
    };

    /**
     * Computes a hash code from a string
     * @param {string} s The string to hash
     * @returns {number} The hash code
     * */
    const hashCode = (s) => {
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
    const cleanBiorxivURL = (url) => {
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
    const textareaFocusEnd = (element) => {
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
                        : "src/shared/hf-logo-transparent-lighttheme.svg"
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
     * Are `a` and `b` identical arrays?
     * @param {array} a
     * @param {array} b
     * @returns {boolean}
     */
    const arraysIdentical = (a, b) => {
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
    const parseTags = (el) => {
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
    const getPaperEdits = (id, isPopup) => {
        let note, tags, codeLink, favorite;

        if (isPopup) {
            note = val(`popup-form-note-textarea--${id}`);
            codeLink = val(
                document
                    .getElementById(`popup-form-note--${id}`)
                    .querySelector(".form-code-input")
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
    const sendMessageToBackground = (payload) =>
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
    const getStoredFiles = () =>
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
                                !f.filename.toLowerCase().includes("readme.txt")
                        )
                    )
            );
        });

    /**
     * Splits url on # and ?
     * @param {string} url The url to check
     */
    const noParamUrl = (url) => {
        return url.split("?")[0].split("#")[0];
    };

    /**
     * get a hash of a website's url, ignoring the protocol, www, and trailing #
     * @param {string} url
     * @returns {string} hash of the url
     */
    const urlToWebsiteId = (url) => {
        const last = url.split("/").last();
        if (last.includes("#")) {
            const n = url.split("#").length - 1;
            url = url.split("#").slice(0, n).join("#");
        }
        return miniHash(
            url.replace("https://", "").replace("http://", "").replace("www.", "")
        );
    };

    /**
     * Wraps a promise in a timeout to resolve it after a given time
     * @param {Promise} prom The promise to wrap
     * @param {number} time The time after which to resolve the promise
     * @returns {Promise} The wrapped promise
     */
    const silentPromiseTimeout = (prom, time = 2000) => {
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
    const shouldWarn = async (warningName, callback = () => {}) => {
        return callback(false);
    };

    /**
     * Converts a camelCase string to same case with spaces
     * eg: "camelCase" -> "camel Case"
     * @param {string} str
     * @returns {string} camelCase string with spaces
     */
    const spaceCamelCase = (str) =>
        str.replace(/([A-Z](?=[a-z]+)|[A-Z]+(?![a-z]))/g, " $1").trim();

    /**
     * Replaces multiple spaces with a single space
     * @param {string} str
     * @returns {string} string with single spaces
     */
    const toSingleSpace = (str) => str.replace(/\s\s+/g, " ");

    /**
     * Dedents a string by removing leading spaces
     * @param {string} str
     * @returns {string} dedented string
     */
    const dedent = (str) => {
        return ("" + str).replace(/(\n)\s+/g, "$1");
    };

    /**
     * Returns the ArXiv ID from a paper ID
     * eg: "Arxiv-2306.11715" -> "2306.11715"
     * @param {string} paperId
     * @returns {string} ArXiv ID
     */
    const arxivIdFromPaperID = (paperId) =>
        paperId.split("-").last().replace("_", "/");

    /**
     * Delete non-alphanumerical characters except spaces
     * @param {string} str - The string to clean
     * @returns {string} The cleaned string
     */
    const cleanStr = (str) => str.replace(/[^a-zA-Z0-9 ]/g, "");

    /**
     * Returns the ArXiv ID for a URL from: arxiv.org, alphaxiv.org, ar5iv.labs.arxiv.org, huggingface.co/papers/
     * @param {string} url The URL to parse
     * @returns {string} ArXiv ID
     */
    const arxivIdFromURL = (url) =>
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

    /**
     * Find an element by element id (may be the element itself,
     * in which case it its returned directly), or by finding the element
     * with the class `memoryItemClass` inside the Memory container with
     * id `memory-container--{paperId}`
     * @param {object} options
     * @param {string} options.element The id of the element to find or the element itself
     * @param {string} options.paperId The id of the paper in the memory to find the element within
     * @param {string} options.memoryItemClass The class of the element to find within the
     *   container with id memory-container--{paperId}. The leading dot is optional.
     * @returns {HTMLElement}
     */
    const findEl = ({ element, paperId, memoryItemClass }) => {
        if (element)
            return typeof element === "string" ? document.getElementById(element) : element;
        if (typeof memoryItemClass === "undefined") {
            warn(`findEl: memoryItemClass is undefined ; element was: ${element}`);
            return null;
        }
        if (!memoryItemClass.startsWith(".")) memoryItemClass = "." + memoryItemClass;
        const itemContainer = findEl({ element: `memory-container--${paperId}` });
        if (!itemContainer) {
            warn(`findEl: memory-container--${paperId} not found`);
            return null;
        }
        return itemContainer.querySelector(memoryItemClass);
    };

    /**
     * Fade out an element
     * @param {HTMLElement} el
     * @param {number} duration
     * @param {function} callback
     * @returns {void}
     */
    const fadeOut = (el, duration = 250, callback = () => {}) => {
        el = findEl({ element: el });
        el.style.transition = `${duration}ms`;
        el.style.opacity = 0;
        setTimeout(() => {
            el.style.display = "none";
            callback();
        }, duration);
    };

    /**
     * Fade in an element
     * @param {HTMLElement} el
     * @param {string} display
     * @param {number} duration
     * @param {function} callback
     * @returns {void}
     */
    const fadeIn = (el, display = "block", duration = 250, callback = () => {}) => {
        el = findEl({ element: el });
        el.style.opacity = 0;
        if (el.style.display === "none") {
            el.style.display = display;
        }
        setTimeout(() => {
            // 0 timeout: https://stackoverflow.com/a/34764787/3867406
            el.style.transition = `${duration}ms`;
            el.style.opacity = 1;
            setTimeout(() => {
                callback();
            }, duration);
        }, 0);
    };

    /**
     * Get or set value of an element
     * @param {string | HTMLElement} el
     * @param {string} value
     * @returns {string}
     */
    const val = (el, value) => {
        el = findEl({ element: el });
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
            if (typeof value === "undefined") {
                return el.checked;
            }
            el.checked = value;
        }
        if (typeof value === "undefined") {
            return el ? el.value : "";
        }
        if (el) el.value = value;
    };

    /** Show an element (or find it with findEl if el is a string)
     *  by setting its display property to the given value (default: "block")
     * @param {string | HTMLElement} el
     * @param {string} display
     * @returns {void}
     * */
    const showId = (el, display = "block") => {
        el = findEl({ element: el });
        if (el) el.style.display = display;
    };

    /** Hide an element (or find it with findEl if el is a string)
     * by setting its display property to "none"
     * @param {string | HTMLElement} el
     * @returns {void}
     * */
    const hideId = (el) => {
        el = findEl({ element: el });
        if (el) el.style.display = "none";
    };

    /** Set innerText of an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string} text
     * @returns {void}
     * */
    const setTextId = (el, text) => {
        el = findEl({ element: el });
        if (el) el.innerText = text;
    };

    /** Set innerHTML of an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string} html
     * @returns {void}
     * */
    const setHTML = (el, html) => {
        el = findEl({ element: el });
        if (el) el.innerHTML = html;
    };

    /** Dispatch an event on an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string | Event} event
     * @returns {void}
     * */
    const dispatch = (el, event) => {
        el = findEl({ element: el });
        if (typeof event === "string") {
            if (event === "focus") {
                el.focus();
                return;
            } else if (event === "blur") {
                el.blur();
                return;
            }
            event = new Event(event);
        }
        el && el.dispatchEvent(event);
    };

    /** Check if an element (or find it with findEl if el is a string)
     * has a given class
     * @param {string | HTMLElement} elOrId
     * @param {string} className
     * @returns {boolean}
     * */
    const hasClass = (el, className) => {
        el = findEl({ element: el });
        return el ? el.classList.contains(className) : false;
    };

    /** Add a class to an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} elOrId
     * @param {string} className
     * @returns {void}
     * */
    const addClass = (el, className) => {
        el = findEl({ element: el });
        el && el.classList.add(className);
    };

    /** Remove a class from an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} elOrId
     * @param {string} className
     * @returns {void}
     * */
    const removeClass = (el, className) => {
        el = findEl({ element: el });
        el && el.classList.remove(className);
    };

    /** Add an event listener to an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string} event
     * @param {function} listener
     * @returns {void}
     * */
    const addListener = (el, event, listener) => {
        el = findEl({ element: el });
        el && el.addEventListener(event, listener);
    };

    /** Set placeholder of an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string} text
     * @returns {void}
     * */
    const setPlaceholder = (el, text) => {
        el = findEl({ element: el });
        if (el && typeof el.placeholder !== "undefined") el.placeholder = text;
    };

    /** Get or set style of an element (or find it with findEl if el is a string)
     * @param {string | HTMLElement} el
     * @param {string} key
     * @param {string} value
     * @returns {string}
     * */
    const style = (el, key, value) => {
        el = findEl({ element: el });
        if (el) {
            if (typeof value === "undefined") {
                return el.style[key];
            }
            el.style[key] = value;
        }
    };

    /** Slide up an element (or find it with findEl if el is a string)
     *  https://w3bits.com/labs/javascript-slidetoggle/
     * @param {string | HTMLElement} el
     * @param {number} duration
     * @param {function} complete
     * @returns {void}
     * */
    const slideUp = (el, duration = 250, complete = () => {}) => {
        el = findEl({ element: el });
        if (!el) return;

        // Only available in DOM context
        if (typeof window === "undefined") {
            console.warn("slideUp called in service worker context - not supported");
            return;
        }

        el.style.transitionProperty = "height, margin, padding";
        el.style.transitionDuration = duration + "ms";
        // el.style.boxSizing = "border-box";
        el.style.height = el.offsetHeight + "px";
        el.offsetHeight;
        el.style.overflow = "hidden";
        el.style.height = 0;
        el.style.paddingTop = 0;
        el.style.paddingBottom = 0;
        el.style.marginTop = 0;
        el.style.marginBottom = 0;
        window.setTimeout(() => {
            el.style.display = "none";
            el.style.removeProperty("height");
            el.style.removeProperty("padding-top");
            el.style.removeProperty("padding-bottom");
            el.style.removeProperty("margin-top");
            el.style.removeProperty("margin-bottom");
            el.style.removeProperty("overflow");
            el.style.removeProperty("transition-duration");
            el.style.removeProperty("transition-property");
            el.style.removeProperty("box-sizing");
            complete();
            //alert("!");
        }, duration);
    };

    /** Slide down an element (or find it with findEl if el is a string)
     *  https://w3bits.com/labs/javascript-slidetoggle/
     * @param {string | HTMLElement} el
     * @param {number} duration
     * @param {function} complete
     * @returns {void}
     * */
    const slideDown = (el, duration = 500, complete = () => {}) => {
        el = findEl({ element: el });
        if (!el) return;

        // Only available in DOM context
        if (typeof window === "undefined") {
            console.warn("slideDown called in service worker context - not supported");
            return;
        }

        el.style.removeProperty("display");
        let display = window.getComputedStyle(el).display;

        if (display === "none") display = "block";

        el.style.display = display;
        let height = el.offsetHeight;
        el.style.overflow = "hidden";
        el.style.height = 0;
        el.style.paddingTop = 0;
        el.style.paddingBottom = 0;
        el.style.marginTop = 0;
        el.style.marginBottom = 0;
        el.offsetHeight;
        // el.style.boxSizing = "border-box";
        el.style.transitionProperty = "height, margin, padding";
        el.style.transitionDuration = duration + "ms";
        el.style.height = height + "px";
        el.style.removeProperty("padding-top");
        el.style.removeProperty("padding-bottom");
        el.style.removeProperty("margin-top");
        el.style.removeProperty("margin-bottom");
        window.setTimeout(() => {
            el.style.removeProperty("height");
            el.style.removeProperty("overflow");
            el.style.removeProperty("transition-duration");
            el.style.removeProperty("transition-property");
            complete();
        }, duration);
    };

    /**
     * Get all elements matching selector within dom or document if dom is not provided
     * in form of an array
     * @param {string} selector
     * @param {HTMLElement} dom
     * @returns {HTMLElement[]}
     */
    const queryAll = (selector, dom) =>
        dom
            ? [...dom.querySelectorAll(selector)]
            : [...document.querySelectorAll(selector)];

    /**
     * Get first element matching selector within dom or document if dom is not provided
     * @param {string} selector
     * @param {HTMLElement} dom
     * @returns {HTMLElement}
     */
    const querySelector = (selector, dom) =>
        document.querySelector(selector);

    /** Add an event listener to all elements with a given class
     * @param {string} className
     * @param {string} eventName
     * @param {function} fn
     * @returns {void}
     * */
    const addEventToClass = (className, eventName, fn) => {
        if (!className.startsWith(".")) className = "." + className;
        queryAll(className).forEach((el) => {
            el.addEventListener(eventName, fn);
        });
    };

    // https://github.com/ORCID/bibtexParseJs/blob/master/bibtexParse.js

    //Original work by Henrik Muehe (c) 2010
    //
    //CommonJS port by Mikola Lysenko 2013
    //
    //Choice of compact (default) or pretty output from toBibtex:
    //		Nick Bailey, 2017.
    //
    //Port to Browser lib by ORCID / RCPETERS

    function BibtexParser() {
        this.months = [
            "jan",
            "feb",
            "mar",
            "apr",
            "may",
            "jun",
            "jul",
            "aug",
            "sep",
            "oct",
            "nov",
            "dec",
        ];
        this.notKey = [",", "{", "}", " ", "="];
        this.pos = 0;
        this.input = "";
        this.entries = new Array();

        this.currentEntry = "";

        this.setInput = function (t) {
            this.input = t;
        };

        this.getEntries = function () {
            return this.entries;
        };

        this.isWhitespace = function (s) {
            return s == " " || s == "\r" || s == "\t" || s == "\n";
        };

        this.match = function (s, canCommentOut) {
            if (canCommentOut == undefined || canCommentOut == null) canCommentOut = true;
            this.skipWhitespace(canCommentOut);
            if (this.input.substring(this.pos, this.pos + s.length) == s) {
                this.pos += s.length;
            } else {
                throw TypeError(
                    "Token mismatch: match" +
                        " -> expected " +
                        s +
                        ", found " +
                        this.input.substring(this.pos)
                );
            }
            this.skipWhitespace(canCommentOut);
        };

        this.tryMatch = function (s, canCommentOut) {
            if (canCommentOut == undefined || canCommentOut == null) canCommentOut = true;
            this.skipWhitespace(canCommentOut);
            if (this.input.substring(this.pos, this.pos + s.length) == s) {
                return true;
            } else {
                return false;
            }
        };

        /* when search for a match all text can be ignored, not just white space */
        this.matchAt = function () {
            while (this.input.length > this.pos && this.input[this.pos] != "@") {
                this.pos++;
            }

            if (this.input[this.pos] == "@") {
                return true;
            }
            return false;
        };

        this.skipWhitespace = function (canCommentOut) {
            while (this.isWhitespace(this.input[this.pos])) {
                this.pos++;
            }
            if (this.input[this.pos] == "%" && canCommentOut == true) {
                while (this.input[this.pos] != "\n") {
                    this.pos++;
                }
                this.skipWhitespace(canCommentOut);
            }
        };

        this.value_braces = function () {
            var bracecount = 0;
            this.match("{", false);
            var start = this.pos;
            var escaped = false;
            while (true) {
                if (!escaped) {
                    if (this.input[this.pos] == "}") {
                        if (bracecount > 0) {
                            bracecount--;
                        } else {
                            var end = this.pos;
                            this.match("}", false);
                            return this.input.substring(start, end);
                        }
                    } else if (this.input[this.pos] == "{") {
                        bracecount++;
                    } else if (this.pos >= this.input.length - 1) {
                        throw TypeError("Unterminated value: value_braces");
                    }
                }
                if (this.input[this.pos] == "\\" && escaped == false) escaped = true;
                else escaped = false;
                this.pos++;
            }
        };

        this.value_comment = function () {
            var str = "";
            var brcktCnt = 0;
            while (!(this.tryMatch("}", false) && brcktCnt == 0)) {
                str = str + this.input[this.pos];
                if (this.input[this.pos] == "{") brcktCnt++;
                if (this.input[this.pos] == "}") brcktCnt--;
                if (this.pos >= this.input.length - 1) {
                    throw TypeError(
                        "Unterminated value: value_comment",
                        +this.input.substring(start)
                    );
                }
                this.pos++;
            }
            return str;
        };

        this.value_quotes = function () {
            this.match('"', false);
            var start = this.pos;
            var escaped = false;
            while (true) {
                if (!escaped) {
                    if (this.input[this.pos] == '"') {
                        var end = this.pos;
                        this.match('"', false);
                        return this.input.substring(start, end);
                    } else if (this.pos >= this.input.length - 1) {
                        throw TypeError(
                            "Unterminated value: value_quotes",
                            this.input.substring(start)
                        );
                    }
                }
                if (this.input[this.pos] == "\\" && escaped == false) escaped = true;
                else escaped = false;
                this.pos++;
            }
        };

        this.single_value = function () {
            var start = this.pos;
            if (this.tryMatch("{")) {
                return this.value_braces();
            } else if (this.tryMatch('"')) {
                return this.value_quotes();
            } else {
                var k = this.key();
                if (k.match("^[0-9]+$")) return k;
                else if (this.months.indexOf(k.toLowerCase()) >= 0) return k.toLowerCase();
                else
                    throw (
                        "Value expected: single_value" +
                        this.input.substring(start) +
                        " for key: " +
                        k
                    );
            }
        };

        this.value = function () {
            var values = [];
            values.push(this.single_value());
            while (this.tryMatch("#")) {
                this.match("#");
                values.push(this.single_value());
            }
            return values.join("");
        };

        this.key = function (optional) {
            var start = this.pos;
            while (true) {
                if (this.pos >= this.input.length) {
                    throw TypeError("Runaway key: key");
                }
                // а-яА-Я is Cyrillic
                //console.log(this.input[this.pos]);
                if (this.notKey.indexOf(this.input[this.pos]) >= 0) {
                    if (optional && this.input[this.pos] != ",") {
                        this.pos = start;
                        return null;
                    }
                    return this.input.substring(start, this.pos);
                } else {
                    this.pos++;
                }
            }
        };

        this.key_equals_value = function () {
            var key = this.key();
            if (this.tryMatch("=")) {
                this.match("=");
                var val = this.value();
                key = key.trim();
                return [key, val];
            } else {
                throw TypeError(
                    "Value expected, equals sign missing: key_equals_value",
                    this.input.substring(this.pos)
                );
            }
        };

        this.key_value_list = function () {
            var kv = this.key_equals_value();
            this.currentEntry["entryTags"] = {};
            this.currentEntry["entryTags"][kv[0]] = kv[1];
            while (this.tryMatch(",")) {
                this.match(",");
                // fixes problems with commas at the end of a list
                if (this.tryMatch("}")) {
                    break;
                }
                kv = this.key_equals_value();
                this.currentEntry["entryTags"][kv[0]] = kv[1];
            }
        };

        this.entry_body = function (d) {
            this.currentEntry = {};
            this.currentEntry["citationKey"] = this.key(true);
            this.currentEntry["entryType"] = d.substring(1);
            if (this.currentEntry["citationKey"] != null) {
                this.match(",");
            }
            this.key_value_list();
            this.entries.push(this.currentEntry);
        };

        this.directive = function () {
            this.match("@");
            return "@" + this.key();
        };

        this.preamble = function () {
            this.currentEntry = {};
            this.currentEntry["entryType"] = "PREAMBLE";
            this.currentEntry["entry"] = this.value_comment();
            this.entries.push(this.currentEntry);
        };

        this.comment = function () {
            this.currentEntry = {};
            this.currentEntry["entryType"] = "COMMENT";
            this.currentEntry["entry"] = this.value_comment();
            this.entries.push(this.currentEntry);
        };

        this.entry = function (d) {
            this.entry_body(d);
        };

        this.alternativeCitationKey = function () {
            this.entries.forEach(function (entry) {
                if (!entry.citationKey && entry.entryTags) {
                    entry.citationKey = "";
                    if (entry.entryTags.author) {
                        entry.citationKey += entry.entryTags.author.split(",")[0] += ", ";
                    }
                    entry.citationKey += entry.entryTags.year;
                }
            });
        };

        this.cleanCitationKey = function () {
            // "hern{\\'a}ndez-garc{\\'\\i}a2021rethinking" -> "hernandez-garcia2021rethinking"
            const start = this.pos;
            const end = start + this.input.slice(start).indexOf(",");

            const left = this.input.slice(0, start);
            const right = this.input.slice(end);

            const citationKey = this.input.slice(start, end);
            const openingParts = citationKey.split("{");
            let newCitationKey = openingParts[0];
            for (var i = 1; i < openingParts.length; i++) {
                const closingParts = openingParts[i].split("}");
                newCitationKey += closingParts[0].replace(/\W/g, "") + closingParts[1];
            }
            newCitationKey = newCitationKey.replace(/\s+/g, "");
            this.input = left + newCitationKey + right;
        };

        this.bibtex = function () {
            while (this.matchAt()) {
                var d = this.directive();
                this.match("{");
                this.cleanCitationKey();
                if (d.toUpperCase() == "@STRING") {
                    this.string();
                } else if (d.toUpperCase() == "@PREAMBLE") {
                    this.preamble();
                } else if (d.toUpperCase() == "@COMMENT") {
                    this.comment();
                } else {
                    this.entry(d);
                }
                this.match("}");
            }

            this.alternativeCitationKey();
        };
    }

    /**
     * Removes surrounding braces of `{some title is wrapped}`
     * but not of `{some} title is {wrapped}`
     * @param {string} str
     * @returns {string} str without surrounding braces
     */
    const safeRemoveSurroundingBraces = (str) => {
        let opened = 0;
        let closed = 0;
        let remove = true;
        for (const c of str.slice(1, -1)) {
            if (c === "{") opened++;
            if (c === "}") closed++;
            if (closed > opened) {
                remove = false;
                break;
            }
        }
        if (remove) {
            return str.slice(1, -1);
        }
        return str;
    };

    const bibtexToObject = (bibtex) => {
        var b = new BibtexParser();
        /*
        Fixing @article{Jain_Chacinska_Rehling_2025, title={Understanding mitochondrial protein import: a revised model of the presequence translocase}, volume={50}, url={http://dx.doi.org/10.1016/j.tibs.2025.03.001}, DOI={10.1016/j.tibs.2025.03.001}, number={7}, journal={Trends in Biochemical Sciences}, publisher={Elsevier BV}, author={Jain, Naintara and Chacinska, Agnieszka and Rehling, Peter}, year={2025}, month={july}, pages={585–595}, language={en}}'
        ↓
        */
        bibtex = bibtex.replaceAll(/,\s?(\w+)=(\w+)(\s?,?)/gi, ", $1={$2}$3");
        // end of fixing
        b.setInput(bibtex);
        b.bibtex();
        const entry = b.getEntries()[0];
        const obj = {
            ...entry.entryTags,
            entryType: entry.entryType,
            citationKey: entry.citationKey,
        };
        for (const [key, value] of Object.entries(obj)) {
            if (value.startsWith("{") && value.endsWith("}")) {
                obj[key] = safeRemoveSurroundingBraces(value);
            }
            // turn uppercase entry keys into lowercase
            if (key === key.toUpperCase()) {
                obj[key.toLowerCase()] = obj[key];
                delete obj[key];
            }
        }
        return obj;
    };

    const bibtexToString = (bibtex) => {
        if (typeof bibtex === "string") {
            bibtex = bibtexToObject(bibtex);
        }
        if (bibtex.hasOwnProperty("entryTags")) {
            bibtex = {
                ...bibtex.entryTags,
                entryType: bibtex.entryType,
                citationKey: bibtex.citationKey,
            };
        }

        bibtex = { ...bibtex };
        let bstr = `@${bibtex.entryType.toLowerCase()}{${bibtex.citationKey},\n`;
        delete bibtex.entryType;
        delete bibtex.citationKey;
        const keyLen = Math.max(...Object.keys(bibtex).map((k) => k.length));
        for (const key in bibtex) {
            if (bibtex.hasOwnProperty(key) && bibtex[key]) {
                let candidate = bibtex[key];
                if (typeof candidate !== "string") {
                    console.warn("Non-string value found for key", key, ":", candidate);
                    candidate = JSON.stringify(candidate);
                }
                let value = candidate.replaceAll(/\s+/g, " ").trim();
                if (value.startsWith("{") && value.endsWith("}")) {
                    value = safeRemoveSurroundingBraces(value);
                }
                if (value.length > 0) {
                    const bkey = key + " ".repeat(keyLen - key.length);
                    bstr += `\t${bkey} = {${value}},\n`;
                }
            }
        }
        return (bstr.slice(0, -2) + "\n}").replaceAll("\t", "  ").replaceAll("--", "-");
    };

    const extractBibtexValue = (bibtex, key) => {
        const b = bibtexToObject(bibtex);
        if (b.hasOwnProperty(key)) return b[key];
        return "";
    };

    /**
     * Find the first paper from a source whose #id matches a certain string.
     * Return its #id.
     * @param {Array<object>} papers List of papers to check
     * @param {String} source the source to filter for
     * @param {String} match the id's uniquely identifiable string to match
     * @returns {String} paper?.id
     */
    const findPaperForProperty = (papers, source, match, prop = "id") =>
        papers.find((p) => p.source === source && p[prop].includes(match))?.id;

    /**
     * Parses a paper's id from a url.
     * Throws error if the url is not a paper source as defined per isPaper(url).
     *
     * @param {string} url The url to use in order to find a matching paper
     * @returns {string} The id of the paper found.
     */
    const parseIdFromUrl$1 = async (url, tab = null) => {
        if (tab) {
            return urlToWebsiteId(url);
        }
        let idForUrl;

        const hashedUrl = miniHash(url);
        const hashedId = state.urlHashToId[hashedUrl];
        if (hashedId) {
            return hashedId;
        }

        const is = await isPaper(url, true);
        const papers = Object.values(cleanPapers(state.papers));

        if (is.arxiv) {
            let arxivId = arxivIdFromURL(url);
            idForUrl = `Arxiv-${arxivId}`;

            const existingIds = Object.values(state.titleHashToIds).find((ids) =>
                ids.includes(idForUrl)
            );
            if (existingIds) {
                idForUrl = existingIds.find((id) => !id.startsWith("Arxiv-")) ?? idForUrl;
            }
        } else if (is.neurips) {
            const year = url.split("/paper/")[1].split("/")[0];
            const hash = url.split("/").last().split("-")[0].slice(0, 8);
            idForUrl = `NeurIPS-${year}_${hash}`;
        } else if (is.cvf) {
            idForUrl = parseCVFUrl(url).id;
        } else if (is.openreview) {
            const OR_id = url.match(/id=\w+/)[0].replace("id=", "");
            idForUrl = findPaperForProperty(papers, "openreview", OR_id);
        } else if (is.biorxiv) {
            url = cleanBiorxivURL(url);
            let id = url.split("/").last();
            if (id.match(/v\d+$/)) {
                id = id.split("v")[0];
            }
            idForUrl = `Biorxiv-${id}`;

            const existingIds = Object.values(state.titleHashToIds).find((ids) =>
                ids.includes(idForUrl)
            );
            if (existingIds) {
                idForUrl = existingIds.find((id) => !id.startsWith("Biorxiv-")) ?? idForUrl;
            }
        } else if (is.pmlr) {
            const key = url.split("/").last().split(".")[0];
            const year = "20" + key.match(/\d+/)[0];
            idForUrl = `PMLR-${year}-${key}`;
        } else if (is.acl) {
            url = url.replace(".pdf", "");
            if (url.endsWith("/")) {
                url = url.slice(0, -1);
            }
            const key = url.split("/").last();
            idForUrl = findPaperForProperty(papers, "acl", key);
        } else if (is.pnas) {
            url = url.replace(".full.pdf", "");
            const pid = url.endsWith("/")
                ? url.split("/").slice(-2)[0]
                : url.split("/").slice(-1)[0];

            idForUrl = findPaperForProperty(papers, "pnas", pid);
        } else if (is.nature) {
            url = url.replace(".pdf", "").split("#")[0];
            const hash = url.split("/").last();
            idForUrl = findPaperForProperty(papers, "nature", hash);
        } else if (is.acs) {
            url = noParamUrl(url)
                .replace("pubs.acs.org/doi/pdf/", "/doi/")
                .replace("pubs.acs.org/doi/abs/", "/doi/");
            const doi = miniHash(url.split("/doi/")[1]);
            idForUrl = `ACS_${doi}`;
        } else if (is.iop) {
            url = noParamUrl(url).replace(/\/pdf$/, "");
            const doi = miniHash(url.split("/article/")[1].split("/meta")[0]);
            idForUrl = `IOPscience_${doi}`;
        } else if (is.jmlr) {
            if (url.endsWith(".pdf")) {
                url = url.split("/").slice(0, -1).join("/");
            }
            url = url.replace(".html", "");
            const jid = url.split("/").last();
            const year = `20${jid.match(/\d+/)[0]}`;
            idForUrl = `JMLR-${year}_${jid}`;
        } else if (is.pmc) {
            const pmcid = url.includes("PMC")
                ? url.match(/PMC\d+/)[0].replace("PMC", "")
                : url.match(/ncbi.nlm.nih.gov\/(\d+)/)[1];
            idForUrl = findPaperForProperty(papers, "pmc", pmcid);
        } else if (is.ijcai) {
            const procId = url.endsWith(".pdf")
                ? url
                      .replace(".pdf", "")
                      .split("/")
                      .last()
                      .match(/[1-9]\d*/)
                : url.split("/").last();
            const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];
            idForUrl = `IJCAI-${year}_${procId}`;
        } else if (is.acm) {
            const doi = url.replace(/\/doi\/?(pdf|abs|full)?\//, "/doi/").split("/doi/")[1];
            idForUrl = findPaperForProperty(papers, "acm", miniHash(doi));
        } else if (is.ieee) {
            const articleId = url.includes("ieee.org/document/")
                ? url.split("ieee.org/document/")[1].match(/\d+/)[0]
                : url.includes("ieee.org/abstract/document/")
                ? url.split("ieee.org/abstract/document/")[1].match(/\d+/)[0]
                : url.split("arnumber=")[1].match(/\d+/)[0];
            idForUrl = findPaperForProperty(papers, "ieee", articleId);
        } else if (is.springer) {
            const types = sourceExtras.springer.types;
            let type = types.filter((c) => url.includes(`/${c}/`))[0];
            if (!type) {
                if (!url.includes("/content/pdf/")) {
                    throw new Error(`Could not find Springer type for ${url}`);
                }
                type = "content/pdf";
            }
            let doi = noParamUrl(url).split(`/${type}/`)[1].replace(".pdf", "");
            idForUrl = findPaperForProperty(papers, "springer", miniHash(doi));
        } else if (is.aps) {
            const [journal, type] = parseUrl(url.split("#")[0])
                .pathname.split("/")
                .slice(1, 3);
            const doi = url.split(`/${journal}/${type}/`).last();
            idForUrl = findPaperForProperty(papers, "aps", miniHash(doi));
        } else if (is.wiley) {
            const doi = url.split("?")[0].split("#")[0].split("/").slice(-2).join("/");
            idForUrl = findPaperForProperty(papers, "wiley", miniHash(doi));
        } else if (is.sciencedirect) {
            const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
            idForUrl = findPaperForProperty(papers, "sciencedirect", miniHash(pii));
        } else if (is.science) {
            let doi = noParamUrl(url).split("/doi/")[1];
            if (!doi.startsWith("10.")) {
                doi = doi.split("/").slice(1).join("/");
            }
            idForUrl = findPaperForProperty(papers, "science", miniHash(doi));
        } else if (is.frontiers) {
            let doi = noParamUrl(url)
                .split("/articles/")[1]
                .split("/")
                .slice(0, -1)
                .join("/");
            idForUrl = findPaperForProperty(papers, "frontiers", miniHash(doi));
        } else if (is.ihep) {
            if (url.includes("/literature/")) {
                const num = noParamUrl(url).match(/\/literature\/(\d+)/)[1];
                idForUrl = findPaperForProperty(papers, "ihep", num);
            } else {
                const hash = noParamUrl(url).split("/files/")[1].split("/")[0];
                idForUrl = findPaperForProperty(papers, "ihep", hash, "pdfLink");
            }
        } else if (is.plos) {
            const doi = url.split("?id=").last().split("&")[0];
            idForUrl = findPaperForProperty(papers, "plos", miniHash(doi));
        } else if (is.rsc) {
            const rscId = noParamUrl(url).replace("/unauth", "").split("/").last();
            idForUrl = findPaperForProperty(papers, "rsc", miniHash(rscId));
        } else if (is.mdpi) {
            const mdpiId = noParamUrl(
                url
                    .split("mdpi.com/")[1]
                    .split("/pdf")[0]
                    .split("/reprints")[0]
                    .split("/notes")[0]
            );
            idForUrl = findPaperForProperty(papers, "mdpi", miniHash(mdpiId));
        } else if (is.oup) {
            url = noParamUrl(url).split("https://academic.oup.com/").last();
            if (isPdfUrl$1(url)) {
                url = url.split("/").slice(0, -1).join("/");
            }
            const num = url.split("/").slice(2).join("");
            idForUrl = findPaperForProperty(papers, "oup", miniHash(num));
        } else if (is.hal) {
            url = noParamUrl(url).replace(
                /(hal\.science\/\w+-\d+)(v\d+)?((\/document|\/file\/.+\.pdf))?/,
                "$1"
            );
            const halId = url.split("/").last();
            idForUrl = findPaperForProperty(papers, "hal", miniHash(halId));
        } else if (is.chemrxiv) {
            let chemRxivId = isPdfUrl$1(url)
                ? url.split("/item/")[1].split("/")[0]
                : noParamUrl(url).split("/").last();
            idForUrl = findPaperForProperty(papers, "chemrxiv", miniHash(chemRxivId));
        } else if (is.cell) {
            ({ url } = await findCellPii(url));
            idForUrl = findPaperForProperty(
                papers,
                "cell",
                miniHash(url.split("cell.com/")[1])
            );
        } else if (is.aip) {
            const { aipId, doi } = parseAIPIdOrDOI(url);
            idForUrl = doi
                ? findPaperForProperty(papers, "aip", doi, "doi")
                : findPaperForProperty(papers, "aip", miniHash(aipId));
        } else if (is.localFile) {
            idForUrl = is.localFile;
        } else if (is.parsedWebsite) {
            idForUrl = is.parsedWebsite.id;
        } else {
            throw new Error(
                "`parseIdFromUrl` failed, unknown paper url. Is: " + JSON.stringify(is)
            );
        }

        return idForUrl;
    };

    const getCurrentUserTab = () =>
        new Promise((resolve) => {
            const query = { active: true, lastFocusedWindow: true };
            chrome.tabs.query(query, async (tabs) => {
                resolve(tabs[0]);
            });
        });

    // ES Module imports
    /**
     * Return a formatted HTML string describing some metadata about a paper
     * added date, last open date, number of visits, venue if available
     * @param {object} paper A paper object
     * @returns {string} HTML string
     */
    const getPaperInfoTable = (paper) => {
        const addDate = new Date(paper.addDate).toLocaleString().replace(",", "");
        const lastOpenDate = new Date(paper.lastOpenDate).toLocaleString().replace(",", "");
        const tableData = [
            ["Added", addDate],
            ["Last open", lastOpenDate],
            ["Visits", paper.count],
            ["Source", knownPaperPages[paper.source].name],
        ];
        if (paper.venue)
            tableData.push([
                "Publication",
                `<strong>${paper.venue} ${paper.year}</strong>`,
            ]);
        return /*html*/ `
        <table class="paper-info-table">
            ${tableData
                .map((row) => {
                    return /*html*/ `
                        <tr>
                            <td><div class="info-table-key">${row[0]}</div></td>
                            <td><div class="info-table-value">${row[1]}</div></td>
                        </tr>
                    `;
                })
                .join("")}
        </table>
    `;
    };

    /**
     * Return a formatted HTML string from a paper
     * @param {object} paper A paper object
     * @returns HTML string
     */
    const getMemoryItemHTML = (paper) => {
        const displayId = getDisplayId(paper.id);
        const note = paper.note || "";
        const id = paper.id;
        const tags = new Set(paper.tags);
        const tagOptions = getTagsOptions(paper);
        const favoriteClass = paper.favorite ? "favorite" : "";
        const titles = { ...svgActionsHoverTitles };
        // titles behave differently in build/watch mode. This works in build
        titles.pdfLink = `Open tab to ${paper.title}`;
        titles.copyLink = `Copy URL to the paper's ${
        state.prefs.checkPreferPdf ? "PDF" : "abstract"
    }`;
        titles.displayId = `Click to see metadata`;
        let codeDiv = /*html*/ `
        <small class="memory-item-faded">

            <div class="memory-code-link"> ${
                paper.codeLink.replace(/^https?:\/\//, "") || ""
            } </div>
            <div class="memory-website-url">
                ${
                    (paper.source == "website" &&
                        paper.pdfLink.replace(/^https?:\/\//, "")) ||
                    ""
                }
            </div>
        </small>
    `;
        let noteDiv = /*html*/ `<div class="memory-note-div memory-item-faded"></div>`;
        if (paper.note) {
            noteDiv = /*html*/ `
            <div class="memory-note-div memory-item-faded">
                <span class="note-content-header">Note:</span>
                <span class="note-content">${note}</span>
            </div>
        `;
        }

        const openLocalDiv = state.files.hasOwnProperty(paper.id)
            ? /*html*/ `
            <div
                class="memory-item-openLocal memory-item-svg-div"
                title='${titles.openLocal}'
            >
                ${tablerSvg("vocabulary", "", ["memory-icon-svg"])}
            </div>`
            : ``;

        const openLinkDiv =
            paper.source === "website"
                ? ""
                : /*html*/ `
            <div
                class="memory-item-link memory-item-svg-div"
                title='${titles.pdfLink}'
            >
                ${tablerSvg("external-link", "", ["memory-icon-svg"])}
            </div>`;

        let scirate = "";
        if (state.prefs.checkScirate && paper.source === "arxiv") {
            scirate = /*html*/ `
        <div
            class="memory-item-scirate memory-item-svg-div"
            title="Open on SciRate"
        >
            ${tablerSvg("messages", "", ["memory-icon-svg"])}
        </div>`;
        }

        let alphaxiv = "";
        if (state.prefs.checkAlphaxiv && paper.source === "arxiv") {
            alphaxiv = /*html*/ `
        <div
            class="memory-item-alphaxiv memory-item-svg-div"
            title="Open on AlphaXiv"
        >
            ${tablerSvg("alphaxiv", "", ["memory-icon-svg", "alphaxiv-icon"])}
        </div>`;
        }

        let ar5iv = "";
        if (state.prefs.checkAr5iv && paper.source === "arxiv") {
            ar5iv = /*html*/ `
        <div
            class="memory-item-ar5iv memory-item-svg-div"
            title="Open on ar5iv"
        >
            ${tablerSvg("ar5iv", "", ["memory-icon-svg"])}
        </div>`;
        }

        let huggingface = "";
        if (state.prefs.checkHuggingface && paper.source === "arxiv") {
            huggingface = /*html*/ `
        <div
            class="memory-item-huggingface memory-item-svg-div"
            title="Open on HuggingFace Papers"
        >
            ${tablerSvg("huggingface", "", ["memory-icon-svg"])}
        </div>`;
        }

        const titleInfoTable = getPaperInfoTable(paper);

        return /*html*/ `
        <div
            class="memory-container ${favoriteClass}"
            tabindex="0"
            id="memory-container--${id}"
        >
            <h4 class="memory-title">
                <span class="memory-item-favorite">
                    ${tablerSvg("star", "", [
                        "memory-item-favorite-svg",
                        favoriteClass,
                    ])}
                </span>
                ${paper.title}
                <div class="title-tooltip" style="display: none;">
                    ${titleInfoTable}
                </div>
            </h4>
            <div class="my-1 mx-0">
                <small class="tag-list">
                    ${[...tags]
                        .map((t) => `<span class="memory-tag" >${t}</span>`)
                        .join("")}
                </small>
                <div class="edit-tags p-0" style="display: none">
                    <div class="flex-center-between">
                        <span class="label">Tags:</span>
                        <select
                            class="memory-item-tags"
                            id="memory-item-tags--${id}"
                            multiple="multiple"
                        >
                            ${tagOptions}
                        </select>
                    </div>
                </div>
            </div>
            <small class="memory-authors">${cutAuthors(paper.author)}</small>

            <div class="code-and-note">${codeDiv} ${noteDiv}</div>

            <div class="memory-item-actions flex-center-between mt-2">
                <div class="d-flex align-items-center">
                    <div
                        class="memory-item-edit memory-item-svg-div me-2"
                        title='${titles.edit}'
                    >
                        ${tablerSvg("writing", "", ["memory-icon-svg"])}
                    </div>

                    <small class="memory-item-faded memory-display-id" title='${
                        titles.displayId
                    }'>
                        ${displayId}
                    </small>
                </div>

                ${openLocalDiv}
                ${openLinkDiv}
                ${huggingface}
                ${alphaxiv}
                ${ar5iv}
                ${scirate}


                <div
                    class="memory-item-copy-link memory-item-svg-div"
                    title='${titles.copyLink}'
                >
                    ${tablerSvg("link", "", ["memory-icon-svg"])}
                </div>

                <div
                    class="memory-item-copy-hyperlink memory-item-svg-div"
                    title='${titles.copyHypeLink}'
                >
                    ${tablerSvg("device-desktop-code", "", ["memory-icon-svg"])}
                </div>



                <div class="memory-item-md memory-item-svg-div" title='${
                    titles.copyMd
                }'>
                    ${tablerSvg("markdown", "", ["memory-icon-svg"])}
                </div>

                <div
                    class="memory-item-bibtex memory-item-svg-div"
                    title='${titles.copyBibtext}'
                >
                    ${tablerSvg("math-function", "", ["memory-icon-svg"])}
                </div>

                <span style="display: none" class="memory-item-feedback"></span>

            </div>

            <div class="extended-item" style="display: none">
                <div class="item-note">
                    <form class="form-note">
                        <div class="flex-center-start">
                            <span class="label">Code:</span>
                            <input
                                type="text"
                                class="form-code-input"
                                value="${paper.codeLink || ""}"
                                placeholder="Add link"
                            />
                        </div>
                        <div class="flex-center-start">
                            <span class="label">Note:</span>
                            <textarea
                                rows="2"
                                class="form-note-textarea"
                                placeholder="Anything to note?"
                            >
${note}</textarea
                            >
                        </div>
                        <div class="form-note-buttons">
                            <button class="done-note-form back-to-focus">
                                Done
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="memory-delete" title="Delete from Memory">-</div>
        </div>
    `;
    };

    /**
     * Return a formatted HTML string to edit the user's stored metadata
     * about a paper: tags, notes, code link
     * @param {object} paper A paper object
     * @returns HTML string
     */
    const getPopupEditFormHTML = (paper) => {
        const id = paper.id;
        const tagOptions = getTagsOptions(paper);
        const note = paper.note || "";
        const checked = "";
        const displayId = getDisplayId(paper.id);

        return /*html*/ ` <div
        style="max-width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 4px 16px;"
    >
        <div style="width: 100%">
            <div
                style="width: 100%; display: flex; justify-content: space-between; align-items: center;"
            >
                <span class="label">Tags:</span>
                <select
                    id="popup-item-tags--${id}"
                    class="memory-item-tags"
                    multiple="multiple"
                >
                    ${tagOptions}
                </select>
            </div>
            <div
                class="form-note"
                id="popup-form-note--${id}"
                style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-direction: column;"
            >
                <div class="flex-center-start w-100 mr-0">
                    <span class="label">Code:</span>
                    <input
                        id="popup-form-codeLink--${id}"
                        type="text"
                        class="form-code-input mt-0"
                        value="${paper.codeLink || ""}"
                        placeholder="Add code link"
                    />
                </div>
                <div class="flex-center-start w-100 mr-0">
                    <span class="label">Note:</span>
                    <textarea
                        rows="2"
                        class="popup-form-note-textarea"
                        id="popup-form-note-textarea--${id}"
                        placeholder="Anything to note?"
                    >
${note}</textarea
                    >
                </div>
            </div>
            <div
                style="display: flex; justify-content: space-between; align-items: center"
            >
                <div
                    style="display: flex; justify-content: flex-start; align-items: center"
                >
                    <label class="label" for="checkFavorite">Favorite: </label>
                    <input
                        ${checked}
                        class="switch"
                        type="checkbox"
                        id="checkFavorite--${id}"
                        name="checkFavorite"
                        value="checkFavorite"
                    />
                </div>
                <div id="popup-delete-paper" title="Delete paper from Memory">
                    <svg
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
                    </svg>
                </div>
                <small class="popup-display-id" id="popup-memory-display-id--${id}"> ${displayId} </small>
                <button
                    hidden
                    class="back-to-focus"
                    id="popup-save-edits--${id}"
                >
                    Save
                </button>
            </div>
        </div>
    </div>`;
    };

    /**
     * Return a formatted HTML string with the svg icons to display in the main popup
     * @param {object} paper A paper object
     * @param {string} currentUrl The current URL
     * @param {object} is The result of isPaper(currentUrl)
     * @returns HTML string
     */
    const getPopupPaperIconsHTML = (paper, currentUrl, is) => {
        const id = paper.id;
        const name = isPdfUrl$1(currentUrl) ? "HTML" : "PDF";

        let scirate = "";
        if (state.prefs.checkScirate && paper.source === "arxiv") {
            scirate = /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-scirate--${id}"
            title="Open on SciRate"
        >
            ${tablerSvg("messages", "", ["popup-click-svg"])}
        </div>`;
        }
        let alphaxiv = "";
        if (
            state.prefs.checkAlphaxiv &&
            paper.source === "arxiv" &&
            !currentUrl.includes("alphaxiv.org")
        ) {
            alphaxiv = /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-alphaxiv--${id}"
            title="Open on AlphaXiv"
        >
            ${tablerSvg("alphaxiv", "", ["popup-click-svg", "alphaxiv-icon"])}
        </div>`;
        }
        let ar5iv = "";
        if (
            state.prefs.checkAr5iv &&
            paper.source === "arxiv" &&
            !currentUrl.includes("ar5iv.labs.arxiv.org")
        ) {
            ar5iv = /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-ar5iv--${id}"
            title="Open on ar5iv"
        >
            ${tablerSvg("ar5iv", "", ["popup-click-svg"])}
        </div>`;
        }
        let huggingface = "";
        if (
            state.prefs.checkHuggingface &&
            paper.source === "arxiv" &&
            !currentUrl.includes("huggingface.co/papers/")
        ) {
            huggingface = /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-huggingface--${id}"
            title="Open on HuggingFace Papers"
        >
            ${tablerSvg("huggingface", "", ["popup-click-svg"])}
        </div>`;
        }

        const download =
            state.prefs.checkStore &&
            (is.localFile || is.stored || state.files.hasOwnProperty(paper.id))
                ? /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-openLocal--${id}"
            title="Open downloaded pdf"
        >
            ${tablerSvg("vocabulary", "", ["popup-click-svg"])}
        </div>`
                : /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-download--${id}"
            title="Download PDF"
        >
            ${tablerSvg("file-download", "", ["popup-click-svg"])}
        </div>`;

        const paperLink =
            paper.source === "website"
                ? ""
                : /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-link--${id}"
            title="Open ${name} tab"
        >
            ${tablerSvg("external-link", "", ["popup-click-svg"])}
        </div>`;

        return /*html*/ `
        ${paperLink}
        ${huggingface}
        ${scirate}
        ${alphaxiv}
        ${ar5iv}

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-copy-link--${id}"
            title="Copy link to paper"
        >
            ${tablerSvg("link", "", ["popup-click-svg"])}
        </div>

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-copy-hyperlink--${id}"
            title="Copy hyperlink to paper"
        >
            ${tablerSvg("device-desktop-code", "", ["popup-click-svg"])}
        </div>

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-md--${id}"
            title="Copy Markdown-formatted link"
        >
            ${tablerSvg("markdown", "", ["popup-click-svg"])}
        </div>

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-bibtex--${id}"
            title="Copy Bibtex citation"
        >
            ${tablerSvg("math-function", "", ["popup-click-svg"])}
        </div>

        ${download}`;
    };

    function getDefaultExportFromCjs (x) {
    	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
    }

    var jquery$1 = {exports: {}};

    /*!
     * jQuery JavaScript Library v3.7.1
     * https://jquery.com/
     *
     * Copyright OpenJS Foundation and other contributors
     * Released under the MIT license
     * https://jquery.org/license
     *
     * Date: 2023-08-28T13:37Z
     */
    var jquery = jquery$1.exports;

    var hasRequiredJquery;

    function requireJquery () {
    	if (hasRequiredJquery) return jquery$1.exports;
    	hasRequiredJquery = 1;
    	(function (module) {
    		( function( global, factory ) {

    			{

    				// For CommonJS and CommonJS-like environments where a proper `window`
    				// is present, execute the factory and get jQuery.
    				// For environments that do not have a `window` with a `document`
    				// (such as Node.js), expose a factory as module.exports.
    				// This accentuates the need for the creation of a real `window`.
    				// e.g. var jQuery = require("jquery")(window);
    				// See ticket trac-14549 for more info.
    				module.exports = global.document ?
    					factory( global, true ) :
    					function( w ) {
    						if ( !w.document ) {
    							throw new Error( "jQuery requires a window with a document" );
    						}
    						return factory( w );
    					};
    			}

    		// Pass this if window is not defined yet
    		} )( typeof window !== "undefined" ? window : jquery, function( window, noGlobal ) {

    		var arr = [];

    		var getProto = Object.getPrototypeOf;

    		var slice = arr.slice;

    		var flat = arr.flat ? function( array ) {
    			return arr.flat.call( array );
    		} : function( array ) {
    			return arr.concat.apply( [], array );
    		};


    		var push = arr.push;

    		var indexOf = arr.indexOf;

    		var class2type = {};

    		var toString = class2type.toString;

    		var hasOwn = class2type.hasOwnProperty;

    		var fnToString = hasOwn.toString;

    		var ObjectFunctionString = fnToString.call( Object );

    		var support = {};

    		var isFunction = function isFunction( obj ) {

    				// Support: Chrome <=57, Firefox <=52
    				// In some browsers, typeof returns "function" for HTML <object> elements
    				// (i.e., `typeof document.createElement( "object" ) === "function"`).
    				// We don't want to classify *any* DOM node as a function.
    				// Support: QtWeb <=3.8.5, WebKit <=534.34, wkhtmltopdf tool <=0.12.5
    				// Plus for old WebKit, typeof returns "function" for HTML collections
    				// (e.g., `typeof document.getElementsByTagName("div") === "function"`). (gh-4756)
    				return typeof obj === "function" && typeof obj.nodeType !== "number" &&
    					typeof obj.item !== "function";
    			};


    		var isWindow = function isWindow( obj ) {
    				return obj != null && obj === obj.window;
    			};


    		var document = window.document;



    			var preservedScriptAttributes = {
    				type: true,
    				src: true,
    				nonce: true,
    				noModule: true
    			};

    			function DOMEval( code, node, doc ) {
    				doc = doc || document;

    				var i, val,
    					script = doc.createElement( "script" );

    				script.text = code;
    				if ( node ) {
    					for ( i in preservedScriptAttributes ) {

    						// Support: Firefox 64+, Edge 18+
    						// Some browsers don't support the "nonce" property on scripts.
    						// On the other hand, just using `getAttribute` is not enough as
    						// the `nonce` attribute is reset to an empty string whenever it
    						// becomes browsing-context connected.
    						// See https://github.com/whatwg/html/issues/2369
    						// See https://html.spec.whatwg.org/#nonce-attributes
    						// The `node.getAttribute` check was added for the sake of
    						// `jQuery.globalEval` so that it can fake a nonce-containing node
    						// via an object.
    						val = node[ i ] || node.getAttribute && node.getAttribute( i );
    						if ( val ) {
    							script.setAttribute( i, val );
    						}
    					}
    				}
    				doc.head.appendChild( script ).parentNode.removeChild( script );
    			}


    		function toType( obj ) {
    			if ( obj == null ) {
    				return obj + "";
    			}

    			// Support: Android <=2.3 only (functionish RegExp)
    			return typeof obj === "object" || typeof obj === "function" ?
    				class2type[ toString.call( obj ) ] || "object" :
    				typeof obj;
    		}
    		/* global Symbol */
    		// Defining this global in .eslintrc.json would create a danger of using the global
    		// unguarded in another place, it seems safer to define global only for this module



    		var version = "3.7.1",

    			rhtmlSuffix = /HTML$/i,

    			// Define a local copy of jQuery
    			jQuery = function( selector, context ) {

    				// The jQuery object is actually just the init constructor 'enhanced'
    				// Need init if jQuery is called (just allow error to be thrown if not included)
    				return new jQuery.fn.init( selector, context );
    			};

    		jQuery.fn = jQuery.prototype = {

    			// The current version of jQuery being used
    			jquery: version,

    			constructor: jQuery,

    			// The default length of a jQuery object is 0
    			length: 0,

    			toArray: function() {
    				return slice.call( this );
    			},

    			// Get the Nth element in the matched element set OR
    			// Get the whole matched element set as a clean array
    			get: function( num ) {

    				// Return all the elements in a clean array
    				if ( num == null ) {
    					return slice.call( this );
    				}

    				// Return just the one element from the set
    				return num < 0 ? this[ num + this.length ] : this[ num ];
    			},

    			// Take an array of elements and push it onto the stack
    			// (returning the new matched element set)
    			pushStack: function( elems ) {

    				// Build a new jQuery matched element set
    				var ret = jQuery.merge( this.constructor(), elems );

    				// Add the old object onto the stack (as a reference)
    				ret.prevObject = this;

    				// Return the newly-formed element set
    				return ret;
    			},

    			// Execute a callback for every element in the matched set.
    			each: function( callback ) {
    				return jQuery.each( this, callback );
    			},

    			map: function( callback ) {
    				return this.pushStack( jQuery.map( this, function( elem, i ) {
    					return callback.call( elem, i, elem );
    				} ) );
    			},

    			slice: function() {
    				return this.pushStack( slice.apply( this, arguments ) );
    			},

    			first: function() {
    				return this.eq( 0 );
    			},

    			last: function() {
    				return this.eq( -1 );
    			},

    			even: function() {
    				return this.pushStack( jQuery.grep( this, function( _elem, i ) {
    					return ( i + 1 ) % 2;
    				} ) );
    			},

    			odd: function() {
    				return this.pushStack( jQuery.grep( this, function( _elem, i ) {
    					return i % 2;
    				} ) );
    			},

    			eq: function( i ) {
    				var len = this.length,
    					j = +i + ( i < 0 ? len : 0 );
    				return this.pushStack( j >= 0 && j < len ? [ this[ j ] ] : [] );
    			},

    			end: function() {
    				return this.prevObject || this.constructor();
    			},

    			// For internal use only.
    			// Behaves like an Array's method, not like a jQuery method.
    			push: push,
    			sort: arr.sort,
    			splice: arr.splice
    		};

    		jQuery.extend = jQuery.fn.extend = function() {
    			var options, name, src, copy, copyIsArray, clone,
    				target = arguments[ 0 ] || {},
    				i = 1,
    				length = arguments.length,
    				deep = false;

    			// Handle a deep copy situation
    			if ( typeof target === "boolean" ) {
    				deep = target;

    				// Skip the boolean and the target
    				target = arguments[ i ] || {};
    				i++;
    			}

    			// Handle case when target is a string or something (possible in deep copy)
    			if ( typeof target !== "object" && !isFunction( target ) ) {
    				target = {};
    			}

    			// Extend jQuery itself if only one argument is passed
    			if ( i === length ) {
    				target = this;
    				i--;
    			}

    			for ( ; i < length; i++ ) {

    				// Only deal with non-null/undefined values
    				if ( ( options = arguments[ i ] ) != null ) {

    					// Extend the base object
    					for ( name in options ) {
    						copy = options[ name ];

    						// Prevent Object.prototype pollution
    						// Prevent never-ending loop
    						if ( name === "__proto__" || target === copy ) {
    							continue;
    						}

    						// Recurse if we're merging plain objects or arrays
    						if ( deep && copy && ( jQuery.isPlainObject( copy ) ||
    							( copyIsArray = Array.isArray( copy ) ) ) ) {
    							src = target[ name ];

    							// Ensure proper type for the source value
    							if ( copyIsArray && !Array.isArray( src ) ) {
    								clone = [];
    							} else if ( !copyIsArray && !jQuery.isPlainObject( src ) ) {
    								clone = {};
    							} else {
    								clone = src;
    							}
    							copyIsArray = false;

    							// Never move original objects, clone them
    							target[ name ] = jQuery.extend( deep, clone, copy );

    						// Don't bring in undefined values
    						} else if ( copy !== undefined ) {
    							target[ name ] = copy;
    						}
    					}
    				}
    			}

    			// Return the modified object
    			return target;
    		};

    		jQuery.extend( {

    			// Unique for each copy of jQuery on the page
    			expando: "jQuery" + ( version + Math.random() ).replace( /\D/g, "" ),

    			// Assume jQuery is ready without the ready module
    			isReady: true,

    			error: function( msg ) {
    				throw new Error( msg );
    			},

    			noop: function() {},

    			isPlainObject: function( obj ) {
    				var proto, Ctor;

    				// Detect obvious negatives
    				// Use toString instead of jQuery.type to catch host objects
    				if ( !obj || toString.call( obj ) !== "[object Object]" ) {
    					return false;
    				}

    				proto = getProto( obj );

    				// Objects with no prototype (e.g., `Object.create( null )`) are plain
    				if ( !proto ) {
    					return true;
    				}

    				// Objects with prototype are plain iff they were constructed by a global Object function
    				Ctor = hasOwn.call( proto, "constructor" ) && proto.constructor;
    				return typeof Ctor === "function" && fnToString.call( Ctor ) === ObjectFunctionString;
    			},

    			isEmptyObject: function( obj ) {
    				var name;

    				for ( name in obj ) {
    					return false;
    				}
    				return true;
    			},

    			// Evaluates a script in a provided context; falls back to the global one
    			// if not specified.
    			globalEval: function( code, options, doc ) {
    				DOMEval( code, { nonce: options && options.nonce }, doc );
    			},

    			each: function( obj, callback ) {
    				var length, i = 0;

    				if ( isArrayLike( obj ) ) {
    					length = obj.length;
    					for ( ; i < length; i++ ) {
    						if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
    							break;
    						}
    					}
    				} else {
    					for ( i in obj ) {
    						if ( callback.call( obj[ i ], i, obj[ i ] ) === false ) {
    							break;
    						}
    					}
    				}

    				return obj;
    			},


    			// Retrieve the text value of an array of DOM nodes
    			text: function( elem ) {
    				var node,
    					ret = "",
    					i = 0,
    					nodeType = elem.nodeType;

    				if ( !nodeType ) {

    					// If no nodeType, this is expected to be an array
    					while ( ( node = elem[ i++ ] ) ) {

    						// Do not traverse comment nodes
    						ret += jQuery.text( node );
    					}
    				}
    				if ( nodeType === 1 || nodeType === 11 ) {
    					return elem.textContent;
    				}
    				if ( nodeType === 9 ) {
    					return elem.documentElement.textContent;
    				}
    				if ( nodeType === 3 || nodeType === 4 ) {
    					return elem.nodeValue;
    				}

    				// Do not include comment or processing instruction nodes

    				return ret;
    			},

    			// results is for internal usage only
    			makeArray: function( arr, results ) {
    				var ret = results || [];

    				if ( arr != null ) {
    					if ( isArrayLike( Object( arr ) ) ) {
    						jQuery.merge( ret,
    							typeof arr === "string" ?
    								[ arr ] : arr
    						);
    					} else {
    						push.call( ret, arr );
    					}
    				}

    				return ret;
    			},

    			inArray: function( elem, arr, i ) {
    				return arr == null ? -1 : indexOf.call( arr, elem, i );
    			},

    			isXMLDoc: function( elem ) {
    				var namespace = elem && elem.namespaceURI,
    					docElem = elem && ( elem.ownerDocument || elem ).documentElement;

    				// Assume HTML when documentElement doesn't yet exist, such as inside
    				// document fragments.
    				return !rhtmlSuffix.test( namespace || docElem && docElem.nodeName || "HTML" );
    			},

    			// Support: Android <=4.0 only, PhantomJS 1 only
    			// push.apply(_, arraylike) throws on ancient WebKit
    			merge: function( first, second ) {
    				var len = +second.length,
    					j = 0,
    					i = first.length;

    				for ( ; j < len; j++ ) {
    					first[ i++ ] = second[ j ];
    				}

    				first.length = i;

    				return first;
    			},

    			grep: function( elems, callback, invert ) {
    				var callbackInverse,
    					matches = [],
    					i = 0,
    					length = elems.length,
    					callbackExpect = !invert;

    				// Go through the array, only saving the items
    				// that pass the validator function
    				for ( ; i < length; i++ ) {
    					callbackInverse = !callback( elems[ i ], i );
    					if ( callbackInverse !== callbackExpect ) {
    						matches.push( elems[ i ] );
    					}
    				}

    				return matches;
    			},

    			// arg is for internal usage only
    			map: function( elems, callback, arg ) {
    				var length, value,
    					i = 0,
    					ret = [];

    				// Go through the array, translating each of the items to their new values
    				if ( isArrayLike( elems ) ) {
    					length = elems.length;
    					for ( ; i < length; i++ ) {
    						value = callback( elems[ i ], i, arg );

    						if ( value != null ) {
    							ret.push( value );
    						}
    					}

    				// Go through every key on the object,
    				} else {
    					for ( i in elems ) {
    						value = callback( elems[ i ], i, arg );

    						if ( value != null ) {
    							ret.push( value );
    						}
    					}
    				}

    				// Flatten any nested arrays
    				return flat( ret );
    			},

    			// A global GUID counter for objects
    			guid: 1,

    			// jQuery.support is not used in Core but other projects attach their
    			// properties to it so it needs to exist.
    			support: support
    		} );

    		if ( typeof Symbol === "function" ) {
    			jQuery.fn[ Symbol.iterator ] = arr[ Symbol.iterator ];
    		}

    		// Populate the class2type map
    		jQuery.each( "Boolean Number String Function Array Date RegExp Object Error Symbol".split( " " ),
    			function( _i, name ) {
    				class2type[ "[object " + name + "]" ] = name.toLowerCase();
    			} );

    		function isArrayLike( obj ) {

    			// Support: real iOS 8.2 only (not reproducible in simulator)
    			// `in` check used to prevent JIT error (gh-2145)
    			// hasOwn isn't used here due to false negatives
    			// regarding Nodelist length in IE
    			var length = !!obj && "length" in obj && obj.length,
    				type = toType( obj );

    			if ( isFunction( obj ) || isWindow( obj ) ) {
    				return false;
    			}

    			return type === "array" || length === 0 ||
    				typeof length === "number" && length > 0 && ( length - 1 ) in obj;
    		}


    		function nodeName( elem, name ) {

    			return elem.nodeName && elem.nodeName.toLowerCase() === name.toLowerCase();

    		}
    		var pop = arr.pop;


    		var sort = arr.sort;


    		var splice = arr.splice;


    		var whitespace = "[\\x20\\t\\r\\n\\f]";


    		var rtrimCSS = new RegExp(
    			"^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$",
    			"g"
    		);




    		// Note: an element does not contain itself
    		jQuery.contains = function( a, b ) {
    			var bup = b && b.parentNode;

    			return a === bup || !!( bup && bup.nodeType === 1 && (

    				// Support: IE 9 - 11+
    				// IE doesn't have `contains` on SVG.
    				a.contains ?
    					a.contains( bup ) :
    					a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
    			) );
    		};




    		// CSS string/identifier serialization
    		// https://drafts.csswg.org/cssom/#common-serializing-idioms
    		var rcssescape = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\x80-\uFFFF\w-]/g;

    		function fcssescape( ch, asCodePoint ) {
    			if ( asCodePoint ) {

    				// U+0000 NULL becomes U+FFFD REPLACEMENT CHARACTER
    				if ( ch === "\0" ) {
    					return "\uFFFD";
    				}

    				// Control characters and (dependent upon position) numbers get escaped as code points
    				return ch.slice( 0, -1 ) + "\\" + ch.charCodeAt( ch.length - 1 ).toString( 16 ) + " ";
    			}

    			// Other potentially-special ASCII characters get backslash-escaped
    			return "\\" + ch;
    		}

    		jQuery.escapeSelector = function( sel ) {
    			return ( sel + "" ).replace( rcssescape, fcssescape );
    		};




    		var preferredDoc = document,
    			pushNative = push;

    		( function() {

    		var i,
    			Expr,
    			outermostContext,
    			sortInput,
    			hasDuplicate,
    			push = pushNative,

    			// Local document vars
    			document,
    			documentElement,
    			documentIsHTML,
    			rbuggyQSA,
    			matches,

    			// Instance-specific data
    			expando = jQuery.expando,
    			dirruns = 0,
    			done = 0,
    			classCache = createCache(),
    			tokenCache = createCache(),
    			compilerCache = createCache(),
    			nonnativeSelectorCache = createCache(),
    			sortOrder = function( a, b ) {
    				if ( a === b ) {
    					hasDuplicate = true;
    				}
    				return 0;
    			},

    			booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|" +
    				"loop|multiple|open|readonly|required|scoped",

    			// Regular expressions

    			// https://www.w3.org/TR/css-syntax-3/#ident-token-diagram
    			identifier = "(?:\\\\[\\da-fA-F]{1,6}" + whitespace +
    				"?|\\\\[^\\r\\n\\f]|[\\w-]|[^\0-\\x7f])+",

    			// Attribute selectors: https://www.w3.org/TR/selectors/#attribute-selectors
    			attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +

    				// Operator (capture 2)
    				"*([*^$|!~]?=)" + whitespace +

    				// "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
    				"*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" +
    				whitespace + "*\\]",

    			pseudos = ":(" + identifier + ")(?:\\((" +

    				// To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
    				// 1. quoted (capture 3; capture 4 or capture 5)
    				"('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +

    				// 2. simple (capture 6)
    				"((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +

    				// 3. anything else (capture 2)
    				".*" +
    				")\\)|)",

    			// Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
    			rwhitespace = new RegExp( whitespace + "+", "g" ),

    			rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
    			rleadingCombinator = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" +
    				whitespace + "*" ),
    			rdescend = new RegExp( whitespace + "|>" ),

    			rpseudo = new RegExp( pseudos ),
    			ridentifier = new RegExp( "^" + identifier + "$" ),

    			matchExpr = {
    				ID: new RegExp( "^#(" + identifier + ")" ),
    				CLASS: new RegExp( "^\\.(" + identifier + ")" ),
    				TAG: new RegExp( "^(" + identifier + "|[*])" ),
    				ATTR: new RegExp( "^" + attributes ),
    				PSEUDO: new RegExp( "^" + pseudos ),
    				CHILD: new RegExp(
    					"^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
    						whitespace + "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" +
    						whitespace + "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
    				bool: new RegExp( "^(?:" + booleans + ")$", "i" ),

    				// For use in libraries implementing .is()
    				// We use this for POS matching in `select`
    				needsContext: new RegExp( "^" + whitespace +
    					"*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" + whitespace +
    					"*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
    			},

    			rinputs = /^(?:input|select|textarea|button)$/i,
    			rheader = /^h\d$/i,

    			// Easily-parseable/retrievable ID or TAG or CLASS selectors
    			rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

    			rsibling = /[+~]/,

    			// CSS escapes
    			// https://www.w3.org/TR/CSS21/syndata.html#escaped-characters
    			runescape = new RegExp( "\\\\[\\da-fA-F]{1,6}" + whitespace +
    				"?|\\\\([^\\r\\n\\f])", "g" ),
    			funescape = function( escape, nonHex ) {
    				var high = "0x" + escape.slice( 1 ) - 0x10000;

    				if ( nonHex ) {

    					// Strip the backslash prefix from a non-hex escape sequence
    					return nonHex;
    				}

    				// Replace a hexadecimal escape sequence with the encoded Unicode code point
    				// Support: IE <=11+
    				// For values outside the Basic Multilingual Plane (BMP), manually construct a
    				// surrogate pair
    				return high < 0 ?
    					String.fromCharCode( high + 0x10000 ) :
    					String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
    			},

    			// Used for iframes; see `setDocument`.
    			// Support: IE 9 - 11+, Edge 12 - 18+
    			// Removing the function wrapper causes a "Permission Denied"
    			// error in IE/Edge.
    			unloadHandler = function() {
    				setDocument();
    			},

    			inDisabledFieldset = addCombinator(
    				function( elem ) {
    					return elem.disabled === true && nodeName( elem, "fieldset" );
    				},
    				{ dir: "parentNode", next: "legend" }
    			);

    		// Support: IE <=9 only
    		// Accessing document.activeElement can throw unexpectedly
    		// https://bugs.jquery.com/ticket/13393
    		function safeActiveElement() {
    			try {
    				return document.activeElement;
    			} catch ( err ) { }
    		}

    		// Optimize for push.apply( _, NodeList )
    		try {
    			push.apply(
    				( arr = slice.call( preferredDoc.childNodes ) ),
    				preferredDoc.childNodes
    			);

    			// Support: Android <=4.0
    			// Detect silently failing push.apply
    			// eslint-disable-next-line no-unused-expressions
    			arr[ preferredDoc.childNodes.length ].nodeType;
    		} catch ( e ) {
    			push = {
    				apply: function( target, els ) {
    					pushNative.apply( target, slice.call( els ) );
    				},
    				call: function( target ) {
    					pushNative.apply( target, slice.call( arguments, 1 ) );
    				}
    			};
    		}

    		function find( selector, context, results, seed ) {
    			var m, i, elem, nid, match, groups, newSelector,
    				newContext = context && context.ownerDocument,

    				// nodeType defaults to 9, since context defaults to document
    				nodeType = context ? context.nodeType : 9;

    			results = results || [];

    			// Return early from calls with invalid selector or context
    			if ( typeof selector !== "string" || !selector ||
    				nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

    				return results;
    			}

    			// Try to shortcut find operations (as opposed to filters) in HTML documents
    			if ( !seed ) {
    				setDocument( context );
    				context = context || document;

    				if ( documentIsHTML ) {

    					// If the selector is sufficiently simple, try using a "get*By*" DOM method
    					// (excepting DocumentFragment context, where the methods don't exist)
    					if ( nodeType !== 11 && ( match = rquickExpr.exec( selector ) ) ) {

    						// ID selector
    						if ( ( m = match[ 1 ] ) ) {

    							// Document context
    							if ( nodeType === 9 ) {
    								if ( ( elem = context.getElementById( m ) ) ) {

    									// Support: IE 9 only
    									// getElementById can match elements by name instead of ID
    									if ( elem.id === m ) {
    										push.call( results, elem );
    										return results;
    									}
    								} else {
    									return results;
    								}

    							// Element context
    							} else {

    								// Support: IE 9 only
    								// getElementById can match elements by name instead of ID
    								if ( newContext && ( elem = newContext.getElementById( m ) ) &&
    									find.contains( context, elem ) &&
    									elem.id === m ) {

    									push.call( results, elem );
    									return results;
    								}
    							}

    						// Type selector
    						} else if ( match[ 2 ] ) {
    							push.apply( results, context.getElementsByTagName( selector ) );
    							return results;

    						// Class selector
    						} else if ( ( m = match[ 3 ] ) && context.getElementsByClassName ) {
    							push.apply( results, context.getElementsByClassName( m ) );
    							return results;
    						}
    					}

    					// Take advantage of querySelectorAll
    					if ( !nonnativeSelectorCache[ selector + " " ] &&
    						( !rbuggyQSA || !rbuggyQSA.test( selector ) ) ) {

    						newSelector = selector;
    						newContext = context;

    						// qSA considers elements outside a scoping root when evaluating child or
    						// descendant combinators, which is not what we want.
    						// In such cases, we work around the behavior by prefixing every selector in the
    						// list with an ID selector referencing the scope context.
    						// The technique has to be used as well when a leading combinator is used
    						// as such selectors are not recognized by querySelectorAll.
    						// Thanks to Andrew Dupont for this technique.
    						if ( nodeType === 1 &&
    							( rdescend.test( selector ) || rleadingCombinator.test( selector ) ) ) {

    							// Expand context for sibling selectors
    							newContext = rsibling.test( selector ) && testContext( context.parentNode ) ||
    								context;

    							// We can use :scope instead of the ID hack if the browser
    							// supports it & if we're not changing the context.
    							// Support: IE 11+, Edge 17 - 18+
    							// IE/Edge sometimes throw a "Permission denied" error when
    							// strict-comparing two documents; shallow comparisons work.
    							// eslint-disable-next-line eqeqeq
    							if ( newContext != context || !support.scope ) {

    								// Capture the context ID, setting it first if necessary
    								if ( ( nid = context.getAttribute( "id" ) ) ) {
    									nid = jQuery.escapeSelector( nid );
    								} else {
    									context.setAttribute( "id", ( nid = expando ) );
    								}
    							}

    							// Prefix every selector in the list
    							groups = tokenize( selector );
    							i = groups.length;
    							while ( i-- ) {
    								groups[ i ] = ( nid ? "#" + nid : ":scope" ) + " " +
    									toSelector( groups[ i ] );
    							}
    							newSelector = groups.join( "," );
    						}

    						try {
    							push.apply( results,
    								newContext.querySelectorAll( newSelector )
    							);
    							return results;
    						} catch ( qsaError ) {
    							nonnativeSelectorCache( selector, true );
    						} finally {
    							if ( nid === expando ) {
    								context.removeAttribute( "id" );
    							}
    						}
    					}
    				}
    			}

    			// All others
    			return select( selector.replace( rtrimCSS, "$1" ), context, results, seed );
    		}

    		/**
    		 * Create key-value caches of limited size
    		 * @returns {function(string, object)} Returns the Object data after storing it on itself with
    		 *	property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
    		 *	deleting the oldest entry
    		 */
    		function createCache() {
    			var keys = [];

    			function cache( key, value ) {

    				// Use (key + " ") to avoid collision with native prototype properties
    				// (see https://github.com/jquery/sizzle/issues/157)
    				if ( keys.push( key + " " ) > Expr.cacheLength ) {

    					// Only keep the most recent entries
    					delete cache[ keys.shift() ];
    				}
    				return ( cache[ key + " " ] = value );
    			}
    			return cache;
    		}

    		/**
    		 * Mark a function for special use by jQuery selector module
    		 * @param {Function} fn The function to mark
    		 */
    		function markFunction( fn ) {
    			fn[ expando ] = true;
    			return fn;
    		}

    		/**
    		 * Support testing using an element
    		 * @param {Function} fn Passed the created element and returns a boolean result
    		 */
    		function assert( fn ) {
    			var el = document.createElement( "fieldset" );

    			try {
    				return !!fn( el );
    			} catch ( e ) {
    				return false;
    			} finally {

    				// Remove from its parent by default
    				if ( el.parentNode ) {
    					el.parentNode.removeChild( el );
    				}

    				// release memory in IE
    				el = null;
    			}
    		}

    		/**
    		 * Returns a function to use in pseudos for input types
    		 * @param {String} type
    		 */
    		function createInputPseudo( type ) {
    			return function( elem ) {
    				return nodeName( elem, "input" ) && elem.type === type;
    			};
    		}

    		/**
    		 * Returns a function to use in pseudos for buttons
    		 * @param {String} type
    		 */
    		function createButtonPseudo( type ) {
    			return function( elem ) {
    				return ( nodeName( elem, "input" ) || nodeName( elem, "button" ) ) &&
    					elem.type === type;
    			};
    		}

    		/**
    		 * Returns a function to use in pseudos for :enabled/:disabled
    		 * @param {Boolean} disabled true for :disabled; false for :enabled
    		 */
    		function createDisabledPseudo( disabled ) {

    			// Known :disabled false positives: fieldset[disabled] > legend:nth-of-type(n+2) :can-disable
    			return function( elem ) {

    				// Only certain elements can match :enabled or :disabled
    				// https://html.spec.whatwg.org/multipage/scripting.html#selector-enabled
    				// https://html.spec.whatwg.org/multipage/scripting.html#selector-disabled
    				if ( "form" in elem ) {

    					// Check for inherited disabledness on relevant non-disabled elements:
    					// * listed form-associated elements in a disabled fieldset
    					//   https://html.spec.whatwg.org/multipage/forms.html#category-listed
    					//   https://html.spec.whatwg.org/multipage/forms.html#concept-fe-disabled
    					// * option elements in a disabled optgroup
    					//   https://html.spec.whatwg.org/multipage/forms.html#concept-option-disabled
    					// All such elements have a "form" property.
    					if ( elem.parentNode && elem.disabled === false ) {

    						// Option elements defer to a parent optgroup if present
    						if ( "label" in elem ) {
    							if ( "label" in elem.parentNode ) {
    								return elem.parentNode.disabled === disabled;
    							} else {
    								return elem.disabled === disabled;
    							}
    						}

    						// Support: IE 6 - 11+
    						// Use the isDisabled shortcut property to check for disabled fieldset ancestors
    						return elem.isDisabled === disabled ||

    							// Where there is no isDisabled, check manually
    							elem.isDisabled !== !disabled &&
    								inDisabledFieldset( elem ) === disabled;
    					}

    					return elem.disabled === disabled;

    				// Try to winnow out elements that can't be disabled before trusting the disabled property.
    				// Some victims get caught in our net (label, legend, menu, track), but it shouldn't
    				// even exist on them, let alone have a boolean value.
    				} else if ( "label" in elem ) {
    					return elem.disabled === disabled;
    				}

    				// Remaining elements are neither :enabled nor :disabled
    				return false;
    			};
    		}

    		/**
    		 * Returns a function to use in pseudos for positionals
    		 * @param {Function} fn
    		 */
    		function createPositionalPseudo( fn ) {
    			return markFunction( function( argument ) {
    				argument = +argument;
    				return markFunction( function( seed, matches ) {
    					var j,
    						matchIndexes = fn( [], seed.length, argument ),
    						i = matchIndexes.length;

    					// Match elements found at the specified indexes
    					while ( i-- ) {
    						if ( seed[ ( j = matchIndexes[ i ] ) ] ) {
    							seed[ j ] = !( matches[ j ] = seed[ j ] );
    						}
    					}
    				} );
    			} );
    		}

    		/**
    		 * Checks a node for validity as a jQuery selector context
    		 * @param {Element|Object=} context
    		 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
    		 */
    		function testContext( context ) {
    			return context && typeof context.getElementsByTagName !== "undefined" && context;
    		}

    		/**
    		 * Sets document-related variables once based on the current document
    		 * @param {Element|Object} [node] An element or document object to use to set the document
    		 * @returns {Object} Returns the current document
    		 */
    		function setDocument( node ) {
    			var subWindow,
    				doc = node ? node.ownerDocument || node : preferredDoc;

    			// Return early if doc is invalid or already selected
    			// Support: IE 11+, Edge 17 - 18+
    			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    			// two documents; shallow comparisons work.
    			// eslint-disable-next-line eqeqeq
    			if ( doc == document || doc.nodeType !== 9 || !doc.documentElement ) {
    				return document;
    			}

    			// Update global variables
    			document = doc;
    			documentElement = document.documentElement;
    			documentIsHTML = !jQuery.isXMLDoc( document );

    			// Support: iOS 7 only, IE 9 - 11+
    			// Older browsers didn't support unprefixed `matches`.
    			matches = documentElement.matches ||
    				documentElement.webkitMatchesSelector ||
    				documentElement.msMatchesSelector;

    			// Support: IE 9 - 11+, Edge 12 - 18+
    			// Accessing iframe documents after unload throws "permission denied" errors
    			// (see trac-13936).
    			// Limit the fix to IE & Edge Legacy; despite Edge 15+ implementing `matches`,
    			// all IE 9+ and Edge Legacy versions implement `msMatchesSelector` as well.
    			if ( documentElement.msMatchesSelector &&

    				// Support: IE 11+, Edge 17 - 18+
    				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    				// two documents; shallow comparisons work.
    				// eslint-disable-next-line eqeqeq
    				preferredDoc != document &&
    				( subWindow = document.defaultView ) && subWindow.top !== subWindow ) {

    				// Support: IE 9 - 11+, Edge 12 - 18+
    				subWindow.addEventListener( "unload", unloadHandler );
    			}

    			// Support: IE <10
    			// Check if getElementById returns elements by name
    			// The broken getElementById methods don't pick up programmatically-set names,
    			// so use a roundabout getElementsByName test
    			support.getById = assert( function( el ) {
    				documentElement.appendChild( el ).id = jQuery.expando;
    				return !document.getElementsByName ||
    					!document.getElementsByName( jQuery.expando ).length;
    			} );

    			// Support: IE 9 only
    			// Check to see if it's possible to do matchesSelector
    			// on a disconnected node.
    			support.disconnectedMatch = assert( function( el ) {
    				return matches.call( el, "*" );
    			} );

    			// Support: IE 9 - 11+, Edge 12 - 18+
    			// IE/Edge don't support the :scope pseudo-class.
    			support.scope = assert( function() {
    				return document.querySelectorAll( ":scope" );
    			} );

    			// Support: Chrome 105 - 111 only, Safari 15.4 - 16.3 only
    			// Make sure the `:has()` argument is parsed unforgivingly.
    			// We include `*` in the test to detect buggy implementations that are
    			// _selectively_ forgiving (specifically when the list includes at least
    			// one valid selector).
    			// Note that we treat complete lack of support for `:has()` as if it were
    			// spec-compliant support, which is fine because use of `:has()` in such
    			// environments will fail in the qSA path and fall back to jQuery traversal
    			// anyway.
    			support.cssHas = assert( function() {
    				try {
    					document.querySelector( ":has(*,:jqfake)" );
    					return false;
    				} catch ( e ) {
    					return true;
    				}
    			} );

    			// ID filter and find
    			if ( support.getById ) {
    				Expr.filter.ID = function( id ) {
    					var attrId = id.replace( runescape, funescape );
    					return function( elem ) {
    						return elem.getAttribute( "id" ) === attrId;
    					};
    				};
    				Expr.find.ID = function( id, context ) {
    					if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
    						var elem = context.getElementById( id );
    						return elem ? [ elem ] : [];
    					}
    				};
    			} else {
    				Expr.filter.ID =  function( id ) {
    					var attrId = id.replace( runescape, funescape );
    					return function( elem ) {
    						var node = typeof elem.getAttributeNode !== "undefined" &&
    							elem.getAttributeNode( "id" );
    						return node && node.value === attrId;
    					};
    				};

    				// Support: IE 6 - 7 only
    				// getElementById is not reliable as a find shortcut
    				Expr.find.ID = function( id, context ) {
    					if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
    						var node, i, elems,
    							elem = context.getElementById( id );

    						if ( elem ) {

    							// Verify the id attribute
    							node = elem.getAttributeNode( "id" );
    							if ( node && node.value === id ) {
    								return [ elem ];
    							}

    							// Fall back on getElementsByName
    							elems = context.getElementsByName( id );
    							i = 0;
    							while ( ( elem = elems[ i++ ] ) ) {
    								node = elem.getAttributeNode( "id" );
    								if ( node && node.value === id ) {
    									return [ elem ];
    								}
    							}
    						}

    						return [];
    					}
    				};
    			}

    			// Tag
    			Expr.find.TAG = function( tag, context ) {
    				if ( typeof context.getElementsByTagName !== "undefined" ) {
    					return context.getElementsByTagName( tag );

    				// DocumentFragment nodes don't have gEBTN
    				} else {
    					return context.querySelectorAll( tag );
    				}
    			};

    			// Class
    			Expr.find.CLASS = function( className, context ) {
    				if ( typeof context.getElementsByClassName !== "undefined" && documentIsHTML ) {
    					return context.getElementsByClassName( className );
    				}
    			};

    			/* QSA/matchesSelector
    			---------------------------------------------------------------------- */

    			// QSA and matchesSelector support

    			rbuggyQSA = [];

    			// Build QSA regex
    			// Regex strategy adopted from Diego Perini
    			assert( function( el ) {

    				var input;

    				documentElement.appendChild( el ).innerHTML =
    					"<a id='" + expando + "' href='' disabled='disabled'></a>" +
    					"<select id='" + expando + "-\r\\' disabled='disabled'>" +
    					"<option selected=''></option></select>";

    				// Support: iOS <=7 - 8 only
    				// Boolean attributes and "value" are not treated correctly in some XML documents
    				if ( !el.querySelectorAll( "[selected]" ).length ) {
    					rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
    				}

    				// Support: iOS <=7 - 8 only
    				if ( !el.querySelectorAll( "[id~=" + expando + "-]" ).length ) {
    					rbuggyQSA.push( "~=" );
    				}

    				// Support: iOS 8 only
    				// https://bugs.webkit.org/show_bug.cgi?id=136851
    				// In-page `selector#id sibling-combinator selector` fails
    				if ( !el.querySelectorAll( "a#" + expando + "+*" ).length ) {
    					rbuggyQSA.push( ".#.+[+~]" );
    				}

    				// Support: Chrome <=105+, Firefox <=104+, Safari <=15.4+
    				// In some of the document kinds, these selectors wouldn't work natively.
    				// This is probably OK but for backwards compatibility we want to maintain
    				// handling them through jQuery traversal in jQuery 3.x.
    				if ( !el.querySelectorAll( ":checked" ).length ) {
    					rbuggyQSA.push( ":checked" );
    				}

    				// Support: Windows 8 Native Apps
    				// The type and name attributes are restricted during .innerHTML assignment
    				input = document.createElement( "input" );
    				input.setAttribute( "type", "hidden" );
    				el.appendChild( input ).setAttribute( "name", "D" );

    				// Support: IE 9 - 11+
    				// IE's :disabled selector does not pick up the children of disabled fieldsets
    				// Support: Chrome <=105+, Firefox <=104+, Safari <=15.4+
    				// In some of the document kinds, these selectors wouldn't work natively.
    				// This is probably OK but for backwards compatibility we want to maintain
    				// handling them through jQuery traversal in jQuery 3.x.
    				documentElement.appendChild( el ).disabled = true;
    				if ( el.querySelectorAll( ":disabled" ).length !== 2 ) {
    					rbuggyQSA.push( ":enabled", ":disabled" );
    				}

    				// Support: IE 11+, Edge 15 - 18+
    				// IE 11/Edge don't find elements on a `[name='']` query in some cases.
    				// Adding a temporary attribute to the document before the selection works
    				// around the issue.
    				// Interestingly, IE 10 & older don't seem to have the issue.
    				input = document.createElement( "input" );
    				input.setAttribute( "name", "" );
    				el.appendChild( input );
    				if ( !el.querySelectorAll( "[name='']" ).length ) {
    					rbuggyQSA.push( "\\[" + whitespace + "*name" + whitespace + "*=" +
    						whitespace + "*(?:''|\"\")" );
    				}
    			} );

    			if ( !support.cssHas ) {

    				// Support: Chrome 105 - 110+, Safari 15.4 - 16.3+
    				// Our regular `try-catch` mechanism fails to detect natively-unsupported
    				// pseudo-classes inside `:has()` (such as `:has(:contains("Foo"))`)
    				// in browsers that parse the `:has()` argument as a forgiving selector list.
    				// https://drafts.csswg.org/selectors/#relational now requires the argument
    				// to be parsed unforgivingly, but browsers have not yet fully adjusted.
    				rbuggyQSA.push( ":has" );
    			}

    			rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join( "|" ) );

    			/* Sorting
    			---------------------------------------------------------------------- */

    			// Document order sorting
    			sortOrder = function( a, b ) {

    				// Flag for duplicate removal
    				if ( a === b ) {
    					hasDuplicate = true;
    					return 0;
    				}

    				// Sort on method existence if only one input has compareDocumentPosition
    				var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
    				if ( compare ) {
    					return compare;
    				}

    				// Calculate position if both inputs belong to the same document
    				// Support: IE 11+, Edge 17 - 18+
    				// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    				// two documents; shallow comparisons work.
    				// eslint-disable-next-line eqeqeq
    				compare = ( a.ownerDocument || a ) == ( b.ownerDocument || b ) ?
    					a.compareDocumentPosition( b ) :

    					// Otherwise we know they are disconnected
    					1;

    				// Disconnected nodes
    				if ( compare & 1 ||
    					( !support.sortDetached && b.compareDocumentPosition( a ) === compare ) ) {

    					// Choose the first element that is related to our preferred document
    					// Support: IE 11+, Edge 17 - 18+
    					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    					// two documents; shallow comparisons work.
    					// eslint-disable-next-line eqeqeq
    					if ( a === document || a.ownerDocument == preferredDoc &&
    						find.contains( preferredDoc, a ) ) {
    						return -1;
    					}

    					// Support: IE 11+, Edge 17 - 18+
    					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    					// two documents; shallow comparisons work.
    					// eslint-disable-next-line eqeqeq
    					if ( b === document || b.ownerDocument == preferredDoc &&
    						find.contains( preferredDoc, b ) ) {
    						return 1;
    					}

    					// Maintain original order
    					return sortInput ?
    						( indexOf.call( sortInput, a ) - indexOf.call( sortInput, b ) ) :
    						0;
    				}

    				return compare & 4 ? -1 : 1;
    			};

    			return document;
    		}

    		find.matches = function( expr, elements ) {
    			return find( expr, null, null, elements );
    		};

    		find.matchesSelector = function( elem, expr ) {
    			setDocument( elem );

    			if ( documentIsHTML &&
    				!nonnativeSelectorCache[ expr + " " ] &&
    				( !rbuggyQSA || !rbuggyQSA.test( expr ) ) ) {

    				try {
    					var ret = matches.call( elem, expr );

    					// IE 9's matchesSelector returns false on disconnected nodes
    					if ( ret || support.disconnectedMatch ||

    							// As well, disconnected nodes are said to be in a document
    							// fragment in IE 9
    							elem.document && elem.document.nodeType !== 11 ) {
    						return ret;
    					}
    				} catch ( e ) {
    					nonnativeSelectorCache( expr, true );
    				}
    			}

    			return find( expr, document, null, [ elem ] ).length > 0;
    		};

    		find.contains = function( context, elem ) {

    			// Set document vars if needed
    			// Support: IE 11+, Edge 17 - 18+
    			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    			// two documents; shallow comparisons work.
    			// eslint-disable-next-line eqeqeq
    			if ( ( context.ownerDocument || context ) != document ) {
    				setDocument( context );
    			}
    			return jQuery.contains( context, elem );
    		};


    		find.attr = function( elem, name ) {

    			// Set document vars if needed
    			// Support: IE 11+, Edge 17 - 18+
    			// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    			// two documents; shallow comparisons work.
    			// eslint-disable-next-line eqeqeq
    			if ( ( elem.ownerDocument || elem ) != document ) {
    				setDocument( elem );
    			}

    			var fn = Expr.attrHandle[ name.toLowerCase() ],

    				// Don't get fooled by Object.prototype properties (see trac-13807)
    				val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
    					fn( elem, name, !documentIsHTML ) :
    					undefined;

    			if ( val !== undefined ) {
    				return val;
    			}

    			return elem.getAttribute( name );
    		};

    		find.error = function( msg ) {
    			throw new Error( "Syntax error, unrecognized expression: " + msg );
    		};

    		/**
    		 * Document sorting and removing duplicates
    		 * @param {ArrayLike} results
    		 */
    		jQuery.uniqueSort = function( results ) {
    			var elem,
    				duplicates = [],
    				j = 0,
    				i = 0;

    			// Unless we *know* we can detect duplicates, assume their presence
    			//
    			// Support: Android <=4.0+
    			// Testing for detecting duplicates is unpredictable so instead assume we can't
    			// depend on duplicate detection in all browsers without a stable sort.
    			hasDuplicate = !support.sortStable;
    			sortInput = !support.sortStable && slice.call( results, 0 );
    			sort.call( results, sortOrder );

    			if ( hasDuplicate ) {
    				while ( ( elem = results[ i++ ] ) ) {
    					if ( elem === results[ i ] ) {
    						j = duplicates.push( i );
    					}
    				}
    				while ( j-- ) {
    					splice.call( results, duplicates[ j ], 1 );
    				}
    			}

    			// Clear input after sorting to release objects
    			// See https://github.com/jquery/sizzle/pull/225
    			sortInput = null;

    			return results;
    		};

    		jQuery.fn.uniqueSort = function() {
    			return this.pushStack( jQuery.uniqueSort( slice.apply( this ) ) );
    		};

    		Expr = jQuery.expr = {

    			// Can be adjusted by the user
    			cacheLength: 50,

    			createPseudo: markFunction,

    			match: matchExpr,

    			attrHandle: {},

    			find: {},

    			relative: {
    				">": { dir: "parentNode", first: true },
    				" ": { dir: "parentNode" },
    				"+": { dir: "previousSibling", first: true },
    				"~": { dir: "previousSibling" }
    			},

    			preFilter: {
    				ATTR: function( match ) {
    					match[ 1 ] = match[ 1 ].replace( runescape, funescape );

    					// Move the given value to match[3] whether quoted or unquoted
    					match[ 3 ] = ( match[ 3 ] || match[ 4 ] || match[ 5 ] || "" )
    						.replace( runescape, funescape );

    					if ( match[ 2 ] === "~=" ) {
    						match[ 3 ] = " " + match[ 3 ] + " ";
    					}

    					return match.slice( 0, 4 );
    				},

    				CHILD: function( match ) {

    					/* matches from matchExpr["CHILD"]
    						1 type (only|nth|...)
    						2 what (child|of-type)
    						3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
    						4 xn-component of xn+y argument ([+-]?\d*n|)
    						5 sign of xn-component
    						6 x of xn-component
    						7 sign of y-component
    						8 y of y-component
    					*/
    					match[ 1 ] = match[ 1 ].toLowerCase();

    					if ( match[ 1 ].slice( 0, 3 ) === "nth" ) {

    						// nth-* requires argument
    						if ( !match[ 3 ] ) {
    							find.error( match[ 0 ] );
    						}

    						// numeric x and y parameters for Expr.filter.CHILD
    						// remember that false/true cast respectively to 0/1
    						match[ 4 ] = +( match[ 4 ] ?
    							match[ 5 ] + ( match[ 6 ] || 1 ) :
    							2 * ( match[ 3 ] === "even" || match[ 3 ] === "odd" )
    						);
    						match[ 5 ] = +( ( match[ 7 ] + match[ 8 ] ) || match[ 3 ] === "odd" );

    					// other types prohibit arguments
    					} else if ( match[ 3 ] ) {
    						find.error( match[ 0 ] );
    					}

    					return match;
    				},

    				PSEUDO: function( match ) {
    					var excess,
    						unquoted = !match[ 6 ] && match[ 2 ];

    					if ( matchExpr.CHILD.test( match[ 0 ] ) ) {
    						return null;
    					}

    					// Accept quoted arguments as-is
    					if ( match[ 3 ] ) {
    						match[ 2 ] = match[ 4 ] || match[ 5 ] || "";

    					// Strip excess characters from unquoted arguments
    					} else if ( unquoted && rpseudo.test( unquoted ) &&

    						// Get excess from tokenize (recursively)
    						( excess = tokenize( unquoted, true ) ) &&

    						// advance to the next closing parenthesis
    						( excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length ) ) {

    						// excess is a negative index
    						match[ 0 ] = match[ 0 ].slice( 0, excess );
    						match[ 2 ] = unquoted.slice( 0, excess );
    					}

    					// Return only captures needed by the pseudo filter method (type and argument)
    					return match.slice( 0, 3 );
    				}
    			},

    			filter: {

    				TAG: function( nodeNameSelector ) {
    					var expectedNodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
    					return nodeNameSelector === "*" ?
    						function() {
    							return true;
    						} :
    						function( elem ) {
    							return nodeName( elem, expectedNodeName );
    						};
    				},

    				CLASS: function( className ) {
    					var pattern = classCache[ className + " " ];

    					return pattern ||
    						( pattern = new RegExp( "(^|" + whitespace + ")" + className +
    							"(" + whitespace + "|$)" ) ) &&
    						classCache( className, function( elem ) {
    							return pattern.test(
    								typeof elem.className === "string" && elem.className ||
    									typeof elem.getAttribute !== "undefined" &&
    										elem.getAttribute( "class" ) ||
    									""
    							);
    						} );
    				},

    				ATTR: function( name, operator, check ) {
    					return function( elem ) {
    						var result = find.attr( elem, name );

    						if ( result == null ) {
    							return operator === "!=";
    						}
    						if ( !operator ) {
    							return true;
    						}

    						result += "";

    						if ( operator === "=" ) {
    							return result === check;
    						}
    						if ( operator === "!=" ) {
    							return result !== check;
    						}
    						if ( operator === "^=" ) {
    							return check && result.indexOf( check ) === 0;
    						}
    						if ( operator === "*=" ) {
    							return check && result.indexOf( check ) > -1;
    						}
    						if ( operator === "$=" ) {
    							return check && result.slice( -check.length ) === check;
    						}
    						if ( operator === "~=" ) {
    							return ( " " + result.replace( rwhitespace, " " ) + " " )
    								.indexOf( check ) > -1;
    						}
    						if ( operator === "|=" ) {
    							return result === check || result.slice( 0, check.length + 1 ) === check + "-";
    						}

    						return false;
    					};
    				},

    				CHILD: function( type, what, _argument, first, last ) {
    					var simple = type.slice( 0, 3 ) !== "nth",
    						forward = type.slice( -4 ) !== "last",
    						ofType = what === "of-type";

    					return first === 1 && last === 0 ?

    						// Shortcut for :nth-*(n)
    						function( elem ) {
    							return !!elem.parentNode;
    						} :

    						function( elem, _context, xml ) {
    							var cache, outerCache, node, nodeIndex, start,
    								dir = simple !== forward ? "nextSibling" : "previousSibling",
    								parent = elem.parentNode,
    								name = ofType && elem.nodeName.toLowerCase(),
    								useCache = !xml && !ofType,
    								diff = false;

    							if ( parent ) {

    								// :(first|last|only)-(child|of-type)
    								if ( simple ) {
    									while ( dir ) {
    										node = elem;
    										while ( ( node = node[ dir ] ) ) {
    											if ( ofType ?
    												nodeName( node, name ) :
    												node.nodeType === 1 ) {

    												return false;
    											}
    										}

    										// Reverse direction for :only-* (if we haven't yet done so)
    										start = dir = type === "only" && !start && "nextSibling";
    									}
    									return true;
    								}

    								start = [ forward ? parent.firstChild : parent.lastChild ];

    								// non-xml :nth-child(...) stores cache data on `parent`
    								if ( forward && useCache ) {

    									// Seek `elem` from a previously-cached index
    									outerCache = parent[ expando ] || ( parent[ expando ] = {} );
    									cache = outerCache[ type ] || [];
    									nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
    									diff = nodeIndex && cache[ 2 ];
    									node = nodeIndex && parent.childNodes[ nodeIndex ];

    									while ( ( node = ++nodeIndex && node && node[ dir ] ||

    										// Fallback to seeking `elem` from the start
    										( diff = nodeIndex = 0 ) || start.pop() ) ) {

    										// When found, cache indexes on `parent` and break
    										if ( node.nodeType === 1 && ++diff && node === elem ) {
    											outerCache[ type ] = [ dirruns, nodeIndex, diff ];
    											break;
    										}
    									}

    								} else {

    									// Use previously-cached element index if available
    									if ( useCache ) {
    										outerCache = elem[ expando ] || ( elem[ expando ] = {} );
    										cache = outerCache[ type ] || [];
    										nodeIndex = cache[ 0 ] === dirruns && cache[ 1 ];
    										diff = nodeIndex;
    									}

    									// xml :nth-child(...)
    									// or :nth-last-child(...) or :nth(-last)?-of-type(...)
    									if ( diff === false ) {

    										// Use the same loop as above to seek `elem` from the start
    										while ( ( node = ++nodeIndex && node && node[ dir ] ||
    											( diff = nodeIndex = 0 ) || start.pop() ) ) {

    											if ( ( ofType ?
    												nodeName( node, name ) :
    												node.nodeType === 1 ) &&
    												++diff ) {

    												// Cache the index of each encountered element
    												if ( useCache ) {
    													outerCache = node[ expando ] ||
    														( node[ expando ] = {} );
    													outerCache[ type ] = [ dirruns, diff ];
    												}

    												if ( node === elem ) {
    													break;
    												}
    											}
    										}
    									}
    								}

    								// Incorporate the offset, then check against cycle size
    								diff -= last;
    								return diff === first || ( diff % first === 0 && diff / first >= 0 );
    							}
    						};
    				},

    				PSEUDO: function( pseudo, argument ) {

    					// pseudo-class names are case-insensitive
    					// https://www.w3.org/TR/selectors/#pseudo-classes
    					// Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
    					// Remember that setFilters inherits from pseudos
    					var args,
    						fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
    							find.error( "unsupported pseudo: " + pseudo );

    					// The user may use createPseudo to indicate that
    					// arguments are needed to create the filter function
    					// just as jQuery does
    					if ( fn[ expando ] ) {
    						return fn( argument );
    					}

    					// But maintain support for old signatures
    					if ( fn.length > 1 ) {
    						args = [ pseudo, pseudo, "", argument ];
    						return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
    							markFunction( function( seed, matches ) {
    								var idx,
    									matched = fn( seed, argument ),
    									i = matched.length;
    								while ( i-- ) {
    									idx = indexOf.call( seed, matched[ i ] );
    									seed[ idx ] = !( matches[ idx ] = matched[ i ] );
    								}
    							} ) :
    							function( elem ) {
    								return fn( elem, 0, args );
    							};
    					}

    					return fn;
    				}
    			},

    			pseudos: {

    				// Potentially complex pseudos
    				not: markFunction( function( selector ) {

    					// Trim the selector passed to compile
    					// to avoid treating leading and trailing
    					// spaces as combinators
    					var input = [],
    						results = [],
    						matcher = compile( selector.replace( rtrimCSS, "$1" ) );

    					return matcher[ expando ] ?
    						markFunction( function( seed, matches, _context, xml ) {
    							var elem,
    								unmatched = matcher( seed, null, xml, [] ),
    								i = seed.length;

    							// Match elements unmatched by `matcher`
    							while ( i-- ) {
    								if ( ( elem = unmatched[ i ] ) ) {
    									seed[ i ] = !( matches[ i ] = elem );
    								}
    							}
    						} ) :
    						function( elem, _context, xml ) {
    							input[ 0 ] = elem;
    							matcher( input, null, xml, results );

    							// Don't keep the element
    							// (see https://github.com/jquery/sizzle/issues/299)
    							input[ 0 ] = null;
    							return !results.pop();
    						};
    				} ),

    				has: markFunction( function( selector ) {
    					return function( elem ) {
    						return find( selector, elem ).length > 0;
    					};
    				} ),

    				contains: markFunction( function( text ) {
    					text = text.replace( runescape, funescape );
    					return function( elem ) {
    						return ( elem.textContent || jQuery.text( elem ) ).indexOf( text ) > -1;
    					};
    				} ),

    				// "Whether an element is represented by a :lang() selector
    				// is based solely on the element's language value
    				// being equal to the identifier C,
    				// or beginning with the identifier C immediately followed by "-".
    				// The matching of C against the element's language value is performed case-insensitively.
    				// The identifier C does not have to be a valid language name."
    				// https://www.w3.org/TR/selectors/#lang-pseudo
    				lang: markFunction( function( lang ) {

    					// lang value must be a valid identifier
    					if ( !ridentifier.test( lang || "" ) ) {
    						find.error( "unsupported lang: " + lang );
    					}
    					lang = lang.replace( runescape, funescape ).toLowerCase();
    					return function( elem ) {
    						var elemLang;
    						do {
    							if ( ( elemLang = documentIsHTML ?
    								elem.lang :
    								elem.getAttribute( "xml:lang" ) || elem.getAttribute( "lang" ) ) ) {

    								elemLang = elemLang.toLowerCase();
    								return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
    							}
    						} while ( ( elem = elem.parentNode ) && elem.nodeType === 1 );
    						return false;
    					};
    				} ),

    				// Miscellaneous
    				target: function( elem ) {
    					var hash = window.location && window.location.hash;
    					return hash && hash.slice( 1 ) === elem.id;
    				},

    				root: function( elem ) {
    					return elem === documentElement;
    				},

    				focus: function( elem ) {
    					return elem === safeActiveElement() &&
    						document.hasFocus() &&
    						!!( elem.type || elem.href || ~elem.tabIndex );
    				},

    				// Boolean properties
    				enabled: createDisabledPseudo( false ),
    				disabled: createDisabledPseudo( true ),

    				checked: function( elem ) {

    					// In CSS3, :checked should return both checked and selected elements
    					// https://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
    					return ( nodeName( elem, "input" ) && !!elem.checked ) ||
    						( nodeName( elem, "option" ) && !!elem.selected );
    				},

    				selected: function( elem ) {

    					// Support: IE <=11+
    					// Accessing the selectedIndex property
    					// forces the browser to treat the default option as
    					// selected when in an optgroup.
    					if ( elem.parentNode ) {
    						// eslint-disable-next-line no-unused-expressions
    						elem.parentNode.selectedIndex;
    					}

    					return elem.selected === true;
    				},

    				// Contents
    				empty: function( elem ) {

    					// https://www.w3.org/TR/selectors/#empty-pseudo
    					// :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
    					//   but not by others (comment: 8; processing instruction: 7; etc.)
    					// nodeType < 6 works because attributes (2) do not appear as children
    					for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
    						if ( elem.nodeType < 6 ) {
    							return false;
    						}
    					}
    					return true;
    				},

    				parent: function( elem ) {
    					return !Expr.pseudos.empty( elem );
    				},

    				// Element/input types
    				header: function( elem ) {
    					return rheader.test( elem.nodeName );
    				},

    				input: function( elem ) {
    					return rinputs.test( elem.nodeName );
    				},

    				button: function( elem ) {
    					return nodeName( elem, "input" ) && elem.type === "button" ||
    						nodeName( elem, "button" );
    				},

    				text: function( elem ) {
    					var attr;
    					return nodeName( elem, "input" ) && elem.type === "text" &&

    						// Support: IE <10 only
    						// New HTML5 attribute values (e.g., "search") appear
    						// with elem.type === "text"
    						( ( attr = elem.getAttribute( "type" ) ) == null ||
    							attr.toLowerCase() === "text" );
    				},

    				// Position-in-collection
    				first: createPositionalPseudo( function() {
    					return [ 0 ];
    				} ),

    				last: createPositionalPseudo( function( _matchIndexes, length ) {
    					return [ length - 1 ];
    				} ),

    				eq: createPositionalPseudo( function( _matchIndexes, length, argument ) {
    					return [ argument < 0 ? argument + length : argument ];
    				} ),

    				even: createPositionalPseudo( function( matchIndexes, length ) {
    					var i = 0;
    					for ( ; i < length; i += 2 ) {
    						matchIndexes.push( i );
    					}
    					return matchIndexes;
    				} ),

    				odd: createPositionalPseudo( function( matchIndexes, length ) {
    					var i = 1;
    					for ( ; i < length; i += 2 ) {
    						matchIndexes.push( i );
    					}
    					return matchIndexes;
    				} ),

    				lt: createPositionalPseudo( function( matchIndexes, length, argument ) {
    					var i;

    					if ( argument < 0 ) {
    						i = argument + length;
    					} else if ( argument > length ) {
    						i = length;
    					} else {
    						i = argument;
    					}

    					for ( ; --i >= 0; ) {
    						matchIndexes.push( i );
    					}
    					return matchIndexes;
    				} ),

    				gt: createPositionalPseudo( function( matchIndexes, length, argument ) {
    					var i = argument < 0 ? argument + length : argument;
    					for ( ; ++i < length; ) {
    						matchIndexes.push( i );
    					}
    					return matchIndexes;
    				} )
    			}
    		};

    		Expr.pseudos.nth = Expr.pseudos.eq;

    		// Add button/input type pseudos
    		for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
    			Expr.pseudos[ i ] = createInputPseudo( i );
    		}
    		for ( i in { submit: true, reset: true } ) {
    			Expr.pseudos[ i ] = createButtonPseudo( i );
    		}

    		// Easy API for creating new setFilters
    		function setFilters() {}
    		setFilters.prototype = Expr.filters = Expr.pseudos;
    		Expr.setFilters = new setFilters();

    		function tokenize( selector, parseOnly ) {
    			var matched, match, tokens, type,
    				soFar, groups, preFilters,
    				cached = tokenCache[ selector + " " ];

    			if ( cached ) {
    				return parseOnly ? 0 : cached.slice( 0 );
    			}

    			soFar = selector;
    			groups = [];
    			preFilters = Expr.preFilter;

    			while ( soFar ) {

    				// Comma and first run
    				if ( !matched || ( match = rcomma.exec( soFar ) ) ) {
    					if ( match ) {

    						// Don't consume trailing commas as valid
    						soFar = soFar.slice( match[ 0 ].length ) || soFar;
    					}
    					groups.push( ( tokens = [] ) );
    				}

    				matched = false;

    				// Combinators
    				if ( ( match = rleadingCombinator.exec( soFar ) ) ) {
    					matched = match.shift();
    					tokens.push( {
    						value: matched,

    						// Cast descendant combinators to space
    						type: match[ 0 ].replace( rtrimCSS, " " )
    					} );
    					soFar = soFar.slice( matched.length );
    				}

    				// Filters
    				for ( type in Expr.filter ) {
    					if ( ( match = matchExpr[ type ].exec( soFar ) ) && ( !preFilters[ type ] ||
    						( match = preFilters[ type ]( match ) ) ) ) {
    						matched = match.shift();
    						tokens.push( {
    							value: matched,
    							type: type,
    							matches: match
    						} );
    						soFar = soFar.slice( matched.length );
    					}
    				}

    				if ( !matched ) {
    					break;
    				}
    			}

    			// Return the length of the invalid excess
    			// if we're just parsing
    			// Otherwise, throw an error or return tokens
    			if ( parseOnly ) {
    				return soFar.length;
    			}

    			return soFar ?
    				find.error( selector ) :

    				// Cache the tokens
    				tokenCache( selector, groups ).slice( 0 );
    		}

    		function toSelector( tokens ) {
    			var i = 0,
    				len = tokens.length,
    				selector = "";
    			for ( ; i < len; i++ ) {
    				selector += tokens[ i ].value;
    			}
    			return selector;
    		}

    		function addCombinator( matcher, combinator, base ) {
    			var dir = combinator.dir,
    				skip = combinator.next,
    				key = skip || dir,
    				checkNonElements = base && key === "parentNode",
    				doneName = done++;

    			return combinator.first ?

    				// Check against closest ancestor/preceding element
    				function( elem, context, xml ) {
    					while ( ( elem = elem[ dir ] ) ) {
    						if ( elem.nodeType === 1 || checkNonElements ) {
    							return matcher( elem, context, xml );
    						}
    					}
    					return false;
    				} :

    				// Check against all ancestor/preceding elements
    				function( elem, context, xml ) {
    					var oldCache, outerCache,
    						newCache = [ dirruns, doneName ];

    					// We can't set arbitrary data on XML nodes, so they don't benefit from combinator caching
    					if ( xml ) {
    						while ( ( elem = elem[ dir ] ) ) {
    							if ( elem.nodeType === 1 || checkNonElements ) {
    								if ( matcher( elem, context, xml ) ) {
    									return true;
    								}
    							}
    						}
    					} else {
    						while ( ( elem = elem[ dir ] ) ) {
    							if ( elem.nodeType === 1 || checkNonElements ) {
    								outerCache = elem[ expando ] || ( elem[ expando ] = {} );

    								if ( skip && nodeName( elem, skip ) ) {
    									elem = elem[ dir ] || elem;
    								} else if ( ( oldCache = outerCache[ key ] ) &&
    									oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

    									// Assign to newCache so results back-propagate to previous elements
    									return ( newCache[ 2 ] = oldCache[ 2 ] );
    								} else {

    									// Reuse newcache so results back-propagate to previous elements
    									outerCache[ key ] = newCache;

    									// A match means we're done; a fail means we have to keep checking
    									if ( ( newCache[ 2 ] = matcher( elem, context, xml ) ) ) {
    										return true;
    									}
    								}
    							}
    						}
    					}
    					return false;
    				};
    		}

    		function elementMatcher( matchers ) {
    			return matchers.length > 1 ?
    				function( elem, context, xml ) {
    					var i = matchers.length;
    					while ( i-- ) {
    						if ( !matchers[ i ]( elem, context, xml ) ) {
    							return false;
    						}
    					}
    					return true;
    				} :
    				matchers[ 0 ];
    		}

    		function multipleContexts( selector, contexts, results ) {
    			var i = 0,
    				len = contexts.length;
    			for ( ; i < len; i++ ) {
    				find( selector, contexts[ i ], results );
    			}
    			return results;
    		}

    		function condense( unmatched, map, filter, context, xml ) {
    			var elem,
    				newUnmatched = [],
    				i = 0,
    				len = unmatched.length,
    				mapped = map != null;

    			for ( ; i < len; i++ ) {
    				if ( ( elem = unmatched[ i ] ) ) {
    					if ( !filter || filter( elem, context, xml ) ) {
    						newUnmatched.push( elem );
    						if ( mapped ) {
    							map.push( i );
    						}
    					}
    				}
    			}

    			return newUnmatched;
    		}

    		function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
    			if ( postFilter && !postFilter[ expando ] ) {
    				postFilter = setMatcher( postFilter );
    			}
    			if ( postFinder && !postFinder[ expando ] ) {
    				postFinder = setMatcher( postFinder, postSelector );
    			}
    			return markFunction( function( seed, results, context, xml ) {
    				var temp, i, elem, matcherOut,
    					preMap = [],
    					postMap = [],
    					preexisting = results.length,

    					// Get initial elements from seed or context
    					elems = seed ||
    						multipleContexts( selector || "*",
    							context.nodeType ? [ context ] : context, [] ),

    					// Prefilter to get matcher input, preserving a map for seed-results synchronization
    					matcherIn = preFilter && ( seed || !selector ) ?
    						condense( elems, preMap, preFilter, context, xml ) :
    						elems;

    				if ( matcher ) {

    					// If we have a postFinder, or filtered seed, or non-seed postFilter
    					// or preexisting results,
    					matcherOut = postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

    						// ...intermediate processing is necessary
    						[] :

    						// ...otherwise use results directly
    						results;

    					// Find primary matches
    					matcher( matcherIn, matcherOut, context, xml );
    				} else {
    					matcherOut = matcherIn;
    				}

    				// Apply postFilter
    				if ( postFilter ) {
    					temp = condense( matcherOut, postMap );
    					postFilter( temp, [], context, xml );

    					// Un-match failing elements by moving them back to matcherIn
    					i = temp.length;
    					while ( i-- ) {
    						if ( ( elem = temp[ i ] ) ) {
    							matcherOut[ postMap[ i ] ] = !( matcherIn[ postMap[ i ] ] = elem );
    						}
    					}
    				}

    				if ( seed ) {
    					if ( postFinder || preFilter ) {
    						if ( postFinder ) {

    							// Get the final matcherOut by condensing this intermediate into postFinder contexts
    							temp = [];
    							i = matcherOut.length;
    							while ( i-- ) {
    								if ( ( elem = matcherOut[ i ] ) ) {

    									// Restore matcherIn since elem is not yet a final match
    									temp.push( ( matcherIn[ i ] = elem ) );
    								}
    							}
    							postFinder( null, ( matcherOut = [] ), temp, xml );
    						}

    						// Move matched elements from seed to results to keep them synchronized
    						i = matcherOut.length;
    						while ( i-- ) {
    							if ( ( elem = matcherOut[ i ] ) &&
    								( temp = postFinder ? indexOf.call( seed, elem ) : preMap[ i ] ) > -1 ) {

    								seed[ temp ] = !( results[ temp ] = elem );
    							}
    						}
    					}

    				// Add elements to results, through postFinder if defined
    				} else {
    					matcherOut = condense(
    						matcherOut === results ?
    							matcherOut.splice( preexisting, matcherOut.length ) :
    							matcherOut
    					);
    					if ( postFinder ) {
    						postFinder( null, results, matcherOut, xml );
    					} else {
    						push.apply( results, matcherOut );
    					}
    				}
    			} );
    		}

    		function matcherFromTokens( tokens ) {
    			var checkContext, matcher, j,
    				len = tokens.length,
    				leadingRelative = Expr.relative[ tokens[ 0 ].type ],
    				implicitRelative = leadingRelative || Expr.relative[ " " ],
    				i = leadingRelative ? 1 : 0,

    				// The foundational matcher ensures that elements are reachable from top-level context(s)
    				matchContext = addCombinator( function( elem ) {
    					return elem === checkContext;
    				}, implicitRelative, true ),
    				matchAnyContext = addCombinator( function( elem ) {
    					return indexOf.call( checkContext, elem ) > -1;
    				}, implicitRelative, true ),
    				matchers = [ function( elem, context, xml ) {

    					// Support: IE 11+, Edge 17 - 18+
    					// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    					// two documents; shallow comparisons work.
    					// eslint-disable-next-line eqeqeq
    					var ret = ( !leadingRelative && ( xml || context != outermostContext ) ) || (
    						( checkContext = context ).nodeType ?
    							matchContext( elem, context, xml ) :
    							matchAnyContext( elem, context, xml ) );

    					// Avoid hanging onto element
    					// (see https://github.com/jquery/sizzle/issues/299)
    					checkContext = null;
    					return ret;
    				} ];

    			for ( ; i < len; i++ ) {
    				if ( ( matcher = Expr.relative[ tokens[ i ].type ] ) ) {
    					matchers = [ addCombinator( elementMatcher( matchers ), matcher ) ];
    				} else {
    					matcher = Expr.filter[ tokens[ i ].type ].apply( null, tokens[ i ].matches );

    					// Return special upon seeing a positional matcher
    					if ( matcher[ expando ] ) {

    						// Find the next relative operator (if any) for proper handling
    						j = ++i;
    						for ( ; j < len; j++ ) {
    							if ( Expr.relative[ tokens[ j ].type ] ) {
    								break;
    							}
    						}
    						return setMatcher(
    							i > 1 && elementMatcher( matchers ),
    							i > 1 && toSelector(

    								// If the preceding token was a descendant combinator, insert an implicit any-element `*`
    								tokens.slice( 0, i - 1 )
    									.concat( { value: tokens[ i - 2 ].type === " " ? "*" : "" } )
    							).replace( rtrimCSS, "$1" ),
    							matcher,
    							i < j && matcherFromTokens( tokens.slice( i, j ) ),
    							j < len && matcherFromTokens( ( tokens = tokens.slice( j ) ) ),
    							j < len && toSelector( tokens )
    						);
    					}
    					matchers.push( matcher );
    				}
    			}

    			return elementMatcher( matchers );
    		}

    		function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
    			var bySet = setMatchers.length > 0,
    				byElement = elementMatchers.length > 0,
    				superMatcher = function( seed, context, xml, results, outermost ) {
    					var elem, j, matcher,
    						matchedCount = 0,
    						i = "0",
    						unmatched = seed && [],
    						setMatched = [],
    						contextBackup = outermostContext,

    						// We must always have either seed elements or outermost context
    						elems = seed || byElement && Expr.find.TAG( "*", outermost ),

    						// Use integer dirruns iff this is the outermost matcher
    						dirrunsUnique = ( dirruns += contextBackup == null ? 1 : Math.random() || 0.1 ),
    						len = elems.length;

    					if ( outermost ) {

    						// Support: IE 11+, Edge 17 - 18+
    						// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    						// two documents; shallow comparisons work.
    						// eslint-disable-next-line eqeqeq
    						outermostContext = context == document || context || outermost;
    					}

    					// Add elements passing elementMatchers directly to results
    					// Support: iOS <=7 - 9 only
    					// Tolerate NodeList properties (IE: "length"; Safari: <number>) matching
    					// elements by id. (see trac-14142)
    					for ( ; i !== len && ( elem = elems[ i ] ) != null; i++ ) {
    						if ( byElement && elem ) {
    							j = 0;

    							// Support: IE 11+, Edge 17 - 18+
    							// IE/Edge sometimes throw a "Permission denied" error when strict-comparing
    							// two documents; shallow comparisons work.
    							// eslint-disable-next-line eqeqeq
    							if ( !context && elem.ownerDocument != document ) {
    								setDocument( elem );
    								xml = !documentIsHTML;
    							}
    							while ( ( matcher = elementMatchers[ j++ ] ) ) {
    								if ( matcher( elem, context || document, xml ) ) {
    									push.call( results, elem );
    									break;
    								}
    							}
    							if ( outermost ) {
    								dirruns = dirrunsUnique;
    							}
    						}

    						// Track unmatched elements for set filters
    						if ( bySet ) {

    							// They will have gone through all possible matchers
    							if ( ( elem = !matcher && elem ) ) {
    								matchedCount--;
    							}

    							// Lengthen the array for every element, matched or not
    							if ( seed ) {
    								unmatched.push( elem );
    							}
    						}
    					}

    					// `i` is now the count of elements visited above, and adding it to `matchedCount`
    					// makes the latter nonnegative.
    					matchedCount += i;

    					// Apply set filters to unmatched elements
    					// NOTE: This can be skipped if there are no unmatched elements (i.e., `matchedCount`
    					// equals `i`), unless we didn't visit _any_ elements in the above loop because we have
    					// no element matchers and no seed.
    					// Incrementing an initially-string "0" `i` allows `i` to remain a string only in that
    					// case, which will result in a "00" `matchedCount` that differs from `i` but is also
    					// numerically zero.
    					if ( bySet && i !== matchedCount ) {
    						j = 0;
    						while ( ( matcher = setMatchers[ j++ ] ) ) {
    							matcher( unmatched, setMatched, context, xml );
    						}

    						if ( seed ) {

    							// Reintegrate element matches to eliminate the need for sorting
    							if ( matchedCount > 0 ) {
    								while ( i-- ) {
    									if ( !( unmatched[ i ] || setMatched[ i ] ) ) {
    										setMatched[ i ] = pop.call( results );
    									}
    								}
    							}

    							// Discard index placeholder values to get only actual matches
    							setMatched = condense( setMatched );
    						}

    						// Add matches to results
    						push.apply( results, setMatched );

    						// Seedless set matches succeeding multiple successful matchers stipulate sorting
    						if ( outermost && !seed && setMatched.length > 0 &&
    							( matchedCount + setMatchers.length ) > 1 ) {

    							jQuery.uniqueSort( results );
    						}
    					}

    					// Override manipulation of globals by nested matchers
    					if ( outermost ) {
    						dirruns = dirrunsUnique;
    						outermostContext = contextBackup;
    					}

    					return unmatched;
    				};

    			return bySet ?
    				markFunction( superMatcher ) :
    				superMatcher;
    		}

    		function compile( selector, match /* Internal Use Only */ ) {
    			var i,
    				setMatchers = [],
    				elementMatchers = [],
    				cached = compilerCache[ selector + " " ];

    			if ( !cached ) {

    				// Generate a function of recursive functions that can be used to check each element
    				if ( !match ) {
    					match = tokenize( selector );
    				}
    				i = match.length;
    				while ( i-- ) {
    					cached = matcherFromTokens( match[ i ] );
    					if ( cached[ expando ] ) {
    						setMatchers.push( cached );
    					} else {
    						elementMatchers.push( cached );
    					}
    				}

    				// Cache the compiled function
    				cached = compilerCache( selector,
    					matcherFromGroupMatchers( elementMatchers, setMatchers ) );

    				// Save selector and tokenization
    				cached.selector = selector;
    			}
    			return cached;
    		}

    		/**
    		 * A low-level selection function that works with jQuery's compiled
    		 *  selector functions
    		 * @param {String|Function} selector A selector or a pre-compiled
    		 *  selector function built with jQuery selector compile
    		 * @param {Element} context
    		 * @param {Array} [results]
    		 * @param {Array} [seed] A set of elements to match against
    		 */
    		function select( selector, context, results, seed ) {
    			var i, tokens, token, type, find,
    				compiled = typeof selector === "function" && selector,
    				match = !seed && tokenize( ( selector = compiled.selector || selector ) );

    			results = results || [];

    			// Try to minimize operations if there is only one selector in the list and no seed
    			// (the latter of which guarantees us context)
    			if ( match.length === 1 ) {

    				// Reduce context if the leading compound selector is an ID
    				tokens = match[ 0 ] = match[ 0 ].slice( 0 );
    				if ( tokens.length > 2 && ( token = tokens[ 0 ] ).type === "ID" &&
    						context.nodeType === 9 && documentIsHTML && Expr.relative[ tokens[ 1 ].type ] ) {

    					context = ( Expr.find.ID(
    						token.matches[ 0 ].replace( runescape, funescape ),
    						context
    					) || [] )[ 0 ];
    					if ( !context ) {
    						return results;

    					// Precompiled matchers will still verify ancestry, so step up a level
    					} else if ( compiled ) {
    						context = context.parentNode;
    					}

    					selector = selector.slice( tokens.shift().value.length );
    				}

    				// Fetch a seed set for right-to-left matching
    				i = matchExpr.needsContext.test( selector ) ? 0 : tokens.length;
    				while ( i-- ) {
    					token = tokens[ i ];

    					// Abort if we hit a combinator
    					if ( Expr.relative[ ( type = token.type ) ] ) {
    						break;
    					}
    					if ( ( find = Expr.find[ type ] ) ) {

    						// Search, expanding context for leading sibling combinators
    						if ( ( seed = find(
    							token.matches[ 0 ].replace( runescape, funescape ),
    							rsibling.test( tokens[ 0 ].type ) &&
    								testContext( context.parentNode ) || context
    						) ) ) {

    							// If seed is empty or no tokens remain, we can return early
    							tokens.splice( i, 1 );
    							selector = seed.length && toSelector( tokens );
    							if ( !selector ) {
    								push.apply( results, seed );
    								return results;
    							}

    							break;
    						}
    					}
    				}
    			}

    			// Compile and execute a filtering function if one is not provided
    			// Provide `match` to avoid retokenization if we modified the selector above
    			( compiled || compile( selector, match ) )(
    				seed,
    				context,
    				!documentIsHTML,
    				results,
    				!context || rsibling.test( selector ) && testContext( context.parentNode ) || context
    			);
    			return results;
    		}

    		// One-time assignments

    		// Support: Android <=4.0 - 4.1+
    		// Sort stability
    		support.sortStable = expando.split( "" ).sort( sortOrder ).join( "" ) === expando;

    		// Initialize against the default document
    		setDocument();

    		// Support: Android <=4.0 - 4.1+
    		// Detached nodes confoundingly follow *each other*
    		support.sortDetached = assert( function( el ) {

    			// Should return 1, but returns 4 (following)
    			return el.compareDocumentPosition( document.createElement( "fieldset" ) ) & 1;
    		} );

    		jQuery.find = find;

    		// Deprecated
    		jQuery.expr[ ":" ] = jQuery.expr.pseudos;
    		jQuery.unique = jQuery.uniqueSort;

    		// These have always been private, but they used to be documented as part of
    		// Sizzle so let's maintain them for now for backwards compatibility purposes.
    		find.compile = compile;
    		find.select = select;
    		find.setDocument = setDocument;
    		find.tokenize = tokenize;

    		find.escape = jQuery.escapeSelector;
    		find.getText = jQuery.text;
    		find.isXML = jQuery.isXMLDoc;
    		find.selectors = jQuery.expr;
    		find.support = jQuery.support;
    		find.uniqueSort = jQuery.uniqueSort;

    			/* eslint-enable */

    		} )();


    		var dir = function( elem, dir, until ) {
    			var matched = [],
    				truncate = until !== undefined;

    			while ( ( elem = elem[ dir ] ) && elem.nodeType !== 9 ) {
    				if ( elem.nodeType === 1 ) {
    					if ( truncate && jQuery( elem ).is( until ) ) {
    						break;
    					}
    					matched.push( elem );
    				}
    			}
    			return matched;
    		};


    		var siblings = function( n, elem ) {
    			var matched = [];

    			for ( ; n; n = n.nextSibling ) {
    				if ( n.nodeType === 1 && n !== elem ) {
    					matched.push( n );
    				}
    			}

    			return matched;
    		};


    		var rneedsContext = jQuery.expr.match.needsContext;

    		var rsingleTag = ( /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i );



    		// Implement the identical functionality for filter and not
    		function winnow( elements, qualifier, not ) {
    			if ( isFunction( qualifier ) ) {
    				return jQuery.grep( elements, function( elem, i ) {
    					return !!qualifier.call( elem, i, elem ) !== not;
    				} );
    			}

    			// Single element
    			if ( qualifier.nodeType ) {
    				return jQuery.grep( elements, function( elem ) {
    					return ( elem === qualifier ) !== not;
    				} );
    			}

    			// Arraylike of elements (jQuery, arguments, Array)
    			if ( typeof qualifier !== "string" ) {
    				return jQuery.grep( elements, function( elem ) {
    					return ( indexOf.call( qualifier, elem ) > -1 ) !== not;
    				} );
    			}

    			// Filtered directly for both simple and complex selectors
    			return jQuery.filter( qualifier, elements, not );
    		}

    		jQuery.filter = function( expr, elems, not ) {
    			var elem = elems[ 0 ];

    			if ( not ) {
    				expr = ":not(" + expr + ")";
    			}

    			if ( elems.length === 1 && elem.nodeType === 1 ) {
    				return jQuery.find.matchesSelector( elem, expr ) ? [ elem ] : [];
    			}

    			return jQuery.find.matches( expr, jQuery.grep( elems, function( elem ) {
    				return elem.nodeType === 1;
    			} ) );
    		};

    		jQuery.fn.extend( {
    			find: function( selector ) {
    				var i, ret,
    					len = this.length,
    					self = this;

    				if ( typeof selector !== "string" ) {
    					return this.pushStack( jQuery( selector ).filter( function() {
    						for ( i = 0; i < len; i++ ) {
    							if ( jQuery.contains( self[ i ], this ) ) {
    								return true;
    							}
    						}
    					} ) );
    				}

    				ret = this.pushStack( [] );

    				for ( i = 0; i < len; i++ ) {
    					jQuery.find( selector, self[ i ], ret );
    				}

    				return len > 1 ? jQuery.uniqueSort( ret ) : ret;
    			},
    			filter: function( selector ) {
    				return this.pushStack( winnow( this, selector || [], false ) );
    			},
    			not: function( selector ) {
    				return this.pushStack( winnow( this, selector || [], true ) );
    			},
    			is: function( selector ) {
    				return !!winnow(
    					this,

    					// If this is a positional/relative selector, check membership in the returned set
    					// so $("p:first").is("p:last") won't return true for a doc with two "p".
    					typeof selector === "string" && rneedsContext.test( selector ) ?
    						jQuery( selector ) :
    						selector || [],
    					false
    				).length;
    			}
    		} );


    		// Initialize a jQuery object


    		// A central reference to the root jQuery(document)
    		var rootjQuery,

    			// A simple way to check for HTML strings
    			// Prioritize #id over <tag> to avoid XSS via location.hash (trac-9521)
    			// Strict HTML recognition (trac-11290: must start with <)
    			// Shortcut simple #id case for speed
    			rquickExpr = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/,

    			init = jQuery.fn.init = function( selector, context, root ) {
    				var match, elem;

    				// HANDLE: $(""), $(null), $(undefined), $(false)
    				if ( !selector ) {
    					return this;
    				}

    				// Method init() accepts an alternate rootjQuery
    				// so migrate can support jQuery.sub (gh-2101)
    				root = root || rootjQuery;

    				// Handle HTML strings
    				if ( typeof selector === "string" ) {
    					if ( selector[ 0 ] === "<" &&
    						selector[ selector.length - 1 ] === ">" &&
    						selector.length >= 3 ) {

    						// Assume that strings that start and end with <> are HTML and skip the regex check
    						match = [ null, selector, null ];

    					} else {
    						match = rquickExpr.exec( selector );
    					}

    					// Match html or make sure no context is specified for #id
    					if ( match && ( match[ 1 ] || !context ) ) {

    						// HANDLE: $(html) -> $(array)
    						if ( match[ 1 ] ) {
    							context = context instanceof jQuery ? context[ 0 ] : context;

    							// Option to run scripts is true for back-compat
    							// Intentionally let the error be thrown if parseHTML is not present
    							jQuery.merge( this, jQuery.parseHTML(
    								match[ 1 ],
    								context && context.nodeType ? context.ownerDocument || context : document,
    								true
    							) );

    							// HANDLE: $(html, props)
    							if ( rsingleTag.test( match[ 1 ] ) && jQuery.isPlainObject( context ) ) {
    								for ( match in context ) {

    									// Properties of context are called as methods if possible
    									if ( isFunction( this[ match ] ) ) {
    										this[ match ]( context[ match ] );

    									// ...and otherwise set as attributes
    									} else {
    										this.attr( match, context[ match ] );
    									}
    								}
    							}

    							return this;

    						// HANDLE: $(#id)
    						} else {
    							elem = document.getElementById( match[ 2 ] );

    							if ( elem ) {

    								// Inject the element directly into the jQuery object
    								this[ 0 ] = elem;
    								this.length = 1;
    							}
    							return this;
    						}

    					// HANDLE: $(expr, $(...))
    					} else if ( !context || context.jquery ) {
    						return ( context || root ).find( selector );

    					// HANDLE: $(expr, context)
    					// (which is just equivalent to: $(context).find(expr)
    					} else {
    						return this.constructor( context ).find( selector );
    					}

    				// HANDLE: $(DOMElement)
    				} else if ( selector.nodeType ) {
    					this[ 0 ] = selector;
    					this.length = 1;
    					return this;

    				// HANDLE: $(function)
    				// Shortcut for document ready
    				} else if ( isFunction( selector ) ) {
    					return root.ready !== undefined ?
    						root.ready( selector ) :

    						// Execute immediately if ready is not present
    						selector( jQuery );
    				}

    				return jQuery.makeArray( selector, this );
    			};

    		// Give the init function the jQuery prototype for later instantiation
    		init.prototype = jQuery.fn;

    		// Initialize central reference
    		rootjQuery = jQuery( document );


    		var rparentsprev = /^(?:parents|prev(?:Until|All))/,

    			// Methods guaranteed to produce a unique set when starting from a unique set
    			guaranteedUnique = {
    				children: true,
    				contents: true,
    				next: true,
    				prev: true
    			};

    		jQuery.fn.extend( {
    			has: function( target ) {
    				var targets = jQuery( target, this ),
    					l = targets.length;

    				return this.filter( function() {
    					var i = 0;
    					for ( ; i < l; i++ ) {
    						if ( jQuery.contains( this, targets[ i ] ) ) {
    							return true;
    						}
    					}
    				} );
    			},

    			closest: function( selectors, context ) {
    				var cur,
    					i = 0,
    					l = this.length,
    					matched = [],
    					targets = typeof selectors !== "string" && jQuery( selectors );

    				// Positional selectors never match, since there's no _selection_ context
    				if ( !rneedsContext.test( selectors ) ) {
    					for ( ; i < l; i++ ) {
    						for ( cur = this[ i ]; cur && cur !== context; cur = cur.parentNode ) {

    							// Always skip document fragments
    							if ( cur.nodeType < 11 && ( targets ?
    								targets.index( cur ) > -1 :

    								// Don't pass non-elements to jQuery#find
    								cur.nodeType === 1 &&
    									jQuery.find.matchesSelector( cur, selectors ) ) ) {

    								matched.push( cur );
    								break;
    							}
    						}
    					}
    				}

    				return this.pushStack( matched.length > 1 ? jQuery.uniqueSort( matched ) : matched );
    			},

    			// Determine the position of an element within the set
    			index: function( elem ) {

    				// No argument, return index in parent
    				if ( !elem ) {
    					return ( this[ 0 ] && this[ 0 ].parentNode ) ? this.first().prevAll().length : -1;
    				}

    				// Index in selector
    				if ( typeof elem === "string" ) {
    					return indexOf.call( jQuery( elem ), this[ 0 ] );
    				}

    				// Locate the position of the desired element
    				return indexOf.call( this,

    					// If it receives a jQuery object, the first element is used
    					elem.jquery ? elem[ 0 ] : elem
    				);
    			},

    			add: function( selector, context ) {
    				return this.pushStack(
    					jQuery.uniqueSort(
    						jQuery.merge( this.get(), jQuery( selector, context ) )
    					)
    				);
    			},

    			addBack: function( selector ) {
    				return this.add( selector == null ?
    					this.prevObject : this.prevObject.filter( selector )
    				);
    			}
    		} );

    		function sibling( cur, dir ) {
    			while ( ( cur = cur[ dir ] ) && cur.nodeType !== 1 ) {}
    			return cur;
    		}

    		jQuery.each( {
    			parent: function( elem ) {
    				var parent = elem.parentNode;
    				return parent && parent.nodeType !== 11 ? parent : null;
    			},
    			parents: function( elem ) {
    				return dir( elem, "parentNode" );
    			},
    			parentsUntil: function( elem, _i, until ) {
    				return dir( elem, "parentNode", until );
    			},
    			next: function( elem ) {
    				return sibling( elem, "nextSibling" );
    			},
    			prev: function( elem ) {
    				return sibling( elem, "previousSibling" );
    			},
    			nextAll: function( elem ) {
    				return dir( elem, "nextSibling" );
    			},
    			prevAll: function( elem ) {
    				return dir( elem, "previousSibling" );
    			},
    			nextUntil: function( elem, _i, until ) {
    				return dir( elem, "nextSibling", until );
    			},
    			prevUntil: function( elem, _i, until ) {
    				return dir( elem, "previousSibling", until );
    			},
    			siblings: function( elem ) {
    				return siblings( ( elem.parentNode || {} ).firstChild, elem );
    			},
    			children: function( elem ) {
    				return siblings( elem.firstChild );
    			},
    			contents: function( elem ) {
    				if ( elem.contentDocument != null &&

    					// Support: IE 11+
    					// <object> elements with no `data` attribute has an object
    					// `contentDocument` with a `null` prototype.
    					getProto( elem.contentDocument ) ) {

    					return elem.contentDocument;
    				}

    				// Support: IE 9 - 11 only, iOS 7 only, Android Browser <=4.3 only
    				// Treat the template element as a regular one in browsers that
    				// don't support it.
    				if ( nodeName( elem, "template" ) ) {
    					elem = elem.content || elem;
    				}

    				return jQuery.merge( [], elem.childNodes );
    			}
    		}, function( name, fn ) {
    			jQuery.fn[ name ] = function( until, selector ) {
    				var matched = jQuery.map( this, fn, until );

    				if ( name.slice( -5 ) !== "Until" ) {
    					selector = until;
    				}

    				if ( selector && typeof selector === "string" ) {
    					matched = jQuery.filter( selector, matched );
    				}

    				if ( this.length > 1 ) {

    					// Remove duplicates
    					if ( !guaranteedUnique[ name ] ) {
    						jQuery.uniqueSort( matched );
    					}

    					// Reverse order for parents* and prev-derivatives
    					if ( rparentsprev.test( name ) ) {
    						matched.reverse();
    					}
    				}

    				return this.pushStack( matched );
    			};
    		} );
    		var rnothtmlwhite = ( /[^\x20\t\r\n\f]+/g );



    		// Convert String-formatted options into Object-formatted ones
    		function createOptions( options ) {
    			var object = {};
    			jQuery.each( options.match( rnothtmlwhite ) || [], function( _, flag ) {
    				object[ flag ] = true;
    			} );
    			return object;
    		}

    		/*
    		 * Create a callback list using the following parameters:
    		 *
    		 *	options: an optional list of space-separated options that will change how
    		 *			the callback list behaves or a more traditional option object
    		 *
    		 * By default a callback list will act like an event callback list and can be
    		 * "fired" multiple times.
    		 *
    		 * Possible options:
    		 *
    		 *	once:			will ensure the callback list can only be fired once (like a Deferred)
    		 *
    		 *	memory:			will keep track of previous values and will call any callback added
    		 *					after the list has been fired right away with the latest "memorized"
    		 *					values (like a Deferred)
    		 *
    		 *	unique:			will ensure a callback can only be added once (no duplicate in the list)
    		 *
    		 *	stopOnFalse:	interrupt callings when a callback returns false
    		 *
    		 */
    		jQuery.Callbacks = function( options ) {

    			// Convert options from String-formatted to Object-formatted if needed
    			// (we check in cache first)
    			options = typeof options === "string" ?
    				createOptions( options ) :
    				jQuery.extend( {}, options );

    			var // Flag to know if list is currently firing
    				firing,

    				// Last fire value for non-forgettable lists
    				memory,

    				// Flag to know if list was already fired
    				fired,

    				// Flag to prevent firing
    				locked,

    				// Actual callback list
    				list = [],

    				// Queue of execution data for repeatable lists
    				queue = [],

    				// Index of currently firing callback (modified by add/remove as needed)
    				firingIndex = -1,

    				// Fire callbacks
    				fire = function() {

    					// Enforce single-firing
    					locked = locked || options.once;

    					// Execute callbacks for all pending executions,
    					// respecting firingIndex overrides and runtime changes
    					fired = firing = true;
    					for ( ; queue.length; firingIndex = -1 ) {
    						memory = queue.shift();
    						while ( ++firingIndex < list.length ) {

    							// Run callback and check for early termination
    							if ( list[ firingIndex ].apply( memory[ 0 ], memory[ 1 ] ) === false &&
    								options.stopOnFalse ) {

    								// Jump to end and forget the data so .add doesn't re-fire
    								firingIndex = list.length;
    								memory = false;
    							}
    						}
    					}

    					// Forget the data if we're done with it
    					if ( !options.memory ) {
    						memory = false;
    					}

    					firing = false;

    					// Clean up if we're done firing for good
    					if ( locked ) {

    						// Keep an empty list if we have data for future add calls
    						if ( memory ) {
    							list = [];

    						// Otherwise, this object is spent
    						} else {
    							list = "";
    						}
    					}
    				},

    				// Actual Callbacks object
    				self = {

    					// Add a callback or a collection of callbacks to the list
    					add: function() {
    						if ( list ) {

    							// If we have memory from a past run, we should fire after adding
    							if ( memory && !firing ) {
    								firingIndex = list.length - 1;
    								queue.push( memory );
    							}

    							( function add( args ) {
    								jQuery.each( args, function( _, arg ) {
    									if ( isFunction( arg ) ) {
    										if ( !options.unique || !self.has( arg ) ) {
    											list.push( arg );
    										}
    									} else if ( arg && arg.length && toType( arg ) !== "string" ) {

    										// Inspect recursively
    										add( arg );
    									}
    								} );
    							} )( arguments );

    							if ( memory && !firing ) {
    								fire();
    							}
    						}
    						return this;
    					},

    					// Remove a callback from the list
    					remove: function() {
    						jQuery.each( arguments, function( _, arg ) {
    							var index;
    							while ( ( index = jQuery.inArray( arg, list, index ) ) > -1 ) {
    								list.splice( index, 1 );

    								// Handle firing indexes
    								if ( index <= firingIndex ) {
    									firingIndex--;
    								}
    							}
    						} );
    						return this;
    					},

    					// Check if a given callback is in the list.
    					// If no argument is given, return whether or not list has callbacks attached.
    					has: function( fn ) {
    						return fn ?
    							jQuery.inArray( fn, list ) > -1 :
    							list.length > 0;
    					},

    					// Remove all callbacks from the list
    					empty: function() {
    						if ( list ) {
    							list = [];
    						}
    						return this;
    					},

    					// Disable .fire and .add
    					// Abort any current/pending executions
    					// Clear all callbacks and values
    					disable: function() {
    						locked = queue = [];
    						list = memory = "";
    						return this;
    					},
    					disabled: function() {
    						return !list;
    					},

    					// Disable .fire
    					// Also disable .add unless we have memory (since it would have no effect)
    					// Abort any pending executions
    					lock: function() {
    						locked = queue = [];
    						if ( !memory && !firing ) {
    							list = memory = "";
    						}
    						return this;
    					},
    					locked: function() {
    						return !!locked;
    					},

    					// Call all callbacks with the given context and arguments
    					fireWith: function( context, args ) {
    						if ( !locked ) {
    							args = args || [];
    							args = [ context, args.slice ? args.slice() : args ];
    							queue.push( args );
    							if ( !firing ) {
    								fire();
    							}
    						}
    						return this;
    					},

    					// Call all the callbacks with the given arguments
    					fire: function() {
    						self.fireWith( this, arguments );
    						return this;
    					},

    					// To know if the callbacks have already been called at least once
    					fired: function() {
    						return !!fired;
    					}
    				};

    			return self;
    		};


    		function Identity( v ) {
    			return v;
    		}
    		function Thrower( ex ) {
    			throw ex;
    		}

    		function adoptValue( value, resolve, reject, noValue ) {
    			var method;

    			try {

    				// Check for promise aspect first to privilege synchronous behavior
    				if ( value && isFunction( ( method = value.promise ) ) ) {
    					method.call( value ).done( resolve ).fail( reject );

    				// Other thenables
    				} else if ( value && isFunction( ( method = value.then ) ) ) {
    					method.call( value, resolve, reject );

    				// Other non-thenables
    				} else {

    					// Control `resolve` arguments by letting Array#slice cast boolean `noValue` to integer:
    					// * false: [ value ].slice( 0 ) => resolve( value )
    					// * true: [ value ].slice( 1 ) => resolve()
    					resolve.apply( undefined, [ value ].slice( noValue ) );
    				}

    			// For Promises/A+, convert exceptions into rejections
    			// Since jQuery.when doesn't unwrap thenables, we can skip the extra checks appearing in
    			// Deferred#then to conditionally suppress rejection.
    			} catch ( value ) {

    				// Support: Android 4.0 only
    				// Strict mode functions invoked without .call/.apply get global-object context
    				reject.apply( undefined, [ value ] );
    			}
    		}

    		jQuery.extend( {

    			Deferred: function( func ) {
    				var tuples = [

    						// action, add listener, callbacks,
    						// ... .then handlers, argument index, [final state]
    						[ "notify", "progress", jQuery.Callbacks( "memory" ),
    							jQuery.Callbacks( "memory" ), 2 ],
    						[ "resolve", "done", jQuery.Callbacks( "once memory" ),
    							jQuery.Callbacks( "once memory" ), 0, "resolved" ],
    						[ "reject", "fail", jQuery.Callbacks( "once memory" ),
    							jQuery.Callbacks( "once memory" ), 1, "rejected" ]
    					],
    					state = "pending",
    					promise = {
    						state: function() {
    							return state;
    						},
    						always: function() {
    							deferred.done( arguments ).fail( arguments );
    							return this;
    						},
    						"catch": function( fn ) {
    							return promise.then( null, fn );
    						},

    						// Keep pipe for back-compat
    						pipe: function( /* fnDone, fnFail, fnProgress */ ) {
    							var fns = arguments;

    							return jQuery.Deferred( function( newDefer ) {
    								jQuery.each( tuples, function( _i, tuple ) {

    									// Map tuples (progress, done, fail) to arguments (done, fail, progress)
    									var fn = isFunction( fns[ tuple[ 4 ] ] ) && fns[ tuple[ 4 ] ];

    									// deferred.progress(function() { bind to newDefer or newDefer.notify })
    									// deferred.done(function() { bind to newDefer or newDefer.resolve })
    									// deferred.fail(function() { bind to newDefer or newDefer.reject })
    									deferred[ tuple[ 1 ] ]( function() {
    										var returned = fn && fn.apply( this, arguments );
    										if ( returned && isFunction( returned.promise ) ) {
    											returned.promise()
    												.progress( newDefer.notify )
    												.done( newDefer.resolve )
    												.fail( newDefer.reject );
    										} else {
    											newDefer[ tuple[ 0 ] + "With" ](
    												this,
    												fn ? [ returned ] : arguments
    											);
    										}
    									} );
    								} );
    								fns = null;
    							} ).promise();
    						},
    						then: function( onFulfilled, onRejected, onProgress ) {
    							var maxDepth = 0;
    							function resolve( depth, deferred, handler, special ) {
    								return function() {
    									var that = this,
    										args = arguments,
    										mightThrow = function() {
    											var returned, then;

    											// Support: Promises/A+ section 2.3.3.3.3
    											// https://promisesaplus.com/#point-59
    											// Ignore double-resolution attempts
    											if ( depth < maxDepth ) {
    												return;
    											}

    											returned = handler.apply( that, args );

    											// Support: Promises/A+ section 2.3.1
    											// https://promisesaplus.com/#point-48
    											if ( returned === deferred.promise() ) {
    												throw new TypeError( "Thenable self-resolution" );
    											}

    											// Support: Promises/A+ sections 2.3.3.1, 3.5
    											// https://promisesaplus.com/#point-54
    											// https://promisesaplus.com/#point-75
    											// Retrieve `then` only once
    											then = returned &&

    												// Support: Promises/A+ section 2.3.4
    												// https://promisesaplus.com/#point-64
    												// Only check objects and functions for thenability
    												( typeof returned === "object" ||
    													typeof returned === "function" ) &&
    												returned.then;

    											// Handle a returned thenable
    											if ( isFunction( then ) ) {

    												// Special processors (notify) just wait for resolution
    												if ( special ) {
    													then.call(
    														returned,
    														resolve( maxDepth, deferred, Identity, special ),
    														resolve( maxDepth, deferred, Thrower, special )
    													);

    												// Normal processors (resolve) also hook into progress
    												} else {

    													// ...and disregard older resolution values
    													maxDepth++;

    													then.call(
    														returned,
    														resolve( maxDepth, deferred, Identity, special ),
    														resolve( maxDepth, deferred, Thrower, special ),
    														resolve( maxDepth, deferred, Identity,
    															deferred.notifyWith )
    													);
    												}

    											// Handle all other returned values
    											} else {

    												// Only substitute handlers pass on context
    												// and multiple values (non-spec behavior)
    												if ( handler !== Identity ) {
    													that = undefined;
    													args = [ returned ];
    												}

    												// Process the value(s)
    												// Default process is resolve
    												( special || deferred.resolveWith )( that, args );
    											}
    										},

    										// Only normal processors (resolve) catch and reject exceptions
    										process = special ?
    											mightThrow :
    											function() {
    												try {
    													mightThrow();
    												} catch ( e ) {

    													if ( jQuery.Deferred.exceptionHook ) {
    														jQuery.Deferred.exceptionHook( e,
    															process.error );
    													}

    													// Support: Promises/A+ section 2.3.3.3.4.1
    													// https://promisesaplus.com/#point-61
    													// Ignore post-resolution exceptions
    													if ( depth + 1 >= maxDepth ) {

    														// Only substitute handlers pass on context
    														// and multiple values (non-spec behavior)
    														if ( handler !== Thrower ) {
    															that = undefined;
    															args = [ e ];
    														}

    														deferred.rejectWith( that, args );
    													}
    												}
    											};

    									// Support: Promises/A+ section 2.3.3.3.1
    									// https://promisesaplus.com/#point-57
    									// Re-resolve promises immediately to dodge false rejection from
    									// subsequent errors
    									if ( depth ) {
    										process();
    									} else {

    										// Call an optional hook to record the error, in case of exception
    										// since it's otherwise lost when execution goes async
    										if ( jQuery.Deferred.getErrorHook ) {
    											process.error = jQuery.Deferred.getErrorHook();

    										// The deprecated alias of the above. While the name suggests
    										// returning the stack, not an error instance, jQuery just passes
    										// it directly to `console.warn` so both will work; an instance
    										// just better cooperates with source maps.
    										} else if ( jQuery.Deferred.getStackHook ) {
    											process.error = jQuery.Deferred.getStackHook();
    										}
    										window.setTimeout( process );
    									}
    								};
    							}

    							return jQuery.Deferred( function( newDefer ) {

    								// progress_handlers.add( ... )
    								tuples[ 0 ][ 3 ].add(
    									resolve(
    										0,
    										newDefer,
    										isFunction( onProgress ) ?
    											onProgress :
    											Identity,
    										newDefer.notifyWith
    									)
    								);

    								// fulfilled_handlers.add( ... )
    								tuples[ 1 ][ 3 ].add(
    									resolve(
    										0,
    										newDefer,
    										isFunction( onFulfilled ) ?
    											onFulfilled :
    											Identity
    									)
    								);

    								// rejected_handlers.add( ... )
    								tuples[ 2 ][ 3 ].add(
    									resolve(
    										0,
    										newDefer,
    										isFunction( onRejected ) ?
    											onRejected :
    											Thrower
    									)
    								);
    							} ).promise();
    						},

    						// Get a promise for this deferred
    						// If obj is provided, the promise aspect is added to the object
    						promise: function( obj ) {
    							return obj != null ? jQuery.extend( obj, promise ) : promise;
    						}
    					},
    					deferred = {};

    				// Add list-specific methods
    				jQuery.each( tuples, function( i, tuple ) {
    					var list = tuple[ 2 ],
    						stateString = tuple[ 5 ];

    					// promise.progress = list.add
    					// promise.done = list.add
    					// promise.fail = list.add
    					promise[ tuple[ 1 ] ] = list.add;

    					// Handle state
    					if ( stateString ) {
    						list.add(
    							function() {

    								// state = "resolved" (i.e., fulfilled)
    								// state = "rejected"
    								state = stateString;
    							},

    							// rejected_callbacks.disable
    							// fulfilled_callbacks.disable
    							tuples[ 3 - i ][ 2 ].disable,

    							// rejected_handlers.disable
    							// fulfilled_handlers.disable
    							tuples[ 3 - i ][ 3 ].disable,

    							// progress_callbacks.lock
    							tuples[ 0 ][ 2 ].lock,

    							// progress_handlers.lock
    							tuples[ 0 ][ 3 ].lock
    						);
    					}

    					// progress_handlers.fire
    					// fulfilled_handlers.fire
    					// rejected_handlers.fire
    					list.add( tuple[ 3 ].fire );

    					// deferred.notify = function() { deferred.notifyWith(...) }
    					// deferred.resolve = function() { deferred.resolveWith(...) }
    					// deferred.reject = function() { deferred.rejectWith(...) }
    					deferred[ tuple[ 0 ] ] = function() {
    						deferred[ tuple[ 0 ] + "With" ]( this === deferred ? undefined : this, arguments );
    						return this;
    					};

    					// deferred.notifyWith = list.fireWith
    					// deferred.resolveWith = list.fireWith
    					// deferred.rejectWith = list.fireWith
    					deferred[ tuple[ 0 ] + "With" ] = list.fireWith;
    				} );

    				// Make the deferred a promise
    				promise.promise( deferred );

    				// Call given func if any
    				if ( func ) {
    					func.call( deferred, deferred );
    				}

    				// All done!
    				return deferred;
    			},

    			// Deferred helper
    			when: function( singleValue ) {
    				var

    					// count of uncompleted subordinates
    					remaining = arguments.length,

    					// count of unprocessed arguments
    					i = remaining,

    					// subordinate fulfillment data
    					resolveContexts = Array( i ),
    					resolveValues = slice.call( arguments ),

    					// the primary Deferred
    					primary = jQuery.Deferred(),

    					// subordinate callback factory
    					updateFunc = function( i ) {
    						return function( value ) {
    							resolveContexts[ i ] = this;
    							resolveValues[ i ] = arguments.length > 1 ? slice.call( arguments ) : value;
    							if ( !( --remaining ) ) {
    								primary.resolveWith( resolveContexts, resolveValues );
    							}
    						};
    					};

    				// Single- and empty arguments are adopted like Promise.resolve
    				if ( remaining <= 1 ) {
    					adoptValue( singleValue, primary.done( updateFunc( i ) ).resolve, primary.reject,
    						!remaining );

    					// Use .then() to unwrap secondary thenables (cf. gh-3000)
    					if ( primary.state() === "pending" ||
    						isFunction( resolveValues[ i ] && resolveValues[ i ].then ) ) {

    						return primary.then();
    					}
    				}

    				// Multiple arguments are aggregated like Promise.all array elements
    				while ( i-- ) {
    					adoptValue( resolveValues[ i ], updateFunc( i ), primary.reject );
    				}

    				return primary.promise();
    			}
    		} );


    		// These usually indicate a programmer mistake during development,
    		// warn about them ASAP rather than swallowing them by default.
    		var rerrorNames = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;

    		// If `jQuery.Deferred.getErrorHook` is defined, `asyncError` is an error
    		// captured before the async barrier to get the original error cause
    		// which may otherwise be hidden.
    		jQuery.Deferred.exceptionHook = function( error, asyncError ) {

    			// Support: IE 8 - 9 only
    			// Console exists when dev tools are open, which can happen at any time
    			if ( window.console && window.console.warn && error && rerrorNames.test( error.name ) ) {
    				window.console.warn( "jQuery.Deferred exception: " + error.message,
    					error.stack, asyncError );
    			}
    		};




    		jQuery.readyException = function( error ) {
    			window.setTimeout( function() {
    				throw error;
    			} );
    		};




    		// The deferred used on DOM ready
    		var readyList = jQuery.Deferred();

    		jQuery.fn.ready = function( fn ) {

    			readyList
    				.then( fn )

    				// Wrap jQuery.readyException in a function so that the lookup
    				// happens at the time of error handling instead of callback
    				// registration.
    				.catch( function( error ) {
    					jQuery.readyException( error );
    				} );

    			return this;
    		};

    		jQuery.extend( {

    			// Is the DOM ready to be used? Set to true once it occurs.
    			isReady: false,

    			// A counter to track how many items to wait for before
    			// the ready event fires. See trac-6781
    			readyWait: 1,

    			// Handle when the DOM is ready
    			ready: function( wait ) {

    				// Abort if there are pending holds or we're already ready
    				if ( wait === true ? --jQuery.readyWait : jQuery.isReady ) {
    					return;
    				}

    				// Remember that the DOM is ready
    				jQuery.isReady = true;

    				// If a normal DOM Ready event fired, decrement, and wait if need be
    				if ( wait !== true && --jQuery.readyWait > 0 ) {
    					return;
    				}

    				// If there are functions bound, to execute
    				readyList.resolveWith( document, [ jQuery ] );
    			}
    		} );

    		jQuery.ready.then = readyList.then;

    		// The ready event handler and self cleanup method
    		function completed() {
    			document.removeEventListener( "DOMContentLoaded", completed );
    			window.removeEventListener( "load", completed );
    			jQuery.ready();
    		}

    		// Catch cases where $(document).ready() is called
    		// after the browser event has already occurred.
    		// Support: IE <=9 - 10 only
    		// Older IE sometimes signals "interactive" too soon
    		if ( document.readyState === "complete" ||
    			( document.readyState !== "loading" && !document.documentElement.doScroll ) ) {

    			// Handle it asynchronously to allow scripts the opportunity to delay ready
    			window.setTimeout( jQuery.ready );

    		} else {

    			// Use the handy event callback
    			document.addEventListener( "DOMContentLoaded", completed );

    			// A fallback to window.onload, that will always work
    			window.addEventListener( "load", completed );
    		}




    		// Multifunctional method to get and set values of a collection
    		// The value/s can optionally be executed if it's a function
    		var access = function( elems, fn, key, value, chainable, emptyGet, raw ) {
    			var i = 0,
    				len = elems.length,
    				bulk = key == null;

    			// Sets many values
    			if ( toType( key ) === "object" ) {
    				chainable = true;
    				for ( i in key ) {
    					access( elems, fn, i, key[ i ], true, emptyGet, raw );
    				}

    			// Sets one value
    			} else if ( value !== undefined ) {
    				chainable = true;

    				if ( !isFunction( value ) ) {
    					raw = true;
    				}

    				if ( bulk ) {

    					// Bulk operations run against the entire set
    					if ( raw ) {
    						fn.call( elems, value );
    						fn = null;

    					// ...except when executing function values
    					} else {
    						bulk = fn;
    						fn = function( elem, _key, value ) {
    							return bulk.call( jQuery( elem ), value );
    						};
    					}
    				}

    				if ( fn ) {
    					for ( ; i < len; i++ ) {
    						fn(
    							elems[ i ], key, raw ?
    								value :
    								value.call( elems[ i ], i, fn( elems[ i ], key ) )
    						);
    					}
    				}
    			}

    			if ( chainable ) {
    				return elems;
    			}

    			// Gets
    			if ( bulk ) {
    				return fn.call( elems );
    			}

    			return len ? fn( elems[ 0 ], key ) : emptyGet;
    		};


    		// Matches dashed string for camelizing
    		var rmsPrefix = /^-ms-/,
    			rdashAlpha = /-([a-z])/g;

    		// Used by camelCase as callback to replace()
    		function fcamelCase( _all, letter ) {
    			return letter.toUpperCase();
    		}

    		// Convert dashed to camelCase; used by the css and data modules
    		// Support: IE <=9 - 11, Edge 12 - 15
    		// Microsoft forgot to hump their vendor prefix (trac-9572)
    		function camelCase( string ) {
    			return string.replace( rmsPrefix, "ms-" ).replace( rdashAlpha, fcamelCase );
    		}
    		var acceptData = function( owner ) {

    			// Accepts only:
    			//  - Node
    			//    - Node.ELEMENT_NODE
    			//    - Node.DOCUMENT_NODE
    			//  - Object
    			//    - Any
    			return owner.nodeType === 1 || owner.nodeType === 9 || !( +owner.nodeType );
    		};




    		function Data() {
    			this.expando = jQuery.expando + Data.uid++;
    		}

    		Data.uid = 1;

    		Data.prototype = {

    			cache: function( owner ) {

    				// Check if the owner object already has a cache
    				var value = owner[ this.expando ];

    				// If not, create one
    				if ( !value ) {
    					value = {};

    					// We can accept data for non-element nodes in modern browsers,
    					// but we should not, see trac-8335.
    					// Always return an empty object.
    					if ( acceptData( owner ) ) {

    						// If it is a node unlikely to be stringify-ed or looped over
    						// use plain assignment
    						if ( owner.nodeType ) {
    							owner[ this.expando ] = value;

    						// Otherwise secure it in a non-enumerable property
    						// configurable must be true to allow the property to be
    						// deleted when data is removed
    						} else {
    							Object.defineProperty( owner, this.expando, {
    								value: value,
    								configurable: true
    							} );
    						}
    					}
    				}

    				return value;
    			},
    			set: function( owner, data, value ) {
    				var prop,
    					cache = this.cache( owner );

    				// Handle: [ owner, key, value ] args
    				// Always use camelCase key (gh-2257)
    				if ( typeof data === "string" ) {
    					cache[ camelCase( data ) ] = value;

    				// Handle: [ owner, { properties } ] args
    				} else {

    					// Copy the properties one-by-one to the cache object
    					for ( prop in data ) {
    						cache[ camelCase( prop ) ] = data[ prop ];
    					}
    				}
    				return cache;
    			},
    			get: function( owner, key ) {
    				return key === undefined ?
    					this.cache( owner ) :

    					// Always use camelCase key (gh-2257)
    					owner[ this.expando ] && owner[ this.expando ][ camelCase( key ) ];
    			},
    			access: function( owner, key, value ) {

    				// In cases where either:
    				//
    				//   1. No key was specified
    				//   2. A string key was specified, but no value provided
    				//
    				// Take the "read" path and allow the get method to determine
    				// which value to return, respectively either:
    				//
    				//   1. The entire cache object
    				//   2. The data stored at the key
    				//
    				if ( key === undefined ||
    						( ( key && typeof key === "string" ) && value === undefined ) ) {

    					return this.get( owner, key );
    				}

    				// When the key is not a string, or both a key and value
    				// are specified, set or extend (existing objects) with either:
    				//
    				//   1. An object of properties
    				//   2. A key and value
    				//
    				this.set( owner, key, value );

    				// Since the "set" path can have two possible entry points
    				// return the expected data based on which path was taken[*]
    				return value !== undefined ? value : key;
    			},
    			remove: function( owner, key ) {
    				var i,
    					cache = owner[ this.expando ];

    				if ( cache === undefined ) {
    					return;
    				}

    				if ( key !== undefined ) {

    					// Support array or space separated string of keys
    					if ( Array.isArray( key ) ) {

    						// If key is an array of keys...
    						// We always set camelCase keys, so remove that.
    						key = key.map( camelCase );
    					} else {
    						key = camelCase( key );

    						// If a key with the spaces exists, use it.
    						// Otherwise, create an array by matching non-whitespace
    						key = key in cache ?
    							[ key ] :
    							( key.match( rnothtmlwhite ) || [] );
    					}

    					i = key.length;

    					while ( i-- ) {
    						delete cache[ key[ i ] ];
    					}
    				}

    				// Remove the expando if there's no more data
    				if ( key === undefined || jQuery.isEmptyObject( cache ) ) {

    					// Support: Chrome <=35 - 45
    					// Webkit & Blink performance suffers when deleting properties
    					// from DOM nodes, so set to undefined instead
    					// https://bugs.chromium.org/p/chromium/issues/detail?id=378607 (bug restricted)
    					if ( owner.nodeType ) {
    						owner[ this.expando ] = undefined;
    					} else {
    						delete owner[ this.expando ];
    					}
    				}
    			},
    			hasData: function( owner ) {
    				var cache = owner[ this.expando ];
    				return cache !== undefined && !jQuery.isEmptyObject( cache );
    			}
    		};
    		var dataPriv = new Data();

    		var dataUser = new Data();



    		//	Implementation Summary
    		//
    		//	1. Enforce API surface and semantic compatibility with 1.9.x branch
    		//	2. Improve the module's maintainability by reducing the storage
    		//		paths to a single mechanism.
    		//	3. Use the same single mechanism to support "private" and "user" data.
    		//	4. _Never_ expose "private" data to user code (TODO: Drop _data, _removeData)
    		//	5. Avoid exposing implementation details on user objects (eg. expando properties)
    		//	6. Provide a clear path for implementation upgrade to WeakMap in 2014

    		var rbrace = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
    			rmultiDash = /[A-Z]/g;

    		function getData( data ) {
    			if ( data === "true" ) {
    				return true;
    			}

    			if ( data === "false" ) {
    				return false;
    			}

    			if ( data === "null" ) {
    				return null;
    			}

    			// Only convert to a number if it doesn't change the string
    			if ( data === +data + "" ) {
    				return +data;
    			}

    			if ( rbrace.test( data ) ) {
    				return JSON.parse( data );
    			}

    			return data;
    		}

    		function dataAttr( elem, key, data ) {
    			var name;

    			// If nothing was found internally, try to fetch any
    			// data from the HTML5 data-* attribute
    			if ( data === undefined && elem.nodeType === 1 ) {
    				name = "data-" + key.replace( rmultiDash, "-$&" ).toLowerCase();
    				data = elem.getAttribute( name );

    				if ( typeof data === "string" ) {
    					try {
    						data = getData( data );
    					} catch ( e ) {}

    					// Make sure we set the data so it isn't changed later
    					dataUser.set( elem, key, data );
    				} else {
    					data = undefined;
    				}
    			}
    			return data;
    		}

    		jQuery.extend( {
    			hasData: function( elem ) {
    				return dataUser.hasData( elem ) || dataPriv.hasData( elem );
    			},

    			data: function( elem, name, data ) {
    				return dataUser.access( elem, name, data );
    			},

    			removeData: function( elem, name ) {
    				dataUser.remove( elem, name );
    			},

    			// TODO: Now that all calls to _data and _removeData have been replaced
    			// with direct calls to dataPriv methods, these can be deprecated.
    			_data: function( elem, name, data ) {
    				return dataPriv.access( elem, name, data );
    			},

    			_removeData: function( elem, name ) {
    				dataPriv.remove( elem, name );
    			}
    		} );

    		jQuery.fn.extend( {
    			data: function( key, value ) {
    				var i, name, data,
    					elem = this[ 0 ],
    					attrs = elem && elem.attributes;

    				// Gets all values
    				if ( key === undefined ) {
    					if ( this.length ) {
    						data = dataUser.get( elem );

    						if ( elem.nodeType === 1 && !dataPriv.get( elem, "hasDataAttrs" ) ) {
    							i = attrs.length;
    							while ( i-- ) {

    								// Support: IE 11 only
    								// The attrs elements can be null (trac-14894)
    								if ( attrs[ i ] ) {
    									name = attrs[ i ].name;
    									if ( name.indexOf( "data-" ) === 0 ) {
    										name = camelCase( name.slice( 5 ) );
    										dataAttr( elem, name, data[ name ] );
    									}
    								}
    							}
    							dataPriv.set( elem, "hasDataAttrs", true );
    						}
    					}

    					return data;
    				}

    				// Sets multiple values
    				if ( typeof key === "object" ) {
    					return this.each( function() {
    						dataUser.set( this, key );
    					} );
    				}

    				return access( this, function( value ) {
    					var data;

    					// The calling jQuery object (element matches) is not empty
    					// (and therefore has an element appears at this[ 0 ]) and the
    					// `value` parameter was not undefined. An empty jQuery object
    					// will result in `undefined` for elem = this[ 0 ] which will
    					// throw an exception if an attempt to read a data cache is made.
    					if ( elem && value === undefined ) {

    						// Attempt to get data from the cache
    						// The key will always be camelCased in Data
    						data = dataUser.get( elem, key );
    						if ( data !== undefined ) {
    							return data;
    						}

    						// Attempt to "discover" the data in
    						// HTML5 custom data-* attrs
    						data = dataAttr( elem, key );
    						if ( data !== undefined ) {
    							return data;
    						}

    						// We tried really hard, but the data doesn't exist.
    						return;
    					}

    					// Set the data...
    					this.each( function() {

    						// We always store the camelCased key
    						dataUser.set( this, key, value );
    					} );
    				}, null, value, arguments.length > 1, null, true );
    			},

    			removeData: function( key ) {
    				return this.each( function() {
    					dataUser.remove( this, key );
    				} );
    			}
    		} );


    		jQuery.extend( {
    			queue: function( elem, type, data ) {
    				var queue;

    				if ( elem ) {
    					type = ( type || "fx" ) + "queue";
    					queue = dataPriv.get( elem, type );

    					// Speed up dequeue by getting out quickly if this is just a lookup
    					if ( data ) {
    						if ( !queue || Array.isArray( data ) ) {
    							queue = dataPriv.access( elem, type, jQuery.makeArray( data ) );
    						} else {
    							queue.push( data );
    						}
    					}
    					return queue || [];
    				}
    			},

    			dequeue: function( elem, type ) {
    				type = type || "fx";

    				var queue = jQuery.queue( elem, type ),
    					startLength = queue.length,
    					fn = queue.shift(),
    					hooks = jQuery._queueHooks( elem, type ),
    					next = function() {
    						jQuery.dequeue( elem, type );
    					};

    				// If the fx queue is dequeued, always remove the progress sentinel
    				if ( fn === "inprogress" ) {
    					fn = queue.shift();
    					startLength--;
    				}

    				if ( fn ) {

    					// Add a progress sentinel to prevent the fx queue from being
    					// automatically dequeued
    					if ( type === "fx" ) {
    						queue.unshift( "inprogress" );
    					}

    					// Clear up the last queue stop function
    					delete hooks.stop;
    					fn.call( elem, next, hooks );
    				}

    				if ( !startLength && hooks ) {
    					hooks.empty.fire();
    				}
    			},

    			// Not public - generate a queueHooks object, or return the current one
    			_queueHooks: function( elem, type ) {
    				var key = type + "queueHooks";
    				return dataPriv.get( elem, key ) || dataPriv.access( elem, key, {
    					empty: jQuery.Callbacks( "once memory" ).add( function() {
    						dataPriv.remove( elem, [ type + "queue", key ] );
    					} )
    				} );
    			}
    		} );

    		jQuery.fn.extend( {
    			queue: function( type, data ) {
    				var setter = 2;

    				if ( typeof type !== "string" ) {
    					data = type;
    					type = "fx";
    					setter--;
    				}

    				if ( arguments.length < setter ) {
    					return jQuery.queue( this[ 0 ], type );
    				}

    				return data === undefined ?
    					this :
    					this.each( function() {
    						var queue = jQuery.queue( this, type, data );

    						// Ensure a hooks for this queue
    						jQuery._queueHooks( this, type );

    						if ( type === "fx" && queue[ 0 ] !== "inprogress" ) {
    							jQuery.dequeue( this, type );
    						}
    					} );
    			},
    			dequeue: function( type ) {
    				return this.each( function() {
    					jQuery.dequeue( this, type );
    				} );
    			},
    			clearQueue: function( type ) {
    				return this.queue( type || "fx", [] );
    			},

    			// Get a promise resolved when queues of a certain type
    			// are emptied (fx is the type by default)
    			promise: function( type, obj ) {
    				var tmp,
    					count = 1,
    					defer = jQuery.Deferred(),
    					elements = this,
    					i = this.length,
    					resolve = function() {
    						if ( !( --count ) ) {
    							defer.resolveWith( elements, [ elements ] );
    						}
    					};

    				if ( typeof type !== "string" ) {
    					obj = type;
    					type = undefined;
    				}
    				type = type || "fx";

    				while ( i-- ) {
    					tmp = dataPriv.get( elements[ i ], type + "queueHooks" );
    					if ( tmp && tmp.empty ) {
    						count++;
    						tmp.empty.add( resolve );
    					}
    				}
    				resolve();
    				return defer.promise( obj );
    			}
    		} );
    		var pnum = ( /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/ ).source;

    		var rcssNum = new RegExp( "^(?:([+-])=|)(" + pnum + ")([a-z%]*)$", "i" );


    		var cssExpand = [ "Top", "Right", "Bottom", "Left" ];

    		var documentElement = document.documentElement;



    			var isAttached = function( elem ) {
    					return jQuery.contains( elem.ownerDocument, elem );
    				},
    				composed = { composed: true };

    			// Support: IE 9 - 11+, Edge 12 - 18+, iOS 10.0 - 10.2 only
    			// Check attachment across shadow DOM boundaries when possible (gh-3504)
    			// Support: iOS 10.0-10.2 only
    			// Early iOS 10 versions support `attachShadow` but not `getRootNode`,
    			// leading to errors. We need to check for `getRootNode`.
    			if ( documentElement.getRootNode ) {
    				isAttached = function( elem ) {
    					return jQuery.contains( elem.ownerDocument, elem ) ||
    						elem.getRootNode( composed ) === elem.ownerDocument;
    				};
    			}
    		var isHiddenWithinTree = function( elem, el ) {

    				// isHiddenWithinTree might be called from jQuery#filter function;
    				// in that case, element will be second argument
    				elem = el || elem;

    				// Inline style trumps all
    				return elem.style.display === "none" ||
    					elem.style.display === "" &&

    					// Otherwise, check computed style
    					// Support: Firefox <=43 - 45
    					// Disconnected elements can have computed display: none, so first confirm that elem is
    					// in the document.
    					isAttached( elem ) &&

    					jQuery.css( elem, "display" ) === "none";
    			};



    		function adjustCSS( elem, prop, valueParts, tween ) {
    			var adjusted, scale,
    				maxIterations = 20,
    				currentValue = tween ?
    					function() {
    						return tween.cur();
    					} :
    					function() {
    						return jQuery.css( elem, prop, "" );
    					},
    				initial = currentValue(),
    				unit = valueParts && valueParts[ 3 ] || ( jQuery.cssNumber[ prop ] ? "" : "px" ),

    				// Starting value computation is required for potential unit mismatches
    				initialInUnit = elem.nodeType &&
    					( jQuery.cssNumber[ prop ] || unit !== "px" && +initial ) &&
    					rcssNum.exec( jQuery.css( elem, prop ) );

    			if ( initialInUnit && initialInUnit[ 3 ] !== unit ) {

    				// Support: Firefox <=54
    				// Halve the iteration target value to prevent interference from CSS upper bounds (gh-2144)
    				initial = initial / 2;

    				// Trust units reported by jQuery.css
    				unit = unit || initialInUnit[ 3 ];

    				// Iteratively approximate from a nonzero starting point
    				initialInUnit = +initial || 1;

    				while ( maxIterations-- ) {

    					// Evaluate and update our best guess (doubling guesses that zero out).
    					// Finish if the scale equals or crosses 1 (making the old*new product non-positive).
    					jQuery.style( elem, prop, initialInUnit + unit );
    					if ( ( 1 - scale ) * ( 1 - ( scale = currentValue() / initial || 0.5 ) ) <= 0 ) {
    						maxIterations = 0;
    					}
    					initialInUnit = initialInUnit / scale;

    				}

    				initialInUnit = initialInUnit * 2;
    				jQuery.style( elem, prop, initialInUnit + unit );

    				// Make sure we update the tween properties later on
    				valueParts = valueParts || [];
    			}

    			if ( valueParts ) {
    				initialInUnit = +initialInUnit || +initial || 0;

    				// Apply relative offset (+=/-=) if specified
    				adjusted = valueParts[ 1 ] ?
    					initialInUnit + ( valueParts[ 1 ] + 1 ) * valueParts[ 2 ] :
    					+valueParts[ 2 ];
    				if ( tween ) {
    					tween.unit = unit;
    					tween.start = initialInUnit;
    					tween.end = adjusted;
    				}
    			}
    			return adjusted;
    		}


    		var defaultDisplayMap = {};

    		function getDefaultDisplay( elem ) {
    			var temp,
    				doc = elem.ownerDocument,
    				nodeName = elem.nodeName,
    				display = defaultDisplayMap[ nodeName ];

    			if ( display ) {
    				return display;
    			}

    			temp = doc.body.appendChild( doc.createElement( nodeName ) );
    			display = jQuery.css( temp, "display" );

    			temp.parentNode.removeChild( temp );

    			if ( display === "none" ) {
    				display = "block";
    			}
    			defaultDisplayMap[ nodeName ] = display;

    			return display;
    		}

    		function showHide( elements, show ) {
    			var display, elem,
    				values = [],
    				index = 0,
    				length = elements.length;

    			// Determine new display value for elements that need to change
    			for ( ; index < length; index++ ) {
    				elem = elements[ index ];
    				if ( !elem.style ) {
    					continue;
    				}

    				display = elem.style.display;
    				if ( show ) {

    					// Since we force visibility upon cascade-hidden elements, an immediate (and slow)
    					// check is required in this first loop unless we have a nonempty display value (either
    					// inline or about-to-be-restored)
    					if ( display === "none" ) {
    						values[ index ] = dataPriv.get( elem, "display" ) || null;
    						if ( !values[ index ] ) {
    							elem.style.display = "";
    						}
    					}
    					if ( elem.style.display === "" && isHiddenWithinTree( elem ) ) {
    						values[ index ] = getDefaultDisplay( elem );
    					}
    				} else {
    					if ( display !== "none" ) {
    						values[ index ] = "none";

    						// Remember what we're overwriting
    						dataPriv.set( elem, "display", display );
    					}
    				}
    			}

    			// Set the display of the elements in a second loop to avoid constant reflow
    			for ( index = 0; index < length; index++ ) {
    				if ( values[ index ] != null ) {
    					elements[ index ].style.display = values[ index ];
    				}
    			}

    			return elements;
    		}

    		jQuery.fn.extend( {
    			show: function() {
    				return showHide( this, true );
    			},
    			hide: function() {
    				return showHide( this );
    			},
    			toggle: function( state ) {
    				if ( typeof state === "boolean" ) {
    					return state ? this.show() : this.hide();
    				}

    				return this.each( function() {
    					if ( isHiddenWithinTree( this ) ) {
    						jQuery( this ).show();
    					} else {
    						jQuery( this ).hide();
    					}
    				} );
    			}
    		} );
    		var rcheckableType = ( /^(?:checkbox|radio)$/i );

    		var rtagName = ( /<([a-z][^\/\0>\x20\t\r\n\f]*)/i );

    		var rscriptType = ( /^$|^module$|\/(?:java|ecma)script/i );



    		( function() {
    			var fragment = document.createDocumentFragment(),
    				div = fragment.appendChild( document.createElement( "div" ) ),
    				input = document.createElement( "input" );

    			// Support: Android 4.0 - 4.3 only
    			// Check state lost if the name is set (trac-11217)
    			// Support: Windows Web Apps (WWA)
    			// `name` and `type` must use .setAttribute for WWA (trac-14901)
    			input.setAttribute( "type", "radio" );
    			input.setAttribute( "checked", "checked" );
    			input.setAttribute( "name", "t" );

    			div.appendChild( input );

    			// Support: Android <=4.1 only
    			// Older WebKit doesn't clone checked state correctly in fragments
    			support.checkClone = div.cloneNode( true ).cloneNode( true ).lastChild.checked;

    			// Support: IE <=11 only
    			// Make sure textarea (and checkbox) defaultValue is properly cloned
    			div.innerHTML = "<textarea>x</textarea>";
    			support.noCloneChecked = !!div.cloneNode( true ).lastChild.defaultValue;

    			// Support: IE <=9 only
    			// IE <=9 replaces <option> tags with their contents when inserted outside of
    			// the select element.
    			div.innerHTML = "<option></option>";
    			support.option = !!div.lastChild;
    		} )();


    		// We have to close these tags to support XHTML (trac-13200)
    		var wrapMap = {

    			// XHTML parsers do not magically insert elements in the
    			// same way that tag soup parsers do. So we cannot shorten
    			// this by omitting <tbody> or other required elements.
    			thead: [ 1, "<table>", "</table>" ],
    			col: [ 2, "<table><colgroup>", "</colgroup></table>" ],
    			tr: [ 2, "<table><tbody>", "</tbody></table>" ],
    			td: [ 3, "<table><tbody><tr>", "</tr></tbody></table>" ],

    			_default: [ 0, "", "" ]
    		};

    		wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
    		wrapMap.th = wrapMap.td;

    		// Support: IE <=9 only
    		if ( !support.option ) {
    			wrapMap.optgroup = wrapMap.option = [ 1, "<select multiple='multiple'>", "</select>" ];
    		}


    		function getAll( context, tag ) {

    			// Support: IE <=9 - 11 only
    			// Use typeof to avoid zero-argument method invocation on host objects (trac-15151)
    			var ret;

    			if ( typeof context.getElementsByTagName !== "undefined" ) {
    				ret = context.getElementsByTagName( tag || "*" );

    			} else if ( typeof context.querySelectorAll !== "undefined" ) {
    				ret = context.querySelectorAll( tag || "*" );

    			} else {
    				ret = [];
    			}

    			if ( tag === undefined || tag && nodeName( context, tag ) ) {
    				return jQuery.merge( [ context ], ret );
    			}

    			return ret;
    		}


    		// Mark scripts as having already been evaluated
    		function setGlobalEval( elems, refElements ) {
    			var i = 0,
    				l = elems.length;

    			for ( ; i < l; i++ ) {
    				dataPriv.set(
    					elems[ i ],
    					"globalEval",
    					!refElements || dataPriv.get( refElements[ i ], "globalEval" )
    				);
    			}
    		}


    		var rhtml = /<|&#?\w+;/;

    		function buildFragment( elems, context, scripts, selection, ignored ) {
    			var elem, tmp, tag, wrap, attached, j,
    				fragment = context.createDocumentFragment(),
    				nodes = [],
    				i = 0,
    				l = elems.length;

    			for ( ; i < l; i++ ) {
    				elem = elems[ i ];

    				if ( elem || elem === 0 ) {

    					// Add nodes directly
    					if ( toType( elem ) === "object" ) {

    						// Support: Android <=4.0 only, PhantomJS 1 only
    						// push.apply(_, arraylike) throws on ancient WebKit
    						jQuery.merge( nodes, elem.nodeType ? [ elem ] : elem );

    					// Convert non-html into a text node
    					} else if ( !rhtml.test( elem ) ) {
    						nodes.push( context.createTextNode( elem ) );

    					// Convert html into DOM nodes
    					} else {
    						tmp = tmp || fragment.appendChild( context.createElement( "div" ) );

    						// Deserialize a standard representation
    						tag = ( rtagName.exec( elem ) || [ "", "" ] )[ 1 ].toLowerCase();
    						wrap = wrapMap[ tag ] || wrapMap._default;
    						tmp.innerHTML = wrap[ 1 ] + jQuery.htmlPrefilter( elem ) + wrap[ 2 ];

    						// Descend through wrappers to the right content
    						j = wrap[ 0 ];
    						while ( j-- ) {
    							tmp = tmp.lastChild;
    						}

    						// Support: Android <=4.0 only, PhantomJS 1 only
    						// push.apply(_, arraylike) throws on ancient WebKit
    						jQuery.merge( nodes, tmp.childNodes );

    						// Remember the top-level container
    						tmp = fragment.firstChild;

    						// Ensure the created nodes are orphaned (trac-12392)
    						tmp.textContent = "";
    					}
    				}
    			}

    			// Remove wrapper from fragment
    			fragment.textContent = "";

    			i = 0;
    			while ( ( elem = nodes[ i++ ] ) ) {

    				// Skip elements already in the context collection (trac-4087)
    				if ( selection && jQuery.inArray( elem, selection ) > -1 ) {
    					if ( ignored ) {
    						ignored.push( elem );
    					}
    					continue;
    				}

    				attached = isAttached( elem );

    				// Append to fragment
    				tmp = getAll( fragment.appendChild( elem ), "script" );

    				// Preserve script evaluation history
    				if ( attached ) {
    					setGlobalEval( tmp );
    				}

    				// Capture executables
    				if ( scripts ) {
    					j = 0;
    					while ( ( elem = tmp[ j++ ] ) ) {
    						if ( rscriptType.test( elem.type || "" ) ) {
    							scripts.push( elem );
    						}
    					}
    				}
    			}

    			return fragment;
    		}


    		var rtypenamespace = /^([^.]*)(?:\.(.+)|)/;

    		function returnTrue() {
    			return true;
    		}

    		function returnFalse() {
    			return false;
    		}

    		function on( elem, types, selector, data, fn, one ) {
    			var origFn, type;

    			// Types can be a map of types/handlers
    			if ( typeof types === "object" ) {

    				// ( types-Object, selector, data )
    				if ( typeof selector !== "string" ) {

    					// ( types-Object, data )
    					data = data || selector;
    					selector = undefined;
    				}
    				for ( type in types ) {
    					on( elem, type, selector, data, types[ type ], one );
    				}
    				return elem;
    			}

    			if ( data == null && fn == null ) {

    				// ( types, fn )
    				fn = selector;
    				data = selector = undefined;
    			} else if ( fn == null ) {
    				if ( typeof selector === "string" ) {

    					// ( types, selector, fn )
    					fn = data;
    					data = undefined;
    				} else {

    					// ( types, data, fn )
    					fn = data;
    					data = selector;
    					selector = undefined;
    				}
    			}
    			if ( fn === false ) {
    				fn = returnFalse;
    			} else if ( !fn ) {
    				return elem;
    			}

    			if ( one === 1 ) {
    				origFn = fn;
    				fn = function( event ) {

    					// Can use an empty set, since event contains the info
    					jQuery().off( event );
    					return origFn.apply( this, arguments );
    				};

    				// Use same guid so caller can remove using origFn
    				fn.guid = origFn.guid || ( origFn.guid = jQuery.guid++ );
    			}
    			return elem.each( function() {
    				jQuery.event.add( this, types, fn, data, selector );
    			} );
    		}

    		/*
    		 * Helper functions for managing events -- not part of the public interface.
    		 * Props to Dean Edwards' addEvent library for many of the ideas.
    		 */
    		jQuery.event = {

    			global: {},

    			add: function( elem, types, handler, data, selector ) {

    				var handleObjIn, eventHandle, tmp,
    					events, t, handleObj,
    					special, handlers, type, namespaces, origType,
    					elemData = dataPriv.get( elem );

    				// Only attach events to objects that accept data
    				if ( !acceptData( elem ) ) {
    					return;
    				}

    				// Caller can pass in an object of custom data in lieu of the handler
    				if ( handler.handler ) {
    					handleObjIn = handler;
    					handler = handleObjIn.handler;
    					selector = handleObjIn.selector;
    				}

    				// Ensure that invalid selectors throw exceptions at attach time
    				// Evaluate against documentElement in case elem is a non-element node (e.g., document)
    				if ( selector ) {
    					jQuery.find.matchesSelector( documentElement, selector );
    				}

    				// Make sure that the handler has a unique ID, used to find/remove it later
    				if ( !handler.guid ) {
    					handler.guid = jQuery.guid++;
    				}

    				// Init the element's event structure and main handler, if this is the first
    				if ( !( events = elemData.events ) ) {
    					events = elemData.events = Object.create( null );
    				}
    				if ( !( eventHandle = elemData.handle ) ) {
    					eventHandle = elemData.handle = function( e ) {

    						// Discard the second event of a jQuery.event.trigger() and
    						// when an event is called after a page has unloaded
    						return typeof jQuery !== "undefined" && jQuery.event.triggered !== e.type ?
    							jQuery.event.dispatch.apply( elem, arguments ) : undefined;
    					};
    				}

    				// Handle multiple events separated by a space
    				types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
    				t = types.length;
    				while ( t-- ) {
    					tmp = rtypenamespace.exec( types[ t ] ) || [];
    					type = origType = tmp[ 1 ];
    					namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

    					// There *must* be a type, no attaching namespace-only handlers
    					if ( !type ) {
    						continue;
    					}

    					// If event changes its type, use the special event handlers for the changed type
    					special = jQuery.event.special[ type ] || {};

    					// If selector defined, determine special event api type, otherwise given type
    					type = ( selector ? special.delegateType : special.bindType ) || type;

    					// Update special based on newly reset type
    					special = jQuery.event.special[ type ] || {};

    					// handleObj is passed to all event handlers
    					handleObj = jQuery.extend( {
    						type: type,
    						origType: origType,
    						data: data,
    						handler: handler,
    						guid: handler.guid,
    						selector: selector,
    						needsContext: selector && jQuery.expr.match.needsContext.test( selector ),
    						namespace: namespaces.join( "." )
    					}, handleObjIn );

    					// Init the event handler queue if we're the first
    					if ( !( handlers = events[ type ] ) ) {
    						handlers = events[ type ] = [];
    						handlers.delegateCount = 0;

    						// Only use addEventListener if the special events handler returns false
    						if ( !special.setup ||
    							special.setup.call( elem, data, namespaces, eventHandle ) === false ) {

    							if ( elem.addEventListener ) {
    								elem.addEventListener( type, eventHandle );
    							}
    						}
    					}

    					if ( special.add ) {
    						special.add.call( elem, handleObj );

    						if ( !handleObj.handler.guid ) {
    							handleObj.handler.guid = handler.guid;
    						}
    					}

    					// Add to the element's handler list, delegates in front
    					if ( selector ) {
    						handlers.splice( handlers.delegateCount++, 0, handleObj );
    					} else {
    						handlers.push( handleObj );
    					}

    					// Keep track of which events have ever been used, for event optimization
    					jQuery.event.global[ type ] = true;
    				}

    			},

    			// Detach an event or set of events from an element
    			remove: function( elem, types, handler, selector, mappedTypes ) {

    				var j, origCount, tmp,
    					events, t, handleObj,
    					special, handlers, type, namespaces, origType,
    					elemData = dataPriv.hasData( elem ) && dataPriv.get( elem );

    				if ( !elemData || !( events = elemData.events ) ) {
    					return;
    				}

    				// Once for each type.namespace in types; type may be omitted
    				types = ( types || "" ).match( rnothtmlwhite ) || [ "" ];
    				t = types.length;
    				while ( t-- ) {
    					tmp = rtypenamespace.exec( types[ t ] ) || [];
    					type = origType = tmp[ 1 ];
    					namespaces = ( tmp[ 2 ] || "" ).split( "." ).sort();

    					// Unbind all events (on this namespace, if provided) for the element
    					if ( !type ) {
    						for ( type in events ) {
    							jQuery.event.remove( elem, type + types[ t ], handler, selector, true );
    						}
    						continue;
    					}

    					special = jQuery.event.special[ type ] || {};
    					type = ( selector ? special.delegateType : special.bindType ) || type;
    					handlers = events[ type ] || [];
    					tmp = tmp[ 2 ] &&
    						new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" );

    					// Remove matching events
    					origCount = j = handlers.length;
    					while ( j-- ) {
    						handleObj = handlers[ j ];

    						if ( ( mappedTypes || origType === handleObj.origType ) &&
    							( !handler || handler.guid === handleObj.guid ) &&
    							( !tmp || tmp.test( handleObj.namespace ) ) &&
    							( !selector || selector === handleObj.selector ||
    								selector === "**" && handleObj.selector ) ) {
    							handlers.splice( j, 1 );

    							if ( handleObj.selector ) {
    								handlers.delegateCount--;
    							}
    							if ( special.remove ) {
    								special.remove.call( elem, handleObj );
    							}
    						}
    					}

    					// Remove generic event handler if we removed something and no more handlers exist
    					// (avoids potential for endless recursion during removal of special event handlers)
    					if ( origCount && !handlers.length ) {
    						if ( !special.teardown ||
    							special.teardown.call( elem, namespaces, elemData.handle ) === false ) {

    							jQuery.removeEvent( elem, type, elemData.handle );
    						}

    						delete events[ type ];
    					}
    				}

    				// Remove data and the expando if it's no longer used
    				if ( jQuery.isEmptyObject( events ) ) {
    					dataPriv.remove( elem, "handle events" );
    				}
    			},

    			dispatch: function( nativeEvent ) {

    				var i, j, ret, matched, handleObj, handlerQueue,
    					args = new Array( arguments.length ),

    					// Make a writable jQuery.Event from the native event object
    					event = jQuery.event.fix( nativeEvent ),

    					handlers = (
    						dataPriv.get( this, "events" ) || Object.create( null )
    					)[ event.type ] || [],
    					special = jQuery.event.special[ event.type ] || {};

    				// Use the fix-ed jQuery.Event rather than the (read-only) native event
    				args[ 0 ] = event;

    				for ( i = 1; i < arguments.length; i++ ) {
    					args[ i ] = arguments[ i ];
    				}

    				event.delegateTarget = this;

    				// Call the preDispatch hook for the mapped type, and let it bail if desired
    				if ( special.preDispatch && special.preDispatch.call( this, event ) === false ) {
    					return;
    				}

    				// Determine handlers
    				handlerQueue = jQuery.event.handlers.call( this, event, handlers );

    				// Run delegates first; they may want to stop propagation beneath us
    				i = 0;
    				while ( ( matched = handlerQueue[ i++ ] ) && !event.isPropagationStopped() ) {
    					event.currentTarget = matched.elem;

    					j = 0;
    					while ( ( handleObj = matched.handlers[ j++ ] ) &&
    						!event.isImmediatePropagationStopped() ) {

    						// If the event is namespaced, then each handler is only invoked if it is
    						// specially universal or its namespaces are a superset of the event's.
    						if ( !event.rnamespace || handleObj.namespace === false ||
    							event.rnamespace.test( handleObj.namespace ) ) {

    							event.handleObj = handleObj;
    							event.data = handleObj.data;

    							ret = ( ( jQuery.event.special[ handleObj.origType ] || {} ).handle ||
    								handleObj.handler ).apply( matched.elem, args );

    							if ( ret !== undefined ) {
    								if ( ( event.result = ret ) === false ) {
    									event.preventDefault();
    									event.stopPropagation();
    								}
    							}
    						}
    					}
    				}

    				// Call the postDispatch hook for the mapped type
    				if ( special.postDispatch ) {
    					special.postDispatch.call( this, event );
    				}

    				return event.result;
    			},

    			handlers: function( event, handlers ) {
    				var i, handleObj, sel, matchedHandlers, matchedSelectors,
    					handlerQueue = [],
    					delegateCount = handlers.delegateCount,
    					cur = event.target;

    				// Find delegate handlers
    				if ( delegateCount &&

    					// Support: IE <=9
    					// Black-hole SVG <use> instance trees (trac-13180)
    					cur.nodeType &&

    					// Support: Firefox <=42
    					// Suppress spec-violating clicks indicating a non-primary pointer button (trac-3861)
    					// https://www.w3.org/TR/DOM-Level-3-Events/#event-type-click
    					// Support: IE 11 only
    					// ...but not arrow key "clicks" of radio inputs, which can have `button` -1 (gh-2343)
    					!( event.type === "click" && event.button >= 1 ) ) {

    					for ( ; cur !== this; cur = cur.parentNode || this ) {

    						// Don't check non-elements (trac-13208)
    						// Don't process clicks on disabled elements (trac-6911, trac-8165, trac-11382, trac-11764)
    						if ( cur.nodeType === 1 && !( event.type === "click" && cur.disabled === true ) ) {
    							matchedHandlers = [];
    							matchedSelectors = {};
    							for ( i = 0; i < delegateCount; i++ ) {
    								handleObj = handlers[ i ];

    								// Don't conflict with Object.prototype properties (trac-13203)
    								sel = handleObj.selector + " ";

    								if ( matchedSelectors[ sel ] === undefined ) {
    									matchedSelectors[ sel ] = handleObj.needsContext ?
    										jQuery( sel, this ).index( cur ) > -1 :
    										jQuery.find( sel, this, null, [ cur ] ).length;
    								}
    								if ( matchedSelectors[ sel ] ) {
    									matchedHandlers.push( handleObj );
    								}
    							}
    							if ( matchedHandlers.length ) {
    								handlerQueue.push( { elem: cur, handlers: matchedHandlers } );
    							}
    						}
    					}
    				}

    				// Add the remaining (directly-bound) handlers
    				cur = this;
    				if ( delegateCount < handlers.length ) {
    					handlerQueue.push( { elem: cur, handlers: handlers.slice( delegateCount ) } );
    				}

    				return handlerQueue;
    			},

    			addProp: function( name, hook ) {
    				Object.defineProperty( jQuery.Event.prototype, name, {
    					enumerable: true,
    					configurable: true,

    					get: isFunction( hook ) ?
    						function() {
    							if ( this.originalEvent ) {
    								return hook( this.originalEvent );
    							}
    						} :
    						function() {
    							if ( this.originalEvent ) {
    								return this.originalEvent[ name ];
    							}
    						},

    					set: function( value ) {
    						Object.defineProperty( this, name, {
    							enumerable: true,
    							configurable: true,
    							writable: true,
    							value: value
    						} );
    					}
    				} );
    			},

    			fix: function( originalEvent ) {
    				return originalEvent[ jQuery.expando ] ?
    					originalEvent :
    					new jQuery.Event( originalEvent );
    			},

    			special: {
    				load: {

    					// Prevent triggered image.load events from bubbling to window.load
    					noBubble: true
    				},
    				click: {

    					// Utilize native event to ensure correct state for checkable inputs
    					setup: function( data ) {

    						// For mutual compressibility with _default, replace `this` access with a local var.
    						// `|| data` is dead code meant only to preserve the variable through minification.
    						var el = this || data;

    						// Claim the first handler
    						if ( rcheckableType.test( el.type ) &&
    							el.click && nodeName( el, "input" ) ) {

    							// dataPriv.set( el, "click", ... )
    							leverageNative( el, "click", true );
    						}

    						// Return false to allow normal processing in the caller
    						return false;
    					},
    					trigger: function( data ) {

    						// For mutual compressibility with _default, replace `this` access with a local var.
    						// `|| data` is dead code meant only to preserve the variable through minification.
    						var el = this || data;

    						// Force setup before triggering a click
    						if ( rcheckableType.test( el.type ) &&
    							el.click && nodeName( el, "input" ) ) {

    							leverageNative( el, "click" );
    						}

    						// Return non-false to allow normal event-path propagation
    						return true;
    					},

    					// For cross-browser consistency, suppress native .click() on links
    					// Also prevent it if we're currently inside a leveraged native-event stack
    					_default: function( event ) {
    						var target = event.target;
    						return rcheckableType.test( target.type ) &&
    							target.click && nodeName( target, "input" ) &&
    							dataPriv.get( target, "click" ) ||
    							nodeName( target, "a" );
    					}
    				},

    				beforeunload: {
    					postDispatch: function( event ) {

    						// Support: Firefox 20+
    						// Firefox doesn't alert if the returnValue field is not set.
    						if ( event.result !== undefined && event.originalEvent ) {
    							event.originalEvent.returnValue = event.result;
    						}
    					}
    				}
    			}
    		};

    		// Ensure the presence of an event listener that handles manually-triggered
    		// synthetic events by interrupting progress until reinvoked in response to
    		// *native* events that it fires directly, ensuring that state changes have
    		// already occurred before other listeners are invoked.
    		function leverageNative( el, type, isSetup ) {

    			// Missing `isSetup` indicates a trigger call, which must force setup through jQuery.event.add
    			if ( !isSetup ) {
    				if ( dataPriv.get( el, type ) === undefined ) {
    					jQuery.event.add( el, type, returnTrue );
    				}
    				return;
    			}

    			// Register the controller as a special universal handler for all event namespaces
    			dataPriv.set( el, type, false );
    			jQuery.event.add( el, type, {
    				namespace: false,
    				handler: function( event ) {
    					var result,
    						saved = dataPriv.get( this, type );

    					if ( ( event.isTrigger & 1 ) && this[ type ] ) {

    						// Interrupt processing of the outer synthetic .trigger()ed event
    						if ( !saved ) {

    							// Store arguments for use when handling the inner native event
    							// There will always be at least one argument (an event object), so this array
    							// will not be confused with a leftover capture object.
    							saved = slice.call( arguments );
    							dataPriv.set( this, type, saved );

    							// Trigger the native event and capture its result
    							this[ type ]();
    							result = dataPriv.get( this, type );
    							dataPriv.set( this, type, false );

    							if ( saved !== result ) {

    								// Cancel the outer synthetic event
    								event.stopImmediatePropagation();
    								event.preventDefault();

    								return result;
    							}

    						// If this is an inner synthetic event for an event with a bubbling surrogate
    						// (focus or blur), assume that the surrogate already propagated from triggering
    						// the native event and prevent that from happening again here.
    						// This technically gets the ordering wrong w.r.t. to `.trigger()` (in which the
    						// bubbling surrogate propagates *after* the non-bubbling base), but that seems
    						// less bad than duplication.
    						} else if ( ( jQuery.event.special[ type ] || {} ).delegateType ) {
    							event.stopPropagation();
    						}

    					// If this is a native event triggered above, everything is now in order
    					// Fire an inner synthetic event with the original arguments
    					} else if ( saved ) {

    						// ...and capture the result
    						dataPriv.set( this, type, jQuery.event.trigger(
    							saved[ 0 ],
    							saved.slice( 1 ),
    							this
    						) );

    						// Abort handling of the native event by all jQuery handlers while allowing
    						// native handlers on the same element to run. On target, this is achieved
    						// by stopping immediate propagation just on the jQuery event. However,
    						// the native event is re-wrapped by a jQuery one on each level of the
    						// propagation so the only way to stop it for jQuery is to stop it for
    						// everyone via native `stopPropagation()`. This is not a problem for
    						// focus/blur which don't bubble, but it does also stop click on checkboxes
    						// and radios. We accept this limitation.
    						event.stopPropagation();
    						event.isImmediatePropagationStopped = returnTrue;
    					}
    				}
    			} );
    		}

    		jQuery.removeEvent = function( elem, type, handle ) {

    			// This "if" is needed for plain objects
    			if ( elem.removeEventListener ) {
    				elem.removeEventListener( type, handle );
    			}
    		};

    		jQuery.Event = function( src, props ) {

    			// Allow instantiation without the 'new' keyword
    			if ( !( this instanceof jQuery.Event ) ) {
    				return new jQuery.Event( src, props );
    			}

    			// Event object
    			if ( src && src.type ) {
    				this.originalEvent = src;
    				this.type = src.type;

    				// Events bubbling up the document may have been marked as prevented
    				// by a handler lower down the tree; reflect the correct value.
    				this.isDefaultPrevented = src.defaultPrevented ||
    						src.defaultPrevented === undefined &&

    						// Support: Android <=2.3 only
    						src.returnValue === false ?
    					returnTrue :
    					returnFalse;

    				// Create target properties
    				// Support: Safari <=6 - 7 only
    				// Target should not be a text node (trac-504, trac-13143)
    				this.target = ( src.target && src.target.nodeType === 3 ) ?
    					src.target.parentNode :
    					src.target;

    				this.currentTarget = src.currentTarget;
    				this.relatedTarget = src.relatedTarget;

    			// Event type
    			} else {
    				this.type = src;
    			}

    			// Put explicitly provided properties onto the event object
    			if ( props ) {
    				jQuery.extend( this, props );
    			}

    			// Create a timestamp if incoming event doesn't have one
    			this.timeStamp = src && src.timeStamp || Date.now();

    			// Mark it as fixed
    			this[ jQuery.expando ] = true;
    		};

    		// jQuery.Event is based on DOM3 Events as specified by the ECMAScript Language Binding
    		// https://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
    		jQuery.Event.prototype = {
    			constructor: jQuery.Event,
    			isDefaultPrevented: returnFalse,
    			isPropagationStopped: returnFalse,
    			isImmediatePropagationStopped: returnFalse,
    			isSimulated: false,

    			preventDefault: function() {
    				var e = this.originalEvent;

    				this.isDefaultPrevented = returnTrue;

    				if ( e && !this.isSimulated ) {
    					e.preventDefault();
    				}
    			},
    			stopPropagation: function() {
    				var e = this.originalEvent;

    				this.isPropagationStopped = returnTrue;

    				if ( e && !this.isSimulated ) {
    					e.stopPropagation();
    				}
    			},
    			stopImmediatePropagation: function() {
    				var e = this.originalEvent;

    				this.isImmediatePropagationStopped = returnTrue;

    				if ( e && !this.isSimulated ) {
    					e.stopImmediatePropagation();
    				}

    				this.stopPropagation();
    			}
    		};

    		// Includes all common event props including KeyEvent and MouseEvent specific props
    		jQuery.each( {
    			altKey: true,
    			bubbles: true,
    			cancelable: true,
    			changedTouches: true,
    			ctrlKey: true,
    			detail: true,
    			eventPhase: true,
    			metaKey: true,
    			pageX: true,
    			pageY: true,
    			shiftKey: true,
    			view: true,
    			"char": true,
    			code: true,
    			charCode: true,
    			key: true,
    			keyCode: true,
    			button: true,
    			buttons: true,
    			clientX: true,
    			clientY: true,
    			offsetX: true,
    			offsetY: true,
    			pointerId: true,
    			pointerType: true,
    			screenX: true,
    			screenY: true,
    			targetTouches: true,
    			toElement: true,
    			touches: true,
    			which: true
    		}, jQuery.event.addProp );

    		jQuery.each( { focus: "focusin", blur: "focusout" }, function( type, delegateType ) {

    			function focusMappedHandler( nativeEvent ) {
    				if ( document.documentMode ) {

    					// Support: IE 11+
    					// Attach a single focusin/focusout handler on the document while someone wants
    					// focus/blur. This is because the former are synchronous in IE while the latter
    					// are async. In other browsers, all those handlers are invoked synchronously.

    					// `handle` from private data would already wrap the event, but we need
    					// to change the `type` here.
    					var handle = dataPriv.get( this, "handle" ),
    						event = jQuery.event.fix( nativeEvent );
    					event.type = nativeEvent.type === "focusin" ? "focus" : "blur";
    					event.isSimulated = true;

    					// First, handle focusin/focusout
    					handle( nativeEvent );

    					// ...then, handle focus/blur
    					//
    					// focus/blur don't bubble while focusin/focusout do; simulate the former by only
    					// invoking the handler at the lower level.
    					if ( event.target === event.currentTarget ) {

    						// The setup part calls `leverageNative`, which, in turn, calls
    						// `jQuery.event.add`, so event handle will already have been set
    						// by this point.
    						handle( event );
    					}
    				} else {

    					// For non-IE browsers, attach a single capturing handler on the document
    					// while someone wants focusin/focusout.
    					jQuery.event.simulate( delegateType, nativeEvent.target,
    						jQuery.event.fix( nativeEvent ) );
    				}
    			}

    			jQuery.event.special[ type ] = {

    				// Utilize native event if possible so blur/focus sequence is correct
    				setup: function() {

    					var attaches;

    					// Claim the first handler
    					// dataPriv.set( this, "focus", ... )
    					// dataPriv.set( this, "blur", ... )
    					leverageNative( this, type, true );

    					if ( document.documentMode ) {

    						// Support: IE 9 - 11+
    						// We use the same native handler for focusin & focus (and focusout & blur)
    						// so we need to coordinate setup & teardown parts between those events.
    						// Use `delegateType` as the key as `type` is already used by `leverageNative`.
    						attaches = dataPriv.get( this, delegateType );
    						if ( !attaches ) {
    							this.addEventListener( delegateType, focusMappedHandler );
    						}
    						dataPriv.set( this, delegateType, ( attaches || 0 ) + 1 );
    					} else {

    						// Return false to allow normal processing in the caller
    						return false;
    					}
    				},
    				trigger: function() {

    					// Force setup before trigger
    					leverageNative( this, type );

    					// Return non-false to allow normal event-path propagation
    					return true;
    				},

    				teardown: function() {
    					var attaches;

    					if ( document.documentMode ) {
    						attaches = dataPriv.get( this, delegateType ) - 1;
    						if ( !attaches ) {
    							this.removeEventListener( delegateType, focusMappedHandler );
    							dataPriv.remove( this, delegateType );
    						} else {
    							dataPriv.set( this, delegateType, attaches );
    						}
    					} else {

    						// Return false to indicate standard teardown should be applied
    						return false;
    					}
    				},

    				// Suppress native focus or blur if we're currently inside
    				// a leveraged native-event stack
    				_default: function( event ) {
    					return dataPriv.get( event.target, type );
    				},

    				delegateType: delegateType
    			};

    			// Support: Firefox <=44
    			// Firefox doesn't have focus(in | out) events
    			// Related ticket - https://bugzilla.mozilla.org/show_bug.cgi?id=687787
    			//
    			// Support: Chrome <=48 - 49, Safari <=9.0 - 9.1
    			// focus(in | out) events fire after focus & blur events,
    			// which is spec violation - http://www.w3.org/TR/DOM-Level-3-Events/#events-focusevent-event-order
    			// Related ticket - https://bugs.chromium.org/p/chromium/issues/detail?id=449857
    			//
    			// Support: IE 9 - 11+
    			// To preserve relative focusin/focus & focusout/blur event order guaranteed on the 3.x branch,
    			// attach a single handler for both events in IE.
    			jQuery.event.special[ delegateType ] = {
    				setup: function() {

    					// Handle: regular nodes (via `this.ownerDocument`), window
    					// (via `this.document`) & document (via `this`).
    					var doc = this.ownerDocument || this.document || this,
    						dataHolder = document.documentMode ? this : doc,
    						attaches = dataPriv.get( dataHolder, delegateType );

    					// Support: IE 9 - 11+
    					// We use the same native handler for focusin & focus (and focusout & blur)
    					// so we need to coordinate setup & teardown parts between those events.
    					// Use `delegateType` as the key as `type` is already used by `leverageNative`.
    					if ( !attaches ) {
    						if ( document.documentMode ) {
    							this.addEventListener( delegateType, focusMappedHandler );
    						} else {
    							doc.addEventListener( type, focusMappedHandler, true );
    						}
    					}
    					dataPriv.set( dataHolder, delegateType, ( attaches || 0 ) + 1 );
    				},
    				teardown: function() {
    					var doc = this.ownerDocument || this.document || this,
    						dataHolder = document.documentMode ? this : doc,
    						attaches = dataPriv.get( dataHolder, delegateType ) - 1;

    					if ( !attaches ) {
    						if ( document.documentMode ) {
    							this.removeEventListener( delegateType, focusMappedHandler );
    						} else {
    							doc.removeEventListener( type, focusMappedHandler, true );
    						}
    						dataPriv.remove( dataHolder, delegateType );
    					} else {
    						dataPriv.set( dataHolder, delegateType, attaches );
    					}
    				}
    			};
    		} );

    		// Create mouseenter/leave events using mouseover/out and event-time checks
    		// so that event delegation works in jQuery.
    		// Do the same for pointerenter/pointerleave and pointerover/pointerout
    		//
    		// Support: Safari 7 only
    		// Safari sends mouseenter too often; see:
    		// https://bugs.chromium.org/p/chromium/issues/detail?id=470258
    		// for the description of the bug (it existed in older Chrome versions as well).
    		jQuery.each( {
    			mouseenter: "mouseover",
    			mouseleave: "mouseout",
    			pointerenter: "pointerover",
    			pointerleave: "pointerout"
    		}, function( orig, fix ) {
    			jQuery.event.special[ orig ] = {
    				delegateType: fix,
    				bindType: fix,

    				handle: function( event ) {
    					var ret,
    						target = this,
    						related = event.relatedTarget,
    						handleObj = event.handleObj;

    					// For mouseenter/leave call the handler if related is outside the target.
    					// NB: No relatedTarget if the mouse left/entered the browser window
    					if ( !related || ( related !== target && !jQuery.contains( target, related ) ) ) {
    						event.type = handleObj.origType;
    						ret = handleObj.handler.apply( this, arguments );
    						event.type = fix;
    					}
    					return ret;
    				}
    			};
    		} );

    		jQuery.fn.extend( {

    			on: function( types, selector, data, fn ) {
    				return on( this, types, selector, data, fn );
    			},
    			one: function( types, selector, data, fn ) {
    				return on( this, types, selector, data, fn, 1 );
    			},
    			off: function( types, selector, fn ) {
    				var handleObj, type;
    				if ( types && types.preventDefault && types.handleObj ) {

    					// ( event )  dispatched jQuery.Event
    					handleObj = types.handleObj;
    					jQuery( types.delegateTarget ).off(
    						handleObj.namespace ?
    							handleObj.origType + "." + handleObj.namespace :
    							handleObj.origType,
    						handleObj.selector,
    						handleObj.handler
    					);
    					return this;
    				}
    				if ( typeof types === "object" ) {

    					// ( types-object [, selector] )
    					for ( type in types ) {
    						this.off( type, selector, types[ type ] );
    					}
    					return this;
    				}
    				if ( selector === false || typeof selector === "function" ) {

    					// ( types [, fn] )
    					fn = selector;
    					selector = undefined;
    				}
    				if ( fn === false ) {
    					fn = returnFalse;
    				}
    				return this.each( function() {
    					jQuery.event.remove( this, types, fn, selector );
    				} );
    			}
    		} );


    		var

    			// Support: IE <=10 - 11, Edge 12 - 13 only
    			// In IE/Edge using regex groups here causes severe slowdowns.
    			// See https://connect.microsoft.com/IE/feedback/details/1736512/
    			rnoInnerhtml = /<script|<style|<link/i,

    			// checked="checked" or checked
    			rchecked = /checked\s*(?:[^=]|=\s*.checked.)/i,

    			rcleanScript = /^\s*<!\[CDATA\[|\]\]>\s*$/g;

    		// Prefer a tbody over its parent table for containing new rows
    		function manipulationTarget( elem, content ) {
    			if ( nodeName( elem, "table" ) &&
    				nodeName( content.nodeType !== 11 ? content : content.firstChild, "tr" ) ) {

    				return jQuery( elem ).children( "tbody" )[ 0 ] || elem;
    			}

    			return elem;
    		}

    		// Replace/restore the type attribute of script elements for safe DOM manipulation
    		function disableScript( elem ) {
    			elem.type = ( elem.getAttribute( "type" ) !== null ) + "/" + elem.type;
    			return elem;
    		}
    		function restoreScript( elem ) {
    			if ( ( elem.type || "" ).slice( 0, 5 ) === "true/" ) {
    				elem.type = elem.type.slice( 5 );
    			} else {
    				elem.removeAttribute( "type" );
    			}

    			return elem;
    		}

    		function cloneCopyEvent( src, dest ) {
    			var i, l, type, pdataOld, udataOld, udataCur, events;

    			if ( dest.nodeType !== 1 ) {
    				return;
    			}

    			// 1. Copy private data: events, handlers, etc.
    			if ( dataPriv.hasData( src ) ) {
    				pdataOld = dataPriv.get( src );
    				events = pdataOld.events;

    				if ( events ) {
    					dataPriv.remove( dest, "handle events" );

    					for ( type in events ) {
    						for ( i = 0, l = events[ type ].length; i < l; i++ ) {
    							jQuery.event.add( dest, type, events[ type ][ i ] );
    						}
    					}
    				}
    			}

    			// 2. Copy user data
    			if ( dataUser.hasData( src ) ) {
    				udataOld = dataUser.access( src );
    				udataCur = jQuery.extend( {}, udataOld );

    				dataUser.set( dest, udataCur );
    			}
    		}

    		// Fix IE bugs, see support tests
    		function fixInput( src, dest ) {
    			var nodeName = dest.nodeName.toLowerCase();

    			// Fails to persist the checked state of a cloned checkbox or radio button.
    			if ( nodeName === "input" && rcheckableType.test( src.type ) ) {
    				dest.checked = src.checked;

    			// Fails to return the selected option to the default selected state when cloning options
    			} else if ( nodeName === "input" || nodeName === "textarea" ) {
    				dest.defaultValue = src.defaultValue;
    			}
    		}

    		function domManip( collection, args, callback, ignored ) {

    			// Flatten any nested arrays
    			args = flat( args );

    			var fragment, first, scripts, hasScripts, node, doc,
    				i = 0,
    				l = collection.length,
    				iNoClone = l - 1,
    				value = args[ 0 ],
    				valueIsFunction = isFunction( value );

    			// We can't cloneNode fragments that contain checked, in WebKit
    			if ( valueIsFunction ||
    					( l > 1 && typeof value === "string" &&
    						!support.checkClone && rchecked.test( value ) ) ) {
    				return collection.each( function( index ) {
    					var self = collection.eq( index );
    					if ( valueIsFunction ) {
    						args[ 0 ] = value.call( this, index, self.html() );
    					}
    					domManip( self, args, callback, ignored );
    				} );
    			}

    			if ( l ) {
    				fragment = buildFragment( args, collection[ 0 ].ownerDocument, false, collection, ignored );
    				first = fragment.firstChild;

    				if ( fragment.childNodes.length === 1 ) {
    					fragment = first;
    				}

    				// Require either new content or an interest in ignored elements to invoke the callback
    				if ( first || ignored ) {
    					scripts = jQuery.map( getAll( fragment, "script" ), disableScript );
    					hasScripts = scripts.length;

    					// Use the original fragment for the last item
    					// instead of the first because it can end up
    					// being emptied incorrectly in certain situations (trac-8070).
    					for ( ; i < l; i++ ) {
    						node = fragment;

    						if ( i !== iNoClone ) {
    							node = jQuery.clone( node, true, true );

    							// Keep references to cloned scripts for later restoration
    							if ( hasScripts ) {

    								// Support: Android <=4.0 only, PhantomJS 1 only
    								// push.apply(_, arraylike) throws on ancient WebKit
    								jQuery.merge( scripts, getAll( node, "script" ) );
    							}
    						}

    						callback.call( collection[ i ], node, i );
    					}

    					if ( hasScripts ) {
    						doc = scripts[ scripts.length - 1 ].ownerDocument;

    						// Re-enable scripts
    						jQuery.map( scripts, restoreScript );

    						// Evaluate executable scripts on first document insertion
    						for ( i = 0; i < hasScripts; i++ ) {
    							node = scripts[ i ];
    							if ( rscriptType.test( node.type || "" ) &&
    								!dataPriv.access( node, "globalEval" ) &&
    								jQuery.contains( doc, node ) ) {

    								if ( node.src && ( node.type || "" ).toLowerCase()  !== "module" ) {

    									// Optional AJAX dependency, but won't run scripts if not present
    									if ( jQuery._evalUrl && !node.noModule ) {
    										jQuery._evalUrl( node.src, {
    											nonce: node.nonce || node.getAttribute( "nonce" )
    										}, doc );
    									}
    								} else {

    									// Unwrap a CDATA section containing script contents. This shouldn't be
    									// needed as in XML documents they're already not visible when
    									// inspecting element contents and in HTML documents they have no
    									// meaning but we're preserving that logic for backwards compatibility.
    									// This will be removed completely in 4.0. See gh-4904.
    									DOMEval( node.textContent.replace( rcleanScript, "" ), node, doc );
    								}
    							}
    						}
    					}
    				}
    			}

    			return collection;
    		}

    		function remove( elem, selector, keepData ) {
    			var node,
    				nodes = selector ? jQuery.filter( selector, elem ) : elem,
    				i = 0;

    			for ( ; ( node = nodes[ i ] ) != null; i++ ) {
    				if ( !keepData && node.nodeType === 1 ) {
    					jQuery.cleanData( getAll( node ) );
    				}

    				if ( node.parentNode ) {
    					if ( keepData && isAttached( node ) ) {
    						setGlobalEval( getAll( node, "script" ) );
    					}
    					node.parentNode.removeChild( node );
    				}
    			}

    			return elem;
    		}

    		jQuery.extend( {
    			htmlPrefilter: function( html ) {
    				return html;
    			},

    			clone: function( elem, dataAndEvents, deepDataAndEvents ) {
    				var i, l, srcElements, destElements,
    					clone = elem.cloneNode( true ),
    					inPage = isAttached( elem );

    				// Fix IE cloning issues
    				if ( !support.noCloneChecked && ( elem.nodeType === 1 || elem.nodeType === 11 ) &&
    						!jQuery.isXMLDoc( elem ) ) {

    					// We eschew jQuery#find here for performance reasons:
    					// https://jsperf.com/getall-vs-sizzle/2
    					destElements = getAll( clone );
    					srcElements = getAll( elem );

    					for ( i = 0, l = srcElements.length; i < l; i++ ) {
    						fixInput( srcElements[ i ], destElements[ i ] );
    					}
    				}

    				// Copy the events from the original to the clone
    				if ( dataAndEvents ) {
    					if ( deepDataAndEvents ) {
    						srcElements = srcElements || getAll( elem );
    						destElements = destElements || getAll( clone );

    						for ( i = 0, l = srcElements.length; i < l; i++ ) {
    							cloneCopyEvent( srcElements[ i ], destElements[ i ] );
    						}
    					} else {
    						cloneCopyEvent( elem, clone );
    					}
    				}

    				// Preserve script evaluation history
    				destElements = getAll( clone, "script" );
    				if ( destElements.length > 0 ) {
    					setGlobalEval( destElements, !inPage && getAll( elem, "script" ) );
    				}

    				// Return the cloned set
    				return clone;
    			},

    			cleanData: function( elems ) {
    				var data, elem, type,
    					special = jQuery.event.special,
    					i = 0;

    				for ( ; ( elem = elems[ i ] ) !== undefined; i++ ) {
    					if ( acceptData( elem ) ) {
    						if ( ( data = elem[ dataPriv.expando ] ) ) {
    							if ( data.events ) {
    								for ( type in data.events ) {
    									if ( special[ type ] ) {
    										jQuery.event.remove( elem, type );

    									// This is a shortcut to avoid jQuery.event.remove's overhead
    									} else {
    										jQuery.removeEvent( elem, type, data.handle );
    									}
    								}
    							}

    							// Support: Chrome <=35 - 45+
    							// Assign undefined instead of using delete, see Data#remove
    							elem[ dataPriv.expando ] = undefined;
    						}
    						if ( elem[ dataUser.expando ] ) {

    							// Support: Chrome <=35 - 45+
    							// Assign undefined instead of using delete, see Data#remove
    							elem[ dataUser.expando ] = undefined;
    						}
    					}
    				}
    			}
    		} );

    		jQuery.fn.extend( {
    			detach: function( selector ) {
    				return remove( this, selector, true );
    			},

    			remove: function( selector ) {
    				return remove( this, selector );
    			},

    			text: function( value ) {
    				return access( this, function( value ) {
    					return value === undefined ?
    						jQuery.text( this ) :
    						this.empty().each( function() {
    							if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
    								this.textContent = value;
    							}
    						} );
    				}, null, value, arguments.length );
    			},

    			append: function() {
    				return domManip( this, arguments, function( elem ) {
    					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
    						var target = manipulationTarget( this, elem );
    						target.appendChild( elem );
    					}
    				} );
    			},

    			prepend: function() {
    				return domManip( this, arguments, function( elem ) {
    					if ( this.nodeType === 1 || this.nodeType === 11 || this.nodeType === 9 ) {
    						var target = manipulationTarget( this, elem );
    						target.insertBefore( elem, target.firstChild );
    					}
    				} );
    			},

    			before: function() {
    				return domManip( this, arguments, function( elem ) {
    					if ( this.parentNode ) {
    						this.parentNode.insertBefore( elem, this );
    					}
    				} );
    			},

    			after: function() {
    				return domManip( this, arguments, function( elem ) {
    					if ( this.parentNode ) {
    						this.parentNode.insertBefore( elem, this.nextSibling );
    					}
    				} );
    			},

    			empty: function() {
    				var elem,
    					i = 0;

    				for ( ; ( elem = this[ i ] ) != null; i++ ) {
    					if ( elem.nodeType === 1 ) {

    						// Prevent memory leaks
    						jQuery.cleanData( getAll( elem, false ) );

    						// Remove any remaining nodes
    						elem.textContent = "";
    					}
    				}

    				return this;
    			},

    			clone: function( dataAndEvents, deepDataAndEvents ) {
    				dataAndEvents = dataAndEvents == null ? false : dataAndEvents;
    				deepDataAndEvents = deepDataAndEvents == null ? dataAndEvents : deepDataAndEvents;

    				return this.map( function() {
    					return jQuery.clone( this, dataAndEvents, deepDataAndEvents );
    				} );
    			},

    			html: function( value ) {
    				return access( this, function( value ) {
    					var elem = this[ 0 ] || {},
    						i = 0,
    						l = this.length;

    					if ( value === undefined && elem.nodeType === 1 ) {
    						return elem.innerHTML;
    					}

    					// See if we can take a shortcut and just use innerHTML
    					if ( typeof value === "string" && !rnoInnerhtml.test( value ) &&
    						!wrapMap[ ( rtagName.exec( value ) || [ "", "" ] )[ 1 ].toLowerCase() ] ) {

    						value = jQuery.htmlPrefilter( value );

    						try {
    							for ( ; i < l; i++ ) {
    								elem = this[ i ] || {};

    								// Remove element nodes and prevent memory leaks
    								if ( elem.nodeType === 1 ) {
    									jQuery.cleanData( getAll( elem, false ) );
    									elem.innerHTML = value;
    								}
    							}

    							elem = 0;

    						// If using innerHTML throws an exception, use the fallback method
    						} catch ( e ) {}
    					}

    					if ( elem ) {
    						this.empty().append( value );
    					}
    				}, null, value, arguments.length );
    			},

    			replaceWith: function() {
    				var ignored = [];

    				// Make the changes, replacing each non-ignored context element with the new content
    				return domManip( this, arguments, function( elem ) {
    					var parent = this.parentNode;

    					if ( jQuery.inArray( this, ignored ) < 0 ) {
    						jQuery.cleanData( getAll( this ) );
    						if ( parent ) {
    							parent.replaceChild( elem, this );
    						}
    					}

    				// Force callback invocation
    				}, ignored );
    			}
    		} );

    		jQuery.each( {
    			appendTo: "append",
    			prependTo: "prepend",
    			insertBefore: "before",
    			insertAfter: "after",
    			replaceAll: "replaceWith"
    		}, function( name, original ) {
    			jQuery.fn[ name ] = function( selector ) {
    				var elems,
    					ret = [],
    					insert = jQuery( selector ),
    					last = insert.length - 1,
    					i = 0;

    				for ( ; i <= last; i++ ) {
    					elems = i === last ? this : this.clone( true );
    					jQuery( insert[ i ] )[ original ]( elems );

    					// Support: Android <=4.0 only, PhantomJS 1 only
    					// .get() because push.apply(_, arraylike) throws on ancient WebKit
    					push.apply( ret, elems.get() );
    				}

    				return this.pushStack( ret );
    			};
    		} );
    		var rnumnonpx = new RegExp( "^(" + pnum + ")(?!px)[a-z%]+$", "i" );

    		var rcustomProp = /^--/;


    		var getStyles = function( elem ) {

    				// Support: IE <=11 only, Firefox <=30 (trac-15098, trac-14150)
    				// IE throws on elements created in popups
    				// FF meanwhile throws on frame elements through "defaultView.getComputedStyle"
    				var view = elem.ownerDocument.defaultView;

    				if ( !view || !view.opener ) {
    					view = window;
    				}

    				return view.getComputedStyle( elem );
    			};

    		var swap = function( elem, options, callback ) {
    			var ret, name,
    				old = {};

    			// Remember the old values, and insert the new ones
    			for ( name in options ) {
    				old[ name ] = elem.style[ name ];
    				elem.style[ name ] = options[ name ];
    			}

    			ret = callback.call( elem );

    			// Revert the old values
    			for ( name in options ) {
    				elem.style[ name ] = old[ name ];
    			}

    			return ret;
    		};


    		var rboxStyle = new RegExp( cssExpand.join( "|" ), "i" );



    		( function() {

    			// Executing both pixelPosition & boxSizingReliable tests require only one layout
    			// so they're executed at the same time to save the second computation.
    			function computeStyleTests() {

    				// This is a singleton, we need to execute it only once
    				if ( !div ) {
    					return;
    				}

    				container.style.cssText = "position:absolute;left:-11111px;width:60px;" +
    					"margin-top:1px;padding:0;border:0";
    				div.style.cssText =
    					"position:relative;display:block;box-sizing:border-box;overflow:scroll;" +
    					"margin:auto;border:1px;padding:1px;" +
    					"width:60%;top:1%";
    				documentElement.appendChild( container ).appendChild( div );

    				var divStyle = window.getComputedStyle( div );
    				pixelPositionVal = divStyle.top !== "1%";

    				// Support: Android 4.0 - 4.3 only, Firefox <=3 - 44
    				reliableMarginLeftVal = roundPixelMeasures( divStyle.marginLeft ) === 12;

    				// Support: Android 4.0 - 4.3 only, Safari <=9.1 - 10.1, iOS <=7.0 - 9.3
    				// Some styles come back with percentage values, even though they shouldn't
    				div.style.right = "60%";
    				pixelBoxStylesVal = roundPixelMeasures( divStyle.right ) === 36;

    				// Support: IE 9 - 11 only
    				// Detect misreporting of content dimensions for box-sizing:border-box elements
    				boxSizingReliableVal = roundPixelMeasures( divStyle.width ) === 36;

    				// Support: IE 9 only
    				// Detect overflow:scroll screwiness (gh-3699)
    				// Support: Chrome <=64
    				// Don't get tricked when zoom affects offsetWidth (gh-4029)
    				div.style.position = "absolute";
    				scrollboxSizeVal = roundPixelMeasures( div.offsetWidth / 3 ) === 12;

    				documentElement.removeChild( container );

    				// Nullify the div so it wouldn't be stored in the memory and
    				// it will also be a sign that checks already performed
    				div = null;
    			}

    			function roundPixelMeasures( measure ) {
    				return Math.round( parseFloat( measure ) );
    			}

    			var pixelPositionVal, boxSizingReliableVal, scrollboxSizeVal, pixelBoxStylesVal,
    				reliableTrDimensionsVal, reliableMarginLeftVal,
    				container = document.createElement( "div" ),
    				div = document.createElement( "div" );

    			// Finish early in limited (non-browser) environments
    			if ( !div.style ) {
    				return;
    			}

    			// Support: IE <=9 - 11 only
    			// Style of cloned element affects source element cloned (trac-8908)
    			div.style.backgroundClip = "content-box";
    			div.cloneNode( true ).style.backgroundClip = "";
    			support.clearCloneStyle = div.style.backgroundClip === "content-box";

    			jQuery.extend( support, {
    				boxSizingReliable: function() {
    					computeStyleTests();
    					return boxSizingReliableVal;
    				},
    				pixelBoxStyles: function() {
    					computeStyleTests();
    					return pixelBoxStylesVal;
    				},
    				pixelPosition: function() {
    					computeStyleTests();
    					return pixelPositionVal;
    				},
    				reliableMarginLeft: function() {
    					computeStyleTests();
    					return reliableMarginLeftVal;
    				},
    				scrollboxSize: function() {
    					computeStyleTests();
    					return scrollboxSizeVal;
    				},

    				// Support: IE 9 - 11+, Edge 15 - 18+
    				// IE/Edge misreport `getComputedStyle` of table rows with width/height
    				// set in CSS while `offset*` properties report correct values.
    				// Behavior in IE 9 is more subtle than in newer versions & it passes
    				// some versions of this test; make sure not to make it pass there!
    				//
    				// Support: Firefox 70+
    				// Only Firefox includes border widths
    				// in computed dimensions. (gh-4529)
    				reliableTrDimensions: function() {
    					var table, tr, trChild, trStyle;
    					if ( reliableTrDimensionsVal == null ) {
    						table = document.createElement( "table" );
    						tr = document.createElement( "tr" );
    						trChild = document.createElement( "div" );

    						table.style.cssText = "position:absolute;left:-11111px;border-collapse:separate";
    						tr.style.cssText = "box-sizing:content-box;border:1px solid";

    						// Support: Chrome 86+
    						// Height set through cssText does not get applied.
    						// Computed height then comes back as 0.
    						tr.style.height = "1px";
    						trChild.style.height = "9px";

    						// Support: Android 8 Chrome 86+
    						// In our bodyBackground.html iframe,
    						// display for all div elements is set to "inline",
    						// which causes a problem only in Android 8 Chrome 86.
    						// Ensuring the div is `display: block`
    						// gets around this issue.
    						trChild.style.display = "block";

    						documentElement
    							.appendChild( table )
    							.appendChild( tr )
    							.appendChild( trChild );

    						trStyle = window.getComputedStyle( tr );
    						reliableTrDimensionsVal = ( parseInt( trStyle.height, 10 ) +
    							parseInt( trStyle.borderTopWidth, 10 ) +
    							parseInt( trStyle.borderBottomWidth, 10 ) ) === tr.offsetHeight;

    						documentElement.removeChild( table );
    					}
    					return reliableTrDimensionsVal;
    				}
    			} );
    		} )();


    		function curCSS( elem, name, computed ) {
    			var width, minWidth, maxWidth, ret,
    				isCustomProp = rcustomProp.test( name ),

    				// Support: Firefox 51+
    				// Retrieving style before computed somehow
    				// fixes an issue with getting wrong values
    				// on detached elements
    				style = elem.style;

    			computed = computed || getStyles( elem );

    			// getPropertyValue is needed for:
    			//   .css('filter') (IE 9 only, trac-12537)
    			//   .css('--customProperty) (gh-3144)
    			if ( computed ) {

    				// Support: IE <=9 - 11+
    				// IE only supports `"float"` in `getPropertyValue`; in computed styles
    				// it's only available as `"cssFloat"`. We no longer modify properties
    				// sent to `.css()` apart from camelCasing, so we need to check both.
    				// Normally, this would create difference in behavior: if
    				// `getPropertyValue` returns an empty string, the value returned
    				// by `.css()` would be `undefined`. This is usually the case for
    				// disconnected elements. However, in IE even disconnected elements
    				// with no styles return `"none"` for `getPropertyValue( "float" )`
    				ret = computed.getPropertyValue( name ) || computed[ name ];

    				if ( isCustomProp && ret ) {

    					// Support: Firefox 105+, Chrome <=105+
    					// Spec requires trimming whitespace for custom properties (gh-4926).
    					// Firefox only trims leading whitespace. Chrome just collapses
    					// both leading & trailing whitespace to a single space.
    					//
    					// Fall back to `undefined` if empty string returned.
    					// This collapses a missing definition with property defined
    					// and set to an empty string but there's no standard API
    					// allowing us to differentiate them without a performance penalty
    					// and returning `undefined` aligns with older jQuery.
    					//
    					// rtrimCSS treats U+000D CARRIAGE RETURN and U+000C FORM FEED
    					// as whitespace while CSS does not, but this is not a problem
    					// because CSS preprocessing replaces them with U+000A LINE FEED
    					// (which *is* CSS whitespace)
    					// https://www.w3.org/TR/css-syntax-3/#input-preprocessing
    					ret = ret.replace( rtrimCSS, "$1" ) || undefined;
    				}

    				if ( ret === "" && !isAttached( elem ) ) {
    					ret = jQuery.style( elem, name );
    				}

    				// A tribute to the "awesome hack by Dean Edwards"
    				// Android Browser returns percentage for some values,
    				// but width seems to be reliably pixels.
    				// This is against the CSSOM draft spec:
    				// https://drafts.csswg.org/cssom/#resolved-values
    				if ( !support.pixelBoxStyles() && rnumnonpx.test( ret ) && rboxStyle.test( name ) ) {

    					// Remember the original values
    					width = style.width;
    					minWidth = style.minWidth;
    					maxWidth = style.maxWidth;

    					// Put in the new values to get a computed value out
    					style.minWidth = style.maxWidth = style.width = ret;
    					ret = computed.width;

    					// Revert the changed values
    					style.width = width;
    					style.minWidth = minWidth;
    					style.maxWidth = maxWidth;
    				}
    			}

    			return ret !== undefined ?

    				// Support: IE <=9 - 11 only
    				// IE returns zIndex value as an integer.
    				ret + "" :
    				ret;
    		}


    		function addGetHookIf( conditionFn, hookFn ) {

    			// Define the hook, we'll check on the first run if it's really needed.
    			return {
    				get: function() {
    					if ( conditionFn() ) {

    						// Hook not needed (or it's not possible to use it due
    						// to missing dependency), remove it.
    						delete this.get;
    						return;
    					}

    					// Hook needed; redefine it so that the support test is not executed again.
    					return ( this.get = hookFn ).apply( this, arguments );
    				}
    			};
    		}


    		var cssPrefixes = [ "Webkit", "Moz", "ms" ],
    			emptyStyle = document.createElement( "div" ).style,
    			vendorProps = {};

    		// Return a vendor-prefixed property or undefined
    		function vendorPropName( name ) {

    			// Check for vendor prefixed names
    			var capName = name[ 0 ].toUpperCase() + name.slice( 1 ),
    				i = cssPrefixes.length;

    			while ( i-- ) {
    				name = cssPrefixes[ i ] + capName;
    				if ( name in emptyStyle ) {
    					return name;
    				}
    			}
    		}

    		// Return a potentially-mapped jQuery.cssProps or vendor prefixed property
    		function finalPropName( name ) {
    			var final = jQuery.cssProps[ name ] || vendorProps[ name ];

    			if ( final ) {
    				return final;
    			}
    			if ( name in emptyStyle ) {
    				return name;
    			}
    			return vendorProps[ name ] = vendorPropName( name ) || name;
    		}


    		var

    			// Swappable if display is none or starts with table
    			// except "table", "table-cell", or "table-caption"
    			// See here for display values: https://developer.mozilla.org/en-US/docs/CSS/display
    			rdisplayswap = /^(none|table(?!-c[ea]).+)/,
    			cssShow = { position: "absolute", visibility: "hidden", display: "block" },
    			cssNormalTransform = {
    				letterSpacing: "0",
    				fontWeight: "400"
    			};

    		function setPositiveNumber( _elem, value, subtract ) {

    			// Any relative (+/-) values have already been
    			// normalized at this point
    			var matches = rcssNum.exec( value );
    			return matches ?

    				// Guard against undefined "subtract", e.g., when used as in cssHooks
    				Math.max( 0, matches[ 2 ] - ( subtract || 0 ) ) + ( matches[ 3 ] || "px" ) :
    				value;
    		}

    		function boxModelAdjustment( elem, dimension, box, isBorderBox, styles, computedVal ) {
    			var i = dimension === "width" ? 1 : 0,
    				extra = 0,
    				delta = 0,
    				marginDelta = 0;

    			// Adjustment may not be necessary
    			if ( box === ( isBorderBox ? "border" : "content" ) ) {
    				return 0;
    			}

    			for ( ; i < 4; i += 2 ) {

    				// Both box models exclude margin
    				// Count margin delta separately to only add it after scroll gutter adjustment.
    				// This is needed to make negative margins work with `outerHeight( true )` (gh-3982).
    				if ( box === "margin" ) {
    					marginDelta += jQuery.css( elem, box + cssExpand[ i ], true, styles );
    				}

    				// If we get here with a content-box, we're seeking "padding" or "border" or "margin"
    				if ( !isBorderBox ) {

    					// Add padding
    					delta += jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );

    					// For "border" or "margin", add border
    					if ( box !== "padding" ) {
    						delta += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );

    					// But still keep track of it otherwise
    					} else {
    						extra += jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
    					}

    				// If we get here with a border-box (content + padding + border), we're seeking "content" or
    				// "padding" or "margin"
    				} else {

    					// For "content", subtract padding
    					if ( box === "content" ) {
    						delta -= jQuery.css( elem, "padding" + cssExpand[ i ], true, styles );
    					}

    					// For "content" or "padding", subtract border
    					if ( box !== "margin" ) {
    						delta -= jQuery.css( elem, "border" + cssExpand[ i ] + "Width", true, styles );
    					}
    				}
    			}

    			// Account for positive content-box scroll gutter when requested by providing computedVal
    			if ( !isBorderBox && computedVal >= 0 ) {

    				// offsetWidth/offsetHeight is a rounded sum of content, padding, scroll gutter, and border
    				// Assuming integer scroll gutter, subtract the rest and round down
    				delta += Math.max( 0, Math.ceil(
    					elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
    					computedVal -
    					delta -
    					extra -
    					0.5

    				// If offsetWidth/offsetHeight is unknown, then we can't determine content-box scroll gutter
    				// Use an explicit zero to avoid NaN (gh-3964)
    				) ) || 0;
    			}

    			return delta + marginDelta;
    		}

    		function getWidthOrHeight( elem, dimension, extra ) {

    			// Start with computed style
    			var styles = getStyles( elem ),

    				// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-4322).
    				// Fake content-box until we know it's needed to know the true value.
    				boxSizingNeeded = !support.boxSizingReliable() || extra,
    				isBorderBox = boxSizingNeeded &&
    					jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
    				valueIsBorderBox = isBorderBox,

    				val = curCSS( elem, dimension, styles ),
    				offsetProp = "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 );

    			// Support: Firefox <=54
    			// Return a confounding non-pixel value or feign ignorance, as appropriate.
    			if ( rnumnonpx.test( val ) ) {
    				if ( !extra ) {
    					return val;
    				}
    				val = "auto";
    			}


    			// Support: IE 9 - 11 only
    			// Use offsetWidth/offsetHeight for when box sizing is unreliable.
    			// In those cases, the computed value can be trusted to be border-box.
    			if ( ( !support.boxSizingReliable() && isBorderBox ||

    				// Support: IE 10 - 11+, Edge 15 - 18+
    				// IE/Edge misreport `getComputedStyle` of table rows with width/height
    				// set in CSS while `offset*` properties report correct values.
    				// Interestingly, in some cases IE 9 doesn't suffer from this issue.
    				!support.reliableTrDimensions() && nodeName( elem, "tr" ) ||

    				// Fall back to offsetWidth/offsetHeight when value is "auto"
    				// This happens for inline elements with no explicit setting (gh-3571)
    				val === "auto" ||

    				// Support: Android <=4.1 - 4.3 only
    				// Also use offsetWidth/offsetHeight for misreported inline dimensions (gh-3602)
    				!parseFloat( val ) && jQuery.css( elem, "display", false, styles ) === "inline" ) &&

    				// Make sure the element is visible & connected
    				elem.getClientRects().length ) {

    				isBorderBox = jQuery.css( elem, "boxSizing", false, styles ) === "border-box";

    				// Where available, offsetWidth/offsetHeight approximate border box dimensions.
    				// Where not available (e.g., SVG), assume unreliable box-sizing and interpret the
    				// retrieved value as a content box dimension.
    				valueIsBorderBox = offsetProp in elem;
    				if ( valueIsBorderBox ) {
    					val = elem[ offsetProp ];
    				}
    			}

    			// Normalize "" and auto
    			val = parseFloat( val ) || 0;

    			// Adjust for the element's box model
    			return ( val +
    				boxModelAdjustment(
    					elem,
    					dimension,
    					extra || ( isBorderBox ? "border" : "content" ),
    					valueIsBorderBox,
    					styles,

    					// Provide the current computed size to request scroll gutter calculation (gh-3589)
    					val
    				)
    			) + "px";
    		}

    		jQuery.extend( {

    			// Add in style property hooks for overriding the default
    			// behavior of getting and setting a style property
    			cssHooks: {
    				opacity: {
    					get: function( elem, computed ) {
    						if ( computed ) {

    							// We should always get a number back from opacity
    							var ret = curCSS( elem, "opacity" );
    							return ret === "" ? "1" : ret;
    						}
    					}
    				}
    			},

    			// Don't automatically add "px" to these possibly-unitless properties
    			cssNumber: {
    				animationIterationCount: true,
    				aspectRatio: true,
    				borderImageSlice: true,
    				columnCount: true,
    				flexGrow: true,
    				flexShrink: true,
    				fontWeight: true,
    				gridArea: true,
    				gridColumn: true,
    				gridColumnEnd: true,
    				gridColumnStart: true,
    				gridRow: true,
    				gridRowEnd: true,
    				gridRowStart: true,
    				lineHeight: true,
    				opacity: true,
    				order: true,
    				orphans: true,
    				scale: true,
    				widows: true,
    				zIndex: true,
    				zoom: true,

    				// SVG-related
    				fillOpacity: true,
    				floodOpacity: true,
    				stopOpacity: true,
    				strokeMiterlimit: true,
    				strokeOpacity: true
    			},

    			// Add in properties whose names you wish to fix before
    			// setting or getting the value
    			cssProps: {},

    			// Get and set the style property on a DOM Node
    			style: function( elem, name, value, extra ) {

    				// Don't set styles on text and comment nodes
    				if ( !elem || elem.nodeType === 3 || elem.nodeType === 8 || !elem.style ) {
    					return;
    				}

    				// Make sure that we're working with the right name
    				var ret, type, hooks,
    					origName = camelCase( name ),
    					isCustomProp = rcustomProp.test( name ),
    					style = elem.style;

    				// Make sure that we're working with the right name. We don't
    				// want to query the value if it is a CSS custom property
    				// since they are user-defined.
    				if ( !isCustomProp ) {
    					name = finalPropName( origName );
    				}

    				// Gets hook for the prefixed version, then unprefixed version
    				hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

    				// Check if we're setting a value
    				if ( value !== undefined ) {
    					type = typeof value;

    					// Convert "+=" or "-=" to relative numbers (trac-7345)
    					if ( type === "string" && ( ret = rcssNum.exec( value ) ) && ret[ 1 ] ) {
    						value = adjustCSS( elem, name, ret );

    						// Fixes bug trac-9237
    						type = "number";
    					}

    					// Make sure that null and NaN values aren't set (trac-7116)
    					if ( value == null || value !== value ) {
    						return;
    					}

    					// If a number was passed in, add the unit (except for certain CSS properties)
    					// The isCustomProp check can be removed in jQuery 4.0 when we only auto-append
    					// "px" to a few hardcoded values.
    					if ( type === "number" && !isCustomProp ) {
    						value += ret && ret[ 3 ] || ( jQuery.cssNumber[ origName ] ? "" : "px" );
    					}

    					// background-* props affect original clone's values
    					if ( !support.clearCloneStyle && value === "" && name.indexOf( "background" ) === 0 ) {
    						style[ name ] = "inherit";
    					}

    					// If a hook was provided, use that value, otherwise just set the specified value
    					if ( !hooks || !( "set" in hooks ) ||
    						( value = hooks.set( elem, value, extra ) ) !== undefined ) {

    						if ( isCustomProp ) {
    							style.setProperty( name, value );
    						} else {
    							style[ name ] = value;
    						}
    					}

    				} else {

    					// If a hook was provided get the non-computed value from there
    					if ( hooks && "get" in hooks &&
    						( ret = hooks.get( elem, false, extra ) ) !== undefined ) {

    						return ret;
    					}

    					// Otherwise just get the value from the style object
    					return style[ name ];
    				}
    			},

    			css: function( elem, name, extra, styles ) {
    				var val, num, hooks,
    					origName = camelCase( name ),
    					isCustomProp = rcustomProp.test( name );

    				// Make sure that we're working with the right name. We don't
    				// want to modify the value if it is a CSS custom property
    				// since they are user-defined.
    				if ( !isCustomProp ) {
    					name = finalPropName( origName );
    				}

    				// Try prefixed name followed by the unprefixed name
    				hooks = jQuery.cssHooks[ name ] || jQuery.cssHooks[ origName ];

    				// If a hook was provided get the computed value from there
    				if ( hooks && "get" in hooks ) {
    					val = hooks.get( elem, true, extra );
    				}

    				// Otherwise, if a way to get the computed value exists, use that
    				if ( val === undefined ) {
    					val = curCSS( elem, name, styles );
    				}

    				// Convert "normal" to computed value
    				if ( val === "normal" && name in cssNormalTransform ) {
    					val = cssNormalTransform[ name ];
    				}

    				// Make numeric if forced or a qualifier was provided and val looks numeric
    				if ( extra === "" || extra ) {
    					num = parseFloat( val );
    					return extra === true || isFinite( num ) ? num || 0 : val;
    				}

    				return val;
    			}
    		} );

    		jQuery.each( [ "height", "width" ], function( _i, dimension ) {
    			jQuery.cssHooks[ dimension ] = {
    				get: function( elem, computed, extra ) {
    					if ( computed ) {

    						// Certain elements can have dimension info if we invisibly show them
    						// but it must have a current display style that would benefit
    						return rdisplayswap.test( jQuery.css( elem, "display" ) ) &&

    							// Support: Safari 8+
    							// Table columns in Safari have non-zero offsetWidth & zero
    							// getBoundingClientRect().width unless display is changed.
    							// Support: IE <=11 only
    							// Running getBoundingClientRect on a disconnected node
    							// in IE throws an error.
    							( !elem.getClientRects().length || !elem.getBoundingClientRect().width ) ?
    							swap( elem, cssShow, function() {
    								return getWidthOrHeight( elem, dimension, extra );
    							} ) :
    							getWidthOrHeight( elem, dimension, extra );
    					}
    				},

    				set: function( elem, value, extra ) {
    					var matches,
    						styles = getStyles( elem ),

    						// Only read styles.position if the test has a chance to fail
    						// to avoid forcing a reflow.
    						scrollboxSizeBuggy = !support.scrollboxSize() &&
    							styles.position === "absolute",

    						// To avoid forcing a reflow, only fetch boxSizing if we need it (gh-3991)
    						boxSizingNeeded = scrollboxSizeBuggy || extra,
    						isBorderBox = boxSizingNeeded &&
    							jQuery.css( elem, "boxSizing", false, styles ) === "border-box",
    						subtract = extra ?
    							boxModelAdjustment(
    								elem,
    								dimension,
    								extra,
    								isBorderBox,
    								styles
    							) :
    							0;

    					// Account for unreliable border-box dimensions by comparing offset* to computed and
    					// faking a content-box to get border and padding (gh-3699)
    					if ( isBorderBox && scrollboxSizeBuggy ) {
    						subtract -= Math.ceil(
    							elem[ "offset" + dimension[ 0 ].toUpperCase() + dimension.slice( 1 ) ] -
    							parseFloat( styles[ dimension ] ) -
    							boxModelAdjustment( elem, dimension, "border", false, styles ) -
    							0.5
    						);
    					}

    					// Convert to pixels if value adjustment is needed
    					if ( subtract && ( matches = rcssNum.exec( value ) ) &&
    						( matches[ 3 ] || "px" ) !== "px" ) {

    						elem.style[ dimension ] = value;
    						value = jQuery.css( elem, dimension );
    					}

    					return setPositiveNumber( elem, value, subtract );
    				}
    			};
    		} );

    		jQuery.cssHooks.marginLeft = addGetHookIf( support.reliableMarginLeft,
    			function( elem, computed ) {
    				if ( computed ) {
    					return ( parseFloat( curCSS( elem, "marginLeft" ) ) ||
    						elem.getBoundingClientRect().left -
    							swap( elem, { marginLeft: 0 }, function() {
    								return elem.getBoundingClientRect().left;
    							} )
    					) + "px";
    				}
    			}
    		);

    		// These hooks are used by animate to expand properties
    		jQuery.each( {
    			margin: "",
    			padding: "",
    			border: "Width"
    		}, function( prefix, suffix ) {
    			jQuery.cssHooks[ prefix + suffix ] = {
    				expand: function( value ) {
    					var i = 0,
    						expanded = {},

    						// Assumes a single number if not a string
    						parts = typeof value === "string" ? value.split( " " ) : [ value ];

    					for ( ; i < 4; i++ ) {
    						expanded[ prefix + cssExpand[ i ] + suffix ] =
    							parts[ i ] || parts[ i - 2 ] || parts[ 0 ];
    					}

    					return expanded;
    				}
    			};

    			if ( prefix !== "margin" ) {
    				jQuery.cssHooks[ prefix + suffix ].set = setPositiveNumber;
    			}
    		} );

    		jQuery.fn.extend( {
    			css: function( name, value ) {
    				return access( this, function( elem, name, value ) {
    					var styles, len,
    						map = {},
    						i = 0;

    					if ( Array.isArray( name ) ) {
    						styles = getStyles( elem );
    						len = name.length;

    						for ( ; i < len; i++ ) {
    							map[ name[ i ] ] = jQuery.css( elem, name[ i ], false, styles );
    						}

    						return map;
    					}

    					return value !== undefined ?
    						jQuery.style( elem, name, value ) :
    						jQuery.css( elem, name );
    				}, name, value, arguments.length > 1 );
    			}
    		} );


    		function Tween( elem, options, prop, end, easing ) {
    			return new Tween.prototype.init( elem, options, prop, end, easing );
    		}
    		jQuery.Tween = Tween;

    		Tween.prototype = {
    			constructor: Tween,
    			init: function( elem, options, prop, end, easing, unit ) {
    				this.elem = elem;
    				this.prop = prop;
    				this.easing = easing || jQuery.easing._default;
    				this.options = options;
    				this.start = this.now = this.cur();
    				this.end = end;
    				this.unit = unit || ( jQuery.cssNumber[ prop ] ? "" : "px" );
    			},
    			cur: function() {
    				var hooks = Tween.propHooks[ this.prop ];

    				return hooks && hooks.get ?
    					hooks.get( this ) :
    					Tween.propHooks._default.get( this );
    			},
    			run: function( percent ) {
    				var eased,
    					hooks = Tween.propHooks[ this.prop ];

    				if ( this.options.duration ) {
    					this.pos = eased = jQuery.easing[ this.easing ](
    						percent, this.options.duration * percent, 0, 1, this.options.duration
    					);
    				} else {
    					this.pos = eased = percent;
    				}
    				this.now = ( this.end - this.start ) * eased + this.start;

    				if ( this.options.step ) {
    					this.options.step.call( this.elem, this.now, this );
    				}

    				if ( hooks && hooks.set ) {
    					hooks.set( this );
    				} else {
    					Tween.propHooks._default.set( this );
    				}
    				return this;
    			}
    		};

    		Tween.prototype.init.prototype = Tween.prototype;

    		Tween.propHooks = {
    			_default: {
    				get: function( tween ) {
    					var result;

    					// Use a property on the element directly when it is not a DOM element,
    					// or when there is no matching style property that exists.
    					if ( tween.elem.nodeType !== 1 ||
    						tween.elem[ tween.prop ] != null && tween.elem.style[ tween.prop ] == null ) {
    						return tween.elem[ tween.prop ];
    					}

    					// Passing an empty string as a 3rd parameter to .css will automatically
    					// attempt a parseFloat and fallback to a string if the parse fails.
    					// Simple values such as "10px" are parsed to Float;
    					// complex values such as "rotate(1rad)" are returned as-is.
    					result = jQuery.css( tween.elem, tween.prop, "" );

    					// Empty strings, null, undefined and "auto" are converted to 0.
    					return !result || result === "auto" ? 0 : result;
    				},
    				set: function( tween ) {

    					// Use step hook for back compat.
    					// Use cssHook if its there.
    					// Use .style if available and use plain properties where available.
    					if ( jQuery.fx.step[ tween.prop ] ) {
    						jQuery.fx.step[ tween.prop ]( tween );
    					} else if ( tween.elem.nodeType === 1 && (
    						jQuery.cssHooks[ tween.prop ] ||
    							tween.elem.style[ finalPropName( tween.prop ) ] != null ) ) {
    						jQuery.style( tween.elem, tween.prop, tween.now + tween.unit );
    					} else {
    						tween.elem[ tween.prop ] = tween.now;
    					}
    				}
    			}
    		};

    		// Support: IE <=9 only
    		// Panic based approach to setting things on disconnected nodes
    		Tween.propHooks.scrollTop = Tween.propHooks.scrollLeft = {
    			set: function( tween ) {
    				if ( tween.elem.nodeType && tween.elem.parentNode ) {
    					tween.elem[ tween.prop ] = tween.now;
    				}
    			}
    		};

    		jQuery.easing = {
    			linear: function( p ) {
    				return p;
    			},
    			swing: function( p ) {
    				return 0.5 - Math.cos( p * Math.PI ) / 2;
    			},
    			_default: "swing"
    		};

    		jQuery.fx = Tween.prototype.init;

    		// Back compat <1.8 extension point
    		jQuery.fx.step = {};




    		var
    			fxNow, inProgress,
    			rfxtypes = /^(?:toggle|show|hide)$/,
    			rrun = /queueHooks$/;

    		function schedule() {
    			if ( inProgress ) {
    				if ( document.hidden === false && window.requestAnimationFrame ) {
    					window.requestAnimationFrame( schedule );
    				} else {
    					window.setTimeout( schedule, jQuery.fx.interval );
    				}

    				jQuery.fx.tick();
    			}
    		}

    		// Animations created synchronously will run synchronously
    		function createFxNow() {
    			window.setTimeout( function() {
    				fxNow = undefined;
    			} );
    			return ( fxNow = Date.now() );
    		}

    		// Generate parameters to create a standard animation
    		function genFx( type, includeWidth ) {
    			var which,
    				i = 0,
    				attrs = { height: type };

    			// If we include width, step value is 1 to do all cssExpand values,
    			// otherwise step value is 2 to skip over Left and Right
    			includeWidth = includeWidth ? 1 : 0;
    			for ( ; i < 4; i += 2 - includeWidth ) {
    				which = cssExpand[ i ];
    				attrs[ "margin" + which ] = attrs[ "padding" + which ] = type;
    			}

    			if ( includeWidth ) {
    				attrs.opacity = attrs.width = type;
    			}

    			return attrs;
    		}

    		function createTween( value, prop, animation ) {
    			var tween,
    				collection = ( Animation.tweeners[ prop ] || [] ).concat( Animation.tweeners[ "*" ] ),
    				index = 0,
    				length = collection.length;
    			for ( ; index < length; index++ ) {
    				if ( ( tween = collection[ index ].call( animation, prop, value ) ) ) {

    					// We're done with this property
    					return tween;
    				}
    			}
    		}

    		function defaultPrefilter( elem, props, opts ) {
    			var prop, value, toggle, hooks, oldfire, propTween, restoreDisplay, display,
    				isBox = "width" in props || "height" in props,
    				anim = this,
    				orig = {},
    				style = elem.style,
    				hidden = elem.nodeType && isHiddenWithinTree( elem ),
    				dataShow = dataPriv.get( elem, "fxshow" );

    			// Queue-skipping animations hijack the fx hooks
    			if ( !opts.queue ) {
    				hooks = jQuery._queueHooks( elem, "fx" );
    				if ( hooks.unqueued == null ) {
    					hooks.unqueued = 0;
    					oldfire = hooks.empty.fire;
    					hooks.empty.fire = function() {
    						if ( !hooks.unqueued ) {
    							oldfire();
    						}
    					};
    				}
    				hooks.unqueued++;

    				anim.always( function() {

    					// Ensure the complete handler is called before this completes
    					anim.always( function() {
    						hooks.unqueued--;
    						if ( !jQuery.queue( elem, "fx" ).length ) {
    							hooks.empty.fire();
    						}
    					} );
    				} );
    			}

    			// Detect show/hide animations
    			for ( prop in props ) {
    				value = props[ prop ];
    				if ( rfxtypes.test( value ) ) {
    					delete props[ prop ];
    					toggle = toggle || value === "toggle";
    					if ( value === ( hidden ? "hide" : "show" ) ) {

    						// Pretend to be hidden if this is a "show" and
    						// there is still data from a stopped show/hide
    						if ( value === "show" && dataShow && dataShow[ prop ] !== undefined ) {
    							hidden = true;

    						// Ignore all other no-op show/hide data
    						} else {
    							continue;
    						}
    					}
    					orig[ prop ] = dataShow && dataShow[ prop ] || jQuery.style( elem, prop );
    				}
    			}

    			// Bail out if this is a no-op like .hide().hide()
    			propTween = !jQuery.isEmptyObject( props );
    			if ( !propTween && jQuery.isEmptyObject( orig ) ) {
    				return;
    			}

    			// Restrict "overflow" and "display" styles during box animations
    			if ( isBox && elem.nodeType === 1 ) {

    				// Support: IE <=9 - 11, Edge 12 - 15
    				// Record all 3 overflow attributes because IE does not infer the shorthand
    				// from identically-valued overflowX and overflowY and Edge just mirrors
    				// the overflowX value there.
    				opts.overflow = [ style.overflow, style.overflowX, style.overflowY ];

    				// Identify a display type, preferring old show/hide data over the CSS cascade
    				restoreDisplay = dataShow && dataShow.display;
    				if ( restoreDisplay == null ) {
    					restoreDisplay = dataPriv.get( elem, "display" );
    				}
    				display = jQuery.css( elem, "display" );
    				if ( display === "none" ) {
    					if ( restoreDisplay ) {
    						display = restoreDisplay;
    					} else {

    						// Get nonempty value(s) by temporarily forcing visibility
    						showHide( [ elem ], true );
    						restoreDisplay = elem.style.display || restoreDisplay;
    						display = jQuery.css( elem, "display" );
    						showHide( [ elem ] );
    					}
    				}

    				// Animate inline elements as inline-block
    				if ( display === "inline" || display === "inline-block" && restoreDisplay != null ) {
    					if ( jQuery.css( elem, "float" ) === "none" ) {

    						// Restore the original display value at the end of pure show/hide animations
    						if ( !propTween ) {
    							anim.done( function() {
    								style.display = restoreDisplay;
    							} );
    							if ( restoreDisplay == null ) {
    								display = style.display;
    								restoreDisplay = display === "none" ? "" : display;
    							}
    						}
    						style.display = "inline-block";
    					}
    				}
    			}

    			if ( opts.overflow ) {
    				style.overflow = "hidden";
    				anim.always( function() {
    					style.overflow = opts.overflow[ 0 ];
    					style.overflowX = opts.overflow[ 1 ];
    					style.overflowY = opts.overflow[ 2 ];
    				} );
    			}

    			// Implement show/hide animations
    			propTween = false;
    			for ( prop in orig ) {

    				// General show/hide setup for this element animation
    				if ( !propTween ) {
    					if ( dataShow ) {
    						if ( "hidden" in dataShow ) {
    							hidden = dataShow.hidden;
    						}
    					} else {
    						dataShow = dataPriv.access( elem, "fxshow", { display: restoreDisplay } );
    					}

    					// Store hidden/visible for toggle so `.stop().toggle()` "reverses"
    					if ( toggle ) {
    						dataShow.hidden = !hidden;
    					}

    					// Show elements before animating them
    					if ( hidden ) {
    						showHide( [ elem ], true );
    					}

    					/* eslint-disable no-loop-func */

    					anim.done( function() {

    						/* eslint-enable no-loop-func */

    						// The final step of a "hide" animation is actually hiding the element
    						if ( !hidden ) {
    							showHide( [ elem ] );
    						}
    						dataPriv.remove( elem, "fxshow" );
    						for ( prop in orig ) {
    							jQuery.style( elem, prop, orig[ prop ] );
    						}
    					} );
    				}

    				// Per-property setup
    				propTween = createTween( hidden ? dataShow[ prop ] : 0, prop, anim );
    				if ( !( prop in dataShow ) ) {
    					dataShow[ prop ] = propTween.start;
    					if ( hidden ) {
    						propTween.end = propTween.start;
    						propTween.start = 0;
    					}
    				}
    			}
    		}

    		function propFilter( props, specialEasing ) {
    			var index, name, easing, value, hooks;

    			// camelCase, specialEasing and expand cssHook pass
    			for ( index in props ) {
    				name = camelCase( index );
    				easing = specialEasing[ name ];
    				value = props[ index ];
    				if ( Array.isArray( value ) ) {
    					easing = value[ 1 ];
    					value = props[ index ] = value[ 0 ];
    				}

    				if ( index !== name ) {
    					props[ name ] = value;
    					delete props[ index ];
    				}

    				hooks = jQuery.cssHooks[ name ];
    				if ( hooks && "expand" in hooks ) {
    					value = hooks.expand( value );
    					delete props[ name ];

    					// Not quite $.extend, this won't overwrite existing keys.
    					// Reusing 'index' because we have the correct "name"
    					for ( index in value ) {
    						if ( !( index in props ) ) {
    							props[ index ] = value[ index ];
    							specialEasing[ index ] = easing;
    						}
    					}
    				} else {
    					specialEasing[ name ] = easing;
    				}
    			}
    		}

    		function Animation( elem, properties, options ) {
    			var result,
    				stopped,
    				index = 0,
    				length = Animation.prefilters.length,
    				deferred = jQuery.Deferred().always( function() {

    					// Don't match elem in the :animated selector
    					delete tick.elem;
    				} ),
    				tick = function() {
    					if ( stopped ) {
    						return false;
    					}
    					var currentTime = fxNow || createFxNow(),
    						remaining = Math.max( 0, animation.startTime + animation.duration - currentTime ),

    						// Support: Android 2.3 only
    						// Archaic crash bug won't allow us to use `1 - ( 0.5 || 0 )` (trac-12497)
    						temp = remaining / animation.duration || 0,
    						percent = 1 - temp,
    						index = 0,
    						length = animation.tweens.length;

    					for ( ; index < length; index++ ) {
    						animation.tweens[ index ].run( percent );
    					}

    					deferred.notifyWith( elem, [ animation, percent, remaining ] );

    					// If there's more to do, yield
    					if ( percent < 1 && length ) {
    						return remaining;
    					}

    					// If this was an empty animation, synthesize a final progress notification
    					if ( !length ) {
    						deferred.notifyWith( elem, [ animation, 1, 0 ] );
    					}

    					// Resolve the animation and report its conclusion
    					deferred.resolveWith( elem, [ animation ] );
    					return false;
    				},
    				animation = deferred.promise( {
    					elem: elem,
    					props: jQuery.extend( {}, properties ),
    					opts: jQuery.extend( true, {
    						specialEasing: {},
    						easing: jQuery.easing._default
    					}, options ),
    					originalProperties: properties,
    					originalOptions: options,
    					startTime: fxNow || createFxNow(),
    					duration: options.duration,
    					tweens: [],
    					createTween: function( prop, end ) {
    						var tween = jQuery.Tween( elem, animation.opts, prop, end,
    							animation.opts.specialEasing[ prop ] || animation.opts.easing );
    						animation.tweens.push( tween );
    						return tween;
    					},
    					stop: function( gotoEnd ) {
    						var index = 0,

    							// If we are going to the end, we want to run all the tweens
    							// otherwise we skip this part
    							length = gotoEnd ? animation.tweens.length : 0;
    						if ( stopped ) {
    							return this;
    						}
    						stopped = true;
    						for ( ; index < length; index++ ) {
    							animation.tweens[ index ].run( 1 );
    						}

    						// Resolve when we played the last frame; otherwise, reject
    						if ( gotoEnd ) {
    							deferred.notifyWith( elem, [ animation, 1, 0 ] );
    							deferred.resolveWith( elem, [ animation, gotoEnd ] );
    						} else {
    							deferred.rejectWith( elem, [ animation, gotoEnd ] );
    						}
    						return this;
    					}
    				} ),
    				props = animation.props;

    			propFilter( props, animation.opts.specialEasing );

    			for ( ; index < length; index++ ) {
    				result = Animation.prefilters[ index ].call( animation, elem, props, animation.opts );
    				if ( result ) {
    					if ( isFunction( result.stop ) ) {
    						jQuery._queueHooks( animation.elem, animation.opts.queue ).stop =
    							result.stop.bind( result );
    					}
    					return result;
    				}
    			}

    			jQuery.map( props, createTween, animation );

    			if ( isFunction( animation.opts.start ) ) {
    				animation.opts.start.call( elem, animation );
    			}

    			// Attach callbacks from options
    			animation
    				.progress( animation.opts.progress )
    				.done( animation.opts.done, animation.opts.complete )
    				.fail( animation.opts.fail )
    				.always( animation.opts.always );

    			jQuery.fx.timer(
    				jQuery.extend( tick, {
    					elem: elem,
    					anim: animation,
    					queue: animation.opts.queue
    				} )
    			);

    			return animation;
    		}

    		jQuery.Animation = jQuery.extend( Animation, {

    			tweeners: {
    				"*": [ function( prop, value ) {
    					var tween = this.createTween( prop, value );
    					adjustCSS( tween.elem, prop, rcssNum.exec( value ), tween );
    					return tween;
    				} ]
    			},

    			tweener: function( props, callback ) {
    				if ( isFunction( props ) ) {
    					callback = props;
    					props = [ "*" ];
    				} else {
    					props = props.match( rnothtmlwhite );
    				}

    				var prop,
    					index = 0,
    					length = props.length;

    				for ( ; index < length; index++ ) {
    					prop = props[ index ];
    					Animation.tweeners[ prop ] = Animation.tweeners[ prop ] || [];
    					Animation.tweeners[ prop ].unshift( callback );
    				}
    			},

    			prefilters: [ defaultPrefilter ],

    			prefilter: function( callback, prepend ) {
    				if ( prepend ) {
    					Animation.prefilters.unshift( callback );
    				} else {
    					Animation.prefilters.push( callback );
    				}
    			}
    		} );

    		jQuery.speed = function( speed, easing, fn ) {
    			var opt = speed && typeof speed === "object" ? jQuery.extend( {}, speed ) : {
    				complete: fn || !fn && easing ||
    					isFunction( speed ) && speed,
    				duration: speed,
    				easing: fn && easing || easing && !isFunction( easing ) && easing
    			};

    			// Go to the end state if fx are off
    			if ( jQuery.fx.off ) {
    				opt.duration = 0;

    			} else {
    				if ( typeof opt.duration !== "number" ) {
    					if ( opt.duration in jQuery.fx.speeds ) {
    						opt.duration = jQuery.fx.speeds[ opt.duration ];

    					} else {
    						opt.duration = jQuery.fx.speeds._default;
    					}
    				}
    			}

    			// Normalize opt.queue - true/undefined/null -> "fx"
    			if ( opt.queue == null || opt.queue === true ) {
    				opt.queue = "fx";
    			}

    			// Queueing
    			opt.old = opt.complete;

    			opt.complete = function() {
    				if ( isFunction( opt.old ) ) {
    					opt.old.call( this );
    				}

    				if ( opt.queue ) {
    					jQuery.dequeue( this, opt.queue );
    				}
    			};

    			return opt;
    		};

    		jQuery.fn.extend( {
    			fadeTo: function( speed, to, easing, callback ) {

    				// Show any hidden elements after setting opacity to 0
    				return this.filter( isHiddenWithinTree ).css( "opacity", 0 ).show()

    					// Animate to the value specified
    					.end().animate( { opacity: to }, speed, easing, callback );
    			},
    			animate: function( prop, speed, easing, callback ) {
    				var empty = jQuery.isEmptyObject( prop ),
    					optall = jQuery.speed( speed, easing, callback ),
    					doAnimation = function() {

    						// Operate on a copy of prop so per-property easing won't be lost
    						var anim = Animation( this, jQuery.extend( {}, prop ), optall );

    						// Empty animations, or finishing resolves immediately
    						if ( empty || dataPriv.get( this, "finish" ) ) {
    							anim.stop( true );
    						}
    					};

    				doAnimation.finish = doAnimation;

    				return empty || optall.queue === false ?
    					this.each( doAnimation ) :
    					this.queue( optall.queue, doAnimation );
    			},
    			stop: function( type, clearQueue, gotoEnd ) {
    				var stopQueue = function( hooks ) {
    					var stop = hooks.stop;
    					delete hooks.stop;
    					stop( gotoEnd );
    				};

    				if ( typeof type !== "string" ) {
    					gotoEnd = clearQueue;
    					clearQueue = type;
    					type = undefined;
    				}
    				if ( clearQueue ) {
    					this.queue( type || "fx", [] );
    				}

    				return this.each( function() {
    					var dequeue = true,
    						index = type != null && type + "queueHooks",
    						timers = jQuery.timers,
    						data = dataPriv.get( this );

    					if ( index ) {
    						if ( data[ index ] && data[ index ].stop ) {
    							stopQueue( data[ index ] );
    						}
    					} else {
    						for ( index in data ) {
    							if ( data[ index ] && data[ index ].stop && rrun.test( index ) ) {
    								stopQueue( data[ index ] );
    							}
    						}
    					}

    					for ( index = timers.length; index--; ) {
    						if ( timers[ index ].elem === this &&
    							( type == null || timers[ index ].queue === type ) ) {

    							timers[ index ].anim.stop( gotoEnd );
    							dequeue = false;
    							timers.splice( index, 1 );
    						}
    					}

    					// Start the next in the queue if the last step wasn't forced.
    					// Timers currently will call their complete callbacks, which
    					// will dequeue but only if they were gotoEnd.
    					if ( dequeue || !gotoEnd ) {
    						jQuery.dequeue( this, type );
    					}
    				} );
    			},
    			finish: function( type ) {
    				if ( type !== false ) {
    					type = type || "fx";
    				}
    				return this.each( function() {
    					var index,
    						data = dataPriv.get( this ),
    						queue = data[ type + "queue" ],
    						hooks = data[ type + "queueHooks" ],
    						timers = jQuery.timers,
    						length = queue ? queue.length : 0;

    					// Enable finishing flag on private data
    					data.finish = true;

    					// Empty the queue first
    					jQuery.queue( this, type, [] );

    					if ( hooks && hooks.stop ) {
    						hooks.stop.call( this, true );
    					}

    					// Look for any active animations, and finish them
    					for ( index = timers.length; index--; ) {
    						if ( timers[ index ].elem === this && timers[ index ].queue === type ) {
    							timers[ index ].anim.stop( true );
    							timers.splice( index, 1 );
    						}
    					}

    					// Look for any animations in the old queue and finish them
    					for ( index = 0; index < length; index++ ) {
    						if ( queue[ index ] && queue[ index ].finish ) {
    							queue[ index ].finish.call( this );
    						}
    					}

    					// Turn off finishing flag
    					delete data.finish;
    				} );
    			}
    		} );

    		jQuery.each( [ "toggle", "show", "hide" ], function( _i, name ) {
    			var cssFn = jQuery.fn[ name ];
    			jQuery.fn[ name ] = function( speed, easing, callback ) {
    				return speed == null || typeof speed === "boolean" ?
    					cssFn.apply( this, arguments ) :
    					this.animate( genFx( name, true ), speed, easing, callback );
    			};
    		} );

    		// Generate shortcuts for custom animations
    		jQuery.each( {
    			slideDown: genFx( "show" ),
    			slideUp: genFx( "hide" ),
    			slideToggle: genFx( "toggle" ),
    			fadeIn: { opacity: "show" },
    			fadeOut: { opacity: "hide" },
    			fadeToggle: { opacity: "toggle" }
    		}, function( name, props ) {
    			jQuery.fn[ name ] = function( speed, easing, callback ) {
    				return this.animate( props, speed, easing, callback );
    			};
    		} );

    		jQuery.timers = [];
    		jQuery.fx.tick = function() {
    			var timer,
    				i = 0,
    				timers = jQuery.timers;

    			fxNow = Date.now();

    			for ( ; i < timers.length; i++ ) {
    				timer = timers[ i ];

    				// Run the timer and safely remove it when done (allowing for external removal)
    				if ( !timer() && timers[ i ] === timer ) {
    					timers.splice( i--, 1 );
    				}
    			}

    			if ( !timers.length ) {
    				jQuery.fx.stop();
    			}
    			fxNow = undefined;
    		};

    		jQuery.fx.timer = function( timer ) {
    			jQuery.timers.push( timer );
    			jQuery.fx.start();
    		};

    		jQuery.fx.interval = 13;
    		jQuery.fx.start = function() {
    			if ( inProgress ) {
    				return;
    			}

    			inProgress = true;
    			schedule();
    		};

    		jQuery.fx.stop = function() {
    			inProgress = null;
    		};

    		jQuery.fx.speeds = {
    			slow: 600,
    			fast: 200,

    			// Default speed
    			_default: 400
    		};


    		// Based off of the plugin by Clint Helfers, with permission.
    		jQuery.fn.delay = function( time, type ) {
    			time = jQuery.fx ? jQuery.fx.speeds[ time ] || time : time;
    			type = type || "fx";

    			return this.queue( type, function( next, hooks ) {
    				var timeout = window.setTimeout( next, time );
    				hooks.stop = function() {
    					window.clearTimeout( timeout );
    				};
    			} );
    		};


    		( function() {
    			var input = document.createElement( "input" ),
    				select = document.createElement( "select" ),
    				opt = select.appendChild( document.createElement( "option" ) );

    			input.type = "checkbox";

    			// Support: Android <=4.3 only
    			// Default value for a checkbox should be "on"
    			support.checkOn = input.value !== "";

    			// Support: IE <=11 only
    			// Must access selectedIndex to make default options select
    			support.optSelected = opt.selected;

    			// Support: IE <=11 only
    			// An input loses its value after becoming a radio
    			input = document.createElement( "input" );
    			input.value = "t";
    			input.type = "radio";
    			support.radioValue = input.value === "t";
    		} )();


    		var boolHook,
    			attrHandle = jQuery.expr.attrHandle;

    		jQuery.fn.extend( {
    			attr: function( name, value ) {
    				return access( this, jQuery.attr, name, value, arguments.length > 1 );
    			},

    			removeAttr: function( name ) {
    				return this.each( function() {
    					jQuery.removeAttr( this, name );
    				} );
    			}
    		} );

    		jQuery.extend( {
    			attr: function( elem, name, value ) {
    				var ret, hooks,
    					nType = elem.nodeType;

    				// Don't get/set attributes on text, comment and attribute nodes
    				if ( nType === 3 || nType === 8 || nType === 2 ) {
    					return;
    				}

    				// Fallback to prop when attributes are not supported
    				if ( typeof elem.getAttribute === "undefined" ) {
    					return jQuery.prop( elem, name, value );
    				}

    				// Attribute hooks are determined by the lowercase version
    				// Grab necessary hook if one is defined
    				if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {
    					hooks = jQuery.attrHooks[ name.toLowerCase() ] ||
    						( jQuery.expr.match.bool.test( name ) ? boolHook : undefined );
    				}

    				if ( value !== undefined ) {
    					if ( value === null ) {
    						jQuery.removeAttr( elem, name );
    						return;
    					}

    					if ( hooks && "set" in hooks &&
    						( ret = hooks.set( elem, value, name ) ) !== undefined ) {
    						return ret;
    					}

    					elem.setAttribute( name, value + "" );
    					return value;
    				}

    				if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
    					return ret;
    				}

    				ret = jQuery.find.attr( elem, name );

    				// Non-existent attributes return null, we normalize to undefined
    				return ret == null ? undefined : ret;
    			},

    			attrHooks: {
    				type: {
    					set: function( elem, value ) {
    						if ( !support.radioValue && value === "radio" &&
    							nodeName( elem, "input" ) ) {
    							var val = elem.value;
    							elem.setAttribute( "type", value );
    							if ( val ) {
    								elem.value = val;
    							}
    							return value;
    						}
    					}
    				}
    			},

    			removeAttr: function( elem, value ) {
    				var name,
    					i = 0,

    					// Attribute names can contain non-HTML whitespace characters
    					// https://html.spec.whatwg.org/multipage/syntax.html#attributes-2
    					attrNames = value && value.match( rnothtmlwhite );

    				if ( attrNames && elem.nodeType === 1 ) {
    					while ( ( name = attrNames[ i++ ] ) ) {
    						elem.removeAttribute( name );
    					}
    				}
    			}
    		} );

    		// Hooks for boolean attributes
    		boolHook = {
    			set: function( elem, value, name ) {
    				if ( value === false ) {

    					// Remove boolean attributes when set to false
    					jQuery.removeAttr( elem, name );
    				} else {
    					elem.setAttribute( name, name );
    				}
    				return name;
    			}
    		};

    		jQuery.each( jQuery.expr.match.bool.source.match( /\w+/g ), function( _i, name ) {
    			var getter = attrHandle[ name ] || jQuery.find.attr;

    			attrHandle[ name ] = function( elem, name, isXML ) {
    				var ret, handle,
    					lowercaseName = name.toLowerCase();

    				if ( !isXML ) {

    					// Avoid an infinite loop by temporarily removing this function from the getter
    					handle = attrHandle[ lowercaseName ];
    					attrHandle[ lowercaseName ] = ret;
    					ret = getter( elem, name, isXML ) != null ?
    						lowercaseName :
    						null;
    					attrHandle[ lowercaseName ] = handle;
    				}
    				return ret;
    			};
    		} );




    		var rfocusable = /^(?:input|select|textarea|button)$/i,
    			rclickable = /^(?:a|area)$/i;

    		jQuery.fn.extend( {
    			prop: function( name, value ) {
    				return access( this, jQuery.prop, name, value, arguments.length > 1 );
    			},

    			removeProp: function( name ) {
    				return this.each( function() {
    					delete this[ jQuery.propFix[ name ] || name ];
    				} );
    			}
    		} );

    		jQuery.extend( {
    			prop: function( elem, name, value ) {
    				var ret, hooks,
    					nType = elem.nodeType;

    				// Don't get/set properties on text, comment and attribute nodes
    				if ( nType === 3 || nType === 8 || nType === 2 ) {
    					return;
    				}

    				if ( nType !== 1 || !jQuery.isXMLDoc( elem ) ) {

    					// Fix name and attach hooks
    					name = jQuery.propFix[ name ] || name;
    					hooks = jQuery.propHooks[ name ];
    				}

    				if ( value !== undefined ) {
    					if ( hooks && "set" in hooks &&
    						( ret = hooks.set( elem, value, name ) ) !== undefined ) {
    						return ret;
    					}

    					return ( elem[ name ] = value );
    				}

    				if ( hooks && "get" in hooks && ( ret = hooks.get( elem, name ) ) !== null ) {
    					return ret;
    				}

    				return elem[ name ];
    			},

    			propHooks: {
    				tabIndex: {
    					get: function( elem ) {

    						// Support: IE <=9 - 11 only
    						// elem.tabIndex doesn't always return the
    						// correct value when it hasn't been explicitly set
    						// Use proper attribute retrieval (trac-12072)
    						var tabindex = jQuery.find.attr( elem, "tabindex" );

    						if ( tabindex ) {
    							return parseInt( tabindex, 10 );
    						}

    						if (
    							rfocusable.test( elem.nodeName ) ||
    							rclickable.test( elem.nodeName ) &&
    							elem.href
    						) {
    							return 0;
    						}

    						return -1;
    					}
    				}
    			},

    			propFix: {
    				"for": "htmlFor",
    				"class": "className"
    			}
    		} );

    		// Support: IE <=11 only
    		// Accessing the selectedIndex property
    		// forces the browser to respect setting selected
    		// on the option
    		// The getter ensures a default option is selected
    		// when in an optgroup
    		// eslint rule "no-unused-expressions" is disabled for this code
    		// since it considers such accessions noop
    		if ( !support.optSelected ) {
    			jQuery.propHooks.selected = {
    				get: function( elem ) {

    					/* eslint no-unused-expressions: "off" */

    					var parent = elem.parentNode;
    					if ( parent && parent.parentNode ) {
    						parent.parentNode.selectedIndex;
    					}
    					return null;
    				},
    				set: function( elem ) {

    					/* eslint no-unused-expressions: "off" */

    					var parent = elem.parentNode;
    					if ( parent ) {
    						parent.selectedIndex;

    						if ( parent.parentNode ) {
    							parent.parentNode.selectedIndex;
    						}
    					}
    				}
    			};
    		}

    		jQuery.each( [
    			"tabIndex",
    			"readOnly",
    			"maxLength",
    			"cellSpacing",
    			"cellPadding",
    			"rowSpan",
    			"colSpan",
    			"useMap",
    			"frameBorder",
    			"contentEditable"
    		], function() {
    			jQuery.propFix[ this.toLowerCase() ] = this;
    		} );




    			// Strip and collapse whitespace according to HTML spec
    			// https://infra.spec.whatwg.org/#strip-and-collapse-ascii-whitespace
    			function stripAndCollapse( value ) {
    				var tokens = value.match( rnothtmlwhite ) || [];
    				return tokens.join( " " );
    			}


    		function getClass( elem ) {
    			return elem.getAttribute && elem.getAttribute( "class" ) || "";
    		}

    		function classesToArray( value ) {
    			if ( Array.isArray( value ) ) {
    				return value;
    			}
    			if ( typeof value === "string" ) {
    				return value.match( rnothtmlwhite ) || [];
    			}
    			return [];
    		}

    		jQuery.fn.extend( {
    			addClass: function( value ) {
    				var classNames, cur, curValue, className, i, finalValue;

    				if ( isFunction( value ) ) {
    					return this.each( function( j ) {
    						jQuery( this ).addClass( value.call( this, j, getClass( this ) ) );
    					} );
    				}

    				classNames = classesToArray( value );

    				if ( classNames.length ) {
    					return this.each( function() {
    						curValue = getClass( this );
    						cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

    						if ( cur ) {
    							for ( i = 0; i < classNames.length; i++ ) {
    								className = classNames[ i ];
    								if ( cur.indexOf( " " + className + " " ) < 0 ) {
    									cur += className + " ";
    								}
    							}

    							// Only assign if different to avoid unneeded rendering.
    							finalValue = stripAndCollapse( cur );
    							if ( curValue !== finalValue ) {
    								this.setAttribute( "class", finalValue );
    							}
    						}
    					} );
    				}

    				return this;
    			},

    			removeClass: function( value ) {
    				var classNames, cur, curValue, className, i, finalValue;

    				if ( isFunction( value ) ) {
    					return this.each( function( j ) {
    						jQuery( this ).removeClass( value.call( this, j, getClass( this ) ) );
    					} );
    				}

    				if ( !arguments.length ) {
    					return this.attr( "class", "" );
    				}

    				classNames = classesToArray( value );

    				if ( classNames.length ) {
    					return this.each( function() {
    						curValue = getClass( this );

    						// This expression is here for better compressibility (see addClass)
    						cur = this.nodeType === 1 && ( " " + stripAndCollapse( curValue ) + " " );

    						if ( cur ) {
    							for ( i = 0; i < classNames.length; i++ ) {
    								className = classNames[ i ];

    								// Remove *all* instances
    								while ( cur.indexOf( " " + className + " " ) > -1 ) {
    									cur = cur.replace( " " + className + " ", " " );
    								}
    							}

    							// Only assign if different to avoid unneeded rendering.
    							finalValue = stripAndCollapse( cur );
    							if ( curValue !== finalValue ) {
    								this.setAttribute( "class", finalValue );
    							}
    						}
    					} );
    				}

    				return this;
    			},

    			toggleClass: function( value, stateVal ) {
    				var classNames, className, i, self,
    					type = typeof value,
    					isValidValue = type === "string" || Array.isArray( value );

    				if ( isFunction( value ) ) {
    					return this.each( function( i ) {
    						jQuery( this ).toggleClass(
    							value.call( this, i, getClass( this ), stateVal ),
    							stateVal
    						);
    					} );
    				}

    				if ( typeof stateVal === "boolean" && isValidValue ) {
    					return stateVal ? this.addClass( value ) : this.removeClass( value );
    				}

    				classNames = classesToArray( value );

    				return this.each( function() {
    					if ( isValidValue ) {

    						// Toggle individual class names
    						self = jQuery( this );

    						for ( i = 0; i < classNames.length; i++ ) {
    							className = classNames[ i ];

    							// Check each className given, space separated list
    							if ( self.hasClass( className ) ) {
    								self.removeClass( className );
    							} else {
    								self.addClass( className );
    							}
    						}

    					// Toggle whole class name
    					} else if ( value === undefined || type === "boolean" ) {
    						className = getClass( this );
    						if ( className ) {

    							// Store className if set
    							dataPriv.set( this, "__className__", className );
    						}

    						// If the element has a class name or if we're passed `false`,
    						// then remove the whole classname (if there was one, the above saved it).
    						// Otherwise bring back whatever was previously saved (if anything),
    						// falling back to the empty string if nothing was stored.
    						if ( this.setAttribute ) {
    							this.setAttribute( "class",
    								className || value === false ?
    									"" :
    									dataPriv.get( this, "__className__" ) || ""
    							);
    						}
    					}
    				} );
    			},

    			hasClass: function( selector ) {
    				var className, elem,
    					i = 0;

    				className = " " + selector + " ";
    				while ( ( elem = this[ i++ ] ) ) {
    					if ( elem.nodeType === 1 &&
    						( " " + stripAndCollapse( getClass( elem ) ) + " " ).indexOf( className ) > -1 ) {
    						return true;
    					}
    				}

    				return false;
    			}
    		} );




    		var rreturn = /\r/g;

    		jQuery.fn.extend( {
    			val: function( value ) {
    				var hooks, ret, valueIsFunction,
    					elem = this[ 0 ];

    				if ( !arguments.length ) {
    					if ( elem ) {
    						hooks = jQuery.valHooks[ elem.type ] ||
    							jQuery.valHooks[ elem.nodeName.toLowerCase() ];

    						if ( hooks &&
    							"get" in hooks &&
    							( ret = hooks.get( elem, "value" ) ) !== undefined
    						) {
    							return ret;
    						}

    						ret = elem.value;

    						// Handle most common string cases
    						if ( typeof ret === "string" ) {
    							return ret.replace( rreturn, "" );
    						}

    						// Handle cases where value is null/undef or number
    						return ret == null ? "" : ret;
    					}

    					return;
    				}

    				valueIsFunction = isFunction( value );

    				return this.each( function( i ) {
    					var val;

    					if ( this.nodeType !== 1 ) {
    						return;
    					}

    					if ( valueIsFunction ) {
    						val = value.call( this, i, jQuery( this ).val() );
    					} else {
    						val = value;
    					}

    					// Treat null/undefined as ""; convert numbers to string
    					if ( val == null ) {
    						val = "";

    					} else if ( typeof val === "number" ) {
    						val += "";

    					} else if ( Array.isArray( val ) ) {
    						val = jQuery.map( val, function( value ) {
    							return value == null ? "" : value + "";
    						} );
    					}

    					hooks = jQuery.valHooks[ this.type ] || jQuery.valHooks[ this.nodeName.toLowerCase() ];

    					// If set returns undefined, fall back to normal setting
    					if ( !hooks || !( "set" in hooks ) || hooks.set( this, val, "value" ) === undefined ) {
    						this.value = val;
    					}
    				} );
    			}
    		} );

    		jQuery.extend( {
    			valHooks: {
    				option: {
    					get: function( elem ) {

    						var val = jQuery.find.attr( elem, "value" );
    						return val != null ?
    							val :

    							// Support: IE <=10 - 11 only
    							// option.text throws exceptions (trac-14686, trac-14858)
    							// Strip and collapse whitespace
    							// https://html.spec.whatwg.org/#strip-and-collapse-whitespace
    							stripAndCollapse( jQuery.text( elem ) );
    					}
    				},
    				select: {
    					get: function( elem ) {
    						var value, option, i,
    							options = elem.options,
    							index = elem.selectedIndex,
    							one = elem.type === "select-one",
    							values = one ? null : [],
    							max = one ? index + 1 : options.length;

    						if ( index < 0 ) {
    							i = max;

    						} else {
    							i = one ? index : 0;
    						}

    						// Loop through all the selected options
    						for ( ; i < max; i++ ) {
    							option = options[ i ];

    							// Support: IE <=9 only
    							// IE8-9 doesn't update selected after form reset (trac-2551)
    							if ( ( option.selected || i === index ) &&

    									// Don't return options that are disabled or in a disabled optgroup
    									!option.disabled &&
    									( !option.parentNode.disabled ||
    										!nodeName( option.parentNode, "optgroup" ) ) ) {

    								// Get the specific value for the option
    								value = jQuery( option ).val();

    								// We don't need an array for one selects
    								if ( one ) {
    									return value;
    								}

    								// Multi-Selects return an array
    								values.push( value );
    							}
    						}

    						return values;
    					},

    					set: function( elem, value ) {
    						var optionSet, option,
    							options = elem.options,
    							values = jQuery.makeArray( value ),
    							i = options.length;

    						while ( i-- ) {
    							option = options[ i ];

    							/* eslint-disable no-cond-assign */

    							if ( option.selected =
    								jQuery.inArray( jQuery.valHooks.option.get( option ), values ) > -1
    							) {
    								optionSet = true;
    							}

    							/* eslint-enable no-cond-assign */
    						}

    						// Force browsers to behave consistently when non-matching value is set
    						if ( !optionSet ) {
    							elem.selectedIndex = -1;
    						}
    						return values;
    					}
    				}
    			}
    		} );

    		// Radios and checkboxes getter/setter
    		jQuery.each( [ "radio", "checkbox" ], function() {
    			jQuery.valHooks[ this ] = {
    				set: function( elem, value ) {
    					if ( Array.isArray( value ) ) {
    						return ( elem.checked = jQuery.inArray( jQuery( elem ).val(), value ) > -1 );
    					}
    				}
    			};
    			if ( !support.checkOn ) {
    				jQuery.valHooks[ this ].get = function( elem ) {
    					return elem.getAttribute( "value" ) === null ? "on" : elem.value;
    				};
    			}
    		} );




    		// Return jQuery for attributes-only inclusion
    		var location = window.location;

    		var nonce = { guid: Date.now() };

    		var rquery = ( /\?/ );



    		// Cross-browser xml parsing
    		jQuery.parseXML = function( data ) {
    			var xml, parserErrorElem;
    			if ( !data || typeof data !== "string" ) {
    				return null;
    			}

    			// Support: IE 9 - 11 only
    			// IE throws on parseFromString with invalid input.
    			try {
    				xml = ( new window.DOMParser() ).parseFromString( data, "text/xml" );
    			} catch ( e ) {}

    			parserErrorElem = xml && xml.getElementsByTagName( "parsererror" )[ 0 ];
    			if ( !xml || parserErrorElem ) {
    				jQuery.error( "Invalid XML: " + (
    					parserErrorElem ?
    						jQuery.map( parserErrorElem.childNodes, function( el ) {
    							return el.textContent;
    						} ).join( "\n" ) :
    						data
    				) );
    			}
    			return xml;
    		};


    		var rfocusMorph = /^(?:focusinfocus|focusoutblur)$/,
    			stopPropagationCallback = function( e ) {
    				e.stopPropagation();
    			};

    		jQuery.extend( jQuery.event, {

    			trigger: function( event, data, elem, onlyHandlers ) {

    				var i, cur, tmp, bubbleType, ontype, handle, special, lastElement,
    					eventPath = [ elem || document ],
    					type = hasOwn.call( event, "type" ) ? event.type : event,
    					namespaces = hasOwn.call( event, "namespace" ) ? event.namespace.split( "." ) : [];

    				cur = lastElement = tmp = elem = elem || document;

    				// Don't do events on text and comment nodes
    				if ( elem.nodeType === 3 || elem.nodeType === 8 ) {
    					return;
    				}

    				// focus/blur morphs to focusin/out; ensure we're not firing them right now
    				if ( rfocusMorph.test( type + jQuery.event.triggered ) ) {
    					return;
    				}

    				if ( type.indexOf( "." ) > -1 ) {

    					// Namespaced trigger; create a regexp to match event type in handle()
    					namespaces = type.split( "." );
    					type = namespaces.shift();
    					namespaces.sort();
    				}
    				ontype = type.indexOf( ":" ) < 0 && "on" + type;

    				// Caller can pass in a jQuery.Event object, Object, or just an event type string
    				event = event[ jQuery.expando ] ?
    					event :
    					new jQuery.Event( type, typeof event === "object" && event );

    				// Trigger bitmask: & 1 for native handlers; & 2 for jQuery (always true)
    				event.isTrigger = onlyHandlers ? 2 : 3;
    				event.namespace = namespaces.join( "." );
    				event.rnamespace = event.namespace ?
    					new RegExp( "(^|\\.)" + namespaces.join( "\\.(?:.*\\.|)" ) + "(\\.|$)" ) :
    					null;

    				// Clean up the event in case it is being reused
    				event.result = undefined;
    				if ( !event.target ) {
    					event.target = elem;
    				}

    				// Clone any incoming data and prepend the event, creating the handler arg list
    				data = data == null ?
    					[ event ] :
    					jQuery.makeArray( data, [ event ] );

    				// Allow special events to draw outside the lines
    				special = jQuery.event.special[ type ] || {};
    				if ( !onlyHandlers && special.trigger && special.trigger.apply( elem, data ) === false ) {
    					return;
    				}

    				// Determine event propagation path in advance, per W3C events spec (trac-9951)
    				// Bubble up to document, then to window; watch for a global ownerDocument var (trac-9724)
    				if ( !onlyHandlers && !special.noBubble && !isWindow( elem ) ) {

    					bubbleType = special.delegateType || type;
    					if ( !rfocusMorph.test( bubbleType + type ) ) {
    						cur = cur.parentNode;
    					}
    					for ( ; cur; cur = cur.parentNode ) {
    						eventPath.push( cur );
    						tmp = cur;
    					}

    					// Only add window if we got to document (e.g., not plain obj or detached DOM)
    					if ( tmp === ( elem.ownerDocument || document ) ) {
    						eventPath.push( tmp.defaultView || tmp.parentWindow || window );
    					}
    				}

    				// Fire handlers on the event path
    				i = 0;
    				while ( ( cur = eventPath[ i++ ] ) && !event.isPropagationStopped() ) {
    					lastElement = cur;
    					event.type = i > 1 ?
    						bubbleType :
    						special.bindType || type;

    					// jQuery handler
    					handle = ( dataPriv.get( cur, "events" ) || Object.create( null ) )[ event.type ] &&
    						dataPriv.get( cur, "handle" );
    					if ( handle ) {
    						handle.apply( cur, data );
    					}

    					// Native handler
    					handle = ontype && cur[ ontype ];
    					if ( handle && handle.apply && acceptData( cur ) ) {
    						event.result = handle.apply( cur, data );
    						if ( event.result === false ) {
    							event.preventDefault();
    						}
    					}
    				}
    				event.type = type;

    				// If nobody prevented the default action, do it now
    				if ( !onlyHandlers && !event.isDefaultPrevented() ) {

    					if ( ( !special._default ||
    						special._default.apply( eventPath.pop(), data ) === false ) &&
    						acceptData( elem ) ) {

    						// Call a native DOM method on the target with the same name as the event.
    						// Don't do default actions on window, that's where global variables be (trac-6170)
    						if ( ontype && isFunction( elem[ type ] ) && !isWindow( elem ) ) {

    							// Don't re-trigger an onFOO event when we call its FOO() method
    							tmp = elem[ ontype ];

    							if ( tmp ) {
    								elem[ ontype ] = null;
    							}

    							// Prevent re-triggering of the same event, since we already bubbled it above
    							jQuery.event.triggered = type;

    							if ( event.isPropagationStopped() ) {
    								lastElement.addEventListener( type, stopPropagationCallback );
    							}

    							elem[ type ]();

    							if ( event.isPropagationStopped() ) {
    								lastElement.removeEventListener( type, stopPropagationCallback );
    							}

    							jQuery.event.triggered = undefined;

    							if ( tmp ) {
    								elem[ ontype ] = tmp;
    							}
    						}
    					}
    				}

    				return event.result;
    			},

    			// Piggyback on a donor event to simulate a different one
    			// Used only for `focus(in | out)` events
    			simulate: function( type, elem, event ) {
    				var e = jQuery.extend(
    					new jQuery.Event(),
    					event,
    					{
    						type: type,
    						isSimulated: true
    					}
    				);

    				jQuery.event.trigger( e, null, elem );
    			}

    		} );

    		jQuery.fn.extend( {

    			trigger: function( type, data ) {
    				return this.each( function() {
    					jQuery.event.trigger( type, data, this );
    				} );
    			},
    			triggerHandler: function( type, data ) {
    				var elem = this[ 0 ];
    				if ( elem ) {
    					return jQuery.event.trigger( type, data, elem, true );
    				}
    			}
    		} );


    		var
    			rbracket = /\[\]$/,
    			rCRLF = /\r?\n/g,
    			rsubmitterTypes = /^(?:submit|button|image|reset|file)$/i,
    			rsubmittable = /^(?:input|select|textarea|keygen)/i;

    		function buildParams( prefix, obj, traditional, add ) {
    			var name;

    			if ( Array.isArray( obj ) ) {

    				// Serialize array item.
    				jQuery.each( obj, function( i, v ) {
    					if ( traditional || rbracket.test( prefix ) ) {

    						// Treat each array item as a scalar.
    						add( prefix, v );

    					} else {

    						// Item is non-scalar (array or object), encode its numeric index.
    						buildParams(
    							prefix + "[" + ( typeof v === "object" && v != null ? i : "" ) + "]",
    							v,
    							traditional,
    							add
    						);
    					}
    				} );

    			} else if ( !traditional && toType( obj ) === "object" ) {

    				// Serialize object item.
    				for ( name in obj ) {
    					buildParams( prefix + "[" + name + "]", obj[ name ], traditional, add );
    				}

    			} else {

    				// Serialize scalar item.
    				add( prefix, obj );
    			}
    		}

    		// Serialize an array of form elements or a set of
    		// key/values into a query string
    		jQuery.param = function( a, traditional ) {
    			var prefix,
    				s = [],
    				add = function( key, valueOrFunction ) {

    					// If value is a function, invoke it and use its return value
    					var value = isFunction( valueOrFunction ) ?
    						valueOrFunction() :
    						valueOrFunction;

    					s[ s.length ] = encodeURIComponent( key ) + "=" +
    						encodeURIComponent( value == null ? "" : value );
    				};

    			if ( a == null ) {
    				return "";
    			}

    			// If an array was passed in, assume that it is an array of form elements.
    			if ( Array.isArray( a ) || ( a.jquery && !jQuery.isPlainObject( a ) ) ) {

    				// Serialize the form elements
    				jQuery.each( a, function() {
    					add( this.name, this.value );
    				} );

    			} else {

    				// If traditional, encode the "old" way (the way 1.3.2 or older
    				// did it), otherwise encode params recursively.
    				for ( prefix in a ) {
    					buildParams( prefix, a[ prefix ], traditional, add );
    				}
    			}

    			// Return the resulting serialization
    			return s.join( "&" );
    		};

    		jQuery.fn.extend( {
    			serialize: function() {
    				return jQuery.param( this.serializeArray() );
    			},
    			serializeArray: function() {
    				return this.map( function() {

    					// Can add propHook for "elements" to filter or add form elements
    					var elements = jQuery.prop( this, "elements" );
    					return elements ? jQuery.makeArray( elements ) : this;
    				} ).filter( function() {
    					var type = this.type;

    					// Use .is( ":disabled" ) so that fieldset[disabled] works
    					return this.name && !jQuery( this ).is( ":disabled" ) &&
    						rsubmittable.test( this.nodeName ) && !rsubmitterTypes.test( type ) &&
    						( this.checked || !rcheckableType.test( type ) );
    				} ).map( function( _i, elem ) {
    					var val = jQuery( this ).val();

    					if ( val == null ) {
    						return null;
    					}

    					if ( Array.isArray( val ) ) {
    						return jQuery.map( val, function( val ) {
    							return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
    						} );
    					}

    					return { name: elem.name, value: val.replace( rCRLF, "\r\n" ) };
    				} ).get();
    			}
    		} );


    		var
    			r20 = /%20/g,
    			rhash = /#.*$/,
    			rantiCache = /([?&])_=[^&]*/,
    			rheaders = /^(.*?):[ \t]*([^\r\n]*)$/mg,

    			// trac-7653, trac-8125, trac-8152: local protocol detection
    			rlocalProtocol = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
    			rnoContent = /^(?:GET|HEAD)$/,
    			rprotocol = /^\/\//,

    			/* Prefilters
    			 * 1) They are useful to introduce custom dataTypes (see ajax/jsonp.js for an example)
    			 * 2) These are called:
    			 *    - BEFORE asking for a transport
    			 *    - AFTER param serialization (s.data is a string if s.processData is true)
    			 * 3) key is the dataType
    			 * 4) the catchall symbol "*" can be used
    			 * 5) execution will start with transport dataType and THEN continue down to "*" if needed
    			 */
    			prefilters = {},

    			/* Transports bindings
    			 * 1) key is the dataType
    			 * 2) the catchall symbol "*" can be used
    			 * 3) selection will start with transport dataType and THEN go to "*" if needed
    			 */
    			transports = {},

    			// Avoid comment-prolog char sequence (trac-10098); must appease lint and evade compression
    			allTypes = "*/".concat( "*" ),

    			// Anchor tag for parsing the document origin
    			originAnchor = document.createElement( "a" );

    		originAnchor.href = location.href;

    		// Base "constructor" for jQuery.ajaxPrefilter and jQuery.ajaxTransport
    		function addToPrefiltersOrTransports( structure ) {

    			// dataTypeExpression is optional and defaults to "*"
    			return function( dataTypeExpression, func ) {

    				if ( typeof dataTypeExpression !== "string" ) {
    					func = dataTypeExpression;
    					dataTypeExpression = "*";
    				}

    				var dataType,
    					i = 0,
    					dataTypes = dataTypeExpression.toLowerCase().match( rnothtmlwhite ) || [];

    				if ( isFunction( func ) ) {

    					// For each dataType in the dataTypeExpression
    					while ( ( dataType = dataTypes[ i++ ] ) ) {

    						// Prepend if requested
    						if ( dataType[ 0 ] === "+" ) {
    							dataType = dataType.slice( 1 ) || "*";
    							( structure[ dataType ] = structure[ dataType ] || [] ).unshift( func );

    						// Otherwise append
    						} else {
    							( structure[ dataType ] = structure[ dataType ] || [] ).push( func );
    						}
    					}
    				}
    			};
    		}

    		// Base inspection function for prefilters and transports
    		function inspectPrefiltersOrTransports( structure, options, originalOptions, jqXHR ) {

    			var inspected = {},
    				seekingTransport = ( structure === transports );

    			function inspect( dataType ) {
    				var selected;
    				inspected[ dataType ] = true;
    				jQuery.each( structure[ dataType ] || [], function( _, prefilterOrFactory ) {
    					var dataTypeOrTransport = prefilterOrFactory( options, originalOptions, jqXHR );
    					if ( typeof dataTypeOrTransport === "string" &&
    						!seekingTransport && !inspected[ dataTypeOrTransport ] ) {

    						options.dataTypes.unshift( dataTypeOrTransport );
    						inspect( dataTypeOrTransport );
    						return false;
    					} else if ( seekingTransport ) {
    						return !( selected = dataTypeOrTransport );
    					}
    				} );
    				return selected;
    			}

    			return inspect( options.dataTypes[ 0 ] ) || !inspected[ "*" ] && inspect( "*" );
    		}

    		// A special extend for ajax options
    		// that takes "flat" options (not to be deep extended)
    		// Fixes trac-9887
    		function ajaxExtend( target, src ) {
    			var key, deep,
    				flatOptions = jQuery.ajaxSettings.flatOptions || {};

    			for ( key in src ) {
    				if ( src[ key ] !== undefined ) {
    					( flatOptions[ key ] ? target : ( deep || ( deep = {} ) ) )[ key ] = src[ key ];
    				}
    			}
    			if ( deep ) {
    				jQuery.extend( true, target, deep );
    			}

    			return target;
    		}

    		/* Handles responses to an ajax request:
    		 * - finds the right dataType (mediates between content-type and expected dataType)
    		 * - returns the corresponding response
    		 */
    		function ajaxHandleResponses( s, jqXHR, responses ) {

    			var ct, type, finalDataType, firstDataType,
    				contents = s.contents,
    				dataTypes = s.dataTypes;

    			// Remove auto dataType and get content-type in the process
    			while ( dataTypes[ 0 ] === "*" ) {
    				dataTypes.shift();
    				if ( ct === undefined ) {
    					ct = s.mimeType || jqXHR.getResponseHeader( "Content-Type" );
    				}
    			}

    			// Check if we're dealing with a known content-type
    			if ( ct ) {
    				for ( type in contents ) {
    					if ( contents[ type ] && contents[ type ].test( ct ) ) {
    						dataTypes.unshift( type );
    						break;
    					}
    				}
    			}

    			// Check to see if we have a response for the expected dataType
    			if ( dataTypes[ 0 ] in responses ) {
    				finalDataType = dataTypes[ 0 ];
    			} else {

    				// Try convertible dataTypes
    				for ( type in responses ) {
    					if ( !dataTypes[ 0 ] || s.converters[ type + " " + dataTypes[ 0 ] ] ) {
    						finalDataType = type;
    						break;
    					}
    					if ( !firstDataType ) {
    						firstDataType = type;
    					}
    				}

    				// Or just use first one
    				finalDataType = finalDataType || firstDataType;
    			}

    			// If we found a dataType
    			// We add the dataType to the list if needed
    			// and return the corresponding response
    			if ( finalDataType ) {
    				if ( finalDataType !== dataTypes[ 0 ] ) {
    					dataTypes.unshift( finalDataType );
    				}
    				return responses[ finalDataType ];
    			}
    		}

    		/* Chain conversions given the request and the original response
    		 * Also sets the responseXXX fields on the jqXHR instance
    		 */
    		function ajaxConvert( s, response, jqXHR, isSuccess ) {
    			var conv2, current, conv, tmp, prev,
    				converters = {},

    				// Work with a copy of dataTypes in case we need to modify it for conversion
    				dataTypes = s.dataTypes.slice();

    			// Create converters map with lowercased keys
    			if ( dataTypes[ 1 ] ) {
    				for ( conv in s.converters ) {
    					converters[ conv.toLowerCase() ] = s.converters[ conv ];
    				}
    			}

    			current = dataTypes.shift();

    			// Convert to each sequential dataType
    			while ( current ) {

    				if ( s.responseFields[ current ] ) {
    					jqXHR[ s.responseFields[ current ] ] = response;
    				}

    				// Apply the dataFilter if provided
    				if ( !prev && isSuccess && s.dataFilter ) {
    					response = s.dataFilter( response, s.dataType );
    				}

    				prev = current;
    				current = dataTypes.shift();

    				if ( current ) {

    					// There's only work to do if current dataType is non-auto
    					if ( current === "*" ) {

    						current = prev;

    					// Convert response if prev dataType is non-auto and differs from current
    					} else if ( prev !== "*" && prev !== current ) {

    						// Seek a direct converter
    						conv = converters[ prev + " " + current ] || converters[ "* " + current ];

    						// If none found, seek a pair
    						if ( !conv ) {
    							for ( conv2 in converters ) {

    								// If conv2 outputs current
    								tmp = conv2.split( " " );
    								if ( tmp[ 1 ] === current ) {

    									// If prev can be converted to accepted input
    									conv = converters[ prev + " " + tmp[ 0 ] ] ||
    										converters[ "* " + tmp[ 0 ] ];
    									if ( conv ) {

    										// Condense equivalence converters
    										if ( conv === true ) {
    											conv = converters[ conv2 ];

    										// Otherwise, insert the intermediate dataType
    										} else if ( converters[ conv2 ] !== true ) {
    											current = tmp[ 0 ];
    											dataTypes.unshift( tmp[ 1 ] );
    										}
    										break;
    									}
    								}
    							}
    						}

    						// Apply converter (if not an equivalence)
    						if ( conv !== true ) {

    							// Unless errors are allowed to bubble, catch and return them
    							if ( conv && s.throws ) {
    								response = conv( response );
    							} else {
    								try {
    									response = conv( response );
    								} catch ( e ) {
    									return {
    										state: "parsererror",
    										error: conv ? e : "No conversion from " + prev + " to " + current
    									};
    								}
    							}
    						}
    					}
    				}
    			}

    			return { state: "success", data: response };
    		}

    		jQuery.extend( {

    			// Counter for holding the number of active queries
    			active: 0,

    			// Last-Modified header cache for next request
    			lastModified: {},
    			etag: {},

    			ajaxSettings: {
    				url: location.href,
    				type: "GET",
    				isLocal: rlocalProtocol.test( location.protocol ),
    				global: true,
    				processData: true,
    				async: true,
    				contentType: "application/x-www-form-urlencoded; charset=UTF-8",

    				/*
    				timeout: 0,
    				data: null,
    				dataType: null,
    				username: null,
    				password: null,
    				cache: null,
    				throws: false,
    				traditional: false,
    				headers: {},
    				*/

    				accepts: {
    					"*": allTypes,
    					text: "text/plain",
    					html: "text/html",
    					xml: "application/xml, text/xml",
    					json: "application/json, text/javascript"
    				},

    				contents: {
    					xml: /\bxml\b/,
    					html: /\bhtml/,
    					json: /\bjson\b/
    				},

    				responseFields: {
    					xml: "responseXML",
    					text: "responseText",
    					json: "responseJSON"
    				},

    				// Data converters
    				// Keys separate source (or catchall "*") and destination types with a single space
    				converters: {

    					// Convert anything to text
    					"* text": String,

    					// Text to html (true = no transformation)
    					"text html": true,

    					// Evaluate text as a json expression
    					"text json": JSON.parse,

    					// Parse text as xml
    					"text xml": jQuery.parseXML
    				},

    				// For options that shouldn't be deep extended:
    				// you can add your own custom options here if
    				// and when you create one that shouldn't be
    				// deep extended (see ajaxExtend)
    				flatOptions: {
    					url: true,
    					context: true
    				}
    			},

    			// Creates a full fledged settings object into target
    			// with both ajaxSettings and settings fields.
    			// If target is omitted, writes into ajaxSettings.
    			ajaxSetup: function( target, settings ) {
    				return settings ?

    					// Building a settings object
    					ajaxExtend( ajaxExtend( target, jQuery.ajaxSettings ), settings ) :

    					// Extending ajaxSettings
    					ajaxExtend( jQuery.ajaxSettings, target );
    			},

    			ajaxPrefilter: addToPrefiltersOrTransports( prefilters ),
    			ajaxTransport: addToPrefiltersOrTransports( transports ),

    			// Main method
    			ajax: function( url, options ) {

    				// If url is an object, simulate pre-1.5 signature
    				if ( typeof url === "object" ) {
    					options = url;
    					url = undefined;
    				}

    				// Force options to be an object
    				options = options || {};

    				var transport,

    					// URL without anti-cache param
    					cacheURL,

    					// Response headers
    					responseHeadersString,
    					responseHeaders,

    					// timeout handle
    					timeoutTimer,

    					// Url cleanup var
    					urlAnchor,

    					// Request state (becomes false upon send and true upon completion)
    					completed,

    					// To know if global events are to be dispatched
    					fireGlobals,

    					// Loop variable
    					i,

    					// uncached part of the url
    					uncached,

    					// Create the final options object
    					s = jQuery.ajaxSetup( {}, options ),

    					// Callbacks context
    					callbackContext = s.context || s,

    					// Context for global events is callbackContext if it is a DOM node or jQuery collection
    					globalEventContext = s.context &&
    						( callbackContext.nodeType || callbackContext.jquery ) ?
    						jQuery( callbackContext ) :
    						jQuery.event,

    					// Deferreds
    					deferred = jQuery.Deferred(),
    					completeDeferred = jQuery.Callbacks( "once memory" ),

    					// Status-dependent callbacks
    					statusCode = s.statusCode || {},

    					// Headers (they are sent all at once)
    					requestHeaders = {},
    					requestHeadersNames = {},

    					// Default abort message
    					strAbort = "canceled",

    					// Fake xhr
    					jqXHR = {
    						readyState: 0,

    						// Builds headers hashtable if needed
    						getResponseHeader: function( key ) {
    							var match;
    							if ( completed ) {
    								if ( !responseHeaders ) {
    									responseHeaders = {};
    									while ( ( match = rheaders.exec( responseHeadersString ) ) ) {
    										responseHeaders[ match[ 1 ].toLowerCase() + " " ] =
    											( responseHeaders[ match[ 1 ].toLowerCase() + " " ] || [] )
    												.concat( match[ 2 ] );
    									}
    								}
    								match = responseHeaders[ key.toLowerCase() + " " ];
    							}
    							return match == null ? null : match.join( ", " );
    						},

    						// Raw string
    						getAllResponseHeaders: function() {
    							return completed ? responseHeadersString : null;
    						},

    						// Caches the header
    						setRequestHeader: function( name, value ) {
    							if ( completed == null ) {
    								name = requestHeadersNames[ name.toLowerCase() ] =
    									requestHeadersNames[ name.toLowerCase() ] || name;
    								requestHeaders[ name ] = value;
    							}
    							return this;
    						},

    						// Overrides response content-type header
    						overrideMimeType: function( type ) {
    							if ( completed == null ) {
    								s.mimeType = type;
    							}
    							return this;
    						},

    						// Status-dependent callbacks
    						statusCode: function( map ) {
    							var code;
    							if ( map ) {
    								if ( completed ) {

    									// Execute the appropriate callbacks
    									jqXHR.always( map[ jqXHR.status ] );
    								} else {

    									// Lazy-add the new callbacks in a way that preserves old ones
    									for ( code in map ) {
    										statusCode[ code ] = [ statusCode[ code ], map[ code ] ];
    									}
    								}
    							}
    							return this;
    						},

    						// Cancel the request
    						abort: function( statusText ) {
    							var finalText = statusText || strAbort;
    							if ( transport ) {
    								transport.abort( finalText );
    							}
    							done( 0, finalText );
    							return this;
    						}
    					};

    				// Attach deferreds
    				deferred.promise( jqXHR );

    				// Add protocol if not provided (prefilters might expect it)
    				// Handle falsy url in the settings object (trac-10093: consistency with old signature)
    				// We also use the url parameter if available
    				s.url = ( ( url || s.url || location.href ) + "" )
    					.replace( rprotocol, location.protocol + "//" );

    				// Alias method option to type as per ticket trac-12004
    				s.type = options.method || options.type || s.method || s.type;

    				// Extract dataTypes list
    				s.dataTypes = ( s.dataType || "*" ).toLowerCase().match( rnothtmlwhite ) || [ "" ];

    				// A cross-domain request is in order when the origin doesn't match the current origin.
    				if ( s.crossDomain == null ) {
    					urlAnchor = document.createElement( "a" );

    					// Support: IE <=8 - 11, Edge 12 - 15
    					// IE throws exception on accessing the href property if url is malformed,
    					// e.g. http://example.com:80x/
    					try {
    						urlAnchor.href = s.url;

    						// Support: IE <=8 - 11 only
    						// Anchor's host property isn't correctly set when s.url is relative
    						urlAnchor.href = urlAnchor.href;
    						s.crossDomain = originAnchor.protocol + "//" + originAnchor.host !==
    							urlAnchor.protocol + "//" + urlAnchor.host;
    					} catch ( e ) {

    						// If there is an error parsing the URL, assume it is crossDomain,
    						// it can be rejected by the transport if it is invalid
    						s.crossDomain = true;
    					}
    				}

    				// Convert data if not already a string
    				if ( s.data && s.processData && typeof s.data !== "string" ) {
    					s.data = jQuery.param( s.data, s.traditional );
    				}

    				// Apply prefilters
    				inspectPrefiltersOrTransports( prefilters, s, options, jqXHR );

    				// If request was aborted inside a prefilter, stop there
    				if ( completed ) {
    					return jqXHR;
    				}

    				// We can fire global events as of now if asked to
    				// Don't fire events if jQuery.event is undefined in an AMD-usage scenario (trac-15118)
    				fireGlobals = jQuery.event && s.global;

    				// Watch for a new set of requests
    				if ( fireGlobals && jQuery.active++ === 0 ) {
    					jQuery.event.trigger( "ajaxStart" );
    				}

    				// Uppercase the type
    				s.type = s.type.toUpperCase();

    				// Determine if request has content
    				s.hasContent = !rnoContent.test( s.type );

    				// Save the URL in case we're toying with the If-Modified-Since
    				// and/or If-None-Match header later on
    				// Remove hash to simplify url manipulation
    				cacheURL = s.url.replace( rhash, "" );

    				// More options handling for requests with no content
    				if ( !s.hasContent ) {

    					// Remember the hash so we can put it back
    					uncached = s.url.slice( cacheURL.length );

    					// If data is available and should be processed, append data to url
    					if ( s.data && ( s.processData || typeof s.data === "string" ) ) {
    						cacheURL += ( rquery.test( cacheURL ) ? "&" : "?" ) + s.data;

    						// trac-9682: remove data so that it's not used in an eventual retry
    						delete s.data;
    					}

    					// Add or update anti-cache param if needed
    					if ( s.cache === false ) {
    						cacheURL = cacheURL.replace( rantiCache, "$1" );
    						uncached = ( rquery.test( cacheURL ) ? "&" : "?" ) + "_=" + ( nonce.guid++ ) +
    							uncached;
    					}

    					// Put hash and anti-cache on the URL that will be requested (gh-1732)
    					s.url = cacheURL + uncached;

    				// Change '%20' to '+' if this is encoded form body content (gh-2658)
    				} else if ( s.data && s.processData &&
    					( s.contentType || "" ).indexOf( "application/x-www-form-urlencoded" ) === 0 ) {
    					s.data = s.data.replace( r20, "+" );
    				}

    				// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
    				if ( s.ifModified ) {
    					if ( jQuery.lastModified[ cacheURL ] ) {
    						jqXHR.setRequestHeader( "If-Modified-Since", jQuery.lastModified[ cacheURL ] );
    					}
    					if ( jQuery.etag[ cacheURL ] ) {
    						jqXHR.setRequestHeader( "If-None-Match", jQuery.etag[ cacheURL ] );
    					}
    				}

    				// Set the correct header, if data is being sent
    				if ( s.data && s.hasContent && s.contentType !== false || options.contentType ) {
    					jqXHR.setRequestHeader( "Content-Type", s.contentType );
    				}

    				// Set the Accepts header for the server, depending on the dataType
    				jqXHR.setRequestHeader(
    					"Accept",
    					s.dataTypes[ 0 ] && s.accepts[ s.dataTypes[ 0 ] ] ?
    						s.accepts[ s.dataTypes[ 0 ] ] +
    							( s.dataTypes[ 0 ] !== "*" ? ", " + allTypes + "; q=0.01" : "" ) :
    						s.accepts[ "*" ]
    				);

    				// Check for headers option
    				for ( i in s.headers ) {
    					jqXHR.setRequestHeader( i, s.headers[ i ] );
    				}

    				// Allow custom headers/mimetypes and early abort
    				if ( s.beforeSend &&
    					( s.beforeSend.call( callbackContext, jqXHR, s ) === false || completed ) ) {

    					// Abort if not done already and return
    					return jqXHR.abort();
    				}

    				// Aborting is no longer a cancellation
    				strAbort = "abort";

    				// Install callbacks on deferreds
    				completeDeferred.add( s.complete );
    				jqXHR.done( s.success );
    				jqXHR.fail( s.error );

    				// Get transport
    				transport = inspectPrefiltersOrTransports( transports, s, options, jqXHR );

    				// If no transport, we auto-abort
    				if ( !transport ) {
    					done( -1, "No Transport" );
    				} else {
    					jqXHR.readyState = 1;

    					// Send global event
    					if ( fireGlobals ) {
    						globalEventContext.trigger( "ajaxSend", [ jqXHR, s ] );
    					}

    					// If request was aborted inside ajaxSend, stop there
    					if ( completed ) {
    						return jqXHR;
    					}

    					// Timeout
    					if ( s.async && s.timeout > 0 ) {
    						timeoutTimer = window.setTimeout( function() {
    							jqXHR.abort( "timeout" );
    						}, s.timeout );
    					}

    					try {
    						completed = false;
    						transport.send( requestHeaders, done );
    					} catch ( e ) {

    						// Rethrow post-completion exceptions
    						if ( completed ) {
    							throw e;
    						}

    						// Propagate others as results
    						done( -1, e );
    					}
    				}

    				// Callback for when everything is done
    				function done( status, nativeStatusText, responses, headers ) {
    					var isSuccess, success, error, response, modified,
    						statusText = nativeStatusText;

    					// Ignore repeat invocations
    					if ( completed ) {
    						return;
    					}

    					completed = true;

    					// Clear timeout if it exists
    					if ( timeoutTimer ) {
    						window.clearTimeout( timeoutTimer );
    					}

    					// Dereference transport for early garbage collection
    					// (no matter how long the jqXHR object will be used)
    					transport = undefined;

    					// Cache response headers
    					responseHeadersString = headers || "";

    					// Set readyState
    					jqXHR.readyState = status > 0 ? 4 : 0;

    					// Determine if successful
    					isSuccess = status >= 200 && status < 300 || status === 304;

    					// Get response data
    					if ( responses ) {
    						response = ajaxHandleResponses( s, jqXHR, responses );
    					}

    					// Use a noop converter for missing script but not if jsonp
    					if ( !isSuccess &&
    						jQuery.inArray( "script", s.dataTypes ) > -1 &&
    						jQuery.inArray( "json", s.dataTypes ) < 0 ) {
    						s.converters[ "text script" ] = function() {};
    					}

    					// Convert no matter what (that way responseXXX fields are always set)
    					response = ajaxConvert( s, response, jqXHR, isSuccess );

    					// If successful, handle type chaining
    					if ( isSuccess ) {

    						// Set the If-Modified-Since and/or If-None-Match header, if in ifModified mode.
    						if ( s.ifModified ) {
    							modified = jqXHR.getResponseHeader( "Last-Modified" );
    							if ( modified ) {
    								jQuery.lastModified[ cacheURL ] = modified;
    							}
    							modified = jqXHR.getResponseHeader( "etag" );
    							if ( modified ) {
    								jQuery.etag[ cacheURL ] = modified;
    							}
    						}

    						// if no content
    						if ( status === 204 || s.type === "HEAD" ) {
    							statusText = "nocontent";

    						// if not modified
    						} else if ( status === 304 ) {
    							statusText = "notmodified";

    						// If we have data, let's convert it
    						} else {
    							statusText = response.state;
    							success = response.data;
    							error = response.error;
    							isSuccess = !error;
    						}
    					} else {

    						// Extract error from statusText and normalize for non-aborts
    						error = statusText;
    						if ( status || !statusText ) {
    							statusText = "error";
    							if ( status < 0 ) {
    								status = 0;
    							}
    						}
    					}

    					// Set data for the fake xhr object
    					jqXHR.status = status;
    					jqXHR.statusText = ( nativeStatusText || statusText ) + "";

    					// Success/Error
    					if ( isSuccess ) {
    						deferred.resolveWith( callbackContext, [ success, statusText, jqXHR ] );
    					} else {
    						deferred.rejectWith( callbackContext, [ jqXHR, statusText, error ] );
    					}

    					// Status-dependent callbacks
    					jqXHR.statusCode( statusCode );
    					statusCode = undefined;

    					if ( fireGlobals ) {
    						globalEventContext.trigger( isSuccess ? "ajaxSuccess" : "ajaxError",
    							[ jqXHR, s, isSuccess ? success : error ] );
    					}

    					// Complete
    					completeDeferred.fireWith( callbackContext, [ jqXHR, statusText ] );

    					if ( fireGlobals ) {
    						globalEventContext.trigger( "ajaxComplete", [ jqXHR, s ] );

    						// Handle the global AJAX counter
    						if ( !( --jQuery.active ) ) {
    							jQuery.event.trigger( "ajaxStop" );
    						}
    					}
    				}

    				return jqXHR;
    			},

    			getJSON: function( url, data, callback ) {
    				return jQuery.get( url, data, callback, "json" );
    			},

    			getScript: function( url, callback ) {
    				return jQuery.get( url, undefined, callback, "script" );
    			}
    		} );

    		jQuery.each( [ "get", "post" ], function( _i, method ) {
    			jQuery[ method ] = function( url, data, callback, type ) {

    				// Shift arguments if data argument was omitted
    				if ( isFunction( data ) ) {
    					type = type || callback;
    					callback = data;
    					data = undefined;
    				}

    				// The url can be an options object (which then must have .url)
    				return jQuery.ajax( jQuery.extend( {
    					url: url,
    					type: method,
    					dataType: type,
    					data: data,
    					success: callback
    				}, jQuery.isPlainObject( url ) && url ) );
    			};
    		} );

    		jQuery.ajaxPrefilter( function( s ) {
    			var i;
    			for ( i in s.headers ) {
    				if ( i.toLowerCase() === "content-type" ) {
    					s.contentType = s.headers[ i ] || "";
    				}
    			}
    		} );


    		jQuery._evalUrl = function( url, options, doc ) {
    			return jQuery.ajax( {
    				url: url,

    				// Make this explicit, since user can override this through ajaxSetup (trac-11264)
    				type: "GET",
    				dataType: "script",
    				cache: true,
    				async: false,
    				global: false,

    				// Only evaluate the response if it is successful (gh-4126)
    				// dataFilter is not invoked for failure responses, so using it instead
    				// of the default converter is kludgy but it works.
    				converters: {
    					"text script": function() {}
    				},
    				dataFilter: function( response ) {
    					jQuery.globalEval( response, options, doc );
    				}
    			} );
    		};


    		jQuery.fn.extend( {
    			wrapAll: function( html ) {
    				var wrap;

    				if ( this[ 0 ] ) {
    					if ( isFunction( html ) ) {
    						html = html.call( this[ 0 ] );
    					}

    					// The elements to wrap the target around
    					wrap = jQuery( html, this[ 0 ].ownerDocument ).eq( 0 ).clone( true );

    					if ( this[ 0 ].parentNode ) {
    						wrap.insertBefore( this[ 0 ] );
    					}

    					wrap.map( function() {
    						var elem = this;

    						while ( elem.firstElementChild ) {
    							elem = elem.firstElementChild;
    						}

    						return elem;
    					} ).append( this );
    				}

    				return this;
    			},

    			wrapInner: function( html ) {
    				if ( isFunction( html ) ) {
    					return this.each( function( i ) {
    						jQuery( this ).wrapInner( html.call( this, i ) );
    					} );
    				}

    				return this.each( function() {
    					var self = jQuery( this ),
    						contents = self.contents();

    					if ( contents.length ) {
    						contents.wrapAll( html );

    					} else {
    						self.append( html );
    					}
    				} );
    			},

    			wrap: function( html ) {
    				var htmlIsFunction = isFunction( html );

    				return this.each( function( i ) {
    					jQuery( this ).wrapAll( htmlIsFunction ? html.call( this, i ) : html );
    				} );
    			},

    			unwrap: function( selector ) {
    				this.parent( selector ).not( "body" ).each( function() {
    					jQuery( this ).replaceWith( this.childNodes );
    				} );
    				return this;
    			}
    		} );


    		jQuery.expr.pseudos.hidden = function( elem ) {
    			return !jQuery.expr.pseudos.visible( elem );
    		};
    		jQuery.expr.pseudos.visible = function( elem ) {
    			return !!( elem.offsetWidth || elem.offsetHeight || elem.getClientRects().length );
    		};




    		jQuery.ajaxSettings.xhr = function() {
    			try {
    				return new window.XMLHttpRequest();
    			} catch ( e ) {}
    		};

    		var xhrSuccessStatus = {

    				// File protocol always yields status code 0, assume 200
    				0: 200,

    				// Support: IE <=9 only
    				// trac-1450: sometimes IE returns 1223 when it should be 204
    				1223: 204
    			},
    			xhrSupported = jQuery.ajaxSettings.xhr();

    		support.cors = !!xhrSupported && ( "withCredentials" in xhrSupported );
    		support.ajax = xhrSupported = !!xhrSupported;

    		jQuery.ajaxTransport( function( options ) {
    			var callback, errorCallback;

    			// Cross domain only allowed if supported through XMLHttpRequest
    			if ( support.cors || xhrSupported && !options.crossDomain ) {
    				return {
    					send: function( headers, complete ) {
    						var i,
    							xhr = options.xhr();

    						xhr.open(
    							options.type,
    							options.url,
    							options.async,
    							options.username,
    							options.password
    						);

    						// Apply custom fields if provided
    						if ( options.xhrFields ) {
    							for ( i in options.xhrFields ) {
    								xhr[ i ] = options.xhrFields[ i ];
    							}
    						}

    						// Override mime type if needed
    						if ( options.mimeType && xhr.overrideMimeType ) {
    							xhr.overrideMimeType( options.mimeType );
    						}

    						// X-Requested-With header
    						// For cross-domain requests, seeing as conditions for a preflight are
    						// akin to a jigsaw puzzle, we simply never set it to be sure.
    						// (it can always be set on a per-request basis or even using ajaxSetup)
    						// For same-domain requests, won't change header if already provided.
    						if ( !options.crossDomain && !headers[ "X-Requested-With" ] ) {
    							headers[ "X-Requested-With" ] = "XMLHttpRequest";
    						}

    						// Set headers
    						for ( i in headers ) {
    							xhr.setRequestHeader( i, headers[ i ] );
    						}

    						// Callback
    						callback = function( type ) {
    							return function() {
    								if ( callback ) {
    									callback = errorCallback = xhr.onload =
    										xhr.onerror = xhr.onabort = xhr.ontimeout =
    											xhr.onreadystatechange = null;

    									if ( type === "abort" ) {
    										xhr.abort();
    									} else if ( type === "error" ) {

    										// Support: IE <=9 only
    										// On a manual native abort, IE9 throws
    										// errors on any property access that is not readyState
    										if ( typeof xhr.status !== "number" ) {
    											complete( 0, "error" );
    										} else {
    											complete(

    												// File: protocol always yields status 0; see trac-8605, trac-14207
    												xhr.status,
    												xhr.statusText
    											);
    										}
    									} else {
    										complete(
    											xhrSuccessStatus[ xhr.status ] || xhr.status,
    											xhr.statusText,

    											// Support: IE <=9 only
    											// IE9 has no XHR2 but throws on binary (trac-11426)
    											// For XHR2 non-text, let the caller handle it (gh-2498)
    											( xhr.responseType || "text" ) !== "text"  ||
    											typeof xhr.responseText !== "string" ?
    												{ binary: xhr.response } :
    												{ text: xhr.responseText },
    											xhr.getAllResponseHeaders()
    										);
    									}
    								}
    							};
    						};

    						// Listen to events
    						xhr.onload = callback();
    						errorCallback = xhr.onerror = xhr.ontimeout = callback( "error" );

    						// Support: IE 9 only
    						// Use onreadystatechange to replace onabort
    						// to handle uncaught aborts
    						if ( xhr.onabort !== undefined ) {
    							xhr.onabort = errorCallback;
    						} else {
    							xhr.onreadystatechange = function() {

    								// Check readyState before timeout as it changes
    								if ( xhr.readyState === 4 ) {

    									// Allow onerror to be called first,
    									// but that will not handle a native abort
    									// Also, save errorCallback to a variable
    									// as xhr.onerror cannot be accessed
    									window.setTimeout( function() {
    										if ( callback ) {
    											errorCallback();
    										}
    									} );
    								}
    							};
    						}

    						// Create the abort callback
    						callback = callback( "abort" );

    						try {

    							// Do send the request (this may raise an exception)
    							xhr.send( options.hasContent && options.data || null );
    						} catch ( e ) {

    							// trac-14683: Only rethrow if this hasn't been notified as an error yet
    							if ( callback ) {
    								throw e;
    							}
    						}
    					},

    					abort: function() {
    						if ( callback ) {
    							callback();
    						}
    					}
    				};
    			}
    		} );




    		// Prevent auto-execution of scripts when no explicit dataType was provided (See gh-2432)
    		jQuery.ajaxPrefilter( function( s ) {
    			if ( s.crossDomain ) {
    				s.contents.script = false;
    			}
    		} );

    		// Install script dataType
    		jQuery.ajaxSetup( {
    			accepts: {
    				script: "text/javascript, application/javascript, " +
    					"application/ecmascript, application/x-ecmascript"
    			},
    			contents: {
    				script: /\b(?:java|ecma)script\b/
    			},
    			converters: {
    				"text script": function( text ) {
    					jQuery.globalEval( text );
    					return text;
    				}
    			}
    		} );

    		// Handle cache's special case and crossDomain
    		jQuery.ajaxPrefilter( "script", function( s ) {
    			if ( s.cache === undefined ) {
    				s.cache = false;
    			}
    			if ( s.crossDomain ) {
    				s.type = "GET";
    			}
    		} );

    		// Bind script tag hack transport
    		jQuery.ajaxTransport( "script", function( s ) {

    			// This transport only deals with cross domain or forced-by-attrs requests
    			if ( s.crossDomain || s.scriptAttrs ) {
    				var script, callback;
    				return {
    					send: function( _, complete ) {
    						script = jQuery( "<script>" )
    							.attr( s.scriptAttrs || {} )
    							.prop( { charset: s.scriptCharset, src: s.url } )
    							.on( "load error", callback = function( evt ) {
    								script.remove();
    								callback = null;
    								if ( evt ) {
    									complete( evt.type === "error" ? 404 : 200, evt.type );
    								}
    							} );

    						// Use native DOM manipulation to avoid our domManip AJAX trickery
    						document.head.appendChild( script[ 0 ] );
    					},
    					abort: function() {
    						if ( callback ) {
    							callback();
    						}
    					}
    				};
    			}
    		} );




    		var oldCallbacks = [],
    			rjsonp = /(=)\?(?=&|$)|\?\?/;

    		// Default jsonp settings
    		jQuery.ajaxSetup( {
    			jsonp: "callback",
    			jsonpCallback: function() {
    				var callback = oldCallbacks.pop() || ( jQuery.expando + "_" + ( nonce.guid++ ) );
    				this[ callback ] = true;
    				return callback;
    			}
    		} );

    		// Detect, normalize options and install callbacks for jsonp requests
    		jQuery.ajaxPrefilter( "json jsonp", function( s, originalSettings, jqXHR ) {

    			var callbackName, overwritten, responseContainer,
    				jsonProp = s.jsonp !== false && ( rjsonp.test( s.url ) ?
    					"url" :
    					typeof s.data === "string" &&
    						( s.contentType || "" )
    							.indexOf( "application/x-www-form-urlencoded" ) === 0 &&
    						rjsonp.test( s.data ) && "data"
    				);

    			// Handle iff the expected data type is "jsonp" or we have a parameter to set
    			if ( jsonProp || s.dataTypes[ 0 ] === "jsonp" ) {

    				// Get callback name, remembering preexisting value associated with it
    				callbackName = s.jsonpCallback = isFunction( s.jsonpCallback ) ?
    					s.jsonpCallback() :
    					s.jsonpCallback;

    				// Insert callback into url or form data
    				if ( jsonProp ) {
    					s[ jsonProp ] = s[ jsonProp ].replace( rjsonp, "$1" + callbackName );
    				} else if ( s.jsonp !== false ) {
    					s.url += ( rquery.test( s.url ) ? "&" : "?" ) + s.jsonp + "=" + callbackName;
    				}

    				// Use data converter to retrieve json after script execution
    				s.converters[ "script json" ] = function() {
    					if ( !responseContainer ) {
    						jQuery.error( callbackName + " was not called" );
    					}
    					return responseContainer[ 0 ];
    				};

    				// Force json dataType
    				s.dataTypes[ 0 ] = "json";

    				// Install callback
    				overwritten = window[ callbackName ];
    				window[ callbackName ] = function() {
    					responseContainer = arguments;
    				};

    				// Clean-up function (fires after converters)
    				jqXHR.always( function() {

    					// If previous value didn't exist - remove it
    					if ( overwritten === undefined ) {
    						jQuery( window ).removeProp( callbackName );

    					// Otherwise restore preexisting value
    					} else {
    						window[ callbackName ] = overwritten;
    					}

    					// Save back as free
    					if ( s[ callbackName ] ) {

    						// Make sure that re-using the options doesn't screw things around
    						s.jsonpCallback = originalSettings.jsonpCallback;

    						// Save the callback name for future use
    						oldCallbacks.push( callbackName );
    					}

    					// Call if it was a function and we have a response
    					if ( responseContainer && isFunction( overwritten ) ) {
    						overwritten( responseContainer[ 0 ] );
    					}

    					responseContainer = overwritten = undefined;
    				} );

    				// Delegate to script
    				return "script";
    			}
    		} );




    		// Support: Safari 8 only
    		// In Safari 8 documents created via document.implementation.createHTMLDocument
    		// collapse sibling forms: the second one becomes a child of the first one.
    		// Because of that, this security measure has to be disabled in Safari 8.
    		// https://bugs.webkit.org/show_bug.cgi?id=137337
    		support.createHTMLDocument = ( function() {
    			var body = document.implementation.createHTMLDocument( "" ).body;
    			body.innerHTML = "<form></form><form></form>";
    			return body.childNodes.length === 2;
    		} )();


    		// Argument "data" should be string of html
    		// context (optional): If specified, the fragment will be created in this context,
    		// defaults to document
    		// keepScripts (optional): If true, will include scripts passed in the html string
    		jQuery.parseHTML = function( data, context, keepScripts ) {
    			if ( typeof data !== "string" ) {
    				return [];
    			}
    			if ( typeof context === "boolean" ) {
    				keepScripts = context;
    				context = false;
    			}

    			var base, parsed, scripts;

    			if ( !context ) {

    				// Stop scripts or inline event handlers from being executed immediately
    				// by using document.implementation
    				if ( support.createHTMLDocument ) {
    					context = document.implementation.createHTMLDocument( "" );

    					// Set the base href for the created document
    					// so any parsed elements with URLs
    					// are based on the document's URL (gh-2965)
    					base = context.createElement( "base" );
    					base.href = document.location.href;
    					context.head.appendChild( base );
    				} else {
    					context = document;
    				}
    			}

    			parsed = rsingleTag.exec( data );
    			scripts = !keepScripts && [];

    			// Single tag
    			if ( parsed ) {
    				return [ context.createElement( parsed[ 1 ] ) ];
    			}

    			parsed = buildFragment( [ data ], context, scripts );

    			if ( scripts && scripts.length ) {
    				jQuery( scripts ).remove();
    			}

    			return jQuery.merge( [], parsed.childNodes );
    		};


    		/**
    		 * Load a url into a page
    		 */
    		jQuery.fn.load = function( url, params, callback ) {
    			var selector, type, response,
    				self = this,
    				off = url.indexOf( " " );

    			if ( off > -1 ) {
    				selector = stripAndCollapse( url.slice( off ) );
    				url = url.slice( 0, off );
    			}

    			// If it's a function
    			if ( isFunction( params ) ) {

    				// We assume that it's the callback
    				callback = params;
    				params = undefined;

    			// Otherwise, build a param string
    			} else if ( params && typeof params === "object" ) {
    				type = "POST";
    			}

    			// If we have elements to modify, make the request
    			if ( self.length > 0 ) {
    				jQuery.ajax( {
    					url: url,

    					// If "type" variable is undefined, then "GET" method will be used.
    					// Make value of this field explicit since
    					// user can override it through ajaxSetup method
    					type: type || "GET",
    					dataType: "html",
    					data: params
    				} ).done( function( responseText ) {

    					// Save response for use in complete callback
    					response = arguments;

    					self.html( selector ?

    						// If a selector was specified, locate the right elements in a dummy div
    						// Exclude scripts to avoid IE 'Permission Denied' errors
    						jQuery( "<div>" ).append( jQuery.parseHTML( responseText ) ).find( selector ) :

    						// Otherwise use the full result
    						responseText );

    				// If the request succeeds, this function gets "data", "status", "jqXHR"
    				// but they are ignored because response was set above.
    				// If it fails, this function gets "jqXHR", "status", "error"
    				} ).always( callback && function( jqXHR, status ) {
    					self.each( function() {
    						callback.apply( this, response || [ jqXHR.responseText, status, jqXHR ] );
    					} );
    				} );
    			}

    			return this;
    		};




    		jQuery.expr.pseudos.animated = function( elem ) {
    			return jQuery.grep( jQuery.timers, function( fn ) {
    				return elem === fn.elem;
    			} ).length;
    		};




    		jQuery.offset = {
    			setOffset: function( elem, options, i ) {
    				var curPosition, curLeft, curCSSTop, curTop, curOffset, curCSSLeft, calculatePosition,
    					position = jQuery.css( elem, "position" ),
    					curElem = jQuery( elem ),
    					props = {};

    				// Set position first, in-case top/left are set even on static elem
    				if ( position === "static" ) {
    					elem.style.position = "relative";
    				}

    				curOffset = curElem.offset();
    				curCSSTop = jQuery.css( elem, "top" );
    				curCSSLeft = jQuery.css( elem, "left" );
    				calculatePosition = ( position === "absolute" || position === "fixed" ) &&
    					( curCSSTop + curCSSLeft ).indexOf( "auto" ) > -1;

    				// Need to be able to calculate position if either
    				// top or left is auto and position is either absolute or fixed
    				if ( calculatePosition ) {
    					curPosition = curElem.position();
    					curTop = curPosition.top;
    					curLeft = curPosition.left;

    				} else {
    					curTop = parseFloat( curCSSTop ) || 0;
    					curLeft = parseFloat( curCSSLeft ) || 0;
    				}

    				if ( isFunction( options ) ) {

    					// Use jQuery.extend here to allow modification of coordinates argument (gh-1848)
    					options = options.call( elem, i, jQuery.extend( {}, curOffset ) );
    				}

    				if ( options.top != null ) {
    					props.top = ( options.top - curOffset.top ) + curTop;
    				}
    				if ( options.left != null ) {
    					props.left = ( options.left - curOffset.left ) + curLeft;
    				}

    				if ( "using" in options ) {
    					options.using.call( elem, props );

    				} else {
    					curElem.css( props );
    				}
    			}
    		};

    		jQuery.fn.extend( {

    			// offset() relates an element's border box to the document origin
    			offset: function( options ) {

    				// Preserve chaining for setter
    				if ( arguments.length ) {
    					return options === undefined ?
    						this :
    						this.each( function( i ) {
    							jQuery.offset.setOffset( this, options, i );
    						} );
    				}

    				var rect, win,
    					elem = this[ 0 ];

    				if ( !elem ) {
    					return;
    				}

    				// Return zeros for disconnected and hidden (display: none) elements (gh-2310)
    				// Support: IE <=11 only
    				// Running getBoundingClientRect on a
    				// disconnected node in IE throws an error
    				if ( !elem.getClientRects().length ) {
    					return { top: 0, left: 0 };
    				}

    				// Get document-relative position by adding viewport scroll to viewport-relative gBCR
    				rect = elem.getBoundingClientRect();
    				win = elem.ownerDocument.defaultView;
    				return {
    					top: rect.top + win.pageYOffset,
    					left: rect.left + win.pageXOffset
    				};
    			},

    			// position() relates an element's margin box to its offset parent's padding box
    			// This corresponds to the behavior of CSS absolute positioning
    			position: function() {
    				if ( !this[ 0 ] ) {
    					return;
    				}

    				var offsetParent, offset, doc,
    					elem = this[ 0 ],
    					parentOffset = { top: 0, left: 0 };

    				// position:fixed elements are offset from the viewport, which itself always has zero offset
    				if ( jQuery.css( elem, "position" ) === "fixed" ) {

    					// Assume position:fixed implies availability of getBoundingClientRect
    					offset = elem.getBoundingClientRect();

    				} else {
    					offset = this.offset();

    					// Account for the *real* offset parent, which can be the document or its root element
    					// when a statically positioned element is identified
    					doc = elem.ownerDocument;
    					offsetParent = elem.offsetParent || doc.documentElement;
    					while ( offsetParent &&
    						( offsetParent === doc.body || offsetParent === doc.documentElement ) &&
    						jQuery.css( offsetParent, "position" ) === "static" ) {

    						offsetParent = offsetParent.parentNode;
    					}
    					if ( offsetParent && offsetParent !== elem && offsetParent.nodeType === 1 ) {

    						// Incorporate borders into its offset, since they are outside its content origin
    						parentOffset = jQuery( offsetParent ).offset();
    						parentOffset.top += jQuery.css( offsetParent, "borderTopWidth", true );
    						parentOffset.left += jQuery.css( offsetParent, "borderLeftWidth", true );
    					}
    				}

    				// Subtract parent offsets and element margins
    				return {
    					top: offset.top - parentOffset.top - jQuery.css( elem, "marginTop", true ),
    					left: offset.left - parentOffset.left - jQuery.css( elem, "marginLeft", true )
    				};
    			},

    			// This method will return documentElement in the following cases:
    			// 1) For the element inside the iframe without offsetParent, this method will return
    			//    documentElement of the parent window
    			// 2) For the hidden or detached element
    			// 3) For body or html element, i.e. in case of the html node - it will return itself
    			//
    			// but those exceptions were never presented as a real life use-cases
    			// and might be considered as more preferable results.
    			//
    			// This logic, however, is not guaranteed and can change at any point in the future
    			offsetParent: function() {
    				return this.map( function() {
    					var offsetParent = this.offsetParent;

    					while ( offsetParent && jQuery.css( offsetParent, "position" ) === "static" ) {
    						offsetParent = offsetParent.offsetParent;
    					}

    					return offsetParent || documentElement;
    				} );
    			}
    		} );

    		// Create scrollLeft and scrollTop methods
    		jQuery.each( { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" }, function( method, prop ) {
    			var top = "pageYOffset" === prop;

    			jQuery.fn[ method ] = function( val ) {
    				return access( this, function( elem, method, val ) {

    					// Coalesce documents and windows
    					var win;
    					if ( isWindow( elem ) ) {
    						win = elem;
    					} else if ( elem.nodeType === 9 ) {
    						win = elem.defaultView;
    					}

    					if ( val === undefined ) {
    						return win ? win[ prop ] : elem[ method ];
    					}

    					if ( win ) {
    						win.scrollTo(
    							!top ? val : win.pageXOffset,
    							top ? val : win.pageYOffset
    						);

    					} else {
    						elem[ method ] = val;
    					}
    				}, method, val, arguments.length );
    			};
    		} );

    		// Support: Safari <=7 - 9.1, Chrome <=37 - 49
    		// Add the top/left cssHooks using jQuery.fn.position
    		// Webkit bug: https://bugs.webkit.org/show_bug.cgi?id=29084
    		// Blink bug: https://bugs.chromium.org/p/chromium/issues/detail?id=589347
    		// getComputedStyle returns percent when specified for top/left/bottom/right;
    		// rather than make the css module depend on the offset module, just check for it here
    		jQuery.each( [ "top", "left" ], function( _i, prop ) {
    			jQuery.cssHooks[ prop ] = addGetHookIf( support.pixelPosition,
    				function( elem, computed ) {
    					if ( computed ) {
    						computed = curCSS( elem, prop );

    						// If curCSS returns percentage, fallback to offset
    						return rnumnonpx.test( computed ) ?
    							jQuery( elem ).position()[ prop ] + "px" :
    							computed;
    					}
    				}
    			);
    		} );


    		// Create innerHeight, innerWidth, height, width, outerHeight and outerWidth methods
    		jQuery.each( { Height: "height", Width: "width" }, function( name, type ) {
    			jQuery.each( {
    				padding: "inner" + name,
    				content: type,
    				"": "outer" + name
    			}, function( defaultExtra, funcName ) {

    				// Margin is only for outerHeight, outerWidth
    				jQuery.fn[ funcName ] = function( margin, value ) {
    					var chainable = arguments.length && ( defaultExtra || typeof margin !== "boolean" ),
    						extra = defaultExtra || ( margin === true || value === true ? "margin" : "border" );

    					return access( this, function( elem, type, value ) {
    						var doc;

    						if ( isWindow( elem ) ) {

    							// $( window ).outerWidth/Height return w/h including scrollbars (gh-1729)
    							return funcName.indexOf( "outer" ) === 0 ?
    								elem[ "inner" + name ] :
    								elem.document.documentElement[ "client" + name ];
    						}

    						// Get document width or height
    						if ( elem.nodeType === 9 ) {
    							doc = elem.documentElement;

    							// Either scroll[Width/Height] or offset[Width/Height] or client[Width/Height],
    							// whichever is greatest
    							return Math.max(
    								elem.body[ "scroll" + name ], doc[ "scroll" + name ],
    								elem.body[ "offset" + name ], doc[ "offset" + name ],
    								doc[ "client" + name ]
    							);
    						}

    						return value === undefined ?

    							// Get width or height on the element, requesting but not forcing parseFloat
    							jQuery.css( elem, type, extra ) :

    							// Set width or height on the element
    							jQuery.style( elem, type, value, extra );
    					}, type, chainable ? margin : undefined, chainable );
    				};
    			} );
    		} );


    		jQuery.each( [
    			"ajaxStart",
    			"ajaxStop",
    			"ajaxComplete",
    			"ajaxError",
    			"ajaxSuccess",
    			"ajaxSend"
    		], function( _i, type ) {
    			jQuery.fn[ type ] = function( fn ) {
    				return this.on( type, fn );
    			};
    		} );




    		jQuery.fn.extend( {

    			bind: function( types, data, fn ) {
    				return this.on( types, null, data, fn );
    			},
    			unbind: function( types, fn ) {
    				return this.off( types, null, fn );
    			},

    			delegate: function( selector, types, data, fn ) {
    				return this.on( types, selector, data, fn );
    			},
    			undelegate: function( selector, types, fn ) {

    				// ( namespace ) or ( selector, types [, fn] )
    				return arguments.length === 1 ?
    					this.off( selector, "**" ) :
    					this.off( types, selector || "**", fn );
    			},

    			hover: function( fnOver, fnOut ) {
    				return this
    					.on( "mouseenter", fnOver )
    					.on( "mouseleave", fnOut || fnOver );
    			}
    		} );

    		jQuery.each(
    			( "blur focus focusin focusout resize scroll click dblclick " +
    			"mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave " +
    			"change select submit keydown keypress keyup contextmenu" ).split( " " ),
    			function( _i, name ) {

    				// Handle event binding
    				jQuery.fn[ name ] = function( data, fn ) {
    					return arguments.length > 0 ?
    						this.on( name, null, data, fn ) :
    						this.trigger( name );
    				};
    			}
    		);




    		// Support: Android <=4.0 only
    		// Make sure we trim BOM and NBSP
    		// Require that the "whitespace run" starts from a non-whitespace
    		// to avoid O(N^2) behavior when the engine would try matching "\s+$" at each space position.
    		var rtrim = /^[\s\uFEFF\xA0]+|([^\s\uFEFF\xA0])[\s\uFEFF\xA0]+$/g;

    		// Bind a function to a context, optionally partially applying any
    		// arguments.
    		// jQuery.proxy is deprecated to promote standards (specifically Function#bind)
    		// However, it is not slated for removal any time soon
    		jQuery.proxy = function( fn, context ) {
    			var tmp, args, proxy;

    			if ( typeof context === "string" ) {
    				tmp = fn[ context ];
    				context = fn;
    				fn = tmp;
    			}

    			// Quick check to determine if target is callable, in the spec
    			// this throws a TypeError, but we will just return undefined.
    			if ( !isFunction( fn ) ) {
    				return undefined;
    			}

    			// Simulated bind
    			args = slice.call( arguments, 2 );
    			proxy = function() {
    				return fn.apply( context || this, args.concat( slice.call( arguments ) ) );
    			};

    			// Set the guid of unique handler to the same of original handler, so it can be removed
    			proxy.guid = fn.guid = fn.guid || jQuery.guid++;

    			return proxy;
    		};

    		jQuery.holdReady = function( hold ) {
    			if ( hold ) {
    				jQuery.readyWait++;
    			} else {
    				jQuery.ready( true );
    			}
    		};
    		jQuery.isArray = Array.isArray;
    		jQuery.parseJSON = JSON.parse;
    		jQuery.nodeName = nodeName;
    		jQuery.isFunction = isFunction;
    		jQuery.isWindow = isWindow;
    		jQuery.camelCase = camelCase;
    		jQuery.type = toType;

    		jQuery.now = Date.now;

    		jQuery.isNumeric = function( obj ) {

    			// As of jQuery 3.0, isNumeric is limited to
    			// strings and numbers (primitives or objects)
    			// that can be coerced to finite numbers (gh-2662)
    			var type = jQuery.type( obj );
    			return ( type === "number" || type === "string" ) &&

    				// parseFloat NaNs numeric-cast false positives ("")
    				// ...but misinterprets leading-number strings, particularly hex literals ("0x...")
    				// subtraction forces infinities to NaN
    				!isNaN( obj - parseFloat( obj ) );
    		};

    		jQuery.trim = function( text ) {
    			return text == null ?
    				"" :
    				( text + "" ).replace( rtrim, "$1" );
    		};




    		var

    			// Map over jQuery in case of overwrite
    			_jQuery = window.jQuery,

    			// Map over the $ in case of overwrite
    			_$ = window.$;

    		jQuery.noConflict = function( deep ) {
    			if ( window.$ === jQuery ) {
    				window.$ = _$;
    			}

    			if ( deep && window.jQuery === jQuery ) {
    				window.jQuery = _jQuery;
    			}

    			return jQuery;
    		};

    		// Expose jQuery and $ identifiers, even in AMD
    		// (trac-7102#comment:10, https://github.com/jquery/jquery/pull/557)
    		// and CommonJS for browser emulators (trac-13566)
    		if ( typeof noGlobal === "undefined" ) {
    			window.jQuery = window.$ = jQuery;
    		}




    		return jQuery;
    		} ); 
    	} (jquery$1));
    	return jquery$1.exports;
    }

    var jqueryExports = requireJquery();
    var jQuery$1 = /*@__PURE__*/getDefaultExportFromCjs(jqueryExports);

    var select2 = {exports: {}};

    /*!
     * Select2 4.1.0-rc.0
     * https://select2.github.io
     *
     * Released under the MIT license
     * https://github.com/select2/select2/blob/master/LICENSE.md
     */

    var hasRequiredSelect2;

    function requireSelect2 () {
    	if (hasRequiredSelect2) return select2.exports;
    	hasRequiredSelect2 = 1;
    	(function (module) {
    (function (factory) {
    		  if (module.exports) {
    		    // Node/CommonJS
    		    module.exports = function (root, jQuery) {
    		      if (jQuery === undefined) {
    		        // require('jQuery') returns a factory that requires window to
    		        // build a jQuery instance, we normalize how we use modules
    		        // that require this pattern but the window provided is a noop
    		        // if it's defined (how jquery works)
    		        if (typeof window !== 'undefined') {
    		          jQuery = requireJquery();
    		        }
    		        else {
    		          jQuery = requireJquery()(root);
    		        }
    		      }
    		      factory(jQuery);
    		      return jQuery;
    		    };
    		  } else {
    		    // Browser globals
    		    factory(jQuery);
    		  }
    		} (function (jQuery) {
    		  // This is needed so we can catch the AMD loader configuration and use it
    		  // The inner file should be wrapped (by `banner.start.js`) in a function that
    		  // returns the AMD loader references.
    		  var S2 =(function () {
    		  // Restore the Select2 AMD loader so it can be used
    		  // Needed mostly in the language files, where the loader is not inserted
    		  if (jQuery && jQuery.fn && jQuery.fn.select2 && jQuery.fn.select2.amd) {
    		    var S2 = jQuery.fn.select2.amd;
    		  }
    		var S2;(function () { if (!S2 || !S2.requirejs) {
    		if (!S2) { S2 = {}; } else { require = S2; }
    		/**
    		 * @license almond 0.3.3 Copyright jQuery Foundation and other contributors.
    		 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
    		 */
    		//Going sloppy to avoid 'use strict' string cost, but strict practices should
    		//be followed.
    		/*global setTimeout: false */

    		var requirejs, require, define;
    		(function (undef) {
    		    var main, req, makeMap, handlers,
    		        defined = {},
    		        waiting = {},
    		        config = {},
    		        defining = {},
    		        hasOwn = Object.prototype.hasOwnProperty,
    		        aps = [].slice,
    		        jsSuffixRegExp = /\.js$/;

    		    function hasProp(obj, prop) {
    		        return hasOwn.call(obj, prop);
    		    }

    		    /**
    		     * Given a relative module name, like ./something, normalize it to
    		     * a real name that can be mapped to a path.
    		     * @param {String} name the relative name
    		     * @param {String} baseName a real name that the name arg is relative
    		     * to.
    		     * @returns {String} normalized name
    		     */
    		    function normalize(name, baseName) {
    		        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
    		            foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
    		            baseParts = baseName && baseName.split("/"),
    		            map = config.map,
    		            starMap = (map && map['*']) || {};

    		        //Adjust any relative paths.
    		        if (name) {
    		            name = name.split('/');
    		            lastIndex = name.length - 1;

    		            // If wanting node ID compatibility, strip .js from end
    		            // of IDs. Have to do this here, and not in nameToUrl
    		            // because node allows either .js or non .js to map
    		            // to same file.
    		            if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
    		                name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
    		            }

    		            // Starts with a '.' so need the baseName
    		            if (name[0].charAt(0) === '.' && baseParts) {
    		                //Convert baseName to array, and lop off the last part,
    		                //so that . matches that 'directory' and not name of the baseName's
    		                //module. For instance, baseName of 'one/two/three', maps to
    		                //'one/two/three.js', but we want the directory, 'one/two' for
    		                //this normalization.
    		                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
    		                name = normalizedBaseParts.concat(name);
    		            }

    		            //start trimDots
    		            for (i = 0; i < name.length; i++) {
    		                part = name[i];
    		                if (part === '.') {
    		                    name.splice(i, 1);
    		                    i -= 1;
    		                } else if (part === '..') {
    		                    // If at the start, or previous value is still ..,
    		                    // keep them so that when converted to a path it may
    		                    // still work when converted to a path, even though
    		                    // as an ID it is less than ideal. In larger point
    		                    // releases, may be better to just kick out an error.
    		                    if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
    		                        continue;
    		                    } else if (i > 0) {
    		                        name.splice(i - 1, 2);
    		                        i -= 2;
    		                    }
    		                }
    		            }
    		            //end trimDots

    		            name = name.join('/');
    		        }

    		        //Apply map config if available.
    		        if ((baseParts || starMap) && map) {
    		            nameParts = name.split('/');

    		            for (i = nameParts.length; i > 0; i -= 1) {
    		                nameSegment = nameParts.slice(0, i).join("/");

    		                if (baseParts) {
    		                    //Find the longest baseName segment match in the config.
    		                    //So, do joins on the biggest to smallest lengths of baseParts.
    		                    for (j = baseParts.length; j > 0; j -= 1) {
    		                        mapValue = map[baseParts.slice(0, j).join('/')];

    		                        //baseName segment has  config, find if it has one for
    		                        //this name.
    		                        if (mapValue) {
    		                            mapValue = mapValue[nameSegment];
    		                            if (mapValue) {
    		                                //Match, update name to the new value.
    		                                foundMap = mapValue;
    		                                foundI = i;
    		                                break;
    		                            }
    		                        }
    		                    }
    		                }

    		                if (foundMap) {
    		                    break;
    		                }

    		                //Check for a star map match, but just hold on to it,
    		                //if there is a shorter segment match later in a matching
    		                //config, then favor over this star map.
    		                if (!foundStarMap && starMap && starMap[nameSegment]) {
    		                    foundStarMap = starMap[nameSegment];
    		                    starI = i;
    		                }
    		            }

    		            if (!foundMap && foundStarMap) {
    		                foundMap = foundStarMap;
    		                foundI = starI;
    		            }

    		            if (foundMap) {
    		                nameParts.splice(0, foundI, foundMap);
    		                name = nameParts.join('/');
    		            }
    		        }

    		        return name;
    		    }

    		    function makeRequire(relName, forceSync) {
    		        return function () {
    		            //A version of a require function that passes a moduleName
    		            //value for items that may need to
    		            //look up paths relative to the moduleName
    		            var args = aps.call(arguments, 0);

    		            //If first arg is not require('string'), and there is only
    		            //one arg, it is the array form without a callback. Insert
    		            //a null so that the following concat is correct.
    		            if (typeof args[0] !== 'string' && args.length === 1) {
    		                args.push(null);
    		            }
    		            return req.apply(undef, args.concat([relName, forceSync]));
    		        };
    		    }

    		    function makeNormalize(relName) {
    		        return function (name) {
    		            return normalize(name, relName);
    		        };
    		    }

    		    function makeLoad(depName) {
    		        return function (value) {
    		            defined[depName] = value;
    		        };
    		    }

    		    function callDep(name) {
    		        if (hasProp(waiting, name)) {
    		            var args = waiting[name];
    		            delete waiting[name];
    		            defining[name] = true;
    		            main.apply(undef, args);
    		        }

    		        if (!hasProp(defined, name) && !hasProp(defining, name)) {
    		            throw new Error('No ' + name);
    		        }
    		        return defined[name];
    		    }

    		    //Turns a plugin!resource to [plugin, resource]
    		    //with the plugin being undefined if the name
    		    //did not have a plugin prefix.
    		    function splitPrefix(name) {
    		        var prefix,
    		            index = name ? name.indexOf('!') : -1;
    		        if (index > -1) {
    		            prefix = name.substring(0, index);
    		            name = name.substring(index + 1, name.length);
    		        }
    		        return [prefix, name];
    		    }

    		    //Creates a parts array for a relName where first part is plugin ID,
    		    //second part is resource ID. Assumes relName has already been normalized.
    		    function makeRelParts(relName) {
    		        return relName ? splitPrefix(relName) : [];
    		    }

    		    /**
    		     * Makes a name map, normalizing the name, and using a plugin
    		     * for normalization if necessary. Grabs a ref to plugin
    		     * too, as an optimization.
    		     */
    		    makeMap = function (name, relParts) {
    		        var plugin,
    		            parts = splitPrefix(name),
    		            prefix = parts[0],
    		            relResourceName = relParts[1];

    		        name = parts[1];

    		        if (prefix) {
    		            prefix = normalize(prefix, relResourceName);
    		            plugin = callDep(prefix);
    		        }

    		        //Normalize according
    		        if (prefix) {
    		            if (plugin && plugin.normalize) {
    		                name = plugin.normalize(name, makeNormalize(relResourceName));
    		            } else {
    		                name = normalize(name, relResourceName);
    		            }
    		        } else {
    		            name = normalize(name, relResourceName);
    		            parts = splitPrefix(name);
    		            prefix = parts[0];
    		            name = parts[1];
    		            if (prefix) {
    		                plugin = callDep(prefix);
    		            }
    		        }

    		        //Using ridiculous property names for space reasons
    		        return {
    		            f: prefix ? prefix + '!' + name : name, //fullName
    		            n: name,
    		            pr: prefix,
    		            p: plugin
    		        };
    		    };

    		    function makeConfig(name) {
    		        return function () {
    		            return (config && config.config && config.config[name]) || {};
    		        };
    		    }

    		    handlers = {
    		        require: function (name) {
    		            return makeRequire(name);
    		        },
    		        exports: function (name) {
    		            var e = defined[name];
    		            if (typeof e !== 'undefined') {
    		                return e;
    		            } else {
    		                return (defined[name] = {});
    		            }
    		        },
    		        module: function (name) {
    		            return {
    		                id: name,
    		                uri: '',
    		                exports: defined[name],
    		                config: makeConfig(name)
    		            };
    		        }
    		    };

    		    main = function (name, deps, callback, relName) {
    		        var cjsModule, depName, ret, map, i, relParts,
    		            args = [],
    		            callbackType = typeof callback,
    		            usingExports;

    		        //Use name if no relName
    		        relName = relName || name;
    		        relParts = makeRelParts(relName);

    		        //Call the callback to define the module, if necessary.
    		        if (callbackType === 'undefined' || callbackType === 'function') {
    		            //Pull out the defined dependencies and pass the ordered
    		            //values to the callback.
    		            //Default to [require, exports, module] if no deps
    		            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
    		            for (i = 0; i < deps.length; i += 1) {
    		                map = makeMap(deps[i], relParts);
    		                depName = map.f;

    		                //Fast path CommonJS standard dependencies.
    		                if (depName === "require") {
    		                    args[i] = handlers.require(name);
    		                } else if (depName === "exports") {
    		                    //CommonJS module spec 1.1
    		                    args[i] = handlers.exports(name);
    		                    usingExports = true;
    		                } else if (depName === "module") {
    		                    //CommonJS module spec 1.1
    		                    cjsModule = args[i] = handlers.module(name);
    		                } else if (hasProp(defined, depName) ||
    		                           hasProp(waiting, depName) ||
    		                           hasProp(defining, depName)) {
    		                    args[i] = callDep(depName);
    		                } else if (map.p) {
    		                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
    		                    args[i] = defined[depName];
    		                } else {
    		                    throw new Error(name + ' missing ' + depName);
    		                }
    		            }

    		            ret = callback ? callback.apply(defined[name], args) : undefined;

    		            if (name) {
    		                //If setting exports via "module" is in play,
    		                //favor that over return value and exports. After that,
    		                //favor a non-undefined return value over exports use.
    		                if (cjsModule && cjsModule.exports !== undef &&
    		                        cjsModule.exports !== defined[name]) {
    		                    defined[name] = cjsModule.exports;
    		                } else if (ret !== undef || !usingExports) {
    		                    //Use the return value from the function.
    		                    defined[name] = ret;
    		                }
    		            }
    		        } else if (name) {
    		            //May just be an object definition for the module. Only
    		            //worry about defining if have a module name.
    		            defined[name] = callback;
    		        }
    		    };

    		    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
    		        if (typeof deps === "string") {
    		            if (handlers[deps]) {
    		                //callback in this case is really relName
    		                return handlers[deps](callback);
    		            }
    		            //Just return the module wanted. In this scenario, the
    		            //deps arg is the module name, and second arg (if passed)
    		            //is just the relName.
    		            //Normalize module name, if it contains . or ..
    		            return callDep(makeMap(deps, makeRelParts(callback)).f);
    		        } else if (!deps.splice) {
    		            //deps is a config object, not an array.
    		            config = deps;
    		            if (config.deps) {
    		                req(config.deps, config.callback);
    		            }
    		            if (!callback) {
    		                return;
    		            }

    		            if (callback.splice) {
    		                //callback is an array, which means it is a dependency list.
    		                //Adjust args if there are dependencies
    		                deps = callback;
    		                callback = relName;
    		                relName = null;
    		            } else {
    		                deps = undef;
    		            }
    		        }

    		        //Support require(['a'])
    		        callback = callback || function () {};

    		        //If relName is a function, it is an errback handler,
    		        //so remove it.
    		        if (typeof relName === 'function') {
    		            relName = forceSync;
    		            forceSync = alt;
    		        }

    		        //Simulate async callback;
    		        if (forceSync) {
    		            main(undef, deps, callback, relName);
    		        } else {
    		            //Using a non-zero value because of concern for what old browsers
    		            //do, and latest browsers "upgrade" to 4 if lower value is used:
    		            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
    		            //If want a value immediately, use require('id') instead -- something
    		            //that works in almond on the global level, but not guaranteed and
    		            //unlikely to work in other AMD implementations.
    		            setTimeout(function () {
    		                main(undef, deps, callback, relName);
    		            }, 4);
    		        }

    		        return req;
    		    };

    		    /**
    		     * Just drops the config on the floor, but returns req in case
    		     * the config return value is used.
    		     */
    		    req.config = function (cfg) {
    		        return req(cfg);
    		    };

    		    /**
    		     * Expose module registry for debugging and tooling
    		     */
    		    requirejs._defined = defined;

    		    define = function (name, deps, callback) {
    		        if (typeof name !== 'string') {
    		            throw new Error('See almond README: incorrect module build, no module name');
    		        }

    		        //This module may not have dependencies
    		        if (!deps.splice) {
    		            //deps is not an array, so probably means
    		            //an object literal or factory function for
    		            //the value. Adjust args.
    		            callback = deps;
    		            deps = [];
    		        }

    		        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
    		            waiting[name] = [name, deps, callback];
    		        }
    		    };

    		    define.amd = {
    		        jQuery: true
    		    };
    		}());

    		S2.requirejs = requirejs;S2.require = require;S2.define = define;
    		}
    		}());
    		S2.define("almond", function(){});

    		/* global jQuery:false, $:false */
    		S2.define('jquery',[],function () {
    		  var _$ = jQuery || $;

    		  if (_$ == null && console && console.error) {
    		    console.error(
    		      'Select2: An instance of jQuery or a jQuery-compatible library was not ' +
    		      'found. Make sure that you are including jQuery before Select2 on your ' +
    		      'web page.'
    		    );
    		  }

    		  return _$;
    		});

    		S2.define('select2/utils',[
    		  'jquery'
    		], function ($) {
    		  var Utils = {};

    		  Utils.Extend = function (ChildClass, SuperClass) {
    		    var __hasProp = {}.hasOwnProperty;

    		    function BaseConstructor () {
    		      this.constructor = ChildClass;
    		    }

    		    for (var key in SuperClass) {
    		      if (__hasProp.call(SuperClass, key)) {
    		        ChildClass[key] = SuperClass[key];
    		      }
    		    }

    		    BaseConstructor.prototype = SuperClass.prototype;
    		    ChildClass.prototype = new BaseConstructor();
    		    ChildClass.__super__ = SuperClass.prototype;

    		    return ChildClass;
    		  };

    		  function getMethods (theClass) {
    		    var proto = theClass.prototype;

    		    var methods = [];

    		    for (var methodName in proto) {
    		      var m = proto[methodName];

    		      if (typeof m !== 'function') {
    		        continue;
    		      }

    		      if (methodName === 'constructor') {
    		        continue;
    		      }

    		      methods.push(methodName);
    		    }

    		    return methods;
    		  }

    		  Utils.Decorate = function (SuperClass, DecoratorClass) {
    		    var decoratedMethods = getMethods(DecoratorClass);
    		    var superMethods = getMethods(SuperClass);

    		    function DecoratedClass () {
    		      var unshift = Array.prototype.unshift;

    		      var argCount = DecoratorClass.prototype.constructor.length;

    		      var calledConstructor = SuperClass.prototype.constructor;

    		      if (argCount > 0) {
    		        unshift.call(arguments, SuperClass.prototype.constructor);

    		        calledConstructor = DecoratorClass.prototype.constructor;
    		      }

    		      calledConstructor.apply(this, arguments);
    		    }

    		    DecoratorClass.displayName = SuperClass.displayName;

    		    function ctr () {
    		      this.constructor = DecoratedClass;
    		    }

    		    DecoratedClass.prototype = new ctr();

    		    for (var m = 0; m < superMethods.length; m++) {
    		      var superMethod = superMethods[m];

    		      DecoratedClass.prototype[superMethod] =
    		        SuperClass.prototype[superMethod];
    		    }

    		    var calledMethod = function (methodName) {
    		      // Stub out the original method if it's not decorating an actual method
    		      var originalMethod = function () {};

    		      if (methodName in DecoratedClass.prototype) {
    		        originalMethod = DecoratedClass.prototype[methodName];
    		      }

    		      var decoratedMethod = DecoratorClass.prototype[methodName];

    		      return function () {
    		        var unshift = Array.prototype.unshift;

    		        unshift.call(arguments, originalMethod);

    		        return decoratedMethod.apply(this, arguments);
    		      };
    		    };

    		    for (var d = 0; d < decoratedMethods.length; d++) {
    		      var decoratedMethod = decoratedMethods[d];

    		      DecoratedClass.prototype[decoratedMethod] = calledMethod(decoratedMethod);
    		    }

    		    return DecoratedClass;
    		  };

    		  var Observable = function () {
    		    this.listeners = {};
    		  };

    		  Observable.prototype.on = function (event, callback) {
    		    this.listeners = this.listeners || {};

    		    if (event in this.listeners) {
    		      this.listeners[event].push(callback);
    		    } else {
    		      this.listeners[event] = [callback];
    		    }
    		  };

    		  Observable.prototype.trigger = function (event) {
    		    var slice = Array.prototype.slice;
    		    var params = slice.call(arguments, 1);

    		    this.listeners = this.listeners || {};

    		    // Params should always come in as an array
    		    if (params == null) {
    		      params = [];
    		    }

    		    // If there are no arguments to the event, use a temporary object
    		    if (params.length === 0) {
    		      params.push({});
    		    }

    		    // Set the `_type` of the first object to the event
    		    params[0]._type = event;

    		    if (event in this.listeners) {
    		      this.invoke(this.listeners[event], slice.call(arguments, 1));
    		    }

    		    if ('*' in this.listeners) {
    		      this.invoke(this.listeners['*'], arguments);
    		    }
    		  };

    		  Observable.prototype.invoke = function (listeners, params) {
    		    for (var i = 0, len = listeners.length; i < len; i++) {
    		      listeners[i].apply(this, params);
    		    }
    		  };

    		  Utils.Observable = Observable;

    		  Utils.generateChars = function (length) {
    		    var chars = '';

    		    for (var i = 0; i < length; i++) {
    		      var randomChar = Math.floor(Math.random() * 36);
    		      chars += randomChar.toString(36);
    		    }

    		    return chars;
    		  };

    		  Utils.bind = function (func, context) {
    		    return function () {
    		      func.apply(context, arguments);
    		    };
    		  };

    		  Utils._convertData = function (data) {
    		    for (var originalKey in data) {
    		      var keys = originalKey.split('-');

    		      var dataLevel = data;

    		      if (keys.length === 1) {
    		        continue;
    		      }

    		      for (var k = 0; k < keys.length; k++) {
    		        var key = keys[k];

    		        // Lowercase the first letter
    		        // By default, dash-separated becomes camelCase
    		        key = key.substring(0, 1).toLowerCase() + key.substring(1);

    		        if (!(key in dataLevel)) {
    		          dataLevel[key] = {};
    		        }

    		        if (k == keys.length - 1) {
    		          dataLevel[key] = data[originalKey];
    		        }

    		        dataLevel = dataLevel[key];
    		      }

    		      delete data[originalKey];
    		    }

    		    return data;
    		  };

    		  Utils.hasScroll = function (index, el) {
    		    // Adapted from the function created by @ShadowScripter
    		    // and adapted by @BillBarry on the Stack Exchange Code Review website.
    		    // The original code can be found at
    		    // http://codereview.stackexchange.com/q/13338
    		    // and was designed to be used with the Sizzle selector engine.

    		    var $el = $(el);
    		    var overflowX = el.style.overflowX;
    		    var overflowY = el.style.overflowY;

    		    //Check both x and y declarations
    		    if (overflowX === overflowY &&
    		        (overflowY === 'hidden' || overflowY === 'visible')) {
    		      return false;
    		    }

    		    if (overflowX === 'scroll' || overflowY === 'scroll') {
    		      return true;
    		    }

    		    return ($el.innerHeight() < el.scrollHeight ||
    		      $el.innerWidth() < el.scrollWidth);
    		  };

    		  Utils.escapeMarkup = function (markup) {
    		    var replaceMap = {
    		      '\\': '&#92;',
    		      '&': '&amp;',
    		      '<': '&lt;',
    		      '>': '&gt;',
    		      '"': '&quot;',
    		      '\'': '&#39;',
    		      '/': '&#47;'
    		    };

    		    // Do not try to escape the markup if it's not a string
    		    if (typeof markup !== 'string') {
    		      return markup;
    		    }

    		    return String(markup).replace(/[&<>"'\/\\]/g, function (match) {
    		      return replaceMap[match];
    		    });
    		  };

    		  // Cache objects in Utils.__cache instead of $.data (see #4346)
    		  Utils.__cache = {};

    		  var id = 0;
    		  Utils.GetUniqueElementId = function (element) {
    		    // Get a unique element Id. If element has no id,
    		    // creates a new unique number, stores it in the id
    		    // attribute and returns the new id with a prefix.
    		    // If an id already exists, it simply returns it with a prefix.

    		    var select2Id = element.getAttribute('data-select2-id');

    		    if (select2Id != null) {
    		      return select2Id;
    		    }

    		    // If element has id, use it.
    		    if (element.id) {
    		      select2Id = 'select2-data-' + element.id;
    		    } else {
    		      select2Id = 'select2-data-' + (++id).toString() +
    		        '-' + Utils.generateChars(4);
    		    }

    		    element.setAttribute('data-select2-id', select2Id);

    		    return select2Id;
    		  };

    		  Utils.StoreData = function (element, name, value) {
    		    // Stores an item in the cache for a specified element.
    		    // name is the cache key.
    		    var id = Utils.GetUniqueElementId(element);
    		    if (!Utils.__cache[id]) {
    		      Utils.__cache[id] = {};
    		    }

    		    Utils.__cache[id][name] = value;
    		  };

    		  Utils.GetData = function (element, name) {
    		    // Retrieves a value from the cache by its key (name)
    		    // name is optional. If no name specified, return
    		    // all cache items for the specified element.
    		    // and for a specified element.
    		    var id = Utils.GetUniqueElementId(element);
    		    if (name) {
    		      if (Utils.__cache[id]) {
    		        if (Utils.__cache[id][name] != null) {
    		          return Utils.__cache[id][name];
    		        }
    		        return $(element).data(name); // Fallback to HTML5 data attribs.
    		      }
    		      return $(element).data(name); // Fallback to HTML5 data attribs.
    		    } else {
    		      return Utils.__cache[id];
    		    }
    		  };

    		  Utils.RemoveData = function (element) {
    		    // Removes all cached items for a specified element.
    		    var id = Utils.GetUniqueElementId(element);
    		    if (Utils.__cache[id] != null) {
    		      delete Utils.__cache[id];
    		    }

    		    element.removeAttribute('data-select2-id');
    		  };

    		  Utils.copyNonInternalCssClasses = function (dest, src) {

    		    var destinationClasses = dest.getAttribute('class').trim().split(/\s+/);

    		    destinationClasses = destinationClasses.filter(function (clazz) {
    		      // Save all Select2 classes
    		      return clazz.indexOf('select2-') === 0;
    		    });

    		    var sourceClasses = src.getAttribute('class').trim().split(/\s+/);

    		    sourceClasses = sourceClasses.filter(function (clazz) {
    		      // Only copy non-Select2 classes
    		      return clazz.indexOf('select2-') !== 0;
    		    });

    		    var replacements = destinationClasses.concat(sourceClasses);

    		    dest.setAttribute('class', replacements.join(' '));
    		  };

    		  return Utils;
    		});

    		S2.define('select2/results',[
    		  'jquery',
    		  './utils'
    		], function ($, Utils) {
    		  function Results ($element, options, dataAdapter) {
    		    this.$element = $element;
    		    this.data = dataAdapter;
    		    this.options = options;

    		    Results.__super__.constructor.call(this);
    		  }

    		  Utils.Extend(Results, Utils.Observable);

    		  Results.prototype.render = function () {
    		    var $results = $(
    		      '<ul class="select2-results__options" role="listbox"></ul>'
    		    );

    		    if (this.options.get('multiple')) {
    		      $results.attr('aria-multiselectable', 'true');
    		    }

    		    this.$results = $results;

    		    return $results;
    		  };

    		  Results.prototype.clear = function () {
    		    this.$results.empty();
    		  };

    		  Results.prototype.displayMessage = function (params) {
    		    var escapeMarkup = this.options.get('escapeMarkup');

    		    this.clear();
    		    this.hideLoading();

    		    var $message = $(
    		      '<li role="alert" aria-live="assertive"' +
    		      ' class="select2-results__option"></li>'
    		    );

    		    var message = this.options.get('translations').get(params.message);

    		    $message.append(
    		      escapeMarkup(
    		        message(params.args)
    		      )
    		    );

    		    $message[0].className += ' select2-results__message';

    		    this.$results.append($message);
    		  };

    		  Results.prototype.hideMessages = function () {
    		    this.$results.find('.select2-results__message').remove();
    		  };

    		  Results.prototype.append = function (data) {
    		    this.hideLoading();

    		    var $options = [];

    		    if (data.results == null || data.results.length === 0) {
    		      if (this.$results.children().length === 0) {
    		        this.trigger('results:message', {
    		          message: 'noResults'
    		        });
    		      }

    		      return;
    		    }

    		    data.results = this.sort(data.results);

    		    for (var d = 0; d < data.results.length; d++) {
    		      var item = data.results[d];

    		      var $option = this.option(item);

    		      $options.push($option);
    		    }

    		    this.$results.append($options);
    		  };

    		  Results.prototype.position = function ($results, $dropdown) {
    		    var $resultsContainer = $dropdown.find('.select2-results');
    		    $resultsContainer.append($results);
    		  };

    		  Results.prototype.sort = function (data) {
    		    var sorter = this.options.get('sorter');

    		    return sorter(data);
    		  };

    		  Results.prototype.highlightFirstItem = function () {
    		    var $options = this.$results
    		      .find('.select2-results__option--selectable');

    		    var $selected = $options.filter('.select2-results__option--selected');

    		    // Check if there are any selected options
    		    if ($selected.length > 0) {
    		      // If there are selected options, highlight the first
    		      $selected.first().trigger('mouseenter');
    		    } else {
    		      // If there are no selected options, highlight the first option
    		      // in the dropdown
    		      $options.first().trigger('mouseenter');
    		    }

    		    this.ensureHighlightVisible();
    		  };

    		  Results.prototype.setClasses = function () {
    		    var self = this;

    		    this.data.current(function (selected) {
    		      var selectedIds = selected.map(function (s) {
    		        return s.id.toString();
    		      });

    		      var $options = self.$results
    		        .find('.select2-results__option--selectable');

    		      $options.each(function () {
    		        var $option = $(this);

    		        var item = Utils.GetData(this, 'data');

    		        // id needs to be converted to a string when comparing
    		        var id = '' + item.id;

    		        if ((item.element != null && item.element.selected) ||
    		            (item.element == null && selectedIds.indexOf(id) > -1)) {
    		          this.classList.add('select2-results__option--selected');
    		          $option.attr('aria-selected', 'true');
    		        } else {
    		          this.classList.remove('select2-results__option--selected');
    		          $option.attr('aria-selected', 'false');
    		        }
    		      });

    		    });
    		  };

    		  Results.prototype.showLoading = function (params) {
    		    this.hideLoading();

    		    var loadingMore = this.options.get('translations').get('searching');

    		    var loading = {
    		      disabled: true,
    		      loading: true,
    		      text: loadingMore(params)
    		    };
    		    var $loading = this.option(loading);
    		    $loading.className += ' loading-results';

    		    this.$results.prepend($loading);
    		  };

    		  Results.prototype.hideLoading = function () {
    		    this.$results.find('.loading-results').remove();
    		  };

    		  Results.prototype.option = function (data) {
    		    var option = document.createElement('li');
    		    option.classList.add('select2-results__option');
    		    option.classList.add('select2-results__option--selectable');

    		    var attrs = {
    		      'role': 'option'
    		    };

    		    var matches = window.Element.prototype.matches ||
    		      window.Element.prototype.msMatchesSelector ||
    		      window.Element.prototype.webkitMatchesSelector;

    		    if ((data.element != null && matches.call(data.element, ':disabled')) ||
    		        (data.element == null && data.disabled)) {
    		      attrs['aria-disabled'] = 'true';

    		      option.classList.remove('select2-results__option--selectable');
    		      option.classList.add('select2-results__option--disabled');
    		    }

    		    if (data.id == null) {
    		      option.classList.remove('select2-results__option--selectable');
    		    }

    		    if (data._resultId != null) {
    		      option.id = data._resultId;
    		    }

    		    if (data.title) {
    		      option.title = data.title;
    		    }

    		    if (data.children) {
    		      attrs.role = 'group';
    		      attrs['aria-label'] = data.text;

    		      option.classList.remove('select2-results__option--selectable');
    		      option.classList.add('select2-results__option--group');
    		    }

    		    for (var attr in attrs) {
    		      var val = attrs[attr];

    		      option.setAttribute(attr, val);
    		    }

    		    if (data.children) {
    		      var $option = $(option);

    		      var label = document.createElement('strong');
    		      label.className = 'select2-results__group';

    		      this.template(data, label);

    		      var $children = [];

    		      for (var c = 0; c < data.children.length; c++) {
    		        var child = data.children[c];

    		        var $child = this.option(child);

    		        $children.push($child);
    		      }

    		      var $childrenContainer = $('<ul></ul>', {
    		        'class': 'select2-results__options select2-results__options--nested',
    		        'role': 'none'
    		      });

    		      $childrenContainer.append($children);

    		      $option.append(label);
    		      $option.append($childrenContainer);
    		    } else {
    		      this.template(data, option);
    		    }

    		    Utils.StoreData(option, 'data', data);

    		    return option;
    		  };

    		  Results.prototype.bind = function (container, $container) {
    		    var self = this;

    		    var id = container.id + '-results';

    		    this.$results.attr('id', id);

    		    container.on('results:all', function (params) {
    		      self.clear();
    		      self.append(params.data);

    		      if (container.isOpen()) {
    		        self.setClasses();
    		        self.highlightFirstItem();
    		      }
    		    });

    		    container.on('results:append', function (params) {
    		      self.append(params.data);

    		      if (container.isOpen()) {
    		        self.setClasses();
    		      }
    		    });

    		    container.on('query', function (params) {
    		      self.hideMessages();
    		      self.showLoading(params);
    		    });

    		    container.on('select', function () {
    		      if (!container.isOpen()) {
    		        return;
    		      }

    		      self.setClasses();

    		      if (self.options.get('scrollAfterSelect')) {
    		        self.highlightFirstItem();
    		      }
    		    });

    		    container.on('unselect', function () {
    		      if (!container.isOpen()) {
    		        return;
    		      }

    		      self.setClasses();

    		      if (self.options.get('scrollAfterSelect')) {
    		        self.highlightFirstItem();
    		      }
    		    });

    		    container.on('open', function () {
    		      // When the dropdown is open, aria-expended="true"
    		      self.$results.attr('aria-expanded', 'true');
    		      self.$results.attr('aria-hidden', 'false');

    		      self.setClasses();
    		      self.ensureHighlightVisible();
    		    });

    		    container.on('close', function () {
    		      // When the dropdown is closed, aria-expended="false"
    		      self.$results.attr('aria-expanded', 'false');
    		      self.$results.attr('aria-hidden', 'true');
    		      self.$results.removeAttr('aria-activedescendant');
    		    });

    		    container.on('results:toggle', function () {
    		      var $highlighted = self.getHighlightedResults();

    		      if ($highlighted.length === 0) {
    		        return;
    		      }

    		      $highlighted.trigger('mouseup');
    		    });

    		    container.on('results:select', function () {
    		      var $highlighted = self.getHighlightedResults();

    		      if ($highlighted.length === 0) {
    		        return;
    		      }

    		      var data = Utils.GetData($highlighted[0], 'data');

    		      if ($highlighted.hasClass('select2-results__option--selected')) {
    		        self.trigger('close', {});
    		      } else {
    		        self.trigger('select', {
    		          data: data
    		        });
    		      }
    		    });

    		    container.on('results:previous', function () {
    		      var $highlighted = self.getHighlightedResults();

    		      var $options = self.$results.find('.select2-results__option--selectable');

    		      var currentIndex = $options.index($highlighted);

    		      // If we are already at the top, don't move further
    		      // If no options, currentIndex will be -1
    		      if (currentIndex <= 0) {
    		        return;
    		      }

    		      var nextIndex = currentIndex - 1;

    		      // If none are highlighted, highlight the first
    		      if ($highlighted.length === 0) {
    		        nextIndex = 0;
    		      }

    		      var $next = $options.eq(nextIndex);

    		      $next.trigger('mouseenter');

    		      var currentOffset = self.$results.offset().top;
    		      var nextTop = $next.offset().top;
    		      var nextOffset = self.$results.scrollTop() + (nextTop - currentOffset);

    		      if (nextIndex === 0) {
    		        self.$results.scrollTop(0);
    		      } else if (nextTop - currentOffset < 0) {
    		        self.$results.scrollTop(nextOffset);
    		      }
    		    });

    		    container.on('results:next', function () {
    		      var $highlighted = self.getHighlightedResults();

    		      var $options = self.$results.find('.select2-results__option--selectable');

    		      var currentIndex = $options.index($highlighted);

    		      var nextIndex = currentIndex + 1;

    		      // If we are at the last option, stay there
    		      if (nextIndex >= $options.length) {
    		        return;
    		      }

    		      var $next = $options.eq(nextIndex);

    		      $next.trigger('mouseenter');

    		      var currentOffset = self.$results.offset().top +
    		        self.$results.outerHeight(false);
    		      var nextBottom = $next.offset().top + $next.outerHeight(false);
    		      var nextOffset = self.$results.scrollTop() + nextBottom - currentOffset;

    		      if (nextIndex === 0) {
    		        self.$results.scrollTop(0);
    		      } else if (nextBottom > currentOffset) {
    		        self.$results.scrollTop(nextOffset);
    		      }
    		    });

    		    container.on('results:focus', function (params) {
    		      params.element[0].classList.add('select2-results__option--highlighted');
    		      params.element[0].setAttribute('aria-selected', 'true');
    		    });

    		    container.on('results:message', function (params) {
    		      self.displayMessage(params);
    		    });

    		    if ($.fn.mousewheel) {
    		      this.$results.on('mousewheel', function (e) {
    		        var top = self.$results.scrollTop();

    		        var bottom = self.$results.get(0).scrollHeight - top + e.deltaY;

    		        var isAtTop = e.deltaY > 0 && top - e.deltaY <= 0;
    		        var isAtBottom = e.deltaY < 0 && bottom <= self.$results.height();

    		        if (isAtTop) {
    		          self.$results.scrollTop(0);

    		          e.preventDefault();
    		          e.stopPropagation();
    		        } else if (isAtBottom) {
    		          self.$results.scrollTop(
    		            self.$results.get(0).scrollHeight - self.$results.height()
    		          );

    		          e.preventDefault();
    		          e.stopPropagation();
    		        }
    		      });
    		    }

    		    this.$results.on('mouseup', '.select2-results__option--selectable',
    		      function (evt) {
    		      var $this = $(this);

    		      var data = Utils.GetData(this, 'data');

    		      if ($this.hasClass('select2-results__option--selected')) {
    		        if (self.options.get('multiple')) {
    		          self.trigger('unselect', {
    		            originalEvent: evt,
    		            data: data
    		          });
    		        } else {
    		          self.trigger('close', {});
    		        }

    		        return;
    		      }

    		      self.trigger('select', {
    		        originalEvent: evt,
    		        data: data
    		      });
    		    });

    		    this.$results.on('mouseenter', '.select2-results__option--selectable',
    		      function (evt) {
    		      var data = Utils.GetData(this, 'data');

    		      self.getHighlightedResults()
    		          .removeClass('select2-results__option--highlighted')
    		          .attr('aria-selected', 'false');

    		      self.trigger('results:focus', {
    		        data: data,
    		        element: $(this)
    		      });
    		    });
    		  };

    		  Results.prototype.getHighlightedResults = function () {
    		    var $highlighted = this.$results
    		    .find('.select2-results__option--highlighted');

    		    return $highlighted;
    		  };

    		  Results.prototype.destroy = function () {
    		    this.$results.remove();
    		  };

    		  Results.prototype.ensureHighlightVisible = function () {
    		    var $highlighted = this.getHighlightedResults();

    		    if ($highlighted.length === 0) {
    		      return;
    		    }

    		    var $options = this.$results.find('.select2-results__option--selectable');

    		    var currentIndex = $options.index($highlighted);

    		    var currentOffset = this.$results.offset().top;
    		    var nextTop = $highlighted.offset().top;
    		    var nextOffset = this.$results.scrollTop() + (nextTop - currentOffset);

    		    var offsetDelta = nextTop - currentOffset;
    		    nextOffset -= $highlighted.outerHeight(false) * 2;

    		    if (currentIndex <= 2) {
    		      this.$results.scrollTop(0);
    		    } else if (offsetDelta > this.$results.outerHeight() || offsetDelta < 0) {
    		      this.$results.scrollTop(nextOffset);
    		    }
    		  };

    		  Results.prototype.template = function (result, container) {
    		    var template = this.options.get('templateResult');
    		    var escapeMarkup = this.options.get('escapeMarkup');

    		    var content = template(result, container);

    		    if (content == null) {
    		      container.style.display = 'none';
    		    } else if (typeof content === 'string') {
    		      container.innerHTML = escapeMarkup(content);
    		    } else {
    		      $(container).append(content);
    		    }
    		  };

    		  return Results;
    		});

    		S2.define('select2/keys',[

    		], function () {
    		  var KEYS = {
    		    BACKSPACE: 8,
    		    TAB: 9,
    		    ENTER: 13,
    		    SHIFT: 16,
    		    CTRL: 17,
    		    ALT: 18,
    		    ESC: 27,
    		    SPACE: 32,
    		    PAGE_UP: 33,
    		    PAGE_DOWN: 34,
    		    END: 35,
    		    HOME: 36,
    		    LEFT: 37,
    		    UP: 38,
    		    RIGHT: 39,
    		    DOWN: 40,
    		    DELETE: 46
    		  };

    		  return KEYS;
    		});

    		S2.define('select2/selection/base',[
    		  'jquery',
    		  '../utils',
    		  '../keys'
    		], function ($, Utils, KEYS) {
    		  function BaseSelection ($element, options) {
    		    this.$element = $element;
    		    this.options = options;

    		    BaseSelection.__super__.constructor.call(this);
    		  }

    		  Utils.Extend(BaseSelection, Utils.Observable);

    		  BaseSelection.prototype.render = function () {
    		    var $selection = $(
    		      '<span class="select2-selection" role="combobox" ' +
    		      ' aria-haspopup="true" aria-expanded="false">' +
    		      '</span>'
    		    );

    		    this._tabindex = 0;

    		    if (Utils.GetData(this.$element[0], 'old-tabindex') != null) {
    		      this._tabindex = Utils.GetData(this.$element[0], 'old-tabindex');
    		    } else if (this.$element.attr('tabindex') != null) {
    		      this._tabindex = this.$element.attr('tabindex');
    		    }

    		    $selection.attr('title', this.$element.attr('title'));
    		    $selection.attr('tabindex', this._tabindex);
    		    $selection.attr('aria-disabled', 'false');

    		    this.$selection = $selection;

    		    return $selection;
    		  };

    		  BaseSelection.prototype.bind = function (container, $container) {
    		    var self = this;

    		    var resultsId = container.id + '-results';

    		    this.container = container;

    		    this.$selection.on('focus', function (evt) {
    		      self.trigger('focus', evt);
    		    });

    		    this.$selection.on('blur', function (evt) {
    		      self._handleBlur(evt);
    		    });

    		    this.$selection.on('keydown', function (evt) {
    		      self.trigger('keypress', evt);

    		      if (evt.which === KEYS.SPACE) {
    		        evt.preventDefault();
    		      }
    		    });

    		    container.on('results:focus', function (params) {
    		      self.$selection.attr('aria-activedescendant', params.data._resultId);
    		    });

    		    container.on('selection:update', function (params) {
    		      self.update(params.data);
    		    });

    		    container.on('open', function () {
    		      // When the dropdown is open, aria-expanded="true"
    		      self.$selection.attr('aria-expanded', 'true');
    		      self.$selection.attr('aria-owns', resultsId);

    		      self._attachCloseHandler(container);
    		    });

    		    container.on('close', function () {
    		      // When the dropdown is closed, aria-expanded="false"
    		      self.$selection.attr('aria-expanded', 'false');
    		      self.$selection.removeAttr('aria-activedescendant');
    		      self.$selection.removeAttr('aria-owns');

    		      self.$selection.trigger('focus');

    		      self._detachCloseHandler(container);
    		    });

    		    container.on('enable', function () {
    		      self.$selection.attr('tabindex', self._tabindex);
    		      self.$selection.attr('aria-disabled', 'false');
    		    });

    		    container.on('disable', function () {
    		      self.$selection.attr('tabindex', '-1');
    		      self.$selection.attr('aria-disabled', 'true');
    		    });
    		  };

    		  BaseSelection.prototype._handleBlur = function (evt) {
    		    var self = this;

    		    // This needs to be delayed as the active element is the body when the tab
    		    // key is pressed, possibly along with others.
    		    window.setTimeout(function () {
    		      // Don't trigger `blur` if the focus is still in the selection
    		      if (
    		        (document.activeElement == self.$selection[0]) ||
    		        ($.contains(self.$selection[0], document.activeElement))
    		      ) {
    		        return;
    		      }

    		      self.trigger('blur', evt);
    		    }, 1);
    		  };

    		  BaseSelection.prototype._attachCloseHandler = function (container) {

    		    $(document.body).on('mousedown.select2.' + container.id, function (e) {
    		      var $target = $(e.target);

    		      var $select = $target.closest('.select2');

    		      var $all = $('.select2.select2-container--open');

    		      $all.each(function () {
    		        if (this == $select[0]) {
    		          return;
    		        }

    		        var $element = Utils.GetData(this, 'element');

    		        $element.select2('close');
    		      });
    		    });
    		  };

    		  BaseSelection.prototype._detachCloseHandler = function (container) {
    		    $(document.body).off('mousedown.select2.' + container.id);
    		  };

    		  BaseSelection.prototype.position = function ($selection, $container) {
    		    var $selectionContainer = $container.find('.selection');
    		    $selectionContainer.append($selection);
    		  };

    		  BaseSelection.prototype.destroy = function () {
    		    this._detachCloseHandler(this.container);
    		  };

    		  BaseSelection.prototype.update = function (data) {
    		    throw new Error('The `update` method must be defined in child classes.');
    		  };

    		  /**
    		   * Helper method to abstract the "enabled" (not "disabled") state of this
    		   * object.
    		   *
    		   * @return {true} if the instance is not disabled.
    		   * @return {false} if the instance is disabled.
    		   */
    		  BaseSelection.prototype.isEnabled = function () {
    		    return !this.isDisabled();
    		  };

    		  /**
    		   * Helper method to abstract the "disabled" state of this object.
    		   *
    		   * @return {true} if the disabled option is true.
    		   * @return {false} if the disabled option is false.
    		   */
    		  BaseSelection.prototype.isDisabled = function () {
    		    return this.options.get('disabled');
    		  };

    		  return BaseSelection;
    		});

    		S2.define('select2/selection/single',[
    		  'jquery',
    		  './base',
    		  '../utils',
    		  '../keys'
    		], function ($, BaseSelection, Utils, KEYS) {
    		  function SingleSelection () {
    		    SingleSelection.__super__.constructor.apply(this, arguments);
    		  }

    		  Utils.Extend(SingleSelection, BaseSelection);

    		  SingleSelection.prototype.render = function () {
    		    var $selection = SingleSelection.__super__.render.call(this);

    		    $selection[0].classList.add('select2-selection--single');

    		    $selection.html(
    		      '<span class="select2-selection__rendered"></span>' +
    		      '<span class="select2-selection__arrow" role="presentation">' +
    		        '<b role="presentation"></b>' +
    		      '</span>'
    		    );

    		    return $selection;
    		  };

    		  SingleSelection.prototype.bind = function (container, $container) {
    		    var self = this;

    		    SingleSelection.__super__.bind.apply(this, arguments);

    		    var id = container.id + '-container';

    		    this.$selection.find('.select2-selection__rendered')
    		      .attr('id', id)
    		      .attr('role', 'textbox')
    		      .attr('aria-readonly', 'true');
    		    this.$selection.attr('aria-labelledby', id);
    		    this.$selection.attr('aria-controls', id);

    		    this.$selection.on('mousedown', function (evt) {
    		      // Only respond to left clicks
    		      if (evt.which !== 1) {
    		        return;
    		      }

    		      self.trigger('toggle', {
    		        originalEvent: evt
    		      });
    		    });

    		    this.$selection.on('focus', function (evt) {
    		      // User focuses on the container
    		    });

    		    this.$selection.on('blur', function (evt) {
    		      // User exits the container
    		    });

    		    container.on('focus', function (evt) {
    		      if (!container.isOpen()) {
    		        self.$selection.trigger('focus');
    		      }
    		    });
    		  };

    		  SingleSelection.prototype.clear = function () {
    		    var $rendered = this.$selection.find('.select2-selection__rendered');
    		    $rendered.empty();
    		    $rendered.removeAttr('title'); // clear tooltip on empty
    		  };

    		  SingleSelection.prototype.display = function (data, container) {
    		    var template = this.options.get('templateSelection');
    		    var escapeMarkup = this.options.get('escapeMarkup');

    		    return escapeMarkup(template(data, container));
    		  };

    		  SingleSelection.prototype.selectionContainer = function () {
    		    return $('<span></span>');
    		  };

    		  SingleSelection.prototype.update = function (data) {
    		    if (data.length === 0) {
    		      this.clear();
    		      return;
    		    }

    		    var selection = data[0];

    		    var $rendered = this.$selection.find('.select2-selection__rendered');
    		    var formatted = this.display(selection, $rendered);

    		    $rendered.empty().append(formatted);

    		    var title = selection.title || selection.text;

    		    if (title) {
    		      $rendered.attr('title', title);
    		    } else {
    		      $rendered.removeAttr('title');
    		    }
    		  };

    		  return SingleSelection;
    		});

    		S2.define('select2/selection/multiple',[
    		  'jquery',
    		  './base',
    		  '../utils'
    		], function ($, BaseSelection, Utils) {
    		  function MultipleSelection ($element, options) {
    		    MultipleSelection.__super__.constructor.apply(this, arguments);
    		  }

    		  Utils.Extend(MultipleSelection, BaseSelection);

    		  MultipleSelection.prototype.render = function () {
    		    var $selection = MultipleSelection.__super__.render.call(this);

    		    $selection[0].classList.add('select2-selection--multiple');

    		    $selection.html(
    		      '<ul class="select2-selection__rendered"></ul>'
    		    );

    		    return $selection;
    		  };

    		  MultipleSelection.prototype.bind = function (container, $container) {
    		    var self = this;

    		    MultipleSelection.__super__.bind.apply(this, arguments);

    		    var id = container.id + '-container';
    		    this.$selection.find('.select2-selection__rendered').attr('id', id);

    		    this.$selection.on('click', function (evt) {
    		      self.trigger('toggle', {
    		        originalEvent: evt
    		      });
    		    });

    		    this.$selection.on(
    		      'click',
    		      '.select2-selection__choice__remove',
    		      function (evt) {
    		        // Ignore the event if it is disabled
    		        if (self.isDisabled()) {
    		          return;
    		        }

    		        var $remove = $(this);
    		        var $selection = $remove.parent();

    		        var data = Utils.GetData($selection[0], 'data');

    		        self.trigger('unselect', {
    		          originalEvent: evt,
    		          data: data
    		        });
    		      }
    		    );

    		    this.$selection.on(
    		      'keydown',
    		      '.select2-selection__choice__remove',
    		      function (evt) {
    		        // Ignore the event if it is disabled
    		        if (self.isDisabled()) {
    		          return;
    		        }

    		        evt.stopPropagation();
    		      }
    		    );
    		  };

    		  MultipleSelection.prototype.clear = function () {
    		    var $rendered = this.$selection.find('.select2-selection__rendered');
    		    $rendered.empty();
    		    $rendered.removeAttr('title');
    		  };

    		  MultipleSelection.prototype.display = function (data, container) {
    		    var template = this.options.get('templateSelection');
    		    var escapeMarkup = this.options.get('escapeMarkup');

    		    return escapeMarkup(template(data, container));
    		  };

    		  MultipleSelection.prototype.selectionContainer = function () {
    		    var $container = $(
    		      '<li class="select2-selection__choice">' +
    		        '<button type="button" class="select2-selection__choice__remove" ' +
    		        'tabindex="-1">' +
    		          '<span aria-hidden="true">&times;</span>' +
    		        '</button>' +
    		        '<span class="select2-selection__choice__display"></span>' +
    		      '</li>'
    		    );

    		    return $container;
    		  };

    		  MultipleSelection.prototype.update = function (data) {
    		    this.clear();

    		    if (data.length === 0) {
    		      return;
    		    }

    		    var $selections = [];

    		    var selectionIdPrefix = this.$selection.find('.select2-selection__rendered')
    		      .attr('id') + '-choice-';

    		    for (var d = 0; d < data.length; d++) {
    		      var selection = data[d];

    		      var $selection = this.selectionContainer();
    		      var formatted = this.display(selection, $selection);

    		      var selectionId = selectionIdPrefix + Utils.generateChars(4) + '-';

    		      if (selection.id) {
    		        selectionId += selection.id;
    		      } else {
    		        selectionId += Utils.generateChars(4);
    		      }

    		      $selection.find('.select2-selection__choice__display')
    		        .append(formatted)
    		        .attr('id', selectionId);

    		      var title = selection.title || selection.text;

    		      if (title) {
    		        $selection.attr('title', title);
    		      }

    		      var removeItem = this.options.get('translations').get('removeItem');

    		      var $remove = $selection.find('.select2-selection__choice__remove');

    		      $remove.attr('title', removeItem());
    		      $remove.attr('aria-label', removeItem());
    		      $remove.attr('aria-describedby', selectionId);

    		      Utils.StoreData($selection[0], 'data', selection);

    		      $selections.push($selection);
    		    }

    		    var $rendered = this.$selection.find('.select2-selection__rendered');

    		    $rendered.append($selections);
    		  };

    		  return MultipleSelection;
    		});

    		S2.define('select2/selection/placeholder',[

    		], function () {
    		  function Placeholder (decorated, $element, options) {
    		    this.placeholder = this.normalizePlaceholder(options.get('placeholder'));

    		    decorated.call(this, $element, options);
    		  }

    		  Placeholder.prototype.normalizePlaceholder = function (_, placeholder) {
    		    if (typeof placeholder === 'string') {
    		      placeholder = {
    		        id: '',
    		        text: placeholder
    		      };
    		    }

    		    return placeholder;
    		  };

    		  Placeholder.prototype.createPlaceholder = function (decorated, placeholder) {
    		    var $placeholder = this.selectionContainer();

    		    $placeholder.html(this.display(placeholder));
    		    $placeholder[0].classList.add('select2-selection__placeholder');
    		    $placeholder[0].classList.remove('select2-selection__choice');

    		    var placeholderTitle = placeholder.title ||
    		      placeholder.text ||
    		      $placeholder.text();

    		    this.$selection.find('.select2-selection__rendered').attr(
    		      'title',
    		      placeholderTitle
    		    );

    		    return $placeholder;
    		  };

    		  Placeholder.prototype.update = function (decorated, data) {
    		    var singlePlaceholder = (
    		      data.length == 1 && data[0].id != this.placeholder.id
    		    );
    		    var multipleSelections = data.length > 1;

    		    if (multipleSelections || singlePlaceholder) {
    		      return decorated.call(this, data);
    		    }

    		    this.clear();

    		    var $placeholder = this.createPlaceholder(this.placeholder);

    		    this.$selection.find('.select2-selection__rendered').append($placeholder);
    		  };

    		  return Placeholder;
    		});

    		S2.define('select2/selection/allowClear',[
    		  'jquery',
    		  '../keys',
    		  '../utils'
    		], function ($, KEYS, Utils) {
    		  function AllowClear () { }

    		  AllowClear.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    decorated.call(this, container, $container);

    		    if (this.placeholder == null) {
    		      if (this.options.get('debug') && window.console && console.error) {
    		        console.error(
    		          'Select2: The `allowClear` option should be used in combination ' +
    		          'with the `placeholder` option.'
    		        );
    		      }
    		    }

    		    this.$selection.on('mousedown', '.select2-selection__clear',
    		      function (evt) {
    		        self._handleClear(evt);
    		    });

    		    container.on('keypress', function (evt) {
    		      self._handleKeyboardClear(evt, container);
    		    });
    		  };

    		  AllowClear.prototype._handleClear = function (_, evt) {
    		    // Ignore the event if it is disabled
    		    if (this.isDisabled()) {
    		      return;
    		    }

    		    var $clear = this.$selection.find('.select2-selection__clear');

    		    // Ignore the event if nothing has been selected
    		    if ($clear.length === 0) {
    		      return;
    		    }

    		    evt.stopPropagation();

    		    var data = Utils.GetData($clear[0], 'data');

    		    var previousVal = this.$element.val();
    		    this.$element.val(this.placeholder.id);

    		    var unselectData = {
    		      data: data
    		    };
    		    this.trigger('clear', unselectData);
    		    if (unselectData.prevented) {
    		      this.$element.val(previousVal);
    		      return;
    		    }

    		    for (var d = 0; d < data.length; d++) {
    		      unselectData = {
    		        data: data[d]
    		      };

    		      // Trigger the `unselect` event, so people can prevent it from being
    		      // cleared.
    		      this.trigger('unselect', unselectData);

    		      // If the event was prevented, don't clear it out.
    		      if (unselectData.prevented) {
    		        this.$element.val(previousVal);
    		        return;
    		      }
    		    }

    		    this.$element.trigger('input').trigger('change');

    		    this.trigger('toggle', {});
    		  };

    		  AllowClear.prototype._handleKeyboardClear = function (_, evt, container) {
    		    if (container.isOpen()) {
    		      return;
    		    }

    		    if (evt.which == KEYS.DELETE || evt.which == KEYS.BACKSPACE) {
    		      this._handleClear(evt);
    		    }
    		  };

    		  AllowClear.prototype.update = function (decorated, data) {
    		    decorated.call(this, data);

    		    this.$selection.find('.select2-selection__clear').remove();
    		    this.$selection[0].classList.remove('select2-selection--clearable');

    		    if (this.$selection.find('.select2-selection__placeholder').length > 0 ||
    		        data.length === 0) {
    		      return;
    		    }

    		    var selectionId = this.$selection.find('.select2-selection__rendered')
    		      .attr('id');

    		    var removeAll = this.options.get('translations').get('removeAllItems');

    		    var $remove = $(
    		      '<button type="button" class="select2-selection__clear" tabindex="-1">' +
    		        '<span aria-hidden="true">&times;</span>' +
    		      '</button>'
    		    );
    		    $remove.attr('title', removeAll());
    		    $remove.attr('aria-label', removeAll());
    		    $remove.attr('aria-describedby', selectionId);
    		    Utils.StoreData($remove[0], 'data', data);

    		    this.$selection.prepend($remove);
    		    this.$selection[0].classList.add('select2-selection--clearable');
    		  };

    		  return AllowClear;
    		});

    		S2.define('select2/selection/search',[
    		  'jquery',
    		  '../utils',
    		  '../keys'
    		], function ($, Utils, KEYS) {
    		  function Search (decorated, $element, options) {
    		    decorated.call(this, $element, options);
    		  }

    		  Search.prototype.render = function (decorated) {
    		    var searchLabel = this.options.get('translations').get('search');
    		    var $search = $(
    		      '<span class="select2-search select2-search--inline">' +
    		        '<textarea class="select2-search__field"'+
    		        ' type="search" tabindex="-1"' +
    		        ' autocorrect="off" autocapitalize="none"' +
    		        ' spellcheck="false" role="searchbox" aria-autocomplete="list" >' +
    		        '</textarea>' +
    		      '</span>'
    		    );

    		    this.$searchContainer = $search;
    		    this.$search = $search.find('textarea');

    		    this.$search.prop('autocomplete', this.options.get('autocomplete'));
    		    this.$search.attr('aria-label', searchLabel());

    		    var $rendered = decorated.call(this);

    		    this._transferTabIndex();
    		    $rendered.append(this.$searchContainer);

    		    return $rendered;
    		  };

    		  Search.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    var resultsId = container.id + '-results';
    		    var selectionId = container.id + '-container';

    		    decorated.call(this, container, $container);

    		    self.$search.attr('aria-describedby', selectionId);

    		    container.on('open', function () {
    		      self.$search.attr('aria-controls', resultsId);
    		      self.$search.trigger('focus');
    		    });

    		    container.on('close', function () {
    		      self.$search.val('');
    		      self.resizeSearch();
    		      self.$search.removeAttr('aria-controls');
    		      self.$search.removeAttr('aria-activedescendant');
    		      self.$search.trigger('focus');
    		    });

    		    container.on('enable', function () {
    		      self.$search.prop('disabled', false);

    		      self._transferTabIndex();
    		    });

    		    container.on('disable', function () {
    		      self.$search.prop('disabled', true);
    		    });

    		    container.on('focus', function (evt) {
    		      self.$search.trigger('focus');
    		    });

    		    container.on('results:focus', function (params) {
    		      if (params.data._resultId) {
    		        self.$search.attr('aria-activedescendant', params.data._resultId);
    		      } else {
    		        self.$search.removeAttr('aria-activedescendant');
    		      }
    		    });

    		    this.$selection.on('focusin', '.select2-search--inline', function (evt) {
    		      self.trigger('focus', evt);
    		    });

    		    this.$selection.on('focusout', '.select2-search--inline', function (evt) {
    		      self._handleBlur(evt);
    		    });

    		    this.$selection.on('keydown', '.select2-search--inline', function (evt) {
    		      evt.stopPropagation();

    		      self.trigger('keypress', evt);

    		      self._keyUpPrevented = evt.isDefaultPrevented();

    		      var key = evt.which;

    		      if (key === KEYS.BACKSPACE && self.$search.val() === '') {
    		        var $previousChoice = self.$selection
    		          .find('.select2-selection__choice').last();

    		        if ($previousChoice.length > 0) {
    		          var item = Utils.GetData($previousChoice[0], 'data');

    		          self.searchRemoveChoice(item);

    		          evt.preventDefault();
    		        }
    		      }
    		    });

    		    this.$selection.on('click', '.select2-search--inline', function (evt) {
    		      if (self.$search.val()) {
    		        evt.stopPropagation();
    		      }
    		    });

    		    // Try to detect the IE version should the `documentMode` property that
    		    // is stored on the document. This is only implemented in IE and is
    		    // slightly cleaner than doing a user agent check.
    		    // This property is not available in Edge, but Edge also doesn't have
    		    // this bug.
    		    var msie = document.documentMode;
    		    var disableInputEvents = msie && msie <= 11;

    		    // Workaround for browsers which do not support the `input` event
    		    // This will prevent double-triggering of events for browsers which support
    		    // both the `keyup` and `input` events.
    		    this.$selection.on(
    		      'input.searchcheck',
    		      '.select2-search--inline',
    		      function (evt) {
    		        // IE will trigger the `input` event when a placeholder is used on a
    		        // search box. To get around this issue, we are forced to ignore all
    		        // `input` events in IE and keep using `keyup`.
    		        if (disableInputEvents) {
    		          self.$selection.off('input.search input.searchcheck');
    		          return;
    		        }

    		        // Unbind the duplicated `keyup` event
    		        self.$selection.off('keyup.search');
    		      }
    		    );

    		    this.$selection.on(
    		      'keyup.search input.search',
    		      '.select2-search--inline',
    		      function (evt) {
    		        // IE will trigger the `input` event when a placeholder is used on a
    		        // search box. To get around this issue, we are forced to ignore all
    		        // `input` events in IE and keep using `keyup`.
    		        if (disableInputEvents && evt.type === 'input') {
    		          self.$selection.off('input.search input.searchcheck');
    		          return;
    		        }

    		        var key = evt.which;

    		        // We can freely ignore events from modifier keys
    		        if (key == KEYS.SHIFT || key == KEYS.CTRL || key == KEYS.ALT) {
    		          return;
    		        }

    		        // Tabbing will be handled during the `keydown` phase
    		        if (key == KEYS.TAB) {
    		          return;
    		        }

    		        self.handleSearch(evt);
    		      }
    		    );
    		  };

    		  /**
    		   * This method will transfer the tabindex attribute from the rendered
    		   * selection to the search box. This allows for the search box to be used as
    		   * the primary focus instead of the selection container.
    		   *
    		   * @private
    		   */
    		  Search.prototype._transferTabIndex = function (decorated) {
    		    this.$search.attr('tabindex', this.$selection.attr('tabindex'));
    		    this.$selection.attr('tabindex', '-1');
    		  };

    		  Search.prototype.createPlaceholder = function (decorated, placeholder) {
    		    this.$search.attr('placeholder', placeholder.text);
    		  };

    		  Search.prototype.update = function (decorated, data) {
    		    var searchHadFocus = this.$search[0] == document.activeElement;

    		    this.$search.attr('placeholder', '');

    		    decorated.call(this, data);

    		    this.resizeSearch();
    		    if (searchHadFocus) {
    		      this.$search.trigger('focus');
    		    }
    		  };

    		  Search.prototype.handleSearch = function () {
    		    this.resizeSearch();

    		    if (!this._keyUpPrevented) {
    		      var input = this.$search.val();

    		      this.trigger('query', {
    		        term: input
    		      });
    		    }

    		    this._keyUpPrevented = false;
    		  };

    		  Search.prototype.searchRemoveChoice = function (decorated, item) {
    		    this.trigger('unselect', {
    		      data: item
    		    });

    		    this.$search.val(item.text);
    		    this.handleSearch();
    		  };

    		  Search.prototype.resizeSearch = function () {
    		    this.$search.css('width', '25px');

    		    var width = '100%';

    		    if (this.$search.attr('placeholder') === '') {
    		      var minimumWidth = this.$search.val().length + 1;

    		      width = (minimumWidth * 0.75) + 'em';
    		    }

    		    this.$search.css('width', width);
    		  };

    		  return Search;
    		});

    		S2.define('select2/selection/selectionCss',[
    		  '../utils'
    		], function (Utils) {
    		  function SelectionCSS () { }

    		  SelectionCSS.prototype.render = function (decorated) {
    		    var $selection = decorated.call(this);

    		    var selectionCssClass = this.options.get('selectionCssClass') || '';

    		    if (selectionCssClass.indexOf(':all:') !== -1) {
    		      selectionCssClass = selectionCssClass.replace(':all:', '');

    		      Utils.copyNonInternalCssClasses($selection[0], this.$element[0]);
    		    }

    		    $selection.addClass(selectionCssClass);

    		    return $selection;
    		  };

    		  return SelectionCSS;
    		});

    		S2.define('select2/selection/eventRelay',[
    		  'jquery'
    		], function ($) {
    		  function EventRelay () { }

    		  EventRelay.prototype.bind = function (decorated, container, $container) {
    		    var self = this;
    		    var relayEvents = [
    		      'open', 'opening',
    		      'close', 'closing',
    		      'select', 'selecting',
    		      'unselect', 'unselecting',
    		      'clear', 'clearing'
    		    ];

    		    var preventableEvents = [
    		      'opening', 'closing', 'selecting', 'unselecting', 'clearing'
    		    ];

    		    decorated.call(this, container, $container);

    		    container.on('*', function (name, params) {
    		      // Ignore events that should not be relayed
    		      if (relayEvents.indexOf(name) === -1) {
    		        return;
    		      }

    		      // The parameters should always be an object
    		      params = params || {};

    		      // Generate the jQuery event for the Select2 event
    		      var evt = $.Event('select2:' + name, {
    		        params: params
    		      });

    		      self.$element.trigger(evt);

    		      // Only handle preventable events if it was one
    		      if (preventableEvents.indexOf(name) === -1) {
    		        return;
    		      }

    		      params.prevented = evt.isDefaultPrevented();
    		    });
    		  };

    		  return EventRelay;
    		});

    		S2.define('select2/translation',[
    		  'jquery',
    		  'require'
    		], function ($, require) {
    		  function Translation (dict) {
    		    this.dict = dict || {};
    		  }

    		  Translation.prototype.all = function () {
    		    return this.dict;
    		  };

    		  Translation.prototype.get = function (key) {
    		    return this.dict[key];
    		  };

    		  Translation.prototype.extend = function (translation) {
    		    this.dict = $.extend({}, translation.all(), this.dict);
    		  };

    		  // Static functions

    		  Translation._cache = {};

    		  Translation.loadPath = function (path) {
    		    if (!(path in Translation._cache)) {
    		      var translations = require(path);

    		      Translation._cache[path] = translations;
    		    }

    		    return new Translation(Translation._cache[path]);
    		  };

    		  return Translation;
    		});

    		S2.define('select2/diacritics',[

    		], function () {
    		  var diacritics = {
    		    '\u24B6': 'A',
    		    '\uFF21': 'A',
    		    '\u00C0': 'A',
    		    '\u00C1': 'A',
    		    '\u00C2': 'A',
    		    '\u1EA6': 'A',
    		    '\u1EA4': 'A',
    		    '\u1EAA': 'A',
    		    '\u1EA8': 'A',
    		    '\u00C3': 'A',
    		    '\u0100': 'A',
    		    '\u0102': 'A',
    		    '\u1EB0': 'A',
    		    '\u1EAE': 'A',
    		    '\u1EB4': 'A',
    		    '\u1EB2': 'A',
    		    '\u0226': 'A',
    		    '\u01E0': 'A',
    		    '\u00C4': 'A',
    		    '\u01DE': 'A',
    		    '\u1EA2': 'A',
    		    '\u00C5': 'A',
    		    '\u01FA': 'A',
    		    '\u01CD': 'A',
    		    '\u0200': 'A',
    		    '\u0202': 'A',
    		    '\u1EA0': 'A',
    		    '\u1EAC': 'A',
    		    '\u1EB6': 'A',
    		    '\u1E00': 'A',
    		    '\u0104': 'A',
    		    '\u023A': 'A',
    		    '\u2C6F': 'A',
    		    '\uA732': 'AA',
    		    '\u00C6': 'AE',
    		    '\u01FC': 'AE',
    		    '\u01E2': 'AE',
    		    '\uA734': 'AO',
    		    '\uA736': 'AU',
    		    '\uA738': 'AV',
    		    '\uA73A': 'AV',
    		    '\uA73C': 'AY',
    		    '\u24B7': 'B',
    		    '\uFF22': 'B',
    		    '\u1E02': 'B',
    		    '\u1E04': 'B',
    		    '\u1E06': 'B',
    		    '\u0243': 'B',
    		    '\u0182': 'B',
    		    '\u0181': 'B',
    		    '\u24B8': 'C',
    		    '\uFF23': 'C',
    		    '\u0106': 'C',
    		    '\u0108': 'C',
    		    '\u010A': 'C',
    		    '\u010C': 'C',
    		    '\u00C7': 'C',
    		    '\u1E08': 'C',
    		    '\u0187': 'C',
    		    '\u023B': 'C',
    		    '\uA73E': 'C',
    		    '\u24B9': 'D',
    		    '\uFF24': 'D',
    		    '\u1E0A': 'D',
    		    '\u010E': 'D',
    		    '\u1E0C': 'D',
    		    '\u1E10': 'D',
    		    '\u1E12': 'D',
    		    '\u1E0E': 'D',
    		    '\u0110': 'D',
    		    '\u018B': 'D',
    		    '\u018A': 'D',
    		    '\u0189': 'D',
    		    '\uA779': 'D',
    		    '\u01F1': 'DZ',
    		    '\u01C4': 'DZ',
    		    '\u01F2': 'Dz',
    		    '\u01C5': 'Dz',
    		    '\u24BA': 'E',
    		    '\uFF25': 'E',
    		    '\u00C8': 'E',
    		    '\u00C9': 'E',
    		    '\u00CA': 'E',
    		    '\u1EC0': 'E',
    		    '\u1EBE': 'E',
    		    '\u1EC4': 'E',
    		    '\u1EC2': 'E',
    		    '\u1EBC': 'E',
    		    '\u0112': 'E',
    		    '\u1E14': 'E',
    		    '\u1E16': 'E',
    		    '\u0114': 'E',
    		    '\u0116': 'E',
    		    '\u00CB': 'E',
    		    '\u1EBA': 'E',
    		    '\u011A': 'E',
    		    '\u0204': 'E',
    		    '\u0206': 'E',
    		    '\u1EB8': 'E',
    		    '\u1EC6': 'E',
    		    '\u0228': 'E',
    		    '\u1E1C': 'E',
    		    '\u0118': 'E',
    		    '\u1E18': 'E',
    		    '\u1E1A': 'E',
    		    '\u0190': 'E',
    		    '\u018E': 'E',
    		    '\u24BB': 'F',
    		    '\uFF26': 'F',
    		    '\u1E1E': 'F',
    		    '\u0191': 'F',
    		    '\uA77B': 'F',
    		    '\u24BC': 'G',
    		    '\uFF27': 'G',
    		    '\u01F4': 'G',
    		    '\u011C': 'G',
    		    '\u1E20': 'G',
    		    '\u011E': 'G',
    		    '\u0120': 'G',
    		    '\u01E6': 'G',
    		    '\u0122': 'G',
    		    '\u01E4': 'G',
    		    '\u0193': 'G',
    		    '\uA7A0': 'G',
    		    '\uA77D': 'G',
    		    '\uA77E': 'G',
    		    '\u24BD': 'H',
    		    '\uFF28': 'H',
    		    '\u0124': 'H',
    		    '\u1E22': 'H',
    		    '\u1E26': 'H',
    		    '\u021E': 'H',
    		    '\u1E24': 'H',
    		    '\u1E28': 'H',
    		    '\u1E2A': 'H',
    		    '\u0126': 'H',
    		    '\u2C67': 'H',
    		    '\u2C75': 'H',
    		    '\uA78D': 'H',
    		    '\u24BE': 'I',
    		    '\uFF29': 'I',
    		    '\u00CC': 'I',
    		    '\u00CD': 'I',
    		    '\u00CE': 'I',
    		    '\u0128': 'I',
    		    '\u012A': 'I',
    		    '\u012C': 'I',
    		    '\u0130': 'I',
    		    '\u00CF': 'I',
    		    '\u1E2E': 'I',
    		    '\u1EC8': 'I',
    		    '\u01CF': 'I',
    		    '\u0208': 'I',
    		    '\u020A': 'I',
    		    '\u1ECA': 'I',
    		    '\u012E': 'I',
    		    '\u1E2C': 'I',
    		    '\u0197': 'I',
    		    '\u24BF': 'J',
    		    '\uFF2A': 'J',
    		    '\u0134': 'J',
    		    '\u0248': 'J',
    		    '\u24C0': 'K',
    		    '\uFF2B': 'K',
    		    '\u1E30': 'K',
    		    '\u01E8': 'K',
    		    '\u1E32': 'K',
    		    '\u0136': 'K',
    		    '\u1E34': 'K',
    		    '\u0198': 'K',
    		    '\u2C69': 'K',
    		    '\uA740': 'K',
    		    '\uA742': 'K',
    		    '\uA744': 'K',
    		    '\uA7A2': 'K',
    		    '\u24C1': 'L',
    		    '\uFF2C': 'L',
    		    '\u013F': 'L',
    		    '\u0139': 'L',
    		    '\u013D': 'L',
    		    '\u1E36': 'L',
    		    '\u1E38': 'L',
    		    '\u013B': 'L',
    		    '\u1E3C': 'L',
    		    '\u1E3A': 'L',
    		    '\u0141': 'L',
    		    '\u023D': 'L',
    		    '\u2C62': 'L',
    		    '\u2C60': 'L',
    		    '\uA748': 'L',
    		    '\uA746': 'L',
    		    '\uA780': 'L',
    		    '\u01C7': 'LJ',
    		    '\u01C8': 'Lj',
    		    '\u24C2': 'M',
    		    '\uFF2D': 'M',
    		    '\u1E3E': 'M',
    		    '\u1E40': 'M',
    		    '\u1E42': 'M',
    		    '\u2C6E': 'M',
    		    '\u019C': 'M',
    		    '\u24C3': 'N',
    		    '\uFF2E': 'N',
    		    '\u01F8': 'N',
    		    '\u0143': 'N',
    		    '\u00D1': 'N',
    		    '\u1E44': 'N',
    		    '\u0147': 'N',
    		    '\u1E46': 'N',
    		    '\u0145': 'N',
    		    '\u1E4A': 'N',
    		    '\u1E48': 'N',
    		    '\u0220': 'N',
    		    '\u019D': 'N',
    		    '\uA790': 'N',
    		    '\uA7A4': 'N',
    		    '\u01CA': 'NJ',
    		    '\u01CB': 'Nj',
    		    '\u24C4': 'O',
    		    '\uFF2F': 'O',
    		    '\u00D2': 'O',
    		    '\u00D3': 'O',
    		    '\u00D4': 'O',
    		    '\u1ED2': 'O',
    		    '\u1ED0': 'O',
    		    '\u1ED6': 'O',
    		    '\u1ED4': 'O',
    		    '\u00D5': 'O',
    		    '\u1E4C': 'O',
    		    '\u022C': 'O',
    		    '\u1E4E': 'O',
    		    '\u014C': 'O',
    		    '\u1E50': 'O',
    		    '\u1E52': 'O',
    		    '\u014E': 'O',
    		    '\u022E': 'O',
    		    '\u0230': 'O',
    		    '\u00D6': 'O',
    		    '\u022A': 'O',
    		    '\u1ECE': 'O',
    		    '\u0150': 'O',
    		    '\u01D1': 'O',
    		    '\u020C': 'O',
    		    '\u020E': 'O',
    		    '\u01A0': 'O',
    		    '\u1EDC': 'O',
    		    '\u1EDA': 'O',
    		    '\u1EE0': 'O',
    		    '\u1EDE': 'O',
    		    '\u1EE2': 'O',
    		    '\u1ECC': 'O',
    		    '\u1ED8': 'O',
    		    '\u01EA': 'O',
    		    '\u01EC': 'O',
    		    '\u00D8': 'O',
    		    '\u01FE': 'O',
    		    '\u0186': 'O',
    		    '\u019F': 'O',
    		    '\uA74A': 'O',
    		    '\uA74C': 'O',
    		    '\u0152': 'OE',
    		    '\u01A2': 'OI',
    		    '\uA74E': 'OO',
    		    '\u0222': 'OU',
    		    '\u24C5': 'P',
    		    '\uFF30': 'P',
    		    '\u1E54': 'P',
    		    '\u1E56': 'P',
    		    '\u01A4': 'P',
    		    '\u2C63': 'P',
    		    '\uA750': 'P',
    		    '\uA752': 'P',
    		    '\uA754': 'P',
    		    '\u24C6': 'Q',
    		    '\uFF31': 'Q',
    		    '\uA756': 'Q',
    		    '\uA758': 'Q',
    		    '\u024A': 'Q',
    		    '\u24C7': 'R',
    		    '\uFF32': 'R',
    		    '\u0154': 'R',
    		    '\u1E58': 'R',
    		    '\u0158': 'R',
    		    '\u0210': 'R',
    		    '\u0212': 'R',
    		    '\u1E5A': 'R',
    		    '\u1E5C': 'R',
    		    '\u0156': 'R',
    		    '\u1E5E': 'R',
    		    '\u024C': 'R',
    		    '\u2C64': 'R',
    		    '\uA75A': 'R',
    		    '\uA7A6': 'R',
    		    '\uA782': 'R',
    		    '\u24C8': 'S',
    		    '\uFF33': 'S',
    		    '\u1E9E': 'S',
    		    '\u015A': 'S',
    		    '\u1E64': 'S',
    		    '\u015C': 'S',
    		    '\u1E60': 'S',
    		    '\u0160': 'S',
    		    '\u1E66': 'S',
    		    '\u1E62': 'S',
    		    '\u1E68': 'S',
    		    '\u0218': 'S',
    		    '\u015E': 'S',
    		    '\u2C7E': 'S',
    		    '\uA7A8': 'S',
    		    '\uA784': 'S',
    		    '\u24C9': 'T',
    		    '\uFF34': 'T',
    		    '\u1E6A': 'T',
    		    '\u0164': 'T',
    		    '\u1E6C': 'T',
    		    '\u021A': 'T',
    		    '\u0162': 'T',
    		    '\u1E70': 'T',
    		    '\u1E6E': 'T',
    		    '\u0166': 'T',
    		    '\u01AC': 'T',
    		    '\u01AE': 'T',
    		    '\u023E': 'T',
    		    '\uA786': 'T',
    		    '\uA728': 'TZ',
    		    '\u24CA': 'U',
    		    '\uFF35': 'U',
    		    '\u00D9': 'U',
    		    '\u00DA': 'U',
    		    '\u00DB': 'U',
    		    '\u0168': 'U',
    		    '\u1E78': 'U',
    		    '\u016A': 'U',
    		    '\u1E7A': 'U',
    		    '\u016C': 'U',
    		    '\u00DC': 'U',
    		    '\u01DB': 'U',
    		    '\u01D7': 'U',
    		    '\u01D5': 'U',
    		    '\u01D9': 'U',
    		    '\u1EE6': 'U',
    		    '\u016E': 'U',
    		    '\u0170': 'U',
    		    '\u01D3': 'U',
    		    '\u0214': 'U',
    		    '\u0216': 'U',
    		    '\u01AF': 'U',
    		    '\u1EEA': 'U',
    		    '\u1EE8': 'U',
    		    '\u1EEE': 'U',
    		    '\u1EEC': 'U',
    		    '\u1EF0': 'U',
    		    '\u1EE4': 'U',
    		    '\u1E72': 'U',
    		    '\u0172': 'U',
    		    '\u1E76': 'U',
    		    '\u1E74': 'U',
    		    '\u0244': 'U',
    		    '\u24CB': 'V',
    		    '\uFF36': 'V',
    		    '\u1E7C': 'V',
    		    '\u1E7E': 'V',
    		    '\u01B2': 'V',
    		    '\uA75E': 'V',
    		    '\u0245': 'V',
    		    '\uA760': 'VY',
    		    '\u24CC': 'W',
    		    '\uFF37': 'W',
    		    '\u1E80': 'W',
    		    '\u1E82': 'W',
    		    '\u0174': 'W',
    		    '\u1E86': 'W',
    		    '\u1E84': 'W',
    		    '\u1E88': 'W',
    		    '\u2C72': 'W',
    		    '\u24CD': 'X',
    		    '\uFF38': 'X',
    		    '\u1E8A': 'X',
    		    '\u1E8C': 'X',
    		    '\u24CE': 'Y',
    		    '\uFF39': 'Y',
    		    '\u1EF2': 'Y',
    		    '\u00DD': 'Y',
    		    '\u0176': 'Y',
    		    '\u1EF8': 'Y',
    		    '\u0232': 'Y',
    		    '\u1E8E': 'Y',
    		    '\u0178': 'Y',
    		    '\u1EF6': 'Y',
    		    '\u1EF4': 'Y',
    		    '\u01B3': 'Y',
    		    '\u024E': 'Y',
    		    '\u1EFE': 'Y',
    		    '\u24CF': 'Z',
    		    '\uFF3A': 'Z',
    		    '\u0179': 'Z',
    		    '\u1E90': 'Z',
    		    '\u017B': 'Z',
    		    '\u017D': 'Z',
    		    '\u1E92': 'Z',
    		    '\u1E94': 'Z',
    		    '\u01B5': 'Z',
    		    '\u0224': 'Z',
    		    '\u2C7F': 'Z',
    		    '\u2C6B': 'Z',
    		    '\uA762': 'Z',
    		    '\u24D0': 'a',
    		    '\uFF41': 'a',
    		    '\u1E9A': 'a',
    		    '\u00E0': 'a',
    		    '\u00E1': 'a',
    		    '\u00E2': 'a',
    		    '\u1EA7': 'a',
    		    '\u1EA5': 'a',
    		    '\u1EAB': 'a',
    		    '\u1EA9': 'a',
    		    '\u00E3': 'a',
    		    '\u0101': 'a',
    		    '\u0103': 'a',
    		    '\u1EB1': 'a',
    		    '\u1EAF': 'a',
    		    '\u1EB5': 'a',
    		    '\u1EB3': 'a',
    		    '\u0227': 'a',
    		    '\u01E1': 'a',
    		    '\u00E4': 'a',
    		    '\u01DF': 'a',
    		    '\u1EA3': 'a',
    		    '\u00E5': 'a',
    		    '\u01FB': 'a',
    		    '\u01CE': 'a',
    		    '\u0201': 'a',
    		    '\u0203': 'a',
    		    '\u1EA1': 'a',
    		    '\u1EAD': 'a',
    		    '\u1EB7': 'a',
    		    '\u1E01': 'a',
    		    '\u0105': 'a',
    		    '\u2C65': 'a',
    		    '\u0250': 'a',
    		    '\uA733': 'aa',
    		    '\u00E6': 'ae',
    		    '\u01FD': 'ae',
    		    '\u01E3': 'ae',
    		    '\uA735': 'ao',
    		    '\uA737': 'au',
    		    '\uA739': 'av',
    		    '\uA73B': 'av',
    		    '\uA73D': 'ay',
    		    '\u24D1': 'b',
    		    '\uFF42': 'b',
    		    '\u1E03': 'b',
    		    '\u1E05': 'b',
    		    '\u1E07': 'b',
    		    '\u0180': 'b',
    		    '\u0183': 'b',
    		    '\u0253': 'b',
    		    '\u24D2': 'c',
    		    '\uFF43': 'c',
    		    '\u0107': 'c',
    		    '\u0109': 'c',
    		    '\u010B': 'c',
    		    '\u010D': 'c',
    		    '\u00E7': 'c',
    		    '\u1E09': 'c',
    		    '\u0188': 'c',
    		    '\u023C': 'c',
    		    '\uA73F': 'c',
    		    '\u2184': 'c',
    		    '\u24D3': 'd',
    		    '\uFF44': 'd',
    		    '\u1E0B': 'd',
    		    '\u010F': 'd',
    		    '\u1E0D': 'd',
    		    '\u1E11': 'd',
    		    '\u1E13': 'd',
    		    '\u1E0F': 'd',
    		    '\u0111': 'd',
    		    '\u018C': 'd',
    		    '\u0256': 'd',
    		    '\u0257': 'd',
    		    '\uA77A': 'd',
    		    '\u01F3': 'dz',
    		    '\u01C6': 'dz',
    		    '\u24D4': 'e',
    		    '\uFF45': 'e',
    		    '\u00E8': 'e',
    		    '\u00E9': 'e',
    		    '\u00EA': 'e',
    		    '\u1EC1': 'e',
    		    '\u1EBF': 'e',
    		    '\u1EC5': 'e',
    		    '\u1EC3': 'e',
    		    '\u1EBD': 'e',
    		    '\u0113': 'e',
    		    '\u1E15': 'e',
    		    '\u1E17': 'e',
    		    '\u0115': 'e',
    		    '\u0117': 'e',
    		    '\u00EB': 'e',
    		    '\u1EBB': 'e',
    		    '\u011B': 'e',
    		    '\u0205': 'e',
    		    '\u0207': 'e',
    		    '\u1EB9': 'e',
    		    '\u1EC7': 'e',
    		    '\u0229': 'e',
    		    '\u1E1D': 'e',
    		    '\u0119': 'e',
    		    '\u1E19': 'e',
    		    '\u1E1B': 'e',
    		    '\u0247': 'e',
    		    '\u025B': 'e',
    		    '\u01DD': 'e',
    		    '\u24D5': 'f',
    		    '\uFF46': 'f',
    		    '\u1E1F': 'f',
    		    '\u0192': 'f',
    		    '\uA77C': 'f',
    		    '\u24D6': 'g',
    		    '\uFF47': 'g',
    		    '\u01F5': 'g',
    		    '\u011D': 'g',
    		    '\u1E21': 'g',
    		    '\u011F': 'g',
    		    '\u0121': 'g',
    		    '\u01E7': 'g',
    		    '\u0123': 'g',
    		    '\u01E5': 'g',
    		    '\u0260': 'g',
    		    '\uA7A1': 'g',
    		    '\u1D79': 'g',
    		    '\uA77F': 'g',
    		    '\u24D7': 'h',
    		    '\uFF48': 'h',
    		    '\u0125': 'h',
    		    '\u1E23': 'h',
    		    '\u1E27': 'h',
    		    '\u021F': 'h',
    		    '\u1E25': 'h',
    		    '\u1E29': 'h',
    		    '\u1E2B': 'h',
    		    '\u1E96': 'h',
    		    '\u0127': 'h',
    		    '\u2C68': 'h',
    		    '\u2C76': 'h',
    		    '\u0265': 'h',
    		    '\u0195': 'hv',
    		    '\u24D8': 'i',
    		    '\uFF49': 'i',
    		    '\u00EC': 'i',
    		    '\u00ED': 'i',
    		    '\u00EE': 'i',
    		    '\u0129': 'i',
    		    '\u012B': 'i',
    		    '\u012D': 'i',
    		    '\u00EF': 'i',
    		    '\u1E2F': 'i',
    		    '\u1EC9': 'i',
    		    '\u01D0': 'i',
    		    '\u0209': 'i',
    		    '\u020B': 'i',
    		    '\u1ECB': 'i',
    		    '\u012F': 'i',
    		    '\u1E2D': 'i',
    		    '\u0268': 'i',
    		    '\u0131': 'i',
    		    '\u24D9': 'j',
    		    '\uFF4A': 'j',
    		    '\u0135': 'j',
    		    '\u01F0': 'j',
    		    '\u0249': 'j',
    		    '\u24DA': 'k',
    		    '\uFF4B': 'k',
    		    '\u1E31': 'k',
    		    '\u01E9': 'k',
    		    '\u1E33': 'k',
    		    '\u0137': 'k',
    		    '\u1E35': 'k',
    		    '\u0199': 'k',
    		    '\u2C6A': 'k',
    		    '\uA741': 'k',
    		    '\uA743': 'k',
    		    '\uA745': 'k',
    		    '\uA7A3': 'k',
    		    '\u24DB': 'l',
    		    '\uFF4C': 'l',
    		    '\u0140': 'l',
    		    '\u013A': 'l',
    		    '\u013E': 'l',
    		    '\u1E37': 'l',
    		    '\u1E39': 'l',
    		    '\u013C': 'l',
    		    '\u1E3D': 'l',
    		    '\u1E3B': 'l',
    		    '\u017F': 'l',
    		    '\u0142': 'l',
    		    '\u019A': 'l',
    		    '\u026B': 'l',
    		    '\u2C61': 'l',
    		    '\uA749': 'l',
    		    '\uA781': 'l',
    		    '\uA747': 'l',
    		    '\u01C9': 'lj',
    		    '\u24DC': 'm',
    		    '\uFF4D': 'm',
    		    '\u1E3F': 'm',
    		    '\u1E41': 'm',
    		    '\u1E43': 'm',
    		    '\u0271': 'm',
    		    '\u026F': 'm',
    		    '\u24DD': 'n',
    		    '\uFF4E': 'n',
    		    '\u01F9': 'n',
    		    '\u0144': 'n',
    		    '\u00F1': 'n',
    		    '\u1E45': 'n',
    		    '\u0148': 'n',
    		    '\u1E47': 'n',
    		    '\u0146': 'n',
    		    '\u1E4B': 'n',
    		    '\u1E49': 'n',
    		    '\u019E': 'n',
    		    '\u0272': 'n',
    		    '\u0149': 'n',
    		    '\uA791': 'n',
    		    '\uA7A5': 'n',
    		    '\u01CC': 'nj',
    		    '\u24DE': 'o',
    		    '\uFF4F': 'o',
    		    '\u00F2': 'o',
    		    '\u00F3': 'o',
    		    '\u00F4': 'o',
    		    '\u1ED3': 'o',
    		    '\u1ED1': 'o',
    		    '\u1ED7': 'o',
    		    '\u1ED5': 'o',
    		    '\u00F5': 'o',
    		    '\u1E4D': 'o',
    		    '\u022D': 'o',
    		    '\u1E4F': 'o',
    		    '\u014D': 'o',
    		    '\u1E51': 'o',
    		    '\u1E53': 'o',
    		    '\u014F': 'o',
    		    '\u022F': 'o',
    		    '\u0231': 'o',
    		    '\u00F6': 'o',
    		    '\u022B': 'o',
    		    '\u1ECF': 'o',
    		    '\u0151': 'o',
    		    '\u01D2': 'o',
    		    '\u020D': 'o',
    		    '\u020F': 'o',
    		    '\u01A1': 'o',
    		    '\u1EDD': 'o',
    		    '\u1EDB': 'o',
    		    '\u1EE1': 'o',
    		    '\u1EDF': 'o',
    		    '\u1EE3': 'o',
    		    '\u1ECD': 'o',
    		    '\u1ED9': 'o',
    		    '\u01EB': 'o',
    		    '\u01ED': 'o',
    		    '\u00F8': 'o',
    		    '\u01FF': 'o',
    		    '\u0254': 'o',
    		    '\uA74B': 'o',
    		    '\uA74D': 'o',
    		    '\u0275': 'o',
    		    '\u0153': 'oe',
    		    '\u01A3': 'oi',
    		    '\u0223': 'ou',
    		    '\uA74F': 'oo',
    		    '\u24DF': 'p',
    		    '\uFF50': 'p',
    		    '\u1E55': 'p',
    		    '\u1E57': 'p',
    		    '\u01A5': 'p',
    		    '\u1D7D': 'p',
    		    '\uA751': 'p',
    		    '\uA753': 'p',
    		    '\uA755': 'p',
    		    '\u24E0': 'q',
    		    '\uFF51': 'q',
    		    '\u024B': 'q',
    		    '\uA757': 'q',
    		    '\uA759': 'q',
    		    '\u24E1': 'r',
    		    '\uFF52': 'r',
    		    '\u0155': 'r',
    		    '\u1E59': 'r',
    		    '\u0159': 'r',
    		    '\u0211': 'r',
    		    '\u0213': 'r',
    		    '\u1E5B': 'r',
    		    '\u1E5D': 'r',
    		    '\u0157': 'r',
    		    '\u1E5F': 'r',
    		    '\u024D': 'r',
    		    '\u027D': 'r',
    		    '\uA75B': 'r',
    		    '\uA7A7': 'r',
    		    '\uA783': 'r',
    		    '\u24E2': 's',
    		    '\uFF53': 's',
    		    '\u00DF': 's',
    		    '\u015B': 's',
    		    '\u1E65': 's',
    		    '\u015D': 's',
    		    '\u1E61': 's',
    		    '\u0161': 's',
    		    '\u1E67': 's',
    		    '\u1E63': 's',
    		    '\u1E69': 's',
    		    '\u0219': 's',
    		    '\u015F': 's',
    		    '\u023F': 's',
    		    '\uA7A9': 's',
    		    '\uA785': 's',
    		    '\u1E9B': 's',
    		    '\u24E3': 't',
    		    '\uFF54': 't',
    		    '\u1E6B': 't',
    		    '\u1E97': 't',
    		    '\u0165': 't',
    		    '\u1E6D': 't',
    		    '\u021B': 't',
    		    '\u0163': 't',
    		    '\u1E71': 't',
    		    '\u1E6F': 't',
    		    '\u0167': 't',
    		    '\u01AD': 't',
    		    '\u0288': 't',
    		    '\u2C66': 't',
    		    '\uA787': 't',
    		    '\uA729': 'tz',
    		    '\u24E4': 'u',
    		    '\uFF55': 'u',
    		    '\u00F9': 'u',
    		    '\u00FA': 'u',
    		    '\u00FB': 'u',
    		    '\u0169': 'u',
    		    '\u1E79': 'u',
    		    '\u016B': 'u',
    		    '\u1E7B': 'u',
    		    '\u016D': 'u',
    		    '\u00FC': 'u',
    		    '\u01DC': 'u',
    		    '\u01D8': 'u',
    		    '\u01D6': 'u',
    		    '\u01DA': 'u',
    		    '\u1EE7': 'u',
    		    '\u016F': 'u',
    		    '\u0171': 'u',
    		    '\u01D4': 'u',
    		    '\u0215': 'u',
    		    '\u0217': 'u',
    		    '\u01B0': 'u',
    		    '\u1EEB': 'u',
    		    '\u1EE9': 'u',
    		    '\u1EEF': 'u',
    		    '\u1EED': 'u',
    		    '\u1EF1': 'u',
    		    '\u1EE5': 'u',
    		    '\u1E73': 'u',
    		    '\u0173': 'u',
    		    '\u1E77': 'u',
    		    '\u1E75': 'u',
    		    '\u0289': 'u',
    		    '\u24E5': 'v',
    		    '\uFF56': 'v',
    		    '\u1E7D': 'v',
    		    '\u1E7F': 'v',
    		    '\u028B': 'v',
    		    '\uA75F': 'v',
    		    '\u028C': 'v',
    		    '\uA761': 'vy',
    		    '\u24E6': 'w',
    		    '\uFF57': 'w',
    		    '\u1E81': 'w',
    		    '\u1E83': 'w',
    		    '\u0175': 'w',
    		    '\u1E87': 'w',
    		    '\u1E85': 'w',
    		    '\u1E98': 'w',
    		    '\u1E89': 'w',
    		    '\u2C73': 'w',
    		    '\u24E7': 'x',
    		    '\uFF58': 'x',
    		    '\u1E8B': 'x',
    		    '\u1E8D': 'x',
    		    '\u24E8': 'y',
    		    '\uFF59': 'y',
    		    '\u1EF3': 'y',
    		    '\u00FD': 'y',
    		    '\u0177': 'y',
    		    '\u1EF9': 'y',
    		    '\u0233': 'y',
    		    '\u1E8F': 'y',
    		    '\u00FF': 'y',
    		    '\u1EF7': 'y',
    		    '\u1E99': 'y',
    		    '\u1EF5': 'y',
    		    '\u01B4': 'y',
    		    '\u024F': 'y',
    		    '\u1EFF': 'y',
    		    '\u24E9': 'z',
    		    '\uFF5A': 'z',
    		    '\u017A': 'z',
    		    '\u1E91': 'z',
    		    '\u017C': 'z',
    		    '\u017E': 'z',
    		    '\u1E93': 'z',
    		    '\u1E95': 'z',
    		    '\u01B6': 'z',
    		    '\u0225': 'z',
    		    '\u0240': 'z',
    		    '\u2C6C': 'z',
    		    '\uA763': 'z',
    		    '\u0386': '\u0391',
    		    '\u0388': '\u0395',
    		    '\u0389': '\u0397',
    		    '\u038A': '\u0399',
    		    '\u03AA': '\u0399',
    		    '\u038C': '\u039F',
    		    '\u038E': '\u03A5',
    		    '\u03AB': '\u03A5',
    		    '\u038F': '\u03A9',
    		    '\u03AC': '\u03B1',
    		    '\u03AD': '\u03B5',
    		    '\u03AE': '\u03B7',
    		    '\u03AF': '\u03B9',
    		    '\u03CA': '\u03B9',
    		    '\u0390': '\u03B9',
    		    '\u03CC': '\u03BF',
    		    '\u03CD': '\u03C5',
    		    '\u03CB': '\u03C5',
    		    '\u03B0': '\u03C5',
    		    '\u03CE': '\u03C9',
    		    '\u03C2': '\u03C3',
    		    '\u2019': '\''
    		  };

    		  return diacritics;
    		});

    		S2.define('select2/data/base',[
    		  '../utils'
    		], function (Utils) {
    		  function BaseAdapter ($element, options) {
    		    BaseAdapter.__super__.constructor.call(this);
    		  }

    		  Utils.Extend(BaseAdapter, Utils.Observable);

    		  BaseAdapter.prototype.current = function (callback) {
    		    throw new Error('The `current` method must be defined in child classes.');
    		  };

    		  BaseAdapter.prototype.query = function (params, callback) {
    		    throw new Error('The `query` method must be defined in child classes.');
    		  };

    		  BaseAdapter.prototype.bind = function (container, $container) {
    		    // Can be implemented in subclasses
    		  };

    		  BaseAdapter.prototype.destroy = function () {
    		    // Can be implemented in subclasses
    		  };

    		  BaseAdapter.prototype.generateResultId = function (container, data) {
    		    var id = container.id + '-result-';

    		    id += Utils.generateChars(4);

    		    if (data.id != null) {
    		      id += '-' + data.id.toString();
    		    } else {
    		      id += '-' + Utils.generateChars(4);
    		    }
    		    return id;
    		  };

    		  return BaseAdapter;
    		});

    		S2.define('select2/data/select',[
    		  './base',
    		  '../utils',
    		  'jquery'
    		], function (BaseAdapter, Utils, $) {
    		  function SelectAdapter ($element, options) {
    		    this.$element = $element;
    		    this.options = options;

    		    SelectAdapter.__super__.constructor.call(this);
    		  }

    		  Utils.Extend(SelectAdapter, BaseAdapter);

    		  SelectAdapter.prototype.current = function (callback) {
    		    var self = this;

    		    var data = Array.prototype.map.call(
    		      this.$element[0].querySelectorAll(':checked'),
    		      function (selectedElement) {
    		        return self.item($(selectedElement));
    		      }
    		    );

    		    callback(data);
    		  };

    		  SelectAdapter.prototype.select = function (data) {
    		    var self = this;

    		    data.selected = true;

    		    // If data.element is a DOM node, use it instead
    		    if (
    		      data.element != null && data.element.tagName.toLowerCase() === 'option'
    		    ) {
    		      data.element.selected = true;

    		      this.$element.trigger('input').trigger('change');

    		      return;
    		    }

    		    if (this.$element.prop('multiple')) {
    		      this.current(function (currentData) {
    		        var val = [];

    		        data = [data];
    		        data.push.apply(data, currentData);

    		        for (var d = 0; d < data.length; d++) {
    		          var id = data[d].id;

    		          if (val.indexOf(id) === -1) {
    		            val.push(id);
    		          }
    		        }

    		        self.$element.val(val);
    		        self.$element.trigger('input').trigger('change');
    		      });
    		    } else {
    		      var val = data.id;

    		      this.$element.val(val);
    		      this.$element.trigger('input').trigger('change');
    		    }
    		  };

    		  SelectAdapter.prototype.unselect = function (data) {
    		    var self = this;

    		    if (!this.$element.prop('multiple')) {
    		      return;
    		    }

    		    data.selected = false;

    		    if (
    		      data.element != null &&
    		      data.element.tagName.toLowerCase() === 'option'
    		    ) {
    		      data.element.selected = false;

    		      this.$element.trigger('input').trigger('change');

    		      return;
    		    }

    		    this.current(function (currentData) {
    		      var val = [];

    		      for (var d = 0; d < currentData.length; d++) {
    		        var id = currentData[d].id;

    		        if (id !== data.id && val.indexOf(id) === -1) {
    		          val.push(id);
    		        }
    		      }

    		      self.$element.val(val);

    		      self.$element.trigger('input').trigger('change');
    		    });
    		  };

    		  SelectAdapter.prototype.bind = function (container, $container) {
    		    var self = this;

    		    this.container = container;

    		    container.on('select', function (params) {
    		      self.select(params.data);
    		    });

    		    container.on('unselect', function (params) {
    		      self.unselect(params.data);
    		    });
    		  };

    		  SelectAdapter.prototype.destroy = function () {
    		    // Remove anything added to child elements
    		    this.$element.find('*').each(function () {
    		      // Remove any custom data set by Select2
    		      Utils.RemoveData(this);
    		    });
    		  };

    		  SelectAdapter.prototype.query = function (params, callback) {
    		    var data = [];
    		    var self = this;

    		    var $options = this.$element.children();

    		    $options.each(function () {
    		      if (
    		        this.tagName.toLowerCase() !== 'option' &&
    		        this.tagName.toLowerCase() !== 'optgroup'
    		      ) {
    		        return;
    		      }

    		      var $option = $(this);

    		      var option = self.item($option);

    		      var matches = self.matches(params, option);

    		      if (matches !== null) {
    		        data.push(matches);
    		      }
    		    });

    		    callback({
    		      results: data
    		    });
    		  };

    		  SelectAdapter.prototype.addOptions = function ($options) {
    		    this.$element.append($options);
    		  };

    		  SelectAdapter.prototype.option = function (data) {
    		    var option;

    		    if (data.children) {
    		      option = document.createElement('optgroup');
    		      option.label = data.text;
    		    } else {
    		      option = document.createElement('option');

    		      if (option.textContent !== undefined) {
    		        option.textContent = data.text;
    		      } else {
    		        option.innerText = data.text;
    		      }
    		    }

    		    if (data.id !== undefined) {
    		      option.value = data.id;
    		    }

    		    if (data.disabled) {
    		      option.disabled = true;
    		    }

    		    if (data.selected) {
    		      option.selected = true;
    		    }

    		    if (data.title) {
    		      option.title = data.title;
    		    }

    		    var normalizedData = this._normalizeItem(data);
    		    normalizedData.element = option;

    		    // Override the option's data with the combined data
    		    Utils.StoreData(option, 'data', normalizedData);

    		    return $(option);
    		  };

    		  SelectAdapter.prototype.item = function ($option) {
    		    var data = {};

    		    data = Utils.GetData($option[0], 'data');

    		    if (data != null) {
    		      return data;
    		    }

    		    var option = $option[0];

    		    if (option.tagName.toLowerCase() === 'option') {
    		      data = {
    		        id: $option.val(),
    		        text: $option.text(),
    		        disabled: $option.prop('disabled'),
    		        selected: $option.prop('selected'),
    		        title: $option.prop('title')
    		      };
    		    } else if (option.tagName.toLowerCase() === 'optgroup') {
    		      data = {
    		        text: $option.prop('label'),
    		        children: [],
    		        title: $option.prop('title')
    		      };

    		      var $children = $option.children('option');
    		      var children = [];

    		      for (var c = 0; c < $children.length; c++) {
    		        var $child = $($children[c]);

    		        var child = this.item($child);

    		        children.push(child);
    		      }

    		      data.children = children;
    		    }

    		    data = this._normalizeItem(data);
    		    data.element = $option[0];

    		    Utils.StoreData($option[0], 'data', data);

    		    return data;
    		  };

    		  SelectAdapter.prototype._normalizeItem = function (item) {
    		    if (item !== Object(item)) {
    		      item = {
    		        id: item,
    		        text: item
    		      };
    		    }

    		    item = $.extend({}, {
    		      text: ''
    		    }, item);

    		    var defaults = {
    		      selected: false,
    		      disabled: false
    		    };

    		    if (item.id != null) {
    		      item.id = item.id.toString();
    		    }

    		    if (item.text != null) {
    		      item.text = item.text.toString();
    		    }

    		    if (item._resultId == null && item.id && this.container != null) {
    		      item._resultId = this.generateResultId(this.container, item);
    		    }

    		    return $.extend({}, defaults, item);
    		  };

    		  SelectAdapter.prototype.matches = function (params, data) {
    		    var matcher = this.options.get('matcher');

    		    return matcher(params, data);
    		  };

    		  return SelectAdapter;
    		});

    		S2.define('select2/data/array',[
    		  './select',
    		  '../utils',
    		  'jquery'
    		], function (SelectAdapter, Utils, $) {
    		  function ArrayAdapter ($element, options) {
    		    this._dataToConvert = options.get('data') || [];

    		    ArrayAdapter.__super__.constructor.call(this, $element, options);
    		  }

    		  Utils.Extend(ArrayAdapter, SelectAdapter);

    		  ArrayAdapter.prototype.bind = function (container, $container) {
    		    ArrayAdapter.__super__.bind.call(this, container, $container);

    		    this.addOptions(this.convertToOptions(this._dataToConvert));
    		  };

    		  ArrayAdapter.prototype.select = function (data) {
    		    var $option = this.$element.find('option').filter(function (i, elm) {
    		      return elm.value == data.id.toString();
    		    });

    		    if ($option.length === 0) {
    		      $option = this.option(data);

    		      this.addOptions($option);
    		    }

    		    ArrayAdapter.__super__.select.call(this, data);
    		  };

    		  ArrayAdapter.prototype.convertToOptions = function (data) {
    		    var self = this;

    		    var $existing = this.$element.find('option');
    		    var existingIds = $existing.map(function () {
    		      return self.item($(this)).id;
    		    }).get();

    		    var $options = [];

    		    // Filter out all items except for the one passed in the argument
    		    function onlyItem (item) {
    		      return function () {
    		        return $(this).val() == item.id;
    		      };
    		    }

    		    for (var d = 0; d < data.length; d++) {
    		      var item = this._normalizeItem(data[d]);

    		      // Skip items which were pre-loaded, only merge the data
    		      if (existingIds.indexOf(item.id) >= 0) {
    		        var $existingOption = $existing.filter(onlyItem(item));

    		        var existingData = this.item($existingOption);
    		        var newData = $.extend(true, {}, item, existingData);

    		        var $newOption = this.option(newData);

    		        $existingOption.replaceWith($newOption);

    		        continue;
    		      }

    		      var $option = this.option(item);

    		      if (item.children) {
    		        var $children = this.convertToOptions(item.children);

    		        $option.append($children);
    		      }

    		      $options.push($option);
    		    }

    		    return $options;
    		  };

    		  return ArrayAdapter;
    		});

    		S2.define('select2/data/ajax',[
    		  './array',
    		  '../utils',
    		  'jquery'
    		], function (ArrayAdapter, Utils, $) {
    		  function AjaxAdapter ($element, options) {
    		    this.ajaxOptions = this._applyDefaults(options.get('ajax'));

    		    if (this.ajaxOptions.processResults != null) {
    		      this.processResults = this.ajaxOptions.processResults;
    		    }

    		    AjaxAdapter.__super__.constructor.call(this, $element, options);
    		  }

    		  Utils.Extend(AjaxAdapter, ArrayAdapter);

    		  AjaxAdapter.prototype._applyDefaults = function (options) {
    		    var defaults = {
    		      data: function (params) {
    		        return $.extend({}, params, {
    		          q: params.term
    		        });
    		      },
    		      transport: function (params, success, failure) {
    		        var $request = $.ajax(params);

    		        $request.then(success);
    		        $request.fail(failure);

    		        return $request;
    		      }
    		    };

    		    return $.extend({}, defaults, options, true);
    		  };

    		  AjaxAdapter.prototype.processResults = function (results) {
    		    return results;
    		  };

    		  AjaxAdapter.prototype.query = function (params, callback) {
    		    var self = this;

    		    if (this._request != null) {
    		      // JSONP requests cannot always be aborted
    		      if (typeof this._request.abort === 'function') {
    		        this._request.abort();
    		      }

    		      this._request = null;
    		    }

    		    var options = $.extend({
    		      type: 'GET'
    		    }, this.ajaxOptions);

    		    if (typeof options.url === 'function') {
    		      options.url = options.url.call(this.$element, params);
    		    }

    		    if (typeof options.data === 'function') {
    		      options.data = options.data.call(this.$element, params);
    		    }

    		    function request () {
    		      var $request = options.transport(options, function (data) {
    		        var results = self.processResults(data, params);

    		        if (self.options.get('debug') && window.console && console.error) {
    		          // Check to make sure that the response included a `results` key.
    		          if (!results || !results.results || !Array.isArray(results.results)) {
    		            console.error(
    		              'Select2: The AJAX results did not return an array in the ' +
    		              '`results` key of the response.'
    		            );
    		          }
    		        }

    		        callback(results);
    		      }, function () {
    		        // Attempt to detect if a request was aborted
    		        // Only works if the transport exposes a status property
    		        if ('status' in $request &&
    		            ($request.status === 0 || $request.status === '0')) {
    		          return;
    		        }

    		        self.trigger('results:message', {
    		          message: 'errorLoading'
    		        });
    		      });

    		      self._request = $request;
    		    }

    		    if (this.ajaxOptions.delay && params.term != null) {
    		      if (this._queryTimeout) {
    		        window.clearTimeout(this._queryTimeout);
    		      }

    		      this._queryTimeout = window.setTimeout(request, this.ajaxOptions.delay);
    		    } else {
    		      request();
    		    }
    		  };

    		  return AjaxAdapter;
    		});

    		S2.define('select2/data/tags',[
    		  'jquery'
    		], function ($) {
    		  function Tags (decorated, $element, options) {
    		    var tags = options.get('tags');

    		    var createTag = options.get('createTag');

    		    if (createTag !== undefined) {
    		      this.createTag = createTag;
    		    }

    		    var insertTag = options.get('insertTag');

    		    if (insertTag !== undefined) {
    		        this.insertTag = insertTag;
    		    }

    		    decorated.call(this, $element, options);

    		    if (Array.isArray(tags)) {
    		      for (var t = 0; t < tags.length; t++) {
    		        var tag = tags[t];
    		        var item = this._normalizeItem(tag);

    		        var $option = this.option(item);

    		        this.$element.append($option);
    		      }
    		    }
    		  }

    		  Tags.prototype.query = function (decorated, params, callback) {
    		    var self = this;

    		    this._removeOldTags();

    		    if (params.term == null || params.page != null) {
    		      decorated.call(this, params, callback);
    		      return;
    		    }

    		    function wrapper (obj, child) {
    		      var data = obj.results;

    		      for (var i = 0; i < data.length; i++) {
    		        var option = data[i];

    		        var checkChildren = (
    		          option.children != null &&
    		          !wrapper({
    		            results: option.children
    		          }, true)
    		        );

    		        var optionText = (option.text || '').toUpperCase();
    		        var paramsTerm = (params.term || '').toUpperCase();

    		        var checkText = optionText === paramsTerm;

    		        if (checkText || checkChildren) {
    		          if (child) {
    		            return false;
    		          }

    		          obj.data = data;
    		          callback(obj);

    		          return;
    		        }
    		      }

    		      if (child) {
    		        return true;
    		      }

    		      var tag = self.createTag(params);

    		      if (tag != null) {
    		        var $option = self.option(tag);
    		        $option.attr('data-select2-tag', 'true');

    		        self.addOptions([$option]);

    		        self.insertTag(data, tag);
    		      }

    		      obj.results = data;

    		      callback(obj);
    		    }

    		    decorated.call(this, params, wrapper);
    		  };

    		  Tags.prototype.createTag = function (decorated, params) {
    		    if (params.term == null) {
    		      return null;
    		    }

    		    var term = params.term.trim();

    		    if (term === '') {
    		      return null;
    		    }

    		    return {
    		      id: term,
    		      text: term
    		    };
    		  };

    		  Tags.prototype.insertTag = function (_, data, tag) {
    		    data.unshift(tag);
    		  };

    		  Tags.prototype._removeOldTags = function (_) {
    		    var $options = this.$element.find('option[data-select2-tag]');

    		    $options.each(function () {
    		      if (this.selected) {
    		        return;
    		      }

    		      $(this).remove();
    		    });
    		  };

    		  return Tags;
    		});

    		S2.define('select2/data/tokenizer',[
    		  'jquery'
    		], function ($) {
    		  function Tokenizer (decorated, $element, options) {
    		    var tokenizer = options.get('tokenizer');

    		    if (tokenizer !== undefined) {
    		      this.tokenizer = tokenizer;
    		    }

    		    decorated.call(this, $element, options);
    		  }

    		  Tokenizer.prototype.bind = function (decorated, container, $container) {
    		    decorated.call(this, container, $container);

    		    this.$search =  container.dropdown.$search || container.selection.$search ||
    		      $container.find('.select2-search__field');
    		  };

    		  Tokenizer.prototype.query = function (decorated, params, callback) {
    		    var self = this;

    		    function createAndSelect (data) {
    		      // Normalize the data object so we can use it for checks
    		      var item = self._normalizeItem(data);

    		      // Check if the data object already exists as a tag
    		      // Select it if it doesn't
    		      var $existingOptions = self.$element.find('option').filter(function () {
    		        return $(this).val() === item.id;
    		      });

    		      // If an existing option wasn't found for it, create the option
    		      if (!$existingOptions.length) {
    		        var $option = self.option(item);
    		        $option.attr('data-select2-tag', true);

    		        self._removeOldTags();
    		        self.addOptions([$option]);
    		      }

    		      // Select the item, now that we know there is an option for it
    		      select(item);
    		    }

    		    function select (data) {
    		      self.trigger('select', {
    		        data: data
    		      });
    		    }

    		    params.term = params.term || '';

    		    var tokenData = this.tokenizer(params, this.options, createAndSelect);

    		    if (tokenData.term !== params.term) {
    		      // Replace the search term if we have the search box
    		      if (this.$search.length) {
    		        this.$search.val(tokenData.term);
    		        this.$search.trigger('focus');
    		      }

    		      params.term = tokenData.term;
    		    }

    		    decorated.call(this, params, callback);
    		  };

    		  Tokenizer.prototype.tokenizer = function (_, params, options, callback) {
    		    var separators = options.get('tokenSeparators') || [];
    		    var term = params.term;
    		    var i = 0;

    		    var createTag = this.createTag || function (params) {
    		      return {
    		        id: params.term,
    		        text: params.term
    		      };
    		    };

    		    while (i < term.length) {
    		      var termChar = term[i];

    		      if (separators.indexOf(termChar) === -1) {
    		        i++;

    		        continue;
    		      }

    		      var part = term.substr(0, i);
    		      var partParams = $.extend({}, params, {
    		        term: part
    		      });

    		      var data = createTag(partParams);

    		      if (data == null) {
    		        i++;
    		        continue;
    		      }

    		      callback(data);

    		      // Reset the term to not include the tokenized portion
    		      term = term.substr(i + 1) || '';
    		      i = 0;
    		    }

    		    return {
    		      term: term
    		    };
    		  };

    		  return Tokenizer;
    		});

    		S2.define('select2/data/minimumInputLength',[

    		], function () {
    		  function MinimumInputLength (decorated, $e, options) {
    		    this.minimumInputLength = options.get('minimumInputLength');

    		    decorated.call(this, $e, options);
    		  }

    		  MinimumInputLength.prototype.query = function (decorated, params, callback) {
    		    params.term = params.term || '';

    		    if (params.term.length < this.minimumInputLength) {
    		      this.trigger('results:message', {
    		        message: 'inputTooShort',
    		        args: {
    		          minimum: this.minimumInputLength,
    		          input: params.term,
    		          params: params
    		        }
    		      });

    		      return;
    		    }

    		    decorated.call(this, params, callback);
    		  };

    		  return MinimumInputLength;
    		});

    		S2.define('select2/data/maximumInputLength',[

    		], function () {
    		  function MaximumInputLength (decorated, $e, options) {
    		    this.maximumInputLength = options.get('maximumInputLength');

    		    decorated.call(this, $e, options);
    		  }

    		  MaximumInputLength.prototype.query = function (decorated, params, callback) {
    		    params.term = params.term || '';

    		    if (this.maximumInputLength > 0 &&
    		        params.term.length > this.maximumInputLength) {
    		      this.trigger('results:message', {
    		        message: 'inputTooLong',
    		        args: {
    		          maximum: this.maximumInputLength,
    		          input: params.term,
    		          params: params
    		        }
    		      });

    		      return;
    		    }

    		    decorated.call(this, params, callback);
    		  };

    		  return MaximumInputLength;
    		});

    		S2.define('select2/data/maximumSelectionLength',[

    		], function (){
    		  function MaximumSelectionLength (decorated, $e, options) {
    		    this.maximumSelectionLength = options.get('maximumSelectionLength');

    		    decorated.call(this, $e, options);
    		  }

    		  MaximumSelectionLength.prototype.bind =
    		    function (decorated, container, $container) {
    		      var self = this;

    		      decorated.call(this, container, $container);

    		      container.on('select', function () {
    		        self._checkIfMaximumSelected();
    		      });
    		  };

    		  MaximumSelectionLength.prototype.query =
    		    function (decorated, params, callback) {
    		      var self = this;

    		      this._checkIfMaximumSelected(function () {
    		        decorated.call(self, params, callback);
    		      });
    		  };

    		  MaximumSelectionLength.prototype._checkIfMaximumSelected =
    		    function (_, successCallback) {
    		      var self = this;

    		      this.current(function (currentData) {
    		        var count = currentData != null ? currentData.length : 0;
    		        if (self.maximumSelectionLength > 0 &&
    		          count >= self.maximumSelectionLength) {
    		          self.trigger('results:message', {
    		            message: 'maximumSelected',
    		            args: {
    		              maximum: self.maximumSelectionLength
    		            }
    		          });
    		          return;
    		        }

    		        if (successCallback) {
    		          successCallback();
    		        }
    		      });
    		  };

    		  return MaximumSelectionLength;
    		});

    		S2.define('select2/dropdown',[
    		  'jquery',
    		  './utils'
    		], function ($, Utils) {
    		  function Dropdown ($element, options) {
    		    this.$element = $element;
    		    this.options = options;

    		    Dropdown.__super__.constructor.call(this);
    		  }

    		  Utils.Extend(Dropdown, Utils.Observable);

    		  Dropdown.prototype.render = function () {
    		    var $dropdown = $(
    		      '<span class="select2-dropdown">' +
    		        '<span class="select2-results"></span>' +
    		      '</span>'
    		    );

    		    $dropdown.attr('dir', this.options.get('dir'));

    		    this.$dropdown = $dropdown;

    		    return $dropdown;
    		  };

    		  Dropdown.prototype.bind = function () {
    		    // Should be implemented in subclasses
    		  };

    		  Dropdown.prototype.position = function ($dropdown, $container) {
    		    // Should be implemented in subclasses
    		  };

    		  Dropdown.prototype.destroy = function () {
    		    // Remove the dropdown from the DOM
    		    this.$dropdown.remove();
    		  };

    		  return Dropdown;
    		});

    		S2.define('select2/dropdown/search',[
    		  'jquery'
    		], function ($) {
    		  function Search () { }

    		  Search.prototype.render = function (decorated) {
    		    var $rendered = decorated.call(this);
    		    var searchLabel = this.options.get('translations').get('search');

    		    var $search = $(
    		      '<span class="select2-search select2-search--dropdown">' +
    		        '<input class="select2-search__field" type="search" tabindex="-1"' +
    		        ' autocorrect="off" autocapitalize="none"' +
    		        ' spellcheck="false" role="searchbox" aria-autocomplete="list" />' +
    		      '</span>'
    		    );

    		    this.$searchContainer = $search;
    		    this.$search = $search.find('input');

    		    this.$search.prop('autocomplete', this.options.get('autocomplete'));
    		    this.$search.attr('aria-label', searchLabel());

    		    $rendered.prepend($search);

    		    return $rendered;
    		  };

    		  Search.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    var resultsId = container.id + '-results';

    		    decorated.call(this, container, $container);

    		    this.$search.on('keydown', function (evt) {
    		      self.trigger('keypress', evt);

    		      self._keyUpPrevented = evt.isDefaultPrevented();
    		    });

    		    // Workaround for browsers which do not support the `input` event
    		    // This will prevent double-triggering of events for browsers which support
    		    // both the `keyup` and `input` events.
    		    this.$search.on('input', function (evt) {
    		      // Unbind the duplicated `keyup` event
    		      $(this).off('keyup');
    		    });

    		    this.$search.on('keyup input', function (evt) {
    		      self.handleSearch(evt);
    		    });

    		    container.on('open', function () {
    		      self.$search.attr('tabindex', 0);
    		      self.$search.attr('aria-controls', resultsId);

    		      self.$search.trigger('focus');

    		      window.setTimeout(function () {
    		        self.$search.trigger('focus');
    		      }, 0);
    		    });

    		    container.on('close', function () {
    		      self.$search.attr('tabindex', -1);
    		      self.$search.removeAttr('aria-controls');
    		      self.$search.removeAttr('aria-activedescendant');

    		      self.$search.val('');
    		      self.$search.trigger('blur');
    		    });

    		    container.on('focus', function () {
    		      if (!container.isOpen()) {
    		        self.$search.trigger('focus');
    		      }
    		    });

    		    container.on('results:all', function (params) {
    		      if (params.query.term == null || params.query.term === '') {
    		        var showSearch = self.showSearch(params);

    		        if (showSearch) {
    		          self.$searchContainer[0].classList.remove('select2-search--hide');
    		        } else {
    		          self.$searchContainer[0].classList.add('select2-search--hide');
    		        }
    		      }
    		    });

    		    container.on('results:focus', function (params) {
    		      if (params.data._resultId) {
    		        self.$search.attr('aria-activedescendant', params.data._resultId);
    		      } else {
    		        self.$search.removeAttr('aria-activedescendant');
    		      }
    		    });
    		  };

    		  Search.prototype.handleSearch = function (evt) {
    		    if (!this._keyUpPrevented) {
    		      var input = this.$search.val();

    		      this.trigger('query', {
    		        term: input
    		      });
    		    }

    		    this._keyUpPrevented = false;
    		  };

    		  Search.prototype.showSearch = function (_, params) {
    		    return true;
    		  };

    		  return Search;
    		});

    		S2.define('select2/dropdown/hidePlaceholder',[

    		], function () {
    		  function HidePlaceholder (decorated, $element, options, dataAdapter) {
    		    this.placeholder = this.normalizePlaceholder(options.get('placeholder'));

    		    decorated.call(this, $element, options, dataAdapter);
    		  }

    		  HidePlaceholder.prototype.append = function (decorated, data) {
    		    data.results = this.removePlaceholder(data.results);

    		    decorated.call(this, data);
    		  };

    		  HidePlaceholder.prototype.normalizePlaceholder = function (_, placeholder) {
    		    if (typeof placeholder === 'string') {
    		      placeholder = {
    		        id: '',
    		        text: placeholder
    		      };
    		    }

    		    return placeholder;
    		  };

    		  HidePlaceholder.prototype.removePlaceholder = function (_, data) {
    		    var modifiedData = data.slice(0);

    		    for (var d = data.length - 1; d >= 0; d--) {
    		      var item = data[d];

    		      if (this.placeholder.id === item.id) {
    		        modifiedData.splice(d, 1);
    		      }
    		    }

    		    return modifiedData;
    		  };

    		  return HidePlaceholder;
    		});

    		S2.define('select2/dropdown/infiniteScroll',[
    		  'jquery'
    		], function ($) {
    		  function InfiniteScroll (decorated, $element, options, dataAdapter) {
    		    this.lastParams = {};

    		    decorated.call(this, $element, options, dataAdapter);

    		    this.$loadingMore = this.createLoadingMore();
    		    this.loading = false;
    		  }

    		  InfiniteScroll.prototype.append = function (decorated, data) {
    		    this.$loadingMore.remove();
    		    this.loading = false;

    		    decorated.call(this, data);

    		    if (this.showLoadingMore(data)) {
    		      this.$results.append(this.$loadingMore);
    		      this.loadMoreIfNeeded();
    		    }
    		  };

    		  InfiniteScroll.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    decorated.call(this, container, $container);

    		    container.on('query', function (params) {
    		      self.lastParams = params;
    		      self.loading = true;
    		    });

    		    container.on('query:append', function (params) {
    		      self.lastParams = params;
    		      self.loading = true;
    		    });

    		    this.$results.on('scroll', this.loadMoreIfNeeded.bind(this));
    		  };

    		  InfiniteScroll.prototype.loadMoreIfNeeded = function () {
    		    var isLoadMoreVisible = $.contains(
    		      document.documentElement,
    		      this.$loadingMore[0]
    		    );

    		    if (this.loading || !isLoadMoreVisible) {
    		      return;
    		    }

    		    var currentOffset = this.$results.offset().top +
    		      this.$results.outerHeight(false);
    		    var loadingMoreOffset = this.$loadingMore.offset().top +
    		      this.$loadingMore.outerHeight(false);

    		    if (currentOffset + 50 >= loadingMoreOffset) {
    		      this.loadMore();
    		    }
    		  };

    		  InfiniteScroll.prototype.loadMore = function () {
    		    this.loading = true;

    		    var params = $.extend({}, {page: 1}, this.lastParams);

    		    params.page++;

    		    this.trigger('query:append', params);
    		  };

    		  InfiniteScroll.prototype.showLoadingMore = function (_, data) {
    		    return data.pagination && data.pagination.more;
    		  };

    		  InfiniteScroll.prototype.createLoadingMore = function () {
    		    var $option = $(
    		      '<li ' +
    		      'class="select2-results__option select2-results__option--load-more"' +
    		      'role="option" aria-disabled="true"></li>'
    		    );

    		    var message = this.options.get('translations').get('loadingMore');

    		    $option.html(message(this.lastParams));

    		    return $option;
    		  };

    		  return InfiniteScroll;
    		});

    		S2.define('select2/dropdown/attachBody',[
    		  'jquery',
    		  '../utils'
    		], function ($, Utils) {
    		  function AttachBody (decorated, $element, options) {
    		    this.$dropdownParent = $(options.get('dropdownParent') || document.body);

    		    decorated.call(this, $element, options);
    		  }

    		  AttachBody.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    decorated.call(this, container, $container);

    		    container.on('open', function () {
    		      self._showDropdown();
    		      self._attachPositioningHandler(container);

    		      // Must bind after the results handlers to ensure correct sizing
    		      self._bindContainerResultHandlers(container);
    		    });

    		    container.on('close', function () {
    		      self._hideDropdown();
    		      self._detachPositioningHandler(container);
    		    });

    		    this.$dropdownContainer.on('mousedown', function (evt) {
    		      evt.stopPropagation();
    		    });
    		  };

    		  AttachBody.prototype.destroy = function (decorated) {
    		    decorated.call(this);

    		    this.$dropdownContainer.remove();
    		  };

    		  AttachBody.prototype.position = function (decorated, $dropdown, $container) {
    		    // Clone all of the container classes
    		    $dropdown.attr('class', $container.attr('class'));

    		    $dropdown[0].classList.remove('select2');
    		    $dropdown[0].classList.add('select2-container--open');

    		    $dropdown.css({
    		      position: 'absolute',
    		      top: -999999
    		    });

    		    this.$container = $container;
    		  };

    		  AttachBody.prototype.render = function (decorated) {
    		    var $container = $('<span></span>');

    		    var $dropdown = decorated.call(this);
    		    $container.append($dropdown);

    		    this.$dropdownContainer = $container;

    		    return $container;
    		  };

    		  AttachBody.prototype._hideDropdown = function (decorated) {
    		    this.$dropdownContainer.detach();
    		  };

    		  AttachBody.prototype._bindContainerResultHandlers =
    		      function (decorated, container) {

    		    // These should only be bound once
    		    if (this._containerResultsHandlersBound) {
    		      return;
    		    }

    		    var self = this;

    		    container.on('results:all', function () {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });

    		    container.on('results:append', function () {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });

    		    container.on('results:message', function () {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });

    		    container.on('select', function () {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });

    		    container.on('unselect', function () {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });

    		    this._containerResultsHandlersBound = true;
    		  };

    		  AttachBody.prototype._attachPositioningHandler =
    		      function (decorated, container) {
    		    var self = this;

    		    var scrollEvent = 'scroll.select2.' + container.id;
    		    var resizeEvent = 'resize.select2.' + container.id;
    		    var orientationEvent = 'orientationchange.select2.' + container.id;

    		    var $watchers = this.$container.parents().filter(Utils.hasScroll);
    		    $watchers.each(function () {
    		      Utils.StoreData(this, 'select2-scroll-position', {
    		        x: $(this).scrollLeft(),
    		        y: $(this).scrollTop()
    		      });
    		    });

    		    $watchers.on(scrollEvent, function (ev) {
    		      var position = Utils.GetData(this, 'select2-scroll-position');
    		      $(this).scrollTop(position.y);
    		    });

    		    $(window).on(scrollEvent + ' ' + resizeEvent + ' ' + orientationEvent,
    		      function (e) {
    		      self._positionDropdown();
    		      self._resizeDropdown();
    		    });
    		  };

    		  AttachBody.prototype._detachPositioningHandler =
    		      function (decorated, container) {
    		    var scrollEvent = 'scroll.select2.' + container.id;
    		    var resizeEvent = 'resize.select2.' + container.id;
    		    var orientationEvent = 'orientationchange.select2.' + container.id;

    		    var $watchers = this.$container.parents().filter(Utils.hasScroll);
    		    $watchers.off(scrollEvent);

    		    $(window).off(scrollEvent + ' ' + resizeEvent + ' ' + orientationEvent);
    		  };

    		  AttachBody.prototype._positionDropdown = function () {
    		    var $window = $(window);

    		    var isCurrentlyAbove = this.$dropdown[0].classList
    		      .contains('select2-dropdown--above');
    		    var isCurrentlyBelow = this.$dropdown[0].classList
    		      .contains('select2-dropdown--below');

    		    var newDirection = null;

    		    var offset = this.$container.offset();

    		    offset.bottom = offset.top + this.$container.outerHeight(false);

    		    var container = {
    		      height: this.$container.outerHeight(false)
    		    };

    		    container.top = offset.top;
    		    container.bottom = offset.top + container.height;

    		    var dropdown = {
    		      height: this.$dropdown.outerHeight(false)
    		    };

    		    var viewport = {
    		      top: $window.scrollTop(),
    		      bottom: $window.scrollTop() + $window.height()
    		    };

    		    var enoughRoomAbove = viewport.top < (offset.top - dropdown.height);
    		    var enoughRoomBelow = viewport.bottom > (offset.bottom + dropdown.height);

    		    var css = {
    		      left: offset.left,
    		      top: container.bottom
    		    };

    		    // Determine what the parent element is to use for calculating the offset
    		    var $offsetParent = this.$dropdownParent;

    		    // For statically positioned elements, we need to get the element
    		    // that is determining the offset
    		    if ($offsetParent.css('position') === 'static') {
    		      $offsetParent = $offsetParent.offsetParent();
    		    }

    		    var parentOffset = {
    		      top: 0,
    		      left: 0
    		    };

    		    if (
    		      $.contains(document.body, $offsetParent[0]) ||
    		      $offsetParent[0].isConnected
    		      ) {
    		      parentOffset = $offsetParent.offset();
    		    }

    		    css.top -= parentOffset.top;
    		    css.left -= parentOffset.left;

    		    if (!isCurrentlyAbove && !isCurrentlyBelow) {
    		      newDirection = 'below';
    		    }

    		    if (!enoughRoomBelow && enoughRoomAbove && !isCurrentlyAbove) {
    		      newDirection = 'above';
    		    } else if (!enoughRoomAbove && enoughRoomBelow && isCurrentlyAbove) {
    		      newDirection = 'below';
    		    }

    		    if (newDirection == 'above' ||
    		      (isCurrentlyAbove && newDirection !== 'below')) {
    		      css.top = container.top - parentOffset.top - dropdown.height;
    		    }

    		    if (newDirection != null) {
    		      this.$dropdown[0].classList.remove('select2-dropdown--below');
    		      this.$dropdown[0].classList.remove('select2-dropdown--above');
    		      this.$dropdown[0].classList.add('select2-dropdown--' + newDirection);

    		      this.$container[0].classList.remove('select2-container--below');
    		      this.$container[0].classList.remove('select2-container--above');
    		      this.$container[0].classList.add('select2-container--' + newDirection);
    		    }

    		    this.$dropdownContainer.css(css);
    		  };

    		  AttachBody.prototype._resizeDropdown = function () {
    		    var css = {
    		      width: this.$container.outerWidth(false) + 'px'
    		    };

    		    if (this.options.get('dropdownAutoWidth')) {
    		      css.minWidth = css.width;
    		      css.position = 'relative';
    		      css.width = 'auto';
    		    }

    		    this.$dropdown.css(css);
    		  };

    		  AttachBody.prototype._showDropdown = function (decorated) {
    		    this.$dropdownContainer.appendTo(this.$dropdownParent);

    		    this._positionDropdown();
    		    this._resizeDropdown();
    		  };

    		  return AttachBody;
    		});

    		S2.define('select2/dropdown/minimumResultsForSearch',[

    		], function () {
    		  function countResults (data) {
    		    var count = 0;

    		    for (var d = 0; d < data.length; d++) {
    		      var item = data[d];

    		      if (item.children) {
    		        count += countResults(item.children);
    		      } else {
    		        count++;
    		      }
    		    }

    		    return count;
    		  }

    		  function MinimumResultsForSearch (decorated, $element, options, dataAdapter) {
    		    this.minimumResultsForSearch = options.get('minimumResultsForSearch');

    		    if (this.minimumResultsForSearch < 0) {
    		      this.minimumResultsForSearch = Infinity;
    		    }

    		    decorated.call(this, $element, options, dataAdapter);
    		  }

    		  MinimumResultsForSearch.prototype.showSearch = function (decorated, params) {
    		    if (countResults(params.data.results) < this.minimumResultsForSearch) {
    		      return false;
    		    }

    		    return decorated.call(this, params);
    		  };

    		  return MinimumResultsForSearch;
    		});

    		S2.define('select2/dropdown/selectOnClose',[
    		  '../utils'
    		], function (Utils) {
    		  function SelectOnClose () { }

    		  SelectOnClose.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    decorated.call(this, container, $container);

    		    container.on('close', function (params) {
    		      self._handleSelectOnClose(params);
    		    });
    		  };

    		  SelectOnClose.prototype._handleSelectOnClose = function (_, params) {
    		    if (params && params.originalSelect2Event != null) {
    		      var event = params.originalSelect2Event;

    		      // Don't select an item if the close event was triggered from a select or
    		      // unselect event
    		      if (event._type === 'select' || event._type === 'unselect') {
    		        return;
    		      }
    		    }

    		    var $highlightedResults = this.getHighlightedResults();

    		    // Only select highlighted results
    		    if ($highlightedResults.length < 1) {
    		      return;
    		    }

    		    var data = Utils.GetData($highlightedResults[0], 'data');

    		    // Don't re-select already selected resulte
    		    if (
    		      (data.element != null && data.element.selected) ||
    		      (data.element == null && data.selected)
    		    ) {
    		      return;
    		    }

    		    this.trigger('select', {
    		        data: data
    		    });
    		  };

    		  return SelectOnClose;
    		});

    		S2.define('select2/dropdown/closeOnSelect',[

    		], function () {
    		  function CloseOnSelect () { }

    		  CloseOnSelect.prototype.bind = function (decorated, container, $container) {
    		    var self = this;

    		    decorated.call(this, container, $container);

    		    container.on('select', function (evt) {
    		      self._selectTriggered(evt);
    		    });

    		    container.on('unselect', function (evt) {
    		      self._selectTriggered(evt);
    		    });
    		  };

    		  CloseOnSelect.prototype._selectTriggered = function (_, evt) {
    		    var originalEvent = evt.originalEvent;

    		    // Don't close if the control key is being held
    		    if (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey)) {
    		      return;
    		    }

    		    this.trigger('close', {
    		      originalEvent: originalEvent,
    		      originalSelect2Event: evt
    		    });
    		  };

    		  return CloseOnSelect;
    		});

    		S2.define('select2/dropdown/dropdownCss',[
    		  '../utils'
    		], function (Utils) {
    		  function DropdownCSS () { }

    		  DropdownCSS.prototype.render = function (decorated) {
    		    var $dropdown = decorated.call(this);

    		    var dropdownCssClass = this.options.get('dropdownCssClass') || '';

    		    if (dropdownCssClass.indexOf(':all:') !== -1) {
    		      dropdownCssClass = dropdownCssClass.replace(':all:', '');

    		      Utils.copyNonInternalCssClasses($dropdown[0], this.$element[0]);
    		    }

    		    $dropdown.addClass(dropdownCssClass);

    		    return $dropdown;
    		  };

    		  return DropdownCSS;
    		});

    		S2.define('select2/dropdown/tagsSearchHighlight',[
    		  '../utils'
    		], function (Utils) {
    		  function TagsSearchHighlight () { }

    		  TagsSearchHighlight.prototype.highlightFirstItem = function (decorated) {
    		    var $options = this.$results
    		    .find(
    		      '.select2-results__option--selectable' +
    		      ':not(.select2-results__option--selected)'
    		    );

    		    if ($options.length > 0) {
    		      var $firstOption = $options.first();
    		      var data = Utils.GetData($firstOption[0], 'data');
    		      var firstElement = data.element;

    		      if (firstElement && firstElement.getAttribute) {
    		        if (firstElement.getAttribute('data-select2-tag') === 'true') {
    		          $firstOption.trigger('mouseenter');

    		          return;
    		        }
    		      }
    		    }

    		    decorated.call(this);
    		  };

    		  return TagsSearchHighlight;
    		});

    		S2.define('select2/i18n/en',[],function () {
    		  // English
    		  return {
    		    errorLoading: function () {
    		      return 'The results could not be loaded.';
    		    },
    		    inputTooLong: function (args) {
    		      var overChars = args.input.length - args.maximum;

    		      var message = 'Please delete ' + overChars + ' character';

    		      if (overChars != 1) {
    		        message += 's';
    		      }

    		      return message;
    		    },
    		    inputTooShort: function (args) {
    		      var remainingChars = args.minimum - args.input.length;

    		      var message = 'Please enter ' + remainingChars + ' or more characters';

    		      return message;
    		    },
    		    loadingMore: function () {
    		      return 'Loading more results…';
    		    },
    		    maximumSelected: function (args) {
    		      var message = 'You can only select ' + args.maximum + ' item';

    		      if (args.maximum != 1) {
    		        message += 's';
    		      }

    		      return message;
    		    },
    		    noResults: function () {
    		      return 'No results found';
    		    },
    		    searching: function () {
    		      return 'Searching…';
    		    },
    		    removeAllItems: function () {
    		      return 'Remove all items';
    		    },
    		    removeItem: function () {
    		      return 'Remove item';
    		    },
    		    search: function() {
    		      return 'Search';
    		    }
    		  };
    		});

    		S2.define('select2/defaults',[
    		  'jquery',

    		  './results',

    		  './selection/single',
    		  './selection/multiple',
    		  './selection/placeholder',
    		  './selection/allowClear',
    		  './selection/search',
    		  './selection/selectionCss',
    		  './selection/eventRelay',

    		  './utils',
    		  './translation',
    		  './diacritics',

    		  './data/select',
    		  './data/array',
    		  './data/ajax',
    		  './data/tags',
    		  './data/tokenizer',
    		  './data/minimumInputLength',
    		  './data/maximumInputLength',
    		  './data/maximumSelectionLength',

    		  './dropdown',
    		  './dropdown/search',
    		  './dropdown/hidePlaceholder',
    		  './dropdown/infiniteScroll',
    		  './dropdown/attachBody',
    		  './dropdown/minimumResultsForSearch',
    		  './dropdown/selectOnClose',
    		  './dropdown/closeOnSelect',
    		  './dropdown/dropdownCss',
    		  './dropdown/tagsSearchHighlight',

    		  './i18n/en'
    		], function ($,

    		             ResultsList,

    		             SingleSelection, MultipleSelection, Placeholder, AllowClear,
    		             SelectionSearch, SelectionCSS, EventRelay,

    		             Utils, Translation, DIACRITICS,

    		             SelectData, ArrayData, AjaxData, Tags, Tokenizer,
    		             MinimumInputLength, MaximumInputLength, MaximumSelectionLength,

    		             Dropdown, DropdownSearch, HidePlaceholder, InfiniteScroll,
    		             AttachBody, MinimumResultsForSearch, SelectOnClose, CloseOnSelect,
    		             DropdownCSS, TagsSearchHighlight,

    		             EnglishTranslation) {
    		  function Defaults () {
    		    this.reset();
    		  }

    		  Defaults.prototype.apply = function (options) {
    		    options = $.extend(true, {}, this.defaults, options);

    		    if (options.dataAdapter == null) {
    		      if (options.ajax != null) {
    		        options.dataAdapter = AjaxData;
    		      } else if (options.data != null) {
    		        options.dataAdapter = ArrayData;
    		      } else {
    		        options.dataAdapter = SelectData;
    		      }

    		      if (options.minimumInputLength > 0) {
    		        options.dataAdapter = Utils.Decorate(
    		          options.dataAdapter,
    		          MinimumInputLength
    		        );
    		      }

    		      if (options.maximumInputLength > 0) {
    		        options.dataAdapter = Utils.Decorate(
    		          options.dataAdapter,
    		          MaximumInputLength
    		        );
    		      }

    		      if (options.maximumSelectionLength > 0) {
    		        options.dataAdapter = Utils.Decorate(
    		          options.dataAdapter,
    		          MaximumSelectionLength
    		        );
    		      }

    		      if (options.tags) {
    		        options.dataAdapter = Utils.Decorate(options.dataAdapter, Tags);
    		      }

    		      if (options.tokenSeparators != null || options.tokenizer != null) {
    		        options.dataAdapter = Utils.Decorate(
    		          options.dataAdapter,
    		          Tokenizer
    		        );
    		      }
    		    }

    		    if (options.resultsAdapter == null) {
    		      options.resultsAdapter = ResultsList;

    		      if (options.ajax != null) {
    		        options.resultsAdapter = Utils.Decorate(
    		          options.resultsAdapter,
    		          InfiniteScroll
    		        );
    		      }

    		      if (options.placeholder != null) {
    		        options.resultsAdapter = Utils.Decorate(
    		          options.resultsAdapter,
    		          HidePlaceholder
    		        );
    		      }

    		      if (options.selectOnClose) {
    		        options.resultsAdapter = Utils.Decorate(
    		          options.resultsAdapter,
    		          SelectOnClose
    		        );
    		      }

    		      if (options.tags) {
    		        options.resultsAdapter = Utils.Decorate(
    		          options.resultsAdapter,
    		          TagsSearchHighlight
    		        );
    		      }
    		    }

    		    if (options.dropdownAdapter == null) {
    		      if (options.multiple) {
    		        options.dropdownAdapter = Dropdown;
    		      } else {
    		        var SearchableDropdown = Utils.Decorate(Dropdown, DropdownSearch);

    		        options.dropdownAdapter = SearchableDropdown;
    		      }

    		      if (options.minimumResultsForSearch !== 0) {
    		        options.dropdownAdapter = Utils.Decorate(
    		          options.dropdownAdapter,
    		          MinimumResultsForSearch
    		        );
    		      }

    		      if (options.closeOnSelect) {
    		        options.dropdownAdapter = Utils.Decorate(
    		          options.dropdownAdapter,
    		          CloseOnSelect
    		        );
    		      }

    		      if (options.dropdownCssClass != null) {
    		        options.dropdownAdapter = Utils.Decorate(
    		          options.dropdownAdapter,
    		          DropdownCSS
    		        );
    		      }

    		      options.dropdownAdapter = Utils.Decorate(
    		        options.dropdownAdapter,
    		        AttachBody
    		      );
    		    }

    		    if (options.selectionAdapter == null) {
    		      if (options.multiple) {
    		        options.selectionAdapter = MultipleSelection;
    		      } else {
    		        options.selectionAdapter = SingleSelection;
    		      }

    		      // Add the placeholder mixin if a placeholder was specified
    		      if (options.placeholder != null) {
    		        options.selectionAdapter = Utils.Decorate(
    		          options.selectionAdapter,
    		          Placeholder
    		        );
    		      }

    		      if (options.allowClear) {
    		        options.selectionAdapter = Utils.Decorate(
    		          options.selectionAdapter,
    		          AllowClear
    		        );
    		      }

    		      if (options.multiple) {
    		        options.selectionAdapter = Utils.Decorate(
    		          options.selectionAdapter,
    		          SelectionSearch
    		        );
    		      }

    		      if (options.selectionCssClass != null) {
    		        options.selectionAdapter = Utils.Decorate(
    		          options.selectionAdapter,
    		          SelectionCSS
    		        );
    		      }

    		      options.selectionAdapter = Utils.Decorate(
    		        options.selectionAdapter,
    		        EventRelay
    		      );
    		    }

    		    // If the defaults were not previously applied from an element, it is
    		    // possible for the language option to have not been resolved
    		    options.language = this._resolveLanguage(options.language);

    		    // Always fall back to English since it will always be complete
    		    options.language.push('en');

    		    var uniqueLanguages = [];

    		    for (var l = 0; l < options.language.length; l++) {
    		      var language = options.language[l];

    		      if (uniqueLanguages.indexOf(language) === -1) {
    		        uniqueLanguages.push(language);
    		      }
    		    }

    		    options.language = uniqueLanguages;

    		    options.translations = this._processTranslations(
    		      options.language,
    		      options.debug
    		    );

    		    return options;
    		  };

    		  Defaults.prototype.reset = function () {
    		    function stripDiacritics (text) {
    		      // Used 'uni range + named function' from http://jsperf.com/diacritics/18
    		      function match(a) {
    		        return DIACRITICS[a] || a;
    		      }

    		      return text.replace(/[^\u0000-\u007E]/g, match);
    		    }

    		    function matcher (params, data) {
    		      // Always return the object if there is nothing to compare
    		      if (params.term == null || params.term.trim() === '') {
    		        return data;
    		      }

    		      // Do a recursive check for options with children
    		      if (data.children && data.children.length > 0) {
    		        // Clone the data object if there are children
    		        // This is required as we modify the object to remove any non-matches
    		        var match = $.extend(true, {}, data);

    		        // Check each child of the option
    		        for (var c = data.children.length - 1; c >= 0; c--) {
    		          var child = data.children[c];

    		          var matches = matcher(params, child);

    		          // If there wasn't a match, remove the object in the array
    		          if (matches == null) {
    		            match.children.splice(c, 1);
    		          }
    		        }

    		        // If any children matched, return the new object
    		        if (match.children.length > 0) {
    		          return match;
    		        }

    		        // If there were no matching children, check just the plain object
    		        return matcher(params, match);
    		      }

    		      var original = stripDiacritics(data.text).toUpperCase();
    		      var term = stripDiacritics(params.term).toUpperCase();

    		      // Check if the text contains the term
    		      if (original.indexOf(term) > -1) {
    		        return data;
    		      }

    		      // If it doesn't contain the term, don't return anything
    		      return null;
    		    }

    		    this.defaults = {
    		      amdLanguageBase: './i18n/',
    		      autocomplete: 'off',
    		      closeOnSelect: true,
    		      debug: false,
    		      dropdownAutoWidth: false,
    		      escapeMarkup: Utils.escapeMarkup,
    		      language: {},
    		      matcher: matcher,
    		      minimumInputLength: 0,
    		      maximumInputLength: 0,
    		      maximumSelectionLength: 0,
    		      minimumResultsForSearch: 0,
    		      selectOnClose: false,
    		      scrollAfterSelect: false,
    		      sorter: function (data) {
    		        return data;
    		      },
    		      templateResult: function (result) {
    		        return result.text;
    		      },
    		      templateSelection: function (selection) {
    		        return selection.text;
    		      },
    		      theme: 'default',
    		      width: 'resolve'
    		    };
    		  };

    		  Defaults.prototype.applyFromElement = function (options, $element) {
    		    var optionLanguage = options.language;
    		    var defaultLanguage = this.defaults.language;
    		    var elementLanguage = $element.prop('lang');
    		    var parentLanguage = $element.closest('[lang]').prop('lang');

    		    var languages = Array.prototype.concat.call(
    		      this._resolveLanguage(elementLanguage),
    		      this._resolveLanguage(optionLanguage),
    		      this._resolveLanguage(defaultLanguage),
    		      this._resolveLanguage(parentLanguage)
    		    );

    		    options.language = languages;

    		    return options;
    		  };

    		  Defaults.prototype._resolveLanguage = function (language) {
    		    if (!language) {
    		      return [];
    		    }

    		    if ($.isEmptyObject(language)) {
    		      return [];
    		    }

    		    if ($.isPlainObject(language)) {
    		      return [language];
    		    }

    		    var languages;

    		    if (!Array.isArray(language)) {
    		      languages = [language];
    		    } else {
    		      languages = language;
    		    }

    		    var resolvedLanguages = [];

    		    for (var l = 0; l < languages.length; l++) {
    		      resolvedLanguages.push(languages[l]);

    		      if (typeof languages[l] === 'string' && languages[l].indexOf('-') > 0) {
    		        // Extract the region information if it is included
    		        var languageParts = languages[l].split('-');
    		        var baseLanguage = languageParts[0];

    		        resolvedLanguages.push(baseLanguage);
    		      }
    		    }

    		    return resolvedLanguages;
    		  };

    		  Defaults.prototype._processTranslations = function (languages, debug) {
    		    var translations = new Translation();

    		    for (var l = 0; l < languages.length; l++) {
    		      var languageData = new Translation();

    		      var language = languages[l];

    		      if (typeof language === 'string') {
    		        try {
    		          // Try to load it with the original name
    		          languageData = Translation.loadPath(language);
    		        } catch (e) {
    		          try {
    		            // If we couldn't load it, check if it wasn't the full path
    		            language = this.defaults.amdLanguageBase + language;
    		            languageData = Translation.loadPath(language);
    		          } catch (ex) {
    		            // The translation could not be loaded at all. Sometimes this is
    		            // because of a configuration problem, other times this can be
    		            // because of how Select2 helps load all possible translation files
    		            if (debug && window.console && console.warn) {
    		              console.warn(
    		                'Select2: The language file for "' + language + '" could ' +
    		                'not be automatically loaded. A fallback will be used instead.'
    		              );
    		            }
    		          }
    		        }
    		      } else if ($.isPlainObject(language)) {
    		        languageData = new Translation(language);
    		      } else {
    		        languageData = language;
    		      }

    		      translations.extend(languageData);
    		    }

    		    return translations;
    		  };

    		  Defaults.prototype.set = function (key, value) {
    		    var camelKey = $.camelCase(key);

    		    var data = {};
    		    data[camelKey] = value;

    		    var convertedData = Utils._convertData(data);

    		    $.extend(true, this.defaults, convertedData);
    		  };

    		  var defaults = new Defaults();

    		  return defaults;
    		});

    		S2.define('select2/options',[
    		  'jquery',
    		  './defaults',
    		  './utils'
    		], function ($, Defaults, Utils) {
    		  function Options (options, $element) {
    		    this.options = options;

    		    if ($element != null) {
    		      this.fromElement($element);
    		    }

    		    if ($element != null) {
    		      this.options = Defaults.applyFromElement(this.options, $element);
    		    }

    		    this.options = Defaults.apply(this.options);
    		  }

    		  Options.prototype.fromElement = function ($e) {
    		    var excludedData = ['select2'];

    		    if (this.options.multiple == null) {
    		      this.options.multiple = $e.prop('multiple');
    		    }

    		    if (this.options.disabled == null) {
    		      this.options.disabled = $e.prop('disabled');
    		    }

    		    if (this.options.autocomplete == null && $e.prop('autocomplete')) {
    		      this.options.autocomplete = $e.prop('autocomplete');
    		    }

    		    if (this.options.dir == null) {
    		      if ($e.prop('dir')) {
    		        this.options.dir = $e.prop('dir');
    		      } else if ($e.closest('[dir]').prop('dir')) {
    		        this.options.dir = $e.closest('[dir]').prop('dir');
    		      } else {
    		        this.options.dir = 'ltr';
    		      }
    		    }

    		    $e.prop('disabled', this.options.disabled);
    		    $e.prop('multiple', this.options.multiple);

    		    if (Utils.GetData($e[0], 'select2Tags')) {
    		      if (this.options.debug && window.console && console.warn) {
    		        console.warn(
    		          'Select2: The `data-select2-tags` attribute has been changed to ' +
    		          'use the `data-data` and `data-tags="true"` attributes and will be ' +
    		          'removed in future versions of Select2.'
    		        );
    		      }

    		      Utils.StoreData($e[0], 'data', Utils.GetData($e[0], 'select2Tags'));
    		      Utils.StoreData($e[0], 'tags', true);
    		    }

    		    if (Utils.GetData($e[0], 'ajaxUrl')) {
    		      if (this.options.debug && window.console && console.warn) {
    		        console.warn(
    		          'Select2: The `data-ajax-url` attribute has been changed to ' +
    		          '`data-ajax--url` and support for the old attribute will be removed' +
    		          ' in future versions of Select2.'
    		        );
    		      }

    		      $e.attr('ajax--url', Utils.GetData($e[0], 'ajaxUrl'));
    		      Utils.StoreData($e[0], 'ajax-Url', Utils.GetData($e[0], 'ajaxUrl'));
    		    }

    		    var dataset = {};

    		    function upperCaseLetter(_, letter) {
    		      return letter.toUpperCase();
    		    }

    		    // Pre-load all of the attributes which are prefixed with `data-`
    		    for (var attr = 0; attr < $e[0].attributes.length; attr++) {
    		      var attributeName = $e[0].attributes[attr].name;
    		      var prefix = 'data-';

    		      if (attributeName.substr(0, prefix.length) == prefix) {
    		        // Get the contents of the attribute after `data-`
    		        var dataName = attributeName.substring(prefix.length);

    		        // Get the data contents from the consistent source
    		        // This is more than likely the jQuery data helper
    		        var dataValue = Utils.GetData($e[0], dataName);

    		        // camelCase the attribute name to match the spec
    		        var camelDataName = dataName.replace(/-([a-z])/g, upperCaseLetter);

    		        // Store the data attribute contents into the dataset since
    		        dataset[camelDataName] = dataValue;
    		      }
    		    }

    		    // Prefer the element's `dataset` attribute if it exists
    		    // jQuery 1.x does not correctly handle data attributes with multiple dashes
    		    if ($.fn.jquery && $.fn.jquery.substr(0, 2) == '1.' && $e[0].dataset) {
    		      dataset = $.extend(true, {}, $e[0].dataset, dataset);
    		    }

    		    // Prefer our internal data cache if it exists
    		    var data = $.extend(true, {}, Utils.GetData($e[0]), dataset);

    		    data = Utils._convertData(data);

    		    for (var key in data) {
    		      if (excludedData.indexOf(key) > -1) {
    		        continue;
    		      }

    		      if ($.isPlainObject(this.options[key])) {
    		        $.extend(this.options[key], data[key]);
    		      } else {
    		        this.options[key] = data[key];
    		      }
    		    }

    		    return this;
    		  };

    		  Options.prototype.get = function (key) {
    		    return this.options[key];
    		  };

    		  Options.prototype.set = function (key, val) {
    		    this.options[key] = val;
    		  };

    		  return Options;
    		});

    		S2.define('select2/core',[
    		  'jquery',
    		  './options',
    		  './utils',
    		  './keys'
    		], function ($, Options, Utils, KEYS) {
    		  var Select2 = function ($element, options) {
    		    if (Utils.GetData($element[0], 'select2') != null) {
    		      Utils.GetData($element[0], 'select2').destroy();
    		    }

    		    this.$element = $element;

    		    this.id = this._generateId($element);

    		    options = options || {};

    		    this.options = new Options(options, $element);

    		    Select2.__super__.constructor.call(this);

    		    // Set up the tabindex

    		    var tabindex = $element.attr('tabindex') || 0;
    		    Utils.StoreData($element[0], 'old-tabindex', tabindex);
    		    $element.attr('tabindex', '-1');

    		    // Set up containers and adapters

    		    var DataAdapter = this.options.get('dataAdapter');
    		    this.dataAdapter = new DataAdapter($element, this.options);

    		    var $container = this.render();

    		    this._placeContainer($container);

    		    var SelectionAdapter = this.options.get('selectionAdapter');
    		    this.selection = new SelectionAdapter($element, this.options);
    		    this.$selection = this.selection.render();

    		    this.selection.position(this.$selection, $container);

    		    var DropdownAdapter = this.options.get('dropdownAdapter');
    		    this.dropdown = new DropdownAdapter($element, this.options);
    		    this.$dropdown = this.dropdown.render();

    		    this.dropdown.position(this.$dropdown, $container);

    		    var ResultsAdapter = this.options.get('resultsAdapter');
    		    this.results = new ResultsAdapter($element, this.options, this.dataAdapter);
    		    this.$results = this.results.render();

    		    this.results.position(this.$results, this.$dropdown);

    		    // Bind events

    		    var self = this;

    		    // Bind the container to all of the adapters
    		    this._bindAdapters();

    		    // Register any DOM event handlers
    		    this._registerDomEvents();

    		    // Register any internal event handlers
    		    this._registerDataEvents();
    		    this._registerSelectionEvents();
    		    this._registerDropdownEvents();
    		    this._registerResultsEvents();
    		    this._registerEvents();

    		    // Set the initial state
    		    this.dataAdapter.current(function (initialData) {
    		      self.trigger('selection:update', {
    		        data: initialData
    		      });
    		    });

    		    // Hide the original select
    		    $element[0].classList.add('select2-hidden-accessible');
    		    $element.attr('aria-hidden', 'true');

    		    // Synchronize any monitored attributes
    		    this._syncAttributes();

    		    Utils.StoreData($element[0], 'select2', this);

    		    // Ensure backwards compatibility with $element.data('select2').
    		    $element.data('select2', this);
    		  };

    		  Utils.Extend(Select2, Utils.Observable);

    		  Select2.prototype._generateId = function ($element) {
    		    var id = '';

    		    if ($element.attr('id') != null) {
    		      id = $element.attr('id');
    		    } else if ($element.attr('name') != null) {
    		      id = $element.attr('name') + '-' + Utils.generateChars(2);
    		    } else {
    		      id = Utils.generateChars(4);
    		    }

    		    id = id.replace(/(:|\.|\[|\]|,)/g, '');
    		    id = 'select2-' + id;

    		    return id;
    		  };

    		  Select2.prototype._placeContainer = function ($container) {
    		    $container.insertAfter(this.$element);

    		    var width = this._resolveWidth(this.$element, this.options.get('width'));

    		    if (width != null) {
    		      $container.css('width', width);
    		    }
    		  };

    		  Select2.prototype._resolveWidth = function ($element, method) {
    		    var WIDTH = /^width:(([-+]?([0-9]*\.)?[0-9]+)(px|em|ex|%|in|cm|mm|pt|pc))/i;

    		    if (method == 'resolve') {
    		      var styleWidth = this._resolveWidth($element, 'style');

    		      if (styleWidth != null) {
    		        return styleWidth;
    		      }

    		      return this._resolveWidth($element, 'element');
    		    }

    		    if (method == 'element') {
    		      var elementWidth = $element.outerWidth(false);

    		      if (elementWidth <= 0) {
    		        return 'auto';
    		      }

    		      return elementWidth + 'px';
    		    }

    		    if (method == 'style') {
    		      var style = $element.attr('style');

    		      if (typeof(style) !== 'string') {
    		        return null;
    		      }

    		      var attrs = style.split(';');

    		      for (var i = 0, l = attrs.length; i < l; i = i + 1) {
    		        var attr = attrs[i].replace(/\s/g, '');
    		        var matches = attr.match(WIDTH);

    		        if (matches !== null && matches.length >= 1) {
    		          return matches[1];
    		        }
    		      }

    		      return null;
    		    }

    		    if (method == 'computedstyle') {
    		      var computedStyle = window.getComputedStyle($element[0]);

    		      return computedStyle.width;
    		    }

    		    return method;
    		  };

    		  Select2.prototype._bindAdapters = function () {
    		    this.dataAdapter.bind(this, this.$container);
    		    this.selection.bind(this, this.$container);

    		    this.dropdown.bind(this, this.$container);
    		    this.results.bind(this, this.$container);
    		  };

    		  Select2.prototype._registerDomEvents = function () {
    		    var self = this;

    		    this.$element.on('change.select2', function () {
    		      self.dataAdapter.current(function (data) {
    		        self.trigger('selection:update', {
    		          data: data
    		        });
    		      });
    		    });

    		    this.$element.on('focus.select2', function (evt) {
    		      self.trigger('focus', evt);
    		    });

    		    this._syncA = Utils.bind(this._syncAttributes, this);
    		    this._syncS = Utils.bind(this._syncSubtree, this);

    		    this._observer = new window.MutationObserver(function (mutations) {
    		      self._syncA();
    		      self._syncS(mutations);
    		    });
    		    this._observer.observe(this.$element[0], {
    		      attributes: true,
    		      childList: true,
    		      subtree: false
    		    });
    		  };

    		  Select2.prototype._registerDataEvents = function () {
    		    var self = this;

    		    this.dataAdapter.on('*', function (name, params) {
    		      self.trigger(name, params);
    		    });
    		  };

    		  Select2.prototype._registerSelectionEvents = function () {
    		    var self = this;
    		    var nonRelayEvents = ['toggle', 'focus'];

    		    this.selection.on('toggle', function () {
    		      self.toggleDropdown();
    		    });

    		    this.selection.on('focus', function (params) {
    		      self.focus(params);
    		    });

    		    this.selection.on('*', function (name, params) {
    		      if (nonRelayEvents.indexOf(name) !== -1) {
    		        return;
    		      }

    		      self.trigger(name, params);
    		    });
    		  };

    		  Select2.prototype._registerDropdownEvents = function () {
    		    var self = this;

    		    this.dropdown.on('*', function (name, params) {
    		      self.trigger(name, params);
    		    });
    		  };

    		  Select2.prototype._registerResultsEvents = function () {
    		    var self = this;

    		    this.results.on('*', function (name, params) {
    		      self.trigger(name, params);
    		    });
    		  };

    		  Select2.prototype._registerEvents = function () {
    		    var self = this;

    		    this.on('open', function () {
    		      self.$container[0].classList.add('select2-container--open');
    		    });

    		    this.on('close', function () {
    		      self.$container[0].classList.remove('select2-container--open');
    		    });

    		    this.on('enable', function () {
    		      self.$container[0].classList.remove('select2-container--disabled');
    		    });

    		    this.on('disable', function () {
    		      self.$container[0].classList.add('select2-container--disabled');
    		    });

    		    this.on('blur', function () {
    		      self.$container[0].classList.remove('select2-container--focus');
    		    });

    		    this.on('query', function (params) {
    		      if (!self.isOpen()) {
    		        self.trigger('open', {});
    		      }

    		      this.dataAdapter.query(params, function (data) {
    		        self.trigger('results:all', {
    		          data: data,
    		          query: params
    		        });
    		      });
    		    });

    		    this.on('query:append', function (params) {
    		      this.dataAdapter.query(params, function (data) {
    		        self.trigger('results:append', {
    		          data: data,
    		          query: params
    		        });
    		      });
    		    });

    		    this.on('keypress', function (evt) {
    		      var key = evt.which;

    		      if (self.isOpen()) {
    		        if (key === KEYS.ESC || (key === KEYS.UP && evt.altKey)) {
    		          self.close(evt);

    		          evt.preventDefault();
    		        } else if (key === KEYS.ENTER || key === KEYS.TAB) {
    		          self.trigger('results:select', {});

    		          evt.preventDefault();
    		        } else if ((key === KEYS.SPACE && evt.ctrlKey)) {
    		          self.trigger('results:toggle', {});

    		          evt.preventDefault();
    		        } else if (key === KEYS.UP) {
    		          self.trigger('results:previous', {});

    		          evt.preventDefault();
    		        } else if (key === KEYS.DOWN) {
    		          self.trigger('results:next', {});

    		          evt.preventDefault();
    		        }
    		      } else {
    		        if (key === KEYS.ENTER || key === KEYS.SPACE ||
    		            (key === KEYS.DOWN && evt.altKey)) {
    		          self.open();

    		          evt.preventDefault();
    		        }
    		      }
    		    });
    		  };

    		  Select2.prototype._syncAttributes = function () {
    		    this.options.set('disabled', this.$element.prop('disabled'));

    		    if (this.isDisabled()) {
    		      if (this.isOpen()) {
    		        this.close();
    		      }

    		      this.trigger('disable', {});
    		    } else {
    		      this.trigger('enable', {});
    		    }
    		  };

    		  Select2.prototype._isChangeMutation = function (mutations) {
    		    var self = this;

    		    if (mutations.addedNodes && mutations.addedNodes.length > 0) {
    		      for (var n = 0; n < mutations.addedNodes.length; n++) {
    		        var node = mutations.addedNodes[n];

    		        if (node.selected) {
    		          return true;
    		        }
    		      }
    		    } else if (mutations.removedNodes && mutations.removedNodes.length > 0) {
    		      return true;
    		    } else if (Array.isArray(mutations)) {
    		      return mutations.some(function (mutation) {
    		        return self._isChangeMutation(mutation);
    		      });
    		    }

    		    return false;
    		  };

    		  Select2.prototype._syncSubtree = function (mutations) {
    		    var changed = this._isChangeMutation(mutations);
    		    var self = this;

    		    // Only re-pull the data if we think there is a change
    		    if (changed) {
    		      this.dataAdapter.current(function (currentData) {
    		        self.trigger('selection:update', {
    		          data: currentData
    		        });
    		      });
    		    }
    		  };

    		  /**
    		   * Override the trigger method to automatically trigger pre-events when
    		   * there are events that can be prevented.
    		   */
    		  Select2.prototype.trigger = function (name, args) {
    		    var actualTrigger = Select2.__super__.trigger;
    		    var preTriggerMap = {
    		      'open': 'opening',
    		      'close': 'closing',
    		      'select': 'selecting',
    		      'unselect': 'unselecting',
    		      'clear': 'clearing'
    		    };

    		    if (args === undefined) {
    		      args = {};
    		    }

    		    if (name in preTriggerMap) {
    		      var preTriggerName = preTriggerMap[name];
    		      var preTriggerArgs = {
    		        prevented: false,
    		        name: name,
    		        args: args
    		      };

    		      actualTrigger.call(this, preTriggerName, preTriggerArgs);

    		      if (preTriggerArgs.prevented) {
    		        args.prevented = true;

    		        return;
    		      }
    		    }

    		    actualTrigger.call(this, name, args);
    		  };

    		  Select2.prototype.toggleDropdown = function () {
    		    if (this.isDisabled()) {
    		      return;
    		    }

    		    if (this.isOpen()) {
    		      this.close();
    		    } else {
    		      this.open();
    		    }
    		  };

    		  Select2.prototype.open = function () {
    		    if (this.isOpen()) {
    		      return;
    		    }

    		    if (this.isDisabled()) {
    		      return;
    		    }

    		    this.trigger('query', {});
    		  };

    		  Select2.prototype.close = function (evt) {
    		    if (!this.isOpen()) {
    		      return;
    		    }

    		    this.trigger('close', { originalEvent : evt });
    		  };

    		  /**
    		   * Helper method to abstract the "enabled" (not "disabled") state of this
    		   * object.
    		   *
    		   * @return {true} if the instance is not disabled.
    		   * @return {false} if the instance is disabled.
    		   */
    		  Select2.prototype.isEnabled = function () {
    		    return !this.isDisabled();
    		  };

    		  /**
    		   * Helper method to abstract the "disabled" state of this object.
    		   *
    		   * @return {true} if the disabled option is true.
    		   * @return {false} if the disabled option is false.
    		   */
    		  Select2.prototype.isDisabled = function () {
    		    return this.options.get('disabled');
    		  };

    		  Select2.prototype.isOpen = function () {
    		    return this.$container[0].classList.contains('select2-container--open');
    		  };

    		  Select2.prototype.hasFocus = function () {
    		    return this.$container[0].classList.contains('select2-container--focus');
    		  };

    		  Select2.prototype.focus = function (data) {
    		    // No need to re-trigger focus events if we are already focused
    		    if (this.hasFocus()) {
    		      return;
    		    }

    		    this.$container[0].classList.add('select2-container--focus');
    		    this.trigger('focus', {});
    		  };

    		  Select2.prototype.enable = function (args) {
    		    if (this.options.get('debug') && window.console && console.warn) {
    		      console.warn(
    		        'Select2: The `select2("enable")` method has been deprecated and will' +
    		        ' be removed in later Select2 versions. Use $element.prop("disabled")' +
    		        ' instead.'
    		      );
    		    }

    		    if (args == null || args.length === 0) {
    		      args = [true];
    		    }

    		    var disabled = !args[0];

    		    this.$element.prop('disabled', disabled);
    		  };

    		  Select2.prototype.data = function () {
    		    if (this.options.get('debug') &&
    		        arguments.length > 0 && window.console && console.warn) {
    		      console.warn(
    		        'Select2: Data can no longer be set using `select2("data")`. You ' +
    		        'should consider setting the value instead using `$element.val()`.'
    		      );
    		    }

    		    var data = [];

    		    this.dataAdapter.current(function (currentData) {
    		      data = currentData;
    		    });

    		    return data;
    		  };

    		  Select2.prototype.val = function (args) {
    		    if (this.options.get('debug') && window.console && console.warn) {
    		      console.warn(
    		        'Select2: The `select2("val")` method has been deprecated and will be' +
    		        ' removed in later Select2 versions. Use $element.val() instead.'
    		      );
    		    }

    		    if (args == null || args.length === 0) {
    		      return this.$element.val();
    		    }

    		    var newVal = args[0];

    		    if (Array.isArray(newVal)) {
    		      newVal = newVal.map(function (obj) {
    		        return obj.toString();
    		      });
    		    }

    		    this.$element.val(newVal).trigger('input').trigger('change');
    		  };

    		  Select2.prototype.destroy = function () {
    		    Utils.RemoveData(this.$container[0]);
    		    this.$container.remove();

    		    this._observer.disconnect();
    		    this._observer = null;

    		    this._syncA = null;
    		    this._syncS = null;

    		    this.$element.off('.select2');
    		    this.$element.attr('tabindex',
    		    Utils.GetData(this.$element[0], 'old-tabindex'));

    		    this.$element[0].classList.remove('select2-hidden-accessible');
    		    this.$element.attr('aria-hidden', 'false');
    		    Utils.RemoveData(this.$element[0]);
    		    this.$element.removeData('select2');

    		    this.dataAdapter.destroy();
    		    this.selection.destroy();
    		    this.dropdown.destroy();
    		    this.results.destroy();

    		    this.dataAdapter = null;
    		    this.selection = null;
    		    this.dropdown = null;
    		    this.results = null;
    		  };

    		  Select2.prototype.render = function () {
    		    var $container = $(
    		      '<span class="select2 select2-container">' +
    		        '<span class="selection"></span>' +
    		        '<span class="dropdown-wrapper" aria-hidden="true"></span>' +
    		      '</span>'
    		    );

    		    $container.attr('dir', this.options.get('dir'));

    		    this.$container = $container;

    		    this.$container[0].classList
    		      .add('select2-container--' + this.options.get('theme'));

    		    Utils.StoreData($container[0], 'element', this.$element);

    		    return $container;
    		  };

    		  return Select2;
    		});

    		S2.define('jquery-mousewheel',[
    		  'jquery'
    		], function ($) {
    		  // Used to shim jQuery.mousewheel for non-full builds.
    		  return $;
    		});

    		S2.define('jquery.select2',[
    		  'jquery',
    		  'jquery-mousewheel',

    		  './select2/core',
    		  './select2/defaults',
    		  './select2/utils'
    		], function ($, _, Select2, Defaults, Utils) {
    		  if ($.fn.select2 == null) {
    		    // All methods that should return the element
    		    var thisMethods = ['open', 'close', 'destroy'];

    		    $.fn.select2 = function (options) {
    		      options = options || {};

    		      if (typeof options === 'object') {
    		        this.each(function () {
    		          var instanceOptions = $.extend(true, {}, options);

    		          new Select2($(this), instanceOptions);
    		        });

    		        return this;
    		      } else if (typeof options === 'string') {
    		        var ret;
    		        var args = Array.prototype.slice.call(arguments, 1);

    		        this.each(function () {
    		          var instance = Utils.GetData(this, 'select2');

    		          if (instance == null && window.console && console.error) {
    		            console.error(
    		              'The select2(\'' + options + '\') method was called on an ' +
    		              'element that is not using Select2.'
    		            );
    		          }

    		          ret = instance[options].apply(instance, args);
    		        });

    		        // Check if we should be returning `this`
    		        if (thisMethods.indexOf(options) > -1) {
    		          return this;
    		        }

    		        return ret;
    		      } else {
    		        throw new Error('Invalid arguments for Select2: ' + options);
    		      }
    		    };
    		  }

    		  if ($.fn.select2.defaults == null) {
    		    $.fn.select2.defaults = Defaults;
    		  }

    		  return Select2;
    		});

    		  // Return the AMD loader configuration so it can be used outside of this file
    		  return {
    		    define: S2.define,
    		    require: S2.require
    		  };
    		}());

    		  // Autoload the jQuery bindings
    		  // We know that all of the modules exist above this, so we're safe
    		  var select2 = S2.require('jquery.select2');

    		  // Hold the AMD module references on the jQuery function that was just loaded
    		  // This allows Select2 to use the internal loader outside of this file, such
    		  // as in the language files.
    		  jQuery.fn.select2.amd = S2;

    		  // Return the Select2 instance for anyone who is importing it.
    		  return select2;
    		})); 
    	} (select2));
    	return select2.exports;
    }

    var select2Exports = requireSelect2();
    var select2Factory = /*@__PURE__*/getDefaultExportFromCjs(select2Exports);

    // Only initialize Select2 in contexts with a DOM (skip in service workers)
    if (typeof jQuery$1.fn !== "undefined") {
        select2Factory(undefined, jQuery$1);
    }

    /**
     * Closes the popup modal
     */
    const closePopupModal = () => {
        state.modalIsOpen = false;
        style("popup-modal-wrapper", "display", "none");
    };

    const hideAllTooltips = () => {
        queryAll(".title-tooltip,#popup-title-tooltip").forEach((el) => {
            hideId(el);
        });
        state.tooltipIsOpen = false;
    };

    /**
     * Looks for an open tab to the paper: either its local or online pdf, or html page.
     * If both a local pdf tab exists, focus it.
     * Otherwise, if a remote pdf tab exists, focus it.
     * Otherwise, if an html page exist, focus the it.
     * If none exist, create a new tab to the local file if it exists, to the online pdf otherwise.
     * @param {object} paper The paper whose pdf should be opened
     */
    const focusExistingOrCreateNewPaperTab = async (paper, fromMemoryItem) => {
        if (!chrome.tabs) {
            focusExistingOrCreateNewURLTab(
                isPdfUrl(window.location.href) ? paperToAbs(paper) : paperToPDF(paper),
            );
            return;
        }
        chrome.tabs.query({}, async (tabs) => {
            // find user's preferences
            const prefs = state.prefs;

            let paperTabs = []; // tabs to the paper
            for (const tab of tabs) {
                let tabPaperId;
                try {
                    // try and parse a paper id
                    tabPaperId = tab.url && (await parseIdFromUrl(tab.url));
                } catch (error) {}

                if (tabPaperId && tabPaperId === paper.id) {
                    // an id is found and its the paper's: store the tab
                    paperTabs.push(tab);
                }
            }

            let tabToFocus;
            // choose favorite tabs
            const favoriteTabs = prefs.checkPreferPdf
                ? paperTabs.filter((tab) => tab.url && isPdfUrl(tab.url))
                : paperTabs.filter((tab) => tab.url && !isPdfUrl(tab.url));

            if (favoriteTabs.length > 0) {
                // favor tabs to local files
                const fileTabs =
                    state.files.hasOwnProperty(paper.id)
                        ? []
                        : paperTabs.filter((tab) => tab.url.startsWith("file://"));
                if (fileTabs.length > 0) {
                    tabToFocus = fileTabs[0];
                } else {
                    tabToFocus = favoriteTabs[0];
                }
            } else if (paperTabs.length > 0) {
                // no pdf tab: go to abs url
                tabToFocus = paperTabs[0];
            }

            if (tabToFocus) {
                // a tab was found: focus it by starting to focus its window
                chrome.windows.getCurrent((w) => {
                    if (w.id !== tabToFocus.windowId) {
                        // tab is in a different window: focus the window
                        chrome.windows.update(
                            tabToFocus.windowId,
                            { focused: true },
                            () => {
                                // focus the tab
                                chrome.tabs.update(tabToFocus.id, { active: true });
                            },
                        );
                    } else {
                        // tab is in the same window: focus the tab
                        chrome.tabs.update(tabToFocus.id, { active: true });
                    }
                });
            } else {
                // no tab was found
                state.files.hasOwnProperty(paper.id);
                {
                    // no tab open or local file: open a new tab to the paper's pdf
                    chrome.tabs.create({
                        url: prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper),
                    });
                }
            }

            state.papers[paper.id] = updatePaperVisits(state.papers[paper.id]);
            chrome.storage.local.set({ papers: state.papers });
        });
    };

    /**
     * Delete a paper ; display a modal first to get uer confirmation
     * @param {string} id Id of the paper to delete
     */
    const showConfirmDeleteModal = (id) => {
        const title = state.papers[id].title;
        setTextId("delete-modal-title", title);
        setHTML("delete-paper-modal-hidden-id", id);
        showId("delete-paper-modal", "flex");
    };

    /**
     * Monitors the popup's paper edits or the memory's table of papers' edits.
     * Triggers `handleMemorySaveEdits` or `handlePopupSaveEdits` (depending on `isPopup`)
     * if a change is detected.
     *
     * @param {string} id Optional id of the paper to monitor (when called for the popup edit form)
     * @param {boolean} isPopup Whether the function is called to monitor the single
     * popup edit form or the set of memory-items' forms
     */
    const monitorPaperEdits = (id, isPopup) => (e) => {
        let paperId;
        if (typeof id === "undefined") {
            paperId = eventId(e);
        } else {
            paperId = id;
        }
        const edits = getPaperEdits(paperId, isPopup);
        const paper = state.papers[paperId];
        let change = false;
        for (const key in edits) {
            const ref = paper[key];
            const value = edits[key];
            if (key === "tags") {
                if (!arraysIdentical(ref, value)) change = true;
            } else {
                if (ref !== value) {
                    change = true;
                }
            }
        }
        if (change) {
            log("Updating meta data for", paperId);
            if (isPopup) {
                handlePopupSaveEdits(paperId);
            } else {
                handleMemorySaveEdits(paperId);
            }
        }
    };

    const displayOnScroll = (isPopup) =>
        delay(() => {
            const { bottom } = findEl({ element: "memory-table" }).getBoundingClientRect();
            const height = findEl({ element: "memory-container" }).getBoundingClientRect().height
                ;
            const currentPapers = state.currentMemoryPagination * state.memoryItemsPerPage;
            if (
                Math.abs(bottom - height) < height &&
                currentPapers < state.papersList.length
            ) {
                state.currentMemoryPagination += 1;
                displayMemoryTable(state.currentMemoryPagination);
            }
        }, 50);

    const handleBackToFocus = (e) => {
        const id = eventId(e);
        setTimeout(() => {
            dispatch(`memory-container--${id}`, "focus");
        }, 250);
    };

    const handleDeleteItem = (e) => {
        const id = eventId(e);
        showConfirmDeleteModal(id);
    };

    const handleOpenItemLink = (e) => {
        const id = eventId(e);
        focusExistingOrCreateNewPaperTab(state.papers[id]);
    };

    const handleOpenItemScirate = (e) => {
        const id = eventId(e);
        const arxivId = arxivIdFromPaperID(state.papers[id].id);
        const scirateURL = `https://scirate.com/arxiv/${arxivId}`;
        focusExistingOrCreateNewURLTab(scirateURL);
        state.papers[id] = updatePaperVisits(state.papers[id]);
        setStorage("papers", state.papers);
    };
    const handleOpenItemAlphaxiv = (e) => {
        const id = eventId(e);
        const arxivId = arxivIdFromPaperID(state.papers[id].id);
        const alphaxivURL = `https://alphaxiv.org/abs/${arxivId}`;
        focusExistingOrCreateNewURLTab(alphaxivURL);
        state.papers[id] = updatePaperVisits(state.papers[id]);
        setStorage("papers", state.papers);
    };
    const handleOpenItemAr5iv = (e) => {
        const id = eventId(e);
        const arxivId = arxivIdFromPaperID(state.papers[id].id);
        const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
        const paperMonth = parseInt(arxivId.split(".")[0].slice(-2), 10);
        const paperYear = 2000 + parseInt(arxivId.split(".")[0].slice(0, 2), 10);
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        if (paperYear === currentYear && paperMonth === currentMonth) {
            showPopupModal("ar5iv");
            addListener("ar5iv-modal-ok-button", "click", () => {
                focusExistingOrCreateNewURLTab(ar5ivURL);
                state.papers[id] = updatePaperVisits(state.papers[id]);
                setStorage("papers", state.papers);
                closePopupModal();
            });
        } else {
            focusExistingOrCreateNewURLTab(ar5ivURL);
            state.papers[id] = updatePaperVisits(state.papers[id]);
            setStorage("papers", state.papers);
        }
    };
    const handleOpenItemHuggingface = (e) => {
        const id = eventId(e);
        const arxivId = arxivIdFromPaperID(state.papers[id].id);
        const huggingFaceURL = `https://huggingface.co/papers/${arxivId}`;
        focusExistingOrCreateNewURLTab(huggingFaceURL);
        state.papers[id] = updatePaperVisits(state.papers[id]);
        setStorage("papers", state.papers);
    };

    const handleOpenItemCodeLink = async (e) => {
        const id = eventId(e);
        const url = state.papers[id].codeLink;
        await focusExistingOrCreateNewURLTab(url);
    };

    const handleOpenItemWebsiteURL = async (e) => {
        const id = eventId(e);
        const url = state.papers[id].pdfLink;
        state.papers[id] = updatePaperVisits(state.papers[id]);
        await setStorage("papers", state.papers);
        await focusExistingOrCreateNewURLTab(url);
    };

    const handleCopyMarkdownLink = async (e) => {
        const id = eventId(e);
        const prefs = state.prefs;
        const paper = state.papers[id];
        const text =
            paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
        const md = makeMdLink(paper, prefs);
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: md,
            feedbackText: `Markdown ${text} link copied!`,
            context: state.memoryIsOpen ? "memory" : "popup",
        });
    };

    const handleCopyBibtex = async (e) => {
        const id = eventId(e);
        const bibtex = state.papers[id].bibtex;
        let bibobj = bibtexToObject(bibtex);
        if (!bibobj.hasOwnProperty("url")) {
            bibobj.url = paperToAbs(state.papers[id]);
        }
        if (!bibobj.hasOwnProperty("pdf") && state.papers[id].source !== "website") {
            bibobj.pdf = paperToPDF(state.papers[id]);
        }
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: bibtexToString(bibobj),
            feedbackText: "Bibtex copied!",
            context: state.memoryIsOpen ? "memory" : "popup",
        });
    };

    const handleCopyPDFLink = async (e) => {
        const id = eventId(e);
        const prefs = state.prefs;
        const paper = state.papers[id];
        const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
        const text =
            paper.source === "website" ? "URL" : prefs.checkPreferPdf ? "PDF" : "Abstract";
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: link,
            feedbackText: `${text} link copied!`,
            context: state.memoryIsOpen ? "memory" : "popup",
        });
    };

    const handleCopyHyperLink = async (e) => {
        const id = eventId(e);
        const prefs = state.prefs;
        const paper = state.papers[id];
        const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
        await copyAndConfirmMemoryItem({
            id,
            textToCopy: link,
            feedbackText: `Hyperlink copied!`,
            hyperLinkTitle: paper.title,
            context: state.memoryIsOpen ? "memory" : "popup",
        });
    };

    const handleAddItemToFavorites = (e) => {
        const id = eventId(e);
        const isFavorite = hasClass(`memory-container--${id}`, "favorite");
        saveFavoriteItem(id, !isFavorite);
    };

    const handleMemoryOpenLocal = (e) => {
        const id = eventId(e);
        const file = state.files[id];
        const paper = state.papers[id];
        state.papers[id] = updatePaperVisits(paper);
        setStorage("papers", state.papers);
        if (file && (file.id || file.id === 0)) {
            chrome.downloads.open(file.id);
        }
        window?.close && window.close();
    };

    const handleTextareaFocus = (e) => {
        textareaFocusEnd(e.target);
    };

    const handleMemorySaveEdits = (id) => {
        const { note, codeLink } = getPaperEdits(id);

        // Update metadata
        saveNote(id, note);
        saveCodeLink(id, codeLink);
        updatePaperTags(id, "memory-item-tags");
    };

    const handleCancelPaperEdit = (e) => {
        e.preventDefault();
        const id = eventId(e);
        const paper = state.papers[id];
        val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }), paper.note);
        setHTML(
            findEl({ paperId: id, memoryItemClass: "memory-item-tags" }),
            getTagsOptions(paper),
        );
        dispatch(findEl({ paperId: id, memoryItemClass: "memory-item-edit" }), "click");
    };

    const handleTogglePaperEdit = (e) => {
        e.preventDefault();
        // find elements
        const id = eventId(e);
        const container = findEl({ element: `memory-container--${id}` });
        const codeAndNote = findEl({ paperId: id, memoryItemClass: "code-and-note" });
        const editPaper = findEl({ paperId: id, memoryItemClass: "extended-item" });
        const tagList = findEl({ paperId: id, memoryItemClass: "tag-list" });
        const authors = findEl({ paperId: id, memoryItemClass: "memory-authors" });
        const tagEdit = findEl({ paperId: id, memoryItemClass: "edit-tags" });
        const actions = findEl({ paperId: id, memoryItemClass: "memory-item-actions" });
        const tagSelect2 = jQuery$1(findEl({ paperId: id, memoryItemClass: "memory-item-tags" }));

        if (hasClass(container, "expand-open")) {
            // The edit form is open
            removeClass(container, "expand-open");
            // Open display elements
            slideDown(codeAndNote, 150);
            slideDown(tagList, 150);
            slideDown(actions, 150);
            slideDown(authors, 150);
            // Close inputs
            slideUp(editPaper, 150);
            slideUp(tagEdit, 150);
            // destroy to enable options update in HTML
            setTimeout(() => {
                tagSelect2.select2("destroy");
            }, 500);
        } else {
            // The edit form is closed
            addClass(container, "expand-open");
            // Enable select2 tags input
            tagSelect2.select2({
                select2Options,
                width: "86%",
            });
            if (!hasClass(container, "has-monitoring")) {
                // only listen for changes once
                tagSelect2.on("change", monitorPaperEdits(id, false));
            }
            // monitorPaperEdits listener has been added
            container.classList.add("has-monitoring");
            // Close display elements
            slideUp(codeAndNote, 150);
            slideUp(tagList, 150);
            slideUp(actions, 150);
            slideUp(authors, 150);
            // Show form
            slideDown(editPaper, 150);
            slideDown(tagEdit, 150);
        }
    };

    const handleMemorySelectChange = (e) => {
        const sort = e.target.value;
        state.sortKey = sort;
        sortMemory();
        displayMemoryTable();
        setMemorySortArrow("down");
    };

    const handleMemorySortArrow = (e) => {
        if (querySelector("#memory-sort-arrow svg").id === "memory-sort-arrow-down") {
            setMemorySortArrow("up");
        } else {
            setMemorySortArrow("down");
        }
        reverseMemory();
        displayMemoryTable();
    };

    const handleFilterFavorites = () => {
        const showFavorites = !state.showFavorites;
        state.showFavorites = showFavorites;
        if (showFavorites) {
            addClass(
                findEl({ element: "filter-favorites" }).querySelector("svg"),
                "favorite",
            );
            sortMemory();
            state.papersList = state.papersList.filter((p) => p.favorite);
            displayMemoryTable();
            setMemorySortArrow("down");
            findEl({
                element: "memory-select",
            }).innerHTML += `<option value="favoriteDate">Last favoured</option>`;
            setMemorySearchPlaceholder();
        } else {
            removeClass(
                findEl({ element: "filter-favorites" }).querySelector("svg"),
                "favorite",
            );

            if (val("memory-select") === "favoriteDate") {
                val("memory-select", "lastOpenDate");
                state.sortKey = "lastOpenDate";
            }
            querySelector(`#memory-select option[value="favoriteDate"]`).remove();
            sortMemory();
            setMemorySortArrow("down");

            if (val("memory-search").trim()) {
                dispatch("memory-search", "keypress");
            } else {
                state.papersList = state.sortedPapers;
                displayMemoryTable();
            }
            setMemorySearchPlaceholder();
        }
    };

    const handleMemorySearchKeyPress = (allowEmptySearch) => (e) => {
        // read input, return if empty (after trim)
        const query = val("memory-search").trim();

        log(query);

        if (!query) {
            setTimeout(() => {
                style("memory-search-clear-icon", "visibility", "hidden");
            }, 0);
        }

        if (!query) {
            if (state.papersList.length !== state.sortedPapers.length) {
                // empty query but not all papers are displayed
                state.papersList = state.sortedPapers;
                displayMemoryTable();
                return;
            }
            if (!allowEmptySearch && e.key !== "Backspace") {
                return;
            }
        }
        style("memory-search-clear-icon", "visibility", "visible");
        if (query.startsWith("t:")) {
            // look into tags
            searchMemoryByTags(query);
        } else if (query.startsWith("c:")) {
            // look into code links
            searchMemoryByCode(query);
        } else if (query.startsWith("y:")) {
            // look into publication year
            searchMemoryByYear(query);
        } else {
            // look into title & authors & notes & conf
            searchMemory(query);
        }
        // display filtered papers
        toggleTagsCollapse(query.startsWith("t:"));
        displayMemoryTable();
    };

    const handleMemorySearchKeyUp = (e) => {
        // keyup because keypress does not listen to backspaces
        if (e.key == "Backspace") {
            var backspaceEvent = new Event("keypress");
            backspaceEvent.key = "Backspace";
            dispatch("memory-search", backspaceEvent);
        }
        if (e.target.id === "memory-search") {
            dispatch("memory-search", "keypress");
        }
    };

    const handleCancelModalClick = () => {
        hideId("delete-paper-modal");
    };

    const handleConfirmDeleteModalClick = async (e) => {
        const id = findEl({ element: "delete-paper-modal-hidden-id" }).innerHTML;
        const title = state.papers[id].title;
        const url = state.papers[id].pdfLink;
        await deletePaperInStorage(id, state.papers);
        displayMemoryTable();
        hideId("delete-paper-modal");
        info(`Successfully deleted "${title}" (${id}) from PaperMemory`);
        if (state.currentId === id) {
            await updatePopupPaperNoMemory(url);
        }
        setPlaceholder("memory-search", `Search ${state.papersList.length} entries ...`);
        addListener("memory-switch", "click", handleMemorySwitchClick);
    };

    const handleTagClick = (e) => {
        const tagEl = e.target;
        const query = tagEl.textContent;
        val("memory-search", `t: ${query}`);
        dispatch("memory-search", "keypress");
    };

    const handleClearSearch = (e) => {
        val("memory-search", "");
        dispatch("memory-search", "clear-search");
        style("memory-search-clear-icon", "visibility", "hidden");
    };

    const handleMemorySwitchClick = () => {
        state.memoryIsOpen ? closeMemory() : openMemory();
    };

    const handlePopupKeydown = async (e) => {
        let key = e.key;
        const isCtrlOrMeta = e.ctrlKey || e.metaKey;
        const isEnter = key === "Enter" && !isCtrlOrMeta;
        const isCmdEnter = key === "Enter" && isCtrlOrMeta;
        if (isCtrlOrMeta && !isCmdEnter) return;
        if (
            [
                "Backspace",
                "Enter",
                "Escape",
                "a",
                "e",
                "o",
                "c",
                "m",
                "b",
                "h",
                "p",
                "t",
                "d",
                "5",
                "f",
                "x",
                "s",
            ].indexOf(key) < 0
        ) {
            return;
        }

        if (state.modalIsOpen) {
            if (key === "Escape") {
                e.preventDefault();
                closePopupModal();
            }
            return;
        }

        // no modal is open

        if (state.prefsIsOpen) {
            if (key === "Escape") {
                // escape closes menu
                e.preventDefault();
                closeMenu();
            } else if (key === "Enter") {
                let el = querySelector("#menu-switch:focus");
                if (el) closeMenu();
            }
            return;
        }

        if (isCmdEnter) {
            if (eventId(e)) {
                const id = eventId(e);
                const div = findEl({ paperId: id, memoryItemClass: "extended-item" });
                const isVisible = div.style.display !== "none";
                const doneButton = div.querySelector(".done-note-form");
                if (doneButton && isVisible) {
                    doneButton.click();
                }
            }
        }

        // Menu is closed

        const inputIsFocused = queryAll(":focus").some((el) =>
            ["INPUT", "TEXTAREA"].includes(el.tagName),
        );
        if (inputIsFocused && key !== "Escape") {
            return;
        }

        // no input is focused

        if (key === "Escape" && state.tooltipIsOpen) {
            handleHideAllTitleTooltips(e);
            e.preventDefault();
            return;
        }

        // no tooltip is open

        if (!state.memoryIsOpen) {
            if (key === "a") {
                // a opens the arxiv memory
                state.papers && dispatch("memory-switch", "click");
            } else if (key === "Enter") {
                // enter on the arxiv memory button opens it
                const focused = querySelector(":focus");
                // if (!focused || !focused.length < 1) return;
                if (focused?.id === "memory-switch-open") {
                    return dispatch("memory-switch", "click");
                } else if (focused?.id === "menu-switch") {
                    dispatch("menu-switch", "click");
                    return dispatch("menu-switch", "blur");
                } else if (hasClass(focused, "memory-item-svg-div")) {
                    return dispatch(focused, "click");
                }
            } else if (key === "p") {
                if (!state.prefsIsOpen) {
                    return dispatch("menu-switch", "click");
                }
            }
        }

        // Memory is open

        if (isEnter) {
            // enable Enter on favorites and sort arrows
            const favoriteBtn = querySelector("#filter-favorites:focus");
            if (favoriteBtn) {
                return dispatch("filter-favorites", "click");
            }
            const arrowBtn = querySelector("#memory-sort-arrow:focus");
            if (arrowBtn) {
                return dispatch("memory-sort-arrow", "click");
            }
        }

        // Memory is open and Enter was not pressed on a button

        let id, paperItem;
        if (state.currentId && !state.memoryIsOpen) {
            id = state.currentId;
        } else {
            paperItem = querySelector(".memory-container:focus");
            if (key !== "Escape") {
                if (!paperItem) return;
                id = paperItem.id.split("--")[1];
            }
        }

        if (isEnter) {
            key = await getDefaultKeyboardAction();
        }

        const localFindEl = ({ id, memoryItemClass, paperItem }) => {
            if (paperItem) {
                // memory select
                return findEl({ paperId: id, memoryItemClass });
            } else {
                // popup select
                return findEl({ element: `popup-${memoryItemClass}--${id}` });
            }
        };

        if (key === "Backspace") {
            // delete
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-delete" }),
                "click",
            );
        } else if (key === "o") {
            // open paper
            const target =
                state.papers[id].source === "website"
                    ? localFindEl({ id, paperItem, memoryItemClass: "memory-website-url" })
                    : (state.prefs.checkEnterLocalPdf &&
                          localFindEl({
                              id,
                              paperItem,
                              memoryItemClass: "memory-item-openLocal",
                          })) ||
                      localFindEl({ id, paperItem, memoryItemClass: "memory-item-link" });
            dispatch(target, "click");
        } else if (key === "Escape") {
            // close paper edits or memory
            if (paperItem && hasClass(paperItem, "expand-open")) {
                e.preventDefault();
                handleTogglePaperEdit(e);
            } else {
                if (state.memoryIsOpen) {
                    e.preventDefault();
                    closeMemory();
                }
            }
        } else if (key === "e") {
            // edit item
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-edit" }),
                "click",
            );
        } else if (key === "c") {
            // copy link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-copy-link" }),
                "click",
            );
        } else if (key === "m") {
            // copy link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-md" }),
                "click",
            );
        } else if (key === "b") {
            // copy bibtex
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-bibtex" }),
                "click",
            );
        } else if (key === "5") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-ar5iv" }),
                "click",
            );
        } else if (key === "x") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-alphaxiv" }),
                "click",
            );
        } else if (key === "f") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-huggingface" }),
                "click",
            );
        } else if (key === "s") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-scirate" }),
                "click",
            );
        } else if (key === "h") {
            // copy hyperlink
            dispatch(
                localFindEl({
                    id,
                    paperItem,
                    memoryItemClass: "memory-item-copy-hyperlink",
                }),
                "click",
            );
        } else if (key === "t") {
            // copy title
            const title = state.papers[id].title;
            await copyAndConfirmMemoryItem({
                id,
                textToCopy: title,
                feedbackText: "Title copied!",
                context: Boolean(paperItem) ? "memory" : "popup",
            });
        } else if (key === "d") {
            // display id
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-display-id" }),
                "click",
            );
        }
    };

    const handlePrefsCheckChange = async (e) => {
        const key = e.target.id;
        const checked = findEl({ element: key }).checked;
        if (state && state.prefs) {
            state.prefs[key] = checked;
            setStorage("prefs", state.prefs, function () {
                log(`Settings saved for ${key} (${checked})`);
            });
        } else {
            const prefs = (await getStorage("prefs")) ?? {};
            prefs[key] = checked;
            setStorage("prefs", prefs, function () {
                log(`Settings saved for ${key} (${checked})`);
            });
        }
        if (checked && key === "checkNoAuto") {
            chrome.commands.getAll((commands) => {
                const { shortcut } = commands.find(
                    (command) => command.name === "manualParsing",
                );
                console.log("shortcut: ", shortcut);
                if (!shortcut) {
                    showPopupModal("manualParsing");
                }
            });
        }
    };

    const handlePopupSaveEdits = (id) => {
        const { note, codeLink, favorite } = getPaperEdits(id, true);
        updatePaperTags(id, `#popup-item-tags--${id}`);
        saveNote(id, note);
        saveCodeLink(id, codeLink);
        saveFavoriteItem(id, favorite);
    };

    const handlePopupDeletePaper = (id) => () => {
        showConfirmDeleteModal(id);
    };

    const showTitleTooltip = (id, isPopup) => {
        const div = isPopup
            ? findEl({ element: "popup-title-tooltip" })
            : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
        if (!div) return;
        hideAllTooltips();
        state.tooltipIsOpen = true;
        showId(div);
    };
    const hideTitleTooltip = (id, isPopup) => {
        const div = isPopup
            ? findEl({ element: "popup-title-tooltip" })
            : findEl({ paperId: id, memoryItemClass: ".title-tooltip" });
        if (!div) return;
        hideId(div);
        state.tooltipIsOpen = false;
    };

    const getHandleTitleTooltip = (func, delay, isPopup) => {
        return (e) => {
            const id = isPopup ? state.currentId : eventId(e);
            let timerId = state.timerIdMap.get(e.target) ?? 0;
            clearTimeout(timerId);
            timerId = setTimeout(() => func(id, isPopup), delay);
            state.timerIdMap.set(e.target, timerId);
        };
    };

    const handleExpandAuthors = (e) => {
        let id, authorsEl;
        if (e.target.parentElement?.id === "popup-authors") {
            id = state.currentId;
            authorsEl = findEl({ element: "popup-authors" });
        } else {
            id = eventId(e);
            authorsEl = findEl({ paperId: id, memoryItemClass: "memory-authors" });
        }
        setHTML(authorsEl, cutAuthors(state.papers[id].author, 100000));
    };

    const handleHideAllTitleTooltips = (e) => {
        if (!e.composedPath().some((el) => el.classList?.contains("title-tooltip"))) {
            hideAllTooltips();
        }
    };

    /**
     * Sets the form edit listeners on the 4 inputs: tags, code, note, favorite
     * @param {string} id Optional id (for the popup's paper)
     * @param {*} isPopup Is the function called from the popup?
     */
    const setFormChangeListener = (id, isPopup) => {
        let refTags, refNote, refCodeLink, refFavorite;
        if (isPopup) {
            refTags = `#popup-item-tags--${id.replace(".", "\\.")}`;
            refCodeLink = `popup-form-codeLink--${id}`;
            refNote = `popup-form-note-textarea--${id}`;
            refFavorite = `checkFavorite--${id}`;

            jQuery$1(refTags).on("change", delay(monitorPaperEdits(id, isPopup), 300)); // select2 required
            addListener(refCodeLink, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
            addListener(refNote, "keyup", delay(monitorPaperEdits(id, isPopup), 300));
            addListener(refFavorite, "change", delay(monitorPaperEdits(id, isPopup), 300));
        } else {
            // tags listeners is set in handleTogglePaperEdit
            refTags = ".memory-item-tags";
            refCodeLink = ".form-code-input";
            refNote = ".form-note-textarea";

            addEventToClass(
                refCodeLink,
                "keyup",
                delay(monitorPaperEdits(undefined, isPopup), 300),
            );
            addEventToClass(
                refNote,
                "keyup",
                delay(monitorPaperEdits(undefined, isPopup), 300),
            );
        }
    };

    const addEventsToMemoryItems = () => {
        // Add events
        // after a click on such a button, the focus returns to the
        // container to navigate with tab
        addEventToClass(".back-to-focus", "click", handleBackToFocus);
        // delete memory item
        addEventToClass(".memory-delete", "click", handleDeleteItem);
        // Open paper page
        addEventToClass(".memory-item-link", "click", handleOpenItemLink);
        // Open on Scirate
        addEventToClass(".memory-item-scirate", "click", handleOpenItemScirate);
        // Open on Alphaxiv
        addEventToClass(".memory-item-alphaxiv", "click", handleOpenItemAlphaxiv);
        // Open on Ar5iv
        addEventToClass(".memory-item-ar5iv", "click", handleOpenItemAr5iv);
        // Open on Huggingface Papers
        addEventToClass(".memory-item-huggingface", "click", handleOpenItemHuggingface);
        // Open code page
        addEventToClass(".memory-code-link", "click", handleOpenItemCodeLink);
        // Open Website URL
        addEventToClass(".memory-website-url", "click", handleOpenItemWebsiteURL);
        // Copy markdown link
        addEventToClass(".memory-item-md", "click", handleCopyMarkdownLink);
        // Copy bibtex citation
        addEventToClass(".memory-item-bibtex", "click", handleCopyBibtex);
        // Copy pdf link
        addEventToClass(".memory-item-copy-link", "click", handleCopyPDFLink);
        // Copy hyperlink
        addEventToClass(".memory-item-copy-hyperlink", "click", handleCopyHyperLink);
        // Open local file
        addEventToClass(".memory-item-openLocal", "click", handleMemoryOpenLocal);
        // Add to favorites
        addEventToClass(".memory-item-favorite", "click", handleAddItemToFavorites);
        // Cancel edits: bring previous values from state back
        addEventToClass(".done-note-form", "click", handleCancelPaperEdit);
        // When clicking on the edit button, either open or close the edit form
        addEventToClass(".memory-item-edit", "click", handleTogglePaperEdit);
        // When clicking on a tag, search for it
        addEventToClass(".memory-tag", "click", handleTagClick);
        // Monitor form changes
        setFormChangeListener(undefined, false);
        // show / remove title tooltips
        addEventToClass(
            ".memory-display-id",
            "click",
            getHandleTitleTooltip(showTitleTooltip, 0),
        );
        addEventToClass(
            ".memory-display-id",
            "mouseleave",
            getHandleTitleTooltip(hideTitleTooltip, 10000),
        );
        // expand authorlist on click
        addEventToClass(".expand-paper-authors", "click", handleExpandAuthors);

        // Put cursor at the end of the textarea's text on focus
        // (default puts the cursor at the beginning of the text)
        addEventToClass(".form-note-textarea", "focus", handleTextareaFocus);
    };

    const addEventsToMemoryControls = () => {
        // Calculate delay time based on number of papers
        let delayTime = 300;
        if (state.papersList.length < 20) {
            delayTime = 0;
        } else if (state.papersList.length < 100) {
            delayTime = 150;
        }

        addListener(
            "memory-search",
            "keypress",
            delay(handleMemorySearchKeyPress(), delayTime),
        );
        addListener("memory-search", "clear-search", handleMemorySearchKeyPress(true));
        addListener("memory-search", "keyup", handleMemorySearchKeyUp);
        addListener("delete-paper-modal-cancel-button", "click", handleCancelModalClick);
        addListener(
            "delete-paper-modal-confirm-button",
            "click",
            handleConfirmDeleteModalClick,
        );
        addListener("filter-favorites", "click", handleFilterFavorites);
        // listen to sorting feature change
        addListener("memory-select", "change", handleMemorySelectChange);
        // listen to sorting direction change
        addListener("memory-sort-arrow", "click", handleMemorySortArrow);
        addListener("memory-container", "scroll", displayOnScroll());
    };

    /**
     * Given a single paper or an url, find a matching file in the users'
     * downloads/PaperMemoryStore/ folder.
     * If a url is provided, it is first checked whether it is a known paper.
     * If not, the promise will resolve to null.
     * If it is, the promise will resolve to the file object as per the chrome.downloads.search API.
     * @param {object || string} paperOrUrl The paper to match to local files
     * @returns {Promise} Resolves a file object if exactly one is found, null otherwise
     */
    const findLocalFile = async (paperOrUrl) => {
        let paper;
        if (typeof paperOrUrl === "string") {
            // paperOrUrl is an url: find its paper (if any)
            let id;
            try {
                id = await parseIdFromUrl$1(paperOrUrl);
            } catch (error) {
                // no paper found
                return new Promise((resolve) => resolve(null));
            }
            if (state.papers.hasOwnProperty(id)) {
                paper = state.papers[id];
            } else {
                // The id found does not exist (parseIdFromUrl bug?)
                return new Promise((resolve) => resolve(null));
            }
        } else {
            // the paper is an actual paper object not a url
            paper = paperOrUrl;
        }
        // Return a Promise searching PaperMemoryStore/.*
        const storedFiles = await getStoredFiles();
        const matches = await matchPapersToFiles({ [paper.id]: paper }, storedFiles);
        const localFile = Object.values(matches);
        // resolve to a file object if exactly one is found otherwise to null
        return localFile.length === 1 ? localFile[0] : null;
    };

    /**
     * For each file in the files array, check if there exists a paper such that:
     *
     * 1. the file's finalUrl matches a paper's id as per parseIdFromUrl(candidate.finalUrl)
     * 2. if not, if there exists any paper such that the file's filename contains the paper's title
     *
     * [Note: title matching is done by first lowercasing then removing all non-alphanumeric characters]
     *
     * @param {object} papers An object mapping ids to papers, just like state.papers
     * @param {array} files An array of file objects as per the chrome.downloads.search API
     * @returns {object} An object mapping ids to files
     */
    const matchPapersToFiles = async (papers, files) => {
        // pre-compute paper's simplified titles
        const titles = Object.fromEntries(
            Object.values(papers).map((paper) => [paper.id, miniHash(paper.title)]),
        );
        // filter non-existing file handles
        files = files.filter(
            (f) =>
                f.exists &&
                f.state === "complete" &&
                !f.filename.toLowerCase().includes("readme.txt"),
        );
        // pre-compute file's simplified titles
        const fileTitles = Object.fromEntries(
            files.map((f) => [f.id, miniHash(f.filename)]),
        );

        // matching object to return
        let matches = {};

        for (const candidate of files) {
            let id;

            try {
                // find the file's id from its finalUrl
                id = await parseIdFromUrl$1(candidate.finalUrl);
                // if an id is found and it is in the papers requested for matching
                if (id && papers.hasOwnProperty(id)) matches[id] = candidate;
            } catch (error) {
                id = null;
            }
            if (!id) {
                // no id was found, try to match titles.
                // This is expensive so it should be rare.
                const candidateFileTitle = fileTitles[candidate.id];
                const match = Object.entries(titles).find(([id, title]) =>
                    candidateFileTitle.includes(title),
                );
                if (match) {
                    matches[match[0]] = candidate;
                }
            }
        }
        return matches;
    };

    /**
     * A function to detect whether the current local file is known in the
     * user's memory by ensuring there exists a paper whose title is in the filename.
     * The loose comparison is made against lowercase and letter-only strings.
     *
     * @param {string} url The current url (potentially: local file)
     * @returns {string || boolean} false if no paper is found, the paper's id if found
     */
    const isKnownLocalFile = (url) => {
        if (!url.startsWith("file://")) return false;
        if (!url.endsWith(".pdf")) return false;

        const filePath = decodeURIComponent(url).replace("file://", "");
        const storedPaths = Object.entries(state.files).filter(
            ([id, file]) => file.filename === filePath,
        );

        if (storedPaths.length > 0) {
            console.log("Found stored");
            return storedPaths[0][0];
        }

        const filename = decodeURIComponent(url.split("/").last())
            .toLowerCase()
            .replace(/\W/g, "");
        const titles = Object.values(cleanPapers(state.papers))
            .map((p) => {
                return { title: miniHash(p.title), id: p.id };
            })
            .filter((t) => filename.includes(t.title));

        if (titles.length === 0) return false;

        return titles[0].id;
    };

    // Handler functions available globally from handlers.js:
    // handlePrefsCheckChange, handleMemorySwitchClick, handlePopupKeydown, handlePopupDeletePaper

    /**
     * Close the menu's overlay: slide div up and update button svg
     */
    const closeMenu = () => {
        let classes = ["pm-tabler-icon", "menu-svg"];

        slideUp("menu-container", 300);
        setHTML("menu-switch", tablerSvg("settings", "menu-switch-svg", classes));
        dispatch("menu-switch", "blur");
        state.prefsIsOpen = false;
    };

    /**
     * Open the menu's overlay: slide div down and update button svg
     */
    const openMenu = () => {
        let classes = ["pm-tabler-icon", "menu-svg"];
        slideDown("menu-container", 300);
        dispatch("menu-switch", "blur");
        setHTML("menu-switch", tablerSvg("circle-x", "close-menu-btn", classes));
        state.prefsIsOpen = true;
        setHTML("pm-version", chrome.runtime.getManifest().version);
        findEl({ element: "menu-feedback-header" }).focus();
    };

    /**
     * Parses prefs options from the storage and adds events listeners for their change.
     * Notably, if a key in `prefsCheckNames` is missing from `prefs` it is set to true
     * @param {object} prefs The user preferences retrieved from storage
     * @param {string []} prefsCheckNames The array of all expected prefs options
     */
    const getAndTrackPopupMenuChecks = (prefs, prefsCheckNames) => {
        let setValues = {};
        for (const key of prefsCheckNames) {
            setValues[key] = prefs.hasOwnProperty(key)
                ? prefs[key]
                : prefsCheckDefaultFalse.indexOf(key) >= 0
                  ? false
                  : true;
            const el = findEl({ element: key });
            if (el) {
                el.checked = setValues[key];
            }
        }
        setStorage("prefs", setValues);

        for (const key of prefsCheckNames) {
            addListener(key, "change", handlePrefsCheckChange);
        }
    };

    /**
     * Opens a modal by its name by making it visible and setting global state
     * @param {string} name - The name/id of the modal to show
     */
    const showPopupModal = (name) => {
        state.modalIsOpen = true;
        queryAll(".popup-modal-content").forEach(hideId);
        showId(`modal-${name}-content`, "contents");
        style("popup-modal-wrapper", "display", "flex");
        [...document.getElementsByTagName("a")].forEach((el) => {
            addListener(el, "click", () => {
                chrome.tabs.create({ url: el.getAttribute("href") });
            });
        });
    };

    const fillUserGuideShortcuts = () => {
        const ul = findEl({ element: "user-guide-shortcuts-ul" });
        const children = findEl({ element: "menu-keyboard-shortcuts" }).children;
        for (const child of children) {
            const key = child.querySelector("code")?.textContent;
            if (key === "e" || key?.toLowerCase() === "backspace") {
                continue;
            }
            if (child.nodeName === "P") {
                child.style.fontSize = "0.9rem";
                child.innerText =
                    'The following keys are available when enabled in the "User Interface" section of the Menu:';
                child.style.marginBottom = "3px";
                child.style.marginTop = "3px";
                child.style.marginLeft = "-14px";
            }
            ul.innerHTML += child.outerHTML;
        }
    };

    /**
     * Creates click events on the popup
     */
    const setStandardPopupClicks = () => {
        queryAll(".link-in-new-tab").forEach((el) => {
            addListener(el, "click", () => {
                chrome.tabs.create({ url: el.getAttribute("href") });
            });
        });

        addListener("whats-new-container", "click", () => {
            chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
                const version = chrome.runtime.getManifest().version;
                if (typeof whatsnew === "undefined") {
                    whatsnew = {};
                }
                if (!whatsnew.hasOwnProperty(version)) {
                    hideId("whats-new-marker");
                }
                chrome.storage.local.set({
                    whatsnew: { ...whatsnew, [version]: true },
                });
                showPopupModal("whatsnew");
            });
        });
        addListener("keyboardShortcuts", "click", () => {
            // button on the home page when not on a known source
            showPopupModal("keyboard");
        });
        addListener("keyboardShortcutsMenu", "click", () => {
            // button in the menu
            showPopupModal("keyboard");
        });
        shouldWarn("pdf-title", (displayWarning) => {
            // keep as demo ; remove when another shouldWarn is added
            if (displayWarning) {
                showId("warning-button");
                addListener("warning-button", "click", async () => {
                    // button in the menu
                    showPopupModal("warning-pdf-title");
                    let warnings = (await getStorage("userWarnings")) ?? {};
                    warnings["pdf-title"] = true;
                    setStorage("userWarnings", warnings);
                    hideId("warning-button");
                });
            }
        });
        addListener("close-popup-modal", "click", closePopupModal);
        addListener("ar5iv-modal-cancel-button", "click", closePopupModal);

        // When the user clicks anywhere outside of the modal, close it
        addListener(window, "click", (event) => {
            if (event.target === findEl({ element: "popup-modal-wrapper" }))
                closePopupModal();
        });

        addListener("menu-switch", "click", () => {
            state.prefsIsOpen ? closeMenu() : openMenu();
        });

        addListener("memory-switch", "click", handleMemorySwitchClick);
    };

    /**
     * Displays the paper edit modal and setup validation
     * @param {Object} parsedPaper the parsed paper from addOrUpdatePaper
     * @param {string} url the url of the parsed paper
     */
    const editManualWebsite = (parsedPaper, url) => {
        // Open modal and form
        hideId("manual-website-validation");
        showPopupModal("manual-website");
        showId("website-trigger-btn");

        // Set inputs to parsed values
        const formKeys = ["author", "title", "year", "url", "note", "pdfLink"];
        for (const key of formKeys) {
            findEl({ element: `manual-website-${key}` }).value = parsedPaper[key] ?? "";
        }
        setHTML("manual-website-url", parsedPaper.codeLink);

        // Set the form's submit event / user confirmation
        addListener("manual-website-form", "submit", async (e) => {
            e.preventDefault();
            hideId("manual-website-validation");

            // Find input values
            const title = val("manual-website-title");
            let author = val("manual-website-author");
            const year = val("manual-website-year");
            const note = val("manual-website-note");
            const pdfLink = val("manual-website-pdfLink");

            if (author.includes(",")) {
                author = author
                    .split(",")
                    .map((a) => a.trim())
                    .join(" and ");
            }

            // check values are valid
            let updatedPaper = { ...parsedPaper, title, author, year, note, pdfLink };
            const citationKey = `${miniHash(
            author.split(" and ")[0].split(" ").last(),
        )}${year}${firstNonStopLowercase(title)}`;
            updatedPaper.bibtex = bibtexToString({
                ...bibtexToObject(updatedPaper.bibtex),
                author,
                year,
                title,
                citationKey,
                url: pdfLink,
            });
            const { warnings, paper } = validatePaper(updatedPaper);

            // Display warnings if any
            let validationHTML = "";
            for (const key of Object.keys(warnings)) {
                for (const warning of warnings[key]) {
                    validationHTML += `<li>${warning}</li>`;
                }
            }
            if (validationHTML.length > 0) {
                // Display warnings -> don't store paper yet
                validationHTML = `<ul>${validationHTML}</ul>`;
                setHTML("manual-website-validation", validationHTML);
                showId("manual-website-validation");
            } else {
                // No warnings -> store paper
                state.papers[paper.id] = paper;
                await setStorage("papers", state.papers);
                await pushToRemote();
                popupMain(url, await isPaper(url), true, null);
                hideId("website-trigger-btn");
                hideId("notArxiv");
                closePopupModal();
            }
            return false;
        });
    };

    /**
     * Main function when opening the window:
     * + Display the appropriate html depending on whether the user is currently looking at a paper
     * + Add event listeners (clicks and keyboard)
     * @param {str} url Currently focused and active tab's url.
     */
    const popupMain = async (url, is, manualTrigger = false, tab = null) => {
        console.log(navigator.userAgent);
        if (navigator.userAgent === "PuppeteerAgent") {
            info("Is puppet");
            // style(document.body, "min-width", "500px");
            // style(document.body, "max-width", "500px");
            // style(document.body, "width", "500px");
            // style("popup-modal-wrapper", "min-width", "500px");
            // style("popup-modal-wrapper", "max-width", "500px");
            // style("popup-modal-wrapper", "width", "500px");
        }

        addListener(document, "keydown", handlePopupKeydown);

        chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
            const version = chrome.runtime.getManifest().version;
            if (!whatsnew || !whatsnew.hasOwnProperty(version)) {
                showId("whats-new-marker");
            }
        });

        console.log("manualTrigger: ", manualTrigger);
        if (manualTrigger) {
            // manual trigger: do not re-create standard listeners
            // but update the current state and rebuild the Memory's HTML
            hideId("memory-switch");
            showId("memory-spinner");
            await initSyncAndState({ forceInit: true });
            hideId("memory-spinner");
            showId("memory-switch");
            makeMemoryHTML();
        } else {
            // Set click events (regardless of paper)
            setStandardPopupClicks();
        }
        const prefs = await getPrefs();
        // Set checkboxes
        getAndTrackPopupMenuChecks(prefs, prefsCheckNames);
        const defaultKeyboardAction = await getDefaultKeyboardAction();
        findEl({ element: "memory-item-default-action" }).value = defaultKeyboardAction;

        // Set options page link
        addListener("advanced-configuration", "click", () => {
            chrome.runtime.openOptionsPage();
        });
        // Set fullMemory page link
        addListener("full-memory", "click", () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL("fullMemory/fullMemory.html"),
            });
        });
        // Set BibMatcher page link
        addListener("bib-matcher", "click", () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL("bibMatcher/bibMatcher.html"),
            });
        });
        // Set default keyboard action
        addListener("memory-item-default-action", "change", (e) => {
            setDefaultKeyboardAction(e.target.value);
        });
        fillUserGuideShortcuts();

        // Set PDF title function
        // setAndHandleCustomPDFFunction(menu);

        // Display popup metadata
        if (Object.values(is).some((i) => i)) {
            setTimeout(() => {
                document.body.style.height = "auto";
                document.body.style.minHeight = "450px";
            }, 0);
            showId("isArxiv", "flex");

            const id = await parseIdFromUrl$1(url);
            state.currentId = id;

            if (!id || !state.papers.hasOwnProperty(id)) {
                // Unknown paper, probably deleted by the user
                log("Unknown id " + id);
                await updatePopupPaperNoMemory(url);
                if (prefs.checkDirectOpen && !prefs.checkNoAuto) {
                    dispatch("memory-switch", "click");
                }
                return;
            }

            const paper = state.papers[id];
            const eid = paper.id.replaceAll(".", "\\.");

            // -----------------------------
            // -----  Fill Paper Data  -----
            // -----------------------------
            setHTML(
                "popup-paper-title",
                paper.title.replaceAll("\n", "") +
                    '<div id="popup-title-tooltip" style="display: none;">',
            );
            setHTML("popup-authors", cutAuthors(paper.author, 200).replace(/({|})/g, ""));
            if (paper.codeLink) {
                setTextId("popup-code-link", paper.codeLink.replace(/^https?:\/\//, ""));
                showId("popup-code-link");
            }
            if (paper.source === "website") {
                setTextId("popup-website-url", paper.pdfLink.replace(/^https?:\/\//, ""));
                showId("popup-website-url");
            }

            // ----------------------------------
            // -----  Customize Popup html  -----
            // ----------------------------------
            log("Popup paper:", paper);
            setHTML("popup-memory-edit", getPopupEditFormHTML(paper));
            setHTML("popup-copy-icons", getPopupPaperIconsHTML(paper, url, is));
            setHTML("popup-title-tooltip", getPaperInfoTable(paper));
            findEl({ element: `checkFavorite--${id}` }).checked = paper.favorite;
            let extraDivWidth = 0;
            for (const p of [
                "checkScirate",
                "checkAlphaxiv",
                "checkAr5iv",
                "checkHuggingface",
            ]) {
                if (prefs[p]) extraDivWidth += 5;
            }
            style("popup-icons-container", "width", `${75 + extraDivWidth}%`);

            // --------------------------
            // -----  Paper  edits  -----
            // --------------------------
            jQuery$1(`#popup-item-tags--${eid}`).select2({
                ...select2Options,
                width: "87%",
            });
            addListener(`popup-form-note-textarea--${id}`, "focus", function () {
                var that = this;
                textareaFocusEnd(that);
            });
            setFormChangeListener(id, true);
            addListener("popup-delete-paper", "click", handlePopupDeletePaper(id));
            addEventToClass(
                ".popup-display-id",
                "click",
                getHandleTitleTooltip(showTitleTooltip, 0, true),
            );
            addEventToClass(
                ".popup-display-id",
                "mouseleave",
                getHandleTitleTooltip(hideTitleTooltip, 10000, true),
            );
            addEventToClass(".expand-paper-authors", "click", handleExpandAuthors);

            // ------------------------
            // -----  SVG clicks  -----
            // ------------------------
            addListener(`popup-memory-item-scirate--${id}`, "click", () => {
                const arxivId = arxivIdFromPaperID(paper.id);
                const scirateURL = `https://scirate.com/arxiv/${arxivId}`;
                chrome.tabs.update({ url: scirateURL });
                window.close();
            });
            addListener(`popup-memory-item-alphaxiv--${id}`, "click", () => {
                const arxivId = arxivIdFromPaperID(paper.id);
                const alphaxivURL = `https://alphaxiv.org/abs/${arxivId}`;
                chrome.tabs.update({ url: alphaxivURL });
                window.close();
            });
            addListener(`popup-memory-item-ar5iv--${id}`, "click", () => {
                const arxivId = arxivIdFromPaperID(paper.id);
                const paperYear = 2000 + parseInt(arxivId.split(".")[0].slice(0, 2), 10);
                const paperMonth = parseInt(arxivId.split(".")[0].slice(-2), 10);
                const currentYear = new Date().getFullYear();
                const currentMonth = new Date().getMonth() + 1;
                if (paperYear === currentYear && paperMonth === currentMonth) {
                    showPopupModal("ar5iv");
                    addListener("ar5iv-modal-ok-button", "click", () => {
                        const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
                        chrome.tabs.update({ url: ar5ivURL });
                        window.close();
                    });
                } else {
                    const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
                    chrome.tabs.update({ url: ar5ivURL });
                    window.close();
                }
            });
            addListener(`popup-memory-item-huggingface--${id}`, "click", () => {
                const arxivId = arxivIdFromPaperID(paper.id);
                const huggingfaceURL = `https://huggingface.co/papers/${arxivId}`;
                chrome.tabs.update({ url: huggingfaceURL });
                window.close();
            });
            addListener(`popup-memory-item-link--${id}`, "click", () => {
                const pdfURL = paperToPDF(paper);
                const absURL = paperToAbs(paper);
                chrome.tabs.update({ url: isPdfUrl$1(url) ? absURL : pdfURL });
                window.close();
            });
            addListener(`popup-code-link`, "click", async () => {
                const codeLink = findEl({ element: `popup-code-link` }).textContent;
                if (codeLink) {
                    await focusExistingOrCreateNewURLTab(codeLink);
                    window.close && window.close();
                }
            });
            addListener(`popup-website-url`, "click", async (e) => {
                const url = findEl({ element: `popup-website-url` }).textContent;
                if (url) {
                    await focusExistingOrCreateNewURLTab(url);
                    window.close && window.close();
                }
            });
            addListener(`popup-memory-item-copy-link--${id}`, "click", async () => {
                const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
                const text =
                    paper.source === "website"
                        ? "URL"
                        : prefs.checkPreferPdf
                          ? "PDF"
                          : "Abstract";
                await copyAndConfirmMemoryItem({
                    id,
                    textToCopy: link,
                    feedbackText: `${text} link copied!`,
                    context: "popup",
                });
            });
            addListener(`popup-memory-item-copy-hyperlink--${id}`, "click", async () => {
                const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
                const text =
                    paper.source === "website"
                        ? "URL"
                        : prefs.checkPreferPdf
                          ? "PDF"
                          : "Abstract";
                await copyAndConfirmMemoryItem({
                    id,
                    textToCopy: link,
                    feedbackText: `${text} hyperlink copied!`,
                    context: "popup",
                    hyperLinkTitle: paper.title,
                });
            });
            addListener(`popup-memory-item-md--${id}`, "click", async () => {
                const md = makeMdLink(paper, prefs);
                const text =
                    paper.source === "website"
                        ? "URL"
                        : prefs.checkPreferPdf
                          ? "PDF"
                          : "Abstract";
                await copyAndConfirmMemoryItem({
                    id,
                    textToCopy: md,
                    feedbackText: `Markdown ${text} copied!`,
                    context: "popup",
                });
            });
            addListener(`popup-memory-item-bibtex--${id}`, "click", async () => {
                let bibtex = state.papers[id].bibtex;
                let bibobj = bibtexToObject(bibtex);
                if (!bibobj.hasOwnProperty("url")) {
                    bibobj.url = paperToAbs(state.papers[id]);
                }
                if (!bibobj.hasOwnProperty("pdf")) {
                    bibobj.pdf = paperToPDF(state.papers[id]);
                }
                bibtex = bibtexToString(bibobj);
                await copyAndConfirmMemoryItem({
                    id,
                    textToCopy: bibtex,
                    feedbackText: "Bibtex citation copied!",
                    context: "popup",
                });
            });
            addListener(`popup-memory-item-openLocal--${id}`, "click", async () => {
                const file = (await findLocalFile(paper)) || state.files[paper.id];
                if (file) {
                    chrome.downloads.open(file.id);
                } else {
                    chrome.tabs.create({ url: paper.pdfLink });
                }
            });
            addListener(`popup-memory-item-download--${id}`, "click", async () => {
                downloadPaperPdf(paper);
            });
        } else {
            if (prefs.checkDirectOpen) {
                dispatch("memory-switch", "click");
            }
            // ------------------------------------
            // -----  Manual Website Parsing  -----
            // ------------------------------------
            const allowWebsiteParsing = tab && state.prefs.checkWebsiteParsing;
            if (allowWebsiteParsing) {
                // Add website parsing button, loader and error div
                const websiteParsingHtml = /* html */ `
                <div id="website-trigger-wrapper">
                    <div id="website-trigger-btn">Parse current website</div>
                    <div id="website-loader-container" class="pm-container" style='display: none;'>
                        <div class="sk-folding-cube">
                            <div class="sk-cube1 sk-cube"></div>
                            <div class="sk-cube2 sk-cube"></div>
                            <div class="sk-cube4 sk-cube"></div>
                            <div class="sk-cube3 sk-cube"></div>
                        </div>
                    </div>
                    <div id="website-parsing-error"></div>
                </div>`;
                setHTML("website-parsing-root", websiteParsingHtml);
                showId("website-parsing-root");
                addListener("website-trigger-btn", "click", async () => {
                    hideId("website-trigger-btn");
                    showId("website-loader-container");
                    hideId("website-parsing-error");
                    let update;
                    // auto parse Paper
                    try {
                        update = await addOrUpdatePaper({
                            tab,
                            url: tab.url,
                            store: false,
                        });
                    } catch (error) {
                        console.log("error: ", error);
                        hideId("website-loader-container");
                        showId("website-parsing-error");
                        setHTML(
                            "website-parsing-error",
                            `<h3>Error</h3><div>${error}</div>`,
                        );
                        setTimeout(() => {
                            hideId("website-loader-container");
                            hideId("website-parsing-error");
                            showId("website-trigger-btn");
                        }, 3000);
                    }
                    // check with user before storing
                    update?.paper && editManualWebsite(update.paper, url);
                });
            }
        }
    };

    // ------------------------------
    // -----  Script Execution  -----
    // ------------------------------
    (async () => {
        if (
            typeof window !== "undefined" &&
            (window.location.href.includes("popup") || window.location.href.includes("/action/")) &&
            !window.paperMemoryPopupInitialized
        ) {
            // This is a global variable to track whether the popup has been initialized.
            // In DEV mode, this would be run twice by the additional injection of debug.bundle.js
            window.paperMemoryPopupInitialized = true;
            const tab = await getCurrentUserTab();
            const url = tab.url;
            chrome.runtime.connect({ name: "PaperMemoryPopupSync" });
            document.addEventListener("click", handleHideAllTitleTooltips);

            let stateReadyPromise, remoteIsReadyPromise;
            remoteIsReadyPromise = new Promise((remoteReadyResolve) => {
                stateReadyPromise = new Promise((stateReadyResolve) => {
                    initSyncAndState({
                        stateIsReady: stateReadyResolve,
                        remoteIsReady: remoteReadyResolve,
                    }).catch((e) => {
                        console.error("initSyncAndState failed", e);
                        stateReadyResolve();
                        remoteReadyResolve();
                    });
                });
            });

            await stateReadyPromise;

            const is = await isPaper(url);
            const isKnown = Object.values(is).some((i) => i);

            if (!isKnown) showId("notArxiv");

            hideId("memory-spinner");
            showId("memory-switch");
            makeMemoryHTML();
            popupMain(url, is, false, tab);
            if (navigator.userAgent.search("Firefox") > -1) {
                hideId("overwrite-container");
            }

            await remoteIsReadyPromise;

            if (state.currentId && !state.papers[state.currentId]) {
                state.currentId = null;
                makeMemoryHTML();
                await updatePopupPaperNoMemory(url);
            }
        }
    })();

    // ES Module imports

    const toggleTagsCollapse = (on) => {
        if (on) {
            if (!!findEl({ element: "tags-list-container" })) return;
            const contents = /*html*/ `
            <ul id="all-tags-list">
                ${[...state.paperTags]
                    .map((t) => /*html*/ `<li class="memory-tag" >${t}</li>`)
                    .join("")}
            </ul>`;
            const details = /*html*/ `
            <div id="tags-list-container">
                <details id="tags-list-details" style="outline: none !important;">
                    <summary style="font-size: 0.85rem; color: #5f5f5f;">Tags list</summary>
                    ${contents}
                </details>
            </div>`;
            findEl({ element: "memory-filters" }).insertAdjacentHTML("afterend", details);
        } else {
            findEl({ element: "tags-list-container" })?.remove();
        }
    };
    /**
     * Updates all the papers' options HTML list
     */
    const updateAllMemoryPaperTagOptions = () => {
        for (const id in state.papers) {
            if (state.papers.hasOwnProperty(id) && id !== "__dataVersion") {
                const paper = state.papers[id];
                setHTML(`memory-item-tags--${id}`, getTagsOptions(paper));
            }
        }
    };

    const sampleAsciiArt = async () => {
        try {
            const artPath = chrome.runtime.getURL("data/art.json");
            const art = await fetch(artPath).then((res) => res.json());
            const nArts = Object.keys(art).length;
            const u = Math.floor(Math.random() * nArts);
            const [animal, ascii] = Object.entries(art)[u];
            return { animal, ascii };
        } catch (e) {
            console.error("Error sampling ascii art:", e);
            return { animal: "cat", ascii: " /\\_/\\\n( o.o )\n > ^ <" };
        }
    };

    const updatePopupPaperNoMemory = async (url) => {
        const { animal, ascii } = await sampleAsciiArt();
        let noPaperHtml = /* html */ `
        <div class="no-paper-div">
            <h3>This paper is not in your Memory&nbsp;
            <span id="no-paper-why-span">
                <button class="code-font" id="no-paper-why-code">?</button>
            </span>
            </h3>
            <div>
                <div>Here's a ${animal} for your trouble</div><br>
                <div id="ascii-art-div"><div style="text-align:">${ascii}</div></div>
            </div>
        </div>
    `;

        const isFirefox = navigator.userAgent.search("Firefox") > -1;
        const allowManualParsing = isFirefox || state.prefs.checkNoAuto;
        let ff_warning = "";
        if (isFirefox) {
            ff_warning = /* html */ `
            <div id="ff-warning">
                Firefox does not support content scripts on PDFs.<br/>
                Use the button below to parse this paper.<br/>
            </div>
        `;
        }
        if (allowManualParsing) {
            noPaperHtml += /* html */ `
            <div id="manual-trigger-wrapper">
                ${ff_warning}
                <div id="manual-trigger-btn">Try manual trigger</div>
                <div id="manual-loader-container" class="pm-container" style='display: none;'>
                    <div class="sk-folding-cube">
                        <div class="sk-cube1 sk-cube"></div>
                        <div class="sk-cube2 sk-cube"></div>
                        <div class="sk-cube4 sk-cube"></div>
                        <div class="sk-cube3 sk-cube"></div>
                    </div>
                </div>
                <div id="manual-parsing-error"></div>
            </div>
        `;
        }

        const previousIsArxiv = findEl({ element: "isArxiv" }).innerHTML;
        setHTML("isArxiv", noPaperHtml);

        addListener("no-paper-why-code", "click", () => {
            showPopupModal("noPaper");
        });

        if (allowManualParsing) {
            addListener("manual-trigger-btn", "click", async () => {
                showId("manual-loader-container");
                try {
                    const is = await isPaper(url);
                    let paper;
                    const update = await addOrUpdatePaper({ url, is });
                    if (update) {
                        paper = update.paper;
                    } else {
                        return;
                    }
                    if (paper) {
                        hideId("manual-loader-container");
                        setHTML("isArxiv", previousIsArxiv);
                        popupMain(url, is, true);
                    }
                } catch (error) {
                    hideId("manual-loader-container");
                    const errorText =
                        "There was an issue parsing this paper. <br/> " +
                        "Raise an issue on Github if you think it is a bug.<br/>" +
                        "Attempted url: " +
                        url;
                    setHTML("manual-parsing-error", `<strong>${errorText}</strong>`);
                    warn("Manual Parsing Error:", error);
                }
            });
        }
    };

    /**
     * Copy a text to the clipboard and display a feedback text
     * @param {string} id Id of the paper to display the feedback in the memory item
     * @param {string} textToCopy Text to copy to the clipboard
     * @param {string} feedbackText Text to display as feedback
     * @param {string} context The context in which the action took place: "popup" or "memory" (or "content_script")
     * @param {string} hyperLinkTitle The title of the hyperlink to copy to the clipboard
     */
    const copyAndConfirmMemoryItem = async ({
        id,
        textToCopy,
        feedbackText,
        context = "popup",
        hyperLinkTitle = null,
    }) => {
        if (!hyperLinkTitle) {
            copyTextToClipboard(textToCopy);
        } else {
            await copyHyperLinkToClipboard(textToCopy, hyperLinkTitle);
        }
        const element =
            context === "popup"
                ? findEl({ element: "popup-feedback-copied" })
                : context === "memory"
                  ? findEl({ paperId: id, memoryItemClass: "memory-item-feedback" })
                  : null;
        if (!element) return;
        element.innerText = feedbackText;
        fadeIn(element);
        setTimeout(() => {
            fadeOut(element);
        }, 2000);
    };

    /**
     * Looks for an open tab with the code of the paper. Matches are not exact:
     * a tab url needs only to include the targetURL to be valid. If no existing
     * tab matches the targetURL, a new tab is created
     * @param {string} targetURL URL of the page to open
     */
    const focusExistingOrCreateNewURLTab = (targetURL) =>
        new Promise((resolve) => {
            targetURL = targetURL.replace("http://", "https://");
            if (!targetURL.startsWith("https://")) {
                targetURL = "https://" + targetURL;
            }
            if (!chrome.tabs) {
                if (window?.location?.href) {
                    window.location.href = targetURL;
                }
                return resolve();
            }
            const { origin } = new URL(targetURL);
            chrome.tabs.query({ url: `${origin}/*` }, (tabs) => {
                for (const tab of tabs) {
                    if (tab.url.includes(targetURL)) {
                        const tabUpdateProperties = { active: true };
                        const windowUpdateProperties = { focused: true };
                        chrome.windows.getCurrent((w) => {
                            if (w.id !== tab.windowId) {
                                chrome.windows.update(
                                    tab.windowId,
                                    windowUpdateProperties,
                                    () => {
                                        chrome.tabs.update(tab.id, tabUpdateProperties);
                                        resolve();
                                    },
                                );
                            } else {
                                chrome.tabs.update(tab.id, tabUpdateProperties);
                                resolve();
                            }
                        });
                        resolve();
                        return;
                    }
                }
                chrome.tabs.create({ url: targetURL });
                resolve();
            });
            resolve();
        });

    /**
     * Trim then save in chrome.storage.local the content of the note for a paper.
     * Also updates this paper's memory table display and the main popup's textarea
     * (if the paper being edited from the memory is actually the one currently opened
     * and which is therefore being displayed by the popup)
     * @param {string} id The id of the paper whose note is being saved
     * @param {string} note The content of the note
     */
    const saveNote = (id, note) => {
        state.papers[id].note = note;
        chrome.storage.local.set({ papers: state.papers }, () => {
            setHTML(
                findEl({ paperId: id, memoryItemClass: "memory-note-div" }),
                note
                    ? /*html*/ ` <div class="memory-note-div memory-item-faded">
                      <span class="note-content-header">Note:</span>
                      <span class="note-content">${note}</span>
                  </div>`
                    : /*html*/ `<div class="memory-note-div memory-item-faded"></div>`,
            );
            const textarea = findEl({ element: `popup-form-note-textarea--${id}` });
            val(textarea, note);
            val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }), note);
        });
    };

    /**
     * Trim then save in chrome.storage.local the code link for a paper.
     * Also updates this paper's memory table display and the main popup's code input
     * (if the paper being edited from the memory is actually the one currently opened
     * and which is therefore being displayed by the popup)
     * @param {string} id The id of the paper whose code is being saved
     * @param {string} codeLink The link to the paper's code
     */
    const saveCodeLink = (id, codeLink) => {
        codeLink = codeLink.trim();
        state.papers[id].codeLink = codeLink;
        chrome.storage.local.set({ papers: state.papers }, () => {
            const displayLink = codeLink.replace(/^https?:\/\//, "");
            setHTML(
                findEl({ paperId: id, memoryItemClass: "memory-code-link" }),
                displayLink,
            );
            setHTML(`popup-code-link`, displayLink);
            val(findEl({ paperId: id, memoryItemClass: "form-code-input" }), codeLink);
            codeLink ? showId("popup-code-link") : hideId("popup-code-link");
            const codeInput = findEl({ element: `popup-form-codeLink--${id}` });
            val(codeInput, codeLink);
        });
    };

    const saveFavoriteItem = (id, favorite) => {
        state.papers[id].favorite = favorite;
        state.papers[id].favoriteDate = new Date().toJSON();
        chrome.storage.local.set({ papers: state.papers }, () => {
            if (favorite) {
                addClass(`memory-container--${id}`, "favorite");
                addClass(
                    findEl({
                        paperId: id,
                        memoryItemClass: "memory-item-favorite",
                    }).querySelector("svg"),
                    "favorite",
                );
            } else {
                removeClass(`memory-container--${id}`, "favorite");
                removeClass(
                    findEl({
                        paperId: id,
                        memoryItemClass: "memory-item-favorite",
                    }).querySelector("svg"),
                    "favorite",
                );
            }

            if (state.sortKey === "favoriteDate") {
                if (!favorite) {
                    sortMemory();
                    displayMemoryTable();
                }
                const n = state.sortedPapers.filter((p) => p.favorite).length;
                const memSearch = findEl({ element: "memory-search" });
                if (memSearch) {
                    setPlaceholder(memSearch, `Search ${n} entries`);
                }
            }

            let checkFavorite = findEl({ element: `checkFavorite--${id}` });
            if (checkFavorite) {
                checkFavorite.checked = favorite;
            }
        });
    };

    /**
     * Function to change the html content of #memory-sort-arrow to an up or down arrow
     * @param {string} direction up/down string to change the arrow's direction
     */
    const setMemorySortArrow = (direction) => {
        let arrow;
        if (direction === "up") {
            arrow = /*html*/ `<svg
            viewBox="0 0 24 24"
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-up"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="9" x2="12" y2="5" />
            <line x1="8" y1="9" x2="12" y2="5" />
        </svg>`;
        } else {
            arrow = /*html*/ `<svg
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-down"
            viewBox="0 0 24 24"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="15" x2="12" y2="19" />
            <line x1="8" y1="15" x2="12" y2="19" />
        </svg>`;
        }

        setHTML("memory-sort-arrow", arrow);
    };

    /**
     * Reverses the state's 2 ordered lists: sortedPapers and papersList
     */
    const reverseMemory = () => {
        state.sortedPapers.reverse();
        state.papersList.reverse();
    };

    /**
     * Function to filter the sortedPapers list into papersList, keeping papers whose
     * title, author or note includes all the words in the query.
     * e.g.: "cli ga" will look for all papers for which either their note, authors or title
     *        contains both the strings "cli" and "ga".
     * @param {string} letters The user's string query.
     */
    const searchMemory = (letters) => {
        const words = letters.toLowerCase().split(" ");
        let papersList = [];
        const contentKeys = ["title", "author", "note", "tags", "id", "venue"];
        for (const paper of state.sortedPapers) {
            const contents = contentKeys.map((key) => {
                if (Array.isArray(paper[key])) {
                    return paper[key].join(" ").toLowerCase();
                } else if (typeof paper[key] === "string") {
                    return paper[key].toLowerCase();
                }
                logError(`searchMemory: non-string & non-array content for key ${key}`);
                log(paper);
                return "";
            });

            if (words.every((w) => contents.some((c) => c.includes(w)))) {
                if (!state.showFavorites || paper.favorite) {
                    papersList.push(paper);
                }
            }
        }
        state.papersList = papersList;
    };

    /**
     * Filters the sortedPapers into papersList, keeping papers published in a list of years
     * e.g.: "y:21, 22" or "y: <2012"
     * @param {string} letters The string representing the tags query, deleting "t:" and splitting on " "
     */
    const searchMemoryByYear = (letters) => {
        const condition = letters.includes("<")
            ? "smaller"
            : letters.includes(">")
              ? "greater"
              : "";
        const searchYears = letters
            .replace("y:", "")
            .replace(/(<|>)/g, "")
            .toLowerCase()
            .replaceAll(",", " ")
            .split(" ")
            .filter((y) => y.length > 0)
            .map((y) => (y.length === 4 ? y : "20" + y))
            .map((y) => parseInt(y, 10));
        let papersList = [];
        let compare = (y, py) => y === py;
        if (condition === "smaller") {
            compare = (y, py) => y > py;
        } else if (condition === "greater") {
            compare = (y, py) => y < py;
        }
        for (const paper of state.sortedPapers) {
            const paperYear = parseInt(paper.year, 10);
            if (searchYears.some((year) => compare(year, paperYear))) {
                papersList.push(paper);
            }
        }
        state.papersList = papersList;
    };
    /**
     * Filters the sortedPapers into papersList, keeping papers whose tags match the query: all
     * papers whose tags contain all words in the query. Triggered when a query starts with "t: ".
     * e.g.: "cli ga" will look for all papers which have at least 1 tag containing the substring "cli"
     *        AND at least 1 tag containing the substring "ga"
     * @param {string} letters The string representing the tags query, deleting "t:" and splitting on " "
     */
    const searchMemoryByTags = (letters) => {
        const tags = letters.replace("t:", "").toLowerCase().split(" ");
        let papersList = [];
        for (const paper of state.sortedPapers) {
            const paperTags = paper.tags.map((t) => t.toLowerCase());
            if (tags.every((t) => paperTags.some((pt) => pt.indexOf(t) >= 0))) {
                if (!state.showFavorites || paper.favorite) {
                    papersList.push(paper);
                }
            }
        }
        state.papersList = papersList;
    };

    /**
     * Filters the sortedPapers into papersList, keeping papers whose code matches the query. Similar
     * to searchMemory but looks into the codeLink attribute. Triggered when a query starts with "c: ".
     * @param {string} letters The string representing the code query, deleting "c:" and splitting on " "
     */
    const searchMemoryByCode = (letters) => {
        const words = letters.replace("c:", "").toLowerCase().split(" ");
        let papersList = [];
        for (const paper of state.sortedPapers) {
            let paperCode = paper.codeLink || "";
            paperCode = paperCode.toLowerCase();
            if (words.every((w) => paperCode.includes(w))) {
                if (!state.showFavorites || paper.favorite) {
                    papersList.push(paper);
                }
            }
        }
        state.papersList = papersList;
    };

    /**
     * Updates a paper's tag HTML list from the object's tags array.
     * @param {string} id The paper's id
     */
    const updatePaperTagsHTML = (id) => {
        setHTML(
            findEl({ paperId: id, memoryItemClass: "tag-list" }),
            state.papers[id].tags
                .map((t) => `<span class="memory-tag">${t}</span>`)
                .join(""),
        );
    };

    /**
     * Update the select2 input for tags, with options from the paper's tags array attribute,
     * using getTagsOptions.
     * @param {string} id The paper's id
     */
    const updateTagOptions = (id) => {
        updateAllMemoryPaperTagOptions();
        // update popup tags if the current paper is being edited in the memory
        const tagOptions = getTagsOptions(state.papers[id]);
        setHTML(`popup-item-tags--${id}`, tagOptions);
    };

    /**
     * Update a paper's tags array attribute from the user's selection in a select2 multi-select input.
     * @param {string} id The paper's id
     * @param {string} elementId The paper's html element selector (either an id for the popup main tags, or a class for a memory item)
     */
    const updatePaperTags = (id, elementId) => {
        let ref;
        // elementId may be an ID selector (in the main popup)
        // or a class selector (in the memory)
        if (elementId.startsWith("#")) {
            ref = findEl({ element: elementId.replace("#", "") });
        } else {
            ref = findEl({ paperId: id, memoryItemClass: elementId });
        }
        const tags = parseTags(ref);
        let updated = false;
        if (!arraysIdentical(state.papers[id].tags, tags)) updated = true;
        state.papers[id].tags = tags;

        // If there's a change: update the global set of tags:
        // we need to add or remove tags to the global suggestions array
        // for select2
        if (updated) {
            chrome.storage.local.set({ papers: state.papers }, () => {
                // update the global set of tags
                makeTags();
                // update the selected tags in the select2 input for this paper
                updateTagOptions(id);
                // update the displayed tags for this paper
                updatePaperTagsHTML(id);
                const tagEls = queryAll(
                    ".memory-tag",
                    findEl({ paperId: id, memoryItemClass: "tag-list" }),
                );
                for (const el of tagEls) {
                    addListener(el, "click", handleTagClick);
                }
            });
        }
    };

    /**
     * Iterates over all papers in the papersList (sorted and filtered),
     * creates each paper's HTML template and appends it to #memory-table.
     * Also creates the relevant events.
     */
    const displayMemoryTable = (pagination = 0) => {
        const start = Date.now();

        // Clear existing items
        var memoryTable = findEl({ element: "memory-table" });
        if (pagination === 0) {
            setHTML(memoryTable, "");
            state.currentMemoryPagination = 0;
        }

        // Add relevant sorted papers (papersList may be smaller than sortedPapers
        // depending on the search query)
        let table = [];
        for (const paper of state.papersList.slice(
            pagination * state.memoryItemsPerPage,
            (pagination + 1) * state.memoryItemsPerPage,
        )) {
            try {
                table.push(getMemoryItemHTML(paper));
            } catch (error) {
                log("displayMemoryTable error:");
                log(error);
                log(paper);
            }
        }
        // https://stackoverflow.com/questions/18393981/append-vs-html-vs-innerhtml-performance
        if (pagination === 0) {
            setHTML(memoryTable, table.join(""));
        } else {
            memoryTable.insertAdjacentHTML("beforeend", table.join(""));
        }

        addEventsToMemoryItems();
        // Save fields on edits save (submit)
        const end = Date.now();

        info("Display duration (s): " + (end - start) / 1e3);
    };

    const setMemorySearchPlaceholder = () =>
        setPlaceholder("memory-search", `Search ${state.papersList.length} entries ...`);

    /**
     * Main function called after the user clicks on the PaperMemory button
     * or presses `a`.
     * + closes the menu if it is open (should not be)
     */
    const makeMemoryHTML = async () => {
        // Fill-in input placeholder
        setMemorySearchPlaceholder();
        displayMemoryTable();

        // search keypress events.
        // deprecated fix: https://stackoverflow.com/questions/49278648/alternative-for-events-deprecated-keyboardevent-which-property
        addEventsToMemoryControls();
    };

    const openMemory = () => {
        state.prefsIsOpen && closeMenu();
        state.memoryIsOpen = true;
        // hide menu button
        hideId("memory-switch-open");
        showId("memory-switch-close");
        hideId("menu-switch");
        dispatch("memory-switch", "blur");
        slideDown("memory-container", 200, () => {
            setTimeout(() => {
                dispatch("memory-search", "focus");
            }, 100);
        });
        setTimeout(() => {
            addListener("memory-search-clear-icon", "click", handleClearSearch);
            // set default sort to lastOpenDate
            val("memory-select", "lastOpenDate");
            // set default sort direction arrow down
            setMemorySortArrow("down");
        }, 200);
    };

    /**
     * Closes the memory overlay with slideUp
     */
    const closeMemory = () => {
        dispatch("memory-switch", "blur");
        hideId("memory-switch-close");
        showId("memory-switch-open");
        slideUp("memory-container", 200, () => {
            val("memory-search", "");
            dispatch("memory-search", "clear-search");
            state.memoryIsOpen = false;
            if (state.showFavorites) {
                dispatch("filter-favorites", "click");
            }
            showId("menu-switch", "flex");
        });
    };

    // ES Module imports

    /**
     * Writes the current `papers` Memory to the default sync Gist file.
     * @returns {Promise}
     */
    const pushToRemote = async () =>
        await sendMessageToBackground({ type: "writeSync" });

    /**
     * Pulls the current `papers` from the default sync Gist file.
     * If remote papers are found, the local `papers` will be updated. and set to storage.
     * @param {object} papers - The current `papers` in the user memory
     * @param {boolean} isContentScript - Whether the function is called from a content script
     * @returns {Promise<object>} - The remote `papers` from the Gist file
     */
    const pullFromRemote = async (papers, isContentScript) => {
        const start = Date.now();
        const remotePapers = await sendMessageToBackground({ type: "pullSync" });
        consoleHeader(`PaperMemory Pull ${String.fromCodePoint("0x1F504")}`);
        log("Remote Papers pulled: ", remotePapers);
        if (remotePapers) {
            await initState({
                isContentScript,
                papers: remotePapers ?? papers,
                print: false,
            });
            const time = (Date.now() - start) / 1e3;
            info(`Successfully pulled from Github (${time}s).`);
            await setStorage("papers", state.papers);
        }
        console.groupEnd();
        return remotePapers;
    };

    /**
     * Whether the user has enabled sync.
     * @returns {Promise<boolean>}
     */
    const shouldSync = async () => !!(await getStorage("syncState"));

    /**
     * Initialize the sync state.
     * @param {object} options - Options object
     * @param {object} options.papers - The current `papers` in the user memory
     * @param {boolean} options.isContentScript - Whether the function is called from a content script
     * @param {boolean} options.forceInit - Whether to force the initialization
     * @param {function} options.stateIsReady - Callback function to be called when the state is ready
     * @param {function} options.remoteIsReady - Callback function to be called when the remote is ready
     * @returns {Promise}
     */
    const initSyncAndState = async ({
        papers = null,
        isContentScript = false,
        forceInit = false,
        stateIsReady = () => {},
        remoteIsReady = () => {},
    } = {}) => {
        if (!state.dataVersion || forceInit) {
            await initState({ papers, isContentScript });
        }
        stateIsReady();

        if (!(await shouldSync())) {
            remoteIsReady();
            return;
        }

        !isContentScript && startSyncLoader();
        // await sendMessageToBackground({ type: "restartGist" });
        const remotePapers = await pullFromRemote(papers, isContentScript);
        if (remotePapers) {
            if (!isContentScript) {
                const n = state.sortedPapers.length;
                setPlaceholder("memory-search", `Search ${n} entries...`);
                if (
                    !state.memoryIsOpen &&
                    typeof window !== "undefined" &&
                    !window.location.href.includes("options.html")
                ) {
                    await makeMemoryHTML();
                }
                successSyncLoader();
            }
        } else {
            !isContentScript && errorSyncLoader();
        }

        remoteIsReady();
    };

    /**
     * Show the sync loader in the popup.
     * @returns {Promise}
     */
    const startSyncLoader = async () => {
        showId("sync-popup-feedback");
        hideId("sync-popup-error");
        hideId("sync-popup-synced");
        showId("sync-popup-syncing", "flex");
    };
    /**
     * Hide the sync loader in the popup and display the success message.
     * @returns {Promise}
     */
    const successSyncLoader = async () => {
        showId("sync-popup-feedback");
        hideId("sync-popup-syncing");
        hideId("sync-popup-error");
        showId("sync-popup-synced");
        setTimeout(() => {
            hideId("sync-popup-feedback");
        }, 2000);
    };
    /**
     * Hide the sync loader in the popup and display the error message.
     * @returns {Promise}
     */
    const errorSyncLoader = async () => {
        showId("sync-popup-feedback");
        hideId("sync-popup-syncing");
        hideId("sync-popup-synced");
        showId("sync-popup-error");
        setTimeout(() => {
            hideId("sync-popup-feedback");
        }, 2000);
    };

    const sleep = async (duration) =>
        new Promise((resolve) => setTimeout(resolve, duration));

    // ES Module imports

    /**
     * Is this url associated with a known paper source?
     * For each known paper source in config.js/knownPaperPages, this function
     * checks whether the url includes one of the listed paths.
     * Also checks for local files in the PaperMemoryStore
     *
     * @param {string} url the url to check
     * @param {boolean} noStored if true, don't check for local files
     * @returns {object} boolean map from sources.
     */
    const isPaper = async (url, noStored = false) => {
        let is = {};
        if (!url) return is;
        for (const source in knownPaperPages) {
            const patterns = knownPaperPages[source].patterns;
            // default source status: false
            is[source] = false;
            for (const pattern of patterns) {
                if (typeof pattern === "string") {
                    if (url.includes(pattern)) {
                        // known pattern: store as true
                        is[source] = true;
                    }
                } else if (typeof pattern === "function") {
                    is[source] = pattern(url) ?? false;
                }
                if (is[source]) break;
            }
        }
        // is the url a local file in the memory?
        is.localFile = isKnownLocalFile(url) ?? false;
        is.stored = noStored ? false : (await findLocalFile(url)) ?? false;
        is.parsedWebsite = state.papers[`Website_${urlToWebsiteId(url)}`] ?? false;
        return is;
    };

    const findFuzzyPaperMatch = (hashes, paper) => {
        const paperHash = miniHash(paper.title);
        if (hashes.hasOwnProperty(paperHash)) {
            const matches = hashes[paperHash];
            const nonPreprint = matches.find(
                (m) => !preprintSources.some((s) => m.toLowerCase().startsWith(s))
            );
            if (nonPreprint) {
                return nonPreprint;
            }
            return matches[0];
        }
        return null;
    };

    /**
     * Get the url to the paper's abstract / display page.
     * In other words: not not the pdf's.
     * eg: https://arxiv.org/abs/1901.01234 (not https://arxiv.org/pdf/1901.01234.pdf)
     *
     * @param {object} paper the paper whose abstract url we're looking for
     * @returns {string} the url to the paper's abstract
     */
    const paperToAbs = (paper) => {
        var journal, type, doi, pii;
        const pdf = paper.pdfLink;
        var abs = "";
        switch (paper.source) {
            case "arxiv":
                abs = pdf.replace("/pdf/", "/abs/").replace(".pdf", "");
                break;

            case "neurips":
                abs = pdf
                    .replace("/file/", "/hash/")
                    .replace("-Paper.pdf", "-Abstract.html");
                break;

            case "cvf":
                abs = pdf.replace("/papers/", "/html/").replace(".pdf", ".html");
                break;

            case "openreview":
                abs = pdf.replace("/pdf?", "/forum?");
                break;

            case "biorxiv":
                abs = pdf.replace(".full.pdf", "");
                break;

            case "pmlr":
                abs = pdf.split("/").slice(0, -1).join("/") + ".html";
                break;

            case "acl":
                abs = pdf.replace(".pdf", "");
                break;
            case "pnas":
                abs = pdf.replace(".full.pdf", "").replace("/doi/pdf/", "/doi/full/");
                break;
            case "nature":
                abs = pdf.replace(".pdf", "");
                break;
            case "acs":
                abs = pdf
                    .replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/")
                    .split("?")[0];
                break;
            case "iop":
                abs = pdf.split("#")[0].replace(/\/pdf$/, "");
                break;
            case "jmlr":
                abs =
                    pdf
                        .split("/")
                        .slice(0, -1)
                        .join("/")
                        .replace("/papers/volume", "/papers/v") + ".html";
                break;
            case "pmc":
                const pmcid = pdf.match(/PMC\d+/)[0];
                abs = pdf.split(pmcid)[0] + pmcid;
                break;

            case "ijcai":
                const procId = pdf
                    .replace(".pdf", "")
                    .split("/")
                    .last()
                    .match(/[1-9]\d*/);
                const year = pdf.match(/proceedings\/\d+/gi)[0].split("/")[1];
                abs = `https://www.ijcai.org/proceedings/${year}/${procId}`;
                break;
            case "acm":
                abs = pdf.replace("/doi/pdf/", "/doi/");
                break;

            case "ieee":
                abs = `https://ieeexplore.ieee.org/document/${paper.key}`;
                break;

            case "springer":
                abs = paper.extra.url;
                break;

            case "aps":
                const urlParts = parseUrl(pdf).pathname.split("/").slice(1, 3);
                journal = urlParts[0];
                type = urlParts[1];
                abs = pdf.replace(`/${journal}/${type}/`, `/${journal}/abstract/`);
                break;

            case "wiley":
                abs = pdf.replace(/\/doi\/e?pdf\//g, `/doi/abs/`);
                break;

            case "sciencedirect":
                pii = pdf.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
                abs = `https://www.sciencedirect.com/science/article/pii/${pii}`;
                break;

            case "science":
                doi = pdf.split("/doi/")[1];
                if (!doi.startsWith("10.")) {
                    doi = doi.split("/").slice(1).join("/");
                }
                abs = `https://science.org/doi/full/${doi}`;
                break;

            case "frontiers":
                abs = pdf.replace(/\/pdf$/, "/full");
                break;

            case "ihep":
                abs = `https://inspirehep.net/literature/${paper.id.split("-")[1]}`;
                break;

            case "plos":
                abs = pdf.replace("/article/file?", "/article?").split("&")[0];
                break;

            case "rsc":
                abs = pdf.replace("/articlepdf/", "/articlelanding/");
                break;

            case "website":
                abs = paper.pdfLink;
                break;

            case "mdpi":
                abs = paper.pdfLink.split("/pdf")[0];
                break;

            case "oup":
                abs = `https://doi.org/${paper.doi}`;
                break;

            case "hal":
                abs = pdf.split("/file/")[0].split("/document")[0];
                break;

            case "chemrxiv":
                abs = `https://chemrxiv.org/engage/chemrxiv/article-details/${
                pdf.split("/item/")[1].split("/")[0]
            }`;
                break;

            case "cell":
                journal = paper.id.split("_")[0].split("fulltext")[0];
                pii = new URL(pdf).searchParams.get("pii");
                abs = `https://www.cell.com/${journal}/fulltext/${pii}`;
                break;

            case "aip":
                abs = `https://doi.org/${paper.doi}`;
                break;

            default:
                abs = "https://xkcd.com/1969/";
                break;
        }

        return abs.replace("http://", "https://");
    };

    /**
     * Get the url to the paper's online pdf.
     *
     * @param {object} paper the paper whose pdf url we're looking for
     * @returns {string} the url to the paper's pdf
     */
    const paperToPDF = (paper) => {
        let pdf = paper.pdfLink;
        switch (paper.source) {
            case "arxiv":
                // remove potential version so it's to the latest
                pdf = pdf
                    .replace("arxiv.org/abs/", "arxiv.org/pdf/")
                    .replace(/\.pdf$/, "")
                    .replace(/v\d+$/gi, "");
                pdf += ".pdf";

                break;

            case "neurips":
                pdf = pdf
                    .replace("/hash/", "/file/")
                    .replace("-Abstract.html", "-Paper.pdf");
                break;

            case "cvf":
                pdf = pdf.replace("/html/", "/papers/").replace(".html", ".pdf");
                break;

            case "openreview":
                pdf = pdf.replace("/forum?", "/pdf?");
                break;

            case "biorxiv":
                pdf = cleanBiorxivURL(pdf) + ".full.pdf";
                break;

            case "pmlr":
                break;

            case "acl":
                break;

            case "pnas":
                break;

            case "nature":
                if (!pdf.endsWith(".pdf")) pdf += ".pdf";
                break;
            case "iop":
                if (!pdf.endsWith("/pdf")) pdf += "/pdf";
                break;

            case "acs":
                break;

            case "jmlr":
                break;

            case "pmc":
                break;

            case "ijcai":
                break;

            case "acm":
                break;

            case "ieee":
                break;

            case "springer":
                break;

            case "aps":
                break;

            case "wiley":
                break;

            case "sciencedirect":
                break;

            case "science":
                break;

            case "frontiers":
                break;

            case "ihep":
                break;

            case "plos":
                break;

            case "rsc":
                break;

            case "mdpi":
                break;

            case "oup":
                break;

            case "hal":
                break;

            case "chemrxiv":
                break;

            case "website":
                break;

            case "cell":
                break;

            case "aip":
                break;

            default:
                pdf = "https://xkcd.com/1969/";
                break;
        }

        return pdf.replace("http://", "https://");
    };

    const mergePapers = (options = { newPaper: {}, oldPaper: {} }) => {
        const { oldPaper, newPaper, ...extra } = options;
        let mergedPaper = { ...oldPaper };

        const defaults = {
            overwrites: ["lastOpenDate"],
            incrementCount: false,
            syncMerge: false,
        };

        const opts = { ...defaults, ...extra };

        for (const attribute in newPaper) {
            if (!oldPaper.hasOwnProperty(attribute)) {
                mergedPaper[attribute] = newPaper[attribute];
            } else if (newPaper[attribute] && !oldPaper[attribute]) {
                mergedPaper[attribute] = newPaper[attribute];
            }
        }
        if (opts.incrementCount && mergedPaper.count === 1) {
            mergedPaper.count += 1;
        }
        if (opts.syncMerge) {
            // add counts
            mergedPaper.count = oldPaper.count + newPaper.count;

            // combine notes
            mergedPaper.note = oldPaper.note ?? "";
            if (newPaper.note && newPaper.note !== oldPaper.note) {
                mergedPaper.note += "\n\n--[Sync Merge]--\n";
                mergedPaper.note += newPaper.note;
            }

            // combine tags
            mergedPaper.tags = [...oldPaper.tags, ...newPaper.tags];

            mergedPaper.lastOpenDate = newPaper.lastOpenDate;
            // keep most recent open date
            if (newPaper.lastOpenDate > oldPaper.lastOpenDate) {
                mergedPaper.lastOpenDate = newPaper.lastOpenDate;
            }
            mergedPaper.addDate = newPaper.addDate;
            // keep oldest add date
            if (newPaper.addDate > oldPaper.addDate) {
                mergedPaper.addDate = newPaper.addDate;
            }
        }
        for (const attribute of opts.overwrites) {
            if (newPaper.hasOwnProperty(attribute)) {
                mergedPaper[attribute] = newPaper[attribute];
            }
        }

        return mergedPaper;
    };

    const updatePaperVisits = (paper) => {
        paper.count += 1;
        paper.lastOpenDate = new Date().toJSON();
        log("Updating paper to:", paper);
        return paper;
    };

    /**
     *  Adds a new paper to the memory or updates the counts and open dates of an existing paper.
     *
     * @param {string} url The url from which to parse a paper
     * @param {object} is The paper's source info
     * @param {object} checks The user's preferences
     * @returns
     */
    const addOrUpdatePaper = async ({
        url,
        is,
        prefs,
        tab,
        store = true,
        contentScriptCallbacks = { update: () => {}, preprints: () => {} },
    }) => {
        // start time
        const aouStart = Date.now();

        let paper, isNew;
        let pwc = {};

        consoleHeader(`PaperMemory Parsing ${String.fromCodePoint("0x1F4DD")}`);

        // Extract id from url
        state.papers = (await getStorage("papers")) ?? {};
        const id = await parseIdFromUrl$1(url, tab);
        const paperExists = state.papers.hasOwnProperty(id);
        prefs &&
            prefs.checkFeedback &&
            typeof feedback !== "undefined" &&
            feedback({ loading: true });

        if (id && paperExists && state.papers[id].author.toLowerCase() !== "anonymous") {
            // Update paper if it exists
            paper = updatePaperVisits(state.papers[id]);
            isNew = false;
        } else {
            // Or create a new one if it does not
            let newPaper = await makePaper(is, url, tab);
            if (!newPaper) {
                return;
            }
            state.titleHashToIds = makeTitleHashToIdList(state.papers);
            const existingId = findFuzzyPaperMatch(state.titleHashToIds, newPaper);
            if (existingId && store) {
                // Update paper as already it exists
                let existingPaper = state.papers[existingId];
                log("New paper", newPaper, "already exists as", existingPaper);
                addPaperToTitleHashToId(newPaper);

                if (existingPaper.venue) {
                    let overwrites = ["lastOpenDate"];
                    if (existingPaper.author.toLowerCase() === "anonymous") {
                        overwrites.push("author");
                        overwrites.push("year");
                        overwrites.push("venue");
                        overwrites.push("bibtex");
                        overwrites.push("note");
                    }
                    console.log("overwrites: ", overwrites);
                    existingPaper = mergePapers({
                        newPaper,
                        overwrites,
                        oldPaper: existingPaper,
                        incrementCount: false,
                    });
                    updateDuplicatedUrls(url, existingId);
                } else if (newPaper.venue) {
                    updateDuplicatedUrls(paperToAbs(existingPaper), newPaper.id);
                    updateDuplicatedUrls(paperToPDF(existingPaper), newPaper.id);
                    await deletePaperInStorage(existingPaper.id, state.papers);
                    existingPaper = mergePapers({
                        newPaper: newPaper,
                        oldPaper: existingPaper,
                        incrementCount: false,
                        overwrites: [
                            "lastOpenDate",
                            "venue",
                            "bibtex",
                            "id",
                            "key",
                            "pdfLink",
                            "source",
                            "year",
                            "author",
                        ],
                    });
                } else if (existingPaper.author.toLowerCase() === "anonymous") {
                    existingPaper = mergePapers({
                        newPaper,
                        oldPaper: existingPaper,
                        incrementCount: true, // ?
                        overwrites: [
                            "lastOpenDate",
                            "author",
                            "year",
                            "venue",
                            "bibtex",
                            "note",
                        ],
                    });
                }
                newPaper = updatePaperVisits(existingPaper);
                isNew = false;
            } else {
                // set isNew to True for the storage setter
                isNew = true;
            }
            paper = newPaper;
        }

        if (!paper.codeLink || !paper.venue) {
            try {
                const pwcMatch = await silentPromiseTimeout(tryPWCMatch(paper));

                const pwcCodeLink = !paper.codeLink && pwcMatch?.codeLink;
                const pwcNote = pwcMatch?.note;
                const pwcBibtex = pwcMatch?.bibtex;
                const pwcVenue = !paper.venue && pwcMatch?.venue;

                pwc = {
                    codeLink: pwcCodeLink,
                    note: pwcNote,
                    venue: pwcVenue,
                    bibtex: pwcBibtex,
                };

                if (pwc.codeLink) {
                    paper.codeLink = pwc.codeLink;
                    if (pwcMatch.hasOwnProperty("note")) delete pwcMatch.note;
                    paper.code = pwcMatch;
                }
            } catch (error) {
                log("Error trying to discover a code repository:");
                log(error);
            }
        }

        state.papers = (await getStorage("papers")) ?? {};

        // minimize risk of concurrent writes to the same paper
        if (isNew && state.papers.hasOwnProperty(paper.id)) {
            warn("Paper has been created by another page: merging papers.");
            paper = mergePapers({
                newPaper: state.papers[paper.id],
                oldPaper: paper,
                incrementCount: true,
            });
            isNew = false;
        }

        // Store may be false if the user has disabled:
        //   * paper storage from Abstract URLs
        //   * automatic parsing altogether
        // but we still want to display paper metadata on arxiv.org
        if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;

        chrome.storage.local.set({ papers: state.papers }, async () => {
            // tell the content script the paper has been parsed/updated
            contentScriptCallbacks["update"](paper);
            pushToRemote();

            let notifText;
            if (isNew || pwc.codeLink) {
                if (isNew) {
                    // new paper
                    if (store) {
                        logOk("Added '" + paper.title + "' to your Memory!");
                    } else {
                        warn(
                            "Discovered '" +
                                paper.title +
                                "' but did not store it (`store` is false)."
                        );
                    }
                    log("paper: ", paper);

                    notifText = "Saved ✓";
                    if (pwc.codeLink) {
                        notifText +=
                            "<br/><div id='feedback-pwc'>(+ repo from PapersWithCode) </div>";
                    }

                    prefs &&
                        prefs.checkFeedback &&
                        store &&
                        typeof feedback !== "undefined" &&
                        feedback({ text: notifText, paper });
                } else {
                    // existing paper but new code repo
                    notifText = "Found a code repository on PapersWithCode!";
                    prefs &&
                        prefs.checkFeedback &&
                        store &&
                        typeof feedback !== "undefined" &&
                        feedback({ text: notifText });
                }
            } else {
                store && logOk("Updated '" + paper.title + "' in your Memory");
            }

            // anyway: try and update note with actual publication
            if (!paper.note || !paper.venue || paper.author.toLowerCase() === "anonymous") {
                const preprintMatch = await tryPreprintMatch(paper);
                for (const key of ["note", "venue", "bibtex", "doi"]) {
                    if (!paper[key] || key === "bibtex") {
                        const value = preprintMatch[key] ?? pwc[key];
                        if (value) {
                            log(`Updating preprint ${key} to`, value);
                            paper[key] = value;
                        }
                    }
                    if (key === "bibtex" && preprintMatch[key]) {
                        const bibObj = bibtexToObject(preprintMatch[key]);
                        if (bibObj.year !== paper.year) {
                            paper.year = bibObj.year;
                        }
                    }
                }

                state.papers = (await getStorage("papers")) ?? {};

                // minimize risk of concurrent writes to the same paper
                if (
                    isNew &&
                    state.papers.hasOwnProperty(paper.id) &&
                    state.papers[paper.id].count > 1
                ) {
                    warn("Paper has been created by another page: merging papers.");
                    paper = mergePapers({
                        newPaper: state.papers[paper.id],
                        oldPaper: paper,
                        incrementCount: false,
                    });
                }

                // record updated paper if store is true
                if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;
                await new Promise((resolve) =>
                    chrome.storage.local.set({ papers: state.papers }, resolve)
                );
            }
            // tell the content script the pre-print matching procedure has finished
            contentScriptCallbacks["preprints"](paper);
            pushToRemote();

            info(`Done processing paper (${(Date.now() - aouStart) / 1e3}s).`);
            console.groupEnd();
            contentScriptCallbacks["done"](paper);
        });

        return { paper, id };
    };

    /**
     * Make a markdown link to the paper's abstract or pdf.
     * @param {object} paper The paper to make a link for
     * @param {object} prefs The user's preferences to determine whether to link to the pdf or the abstract
     * @returns {string} The markdown link
     */
    const makeMdLink = (paper, prefs = {}) => {
        const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
        let yearAndVenue = "";
        if (prefs.checkMdYearVenue) {
            yearAndVenue = paper.note.match(/(.+)\s*@\s*([\w\s]+\(?\d{4}\)?)/i);
            if (yearAndVenue) {
                yearAndVenue = yearAndVenue[2]?.replace(/\s+/g, " ").replace(/[\(\)]/g, "");
            }
            if (!yearAndVenue) {
                yearAndVenue = "";
                if (paper.venue) {
                    yearAndVenue += paper.venue + " ";
                }
                yearAndVenue += paper.year;
            }
        }
        let title = paper.title;
        if (yearAndVenue) {
            title = `${title} (${yearAndVenue.replace(/\s+/g, " ")})`;
        }
        const md = `[${title}](${link})`;
        return md;
    };

    /**
     * Add a paper to the title hash to id list.
     * @param {object} paper The paper to add
     */
    const addPaperToTitleHashToId = (paper) => {
        const id = paper.id;
        const hashedTitle = miniHash(paper.title);
        if (!state.titleHashToIds.hasOwnProperty(hashedTitle)) {
            state.titleHashToIds[hashedTitle] = [];
        }
        if (!state.titleHashToIds[hashedTitle].includes(id)) {
            state.titleHashToIds[hashedTitle].push(id);
        }
    };

    // ES Module imports

    /**
     * Compute the duration between now and the first element of the times array in seconds.
     * @param {array} times Array of times to compute the duration from
     * @returns
     */
    const duration = (times) => (Date.now() - times[0]) / 1e3;
    /**
     * Function to initialize the app's state.
     *  1. load the papers from storage is the papers argument is undefined
     *  2. load and check the user's title function from storage
     *  3. apply migration on memory data
     *  4. if isContentScript is true, return
     *  5. set the memory display state attributes
     *     a. papersList
     *     b. set default sort key to lastOpenDate
     *     c. papersReady is now true
     *     d. set the menu from storage
     *  6. Sort the memory's papers
     *  7. Discover all the memory's tags
     *
     * @param {object} papers Memory object with papers to initialize the state with
     * @param {boolean} isContentScript Whether the call is from a content_script or the popup
     */
    const initState = async ({ papers, isContentScript, print = true } = {}) => {
        const times = [];
        times.unshift(Date.now());
        print && consoleHeader(`PaperMemory Init ${String.fromCodePoint("0x2705")}`);

        if (!papers) {
            papers = (await getStorage("papers")) ?? {};
            print && log("Time to retrieve stored papers (s): " + duration(times));
        }
        times.unshift(Date.now());

        state.dataVersion = getManifestDataVersion();
        print && log("Time to parse data version (s): " + duration(times));
        times.unshift(Date.now());

        weeklyBackup();
        print && log("Time to backup papers (weekly) (s): " + duration(times));
        times.unshift(Date.now());

        const migration = await migrateData(papers, state.dataVersion);
        print && log("Time to migrate data (s): " + duration(times));
        times.unshift(Date.now());

        papers = migration.papers;
        state.papers = papers;

        state.prefs = await getPrefs();
        print && log("Time to retrieve user preferences (s): " + duration(times));
        times.unshift(Date.now());

        state.ignoreSources = (await getStorage("ignoreSources")) ?? {};
        print && log("Time to retrieve sources to ignore (s): " + duration(times));
        times.unshift(Date.now());

        state.urlHashToId = (await getStorage("urlHashToId")) ?? {};
        print && log("Time to retrieve sources to urlHashToId (s): " + duration(times));
        times.unshift(Date.now());

        state.titleHashToIds = makeTitleHashToIdList(papers);
        print && log("Time to hash titles (s): " + duration(times));
        times.unshift(Date.now());

        if (!isContentScript) {
            state.files = await matchAllFilesToPapers();
            print && log("Time to match all local files (s): " + duration(times));
            times.unshift(Date.now());

            state.papersList = Object.values(cleanPapers(papers));
            state.sortKey = "lastOpenDate";
            state.papersReady = true;

            sortMemory();
            print && log("Time to sort memory (s): " + duration(times));
            times.unshift(Date.now());

            makeTags();
            print && log("Time to make tags (s): " + duration(times));
            times.unshift(Date.now());
        }

        try {
            const cellPath = chrome.runtime.getURL("data/cell.json");
            state.cellJournalData = await fetch(cellPath).then((res) => res.json());
        } catch (e) {
            state.cellJournalData = {};
        }
        print && log("Time to fetch cell journal data (s): " + duration(times));
        times.unshift(Date.now());

        info("State init duration (s): " + (Date.now() - times.last()) / 1e3);
        print && console.groupEnd();
    };

    /**
     * Execute the sort operation on state.sortedPapers using orderPapers, removing the
     * __dataVersion element in state.papers.
     */
    const sortMemory = () => {
        state.sortedPapers = Object.values(cleanPapers(state.papers));
        state.sortedPapers.sort(
            orderPapers(descendingSortKeys.indexOf(state.sortKey) >= 0),
        );
        state.papersList.sort(orderPapers(descendingSortKeys.indexOf(state.sortKey) >= 0));
    };

    /**
     * Function to produce the sorting order of papers: it compares 2 papers and
     * returns -1 or 1 depending on which should come first.
     * addDate count and lastOpenDate are sorted descending by default.
     * Others (id, title) are sorted ascending by default.
     * @param {object} paper1 First item in the comparison
     * @param {object} paper2 Second item to compare
     * @returns {number} 1 or -1 depending on the prevalence of paper1/paper2
     */
    const orderPapers = (descending) => (paper1, paper2) => {
        let val1 = paper1[state.sortKey];
        let val2 = paper2[state.sortKey];

        if (typeof val1 === "undefined") {
            val1 = "";
        }
        if (typeof val2 === "undefined") {
            val2 = "";
        }

        if (typeof val1 === "string") {
            val1 = val1.toLowerCase();
            val2 = val2.toLowerCase();
        }
        if (descending) {
            return val1 > val2 ? -1 : 1;
        }
        return val1 > val2 ? 1 : -1;
    };

    /**
     * Create the set of all tags used in papers. If a tag used for a paper is new,
     * it is added to this list, if a tag is never used after it's deleted from its
     * last paper, it is removed from the list.
     */
    const makeTags = () => {
        let tags = new Set();
        for (const p of state.sortedPapers) {
            for (const t of p.tags) {
                tags.add(t);
            }
        }
        state.paperTags = [...tags];
        state.paperTags.sort();
    };

    /**
     * Uses the state-loaded title function to get the title of a paper.
     *
     * @param {string || object} paperOrId the paper for which to get the title
     * @returns {string} the title of the paper
     */
    const stateTitleFunction = (paperOrId) => {
        let paper = paperOrId;
        if (typeof paperOrId === "string") {
            // paperOrId is an ID
            paper = state.papers[paperOrId];
            if (typeof paper === "undefined") {
                // no such paper
                log("Error in stateTitleFunction: unknown id", paperOrId);
                return "Unknown ID";
            }
        }
        const name = state.titleFunction(paper);
        return name.replaceAll("\n", " ").replace(/\s\s+/g, " ");
    };

    const readJournalAbbreviations = async () => {
        if (Object.keys(journalAbbreviations).length > 0) {
            return;
        }
        const iso4Path = chrome.runtime.getURL("data/iso4-journals.json");
        const iso4 = await fetch(iso4Path).then((res) => res.json());
        const abbrPath = chrome.runtime.getURL("data/journal-abbreviations.json");
        const abbr = await fetch(abbrPath).then((res) => res.json());
        const newAbbreviations = Object.fromEntries(
            [...Object.entries(iso4), ...Object.entries(abbr)].map(([k, v]) => [
                miniHash(k),
                v,
            ]),
        );
        for (const [key, value] of Object.entries(newAbbreviations)) {
            journalAbbreviations[key] = value;
        }
    };

    const downloadPaperPdf = async (paper) => {
        if (!state.papersReady) {
            throw new Error("[PM] State is not ready (downloadPaperPdf)");
        }
        let title = stateTitleFunction(paper);
        title = title.replaceAll(":", " ");
        const punctuationRegex =
            /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\/:;<=>?@\[\]^`{|}~]/g;
        const spaceRegex = /\s+/g;
        title = title.replace(punctuationRegex, " ").replace(spaceRegex, " ");
        if (state.prefs.checkStore) {
            title = "PaperMemoryStore/" + title;
            const storedFiles = await getStoredFiles();
            if (storedFiles.length === 0) {
                chrome.downloads.download({
                    url: URL.createObjectURL(new Blob([storeReadme])),
                    filename: "PaperMemoryStore/IMPORTANT_README.txt",
                    saveAs: false,
                });
            }
        }
        if (title.endsWith("pdf")) {
            title = title.slice(0, -3) + ".pdf";
        }
        if (!title.endsWith(".pdf")) {
            title += ".pdf";
        }
        log("Downloading paper", paper, "to", title);
        chrome.downloads.download({
            url: paperToPDF(paper),
            filename: title,
        });
    };

    const matchAllFilesToPapers = () => {
        return new Promise((resolve, reject) => {
            chrome.downloads.search(
                {
                    filenameRegex: "PaperMemoryStore/.*",
                },
                async (files) => {
                    const matches = await matchPapersToFiles(
                        cleanPapers(state.papers),
                        files,
                    );
                    resolve(matches);
                },
            );
        });
    };

    /**
     * Get a the HTML string listing all the <option>tag</option> of all known tags,
     * setting the <option>'s "selected" attribute according to the paper's own tags
     * @param {object} paper The paper whose options' HTML string are being created
     * @returns {string} The HTML string of the paper's options
     */
    const getTagsOptions = (paper) => {
        const tags = new Set(paper.tags);

        return [...state.paperTags]
            .sort()
            .map((t, i) => {
                let h = '<option value="' + t + '"'; // not string literal here for minification
                if (tags.has(t)) {
                    h += ' selected="selected" ';
                }
                return h + `>${t}</option>`;
            })
            .join("");
    };

    // ES Module imports

    /**
     * Make sure the currently stored data is compatible with the potentially updated code.
     * To do so, we check the stored data version and the current version of the extension.
     * If need be, fields are updated/added/deleted
     *
     * @param {object} papers reference papers to update
     * @param {number} manifestDataVersion the current version of the extension
     * @param {boolean} store whether to store the updated papers in storage
     * @returns {object} {papers: migratedPapers, success: ?, ?error: string}
     */
    const migrateData = async (papers, manifestDataVersion, store = true) => {
        if (typeof papers === "undefined") {
            chrome.storage.local.set({ papers: { __dataVersion: manifestDataVersion } });
            return { papers: { __dataVersion: manifestDataVersion }, success: true };
        }
        const currentVersion = papers["__dataVersion"] || -1;
        var deleteIds = [];
        const latestDataVersion = 10000;

        let newPapers = { ...papers };

        try {
            if (currentVersion >= latestDataVersion) {
                log("No migration needed");
                return { papers: papers, success: true };
            }

            store && backupData({ ...papers });

            Object.keys(papers).forEach((key) => {
                if (key.startsWith("__")) {
                    delete papers[key];
                }
            });
            let migrationSummaries = {};

            for (const id in papers) {
                migrationSummaries[id] = [];
                if (currentVersion < 5) {
                    // pre-0.2.8 and manifestDataVersion()
                    if (!papers[id].hasOwnProperty("bibtex")) {
                        papers[id].bibtex = "";
                        migrationSummaries[id].push("(m5) bibtex default");
                    }
                    if (!papers[id].pdfLink.endsWith(".pdf")) {
                        papers[id].pdfLink = papers[id].pdfLink + ".pdf";
                        migrationSummaries[id].push("(m5) pdfLink to .pdf");
                    }
                    if (!papers[id].codeLink) {
                        papers[id].codeLink = "";
                        migrationSummaries[id].push("(m5) codeLink default");
                    }
                    if (!papers[id].source) {
                        if (papers[id].id.includes("NeurIPS")) {
                            papers[id].source = "neurips";
                            migrationSummaries[id].push("(m5) NeurIPS to neurips");
                        } else {
                            papers[id].source = "arxiv";
                            migrationSummaries[id].push("(m5) source default is arxiv");
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
                        migrationSummaries[id].push("(m208) md from title and pdfLink");
                    }
                    if (
                        papers[id].source !== "arxiv" &&
                        papers[id].pdfLink.includes("arxiv.org/pdf/")
                    ) {
                        papers[id].source = "arxiv";
                        migrationSummaries[id].push("(m208) set arxiv source from pdfLink");
                    }
                    if (id.match(/^\d/) && papers[id].source === "arxiv") {
                        const newId = `Arxiv-${id}`;
                        let newPaper = { ...papers[id], id: newId };
                        papers[newId] = newPaper;
                        deleteIds.push(id);
                        migrationSummaries[id].push("(m208) new arxiv id to Arxiv-");
                    }
                }
                if (currentVersion < 209) {
                    // 0.2.9
                    if (!papers[id].hasOwnProperty("favorite")) {
                        papers[id].favorite = false;
                        papers[id].favoriteDate = "";
                        migrationSummaries[id].push("(m209) favorite defaults");
                    }
                }
                if (currentVersion < 210) {
                    if (papers[id].source === "arxiv") {
                        // replace vX in pdfs so the paper always points to the latest
                        const pdfVersion = papers[id].pdfLink.match(/v\d+\.pdf/gi);
                        if (pdfVersion && pdfVersion.length > 0) {
                            papers[id].pdfLink = papers[id].pdfLink.replace(
                                pdfVersion[0],
                                ".pdf"
                            );
                            migrationSummaries[id].push("(m210) remove pdf version");
                        }
                    }
                    if (papers[id].hasOwnProperty("bibtext")) {
                        papers[id].bibtex = papers[id].bibtext + "";
                        delete papers[id].bibtext;
                        migrationSummaries[id].push("(m210) bibtext typo to bibtex");
                    }
                }
                if (currentVersion < 450) {
                    if (!papers[id].hasOwnProperty("venue")) {
                        try {
                            papers[id].venue = await makeVenue(papers[id]);
                            migrationSummaries[id].push("(m450) venue from id");
                        } catch (error) {
                            logError(error);
                            papers[id].venue = "";
                            migrationSummaries[id].push("(m450) ERROR in venue from id");
                        }
                    }
                }
                if (currentVersion < 502) {
                    if (id.startsWith("ACL-") && papers[id].source !== "acl") {
                        papers[id].source = "acl";
                        migrationSummaries[id].push("(m502) fix set source to acl");
                    }
                    if (papers[id].source === "acs") {
                        papers[id].pdfLink = papers[id].pdfLink.replace(
                            "/doi/pdf/abs/",
                            "/doi/pdf/"
                        );
                        migrationSummaries[id].push("(m502) fix acs pdfLink");
                    }
                }

                if (currentVersion < 510) {
                    // fix semanticscholar venues
                    if (papers[id].venue?.toLowerCase().includes("arxiv")) {
                        papers[id].venue = "";
                        papers[id].note = papers[id].note
                            .replace(
                                /accepted\s*@\s*arxiv\.org.+semanticscholar\.org\]/gi,
                                ""
                            )
                            .trim();
                        migrationSummaries[id].push("(m509) fix: remove arxiv as venue");
                    }
                    if (papers[id].codeLink === false) {
                        papers[id].codeLink = "";
                        migrationSummaries[id].push("(m509) codeLink from false to ''");
                    }
                    if (typeof papers[id].year !== "string") {
                        papers[id].year = papers[id].year + "";
                        migrationSummaries[id].push("(m509) year to string");
                        if (papers[id].year === "undefined") {
                            papers[id].year = "unknown";
                            migrationSummaries[id].push("(m509) empty year to unknown");
                        }
                    }
                    if (papers[id].venue === undefined) {
                        papers[id].venue = "";
                        migrationSummaries[id].push("(m509) venue undefined to ''");
                    }
                }

                if (currentVersion < 513) {
                    if (papers[id].source === "iop") {
                        const oldId = id;
                        const doi = id.split("_")[1];
                        const newId = oldId.split("_")[0] + "_" + miniHash(doi);
                        papers[newId] = { ...papers[oldId] };
                        deleteIds.push(oldId);
                        migrationSummaries[id].push("(m513) iop doi-in-id to minihash");
                    }
                }
                if (currentVersion < 10000) {
                    if (papers[id].source === "acm") {
                        let b = papers[id].bibtex;
                        const lines = b.split("\n");
                        if (lines[0].includes("?")) {
                            lines[0] = lines[0].split("?")[0] + ",";
                        }
                        b = lines.join("\n");
                        papers[id].bibtex = b;
                        migrationSummaries[id].push("(m10000) fix acm bibtex");
                    }
                    if (papers[id].bibtex) {
                        const bibObj = bibtexToObject(papers[id].bibtex);
                        if (bibObj && bibObj.hasOwnProperty("abstract")) {
                            delete bibObj.abstract;
                            migrationSummaries[id].push("(m10000) remove bibtex abstract");
                            papers[id].bibtex = bibtexToString(bibObj);
                        }
                    }
                }
                if (currentVersion < 10000) {
                    if (papers[id].bibtex && !papers[id].hasOwnProperty("doi")) {
                        const doi = bibtexToObject(papers[id].bibtex).doi;
                        if (doi) {
                            papers[id].doi = doi;
                            migrationSummaries[id].push("(m10001) add doi from bibtex");
                        }
                    }
                }
            }

            deleteIds.forEach((id, k) => {
                delete papers[id];
                log("Deleting " + id);
            });

            newPapers = { ...papers };
            newPapers["__dataVersion"] = manifestDataVersion;

            // log the migration summaries, each paper at a time with indented summaries
            info("Migration summary:");
            Object.keys(migrationSummaries).forEach((id) => {
                if (migrationSummaries[id].length > 0) {
                    log(id + ":\n\t • " + migrationSummaries[id].join("\n\t • "));
                }
            });

            if (store) {
                chrome.storage.local.set({ papers: newPapers }, () => {
                    log("Migrated papers:");
                    log(newPapers);
                    log("Data version is now " + manifestDataVersion);
                });
            }
            return { papers: newPapers, success: true };
        } catch (err) {
            log(
                `Error migrating data from version ${currentVersion} to ${manifestDataVersion}: `
            );
            log(err);

            return { papers: newPapers, success: false, error: err };
        }
    };

    /**
     * A utility function to retrieve some value associated with the
     * input key from storage.
     * usage: const value = await getStorage(key);
     *
     * @param {string} key The storage key to retrieve
     * @returns {any}
     */
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

    /**
     * A utility function to update the storage. Supports callbacks.
     * usage: setStorage("papers", {...}, () => {log("Done.")})
     *
     * @param {string} key The storage key to update
     * @param {any} value The key's value to store
     * @param {function} cb callback function to execute after successful storage
     * write
     * @returns {promise}
     */
    const setStorage = async (key, value, cb = () => {}) => {
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [key]: value }, () => {
                cb();
                resolve(true);
            });
        });
    };

    /**
     * Delete a paper from storage.
     *
     * @param {string} id Paper id to delete. Must be exact.
     */
    const deletePaperInStorage = async (id, papers) => {
        if (!papers) {
            papers = (await getStorage("papers")) ?? {};
        }
        let deleted = false;
        if (papers.hasOwnProperty(id)) {
            updateDuplicatedUrls(null, id, true);
            deleted = delete state.titleHashToIds[miniHash(papers[id].title)];
            deleted = deleted && delete papers[id];
            delete state.papers[id];
        }
        if (deleted) {
            await setStorage("papers", papers);
            state.papersList = Object.values(cleanPapers(state.papers));
            sortMemory();
            log("Successfully deleted paper", id);
        } else {
            log("Error: no deletion");
        }
    };

    /**
     * Stores the last 5 versions of the user's memory whenever there's a migration.
     * @param {object} papers The papers to store.
     */
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
                log("Backed up data with version: " + papers["__dataVersion"]);
            });
        });
    };

    function dateDiffInDays(a, b) {
        // a and b are javascript Date objects
        // Discard the time and time-zone information.
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
        const utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

        return Math.floor((utc2 - utc1) / _MS_PER_DAY);
    }

    /**
     * Create a weekly backup of the papers
     */
    const weeklyBackup = async () => {
        let backups = (await getStorage("weeklyBackups")) ?? {};

        const today = new Date();
        // older to newer
        const backupDates = Object.keys(backups)
            .map((k) => new Date(k))
            .sort((a, b) => a.getTime() - b.getTime());
        if (backupDates.length > 0) {
            const latestBackup = backupDates[backupDates.length - 1];
            if (dateDiffInDays(latestBackup, today) < 7) return;
        }

        let newBackups = {};
        for (const date of backupDates.reverse().slice(0, 5)) {
            newBackups[date.toString()] = backups[date.toString()];
        }
        newBackups[today.toString()] = (await getStorage("papers")) ?? {};
        setStorage("weeklyBackups", newBackups);
    };

    /**
     * Retrieve the boolean preferences as defined in config.js/prefsStorageKeys
     * @returns {object} The user's preferences as per the popup's sliders in the menu.
     */
    const getPrefs = async () => {
        let isNew = false;
        let legacyPrefs;
        const storedPrefs = (await getStorage("prefs")) ?? {};
        if (Object.keys(storedPrefs).length === 0) {
            isNew = true;
        }
        if (isNew) {
            legacyPrefs = (await getStorage(prefsStorageKeys)) ?? {};
        }
        let prefs = {};
        for (const m of prefsCheckNames) {
            prefs[m] = (legacyPrefs ?? storedPrefs).hasOwnProperty(m)
                ? (legacyPrefs ?? storedPrefs)[m]
                : prefsCheckDefaultFalse.indexOf(m) >= 0
                ? false
                : true;
        }

        if (prefs.checkOfficialRepos) {
            setStorage("pwcPrefs", { official: true });
            delete prefs.checkOfficialRepos;
            setStorage("prefs", prefs);
        }

        if (isNew) {
            setStorage("prefs", prefs);
        }

        return prefs;
    };

    /**
     * Retrieve the default keyboard action from storage.
     * @returns {string} The default keyboard action.
     */
    const getDefaultKeyboardAction = async () => {
        let defaultAction = await getStorage("defaultKeyboardAction");
        if (defaultAction) {
            return defaultAction;
        }
        defaultAction = "o";
        await setStorage("defaultKeyboardAction", defaultAction);
        return defaultAction;
    };

    /**
     * Set the default keyboard action.
     * @param {string} action The default keyboard action.
     */
    const setDefaultKeyboardAction = async (action) =>
        setStorage("defaultKeyboardAction", action);

    /**
     * Turns the manifest's semantic string version into an int:
     * PaperMemory version a.b.c => data version a * 10^4 + b * 10^2 + c
     * (with 10^2 and 10^1, 0.3.1 would be lower than 0.2.12)
     *
     * @returns {number} the int-ified semantic version
     */
    const getManifestDataVersion = () => {
        const manifest = chrome.runtime.getManifest();
        return manifest.version
            .split(".")
            .map((v, k) => parseInt(v) * 10 ** (4 - 2 * k))
            .reduce((a, b) => a + b);
    };

    /**
     * Verify that a paper complies with expected fields, types and sets defaults
     * if possible.
     * @param {object} paper The paper object whose attributes should be verified
     * @param {boolean} log Whether to log the errors
     * @returns {object} {warnings: list of warning messages, paper: new paper with
     * updated missing keys to default values}
     */
    const validatePaper = (paper, log = true) => {
        /*
        object mapping a paper's attributes to another object describing the
        expected behavior of this attribute:
            a type, a description and a default function.
        If a paper is missing an attribute but the latter has a default function,
        the attribute will be set according to that function.
        Otherwise, it is considered an error.
        */
        const expectedKeys = {
            addDate: {
                type: "string",
                desc: "the paper's date of addition to the Memory",
                default: (p) => new Date().toJSON(),
                validation: (p) => {
                    try {
                        const d = new Date(p);
                    } catch (error) {
                        return `Invalid addDate (could not parse as date: ${error})`;
                    }
                },
            },
            author: {
                type: "string",
                desc: "` and `-separated authors `${firstName} ${lastName}`",
                validation: (p) => {
                    if (!p) {
                        throw Error(
                            `No author: ${p} for paper ${paper.id}:\n${JSON.stringify(
                            paper,
                            null,
                            2
                        )}\nFix the json file and try again.\n`
                        );
                    }
                },
            },
            bibtex: {
                type: "string",
                desc: "BibTex citation with new lines (`\n`)",
                validation: (p) => {
                    try {
                        bibtexToObject(p);
                    } catch (error) {
                        return `Invalid BibTex: ${error} :\n${p}`;
                    }
                },
            },
            code: {
                type: "object",
                desc: "the paper's code object as returned by the PapersWithCode API",
                default: (p) => {
                    return {};
                },
            },
            codeLink: {
                type: "string",
                desc: "the paper's code link",
                default: (p) => "",
                validation: (p) => {
                    try {
                        parseUrl(p);
                    } catch (error) {
                        return `Invalid codeLink (${p}): ${error}`;
                    }
                },
            },
            count: {
                type: "number",
                desc: "the paper's number of visits",
                default: (p) => 1,
                validation: (p) => {
                    if (p < 0) {
                        return `Invalid count (${p}): must be >= 0`;
                    }
                },
            },
            doi: {
                type: "string",
                desc: "the paper's doi",
                default: (p) => bibtexToObject(p.bibtex).doi ?? "",
            },
            extras: {
                type: "object",
                desc: "extra information about the paper which may be required per source",
                optional: true,
            },
            favorite: {
                type: "boolean",
                desc: "user wants to star the paper",
                default: (p) => false,
            },
            favoriteDate: {
                type: "string",
                desc: "date the paper was added as a favorite",
                default: (p) => "",
            },
            id: {
                type: "string",
                desc: "Unique PaperMemory ID",
            },
            key: {
                type: "string",
                desc: "BibTex citation key",
                default: (p) => `defaultKey_${p.id}`,
            },
            lastOpenDate: {
                type: "string",
                desc: "When the paper was last opened",
                default: (p) => new Date().toJSON(),
            },
            md: {
                type: "string",
                desc: "markdown-formatted string `[${title}](${pdfLink})`",
                default: (p) => `[${p.title}](${p.pdfLink})`,
            },
            note: {
                type: "string",
                desc: "the user's note for this paper",
                default: (p) => "",
            },
            pdfLink: {
                type: "string",
                desc: "the link to the paper's pdf",
            },
            source: {
                type: "string",
                desc: "the paper's source i.e. where it was added to the memory from",
                validation: (p) => {
                    const sources = Object.keys(knownPaperPages);
                    if (sources.indexOf(p) < 0) {
                        return `Unknown source ${p}`;
                    }
                },
            },
            tags: {
                type: "array[string]",
                desc: "the user's tags for this paper",
                default: (p) => [],
            },
            title: {
                type: "string",
                desc: "the paper's title",
                validation: (p) => {
                    if (!p) {
                        throw Error(
                            `No title: ${p} for paper ${paper.id}:\n${JSON.stringify(
                            paper,
                            null,
                            2
                        )}\nFix the json file and try again.\n`
                        );
                    }
                },
            },
            venue: {
                type: "string",
                desc: "the paper's publication venue",
                default: (p) => "",
            },

            year: {
                type: "string",
                desc: "year of publication",
                validation: (p) => {
                    // test regex: year has 4 digits exactly
                    if (!/^\d{4}$/.test(p)) {
                        return `Invalid year (${p}): must be 4 digits exactly`;
                    }
                },
            },
        };

        let warns = {};
        let message = "";

        for (const key in expectedKeys) {
            if (!warns[key]) {
                warns[key] = [];
            }
            if (!paper.hasOwnProperty(key)) {
                // the paper is missing the attribute `key`
                if (expectedKeys[key].default) {
                    // there's a default function fo the missing attribute
                    const defaultValue = expectedKeys[key].default(paper);
                    paper[key] = defaultValue;
                    message = `➤ Attribute "${key}" absent; will be set to '${JSON.stringify(
                    defaultValue
                )}' (${paper.id})`;
                    // stores the update message. If `log` is true, also log the message
                    warns[key].push(message);
                    log && console.warn(message);
                } else if (!expectedKeys[key].optional) {
                    // There's no default function for the missing attribute.
                    // This behavior is unaccounted for: throw an error and break the validation.
                    throw new Error(
                        `Cannot continue, paper is corrupted. Missing mandatory attribute "${key}" in ${paper.id}`
                    );
                }
            } else {
                // the paper has the attribute `key`
                const expectedType = expectedKeys[key].type;
                const keyType = typeof paper[key];
                if (!expectedType.includes("array") && expectedType !== "object") {
                    // for non-array types, we can directly compare strings
                    if (keyType !== expectedType) {
                        // wrong type: store (and log?) warning.
                        // This is not a deal breaker, just a warning.
                        message = `➤ ${key} should be of type ${expectedType} not ${keyType} (${paper.id})`;
                        warns[key].push(message);
                        log && console.warn(message);
                    }
                } else {
                    if (expectedType.includes("array")) {
                        if (Array.isArray(paper[key])) {
                            // expected values are arrays.
                            // find the expected type of the array's elements:
                            const subType = expectedType.split("[")[1].replace("]", "");
                            // the attribute is an array
                            if (paper[key].length > 0) {
                                // if it contains elements: check they are of the expected type
                                const keyType = typeof paper[key][0];
                                if (keyType !== subType) {
                                    // sub-type mismatch: warning
                                    message = `➤ ${key} should contain ${subType} not ${keyType} (${paper.id})`;
                                    warns[key].push(message);
                                    log && console.warn(message);
                                }
                            }
                        } else {
                            // the attribute is not an array: warning
                            message = `${key} should be an array (${paper.id})`;
                            warns[key].push(message);
                            log && console.warn(message);
                        }
                    } else if (Object(paper[key]) !== paper[key]) {
                        // it should be an object
                        message = `${key} should be an object (${paper.id})`;
                        warns[key].push(message);
                        log && console.warn(message);
                    }
                }
            }
        }

        for (const key in expectedKeys) {
            if (expectedKeys[key].validation) {
                const validation = expectedKeys[key].validation(paper[key]);
                if (validation) {
                    if (!warns[key]) {
                        warns[key] = [];
                    }
                    warns[key].push(validation);
                    log && console.warn(validation + ` (${paper.id})`);
                }
            }
        }

        return { warnings: warns, paper: paper };
    };

    const makeVenue = async (paper) => {
        let venue = "";
        if (paper.note && paper.note.match(/(accepted|published)\ @\ .+\(?\d{4}\)?/i)) {
            venue = paper.note
                .split("@")[1]
                .trim()
                .replace(/\(?\d{4}\)?/, "")
                .split("--")[0]
                .trim();
        }
        if (venue) {
            if (venue.toLowerCase() === "neurips") venue = "NeurIPS";
        }
        switch (paper.source) {
            case "arxiv":
                break;
            case "neurips":
                venue = "NeurIPS";
                break;
            case "cvf":
                if (!venue) {
                    venue = (await makeCVFPaper(paper.pdfLink)).venue;
                }
                break;
            case "openreview":
                if (!venue) {
                    venue = (await makeOpenReviewPaper(paper.pdfLink)).venue;
                }
                break;
            case "biorxiv":
                break;
            case "pmlr":
                venue = paper.conf?.split(/\d{4}/)[0] ?? "";
                break;
            case "acl":
                venue = paper.conf ?? "";
                break;
            case "pnas":
                venue = "PNAS";
                break;
            case "nature":
                if (!venue) {
                    venue = paper.venue;
                }
                break;
            case "iop":
                venue = paper.venue;
                break;
            case "acs":
                venue = paper.venue;
                break;
        }
        return venue;
    };

    /**
     * Creates a dictionary mapping a paper's title hash to a list of paper ids
     * with the same title.
     * @param {object} papers The papers dict to hash
     * @returns {object} The title hash to ids dict
     */
    const makeTitleHashToIdList = (papers) => {
        const titleHashToIds = {};
        for (const [id, paper] of Object.entries(cleanPapers(papers))) {
            const hashed = miniHash(paper.title);
            if (!titleHashToIds.hasOwnProperty(hashed)) {
                titleHashToIds[hashed] = [];
            }
            titleHashToIds[hashed].push(id);
        }
        return titleHashToIds;
    };

    const updateDuplicatedUrls = (url, id, remove = false) => {
        if (!remove) {
            state.urlHashToId[miniHash(url)] = id;
            setStorage("urlHashToId", state.urlHashToId);
        } else {
            let hashedUrls;
            if (!url) {
                hashedUrls = Object.keys(state.urlHashToId).filter(
                    (k) => state.urlHashToId[k] === id
                );
            } else {
                hashedUrls = [miniHash(url)];
            }
            if (hashedUrls && hashedUrls.length) {
                for (const hashedUrl of hashedUrls) {
                    warn("Removing duplicated url", url, "for", id);
                    delete state.urlHashToId[hashedUrl];
                }
                setStorage("urlHashToId", state.urlHashToId);
            }
        }
    };

    // ES Module imports
    // -------------------
    // -----  Utils  -----
    // -------------------

    const decodeHtml = (html) => {
        // https://stackoverflow.com/questions/5796718/html-entity-decode
        var txt = document.createElement("textarea");
        txt.innerHTML = html;
        return txt.value;
    };

    const flipAuthor = (author) => author.split(", ").reverse().join(" ");
    const flipAndAuthors = (authors) =>
        authors.split(" and ").map(flipAuthor).join(" and ");

    // -------------------
    // -----  Fetch  -----
    // -------------------

    const fetchCvfHTML = async (url) => {
        let paperPage, text;
        if (url.endsWith(".pdf")) {
            paperPage = url
                .replace("/papers_backup/", "/papers/")
                .replace("/papers/", "/html/")
                .replace(".pdf", ".html");
        } else {
            paperPage = url;
        }

        text = await fetch(paperPage).then((response) => {
            return response.ok ? response.text() : "";
        });

        if (!text && paperPage.includes("thecvf.com/content_")) {
            const { conf, year } = parseCVFUrl(url);
            paperPage = paperPage.replace(
                `/content_${conf}_${year}/`,
                `/content_${conf.toLowerCase()}_${year}/`,
            );
            text = await fetch(paperPage).then((response) => {
                return response.ok ? response.text() : "";
            });
        }

        return text;
    };

    const getOpenReviewNoteJSON = (url) => {
        return sendMessageToBackground({ type: "OpenReviewNoteJSON", url });
    };

    const getOpenReviewForumJSON = (url) => {
        return sendMessageToBackground({ type: "OpenReviewForumJSON", url });
    };

    const fetchDom = async (url) => {
        const html = await fetch(url).then((response) =>
            response.ok ? response.text() : "",
        );
        return new DOMParser().parseFromString(html.replaceAll("\n", ""), "text/html");
    };

    const fetchText = async (url) => {
        try {
            const response = await fetch(url);
            const text = response.ok ? await response.text() : "";
            return text.trim();
        } catch (error) {
            logError("fetchText error:", error);
            return "";
        }
    };

    const fetchJSON = async (url) => {
        try {
            const response = await fetch(url);
            const status = response.status;
            const data = response.ok ? await response.json() : null;
            return { data, status };
        } catch (error) {
            logError("fetchJSON error:", error);
            return {};
        }
    };

    const fetchBibtexToPaper = async ({ url, doi }) => {
        let bibtex;
        if (url && doi) {
            throw new Error("fetchBibtexToPaper: both url and doi provided");
        }
        if (doi) {
            bibtex = await fetchText(
                `https://citation.doi.org/format?doi=${doi}&style=bibtex&lang=en-US`,
            );
        } else if (url) {
            bibtex = await fetchText(url);
        } else {
            throw new Error("fetchBibtexToPaper: no url or doi provided");
        }
        const bibObj = bibtexToObject(bibtex);
        delete bibObj.abstract;
        bibtex = bibtexToString(bibObj);
        bibObj.bibtex = bibtex;
        bibObj.key = bibObj.citationKey;
        if (bibObj.journal) {
            bibObj.venue = bibObj.journal;
            bibObj.note = `Published in ${bibObj.journal} (${bibObj.year})`;
        }
        return bibObj;
    };

    // -------------------
    // -----  Parse  -----
    // -------------------

    /**
     * Extract the author from a bibtex string, as an "and" separated list of names.
     * eg: "John Doe and Jane Doe"
     * @param {string} bibtex The bibtex string to extract the author from.
     * @returns {string} The author.
     */
    const extractAuthor = (bibtex) =>
        extractBibtexValue(bibtex, "author")
            .replaceAll("{", "")
            .replaceAll("}", "")
            .replaceAll("\\", "")
            .split(" and ")
            .map((a) => a.split(", ").reverse().join(" "))
            .join(" and ");

    const extractCrossrefData = (crossrefResponse) => {
        if (!crossrefResponse.status || crossrefResponse.status !== "ok") {
            error("Cannot parse CrossRef response", crossrefResponse);
            return;
        }
        if (crossrefResponse["message-type"] !== "work") {
            error("Unknown `message-type` from CrossRef", crossrefResponse);
            return;
        }

        const data = crossrefResponse.message;
        log("Crossref data.message: ", data);

        const author = data.author.map((a) => `${a.given} ${a.family}`).join(" and ");

        const year = data.issued
            ? data.issued["date-parts"][0][0] + ""
            : data.published
              ? data.published["date-parts"][0][0] + ""
              : null;

        if (!year) {
            error("Cannot find year in CrossRef data", data);
            return;
        }

        const title = data.title[0];

        if (!title) {
            error("Cannot find title in CrossRef data", data);
            return;
        }

        const venue = data["container-title"][0] ?? "Springer";
        const key = [
            miniHash(data.author[0].family),
            year.slice(2),
            firstNonStopLowercase(title),
        ].join("");

        const doi = data.DOI;
        const entryType =
            data.type === "book"
                ? "book"
                : data.type === "book-chapter"
                  ? "InBook"
                  : data.type.includes("article")
                    ? "Article"
                    : "InProceedings";
        let bibData = {
            entryType,
            citationKey: key,
            publisher: data.publisher,
            author,
            title,
            year,
            doi,
        };
        if (data.page) {
            bibData.pages = data.page;
        }
        if (data.volume) {
            bibData.volume = data.volume;
        }
        if (data.type.includes("journal")) {
            bibData.journal = venue;
        }
        if (data.link && data.link.length > 0) {
            const pdf = data.link.find((l) => l["content-type"] === "application/pdf");
            if (pdf) {
                bibData.pdf = pdf.URL;
            }
            const url =
                data.link.find((l) => l["content-type"] === "text/html") ?? data.link[0];
            if (url) {
                bibData.url = url.URL;
            }
        }
        const bibtex = bibtexToString(bibData);

        return { ...bibData, bibtex, venue };
    };

    const fetchCrossRefDataForDoi = async (doi) => {
        const { data, status } = await fetchJSON(
            `https://api.crossref.org/works/${doi}?mailto=schmidtv%40mila.quebec`,
        );
        return { data: extractCrossrefData(data), status };
    };

    // get all dc variations
    const getDCPatterns = (value) => {
        const spec = value.slice(3);
        const lowers = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.toLowerCase());
        const caps = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.capitalize());
        return [...lowers, ...caps];
    };
    const getMetaContent = ({
        selector,
        dom,
        all = false,
        pure = false,
        dcpattern = null,
    }) => {
        let query = "";
        for (const [k, v] of Object.entries(selector)) {
            if (!/dc\W/.test(v.toLowerCase())) {
                // not a dc key
                query += `meta[${k}='${v}']`;
            } else {
                query += getDCPatterns(v)
                    .map((dcp) => `meta[${k}='${dcp}']`)
                    .join(",");
            }
        }
        if (all) {
            const candidate = queryAll(query, dom).map(
                (el) => el.getAttribute("content") ?? "",
            );
            if (pure) return candidate;
            return candidate.map(spaceCamelCase).map(toSingleSpace);
        }

        const candidate = dom.querySelector(query)?.getAttribute("content") ?? "";
        if (pure) return candidate;
        return toSingleSpace(spaceCamelCase(candidate));
    };

    const extractDataFromDCMetaTags = (dom) => {
        let author =
            getMetaContent({
                selector: { name: "dc.Creator" },
                dom,
                all: true,
            }).join(" and ") ||
            getMetaContent({
                selector: { name: "citation_author" },
                dom,
                all: true,
            }).join(" and ");

        if (!author) {
            return null;
        }

        const year = (
            getMetaContent({
                selector: { name: "dc.Date" },
                dom,
            }) ||
            getMetaContent({
                selector: { name: "citation_publication_date" },
                dom,
            })
        )
            .split("-")[0] // account for YYYY-MM-DD
            .split("/")[0]; // account for YYYY/MM/DD

        const publisher =
            getMetaContent({
                selector: { name: "dc.Publisher" },
                dom,
            }).replaceAll("\n", " ") ||
            getMetaContent({
                selector: { property: "og:site_name" },
                dom,
                pure: true,
            });

        const title =
            getMetaContent({
                selector: { name: "dc.Title" },
                dom,
            }) ||
            getMetaContent({
                selector: { name: "citation_title" },
                dom,
            });

        const venue = getMetaContent({
            selector: { name: "citation_journal_title" },
            dom,
        });

        const pdfLink = getMetaContent({
            selector: { name: "citation_pdf_url" },
            dom,
            pure: true,
        });

        const doi =
            getMetaContent({
                selector: { scheme: "doi" },
                dom,
            }) ||
            getMetaContent({
                selector: { name: "citation_doi" },
                dom,
            });

        const key = `${author
        .split(" and ")[0]
        .split(" ")
        .find(
            (v, k) => k >= 1 && miniHash(v).length > 1, // ignore middle initials
        )}${year}${firstNonStopLowercase(title)}`.toLowerCase();
        const bibtex = bibtexToString({
            citationKey: key,
            entryType: "article",
            title,
            author,
            year,
            doi,
            publisher,
            journal: venue,
        });
        const note = venue ? `Published @ ${venue} (${year})` : "";

        return { author, year, publisher, title, venue, key, doi, bibtex, pdfLink, note };
    };

    const makeArxivPaper = async (url) => {
        const arxivId = arxivIdFromURL(url);
        const xmlData = await sendMessageToBackground({
            type: "fetch-arxiv-xml",
            paperId: arxivId,
        });
        const doc = new DOMParser().parseFromString(
            xmlData.replaceAll("\n", ""),
            "text/xml",
        );

        const authors = queryAll("author name", doc).map((el) => el.innerHTML);
        const author = authors.join(" and ");

        const pdfLink = [...doc.getElementsByTagName("link")]
            .map((l) => l.getAttribute("href"))
            .filter((h) => h.includes("arxiv.org/pdf/"))[0]
            .replace(/v\d+(\.pdf)?$/gi, ".pdf");

        let title = doc.querySelector("entry title");
        title = title?.textContent || title?.innerText || "";
        const year = doc.querySelector("entry published").innerHTML.slice(0, 4);
        const key =
            authors[0].split(" ").last().toLowerCase() +
            year +
            firstNonStopLowercase(title);

        const id = `Arxiv-${arxivId.replace("/", "_")}`;

        let bibtex = "";
        bibtex += `@article{${key},\n`;
        bibtex += `    title={${title} },\n`;
        bibtex += `    author={${author} },\n`;
        bibtex += `    year={${year}},\n`;
        bibtex += `    journal={arXiv preprint arXiv: ${arxivId}}\n`;
        bibtex += `}`;

        const venue = "";

        return { author, bibtex, id, key, pdfLink, title, venue, year };
    };

    const makeNeuripsPaper = async (url) => {
        if (url.endsWith(".pdf")) {
            url = url
                .replace("/file/", "/hash/")
                .replace(/-Paper(.*)\.pdf/, "-Abstract$1.html");
        }
        const hash = url.split("/").slice(-1)[0].split("-Paper")[0];

        const dom = await fetchDom(url);

        const citeUrl = [...dom.getElementsByTagName("a")]
            .filter((a) => a.innerText === "Bibtex")[0]
            ?.getAttribute("href");

        let bibtex, author, title, year, key, citationKey;

        if (citeUrl) {
            bibtex = await fetchText(`https://${parseUrl(url).host}${citeUrl}`);
            ({ author, citationKey, title, year } = bibtexToObject(bibtex));
            author = flipAndAuthors(author);
            key = citationKey;
        } else {
            const paragraphs = queryAll(".container-fluid .col p", dom);

            title = dom.getElementsByTagName("h4")[0].innerHTML;
            const h4Authors = queryAll("h4", dom).filter(
                (h) => h.innerText === "Authors",
            )[0];

            author = h4Authors.nextElementSibling.innerText
                .split(", ")
                .map((author) =>
                    author
                        .split(" ")
                        .map((p) => p.capitalize())
                        .join(" "),
                )
                .join(" and ");
            year = paragraphs[0].innerHTML.match(/\d{4}/)[0];
            key = `neurips${year}${hash.slice(0, 8)}`;

            bibtex = "";
            bibtex += `@inproceedings{NEURIPS${year}_${hash.slice(0, 8)},\n`;
            bibtex += `    author={${author}},\n`;
            bibtex += `    booktitle={Advances in Neural Information Processing Systems},\n`;
            bibtex += `    editor={H.Larochelle and M.Ranzato and R.Hadsell and M.F.Balcan and H.Lin},\n`;
            bibtex += `    publisher={Curran Associates, Inc.},\n`;
            bibtex += `    title={${title}},\n`;
            bibtex += `    url={${url}},\n`;
            bibtex += `    year={${year}}\n`;
            bibtex += `}`;
            bibtex = bibtexToString(bibtex);
        }

        const pdfLink = url
            .replace("/hash/", "/file/")
            .replace("-Abstract.html", "-Paper.pdf");
        const id = `NeurIPS-${year}_${hash.slice(0, 8)}`;
        const venue = "NeurIPS";
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeCVFPaper = async (url) => {
        const htmlText = await fetchCvfHTML(url);
        const dom = new DOMParser().parseFromString(
            htmlText.replaceAll("\n", ""),
            "text/html",
        );
        const title = dom.getElementById("papertitle").innerText.trim();
        let author = dom
            .querySelector("#authors i")
            .innerText.split(",")
            .map((a) => a.trim())
            .join(" and ");
        const { year, id, conf } = parseCVFUrl(url);
        let pdfLink = "";
        if (url.endsWith(".pdf")) {
            pdfLink = url;
        } else {
            let href = [...dom.getElementsByTagName("a")]
                .filter((a) => a.innerText === "pdf")[0]
                .getAttribute("href");
            if (href.startsWith("../")) {
                href = href.replaceAll("../", "");
            }
            if (!href.startsWith("/")) {
                href = "/" + href;
            }
            pdfLink = "http://openaccess.thecvf.com" + href;
        }
        const venue = conf;
        const note = `Accepted @ ${venue} (${year})`;
        const bibtex = bibtexToString(dom.querySelector(".bibref").innerText);
        const key = bibtex.split("{")[1].split(",")[0];

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeOpenReviewBibTex = (paper, url) => {
        const title = paper.content.title;
        const author = paper.content.authors.join(" and ");
        const year = paper.cdate ? new Date(paper.cdate).getFullYear() : "0000";
        if (!paper.cdate) {
            log("makeOpenReviewBibTex: no cdate found in", paper);
        }

        let key = paper.content.authors[0].split(" ").last();
        key += year;
        key += firstNonStopLowercase(title);

        let bibtex = "";
        bibtex += `@inproceedings{${key},\n`;
        bibtex += `    title={${title}},\n`;
        bibtex += `    author={${author}},\n`;
        bibtex += `    year={${year}},\n`;
        bibtex += `    url={${url}},\n`;
        bibtex += `}`;

        return bibtex;
    };

    /**
     * Extracts the value of the `value` key in the `content` object of a paper
     * returned by the OpenReview API v2.
     * Eg. v1: { content: { title: "My title" }
     * Eg. v2: { content: { title: { value: "My title" } }
     * @param {Object} paper - A paper returned by the OpenReview API v2 or v1.
     * @returns {Object} The paper with the `value` key extracted from the `content` object.
     */
    const extractAPIv2ContentValue = (paper) => {
        const content = {};
        let isV2 = false;
        for (const [k, v] of Object.entries(paper.content)) {
            if (v && v.value) {
                content[k] = v.value;
                isV2 = true;
            } else {
                content[k] = v;
            }
        }
        paper.content = content;
        return { isV2, paper };
    };

    const makeOpenReviewPaper = async (url) => {
        const noteJson = await getOpenReviewNoteJSON(url);
        const forumJson = await getOpenReviewForumJSON(url);

        if (noteJson.status === 403 && noteJson.name === "ForbiddenError") {
            logError(
                dedent(`Error parsing OpenReview url ${url}.
            Most likely because this entry is protected and you do not have the rights to access it.

            1/ Make sure you are logged in.
            2/ Alternatively, this may be due to OpenReview changing the visibility of this paper.

            Try accessing this URL manually to make sure.`),
            );
            throw Error(noteJson.message);
        } else if (noteJson.status === 404 && noteJson.name === "NotFoundError") {
            logError(dedent(`Error parsing OpenReview url ${url}.`));
            throw Error(noteJson.message);
        }

        var paper = noteJson.notes[0];
        let isV2 = false;
        var forum = forumJson.notes;

        ({ isV2, paper } = extractAPIv2ContentValue(paper));
        console.log("paper", paper);
        const title = paper.content.title;
        const author = (
            paper.content.authors ||
            paper.content.authors?.value || ["Anonymous"]
        ).join(" and ");
        const bibtex = bibtexToString(
            paper.content._bibtex || makeOpenReviewBibTex(paper, url),
        );
        const bibObj = bibtexToObject(bibtex);
        const key = bibObj.citationKey;
        const year = bibObj.year;

        let pdfLink;
        if (paper.pdf) {
            pdfLink = `https://openreview.net/pdf?id=${paper.id}`;
        } else {
            if (paper.html) {
                pdfLink = paper.html.replace("/forum?id=", "/pdf?id=");
            } else {
                pdfLink = url.replace("/forum?id=", "/pdf?id=");
            }
        }

        const confParts = paper.invitation?.split("/") || paper.domain.split("/");
        let organizer = confParts[0].split(".")[0];
        let event = confParts
            .slice(1)
            .join("/")
            .split("-")[0]
            .replaceAll("/", " ")
            .replace(" Conference", "");

        let overrideOrg = organizer;
        let overridden = false;
        if (overrideORConfs.hasOwnProperty(organizer)) {
            overrideOrg = overrideORConfs[organizer];
            overridden = true;
        }
        if (overridden) {
            event = event.replace(overrideOrg, "");
            organizer = overrideOrg;
        }

        const conf = `${organizer} ${event}`
            .replace(/ \d\d\d\d/g, "")
            .replace(/\s\s+/g, " ");
        const id = `OR-${organizer}-${year}_${paper.id}`;

        let candidates, decision, note;

        candidates = isV2
            ? forum.filter((r) => r?.content?.recommendation?.value)
            : forum.filter(
                  (r) =>
                      ["Final Decision", "Paper Decision", "Acceptance Decision"].indexOf(
                          r?.content?.title,
                      ) > -1,
              );
        let venue = "";
        if (candidates && candidates.length > 0) {
            decision = isV2
                ? candidates[0].content.recommendation.value
                : candidates[0].content.decision;
            decision = decision
                .split(" ")
                .map((v, i) => {
                    return i === 0 ? cleanStr(v) + "ed" : v;
                })
                .join(" ");
            note = `${decision} @ ${conf} (${year})`;
            if (decision.toLowerCase().indexOf("rejected") < 0) {
                venue = conf;
            }
        }

        if (author !== "Anonymous" && !venue && bibObj.booktitle) {
            note = `Accepted @ ${bibObj.booktitle}`;
            venue = bibObj.booktitle;
        }
        if (author === "Anonymous" && decision != "Rejected") {
            note = `Under review @ ${conf} (${year}) (${new Date().toLocaleDateString()})`;
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeBioRxivPaper = async (url) => {
        let author, bibtex, id, key, note, pdfLink, title, venue, year;
        const biorxivAPI = "https://api.biorxiv.org";
        const pageURL = url.replace(".full.pdf", "");
        let doi = url.split("/").slice(-2).join("/").replace(".full.pdf", "").split("v")[0];
        const api = `${biorxivAPI}/details/biorxiv/${doi}`;
        const data = await fetch(api).then((response) => {
            return response.json();
        });

        if (data.messages[0].status !== "ok")
            throw new Error(`${api} returned ${data.messages[0].status}`);
        const paper = data.collection.last();

        if (paper.published.startsWith("10.")) {
            doi = paper.published;
            const paperData = await fetchBibtexToPaper({ doi });
            ({ author, bibtex, key, note, title, venue, year } = paperData);
        } else {
            const pageText = await fetchText(pageURL);

            const dom = new DOMParser().parseFromString(
                pageText.replaceAll("\n", ""),
                "text/html",
            );
            const bibtextLink = dom.querySelector(".bibtext a").getAttribute("href");

            bibtex = bibtexToString(await (await fetch(bibtextLink)).text());
            author = extractAuthor(bibtex);

            key = bibtex.split("\n")[0].split("{")[1].replace(",", "").trim();
            note = "";
            title = paper.title;
            year = paper.date.split("-")[0];
            venue = "";
        }
        pdfLink = cleanBiorxivURL(url) + ".full.pdf";
        id = await parseIdFromUrl$1(url);

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makePMLRPaper = async (url) => {
        const key = url.split("/").last().split(".")[0];
        const id = await parseIdFromUrl$1(url);

        const absURL = url.includes(".html")
            ? url
            : url.split("/").slice(0, -2).join("/") + `/${key}.html`;

        const pdfLink = absURL.replace(".html", "") + `/${key}.pdf`;

        const dom = await fetchDom(absURL);

        const bibtexRaw = dom
            .getElementById("bibtex")
            .innerText.replaceAll("\t", " ")
            .replaceAll(/\s\s+/g, " ");
        let bibtex = bibtexRaw;
        const items = bibtexRaw.match(/,\ ?\w+ ?= ?{/g);
        for (const item of items) {
            bibtex = bibtex.replace(
                item,
                item.replace(", ", ",\n    ").replace(" = ", "="),
            );
        }
        if (bibtex.endsWith("}}")) {
            bibtex = bibtex.slice(0, -2) + "}\n}";
        }
        bibtex = bibtexToString(bibtex);

        const author = extractAuthor(bibtex);
        const title = dom.getElementsByTagName("h1")[0].innerText;
        const year = extractBibtexValue(bibtex, "year");

        let conf = extractBibtexValue(bibtex, "booktitle").replaceAll(
            "Proceedings of the",
            "",
        );
        let venue = conf;
        let note = `Accepted @ ${venue} (${year})`;
        for (const long in overridePMLRConfs) {
            if (conf.includes(long)) {
                venue = overridePMLRConfs[long];
                conf = venue + " " + year;
                note = "Accepted @ " + conf;
                break;
            }
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const findACLValue = (dom, key) => {
        const dt = queryAll("dt", dom).filter((v) => v.innerText.includes(key))[0];
        return dt.nextElementSibling.innerText;
    };

    const makeACLPaper = async (url) => {
        url = url.replace(".pdf", "");
        const dom = await fetchDom(url);

        const bibtexEl = dom.getElementById("citeBibtexContent");
        if (!bibtexEl) return;

        const title = dom.getElementById("title").innerText;
        const bibtex = bibtexToString(bibtexEl.innerText);

        const bibtexData = bibtexToObject(bibtex);

        const year = bibtexData.year;
        const author = bibtexData.author
            .replace(/\s+/g, " ")
            .split(" and ")
            .map((v) =>
                v
                    .split(",")
                    .map((a) => a.trim())
                    .reverse()
                    .join(" "),
            )
            .join(" and ");
        const key = bibtexData.citationKey;

        const venue = findACLValue(dom, "Venue");
        const pdfLink = findACLValue(dom, "PDF");
        const aid = findACLValue(dom, "Anthology ID");

        const id = `ACL-${venue}-${year}_${aid}`;
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makePNASPaper = async (url) => {
        /*
            https://www.pnas.org/doi/10.1073/pnas.2114679118
            https://www.pnas.org/doi/epdf/10.1073/pnas.2114679118
            https://www.pnas.org/doi/pdf/10.1073/pnas.2114679118
        */

        url = url.replace(".full.pdf", "").replace(/\/doi\/e?pdf\//, "/doi/abs/");
        const dom = await fetchDom(url);

        const title = dom.getElementsByTagName("h1")[0].innerText;
        const author = queryAll(
            ".authors span[property='author'] a:not([property='email']):not(.orcid-id)",
            dom,
        )
            .filter((el) => !el.getAttribute("href").includes("mailto:"))
            .map((el) => el.innerText)
            .join(" and ");

        const year = dom
            .querySelector("span[property='datePublished']")
            .innerText.match(/\d{4}/g)[0];

        const pid = url.endsWith("/")
            ? url.split("/").slice(-2)[0]
            : url.split("/").slice(-1)[0];

        const id = `PNAS-${year}_${pid}`;
        const pdfLink =
            url.includes("/doi/pdf/") || url.includes("/doi/epdf/")
                ? url.replace("/doi/epdf/", "/doi/pdf/")
                : url.replace("/doi/abs/", "/doi/pdf/").replace("/doi/full/", "/doi/pdf/");
        const doi = [...dom.querySelector(".core-container").getElementsByTagName("a")]
            .map((a) => a.getAttribute("href"))
            .filter((a) => a?.includes("https://doi.org"))[0]
            .split("/")
            .slice(-2)
            .join("/");
        const key = `doi:${doi}`;
        const bibtex = bibtexToString(`
    @article{${key},
        author={${author}},
        title={${title}},
        journal = {Proceedings of the National Academy of Sciences},
        year={${year}},
        doi={${doi}},
        eprint={${pdfLink}},
        URL={${pdfLink.replace("/doi/pdf/", "/doi/abs/")}}
    }`);
        const venue = "PNAS";

        const note = `Published @ PNAS (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeNaturePaper = async (url) => {
        url = url.replace(".pdf", "").split("#")[0];
        const pdfLink = url + ".pdf";
        const hash = url.split("/").last();

        const dom = await fetchDom(url);

        const title = dom.querySelector("h1.c-article-title").innerText;
        const author = queryAll("ul.c-article-author-list li", dom)
            .map((a) =>
                a.innerText
                    .replace(/(\ ?,)|&|…|\d/g, "")
                    .split(/orcid/i)[0]
                    .trim(),
            )
            .filter((a) => a.length > 0)
            .join(" and ");
        const year = dom
            .querySelector(".c-article-info-details")
            .innerText.match(/\(\d{4}\)/)[0]
            .replace(/\(|\)/g, "");
        const journal = dom.querySelector(".c-article-info-details [data-test]").innerText;
        const id = `Nature-${year}_${hash}`;

        const doiClasses = [
            ".c-bibliographic-information__citation",
            ".c-bibliographic-information__value",
        ];
        let doi;
        for (const doiClass of doiClasses) {
            doi = querySelector(doiClass)?.innerText.split("https://doi.org/")[1];
            if (doi) break;
        }
        if (!doi) {
            doi = [...dom.getElementsByTagName("span")]
                .map((a) => a.innerText)
                .filter((a) => a.includes("https://doi.org"))[0];
        }

        const key = `${author.split(" ")[1]}${year}${firstNonStopLowercase(title)}`;
        let bibData = {
            citationKey: key,
            entryType: "article",
            author,
            title,
            journal,
            year,
        };
        if (doi) {
            bibData.doi = doi;
            bibData.url = `https://doi.org/${doi}`;
        }
        const bibtex = bibtexToString(bibData);
        const note = `Published @ ${journal} (${year})`;
        const venue = journal;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeACSPaper = async (url) => {
        url = url.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
        const doi = url.replace("/abs/", "/").split("/doi/")[1];
        const citeUrl = `https://pubs.acs.org/action/downloadCitation?doi=${doi}&include=cit&format=bibtex&direct=true`;
        const bibtex = await fetchText(citeUrl);
        const data = bibtexToObject(bibtex);
        const author = data.author.replaceAll("\n", "").trim();
        const title = data.title.trim();
        const year = data.year.trim();
        const key = data.citationKey.trim();
        const pdfLink = `https://pubs.acs.org/doi/pdf/${doi}`;
        const note = `Published @ ${data.journal} (${data.year})`;
        const id = `ACS_${doi.replaceAll(".", "").replaceAll("/", "")}`;
        const venue = data.journal;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeIOPPaper = async (url) => {
        let author, bibtex, id, key, note, pdfLink, title, venue, year;
        url = url.split("#")[0];
        if (url.endsWith("/pdf")) url = url.slice(0, -4);

        const doi = url.split("/article/").last().split("/meta")[0];

        const data = await fetchBibtexToPaper({ doi });

        ({ author, bibtex, key, note, title, venue, year } = data);
        id = `IOPscience_${miniHash(doi)}`;
        pdfLink = url + "/pdf";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeJMLRPaper = async (url) => {
        if (url.includes("/papers/volume")) {
            url = url.replace("/papers/volume", "/papers/v");
        }
        if (url.endsWith(".pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        url = url.replace(".html", "");
        const jid = url.split("/").last();
        const citeUrl = url + ".bib";
        const bibtex = await fetchText(citeUrl);
        const data = bibtexToObject(bibtex);

        const { author, year, title, citationKey } = data;
        const key = citationKey.trim();
        const id = `JMLR-${year}_${jid}`;
        const note = `Published @ JMLR (${year})`;
        const pdfLink = url.replace("/papers/v", "/papers/volume") + `/${jid}.pdf`;
        const venue = "JMLR";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makePMCPaper = async (url) => {
        url = noParamUrl(url);
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        if (isPdfUrl$1(url)) {
            url = url.split("/pdf")[0];
        }
        const pmcid = url.includes("PMC")
            ? url.match(/PMC\d+/)[0].replace("PMC", "")
            : url.match(/ncbi.nlm.nih.gov\/(\d+)/)[1];
        const pdfLink = url + "/pdf";
        const html = await fetchText(url);
        const doi = html.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)[0];
        const { author, bibtex, key, note, title, venue, year } = await fetchBibtexToPaper({
            doi,
        });
        const id = `PMC-${year}_${pmcid}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeIJCAIPaper = async (url) => {
        const procId = url.endsWith(".pdf")
            ? url
                  .replace(".pdf", "")
                  .split("/")
                  .last()
                  .match(/[1-9]\d*/)[0]
            : url.split("/").last();

        const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];

        // ijcai bibtexs have issues with note = {NOTE}\n with a missing ","
        const bibtex = (
            await fetchText(`https://www.ijcai.org/proceedings/${year}/bibtex/${procId}`)
        ).replace(/}\n/gi, "},\n");
        const data = bibtexToObject(
            bibtex
                .split("\n")
                .filter((line) => !/note\s+=/gi.test(line))
                .join("\n"),
        );

        const key = data.citationKey;
        const title = data.title;
        const author = flipAndAuthors(data.author);
        const id = `IJCAI-${year}_${procId}`;
        const note = `Accepted @ IJCAI (${year})`;
        const venue = "IJCAI";
        const pdfId = procId.padStart(4, 0);
        const pdfLink = `https://www.ijcai.org/proceedings/${year}/${pdfId}.pdf`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeACMPaper = async (url) => {
        let author, year, title, venue, key, bibtex, note, id, doi, pdfLink;
        url = noParamUrl(url);
        if (isPdfUrl$1(url)) {
            pdfLink = url;
        } else {
            pdfLink = url.replace(/\/doi\/?(abs|full)?\//, "/doi/pdf/");
        }
        doi = "10.5555/" + url.split("10.5555/")[1];
        const response = await fetch("https://dl.acm.org/action/exportCiteProcCitation", {
            headers: {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            },
            referrer: `https://dl.acm.org/doi/${doi}`,
            body: `dois=${doi}&targetFile=custom-bibtex&format=bibTex`,
            method: "POST",
            mode: "cors",
        });
        if (response.ok) {
            const data = await response.json();
            if (data && data.items && data.items.length > 0) {
                const item = data.items[0][doi];
                title = item.title;
                author = item.author.map((a) => `${a.given} ${a.family}`).join(" and ");
                year = item.issued["date-parts"][0][0] + "";
                venue = item["collection-title"];
                const ISBN = item.ISBN;
                bibtex = bibtexToString({
                    entryType: "article",
                    citationKey: doi,
                    journal: venue,
                    doi,
                    title,
                    ISBN,
                    year,
                });
                id = `ACM-${year}_${miniHash(doi)}`;
                key = doi;
                note = `Published @ ${venue} (${year})`;
            } else {
                throw new Error("Insufficient data from ACM citation");
            }
        } else {
            throw new Error("Failed to fetch ACM citation", response);
        }

        if (venue.match(/'\d+/g)) {
            venue = venue.replace(/'\d+/g, "");
        }
        if (venue.match(/\d+/g)) {
            venue = venue.replace(/\d+/g, "");
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeIEEEPaper = async (url) => {
        if (isPdfUrl$1(url)) {
            const articleId = url
                .split("/stamp/stamp.jsp?tp=&arnumber=")[1]
                .match(/\d+/)[0];
            url = `https://ieeexplore.ieee.org/document/${articleId}/`;
        }
        const dom = await fetchDom(url);
        const metadata = JSON.parse(
            [...dom.getElementsByTagName("script")]
                .filter((s) => s.innerHTML?.includes("metadata="))[0]
                .innerHTML.split("metadata=")[1]
                .split(/};\s*/)[0] + "}",
        );

        const title = metadata.title;
        const author = metadata.authors.map((a) => a.name).join(" and ");
        const year = metadata.publicationYear;
        const pdfLink = `${parseUrl(url).origin}${metadata.pdfUrl}`;
        const venue = metadata.publicationTitle;
        const key = metadata.articleId;
        const bibtex = bibtexToString({
            entryType: "article",
            citationKey: key,
            journal: venue,
            volume: metadata.volume,
            pages: `${metadata.startPage}-${metadata.endPage}`,
            doi: metadata.doi,
            title,
            year,
            author,
        });
        const id = `IEEE-${year}_${key}`;
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeSpringerPaper = async (url) => {
        // https://link.springer.com/chapter/10.1007/978-981-16-1220-6_12
        // https://link.springer.com/article/10.1007/s00148-021-00864-z
        // https://link.springer.com/content/pdf/10.1007/s00148-021-00864-z.pdf
        // https://link.springer.com/article/10.1007/s00148-021-00864-z?noAccess=true
        // https://citation-needed.springer.com/v2/references/10.1007/s41095-022-0271-y?format=bibtex&flavour=citation
        const types = [...sourceExtras.springer.types, "content/pdf"];
        const springerType = types.find((c) => url.includes(`/${c}/`));
        if (!springerType) {
            throw new Error(
                `Could not find Springer type for ${url} (known: ${types.join(", ")})`,
            );
        }
        const doi = url.split(`/${springerType}/`)[1].split("?")[0].replace(".pdf", "");

        const { data } = await fetchCrossRefDataForDoi(doi);

        if (!data) {
            throw new Error("Aborting Springer paper parsing, see error above");
        }

        const { author, bibtex, citationKey, year, title, venue } = data;

        const id = `Springer-${year}_${miniHash(doi)}`;
        const note = `Published @ ${venue} (${year})`;

        const pdfLink =
            data.pdf ??
            (springerType === "content/pdf"
                ? url
                : url.replace(`/${springerType}/`, "/content/pdf/") + ".pdf");

        return {
            author,
            bibtex,
            id,
            key: citationKey,
            note,
            pdfLink,
            title,
            venue,
            year,
            extra: { url: `https://doi.org/${doi}` },
        };
    };

    const makeAPSPaper = async (url) => {
        url = url.split("#")[0];
        const [journal, type] = parseUrl(url).pathname.split("/").slice(1, 3);
        const doi = url.split(`/${journal}/${type}/`).last();
        const exportPath = url.replace(`/${journal}/${type}/`, `/${journal}/export/`);
        const bibtex = await fetchText(`${exportPath}?type=bibtex&download=true`);
        const data = bibtexToObject(bibtex);
        const pdfLink = url.replace(`/${journal}/${type}/`, `/${journal}/pdf/`);
        const id = `APS-${data.year}_${miniHash(doi)}`;
        const journalKey = data.journal ?? data.publisher;
        await readJournalAbbreviations();
        const venue = journalAbbreviations[miniHash(journalKey)] ?? journalKey;
        const note = `Published @ ${venue} (${data.year})`;
        return {
            author: flipAndAuthors(data.author),
            bibtex,
            id,
            key: data.citationKey,
            note,
            pdfLink,
            title: data.title,
            venue,
            year: data.year,
        };
    };

    const makeWileyPaper = async (url) => {
        url = noParamUrl(url);
        const pdfLink = url.match(/\/doi\/10\./g)
            ? url.replace("/doi/", "/doi/pdf/")
            : url.replace(/\/doi\/(abs|epdf|full)\//g, "/doi/pdf/");
        const absLink = pdfLink.replace("/doi/pdf/", "/doi/abs/");
        const doi = absLink.split("/doi/abs/")[1];
        const paper = await fetchBibtexToPaper({ doi });
        const { author, citationKey, title, year } = paper;
        const id = `Wiley-${year}_${miniHash(doi)}`;
        const bibtex = paper.bibtex;
        const venue = paper.journal;
        paper.publisher;
        const note = `Published @ ${venue} (${year})`;

        return {
            author,
            bibtex,
            id,
            key: miniHash(doi),
            note,
            pdfLink,
            title,
            venue,
            year,
            doi,
        };
    };

    const makeScienceDirectPaper = async (url) => {
        const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
        const bibtex = await fetchText(
            `https://www.sciencedirect.com/sdfe/arp/cite?pii=${pii}&format=text%2Fx-bibtex&withabstract=false`,
        );
        const data = bibtexToObject(bibtex);

        const { author, journal, year, doi, title, citationKey } = data;
        const note = `Published @ ${journal} (${year})`;
        const id = `ScienceDirect-${year}_${miniHash(pii)}`;
        const venue = journal ?? "Science Direct";
        const pdfLink = `https://reader.elsevier.com/reader/sd/pii/${pii}`;

        return { author, bibtex, id, key: citationKey, note, pdfLink, title, venue, year };
    };

    const makeSciencePaper = async (url) => {
        let author, bibtex, id, key, note, pdfLink, title, venue, year, doi, absUrl;

        doi = noParamUrl(url).split("/doi/")[1];
        if (!doi.startsWith("10.")) {
            doi = doi.split("/").slice(1).join("/");
        }
        pdfLink = `https://science.org/doi/pdf/${doi}`;
        absUrl = `https://science.org/doi/full/${doi}`;

        const { data } = await fetchCrossRefDataForDoi(doi);
        if (data) {
            ({ author, bibtex, title, venue, year } = data);
            key = data.citationKey;
            note = `Published @ ${venue} (${year})`;
        } else {
            const dom = await fetchDom(absUrl);
            ({ author, year, publisher, title, venue, key, bibtex, note } =
                extractDataFromDCMetaTags(dom));
        }

        id = `Science-${year}_${miniHash(doi)}`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeFrontiersPaper = async (url) => {
        url = url.replace(/\/pdf$/, "/full");
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        const doi = noParamUrl(url).split("/articles/")[1].split("/full")[0];
        const bib = await fetchText(noParamUrl(url).replace("/full", "") + "/bibTex");
        const data = Object.fromEntries(
            Object.entries(bibtexToObject(bib)).map(([k, v]) => [
                k === "citationKey" || k === "entryType" ? k : k.toLowerCase(),
                v,
            ]),
        );
        data.author = flipAndAuthors(data.author);
        delete data.abstract;
        const { author, journal, year, title, citationKey } = data;
        const bibtex = bibtexToString(data);

        const venue = journal;
        const note = `Published @ ${venue} (${year})`;
        const id = `Frontiers-${year}_${miniHash(doi)}`;
        const key = citationKey;
        const pdfLink = url.replace(/\/full$/, "/pdf");

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeIHEPPaper = async (url) => {
        let data, num;
        if (url.includes("/files/")) {
            const hash = url.split("/files/")[1].split("/")[0];
            const api = `https://inspirehep.net/api/literature?q=documents.key:${hash}`;
            const results = (await fetchJSON(api)).data;
            data = results.hits.hits.find(
                (h) => !!h.metadata.documents.find((d) => d.key === hash),
            );
            if (!data) {
                warn("Could not find an Inspire HEP record for the url", url);
                return;
            }
            num = data.metadata.control_number;
        } else {
            num = url.match(/\/literature\/(\d+)/)[1];
        }
        if (!num) {
            warn("Could not find an Inspire HEP id for the url", url);
            return;
        }
        const bibtex = await fetchText(
            `https://inspirehep.net/api/literature/${num}?format=bibtex`,
        );
        if (!data) {
            ({ data } = await fetchJSON(
                `https://inspirehep.net/api/literature/${num}?format=json`,
            ));
        }
        const bibObj = bibtexToObject(bibtex);
        let title = bibObj.title ?? data.metadata.titles[0].title;
        if (title.startsWith("{") && title.endsWith("}")) title = title.slice(1, -1);
        const pdfLink = data.metadata.documents?.[0]?.url ?? url;
        const author = flipAndAuthors(bibObj.author);
        const year = bibObj.year ?? data.created.split("-")[0];
        const id = `IHEP-${num}`;
        const venue = bibObj.journal ?? "Inspire HEP";
        const key = bibObj.citationKey;
        const note = `Published @ ${venue} (${year})`;
        const doi = bibObj.doi ?? "";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makePLOSPaper = async (url) => {
        const doi = url.split("?id=").last().split("&")[0];
        let { bibtex, key, author, venue, title, note, year } = await fetchBibtexToPaper({
            doi,
        });
        const pdfLink = `${url.split("/article")[0]}/article/file?id=${doi}&type=printable`;
        const section = url.split("journals.plos.org/")[1].split("/")[0];

        author = flipAndAuthors(author);
        const id = `PLOS-${section}_${miniHash(doi)}`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeRSCPaper = async (url) => {
        url = noParamUrl(url).replace("/unauth", "");
        const rscId = url.split("/").last();
        const type = url
            .split("/")
            .find(
                (s) => s === "articlehtml" || s === "articlepdf" || s === "articlelanding",
            )
            .replace("article", "");
        const pdfLink =
            type === "articlepdf" ? url : url.replace(`/article${type}/`, "/articlepdf/");

        let { bibtex, key, author, venue, title, note, year, doi } =
            await fetchBibtexToPaper({
                url: `https://pubs.rsc.org/en/content/formatedresult?markedids=${rscId}&downloadtype=article&managertype=bibtex`,
            });
        author = flipAndAuthors(author);
        const id = `RSC-${venue.replaceAll(" ", "")}_${miniHash(rscId)}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const parseAIPIdOrDOI = (url) => {
        if (isPdfUrl$1(noParamUrl(url))) {
            return {
                doi: noParamUrl(url)
                    .split("/")
                    .last()
                    .split("_")
                    .last()
                    .replace(".pdf", ""),
            };
        }
        return {
            aipId: url.includes("/article/")
                ? url.split("/article/")[1].split("/")[3]
                : url.includes("/article-split/")
                  ? url.split("/article-split/")[1].split("/")[3]
                  : url.split("/article-abstract/")[1].split("/")[3],
        };
    };
    const makeAIPPaper = async (url) => {
        url = noParamUrl(url);
        if (isPdfUrl$1(url)) {
            warn("PaperMemory cannot parse AIP papers from pdf urls");
            return;
        }
        const { aipId } = parseAIPIdOrDOI(url);
        const bibURL = `https://pubs.aip.org/Citation/Download?resourceId=${aipId}&resourceType=3&citationFormat=2`;
        const { author, bibtex, key, note, eprint, title, venue, year, doi } =
            await fetchBibtexToPaper({ url: bibURL });
        const id = `AIP-${year}_${miniHash(aipId)}`;
        const pdfLink = eprint.replaceAll("\\", "");
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeWebsitePaper = async (tab) => {
        const url = tab.url;
        const dom = await fetchDom(url);
        const og = Object.fromEntries(
            [...dom.querySelectorAll("meta")]
                .filter((m) => m.getAttribute("property"))
                .filter((m) => m.getAttribute("property").startsWith("og:"))
                .map((m) => [
                    m.getAttribute("property").replace("og:", ""),
                    m.getAttribute("content"),
                ]),
        );

        const author =
            og.site_name || parseUrl(url).hostname.replace("www.", "").capitalize();
        const year = new Date().getFullYear() + "";
        const id = `Website_${urlToWebsiteId(url)}`;
        const note = og.description || "";
        const pdfLink = url;
        const title = og.title || tab.title;
        const key = `${miniHash(author)}${year}${firstNonStopLowercase(title)}`;
        const venue = "";
        const accessDate = new Date().toISOString().split("T")[0];
        const bib = `@misc{${key},
        author = {${author}},
        title = {${title}},
        year = {${year}},
        url = {${url}},
        note = {Accessed ${accessDate}}
    }`;
        const bibtex = bibtexToString(bibtexToObject(bib));
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    };

    const makeMDPIPaper = async (url) => {
        url = noParamUrl(url);
        if (url.split("/").last().startsWith("pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        if (url.endsWith("/notes")) {
            url = url.replace("/notes", "");
        }
        if (url.endsWith("/reprints")) {
            url = url.replace("/reprints", "");
        }
        const dom = await fetchDom(url);
        let { author, year, publisher, title, venue, key, doi, bibtex, note, pdfLink } =
            extractDataFromDCMetaTags(dom);

        const id = `MDPI-${year}_${miniHash(url.split("mdpi.com/")[1])}`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeOUPPaper = async (url) => {
        url = noParamUrl(url);
        const resourceId = url.split("/").last();
        let bibtex = await fetchText(
            `https://academic.oup.com/Citation/Download?resourceId=${resourceId}&resourceType=3&citationFormat=2`,
        );
        const paper = bibtexToObject(bibtex);
        delete paper.abstract;
        bibtex = bibtexToString(paper);
        let { title, year, author, journal, doi, citationKey, eprint } = paper;
        author = flipAndAuthors(author);
        const venue = journal;
        const note = `Published @ ${venue} (${year})`;
        const key = citationKey;
        const num = url.split("https://academic.oup.com/")[1].split("/").slice(2).join("");
        const id = `OUP-${year}_${miniHash(num)}`;
        const pdfLink = eprint?.replaceAll("\\", "") ?? url;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeHALPaper = async (url) => {
        url = noParamUrl(url).replace(/(hal\.science\/\w+-\d+)(v\d+)?(\/document)?/, "$1"); // remove version
        const halId = url.match(/(hal-\d+)/)[1];
        const bibURL = `https://hal.science/${halId}/bibtex`;
        let bibtex = await fetchText(bibURL);
        const paper = bibtexToObject(bibtex);
        let { title, year, journal, author, doi, pdf } = paper;

        const venue = journal;
        const note = venue ? `Published @ ${venue} (${year})` : "";
        const key = paper.citationKey;
        author = flipAndAuthors(author);
        bibtex = bibtexToString(bibtex);
        const id = `HAL-${year}_${miniHash(halId)}`;
        const pdfLink = pdf ?? url;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const makeChemRxivPaper = async (url) => {
        let chemRxivId;
        let absUrl = url;
        if (isPdfUrl$1(url)) {
            chemRxivId = url.split("/item/")[1].split("/")[0];
            absUrl = "https://chemrxiv.org/engage/chemrxiv/article-details/" + chemRxivId;
        } else {
            chemRxivId = noParamUrl(url).split("/").last();
        }
        const dom = await fetchDom(absUrl);
        const { author, year, publisher, title, venue, key, doi, bibtex, pdfLink, note } =
            extractDataFromDCMetaTags(dom);
        const id = `ChemRxiv-${year}_${miniHash(chemRxivId)}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    };

    const findCellPii = async (url) => {
        const isPdf = url.toLowerCase().includes("showpdf");
        const isPdfExtended = url.toLowerCase().includes("pdfextended");
        let pii;
        if (isPdf || isPdfExtended) {
            const cellData = state.cellJournalData;
            pii = isPdf ? new URL(url).searchParams.get("pii") : url.split("/").last();
            const issn = pii.match(/\d{4}-\d{3}[0-9X]/g)[0];
            let venue;
            Object.entries(cellData).forEach(([key, value]) => {
                if (value.issn.includes(issn)) {
                    venue = key;
                }
            });
            const target = venue
                .split(" ")
                .map((w) => w.toLowerCase())
                .join("-");
            url = isPdf
                ? noParamUrl(url).split("/showPdf")[0] + `/${target}/fulltext/${pii}`
                : noParamUrl(url).split("/pdfExtended")[0] + `/fulltext/${pii}`;
            url = url.replace("/action/", "/");
        } else {
            pii = noParamUrl(url).split("/").last();
        }
        return { pii, url };
    };

    const makeCellPaper = async (url) => {
        let pii;
        ({ pii, url } = await findCellPii(url));
        const pdfLink = `https://www.cell.com/action/showPdf?pii=${pii}`;
        const dom = await fetchDom(url);
        const doi = dom.head
            .querySelector('meta[name="citation_doi"]')
            .getAttribute("content");
        const paper = await fetchBibtexToPaper({ doi });
        const { author, year, title, venue, bibtex, note, citationKey } = paper;
        const id = `Cell-${year}_${miniHash(url.split("cell.com/")[1])}`;
        return {
            author,
            bibtex,
            id,
            key: citationKey,
            note,
            pdfLink,
            title,
            venue,
            year,
            doi,
        };
    };

    // -------------------------------
    // -----  PREPRINT MATCHING  -----
    // -------------------------------

    const tryPWCMatch = async (paper) => {
        const pwcPrefs = (await getStorage("pwcPrefs")) ?? {};
        let bibtex;
        const payload = {
            type: "papersWithCode",
            pwcPrefs,
            paper: paper,
        };
        const { url, note, venue, pubYear } =
            (await sendMessageToBackground(payload)) ?? {};
        if (url && !paper.codeLink) {
            log("[PapersWithCode] Discovered a code repository:", url);
        } else {
            log("[PapersWithCode] No code repository found");
        }
        if (venue && !paper.venue) {
            log("[PapersWithCode] Found a publication venue:", venue);
            const paperBib = bibtexToObject(paper.bibtex);
            bibtex = bibtexToString({
                ...paperBib,
                year: pubYear,
                journal: venue,
            });
        } else if (!paper.venue) {
            log("[PapersWithCode] No publication found");
        }

        return {
            codeLink: url,
            note,
            venue,
            bibtex,
        };
    };

    // --------------------------------------------
    // -----  Try CrossRef's API for a match  -----
    // --------------------------------------------

    /**
     * Looks for a title in crossref's database, querying titles and looking for an exact match. If no
     * exact match is found, it will return an empty note "". If a match is found and `item.event.name`
     * exists, it will be used for a new note.
     * @param {object} paper The paper to look for in crossref's database for an exact title match
     * @returns {string} The note for the paper as `Accepted @ ${items.event.name} -- [crossref.org]`
     */
    const tryCrossRef = async (paper, toBackground) => {
        try {
            // fetch crossref' api for the paper's title
            const title = encodeURI(paper.title);
            const api = `https://api.crossref.org/works?rows=1&mailto=schmidtv%40mila.quebec&select=event%2Ctitle&query.title=${title}`;
            const json = await fetch(api).then((response) => response.json());

            // assert the response is valid
            if (json.status !== "ok") {
                log(`[Crossref] ${api} returned ${json.message.status}`);
                return {};
            }
            // assert there is a (loose) match
            if (json.message.items.length === 0) return {};

            // compare matched item's title to the paper's title
            const crossTitle = json.message.items[0].title[0]
                ?.toLowerCase()
                .replaceAll("\n", " ")
                .replaceAll(/\s\s+/g, " ");
            const refTitle = paper.title
                .toLowerCase()
                .replaceAll("\n", " ")
                .replaceAll(/\s\s+/g, " ");
            if (crossTitle !== refTitle) {
                return {};
            }

            // assert the matched item has an event with a name
            // (this may be too restrictive for journals, to improve)
            if (!json.message.items[0].event || !json.message.items[0].event.name) {
                return {};
            }

            // return the note
            info("Found a CrossRef match");
            const venue = json.message.items[0].event.name.trim();
            const note = `Accepted @ ${venue} -- [crossref.org]`;
            return { venue, note };
        } catch (error) {
            // something went wrong, log the error, return {}
            logError("[Crossref]", error);
            return {};
        }
    };

    const tryDBLP = async (paper, toBackground) => {
        try {
            const title = encodeURI(paper.title);
            const api = `https://dblp.org/search/publ/api?q=${title}&format=json`;
            const response = await fetch(api);

            if (response.status === 429) {
                return { status: 429 };
            }

            const json = await response.json();

            if (
                !json.result ||
                !json.result.hits ||
                !json.result.hits.hit ||
                !json.result.hits.hit.length
            ) {
                return {};
            }

            const hits = json.result.hits.hit.sort(
                (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10),
            );

            for (const hit of hits) {
                const hitTitle = decodeHtml(
                    hit.info.title
                        ?.toLowerCase()
                        .replaceAll("\n", " ")
                        .replaceAll(".", "")
                        .replaceAll(/\s\s+/g, " "),
                );
                const refTitle = paper.title
                    .toLowerCase()
                    .replaceAll("\n", " ")
                    .replaceAll(".", "")
                    .replaceAll(/\s\s+/g, " ");
                if (hitTitle === refTitle && hit.info.venue !== "CoRR") {
                    info("Found a DBLP match");
                    const bibtex = await fetchText(hit.info.url + ".bib");
                    const abbr = miniHash(hit.info.venue);
                    await readJournalAbbreviations();
                    const venue = (journalAbbreviations[abbr] ?? hit.info.venue).trim();
                    const year = hit.info.year;
                    const url = hit.info.url;
                    const note = `Accepted @ ${venue} ${year} -- [dblp.org]`;
                    return { venue, note, bibtex };
                }
            }
            return {};
        } catch (error) {
            // something went wrong, log the error, return {}
            logError("[DBLP]", error);
            return {};
        }
    };

    const trySemanticScholar = async (paper, toBackground) => {
        if (toBackground) {
            return await sendMessageToBackground({ type: "try-semantic-scholar", paper });
        }
        try {
            const { data, status } = await fetchJSON(
                `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURI(
                paper.title,
            )}&fields=title,venue,year,authors,externalIds,url&limit=5`,
            );
            const matches = data;

            if (matches && matches.data && matches.data.length > 0) {
                for (const match of matches.data) {
                    if (
                        miniHash(match.title) === miniHash(paper.title) &&
                        Math.abs(match.year - paper.year) < 3 &&
                        match.venue &&
                        !match.venue.toLowerCase().includes("arxiv") &&
                        !match.venue.toLowerCase().includes("biorxiv")
                    ) {
                        info("Found a Semantic Scholar match");
                        let venue = match.venue
                            .trim()
                            .replace(/^\d{4}/, "")
                            .trim();
                        if (venue.indexOf(" ") < 0) venue = venue.toUpperCase();
                        const year = (match.year + "").trim();
                        const note = `Accepted @ ${venue} (${year}) -- [semanticscholar.org]`;
                        const authors = match.authors.map((a) => a.name).join(" and ");
                        let doi = match.externalIds.DOI;
                        // if (doi) {
                        //     doi = doi.replaceAll("_", "\\{_}");
                        // }
                        const bibtex = bibtexToString({
                            entryType: "article",
                            citationKey:
                                miniHash(match.authors[0].name.split(" ").last()) +
                                year +
                                firstNonStopLowercase(paper.title),
                            title: paper.title,
                            author: authors,
                            journal: venue,
                            year,
                            doi,
                            bibSource: `Semantic Scholar ${match.url}`,
                        });
                        return { venue, note, bibtex, status };
                    }
                }
            }
            return { status };
        } catch (error) {
            logError("[SemanticScholar]", error);
        }
        return { status: 404 };
    };

    const tryGoogleScholar = async (paper) => {
        const resp = await sendMessageToBackground({ type: "google-scholar", paper });
        resp.note && info("Found a Google Scholar match", resp.note);
        return resp;
    };

    const tryUnpaywall = async (paper, toBackground) => {
        const url = `https://api.unpaywall.org/v2/search?query=${encodeURI(
        paper.title,
    )}&is_oa=true&email=papermemory+${parseInt(Math.random() * 1000)}@gmail.com`;
        const { data, status } = await fetchJSON(url);
        if (data && status === 200) {
            const match = data.results?.find(
                (m) => miniHash(m.response.title) === miniHash(paper.title),
            );
            if (match && match.journal_name) {
                const venue = match.journal_name;
                const note = `Accepted @ ${venue} (${match.year}) -- [unpaywall.org]`;
                const doi = match.doi;
                return { venue, note, doi };
            }
        }
        return { status };
    };

    const tryPreprintMatch = async (paper, tryPwc = false) => {
        let note, venue, bibtex, code, doi;
        let matches = {};

        let names = ["GoogleScholar", "SemanticScholar", "CrossRef", "DBLP", "Unpaywall"];
        let matchPromises = [
            silentPromiseTimeout(tryGoogleScholar(paper)),
            silentPromiseTimeout(trySemanticScholar(paper, true)),
            silentPromiseTimeout(tryCrossRef(paper)),
            silentPromiseTimeout(tryDBLP(paper)),
            silentPromiseTimeout(tryUnpaywall(paper)),
        ];

        if (tryPwc) {
            matchPromises.push(silentPromiseTimeout(tryPWCMatch(paper)));
            names.push("PapersWithCode");
        }

        for (const [n, name] of Object.entries(names)) {
            matches[name] = await matchPromises[n];
            ({ note, venue, bibtex, doi } = matches[name] ?? {});
            if (note) {
                break;
            } else {
                log(`[${name}] No publication found`);
            }
        }

        if (tryPwc) {
            const name = "PapersWithCode";
            if (!matches.hasOwnProperty(name)) {
                matches[name] = await silentPromiseTimeout(matchPromises[name]);
            }
            if (matches[name].codeLink && !paper.codeLink) {
                code = matches[name].codeLink;
            }
        }

        return { note, venue, bibtex, code, doi };
    };

    // -----------------------------
    // -----  Creating papers  -----
    // -----------------------------

    const initPaper = async (paper) => {
        if (!paper.note) {
            paper.note = "";
        }

        paper.md = `[${paper.title}](${paper.pdfLink})`;
        paper.tags = [];
        paper.codeLink = paper.codeLink ?? "";
        paper.favorite = false;
        paper.favoriteDate = "";
        paper.addDate = new Date().toJSON();
        paper.lastOpenDate = paper.addDate;
        paper.count = 1;
        paper.code = {};
        paper.doi = paper.doi ?? bibtexToObject(paper.bibtex).doi ?? "";
        for (const k in paper) {
            if (paper.hasOwnProperty(k) && typeof paper[k] === "string") {
                paper[k] = paper[k].trim();
            }
        }

        paper = await autoTagPaper(paper);
        validatePaper(paper);

        return paper;
    };

    const autoTagPaper = async (paper) => {
        try {
            const autoTags = await getStorage("autoTags");
            if (!autoTags || !autoTags.length) return paper;
            let tags = new Set();
            for (const at of autoTags) {
                if (!at.tags?.length) continue;
                if (!at.title && !at.author) continue;

                const titleMatch = at.title
                    ? new RegExp(at.title, "i").test(paper.title)
                    : true;
                const authorMatch = at.author
                    ? new RegExp(at.author, "i").test(paper.author)
                    : true;

                if (titleMatch && authorMatch) {
                    at.tags.forEach((t) => tags.add(t));
                }
            }
            paper.tags = [...tags].sort();
            if (paper.tags.length) {
                log("Automatically adding tags:", paper.tags);
            }
            return paper;
        } catch (error) {
            log("Error auto-tagging:", error);
            log("Paper:", paper);
            return paper;
        }
    };

    const makePaper = async (is, url, tab = false) => {
        let paper;
        let start = performance.now();
        info("Making paper...");
        try {
            if (tab) {
                paper = await makeWebsitePaper(tab);
                if (paper) {
                    paper.source = "website";
                }
            } else if (is.arxiv) {
                paper = await makeArxivPaper(url);
                if (paper) {
                    paper.source = "arxiv";
                }
                // paper.codes = await fetchCodes(paper)
            } else if (is.neurips) {
                paper = await makeNeuripsPaper(url);
                if (paper) {
                    paper.source = "neurips";
                }
                // paper.codes = await fetchCodes(paper);
            } else if (is.cvf) {
                paper = await makeCVFPaper(url);
                if (paper) {
                    paper.source = "cvf";
                }
            } else if (is.openreview) {
                paper = await makeOpenReviewPaper(url);
                if (paper) {
                    paper.source = "openreview";
                }
            } else if (is.biorxiv) {
                paper = await makeBioRxivPaper(url);
                if (paper) {
                    paper.source = "biorxiv";
                }
            } else if (is.pmlr) {
                paper = await makePMLRPaper(url);
                if (paper) {
                    paper.source = "pmlr";
                }
            } else if (is.acl) {
                paper = await makeACLPaper(url);
                if (paper) {
                    paper.source = "acl";
                }
            } else if (is.pnas) {
                paper = await makePNASPaper(url);
                if (paper) {
                    paper.source = "pnas";
                }
            } else if (is.nature) {
                paper = await makeNaturePaper(url);
                if (paper) {
                    paper.source = "nature";
                }
            } else if (is.acs) {
                paper = await makeACSPaper(url);
                if (paper) {
                    paper.source = "acs";
                }
            } else if (is.iop) {
                paper = await makeIOPPaper(url);
                if (paper) {
                    paper.source = "iop";
                }
            } else if (is.jmlr) {
                paper = await makeJMLRPaper(url);
                if (paper) {
                    paper.source = "jmlr";
                }
            } else if (is.pmc) {
                paper = await makePMCPaper(url);
                if (paper) {
                    paper.source = "pmc";
                }
            } else if (is.ijcai) {
                paper = await makeIJCAIPaper(url);
                if (paper) {
                    paper.source = "ijcai";
                }
            } else if (is.acm) {
                paper = await makeACMPaper(url);
                if (paper) {
                    paper.source = "acm";
                }
            } else if (is.ieee) {
                paper = await makeIEEEPaper(url);
                if (paper) {
                    paper.source = "ieee";
                }
            } else if (is.springer) {
                paper = await makeSpringerPaper(url);
                if (paper) {
                    paper.source = "springer";
                }
            } else if (is.aps) {
                paper = await makeAPSPaper(url);
                if (paper) {
                    paper.source = "aps";
                }
            } else if (is.wiley) {
                paper = await makeWileyPaper(url);
                if (paper) {
                    paper.source = "wiley";
                }
            } else if (is.sciencedirect) {
                paper = await makeScienceDirectPaper(url);
                if (paper) {
                    paper.source = "sciencedirect";
                }
            } else if (is.science) {
                paper = await makeSciencePaper(url);
                if (paper) {
                    paper.source = "science";
                }
            } else if (is.frontiers) {
                paper = await makeFrontiersPaper(url);
                if (paper) {
                    paper.source = "frontiers";
                }
            } else if (is.ihep) {
                paper = await makeIHEPPaper(url);
                if (paper) {
                    paper.source = "ihep";
                }
            } else if (is.plos) {
                paper = await makePLOSPaper(url);
                if (paper) {
                    paper.source = "plos";
                }
            } else if (is.rsc) {
                paper = await makeRSCPaper(url);
                if (paper) {
                    paper.source = "rsc";
                }
            } else if (is.mdpi) {
                paper = await makeMDPIPaper(url);
                if (paper) {
                    paper.source = "mdpi";
                }
            } else if (is.oup) {
                paper = await makeOUPPaper(url);
                if (paper) {
                    paper.source = "oup";
                }
            } else if (is.hal) {
                paper = await makeHALPaper(url);
                if (paper) {
                    paper.source = "hal";
                }
            } else if (is.chemrxiv) {
                paper = await makeChemRxivPaper(url);
                if (paper) {
                    paper.source = "chemrxiv";
                }
            } else if (is.cell) {
                paper = await makeCellPaper(url);
                if (paper) {
                    paper.source = "cell";
                }
            } else if (is.aip) {
                paper = await makeAIPPaper(url);
                if (paper) {
                    paper.source = "aip";
                }
            } else {
                console.error({ is, url });
                throw new Error(
                    "Could not parse paper (in `makePaper`). Unknown paper source, see above.",
                );
            }
        } catch (e) {
            logError("Error in makePaper:", e);
            return;
        }

        if (typeof paper === "undefined") {
            return;
        }
        const elapsed = (performance.now() - start) / 1000;
        info(`Paper parsed in ${elapsed.toFixed(2)}s`);

        return await initPaper(paper);
    };

    // ES Module imports

    var STOPMATCH = false;
    var DISABLE_MATCH = {};

    const setListeners = () => {
        addListener("match-bib-stop", "click", () => {
            STOPMATCH = true;
            setHTML("match-bib-stop", '<span class="loader"></span>');
        });
        addListener("copy-results", "click", () => {
            copyTextToClipboard(findEl({ element: "match-results" }).innerText);
            setHTML("copy-results", "Copied!");
            setTimeout(() => {
                setHTML("copy-results", "Copy to clipboard");
            }, 1500);
        });
        addListener("bib-text", "keydown", (e) => {
            if (document.activeElement === findEl({ element: "bib-text" })) {
                if ((e.metaKey || e.ctrlKey) && e.keyCode == 13) {
                    dispatch("match-bib", "click");
                    findEl({ element: "match-bib" }).focus();
                }
            }
        });
        addListener("match-bib", "click", async () => {
            resetMatchResults();
            const text = findEl({ element: "bib-text" }).value;
            let parsed, stop;

            try {
                parsed = parseBibText(text);
            } catch (error) {
                showError(error);
                stop = true;
            }
            if (stop) return;

            console.log("parsed: ", parsed);
            let arxivIndices = [];
            let arxivs = [];
            for (const [idx, entry] of parsed.entries()) {
                if (JSON.stringify(entry).toLowerCase().includes("arxiv")) {
                    arxivIndices.push(idx);
                    arxivs.push(entry);
                }
            }
            parsed = parsed.map((entry) => {
                return {
                    ...entry.entryTags,
                    entryType: entry.entryType,
                    citationKey: entry.citationKey,
                };
            });
            arxivs = arxivs.map((entry) => {
                return {
                    ...entry.entryTags,
                    entryType: entry.entryType,
                    citationKey: entry.citationKey,
                };
            });

            console.log("arxivs: ", arxivs);
            showId("matching-feedback-container");
            arxivs.length
                ? setHTML(
                      "n-arxivs",
                      `Matching ${arxivs.length} arXiv entries, out of ${parsed.length} total entries:`
                  )
                : setHTML(
                      "n-arxivs",
                      `No arXiv entries found in ${parsed.length} total entries.`
                  );
            const matched = arxivs.length ? await matchItems(arxivs) : [];
            matched.length &&
                setTimeout(() => {
                    findEl({ element: "papers-successfully-matched" })?.scrollIntoView(
                        true
                    );
                }, 250);
            showBibliography(parsed, matched, arxivIndices);
            addListener("show-only-matches", "change", () => {
                showBibliography(parsed, matched, arxivIndices);
            });
        });
    };

    const resetMatchResults = () => {
        STOPMATCH = false;
        DISABLE_MATCH = {};
        hideId("result-controls");
        hideId("match-results");
        setHTML("match-results", "");
        hideId("your-bibliography");
        setHTML("bib-desc", "");
        hideId("errors-container");
        setHTML("bibmatch-errors", "");
        hideId("matching-feedback-container");
        hideId("matched-list-container");
        hideId("your-bib-container");
        updateStatusInfo();
    };

    const updateStatusInfo = () => {
        const display = {
            dblp: "DBLP.org",
            semanticscholar: "Semantic Scholar",
            googleScholar: "Google Scholar",
            crossref: "CrossRef",
            unpaywall: "Unpaywall",
        };
        let reasons = Object.entries(DISABLE_MATCH)
            .map(
                ([key, value]) =>
                    `Disabling ${display[key]} for this matching process because the server returned a status of ${value}`
            )
            .join("<br/>");
        if (reasons) {
            reasons += `<br>
            <a href='https://developer.mozilla.org/en-US/docs/Web/HTTP/Status' target='_black' id="html-status-codes">
            About HTTP status codes
            </a>
            `;
        }
        setHTML("status-info", reasons);
    };

    const showBibliography = (parsed, matched, arxivIndices) => {
        const nMatched = matched.filter((e) => e).length;
        if (!parsed.length) return;
        const showOnlyMatches = val("show-only-matches");
        const desc = showOnlyMatches
            ? `<p>Showing only ${nMatched} new matched entries</p>`
            : `<p>Showing all ${parsed.length} entries (with ${nMatched} updated match${
              nMatched > 1 ? "s" : ""
          })</p>`;
        if (showOnlyMatches) {
            const html = matched
                .filter((e) => e)
                .map(bibtexToString)
                .join("<br/>");
            showId("match-results");
            setHTML("match-results", html);
            showId("result-controls", "flex");
        } else {
            let htmls = [];
            for (const [idx, entry] of parsed.entries()) {
                if (arxivIndices.includes(idx)) {
                    if (matched[arxivIndices.indexOf(idx)]) {
                        htmls.push(bibtexToString(matched[arxivIndices.indexOf(idx)]));
                    } else {
                        htmls.push(bibtexToString(entry));
                    }
                } else {
                    htmls.push(bibtexToString(entry));
                }
            }
            const html = htmls.join("<br/>");
            showId("match-results");
            setHTML("match-results", html);
            showId("result-controls", "flex");
        }
        showId("your-bib-container");
        showId("your-bibliography");
        setHTML("bib-desc", desc);
    };

    const parseBibText = (text) => {
        var b = new BibtexParser();
        b.setInput(text);
        b.bibtex();
        return b.getEntries();
    };

    const setKey = (bibtex, key) => {
        const obj = bibtexToObject(bibtex);
        obj.citationKey = key;
        return bibtexToString(obj);
    };

    const showError = (msg) => {
        showId("errors-container");
        setHTML("bibmatch-errors", msg);
    };

    const matchPaper = async (paper) => {
        let bibtex, match, source, venue;

        if (!DISABLE_MATCH.dblp) {
            setHTML("matching-status-provider", "dblp.org ...");
            match = await tryDBLP(paper);
            match?.bibtex && console.log("dblpMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "DBLP";
            if (match.status && !("" + match.status).startsWith("2")) {
                DISABLE_MATCH.dblp = match.status;
                updateStatusInfo();
            }
        }

        if (!bibtex && !DISABLE_MATCH.semanticscholar) {
            setHTML("matching-status-provider", "semanticscholar.org ...");
            match = await trySemanticScholar(paper);
            match?.bibtex && console.log("semanticScholarMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "Semantic Scholar";
            if (match.status && !("" + match.status).startsWith("2")) {
                DISABLE_MATCH.semanticscholar = match.status;
                updateStatusInfo();
            }
        }
        if (!bibtex && !DISABLE_MATCH.googleScholar) {
            setHTML("matching-status-provider", "scholar.google.com ...");
            match = await tryGoogleScholar(paper);
            match?.bibtex && console.log("googleScholarMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "Google Scholar";
        }
        if (!bibtex && !DISABLE_MATCH.crossref) {
            setHTML("matching-status-provider", "crossref.org ...");
            match = await tryCrossRef(paper);
            venue = match.venue;
            if (venue) {
                paper.journal = venue;
                for (const [key, value] of paper.entries()) {
                    if ((value + "").toLowerCase().includes("arxiv")) {
                        delete paper[key];
                    }
                }
                bibtex = bibtexToString(paper);
                source = "CrossRef";
            }
            match?.venue && console.log("crossRefMatch: ", match);
            if (match.status && !("" + match.status).startsWith("2")) {
                DISABLE_MATCH.crossref = match.status;
                updateStatusInfo();
            }
        }
        if (!bibtex && !DISABLE_MATCH.unpaywall) {
            setHTML("matching-status-provider", "unpaywall.org ...");
            match = await tryUnpaywall(paper);
            venue = match?.venue;
            if (venue) {
                paper.journal = venue;
                for (const [key, value] of paper.entries()) {
                    if ((value + "").toLowerCase().includes("arxiv")) {
                        delete paper[key];
                    }
                }
                bibtex = bibtexToString(paper);
                source = "Unpaywall";
            }
            match?.venue && console.log("unpaywallMatch: ", match);
            if (match.status && !("" + match.status).startsWith("2")) {
                DISABLE_MATCH.unpaywall = match.status;
                updateStatusInfo();
            }
        }
        return { bibtex, match, source, venue };
    };

    const matchItems = async (papersToMatch) => {
        showId("matching-progress-container");
        showId("matching-feedback-container", "flex");
        setHTML("matching-status-total", papersToMatch.length);
        showId("match-bib-stop", "flex");
        setHTML(
            "matching-status",
            `<div id="matching-status-title"></div>
            <div>
                Looking for publications on <span id="matching-status-provider"></span>
            </div>
        </div>`
        );

        const progressbar = querySelector("#matching-progress-bar");
        const changeProgress = (progress) => {
            progressbar.style.width = `${progress}%`;
        };
        changeProgress(0);

        const keepKeys = val("keep-keys");
        const apiTimeout = val("api-timeout");

        let matchedBibtexStrs = [];
        let sources = [];
        let venues = [];

        for (const [idx, paper] of papersToMatch.entries()) {
            setHTML("matching-status-index", idx + 1);
            setHTML(
                "matching-status-title",
                paper.title.replaceAll("{", "").replaceAll("}", "")
            );
            changeProgress(parseInt((idx / papersToMatch.length) * 100));

            apiTimeout && idx > 0 && (await sleep(3000));

            let { bibtex, source, venue } = await matchPaper(paper);

            if (bibtex) {
                if (keepKeys) {
                    bibtex = setKey(bibtex, paper.citationKey);
                }
                sources.push(source);
                venues.push(venue);
                matchedBibtexStrs.push(bibtex);
                updateMatchedTitles(matchedBibtexStrs, sources, venues);
            } else {
                matchedBibtexStrs.push(null);
            }

            if (idx === 0) {
                showId("matched-list-container", "flex");
            }

            if (STOPMATCH) {
                STOPMATCH = false;
                DISABLE_MATCH = {};
                setHTML("matching-status", "Interrupted<br/><br/>");
                hideId("match-bib-stop");
                setHTML("match-bib-stop", "Stop");
                return matchedBibtexStrs;
            }
        }
        updateMatchedTitles(matchedBibtexStrs, sources, venues);
        hideId("match-bib-stop");
        changeProgress(100);
        setHTML("matching-status", "All done!<br/><br/>");
        return matchedBibtexStrs;
    };

    const updateMatchedTitles = (matchedBibtexStrs, sources, venues) => {
        const htmls = [];
        const entries = matchedBibtexStrs.filter((e) => e).map(bibtexToObject);
        if (entries.length) {
            const keys = entries.map((e) => e.citationKey);
            const titles = entries.map((e) =>
                e.title.replaceAll("{", "").replaceAll("}", "")
            );
            htmls.push("<table id='result-titles-table' class='w-100'>");
            for (const [idx, title] of titles.entries()) {
                htmls.push(
                    `<tr>
                    <th class="match-citation-key">${keys[idx]}</th>
                    <th class='match-title'>${title}</th>
                    <th class="match-venue">${venues[idx]}</th>
                    <th class="match-source">${sources[idx]}</th>
                </tr>`
                );
            }
            htmls.push("</table>");
        }
        setHTML(
            "matched-list",
            `<h4 id="papers-successfully-matched">Papers successfully matched: ${entries.length}</h4>` +
                htmls.join("")
        );
    };

    (async () => {
        resetMatchResults();
        setListeners();
    })();

})();
//# sourceMappingURL=bibMatcher.bundle.js.map

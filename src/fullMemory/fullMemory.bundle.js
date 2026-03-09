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
            Object.values(papers).map((paper) => [paper.id, miniHash(paper.title)])
        );
        // filter non-existing file handles
        files = files.filter(
            (f) =>
                f.exists &&
                f.state === "complete" &&
                !f.filename.toLowerCase().includes("readme.txt")
        );
        // pre-compute file's simplified titles
        const fileTitles = Object.fromEntries(
            files.map((f) => [f.id, miniHash(f.filename)])
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
                    candidateFileTitle.includes(title)
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
            ([id, file]) => file.filename === filePath
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

        const cellPath = chrome.runtime.getURL("src/data/cell.json");
        state.cellJournalData = await fetch(cellPath).then((res) => res.json());
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
            orderPapers(descendingSortKeys.indexOf(state.sortKey) >= 0)
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
        const iso4Path = chrome.runtime.getURL("src/data/iso4-journals.json");
        const iso4 = await fetch(iso4Path).then((res) => res.json());
        const abbrPath = chrome.runtime.getURL("src/data/journal-abbreviations.json");
        const abbr = await fetch(abbrPath).then((res) => res.json());
        const newAbbreviations = Object.fromEntries(
            [...Object.entries(iso4), ...Object.entries(abbr)].map(([k, v]) => [
                miniHash(k),
                v,
            ])
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
                        files
                    );
                    resolve(matches);
                }
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
                `/content_${conf.toLowerCase()}_${year}/`
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
            response.ok ? response.text() : ""
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
                `https://citation.doi.org/format?doi=${doi}&style=bibtex&lang=en-US`
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
            `https://api.crossref.org/works/${doi}?mailto=schmidtv%40mila.quebec`
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
                (el) => el.getAttribute("content") ?? ""
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
            (v, k) => k >= 1 && miniHash(v).length > 1 // ignore middle initials
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
            "text/xml"
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
                (h) => h.innerText === "Authors"
            )[0];

            author = h4Authors.nextElementSibling.innerText
                .split(", ")
                .map((author) =>
                    author
                        .split(" ")
                        .map((p) => p.capitalize())
                        .join(" ")
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
            "text/html"
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

            Try accessing this URL manually to make sure.`)
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
            paper.content._bibtex || makeOpenReviewBibTex(paper, url)
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
                          r?.content?.title
                      ) > -1
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
                "text/html"
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
                item.replace(", ", ",\n    ").replace(" = ", "=")
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
            ""
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
                    .join(" ")
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
            dom
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
                    .trim()
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
                .join("\n")
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
                .split(/};\s*/)[0] + "}"
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
                `Could not find Springer type for ${url} (known: ${types.join(", ")})`
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
            `https://www.sciencedirect.com/sdfe/arp/cite?pii=${pii}&format=text%2Fx-bibtex&withabstract=false`
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
            ])
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
                (h) => !!h.metadata.documents.find((d) => d.key === hash)
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
            `https://inspirehep.net/api/literature/${num}?format=bibtex`
        );
        if (!data) {
            ({ data } = await fetchJSON(
                `https://inspirehep.net/api/literature/${num}?format=json`
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
                (s) => s === "articlehtml" || s === "articlepdf" || s === "articlelanding"
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
                ])
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
            `https://academic.oup.com/Citation/Download?resourceId=${resourceId}&resourceType=3&citationFormat=2`
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
                (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10)
            );

            for (const hit of hits) {
                const hitTitle = decodeHtml(
                    hit.info.title
                        ?.toLowerCase()
                        .replaceAll("\n", " ")
                        .replaceAll(".", "")
                        .replaceAll(/\s\s+/g, " ")
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
        {
            return await sendMessageToBackground({ type: "try-semantic-scholar", paper });
        }
    };

    const tryGoogleScholar = async (paper) => {
        const resp = await sendMessageToBackground({ type: "google-scholar", paper });
        resp.note && info("Found a Google Scholar match", resp.note);
        return resp;
    };

    const tryUnpaywall = async (paper, toBackground) => {
        const url = `https://api.unpaywall.org/v2/search?query=${encodeURI(
        paper.title
    )}&is_oa=true&email=papermemory+${parseInt(Math.random() * 1000)}@gmail.com`;
        const { data, status } = await fetchJSON(url);
        if (data && status === 200) {
            const match = data.results?.find(
                (m) => miniHash(m.response.title) === miniHash(paper.title)
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
            silentPromiseTimeout(trySemanticScholar(paper)),
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
                "Could not parse paper (in `makePaper`). Unknown paper source, see above."
            );
        }

        if (typeof paper === "undefined") {
            return;
        }
        const elapsed = (performance.now() - start) / 1000;
        info(`Paper parsed in ${elapsed.toFixed(2)}s`);

        return await initPaper(paper);
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

    // ES Module imports

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
                isPdfUrl(window.location.href) ? paperToAbs(paper) : paperToPDF(paper)
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
                            }
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
            const height = isPopup
                ? findEl({ element: "memory-container" }).getBoundingClientRect().height
                : window.innerHeight;
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
            addListener("ar5iv-modal-cancel-button", "click", closePopupModal);
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
            getTagsOptions(paper)
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
        const tagSelect2 = $(findEl({ paperId: id, memoryItemClass: "memory-item-tags" }));

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
                "favorite"
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
                "favorite"
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
            ["INPUT", "TEXTAREA"].includes(el.tagName)
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
                "click"
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
                "click"
            );
        } else if (key === "c") {
            // copy link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-copy-link" }),
                "click"
            );
        } else if (key === "m") {
            // copy link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-md" }),
                "click"
            );
        } else if (key === "b") {
            // copy bibtex
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-bibtex" }),
                "click"
            );
        } else if (key === "5") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-ar5iv" }),
                "click"
            );
        } else if (key === "x") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-alphaxiv" }),
                "click"
            );
        } else if (key === "f") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-huggingface" }),
                "click"
            );
        } else if (key === "s") {
            // copy pdf link
            dispatch(
                localFindEl({ id, paperItem, memoryItemClass: "memory-item-scirate" }),
                "click"
            );
        } else if (key === "h") {
            // copy hyperlink
            dispatch(
                localFindEl({
                    id,
                    paperItem,
                    memoryItemClass: "memory-item-copy-hyperlink",
                }),
                "click"
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
                "click"
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
                    (command) => command.name === "manualParsing"
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

            $(refTags).on("change", delay(monitorPaperEdits(id, isPopup), 300)); // select2 required
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
                delay(monitorPaperEdits(undefined, isPopup), 300)
            );
            addEventToClass(
                refNote,
                "keyup",
                delay(monitorPaperEdits(undefined, isPopup), 300)
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
            getHandleTitleTooltip(showTitleTooltip, 0)
        );
        addEventToClass(
            ".memory-display-id",
            "mouseleave",
            getHandleTitleTooltip(hideTitleTooltip, 10000)
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
            delay(handleMemorySearchKeyPress(), delayTime)
        );
        addListener("memory-search", "clear-search", handleMemorySearchKeyPress(true));
        addListener("memory-search", "keyup", handleMemorySearchKeyUp);
        addListener("delete-paper-modal-cancel-button", "click", handleCancelModalClick);
        addListener(
            "delete-paper-modal-confirm-button",
            "click",
            handleConfirmDeleteModalClick
        );
        addListener("filter-favorites", "click", handleFilterFavorites);
        // listen to sorting feature change
        addListener("memory-select", "change", handleMemorySelectChange);
        // listen to sorting direction change
        addListener("memory-sort-arrow", "click", handleMemorySortArrow);
        addListener("memory-container", "scroll", displayOnScroll(true));
    };

    // ES Module imports

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
            author.split(" and ")[0].split(" ").last()
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
                url: chrome.runtime.getURL("src/fullMemory/fullMemory.html"),
            });
        });
        // Set BibMatcher page link
        addListener("bib-matcher", "click", () => {
            chrome.tabs.create({
                url: chrome.runtime.getURL("src/bibMatcher/bibMatcher.html"),
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
                    '<div id="popup-title-tooltip" style="display: none;">'
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
            $(`#popup-item-tags--${eid}`).select2({
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
                getHandleTitleTooltip(showTitleTooltip, 0, true)
            );
            addEventToClass(
                ".popup-display-id",
                "mouseleave",
                getHandleTitleTooltip(hideTitleTooltip, 10000, true)
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
                    addListener("ar5iv-modal-cancel-button", "click", closePopupModal);
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
                            `<h3>Error</h3><div>${error}</div>`
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
            window.location.href.includes("popup") &&
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
        const artPath = chrome.runtime.getURL("src/data/art.json");
        const art = await fetch(artPath).then((res) => res.json());
        const nArts = Object.keys(art).length;
        const u = Math.floor(Math.random() * nArts);
        const [animal, ascii] = Object.entries(art)[u];
        return { animal, ascii };
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
                                    }
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
                    : /*html*/ `<div class="memory-note-div memory-item-faded"></div>`
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
                displayLink
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
                    "favorite"
                );
            } else {
                removeClass(`memory-container--${id}`, "favorite");
                removeClass(
                    findEl({
                        paperId: id,
                        memoryItemClass: "memory-item-favorite",
                    }).querySelector("svg"),
                    "favorite"
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
                .join("")
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
                    findEl({ paperId: id, memoryItemClass: "tag-list" })
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
            (pagination + 1) * state.memoryItemsPerPage
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

    // ES Module imports

    var REFRESH_INTERVAL_SECS = 5 * 60;
    // var REFRESH_INTERVAL_SECS = 20;

    const adjustCss = () => {
        const container = document.getElementById("memory-filters");
        const searchBar = document.getElementById("memory-search");
        searchBar.style.width = `${0.4 * container.clientWidth}px`;
    };

    const autoRefresh = () => {
        if (window.location.href.includes("?noRefresh=true")) {
            warn("No auto refresh");
            return;
        }
        info(`Enabling auto refresh if inactive for ${REFRESH_INTERVAL_SECS} seconds.`);
        const reload = () => {
            window.location.reload();
        };

        let time;

        const resetTimer = () => {
            clearTimeout(time);
            time = setTimeout(reload, REFRESH_INTERVAL_SECS * 1000);
        };
        const events = ["click", "keypress", "touchstart"];
        events.forEach(function (name) {
            document.addEventListener(name, resetTimer, true);
        });
        resetTimer();
    };

    const syncOnBlur = async () => {
        if (!(await shouldSync())) return;
        window.addEventListener(
            "blur",
            delay(async () => {
                info("Syncing back and forth...");
                await pushToRemote();
                await initSyncAndState();
            }, 10e3)
        );
    };

    (async () => {
        await initSyncAndState();
        makeMemoryHTML();
        addListener("memory-search-clear-icon", "click", handleClearSearch);
        addListener(document, "scroll", displayOnScroll(false));
        // set default sort to lastOpenDate
        val("memory-select", "lastOpenDate");
        // set default sort direction arrow down
        setMemorySortArrow("down");
        adjustCss();
        autoRefresh();
        syncOnBlur();
    })();

})();
//# sourceMappingURL=fullMemory.bundle.js.map

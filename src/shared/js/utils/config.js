/**
 * Prototypes
 */

Object.defineProperty(Array.prototype, "last", {
    value: function (i = 0) {
        return this.reverse()[i];
    },
});

Object.defineProperty(String.prototype, "capitalize", {
    value: function (all = false) {
        if (all)
            return this.split(" ")
                .map((s) => s.capitalize())
                .join(" ");
        return this.charAt(0).toUpperCase() + this.slice(1).toLowerCase();
    },
});

/**
 * Global variable & constants are stored in this file to be used by
 * other files such as functions.js, parsers.js, memory.js, popup.js
 */

var global = {};
if (typeof window !== "undefined") {
    global = window;
}

/**
 * Set uninstall URL
 */
chrome?.runtime?.setUninstallURL &&
    chrome?.runtime?.setUninstallURL("https://forms.gle/1JSV8PcxQugRmsd46");

/**
 * The popup's global state to store data across functions
 */
global.state = {
    currentMemoryPagination: 0,
    dataVersion: 0,
    deleted: {}, // (id => bool)
    files: {},
    ignoreSources: {}, // (source => bool)
    lastRefresh: new Date(),
    memoryIsOpen: false,
    memoryItemsPerPage: 25,
    menuIsOpen: false,
    papers: {}, // (id => object)
    papersList: [], // [papers]
    papersReady: false,
    paperTags: new Set(), // (Set(string))
    pdfTitleFn: null, // function(paper) => string
    prefs: {}, // (prefsCheckKey => bool)
    showFavorites: false,
    sortedPapers: [], // [papers]
    sortKey: "",
    timerIdMap: new WeakMap(), // memory titlte tooltips
    titleHashToIds: {}, // (miniHash(title) -> [ids])
    titleFunction: null, // function(paper) => string
    urlHashToId: {}, // (miniHash(url) => id)
};

global.state.titleFunction = (paper) => {
    const title = paper.title.replaceAll("\n", "");
    const id = paper.id;
    let name = `${title} - ${id}`;
    name = name.replaceAll(":", " ").replace(/\\s\\s+/g, " ");
    return name;
};

global.descendingSortKeys = [
    "addDate",
    "count",
    "lastOpenDate",
    "favoriteDate",
    "year",
];

/**
 * Shared configuration for the Tags' select2 inputs
 */
global.select2Options = {
    placeholder: "Tag paper",
    maximumSelectionLength: 5,
    allowClear: true,
    tags: true,
    tokenSeparators: [",", " "],
};

/**
 * The array of keys in the menu, i.e. options the user can dis/enable in the menu
 */
global.prefsCheckNames = [
    "checkBib",
    "checkMd",
    "checkDownload",
    "checkPdfTitle",
    "checkFeedback",
    "checkDarkMode",
    "checkDirectOpen",
    "checkStore",
    "checkScirate",
    "checkVanity",
    "checkAr5iv",
    "checkHuggingface",
    "checkOfficialRepos",
    "checkPreferPdf",
    "checkPdfOnly",
    "checkNoAuto",
    "checkMdYearVenue",
    "checkEnterLocalPdf",
    "checkWebsiteParsing",
];
/**
 * Menu check names which should not default to true but to false
 */
global.prefsCheckDefaultFalse = [
    "checkDarkMode",
    "checkStore",
    "checkScirate",
    "checkVanity",
    "checkAr5iv",
    "checkHuggingface",
    "checkOfficialRepos",
    "checkPdfOnly",
    "checkNoAuto",
    "checkMdYearVenue",
];
/**
 * All keys to retrieve from the menu, the checkboxes + the custom pdf function
 */
global.prefsStorageKeys = [...global.prefsCheckNames, "pdfTitleFn"];

/**
 * Extra data per source
 */
global.sourceExtras = {
    springer: {
        types: ["chapter", "article", "book", "referenceworkentry"],
    },
};

/**
 * Sources which are preprints (important for de-duplication)
 */
global.preprintSources = ["arxiv", "biorxiv"];

/**
 * Map of known data sources to the associated paper urls: pdf urls and web-pages urls.
 * IMPORTANT: paper page before pdf (see background script)
 * Notes:
 *  ijcai -> papers < 2015 will not be parsed due to website changes
 *           (open an issue if that's problematic)
 */
global.knownPaperPages = {
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
            "arxiv-vanity.com/papers/",
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
    cvf: {
        patterns: ["openaccess.thecvf.com/content"],
        name: "CVF (Computer Vision Foundation)",
    },
    frontiers: {
        patterns: ["frontiersin.org/articles"],
        name: "Frontiers",
    },
    hal: {
        patterns: [(url) => /hal\.science\/\w+-\d+(v\d+)?(\/document)?$/gi.test(url)],
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
        patterns: ["ncbi.nlm.nih.gov/pmc/articles/PMC"],
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
            ...global.sourceExtras.springer.types.map(
                (type) => `link.springer.com/${type}/`
            ),
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
                    url.match(/onlinelibrary\.wiley\.com\/doi\/(abs|full|pdf|epdf)\//g)
                ),
        ],
        name: "Wiley",
    },
};

global.overrideORConfs = {
    "robot-learning": "CoRL",
    ijcai: "IJCAI",
};
global.overridePMLRConfs = {
    "Conference on Learning Theory": "CoLT",
    "International Conference on Machine Learning": "ICML",
    "Conference on Uncertainty in Artificial Intelligence": "UAI",
    "Conference on Robot Learning": "CoRL",
    "International Conference on Artificial Intelligence and Statistics": "AISTATS",
    "International Conference on Algorithmic Learning Theory": "ALT",
};
global.overrideDBLPVenues = {
    "J. Mach. Learn. Res.": "JMLR",
};

global.consolHeaderStyle =
    "@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300');font-family:'Fira Code' monospace;font-size:1rem;font-weight:300;display:inline-block;border:2px solid #A41716;border-radius: 4px;padding: 12px; margin: 12px;";

/**
 * Minimal Levenshtein distance between two paper titles for those to be merged
 */
global.fuzzyTitleMatchMinDist = 4;

global.storeReadme = `
/!\\ Warning: This folder has been created automatically by your PaperMemory browser extension.\n
/!\\ It has to stay in your downloads for PaperMemory to be able to access your papers.\n
/!\\ To be able to open files from this folder instead of re-downloading them, PaperMemory will match their titles and downloaded urls.\n
/!\\ If you change the default title function in the Advanced Options and do not include a paper's title in the file name, PaperMemory may not be able to open the file and will instead open the pdf url.\n
/!\\ Unfortunately, PaperMemory cannot detect papers that have not been *downloaded there* so putting papers in this folder will not make them discoverable by the \`browser.downloads\` API PaperMemory uses.
`;
/**
 * English words to ignore when creating an arxiv paper's BibTex key.
 */
global.englishStopWords = new Set([
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

global.journalAbbreviations = null;

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        state: global.state,
        descendingSortKeys: global.descendingSortKeys,
        select2Options: global.select2Options,
        prefsCheckNames: global.prefsCheckNames,
        prefsCheckDefaultFalse: global.prefsCheckDefaultFalse,
        prefsStorageKeys: global.prefsStorageKeys,
        sourceExtras: global.sourceExtras,
        preprintSources: global.preprintSources,
        knownPaperPages: global.knownPaperPages,
        overrideORConfs: global.overrideORConfs,
        overridePMLRConfs: global.overridePMLRConfs,
        overrideDBLPVenues: global.overrideDBLPVenues,
        fuzzyTitleMatchMinDist: global.fuzzyTitleMatchMinDist,
        storeReadme: global.storeReadme,
        englishStopWords: global.englishStopWords,
        journalAbbreviations: global.journalAbbreviations,
        consolHeaderStyle: global.consolHeaderStyle,
    };
}

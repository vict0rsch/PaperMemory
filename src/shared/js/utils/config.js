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
 * The popup's global state to store data across functions
 */
global.state = {
    dataVersion: 0,
    memoryIsOpen: false,
    menuIsOpen: false,
    papers: {}, // (id => object)
    papersList: [], // [papers]
    paperTags: new Set(), // (Set(string))
    pdfTitleFn: null, // function(paper) => string
    showFavorites: false,
    sortedPapers: [], // [papers]
    sortKey: "",
    papersReady: false,
    prefs: {}, // (prefsCheckKey => bool)
    files: {},
    ignoreSources: {}, // (source => bool)
    lastRefresh: new Date(),
    titleHashToIds: {}, // (miniHash(title) -> [ids])
    urlHashToId: {}, // (miniHash(url) => id)
    memoryItemsPerPage: 25,
    currentMemoryPagination: 0,
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
    "checkOfficialRepos",
    "checkPreferPdf",
    "checkPdfOnly",
    "checkNoAuto",
    "checkMdYearVenue",
];
/**
 * Menu check names which should not default to true but to false
 */
global.prefsCheckDefaultFalse = [
    "checkDarkMode",
    "checkStore",
    "checkScirate",
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
    acl: ["aclanthology.org/"],
    acm: ["dl.acm.org/doi/"],
    aps: [(url) => Boolean(url.match(/journals\.aps\.org\/\w+\/(abstract|pdf)\//g))],
    acs: ["pubs.acs.org/doi/"],
    arxiv: ["arxiv.org/abs/", "arxiv.org/pdf/", "scirate.com/arxiv/"],
    biorxiv: ["biorxiv.org/content"],
    cvf: ["openaccess.thecvf.com/content"],
    frontiers: ["frontiersin.org/articles"],
    ihep: ["inspirehep.net/literature/", "inspirehep.net/files/"],
    ijcai: [(url) => /ijcai\.org\/proceedings\/\d{4}\/\d+/gi.test(url)],
    ieee: [
        "ieeexplore.ieee.org/document/",
        "ieeexplore.ieee.org/abstract/document/",
        "ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=",
    ],
    iop: ["iopscience.iop.org/article/"],
    jmlr: [(url) => url.includes("jmlr.org/papers/v") && !url.endsWith("/")],
    nature: ["nature.com/articles/"],
    neurips: ["neurips.cc/paper/", "nips.cc/paper/"],
    openreview: [
        "openreview.net/forum",
        "openreview.net/pdf",
        "openreview.net/attachment",
    ],
    plos: [(url) => /journals\.plos\.org\/.+\/article.+id=/gi.test(url)],
    pmc: ["ncbi.nlm.nih.gov/pmc/articles/PMC"],
    pmlr: ["proceedings.mlr.press/"],
    pnas: ["pnas.org/content/", "pnas.org/doi/"],
    rsc: ["pubs.rsc.org/en/content/article"],
    science: [
        (url) => Boolean(url.match(/science\.org\/doi\/?(abs|full|pdf|epdf)?\//g)),
    ],
    sciencedirect: [
        "sciencedirect.com/science/article/pii/",
        "sciencedirect.com/science/article/abs/pii/",
        "reader.elsevier.com/reader/sd/pii/",
    ],
    springer: [
        ...global.sourceExtras.springer.types.map(
            (type) => `link.springer.com/${type}/`
        ),
        "link.springer.com/content/pdf/",
    ],
    wiley: [
        (url) =>
            Boolean(
                url.match(/onlinelibrary\.wiley\.com\/doi\/(abs|full|pdf|epdf)\//g)
            ),
    ],
};

global.sourcesNames = {
    acl: "Association for Computational Linguistics (ACL)",
    acm: "Association for Computing Machinery (ACM)",
    acs: "American Chemical Society (ACS)",
    aps: "American Physical Society",
    arxiv: "ArXiv",
    biorxiv: "BioRxiv",
    cvf: "Computer Vision Foundation (CVF)",
    ijcai: "International Joint Conferences on Artificial Intelligence (IJCAI)",
    iop: "Institute Of Physics (IOP)",
    jmlr: "Journal of Machine Learning Research (JMLR)",
    nature: "Nature",
    neurips: "NeurIPS",
    openreview: "OpenReview",
    pmc: "PubMed Central",
    pmlr: "Proceedings of Machine Learning Research (PMLR)",
    pnas: "Proceedings of the National Academy of Sciences (PNAS)",
    science: "Science",
    sciencedirect: "ScienceDirect",
    springer: "Springer",
    wiley: "Wiley",
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

global.defaultTitleFunctionCode = `
(paper) => {\n
    const title = paper.title.replaceAll("\\n", '');\n
    const id = paper.id;\n
    let name = \`\${title} - \${id}\`;\n
    name = name.replaceAll(":", " ").replace(/\\s\\s+/g, " ");\n
    return name\n};`;
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
        sourcesNames: global.sourcesNames,
        overrideORConfs: global.overrideORConfs,
        overridePMLRConfs: global.overridePMLRConfs,
        overrideDBLPVenues: global.overrideDBLPVenues,
        fuzzyTitleMatchMinDist: global.fuzzyTitleMatchMinDist,
        defaultTitleFunctionCode: global.defaultTitleFunctionCode,
        storeReadme: global.storeReadme,
        englishStopWords: global.englishStopWords,
        journalAbbreviations: global.journalAbbreviations,
        consolHeaderStyle: global.consolHeaderStyle,
    };
}

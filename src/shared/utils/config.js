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
    papers: {},
    papersList: [],
    paperTags: new Set(),
    pdfTitleFn: null,
    showFavorites: false,
    sortedPapers: [],
    sortKey: "",
    papersReady: false,
};

global.descendingSortKeys = ["addDate", "count", "lastOpenDate", "favoriteDate"];

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
global.menuCheckNames = [
    "checkBib",
    "checkMd",
    "checkDownload",
    "checkPdfTitle",
    "checkVanity",
    "checkFeedback",
    "checkDarkMode",
];
/**
 * Menu check names which should not default to true but to false
 */
global.menuCheckDefaultFalse = ["checkDarkMode"];
/**
 * All keys to retrieve from the menu, the checkboxes + the custom pdf function
 */
global.menuStorageKeys = [...global.menuCheckNames, "pdfTitleFn"];

/**
 * Map of known data sources to the associated paper urls: pdf urls and web-pages urls.
 */
global.knownPaperPages = {
    arxiv: ["arxiv.org/pdf/", "arxiv.org/abs/"],
    neurips: ["neurips.cc/paper/"],
    cvf: ["openaccess.thecvf.com/content"],
    openreview: ["openreview.net/forum", "openreview.net/pdf"],
};

/**
 * English words to ignore when creating an arxiv paper's BibTex key.
 */
global.englishStopWords = new Set([
    [
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
    ],
]);

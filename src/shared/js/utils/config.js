import { miniHash } from "@pmu/functions.js";
/**
 * Prototypes
 */

if (!Array.prototype.last) {
    Object.defineProperty(Array.prototype, "last", {
        value: function (i = 0) {
            return this[this.length - 1 - i];
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
export const state = {
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

export const descendingSortKeys = [
    "addDate",
    "count",
    "lastOpenDate",
    "favoriteDate",
    "year",
];

export const svgActionsHoverTitles = {
    edit: "Edit paper details",
    copyMd: "Copy Markdown-formatted link",
    copyBibtext: "Copy Bibtex citation",
    visits: "Number of times you have opened this paper",
    openLocal: "Open downloaded pdf",
    copyLink: "Copy paper url",
    copyHypeLink: "Copy url as hyperlink",
};

export const tomSelectOptions = {
    placeholder: "Tag paper",
    maxItems: 5,
    create: true,
    delimiter: ",",
    plugins: ["caret_position", "remove_button"],
};

/**
 * The array of keys in the menu, i.e. options the user can dis/enable in the menu
 */
export const prefsCheckNames = [
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
export const prefsCheckDefaultFalse = [
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
export const prefsStorageKeys = [...prefsCheckNames, "pdfTitleFn"];

export const overrideDBLPVenues = {
    "J. Mach. Learn. Res.": "JMLR",
};

export const consolHeaderStyle =
    "@import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@300');font-family:'Fira Code' monospace;font-size:1rem;font-weight:300;display:inline-block;border:2px solid #A41716;border-radius: 4px;padding: 12px; margin: 12px;";

export const storeReadme = `
/!\\ Warning: This folder has been created automatically by your PaperMemory browser extension.\n
/!\\ It has to stay in your downloads for PaperMemory to be able to access your papers.\n
/!\\ To be able to open files from this folder instead of re-downloading them, PaperMemory will match their titles and downloaded urls.\n
/!\\ If you change the default title function in the Advanced Options and do not include a paper's title in the file name, PaperMemory may not be able to open the file and will instead open the pdf url.\n
/!\\ Unfortunately, PaperMemory cannot detect papers that have not been *downloaded there* so putting papers in this folder will not make them discoverable by the \`browser.downloads\` API PaperMemory uses.
`;
/**
 * English words to ignore when creating an arxiv paper's BibTex key.
 */
export const englishStopWords = new Set([
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

export const journalAbbreviations = {};

export { knownPaperPages, preprintSources } from "./sources/index.js";

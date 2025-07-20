// ES Module imports
import {
    log,
    info,
    warn,
    consoleHeader,
    downloadTextFile,
    downloadFile,
    sendMessageToBackground,
    cleanPapers,
    getStoredFiles,
    miniHash,
    getRandomInt,
} from "@pmu/functions.js";
import {
    state,
    descendingSortKeys,
    preprintSources,
    journalAbbreviations,
    storeReadme,
} from "@pmu/config.js";
import {
    getStorage,
    setStorage,
    migrateData,
    getManifestDataVersion,
    getTheme,
    makeTitleHashToIdList,
    weeklyBackup,
    getPrefs,
} from "@pmu/data.js";
import { paperToPDF } from "@pmu/paper.js";
import { matchPapersToFiles } from "@pmu/files.js";

/**
 * Compute the duration between now and the first element of the times array in seconds.
 * @param {array} times Array of times to compute the duration from
 * @returns
 */
export const duration = (times) => (Date.now() - times[0]) / 1e3;
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
export const initState = async ({ papers, isContentScript, print = true } = {}) => {
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

    info("State init duration (s): " + (Date.now() - times.last()) / 1e3);
    print && console.groupEnd();
    (async () => {
        const cellPath = chrome.runtime.getURL("src/data/cell.json");
        const cellData = await fetch(cellPath).then((res) => res.json());
        state.cellJournalData = cellData;
    })();
};

/**
 * Execute the sort operation on state.sortedPapers using orderPapers, removing the
 * __dataVersion element in state.papers.
 */
export const sortMemory = () => {
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
export const orderPapers = (descending) => (paper1, paper2) => {
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
export const makeTags = () => {
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
 * Sample a paper from the memory. If `idx` is provided, the paper will
 * be the `idx`-th paper in the memory (in the list of keys).
 * Otherwise, a random paper will be drawn.
 * If no paper exists in the memory a dummy paper object is returned.
 *
 * @param {number} idx Optional index of the sample paper.
 * @returns {object} paper object to display in the options.
 */
export const getExamplePaper = async (idx) => {
    // all papers
    const papers = (await getStorage("papers")) ?? {};
    // filter out the data version
    const keys = Object.keys(papers)
        .filter((k) => k.indexOf("__") === -1)
        .reverse();
    // no idx provided, sample a random paper
    if (typeof idx === "undefined") {
        idx = getRandomInt(keys.length);
    }
    let paper = papers[keys[idx]];
    // there's no such paper (idx is wrong or memory is empty)
    if (typeof paper === "undefined") {
        paper = {
            title: "Dummy title",
            author: "Cool Author and Great Author and Complicated Name Àuthor",
            year: 2021,
            id: "NoneXiv-214324",
            bibtex: "@Nonesense{}",
            tags: ["t1", "t2"],
            note: "Thispaperdoesnotexist.com",
        };
    }
    return paper;
};

/**
 * Uses the state-loaded title function to get the title of a paper.
 *
 * @param {string || object} paperOrId the paper for which to get the title
 * @returns {string} the title of the paper
 */
export const stateTitleFunction = (paperOrId) => {
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

export const readJournalAbbreviations = async () => {
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

export const downloadPaperPdf = async (paper) => {
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

export const matchAllFilesToPapers = () => {
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
export const getTagsOptions = (paper) => {
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

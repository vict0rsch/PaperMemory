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

    global.state.dataVersion = getManifestDataVersion();
    print && log("Time to parse data version (s): " + duration(times));
    times.unshift(Date.now());

    global.state.titleFunction = (await getTitleFunction()).titleFunction;
    print && log("Time to make title function (s): " + duration(times));
    times.unshift(Date.now());

    weeklyBackup();
    print && log("Time to backup papers (weekly) (s): " + duration(times));
    times.unshift(Date.now());

    const migration = await migrateData(papers, global.state.dataVersion);
    print && log("Time to migrate data (s): " + duration(times));
    times.unshift(Date.now());

    papers = migration.papers;
    global.state.papers = papers;

    global.state.prefs = await getPrefs();
    print && log("Time to retrieve user preferences (s): " + duration(times));
    times.unshift(Date.now());

    global.state.ignoreSources = (await getStorage("ignoreSources")) ?? {};
    print && log("Time to retrieve sources to ignore (s): " + duration(times));
    times.unshift(Date.now());

    global.state.urlHashToId = (await getStorage("urlHashToId")) ?? {};
    print && log("Time to retrieve sources to urlHashToId (s): " + duration(times));
    times.unshift(Date.now());

    global.state.titleHashToIds = {};
    for (const [id, paper] of Object.entries(cleanPapers(papers))) {
        const hashed = miniHash(paper.title);
        if (!global.state.titleHashToIds.hasOwnProperty(hashed)) {
            global.state.titleHashToIds[hashed] = [];
        }
        global.state.titleHashToIds[hashed].push(id);
    }
    print && log("Time to hash titles (s): " + duration(times));
    times.unshift(Date.now());

    if (!isContentScript) {
        global.state.files = await matchAllFilesToPapers();
        print && log("Time to match all local files (s): " + duration(times));
        times.unshift(Date.now());

        global.state.papersList = Object.values(cleanPapers(papers));
        global.state.sortKey = "lastOpenDate";
        global.state.papersReady = true;

        sortMemory();
        print && log("Time to sort memory (s): " + duration(times));
        times.unshift(Date.now());

        makeTags();
        print && log("Time to make tags (s): " + duration(times));
        times.unshift(Date.now());
    }

    info("State init duration (s): " + (Date.now() - times.last()) / 1e3);
    print && console.groupEnd();
};

/**
 * Execute the sort operation on global.state.sortedPapers using orderPapers, removing the
 * __dataVersion element in global.state.papers.
 */
const sortMemory = () => {
    global.state.sortedPapers = Object.values(cleanPapers(global.state.papers));
    global.state.sortedPapers.sort(
        orderPapers(global.descendingSortKeys.indexOf(global.state.sortKey) >= 0)
    );
    global.state.papersList.sort(
        orderPapers(global.descendingSortKeys.indexOf(global.state.sortKey) >= 0)
    );
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
    let val1 = paper1[global.state.sortKey];
    let val2 = paper2[global.state.sortKey];

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
    for (const p of global.state.sortedPapers) {
        for (const t of p.tags) {
            tags.add(t);
        }
    }
    global.state.paperTags = [...tags];
    global.state.paperTags.sort();
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
const getExamplePaper = async (idx) => {
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
 * Tries to parse the text input by the user to define the function that takes
 * a paper in order to create the custom page title / pdf filename.
 * If there is an error, it uses the built-in function from global.defaultTitleFunctionCode.
 * @param {string} code The string describing the code function.
 * @returns {function} Either the user's function if it runs without errors, or the built-in
 * formatting function
 */
const getTitleFunction = async (code = null) => {
    let titleFunction;
    if (!code) {
        // no code provided: load it from storage
        code = await getStorage("titleFunctionCode");
    }
    if (typeof code === "undefined") {
        // no code provided and no code in storage: use the built-in function code
        code = global.defaultTitleFunctionCode;
    }

    let errorMessage;

    try {
        // eval the code into a function
        titleFunction = eval(code);
    } catch (error) {
        // there was an error evaluating the code: use the built-in function
        errorMessage = `Error parsing the title function: ${error}`;
        log("Error parsing the title function. Function string then error:");
        log(code);
        log(error);
        titleFunction = eval(global.defaultTitleFunctionCode);
        code = global.defaultTitleFunctionCode;
    }

    try {
        // test the loaded title function on a paper
        const examplePaper = await getExamplePaper(0);
        const result = titleFunction(examplePaper);
        // assert the result is a string
        if (typeof result !== "string") {
            throw new Error(`Result ${result} is not a string`);
        }
    } catch (error) {
        // there was an error running the title function: use the built-in function
        errorMessage = `Error executing the title function: ${error}`;
        log("Error testing the user's title function. Function string then error:");
        log(code);
        log(error);
        titleFunction = eval(global.defaultTitleFunctionCode);
        code = global.defaultTitleFunctionCode;
    }

    return {
        titleFunction: titleFunction, // the function to use
        code: code.trim(), // the code to store in storage
        errorMessage: errorMessage, // potential error message
    };
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
        paper = global.state.papers[paperOrId];
        if (typeof paper === "undefined") {
            // no such paper
            log("Error in stateTitleFunction: unknown id", paperOrId);
            return "Unknown ID";
        }
    }
    let name;
    try {
        // try using the state-loaded title function
        name = global.state.titleFunction(paper);
    } catch (error) {
        // there was an error: use the built-in function
        log("Error in stateTitleFunction:", error);
        name = eval(global.defaultTitleFunctionCode)(paper);
    }
    // make sure there's no new line and no double spaces in the title
    return name.replaceAll("\n", " ").replace(/\s\s+/g, " ");
};

const updateDuplicatedUrls = (url, id, remove = false) => {
    if (!remove) {
        global.state.urlHashToId[miniHash(url)] = id;
        setStorage("urlHashToId", global.state.urlHashToId);
    } else {
        let hashedUrls;
        if (!url) {
            hashedUrls = Object.keys(global.state.urlHashToId).filter(
                (k) => global.state.urlHashToId[k] === id
            );
        } else {
            hashedUrls = [miniHash(url)];
        }
        if (hashedUrls && hashedUrls.length) {
            for (const hashedUrl of hashedUrls) {
                warn("Removing duplicated url", url, "for", id);
                delete global.state.urlHashToId[hashedUrl];
            }
            setStorage("urlHashToId", global.state.urlHashToId);
        }
    }
};

const addPaperToTitleHashToId = (paper) => {
    const id = paper.id;
    const hashedTitle = miniHash(paper.title);
    if (!global.state.titleHashToIds.hasOwnProperty(hashedTitle)) {
        global.state.titleHashToIds[hashedTitle] = [];
    }
    if (!global.state.titleHashToIds[hashedTitle].includes(id)) {
        global.state.titleHashToIds[hashedTitle].push(id);
    }
};

const readJournalAbbreviations = async () => {
    if (global.journalAbbreviations) {
        return;
    }
    const iso4Path = chrome.runtime.getURL("src/data/iso4-journals.json");
    const iso4 = await fetch(iso4Path).then((res) => res.json());
    const abbrPath = chrome.runtime.getURL("src/data/journal-abbreviations.json");
    const abbr = await fetch(abbrPath).then((res) => res.json());
    global.journalAbbreviations = Object.fromEntries(
        [...Object.entries(iso4), ...Object.entries(abbr)].map(([k, v]) => [
            miniHash(k),
            v,
        ])
    );
};

const downloadPaperPdf = async (paper) => {
    if (!global.state.papersReady) {
        throw new Error("[PM] State is not ready (downloadPaperPdf)");
    }
    let title = stateTitleFunction(paper);
    title = title.replaceAll(":", " ");
    const punctuationRegex =
        /[\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\/:;<=>?@\[\]^`{|}~]/g;
    const spaceRegex = /\s+/g;
    title = title.replace(punctuationRegex, " ").replace(spaceRegex, " ");
    if (global.state.prefs.checkStore) {
        title = "PaperMemoryStore/" + title;
        const storedFiles = await getStoredFiles();
        if (storedFiles.length === 0) {
            chrome.downloads.download({
                url: URL.createObjectURL(new Blob([global.storeReadme])),
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

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        initState,
        getExamplePaper,
        getTitleFunction,
        stateTitleFunction,
        updateDuplicatedUrls,
        addPaperToTitleHashToId,
        readJournalAbbreviations,
        downloadPaperPdf,
    };
}

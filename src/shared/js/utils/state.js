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
const initState = async (papers, isContentScript) => {
    const times = [];
    times.unshift(Date.now());

    if (typeof papers === "undefined") {
        papers = (await getStorage("papers")) ?? {};
        log("Time to retrieve stored papers (s): " + (Date.now() - times[0]) / 1000);
    }
    times.unshift(Date.now());

    global.state.dataVersion = getManifestDataVersion();
    log("Time to parse data version (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    global.state.titleFunction = (await getTitleFunction()).titleFunction;
    log("Time to make title function (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    weeklyBackup();
    log("Time to backup papers (weekly) (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    const migration = await migrateData(papers, global.state.dataVersion);
    log("Time to migrate data (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    papers = migration.papers;
    global.state.papers = papers;

    global.state.menu = await getMenu();
    log("Time to retrieve user preferences (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    global.state.ignoreSources = (await getStorage("ignoreSources")) ?? {};
    log("Time to retrieve sources to ignore (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    global.state.hashToId = {};
    for (const [id, paper] of Object.entries(cleanPapers(papers))) {
        const hashed = miniHash(paper.title);
        if (!global.state.hashToId.hasOwnProperty(hashed)) {
            global.state.hashToId[hashed] = [];
        }
        global.state.hashToId[hashed].push(id);
    }
    log("Time to hash titles (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    if (isContentScript) {
        info("State init duration (s): " + (Date.now() - times.last()) / 1000);
        return;
    }

    global.state.files = await matchAllFilesToPapers();
    log("Time to match all local files (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    global.state.papersList = Object.values(cleanPapers(papers));
    global.state.sortKey = "lastOpenDate";
    global.state.papersReady = true;

    sortMemory();
    log("Time to sort memory (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    makeTags();
    log("Time to make tags (s): " + (Date.now() - times[0]) / 1000);
    times.unshift(Date.now());

    info("State init duration (s): " + (Date.now() - times.last()) / 1000);
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

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    module.exports = {
        initState,
        getExamplePaper,
        getTitleFunction,
        stateTitleFunction,
    };
}

const getPat = async (patError) => {
    const pat = await getStorage("syncPAT");
    if (!pat) {
        warn("No PAT found. Aborting and disabling sync.");
        await setStorage("syncState", false);
        if (patError) {
            throw new Error("No PAT found.");
        }
    }
    return pat;
};

const getIdentifier = async () => {
    const browserName = await getBrowserName();
    let syncId = await getStorage("syncId");
    if (!syncId) {
        syncId = getRandomToken();
        syncId = `${browserName}-${syncId}`;
        info("No syncId found. Creating new one: ", syncId);
        await setStorage("syncId", syncId);
    }
    return syncId;
};

/**
 * Gets the default content of the PaperMemory sync Gist file.
 * If the file does not exist, it will be created.
 * @param {object} options - Options object
 * @param {string} options.pat - Personal Access Token (will be retrieved if not provided)
 * @param {boolean} options.store - Whether to store the PAT in the browser storage
 * @param {boolean} options.patError - Whether to raise an error if no PAT
 * @returns {Promise<{ ok: boolean, payload: { file: { filename: string, raw_url: string, content: object }, pat: string, gistId: string } }>}
 */
const getGist = async (options) => {
    options = options ?? {};
    let pat = options.pat;
    let store = options.store ?? true;
    let patError = options.patError ?? true;
    try {
        if (!pat) pat = await getPat(patError);

        const isTest = await getStorage("syncTest");
        const filename = isTest
            ? "TestsPaperMemorySync"
            : "DO_NO_EDIT__PaperMemorySyncV2.json";
        const description = "Automated PaperMemory sync Gist. Do not edit manually.";
        const requestWithAuth = octokitRequest.defaults({
            headers: {
                authorization: `token ${pat}`,
                "X-GitHub-Api-Version": "2022-11-28",
            },
        });

        const gists = await requestWithAuth("GET /gists");

        let gist = gists.data?.find(
            (gist) => gist.description === description && gist.files[filename]
        );

        if (!gist) {
            info("No Gist found. Creating new one...");
            const papers = await getStorage("papers");
            gist = await createGistWithFile({
                filename,
                pat,
                description,
                content: papers,
            });
            if (!gist) return { ok: false, payload: "wrongPAT" };
        }
        file = gist.files[filename];
        const gistId = gist.id;
        store && (await setStorage("syncPAT", pat));
        return { ok: true, payload: { file, pat, gistId } };
    } catch (e) {
        console.log(e);
        warn("Because of the error ^ syncing is now disabled.");
        setStorage("syncState", false);
        return { ok: false, payload: "wrongPAT", error: e };
    }
};

/**
 * Create a new Gist with a file and some content. The content will be stringified if not
 * already a string. The PAT will be retrieved from the browser storage if not provided.
 * @param {object} options - Options object
 * @param {string} options.file - File name or object with `filename` property
 * @param {string} options.pat - Personal Access Token (will be retrieved if not provided)
 * @param {string} options.content - Content of the file (will be stringified if not already a string)
 * @param {string} options.description - Description of the gist
 * @returns {Promise<object>} - The Gist object
 */
const createGistWithFile = async ({
    file,
    pat,
    content,
    description = "Automated PaperMemory sync Gist. Do not edit manually.",
}) => {
    if (typeof file === "undefined") {
        throw new Error("No file provided.");
    }
    if (typeof content !== "string") {
        content = JSON.stringify(content, null, "");
    }
    if (typeof file === "string") {
        file = { filename: file };
    }
    if (!pat) pat = await getPat();
    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    const response = await requestWithAuth("POST /gists", {
        description,
        files: { [file.filename]: { content } },
        public: false,
    });
    return response.data;
};

/**
 * Get the content of a Gist file (from `gistId`). Accept `file:{filename, raw_url}`
 * object or `filename` and `url` strings.
 * If `gistId` is not provided, it will query all gists and find the first one with the file.
 * The PAT will be retrieved from the browser storage if not provided.
 * @param {object} options - Options object
 * @param {string} options.file - File name or object with `filename` property
 * @param {string} options.pat - Personal Access Token (will be retrieved if not provided)
 * @param {gistId} options.gistId - ID of the Gist. Will query all gists and find the first one with the file if not provided.
 * @returns {Promise<object>} - The content of the file
 */
const getDataForGistFile = async ({ file, pat, gistId }) => {
    if (typeof file === "string") {
        file = { filename: file };
    }
    if (!pat) pat = await getPat();

    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    let gist;
    if (!gistId) {
        const resp = await requestWithAuth("GET /gists");
        const gists = resp.data;
        gist = gists?.find((gist) => gist.files[file.filename]);
    } else {
        const resp = await requestWithAuth(`GET /gists/${gistId}`);
        gist = resp.data;
    }
    file = gist.files[file.filename];

    if (file.filename.endsWith(".json")) {
        const { data, status } = await fetchJSON(file.raw_url);
        return data;
    }
    return await fetchText(file.raw_url);
};

/**
 * Update a Gist file with some content. The content will be stringified if not
 * already a string. The PAT will be retrieved from the browser storage if not provided.
 * @param {object} options - Options object
 * @param {string} options.file - File name or object with `filename` property
 * @param {string} options.pat - Personal Access Token (will be retrieved if not provided)
 * @param {string} options.content - Content of the file (will be stringified if not already a string)
 * @param {string} options.gistId - ID of the Gist
 * @returns {Promise<object>} - The Gist object
 */
const updateGistFile = async ({ file, content, gistId, pat }) => {
    if (!pat) pat = await getPat();

    if (typeof content !== "string") {
        content = JSON.stringify(content, null, "");
    }
    if (typeof file === "string") {
        file = { filename: file };
    }
    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    return await requestWithAuth(`PATCH /gists/${gistId}`, {
        files: { [file.filename]: { content } },
    });
};

/**
 * Writes the current `papers` Memory to the default sync Gist file.
 * @returns {Promise}
 */
const pushToRemote = async () => await sendMessageToBackground({ type: "writeSync" });

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
        await setStorage("papers", global.state.papers);
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
    if (!global.state.dataVersion || forceInit) {
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
            const n = global.state.sortedPapers.length;
            setPlaceholder("memory-search", `Search ${n} entries...`);
            if (
                !global.state.memoryIsOpen &&
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

/**
 * Delete a gist from its id
 * @param {string} gistId ID of the User's gist to delete
 * @returns {Promise} Promise from the request
 */
const deleteGist = async ({ gistId, pat }) => {
    if (!pat) pat = await getPat();
    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    return await requestWithAuth(`DELETE /gists/${gistId}`);
};

const sleep = async (duration) =>
    new Promise((resolve) => setTimeout(resolve, duration));

const measureCacheTime = async ({ maxTime = 1e5 }) => {
    const randomId = Math.random().toString(36).substring(7);
    const filename = `PaperMemory-cache-test-${randomId}.json`;
    const description = "PaperMemory cache test. You *can* delete this.";
    const content = { test: "test", data: { counter: 0 } };
    const gist = await createGistWithFile({
        file: filename,
        content,
        description,
    });
    console.log("Test gist: ", gist);
    const gistId = gist.id;
    try {
        const file = gist.files[filename];

        content.data.counter++;
        const updateResp = await updateGistFile({ file, content, gistId });
        console.log("updateResp: ", updateResp);
        const start = Date.now();
        let time;
        let iter = 0;

        while (true) {
            const data = await getDataForGistFile({ file, gistId });
            console.log("");
            console.log("data: ", data);
            time = (Date.now() - start) / 1e3;
            console.log("Time: ", time, "at iteration: ", iter);
            if (data.data.counter === 1) {
                break;
            }
            await sleep(500);
            if (time > maxTime) {
                break;
            }
            iter++;
        }
        if (time > maxTime) {
            warn("Cache time too long: > maxTime=", maxTime, "ms");
            return;
        }
        info(`Cache time: ${time}s`);
    } catch (e) {
        console.log(e);
    } finally {
        info("Deleting test gist...");
        await deleteGist({ gistId });
    }
};

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        getPat,
        getIdentifier,
        getGist,
        createGistWithFile,
        getDataForGistFile,
        updateGistFile,
        pushToRemote,
        pullFromRemote,
        shouldSync,
        initSyncAndState,
        startSyncLoader,
        successSyncLoader,
        errorSyncLoader,
        deleteGist,
        sleep,
        measureCacheTime,
    };
}

/**
 * Gets the default content of the PaperMemory sync Gist file.
 * If the file does not exist, it will be created.
 * @param {string} pat - Personal Access Token (will be retrieved if not provided)
 * @param {boolean} store - Whether to store the PAT in the browser storage
 * @returns {Promise<{ ok: boolean, payload: { file: { filename: string, raw_url: string, content: object }, pat: string, gistId: string } }>}
 */
const getGist = async (pat, store = true) => {
    try {
        if (!pat) {
            pat = await getStorage("syncPAT");
        }
        if (!pat) {
            setStorage("syncState", false);
            return { ok: false, payload: "noPAT" };
        }

        const isTest = await getStorage("syncTest");
        const fileName = isTest
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
            (gist) => gist.description === description && gist.files[fileName]
        );

        if (!gist) {
            info("No Gist found. Creating new one...");
            const papers = await getStorage("papers");
            gist = await createGistWithFile({
                filename: fileName,
                pat,
                description,
                content: papers,
            });
            if (!gist) return { ok: false, payload: "wrongPAT" };
        }
        file = gist.files[fileName];
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
    if (typeof content !== "string") {
        content = JSON.stringify(content, null, "");
    }
    if (typeof file === "string") {
        file = { filename: file };
    }
    if (!pat) {
        pat = await getStorage("syncPAT");
    }
    if (!pat) {
        warn("(createGistWithFile) No PAT found. Aborting and disabling sync.");
        setStorage("syncState", false);
        return;
    }
    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    const response = await requestWithAuth("POST /gists", {
        description,
        files: { [filename]: { content } },
        public: false,
    });
    return response.data;
};

/**
 * Get the content of a Gist file. Accept `file:{filename, raw_url}` object or `filename` and `url` strings.
 * The PAT will be retrieved from the browser storage if not provided.
 * @param {object} options - Options object
 * @param {string} options.file - File name or object with `filename` property and `raw_url` property
 * @param {string} options.filename - File Name (will be ignored if `file` is provided)
 * @param {string} options.url - Raw URL of the file (will be ignored if `file` is provided)
 * @param {string} options.pat - Personal Access Token (will be retrieved if not provided)
 * @returns {Promise<object>} - The content of the file
 */
const getDataForGistFile = async ({ file, filename, url }) => {
    if (typeof file === "undefined") {
        if (typeof url === "undefined") {
            throw new Error("No file or url provided.");
        }
        if (typeof filename === "undefined") {
            throw new Error("No filename provided.");
        }
        file = { filename: file };
    } else if (typeof filename !== "undefined" || typeof url !== "undefined") {
        warn("`file` argument has precedence over `filename` or `url`.");
    }
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
    if (!pat) pat = await getStorage("syncPAT");
    if (!pat) {
        warn("(updateGistFile) No PAT found. Aborting and disabling sync.");
        setStorage("syncState", false);
        return { ok: false, payload: "noPAT" };
    }
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
        gist_id: gistId,
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
    (!global.state.dataVersion || forceInit) &&
        (await initState({ papers, isContentScript }));

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

const getGist = async (pat, store = true) => {
    try {
        // await githubGist.touch();
        if (!pat) {
            pat = await getStorage("syncPAT");
        }
        if (!pat) {
            setStorage("syncState", false);
            return {
                ok: false,
                payload: "noPAT",
            };
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
            const response = await requestWithAuth("POST /gists", {
                description,
                files: {
                    [fileName]: {
                        content: JSON.stringify(await getStorage("papers")),
                    },
                },
                public: false,
            });
            gist = response.data;
        }
        file = gist.files[fileName];
        const gistId = gist.id;
        store && (await setStorage("syncPAT", pat));
        return { ok: true, payload: { file, pat, gistId } };
    } catch (e) {
        console.log(e);
        warn("Because of the error ^ syncing is now disabled.");
        // setStorage("syncState", false);
        return {
            ok: false,
            payload: "wrongPAT",
            error: e,
        };
    }
};

const getDataForGistFile = async (file) => {
    if (file.filename.endsWith(".json")) {
        const { data, status } = await fetchJSON(file.raw_url);
        return data;
    }
    return await fetchText(file.raw_url);
};

const updateGist = async (file, papers, gistId) => {
    const pat = await getStorage("syncPAT");
    if (!pat) {
        info("(updateGist) No PAT found. Syncing is now disabled.");
        setStorage("syncState", false);
        return {
            ok: false,
            payload: "noPAT",
        };
    }
    const requestWithAuth = octokitRequest.defaults({
        headers: {
            authorization: `token ${pat}`,
            "X-GitHub-Api-Version": "2022-11-28",
        },
    });
    return await requestWithAuth(`PATCH /gists/${gistId}`, {
        gist_id: gistId,
        files: {
            [file.filename]: {
                content: JSON.stringify(papers, null, ""),
            },
        },
    });
};

const pushToRemote = async () => await sendMessageToBackground({ type: "writeSync" });

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

const shouldSync = async () => !!(await getStorage("syncState"));

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

const startSyncLoader = async () => {
    showId("sync-popup-feedback");
    hideId("sync-popup-error");
    hideId("sync-popup-synced");
    showId("sync-popup-syncing", "flex");
};
const successSyncLoader = async () => {
    showId("sync-popup-feedback");
    hideId("sync-popup-syncing");
    hideId("sync-popup-error");
    showId("sync-popup-synced");
    setTimeout(() => {
        hideId("sync-popup-feedback");
    }, 2000);
};
const errorSyncLoader = async () => {
    showId("sync-popup-feedback");
    hideId("sync-popup-syncing");
    hideId("sync-popup-synced");
    showId("sync-popup-error");
    setTimeout(() => {
        hideId("sync-popup-feedback");
    }, 2000);
};

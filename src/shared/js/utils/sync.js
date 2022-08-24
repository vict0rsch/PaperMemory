const getGist = async (pat, store = true) => {
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

    const githubGist = new GithubGist.default({
        personalAccessToken: pat,
        appIdentifier: "PaperMemorySync",
        isPublic: false,
    });

    try {
        await githubGist.touch();
        store && (await setStorage("syncPAT", pat));
        return { ok: true, payload: { gist: githubGist, pat } };
    } catch (e) {
        console.log(e.response.data.message);
        warn("Because of the error ^ syncing is now disabled.");
        setStorage("syncState", false);
        return {
            ok: false,
            payload: "wrongPAT",
            error: e,
        };
    }
};

const getDataFile = (gist) => {
    let dataFile = gist.getFile("PaperMemory-sync-data.json");
    if (!dataFile) {
        gist.createFile("PaperMemory-sync-data.json");
        dataFile = gist.getFile("PaperMemory-sync-data.json");
    }
    return dataFile;
};

const pushToRemote = () => sendMessageToBackground({ type: "writeSync" });

const pullFromRemote = () => sendMessageToBackground({ type: "pullSync" });

const shouldSync = async () => !!(await getStorage("syncState"));

const initSyncAndState = async (papers, isContentScript = false) => {
    await initState(papers, isContentScript);
    (async () => {
        if (!(await shouldSync())) return;
        !isContentScript && startSyncLoader();
        await sendMessageToBackground({ type: "reSync" });
        const remotePapers = await pullFromRemote();
        console.log("remotePapers: ", remotePapers);
        if (remotePapers) {
            await initState(remotePapers ?? papers, isContentScript);
            log("Successfully pulled from Github.");
            await setStorage("papers", global.state.papers);
            if (!isContentScript) {
                const n = global.state.sortedPapers.length;
                setPlaceholder("memory-search", `Search ${n} entries...`);
                successSyncLoader();
            }
        } else {
            !isContentScript && errorSyncLoader();
        }
    })();
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

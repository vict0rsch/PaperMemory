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

const getDataFile = async (gist) => {
    const isTest = await getStorage("syncTest");
    const fileName = isTest
        ? "TESTS-PaperMemory-sync-data.json"
        : "PaperMemory-sync-data.json";
    let dataFile = gist.getFile(fileName);
    if (!dataFile) {
        gist.createFile(fileName);
        dataFile = gist.getFile(fileName);
    }
    return dataFile;
};

const pushToRemote = async () => await sendMessageToBackground({ type: "writeSync" });

const pullFromRemote = async (papers, isContentScript) => {
    const start = Date.now();
    const remotePapers = await sendMessageToBackground({ type: "pullSync" });
    log("Remote Papers pulled: ", remotePapers);
    if (remotePapers) {
        await initState(remotePapers ?? papers, isContentScript, false);
        const time = (Date.now() - start) / 1000;
        info(`Successfully pulled from Github (${time}s).`);
        await setStorage("papers", global.state.papers);
    }
    return remotePapers;
};

const shouldSync = async () => !!(await getStorage("syncState"));

const initSyncAndState = async ({
    papers = null,
    isContentScript = false,
    stateIsReady = () => {},
    remoteIsReady = () => {},
} = {}) => {
    !global.state.dataVersion && (await initState(papers, isContentScript));
    stateIsReady();

    if (!(await shouldSync())) return;

    !isContentScript && startSyncLoader();
    await sendMessageToBackground({ type: "restartGist" });
    const remotePapers = await pullFromRemote(papers, isContentScript);
    log("Remote Papers pulled: ", remotePapers);
    if (remotePapers) {
        if (!isContentScript) {
            const n = global.state.sortedPapers.length;
            setPlaceholder("memory-search", `Search ${n} entries...`);
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

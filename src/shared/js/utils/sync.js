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

const pushToRemote = () => {
    sendMessageToBackground({ type: "writeSync" });
};

const pullFromRemote = () => sendMessageToBackground({ type: "pullSync" });

const initSyncAndState = async (papers, isContentScript = false) => {
    const remotePapers = await pullFromRemote();
    console.log("remotePapers: ", remotePapers);
    await initState(remotePapers ?? papers, isContentScript);
    if (remotePapers) {
        log("Successfully pulled from Github.");
        setStorage("papers", global.state.papers);
    }
};

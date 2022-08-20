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
        console.log(e);
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

const initSync = async () => {
    const shouldSync = await getStorage("syncState");
    if (!shouldSync) return;
    const { ok, error, payload } = await getGist();
    if (ok) {
        global.state.gist = payload.gist;
        global.state.remoteFile = await getDataFile(global.state.gist);
        chrome.runtime.connect({ name: "PaperMemorySync" });
        return await pullFromRemote();
    }
};

const pushToRemote = () => {
    sendMessageToBackground({ type: "writeSync" });
};

const pullFromRemote = async (gist) => {
    let ok, error;
    if (gist) {
        ok = true;
        error = null;
    } else {
        ({ ok, error, payload } = await getGist());
        if (ok) ({ gist } = payload);
    }
    if (ok) {
        log("Pulling from Github...");
        await global.state.remoteFile.fetchLatest();
        info("Pulling from Github... Done!");
        return JSON.parse(global.state.remoteFile.content);
    } else {
        warn(payload);
        error && warn(error);
        warn("Pulling from Github canceled.");
    }
};

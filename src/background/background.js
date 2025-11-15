if (typeof importScripts === "function") {
    importScripts(
        "../shared/js/utils/octokit.bundle.js",
        "../shared/js/utils/miniquery.js",
        "../shared/js/utils/config.js",
        "../shared/js/utils/bibtexParser.js",
        "../shared/js/utils/functions.js",
        "../shared/js/utils/sync.js",
        "../shared/js/utils/data.js",
        "../shared/js/utils/paper.js",
        "../shared/js/utils/state.js",
        "../shared/js/utils/parsers.js"
    );
    console.log("Scripts loaded.");
} else {
    const isFirefox = navigator.userAgent.search("Firefox") > -1;
    if (!isFirefox) {
        console.log("Error importing scripts in background.js. This is OK on Firefox.");
    } else {
        console.log("Error importing scripts (`importScripts`) in background.js.");
    }
}

var paperTitles = {};
var MAX_TITLE_UPDATES = 100;
var tabStatuses = {};

const badgeOk = () => {
    chrome.action.setBadgeText({ text: "OK!" });
    chrome.action.setBadgeBackgroundColor({ color: "rgb(68, 164, 68)" });
};

const badgeWait = (text) => {
    chrome.action.setBadgeText({ text });
    chrome.action.setBadgeBackgroundColor({ color: "rgb(189, 127, 10)" });
};

const badgeError = () => {
    chrome.action.setBadgeText({ text: "Error" });
    chrome.action.setBadgeBackgroundColor({ color: "rgb(195, 40, 56)" });
};

const badgeClear = (preventTimeout = false) => {
    if (preventTimeout) {
        chrome.action.setBadgeText({ text: "" });
    } else {
        setTimeout(() => {
            chrome.action.setBadgeText({ text: "" });
        }, 2000);
    }
};

const initGist = async () => {
    if (!(await shouldSync())) {
        warn("Sync disabled.");
        return;
    }
    const start = Date.now();
    log("Initializing Sync...");
    badgeWait("Init...");
    const { ok, error, payload } = await getGist();
    if (ok) {
        global.state.gistFile = payload.file;
        global.state.gistId = payload.gistId;
        const duration = (Date.now() - start) / 1e3;
        logOk(`Sync successfully enabled (${duration}s).`);
        info(`Using gist: ${payload.gistId}`);
        badgeOk();
    } else {
        logError("[initGist]", error || payload);
        badgeError();
    }
    badgeClear();
};

initGist();

const setFaviconCode = `
var link;
if (window.location.href.startsWith("file://")){
    link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    setTimeout(() => {
        link.href = "https://github.com/vict0rsch/PaperMemory/blob/master/icons/favicon-192x192.png?raw=true"
    }, 350);
}`;

const fetchOpenReviewNoteJSON = async (url) => {
    const id = url.match(/id=([\w-])+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?id=${id}`;
    let response = await fetch(api);
    let json = await response.json();
    if (json["status"] === 404) {
        warn("Note not found in api.openreview.net, trying api2.openreview.net...");
        const api2 = `https://api2.openreview.net/notes?id=${id}`;
        response = await fetch(api2);
        json = await response.json();
    }
    return json;
};

const fetchOpenReviewForumJSON = async (url) => {
    const id = url.match(/id=([\w-])+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?forum=${id}`;
    let response = await fetch(api);
    let json = await response.json();
    if (json["status"] === 404 || json["notes"].length === 0) {
        warn("Forum not found in api.openreview.net, trying api2.openreview.net...");
        const api2 = `https://api2.openreview.net/notes?forum=${id}`;
        response = await fetch(api2);
        json = await response.json();
    }
    return json;
};

const fetchGSData = async (paper) => {
    try {
        let html = await fetchText(
            `https://scholar.google.com/scholar?q=${encodeURI(paper.title)}&hl=en`
        );
        html = html.split("gs_res_ccl_mid")[1];
        if (!html) return { note: null };

        const mhtml = miniHash(html, "_");
        const matchedLower = mhtml.match(
            new RegExp(`_a_id__(\\w+)__href.+_${miniHash(paper.title, "_")}__a_`)
        );

        if (!matchedLower || !matchedLower[1]) return { note: null };

        const dataIdLower = matchedLower[1];
        const startIndex = mhtml.indexOf(dataIdLower);
        if (startIndex < 0) return { note: null };

        const dataId = html.substring(startIndex, startIndex + dataIdLower.length);

        const citeURL = `https://scholar.google.com/scholar?q=info:${dataId}:scholar.google.com/&output=cite&scirp=0&hl=en`;
        const citeHTML = await fetchText(citeURL);
        const bibtexURL = citeHTML
            .match(/<a[^>]*href="([^>]+)"[^>]*>BibTex<\/a>/i)[1]
            ?.replaceAll("&amp;", "&");
        if (!bibtexURL) return { note: null };

        const bibtex = await fetchText(bibtexURL);
        const venue = bibtexToObject(bibtex)?.journal;
        if (
            venue &&
            !venue.toLowerCase().endsWith("xiv") &&
            !venue.toLowerCase().includes("preprint")
        ) {
            const note = `Accepted @ ${venue} -- [scholar.google.com]`;
            return { venue, note, bibtex: bibtexToString(bibtex) };
        }
        return { note: null };
    } catch (error) {
        logError("[GoogleScholar]", error);
    }
};

const fetchPWCData = async (arxivId, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxivId) {
        log("Fetching PWC data for arxivId:", arxivId);
        pwcPath += new URLSearchParams({ arxiv_id: arxivId });
    } else if (title) {
        log("Fetching PWC data for paper:", title);
        pwcPath += new URLSearchParams({ title });
    }
    const response = await fetch(pwcPath);
    const json = await response.json();

    if (json["count"] !== 1) {
        log("No PWC entry match.");
        return;
    }
    log("PWC entry match:", json["results"][0]["id"]);
    return json["results"][0];
};

const findCodesForPaper = async (request) => {
    let arxivId, title, code;
    if (request.paper.source === "arxiv") {
        arxivId = request.paper.id.split("-").last().replace("_", "/");
    } else {
        title = request.paper.title;
    }
    const pwcData = await fetchPWCData(arxivId, title);
    if (!pwcData) return code;
    const { id, proceeding, published, conference } = pwcData;
    info("Found a PWC proceeding paper:", pwcData);
    let venue, year;

    if (conference) {
        const confData = await fetchJSON(
            `https://paperswithcode.com/api/v1/conferences/${conference}`
        );
        venue = confData?.name;
    }
    if (published) {
        year = published.split("-")[0];
    }

    if (proceeding && (!year || !venue)) {
        year = proceeding.match(/(\d{4})/)[0];
        venue = proceeding
            .split(year)[0]
            .split("-")
            .filter((p) => p)
            .map((p) => p[0].toUpperCase() + p.slice(1))
            .join(" ")
            .trim();
    }
    if (year && venue) {
        code = {
            note: `Accepted @ ${venue} (${year}) -- [paperswithcode.com]`,
            venue,
            pubYear: year,
        };
    }

    if (!id) return code;

    const json = await fetchJSON(
        `https://paperswithcode.com/api/v1/papers/${id}/repositories/`
    );

    if (json.data["count"] < 1) {
        log("No code found for paper.");
        return code;
    }

    let codes = json.data["results"];

    const { pwcPrefs } = request;
    const official = pwcPrefs.hasOwnProperty("official") ? pwcPrefs.official : false;
    const framework = pwcPrefs.hasOwnProperty("framework")
        ? pwcPrefs.framework
        : "none";

    const officials = codes.filter((c) => c["is_official"]);
    log("All codes for paper:", codes);
    if (officials.length > 0) {
        codes = officials;
        log("Selecting official codes only:", codes);
    } else {
        if (official) {
            log("No official code found for paper.");
            return code;
        }
    }
    if (framework !== "none") {
        const implems = codes.filter((c) => c["framework"] === framework);
        if (implems.length > 0) {
            log(`Selecting framework '${framework}':`, implems);
            codes = implems;
        }
    }
    codes.sort((a, b) => b.stars - a.stars);
    info(`Found PWC repository: ${codes[0]["url"]} (${codes[0]["stars"]} stars)`);
    return { ...codes[0], ...code };
};

const pullSyncPapers = async () => {
    if (!(await shouldSync())) return;
    try {
        badgeWait("Pull...");
        const start = Date.now();
        const localSyncID = await getIdentifier();
        consoleHeader(`Pulling ${String.fromCodePoint("0x23EC")}`);
        log("Pulling from Github...");
        global.state.gistData = await getDataForGistFile({
            file: global.state.gistFile,
            gistid: global.state.gistId,
        });
        const remoteSyncId = global.state.gistData["__syncId"];
        delete global.state.gistData["__syncId"];

        let remotePapers;
        if (remoteSyncId === localSyncID) {
            remotePapers = (await getStorage("papers")) ?? {};
        } else {
            remotePapers = global.state.gistData;
        }
        if (remoteSyncId === localSyncID) {
            warn("Pulled sync data from same device, ignoring.");
        }
        log("Pulled papers:", remotePapers);
        const duration = (Date.now() - start) / 1e3;
        info(`Pulling from Github... Done (${duration}s)!`);
        console.groupEnd();
        badgeOk();
        badgeClear();
        return remotePapers;
    } catch (e) {
        logError("[pullSyncPapers]", e);
        badgeError();
    }
    badgeClear();
    console.groupEnd();
};

const pushSyncPapers = async () => {
    if (!(await shouldSync())) return;
    const identifier = await getIdentifier();
    try {
        const start = Date.now();
        consoleHeader(`Pushing ${String.fromCodePoint("0x23EB")}`);
        log("Writing to Github...");
        badgeWait("Push...");
        chrome.action.setBadgeBackgroundColor({ color: "rgb(189, 127, 10)" });
        const papers = (await getStorage("papers")) ?? {};
        const syncId = await getIdentifier();
        log("Papers to write: ", papers);
        papers["__syncId"] = syncId;
        await updateGistFile({
            file: global.state.gistFile,
            content: papers,
            gistId: global.state.gistId,
        });
        const duration = (Date.now() - start) / 1e3;
        log(`Writing to Github... Done (${duration}s)!`);
        badgeOk();
    } catch (e) {
        logError("[pushSyncPapers]", e);
        badgeError();
    }
    badgeClear();
    console.groupEnd();
};

const fetchArxivXML = async (paperId) => {
    const arxivId = paperId.replace("Arxiv-", "").replace("_", "/");
    const response = await fetch(
        "https://export.arxiv.org/api/query?" +
            new URLSearchParams({ id_list: arxivId })
    );
    return await response.text();
};

chrome.runtime.onMessage.addListener((payload, sender, sendResponse) => {
    if (payload.type === "update-title") {
        const { title, url } = payload.options;
        paperTitles[url] = title.replaceAll('"', "'");
        sendResponse(true);
    } else if (payload.type === "tabID") {
        sendResponse(sender.tab.id);
    } else if (payload.type === "papersWithCode") {
        findCodesForPaper(payload).then(sendResponse);
    } else if (payload.type === "google-scholar") {
        fetchGSData(payload.paper).then(sendResponse);
    } else if (payload.type === "download-pdf-to-store") {
        getStoredFiles().then((storedFiles) => {
            if (storedFiles.length === 0) {
                chrome.downloads.download({
                    url: URL.createObjectURL(new Blob([global.storeReadme])),
                    filename: "PaperMemoryStore/IMPORTANT_README.txt",
                    saveAs: false,
                });
            }
            let filename = "PaperMemoryStore/" + payload.title;
            filename = filename.replaceAll("?", "").replaceAll(":", "");
            chrome.downloads.download({ url: payload.pdfUrl, filename });
            sendResponse(true);
        });
    } else if (payload.type === "hello") {
        sendResponse("Connection to background script established.");
    } else if (payload.type === "writeSync") {
        pushSyncPapers().then(sendResponse);
    } else if (payload.type === "pullSync") {
        pullSyncPapers(payload.gist).then(sendResponse);
    } else if (payload.type === "restartGist") {
        initGist().then(sendResponse);
    } else if (payload.type === "OpenReviewNoteJSON") {
        fetchOpenReviewNoteJSON(payload.url).then(sendResponse);
    } else if (payload.type === "OpenReviewForumJSON") {
        fetchOpenReviewForumJSON(payload.url).then(sendResponse);
    } else if (payload.type === "try-semantic-scholar") {
        trySemanticScholar(payload.paper, false).then(sendResponse);
    } else if (payload.type === "try-cross-ref") {
        tryCrossRef(payload.paper, false).then(sendResponse);
    } else if (payload.type === "try-dblp") {
        tryDBLP(payload.paper, false).then(sendResponse);
    } else if (payload.type === "try-unpaywall") {
        tryUnpaywall(payload.paper, false).then(sendResponse);
    } else if (payload.type === "fetch-arxiv-xml") {
        fetchArxivXML(payload.arxivId).then(sendResponse);
    }
    return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status) {
        if (changeInfo.status === "loading") {
            tabStatuses[tabId] = "loading";
        } else if (changeInfo.status === "complete") {
            tabStatuses[tabId] = "complete";
        }
    } else {
        tab = await new Promise((resolve) =>
            chrome.tabs.get(tabId, (tab) => resolve(tab))
        );
        if (tabStatuses.hasOwnProperty(tabId) && tabStatuses[tabId] === "complete") {
            const paperTitle = paperTitles[tab.url];
            if (paperTitle && tab.title !== paperTitle) {
                console.log(">>> Setting tab title to :", paperTitle);
                chrome.scripting.executeScript({
                    target: { tabId },
                    code: `
                        ${setTitleCode(paperTitle)};
                        ${setFaviconCode};
                    `,
                    runAt: "document_start",
                });
            }
        }
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // https://stackoverflow.com/a/50548409/3867406
    // read changeInfo data and do something with it
    // like send the new url to content_scripts.js
    if (changeInfo.url) {
        if (
            (await isSourceURL(changeInfo.url)) &&
            changeInfo.url.includes("openreview")
        ) {
            chrome.tabs.sendMessage(tabId, {
                message: "tabUrlUpdate",
                url: changeInfo.url,
            });
        }
    }
});

chrome.commands.onCommand.addListener((command) => {
    console.log(`Received command: ${command}`);
    if (command === "manualParsing") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { message: "manualParsing" });
        });
    } else if (command === "downloadPdf") {
        chrome.tabs.query({ active: true, currentWindow: true }, async function (tabs) {
            const url = tabs[0].url;
            await initState();
            const id = await parseIdFromUrl(url);
            if (id) {
                const paper = global.state.papers[id];
                if (paper) {
                    downloadPaperPdf(paper);
                } else {
                    warn("Unknown paper id:", id);
                }
            }
        });
    } else if (command === "defaultAction") {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { message: "defaultAction" });
        });
    }
});

chrome.runtime.onConnect.addListener(function (port) {
    if (port.name === "PaperMemoryPopupSync") {
        log("[chrome.runtime.onConnect] Popup connected.");
        port.onDisconnect.addListener(async function () {
            log("[chrome.runtime.onConnect] Popup disconnected.");
            await pushSyncPapers();
        });
    }
});

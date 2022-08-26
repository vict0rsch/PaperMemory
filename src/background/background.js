var paperTitles = {};
var MAX_TITLE_UPDATES = 100;
var tabStatuses = {};

const initSync = async () => {
    if (!(await shouldSync())) {
        log("Sync disabled.");
        return;
    }
    const { ok, error, payload } = await getGist();
    if (ok) {
        global.state.gist = payload.gist;
        global.state.gistDataFile = await getDataFile(global.state.gist);
    } else {
        logError("[initSync]", error);
    }
};

initSync();

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

const setTitleCode = (title) => `
try {
    target = "${title}";
    document.title = "";
    const qtitle = document.querySelector("title");
    qtitle && (qtitle.innerHTML = "");
    setTimeout(() => {
        document.title = target;
        qtitle && (qtitle.innerHTML = target);
    }, 10)
} catch (e) {}
`;

const urlIsAKnownPdfSource = (url) => {
    if (!url) return false;
    const pdfPages = Object.values(global.knownPaperPages).map((v) =>
        v.filter((u) => typeof u === "string").last()
    );
    return pdfPages.some((p) => url.includes(p));
};

const fetchGSData = async (paper) => {
    try {
        var resultsDom = await fetchDom(
            `https://scholar.google.com/scholar?q=${encodeURI(paper.title)}&hl=en`
        );
        const result = queryAll(resultsDom, "#gs_res_ccl_mid h3.gs_rt")
            .map((h3, idx) => [
                miniHash(h3.innerText.toLowerCase().replace("[pdf]", "")),
                idx,
            ])
            .find(([mh3, idx]) => mh3 === miniHash(paper.title));
        const dataId = resultsDom
            .querySelector(".gs_r.gs_or.gs_scl")
            ?.getAttribute("data-aid");
        if (result && dataId) {
            const [, idx] = result;
            const citeDom = await fetchDom(
                `https://scholar.google.fr/scholar?q=info:${dataId}:scholar.google.com/&output=cite&scirp=0&hl=en`
            );
            const bibURL = queryAll(citeDom, "a.gs_citi")
                .find((a) => a.innerText.toLowerCase() === "bibtex")
                ?.getAttribute("href");
            if (bibURL) {
                const bibtex = await fetchText(bibURL);
                const venue = bibtexToObject(bibtex)?.journal;
                if (
                    venue &&
                    !venue.toLowerCase().includes("arxiv") &&
                    !venue.toLowerCase().includes("preprint")
                ) {
                    const note = `Accepted @ ${venue} -- [scholar.google.com]`;
                    return { venue, note, bibtex: bibtexToString(bibtex) };
                }
            }
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
        arxivId = request.paper.id.split("-").last();
    } else {
        title = request.paper.title;
    }
    const pwcData = await fetchPWCData(arxivId, title);
    if (!pwcData) return code;
    const { id, proceeding } = pwcData;

    if (proceeding) {
        const venue = proceeding.split("-")[0].toUpperCase();
        const year = proceeding.split("-")[1];
        info("Found a PWC proceeding paper:", venue, year);
        code = {
            note: `Accepted @ ${venue} (${year}) -- [paperswithcode.com]`,
            venue,
            pubYear: year,
        };
    }

    if (!id) return code;

    const codePath = `https://paperswithcode.com/api/v1/papers/${id}/repositories/`;

    const response = await fetch(codePath);
    const json = await response.json();

    if (json["count"] < 1) {
        log("No code found for paper.");
        return code;
    }

    let codes = json["results"];

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
        log("Pulling from Github...");
        await global.state.gistDataFile.fetchLatest();
        info("Pulling from Github... Done!");
        return global.state.gistDataFile.content;
    } catch (e) {
        logError("[pullSyncPapers]", e);
    }
};

const pushSyncPapers = async () => {
    console.log("await shouldSync(): ", await shouldSync());
    if (!(await shouldSync())) return;
    try {
        console.log("Writing to Github...");
        const papers = (await getStorage("papers")) ?? {};
        console.log("papers to write: ", papers);
        await global.state.gistDataFile.overwrite(JSON.stringify(papers, null, ""));
        await global.state.gistDataFile.save();
        console.log("Writing to Github... Done!");
    } catch (e) {
        logError("[pushSyncPapers]", e);
    }
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
    } else if (payload.type === "reSync") {
        initSync().then(sendResponse);
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
                chrome.tabs.executeScript(tabId, {
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
    }
});

chrome.runtime.onConnect.addListener(function (port) {
    if (port.name === "PaperMemorySync") {
        console.log("PaperMemorySync connected.");
        port.onDisconnect.addListener(async function () {
            console.log("PaperMemorySync: popup has been closed");
            await pushSyncPapers();
        });
    }
});

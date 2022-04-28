var paperTitles = {};
var MAX_TITLE_UPDATES = 100;
var tabStatuses = {};

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
        const conf = proceeding.split("-")[0].toUpperCase();
        const year = proceeding.split("-")[1];
        info("Found a PWC proceeding paper:", conf, year);
        code = {
            note: `Accepted @ ${conf} ${year} -- [paperswithcode.com]`,
            venue: conf,
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

chrome.runtime.onMessage.addListener((payload, sender, sendResponse) => {
    if (payload.type === "update-title") {
        const { title, url } = payload.options;
        paperTitles[url] = title.replaceAll('"', "'");
        sendResponse(true);
    } else if (payload.type === "tabID") {
        sendResponse(sender.tab.id);
    } else if (payload.type === "papersWithCode") {
        findCodesForPaper(payload).then(sendResponse);
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
            (await isKnownURL(changeInfo.url)) &&
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
    }
});

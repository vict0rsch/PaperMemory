var paperTitles = {};
var titleUpdates = {};
var MAX_TITLE_UPDATES = 100;

const setFaviconCode = `
var link;
if (window.location.href.startsWith("file://")){
    link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
    }
    setTimeout( () => {link.href = "https://github.com/vict0rsch/PaperMemory/blob/master/icons/favicon-192x192.png?raw=true"}, 50);
}`;

const knownPageHasUrl = (url) => {
    const pdfPages = Object.values(global.knownPaperPages).map(
        (v) => v.filter((u) => typeof u === "string").reverse()[0]
    );
    return pdfPages.some((p) => url.includes(p));
};

const fetchPWCData = async (arxivId, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxivId) {
        pwcPath += new URLSearchParams({ arxiv_id: arxivId });
    } else if (title) {
        pwcPath += new URLSearchParams({ title });
    }
    const response = await fetch(pwcPath);
    const json = await response.json();

    if (json["count"] !== 1) return;
    return json["results"][0];
};

const findCodesForPaper = async (request) => {
    let arxivId, title, code;
    if (request.paper.source === "arxiv") {
        arxivId = request.paper.id.split("-").reverse()[0];
    } else {
        title = request.paper.title;
    }
    const pwcData = await fetchPWCData(arxivId, title);
    if (!pwcData) return code;
    const { id, proceeding } = pwcData;

    if (proceeding) {
        const conf = proceeding.split("-")[0].toUpperCase();
        const year = proceeding.split("-")[1];
        code = {
            note: `Accepted @ ${conf} ${year} -- [paperswithcode.com]`,
            venue: conf,
        };
    }

    if (!id) return code;

    const codePath = `https://paperswithcode.com/api/v1/papers/${id}/repositories/`;

    const response = await fetch(codePath);
    const json = await response.json();

    if (json["count"] < 1) return code;

    let codes = json["results"];
    const officials = codes.filter((c) => c["is_official"]);
    console.log("All codes for paper:", codes);
    if (officials.length > 0) {
        codes = officials;
        console.log("Selecting official codes only:", codes);
    } else {
        if (request.officialReposOnly) {
            return code;
        }
    }
    codes.sort((a, b) => b.stars - a.stars);
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
            chrome.downloads.download({
                url: payload.pdfUrl,
                filename: "PaperMemoryStore/" + payload.title,
            });
            sendResponse(true);
        });
    }
    return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const paperTitle = paperTitles[tab.url];
    if (!titleUpdates.hasOwnProperty(tabId)) titleUpdates[tabId] = 0;
    if (titleUpdates[tabId] > MAX_TITLE_UPDATES - 1) {
        if (titleUpdates[tabId] == MAX_TITLE_UPDATES) {
            console.log(
                "WARNING: max number of title titleUpdates reached. " +
                    "This is a logic failure in PaperMemory. " +
                    "Please open an issue at https://github.com/vict0rsch/PaperMemory"
            );
            titleUpdates[tabId] += 1;
        }
        return; // in case of logic failure on different browsers, prevent infinite loop
    }
    if (
        paperTitle && // title from content_script message is set
        changeInfo.title && // change is about title
        !knownPageHasUrl(changeInfo.title) && // ignore event triggered by `document.title=''` which sets title to url
        changeInfo.title !== paperTitle && // there is a new title
        isPdfUrl(tab.url) // only valid for pdfs
    ) {
        console.log(`Updating pdf file name to "${paperTitle}"`);

        // https://stackoverflow.com/questions/69406482/window-title-is-not-changed-after-pdf-is-loaded
        chrome.tabs.executeScript(tabId, {
            code: `window.document.title='';window.document.title="${paperTitle}";${setFaviconCode}`,
            runAt: "document_start",
        });
        titleUpdates[tabId] += 1;
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // https://stackoverflow.com/a/50548409/3867406
    // read changeInfo data and do something with it
    // like send the new url to content_scripts.js
    if (changeInfo.url) {
        if (await isKnownURL(changeInfo.url)) {
            chrome.tabs.sendMessage(tabId, {
                message: "tabUrlUpdate",
                url: changeInfo.url,
            });
        }
    }
});

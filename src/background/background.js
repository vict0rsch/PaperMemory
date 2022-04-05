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
    setTimeout( () => {link.href = "https://github.com/vict0rsch/PaperMemory/blob/master/icons/favicon-192x192.png?raw=true"}, 350);
}`;

const setTitleCode = (title) => `
target = "${title}";
document.querySelector("title").innerHTML = "";
setTimeout(() => {
    document.querySelector("title").innerHTML = target;
}, 10)
`;

const urlIsAKnownPdfSource = (url) => {
    if (!url) return false;
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
        if (await isKnownURL(changeInfo.url)) {
            chrome.tabs.sendMessage(tabId, {
                message: "tabUrlUpdate",
                url: changeInfo.url,
            });
        }
    }
});

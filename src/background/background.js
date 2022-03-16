var paperTitles = {};
var titleUpdates = {};
global.isBackground = true;

const knownPageHasUrl = (url) => {
    const pdfPages = Object.values(global.knownPaperPages).map((v) => v.reverse()[0]);
    return pdfPages.some((p) => url.includes(p));
};

const isPdf = (url) => {
    return url.endsWith(".pdf") || url.includes("openreview.net/pdf");
};

const injectFiles = async (tabId, scripts) => {
    for (const file of scripts) {
        if (file.endsWith("css")) {
            await chrome.tabs.insertCSS(tabId, { file });
        } else {
            await chrome.tabs.executeScript(tabId, { file });
        }
    }
};

const injectArxiv = (tabId) => {
    injectFiles(tabId, [
        "/src/shared/css/loader.css",
        "/src/content_scripts/content_script.css",
        "/src/shared/min/jquery.min.js",
        "/src/shared/min/utils.min.js",
        "/src/background/svg.js",
        "/src/background/arxiv.js",
    ]);
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
    const { id, proceeding } = pwcData;

    if (proceeding) {
        const conf = proceeding.split("-")[0].toUpperCase();
        const year = proceeding.split("-")[1];
        code = { note: `Accepted @ ${conf} ${year} -- [paperswithcode.com]` };
    }

    if (!pwcData) return code;

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
    } else if (request.onlyOfficialRepos) {
        return code;
    }
    codes.sort((a, b) => b.stars - a.stars);
    return { ...codes[0], ...code };
};

const monitorTab = async (tabId, is, url) => {
    await initState(undefined, true);
    const menu = await getMenu();

    const update = await addOrUpdatePaper(url, is, menu, tabId);
    let id;
    if (update) {
        id = update.id;
    }

    if (id && menu.checkPdfTitle) {
        const makeTitle = async (id, url) => {
            if (!global.state.papers.hasOwnProperty(id)) return;
            const paper = global.state.papers[id];
            title = stateTitleFunction(paper);
            paperTitles[url] = title.replaceAll('"', "'");
            chrome.tabs.executeScript(tabId, {
                code: `window.document.title="${title}";`,
            });
        };
        makeTitle(id, url);
    }
};

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.type === "papersWithCode") {
        findCodesForPaper(request).then((code) => {
            sendResponse({ code: code, success: true });
        });
    } else if (request.type === "get-tabId") {
        sendResponse({ tabId: sender.tab.id, success: true });
    }
    return true;
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    console.log("changeInfo: ", changeInfo);
    if (tab.url && changeInfo.url) {
        if (tab?.url.includes("arxiv.org/abs/")) injectArxiv(tabId);
        const is = isPaper(tab.url);
        if (Object.values(is).some((v) => v)) {
            monitorTab(tabId, is, tab.url);
        }
    }
});

// update window title based on paper title
// a little messy due to some issues, cf SO question
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const paperTitle = paperTitles[tab.url];
    if (!titleUpdates.hasOwnProperty(tabId)) titleUpdates[tabId] = 0;
    if (titleUpdates[tabId] > 9) {
        if (titleUpdates[tabId] == 10) {
            console.log(
                "WARNING: max number of title titleUpdates reached. This is a logic failure in PaperMemory. Please open an issue at https://github.com/vict0rsch/PaperMemory"
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
        isPdf(tab.url) // only valid for pdfs
    ) {
        console.log(`Updating pdf file name to "${paperTitle}"`);

        // https://stackoverflow.com/questions/69406482/window-title-is-not-changed-after-pdf-is-loaded
        chrome.tabs.executeScript(tabId, {
            code: `document.title=''; document.title="${paperTitle}"`,
            runAt: "document_start",
        });
        titleUpdates[tabId] += 1;
    }
});

// ES Module imports - Service Worker Safe
import { state, storeReadmeUrl } from "@pmu/config.js";
import {
    shouldSync,
    getIdentifier,
    getGist,
    getDataForGistFile,
    updateGistFile,
} from "@pmu/sync.js";
import { getStorage, setStorage } from "@pmu/data.js";
import { runMemoryOp, serveMemoryOps } from "@pmu/memoryQueue.js";
import { openWelcomeOnInstall } from "@pm/background/welcome.js";
import { applyIgnoreSources } from "@pmu/ignoreSources.js";
import { isSourceURL, parseIdFromUrl } from "@pmu/urls.js";
import { initState, downloadPaperPdf } from "@pmu/state.js";
import { matchPapersToFiles } from "@pmu/files.js";
import {
    trySemanticScholar,
    tryCrossRef,
    tryDBLP,
    tryOpenAlex,
    isPreprintRecord,
    MATCH_TIMEOUT,
} from "@pmu/preprintMatching.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import {
    log,
    warn,
    logOk,
    logError,
    info,
    consoleHeader,
    miniHash,
    getStoredFiles,
} from "@pmu/functions.js";

export function initBackground() {
    serveMemoryOps(); // this context runs the Memory's write queue for every page
    chrome.runtime.onInstalled.addListener(openWelcomeOnInstall);
    var tabStatuses = {};
    var paperTitles = {};

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
            info("Sync disabled.");
            return { ok: false, error: "Sync is off." };
        }
        const start = Date.now();
        log("Initializing Sync...");
        badgeWait("Init...");
        const { ok, error, payload } = await getGist();
        if (ok) {
            state.gistFile = payload.file;
            state.gistId = payload.gistId;
            const duration = (Date.now() - start) / 1e3;
            logOk(`Sync successfully enabled (${duration}s).`);
            info(`Using gist: ${payload.gistId}`);
            badgeOk();
        } else {
            logError("[initGist]", error || payload);
            badgeError();
        }
        badgeClear();
        return ok ? { ok: true } : { ok: false, error: String(error || payload) };
    };

    // One gist initialization at a time, shared by every caller (pull, push, restart): a
    // message that wakes the service worker is handled while it still asks GitHub for the
    // gist. restart: a new one even if the gist is known (a new token).
    let gistInit = null;
    const startGistInit = ({ restart = false } = {}) => {
        if (gistInit && !restart) return gistInit;
        const run = (restart && gistInit ? gistInit.catch(() => {}) : Promise.resolve())
            .then(() => initGist())
            .finally(() => {
                if (gistInit === run) gistInit = null;
            });
        gistInit = run;
        return run;
    };
    /** Resolves once the gist is known; rejects (pull / push abort) when it cannot be */
    const ensureGist = async () => {
        if (gistInit) {
            const { ok, error } = await gistInit;
            if (!ok) throw new Error(error ?? "Sync could not start.");
        }
        if (state.gistId && state.gistFile) return;
        const { ok, error } = await startGistInit();
        if (!ok) throw new Error(error ?? "Sync could not start.");
    };
    startGistInit();

    // Remove DOM-dependent setFaviconCode since it's not needed in service worker

    const fetchOpenReviewNoteJSON = async (url) => {
        const match = url.match(/id=([\w-]+)/);
        if (!match) return;
        const id = match[1];
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
        const match = url.match(/id=([\w-]+)/);
        if (!match) return;
        const id = match[1];
        const api = `https://api.openreview.net/notes?forum=${id}`;
        let response = await fetch(api);
        let json = await response.json();
        if (json["status"] === 404 || json["notes"].length === 0) {
            warn(
                "Forum not found in api.openreview.net, trying api2.openreview.net...",
            );
            const api2 = `https://api2.openreview.net/notes?forum=${id}`;
            response = await fetch(api2);
            json = await response.json();
        }
        return json;
    };

    /**
     * Google Scholar's published version of a paper: {venue, note, bibtex, status}, or
     * {note: null, status}. status is the HTTP status of the first failing request (403,
     * 429…: BibMatcher leaves Scholar out), else 200. Every request has a deadline; a preprint
     * record (bioRxiv, medRxiv… venue or preprint DOI) is no match.
     */
    const fetchGSData = async (paper) => {
        let status = 200;
        /** The text of a page, "" (and status kept) when it fails */
        const get = async (url) => {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(MATCH_TIMEOUT),
            });
            if (!response.ok) {
                status = response.status;
                return "";
            }
            return (await response.text()).trim();
        };
        try {
            let html = await get(
                `https://scholar.google.com/scholar?q=${encodeURI(paper.title)}&hl=en`,
            );
            html = html.split("gs_res_ccl_mid")[1];
            if (!html) return { note: null, status };

            const mhtml = miniHash(html, "_");
            const matchedLower = mhtml.match(
                new RegExp(`_a_id__(\\w+)__href.+_${miniHash(paper.title, "_")}__a_`),
            );

            if (!matchedLower || !matchedLower[1]) return { note: null, status };

            const dataIdLower = matchedLower[1];
            const startIndex = mhtml.indexOf(dataIdLower);
            if (startIndex < 0) return { note: null, status };

            const dataId = html.substring(startIndex, startIndex + dataIdLower.length);

            const citeURL = `https://scholar.google.com/scholar?q=info:${dataId}:scholar.google.com/&output=cite&scirp=0&hl=en`;
            const citeHTML = await get(citeURL);
            const bibtexURL = citeHTML
                .match(/<a[^>]*href="([^>]+)"[^>]*>BibTex<\/a>/i)?.[1]
                ?.replaceAll("&amp;", "&");
            if (!bibtexURL) return { note: null, status };

            const bibtex = await get(bibtexURL);
            if (!bibtex) return { note: null, status };
            const bib = bibtexToObject(bibtex);
            const venue = bib?.journal;
            if (
                venue &&
                !venue.toLowerCase().endsWith("xiv") &&
                !venue.toLowerCase().includes("preprint") &&
                !isPreprintRecord({ venue, doi: bib.doi }) &&
                !isPreprintRecord({ venue: bib.publisher })
            ) {
                const note = `Accepted @ ${venue} -- [scholar.google.com]`;
                return { venue, note, bibtex: bibtexToString(bibtex), status };
            }
            return { note: null, status };
        } catch (error) {
            logError("[GoogleScholar]", error);
            // a request that timed out or failed: no answer, no status to act on
            return { note: null, status: status === 200 ? undefined : status };
        }
    };

    // report: answer {ok, papers | error} instead of the papers or undefined, so a page can
    // tell a failed pull from an empty one (options page: Sync now)
    const pullSyncPapers = async ({ report = false } = {}) => {
        if (!(await shouldSync()))
            return report ? { ok: false, error: "Sync is off." } : undefined;
        try {
            await ensureGist();
            badgeWait("Pull...");
            const start = Date.now();
            const localSyncID = await getIdentifier();
            consoleHeader(`Pulling ${String.fromCodePoint("0x23EC")}`);
            log("Pulling from Github...");
            state.gistData = await getDataForGistFile({
                file: state.gistFile,
                gistId: state.gistId,
            });
            const remoteSyncId = state.gistData["__syncId"];
            delete state.gistData["__syncId"];

            let remotePapers;
            if (remoteSyncId === localSyncID) {
                remotePapers = (await getStorage("papers")) ?? {};
            } else {
                remotePapers = state.gistData;
            }
            if (remoteSyncId === localSyncID) {
                warn("Pulled sync data from same device, ignoring.");
            }

            if (typeof remotePapers === "string") {
                try {
                    remotePapers = JSON.parse(remotePapers);
                } catch (e) {
                    logError("[pullSyncPapers] Error parsing remote papers:", e);
                    logError("[pullSyncPapers] Remote papers:", remotePapers);

                    throw e;
                }
            }
            if (
                !remotePapers ||
                typeof remotePapers !== "object" ||
                Array.isArray(remotePapers)
            )
                throw new Error("The gist does not hold a Memory.");
            log("Pulled papers:", remotePapers);
            const duration = (Date.now() - start) / 1e3;
            info(`Pulling from Github... Done (${duration}s)!`);
            console.groupEnd();
            badgeOk();
            badgeClear();
            return report ? { ok: true, papers: remotePapers } : remotePapers;
        } catch (e) {
            logError("[pullSyncPapers]", e);
            badgeError();
            badgeClear();
            console.groupEnd();
            return report ? { ok: false, error: String(e?.message ?? e) } : undefined;
        }
    };

    // Uploads run one at a time, each reading the Memory when it starts; the uploads asked
    // for while one runs share a single next upload (it sends the latest Memory), so the
    // gist never ends with an older Memory than the last one asked for.
    let uploading = null;
    let nextUpload = null;
    const pushSyncPapers = async ({ report = false } = {}) => {
        if (!(await shouldSync()))
            return report ? { ok: false, error: "Sync is off." } : undefined;
        const start = () =>
            (uploading = uploadMemory().finally(() => {
                uploading = null;
            }));
        let run;
        if (!uploading) run = start();
        else
            run = nextUpload ??= uploading.then(() => {
                nextUpload = null;
                return start();
            });
        const result = await run;
        return report ? result : undefined;
    };

    /** One upload of the Memory as stored now: {ok, error?} */
    const uploadMemory = async () => {
        try {
            const start = Date.now();
            consoleHeader(`Pushing ${String.fromCodePoint("0x23EB")}`);
            log("Writing to Github...");
            badgeWait("Push...");
            chrome.action.setBadgeBackgroundColor({
                color: "rgb(189, 127, 10)",
            });
            await ensureGist();
            const papers = (await getStorage("papers")) ?? {};
            const syncId = await getIdentifier();
            log("Papers to write: ", papers);
            papers["__syncId"] = syncId;
            await updateGistFile({
                file: state.gistFile,
                content: papers,
                gistId: state.gistId,
            });
            const duration = (Date.now() - start) / 1e3;
            log(`Writing to Github... Done (${duration}s)!`);
            badgeOk();
            badgeClear();
            console.groupEnd();
            return { ok: true };
        } catch (e) {
            logError("[pushSyncPapers]", e);
            badgeError();
            badgeClear();
            console.groupEnd();
            return { ok: false, error: String(e?.message ?? e) };
        }
    };

    const fetchArxivXML = async (paperId) => {
        const arxivId = paperId.replace("Arxiv-", "").replace("_", "/");
        const response = await fetch(
            "https://export.arxiv.org/api/query?" +
                new URLSearchParams({ id_list: arxivId }),
        );
        if (!response.ok) {
            throw new Error(`arXiv API responded with ${response.status}`);
        }
        return response.text();
    };

    /** The paper's PDF in the downloads (PaperMemoryStore), or null */
    const findStoredPdf = async (id) => {
        const paper = ((await getStorage("papers")) ?? {})[id];
        if (!paper) return null;
        const matches = await matchPapersToFiles(
            { [id]: paper },
            await getStoredFiles(),
        );
        return matches[id] ?? null;
    };
    // PDF downloads started for a content script: download id → tab id, so the tab hears
    // when its download ends. Kept in storage.session (survives the MV3 worker stopping),
    // in memory where there is none. Changes run one at a time.
    const DOWNLOAD_TABS = "pdfDownloadTabs";
    const session = chrome.storage.session;
    let downloadTabs = {};
    let downloadTabsQueue = Promise.resolve();
    const changeDownloadTabs = (change) =>
        (downloadTabsQueue = downloadTabsQueue.then(async () => {
            const tabs = session
                ? ((await new Promise((r) => session.get(DOWNLOAD_TABS, r)))?.[
                      DOWNLOAD_TABS
                  ] ?? {})
                : downloadTabs;
            const before = JSON.stringify(tabs);
            const result = change(tabs);
            if (session && JSON.stringify(tabs) !== before)
                await new Promise((r) => session.set({ [DOWNLOAD_TABS]: tabs }, r));
            return result;
        }));
    /** A download ended (or was erased): tell its tab once, forget it */
    const downloadEnded = async (id, ok) => {
        const tabId = await changeDownloadTabs((tabs) => {
            const tab = tabs[id];
            delete tabs[id];
            return tab;
        });
        if (tabId === undefined) return;
        // the tab may be gone: reading lastError keeps that quiet
        chrome.tabs.sendMessage(
            tabId,
            { message: "pdfDownloadDone", id, ok },
            () => void chrome.runtime.lastError,
        );
    };
    // top level, registered at start: the event wakes the MV3 worker
    chrome.downloads.onChanged.addListener((delta) => {
        const state = delta.state?.current;
        if (state && state !== "in_progress")
            downloadEnded(delta.id, state === "complete");
    });
    chrome.downloads.onErased.addListener((id) => downloadEnded(id, false));

    /**
     * Starts a paper's PDF download into PaperMemoryStore/ (store) or the downloads folder;
     * its tab gets {message: "pdfDownloadDone", id, ok} when it ends
     * @returns {Promise<{id?: number, ok: boolean}>} at once
     */
    const downloadPdfFile = async ({ pdfUrl, title, store = true }, tabId) => {
        if (!/^https?:\/\//.test(pdfUrl)) return { ok: false };
        if (store && (await getStoredFiles()).length === 0) {
            chrome.downloads.download({
                url: storeReadmeUrl(),
                filename: "PaperMemoryStore/IMPORTANT_README.txt",
                saveAs: false,
            });
        }
        // the name without .pdf is cut, so the extension is always kept
        const base = String(title)
            .replace(/\.pdf$/i, "")
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
            .replace(/\.{2,}/g, ".")
            .replace(/^\.+|\.+$/g, "")
            .slice(0, 196)
            .replace(/\.+$/, "");
        const filename = `${store ? "PaperMemoryStore/" : ""}${base || "paper"}.pdf`;
        const id = await new Promise((resolve) =>
            chrome.downloads.download({ url: pdfUrl, filename }, (downloadId) =>
                resolve(chrome.runtime.lastError ? null : downloadId),
            ),
        );
        if (id === null || id === undefined) return { ok: false };
        await changeDownloadTabs((tabs) => {
            tabs[id] = tabId;
        });
        // it may have ended before it was recorded
        chrome.downloads.search({ id }, ([item] = []) => {
            if (!item) downloadEnded(id, false);
            else if (item.state !== "in_progress")
                downloadEnded(id, item.state === "complete");
        });
        return { id, ok: true };
    };

    chrome.runtime.onMessage.addListener((payload, sender, sendResponse) => {
        if (sender.id !== chrome.runtime.id) {
            return;
        }
        // for the welcome page (the popup announces itself); no answer from here
        if (payload.type === "popupOpened") return;
        if (payload.type === "update-title") {
            const { title, url } = payload.options;
            paperTitles[url] = title.replaceAll('"', "'");
            sendResponse(true);
        } else if (payload.type === "tabID") {
            sendResponse(sender.tab.id);
        } else if (payload.type === "google-scholar") {
            fetchGSData(payload.paper).then(sendResponse);
        } else if (payload.type === "download-pdf-to-store") {
            // the content script's Download (store: false = the downloads folder);
            // answers {id} at once, then "pdfDownloadDone" to the tab when it ends
            downloadPdfFile(payload, sender.tab?.id).then(sendResponse, (e) => {
                logError("[download-pdf-to-store]", e);
                sendResponse({ ok: false });
            });
        } else if (payload.type === "stored-pdf") {
            // the content script's PDF row: is it downloaded, show it in its folder
            findStoredPdf(payload.id)
                .then((file) => {
                    if (file && payload.show) chrome.downloads.show(file.id);
                    sendResponse({ found: !!file });
                })
                .catch((e) => {
                    logError("[stored-pdf]", e);
                    sendResponse({ found: false });
                });
        } else if (payload.type === "memory") {
            // the one queue that writes the Memory (memoryQueue.js)
            runMemoryOp(payload.op).then(sendResponse);
        } else if (payload.type === "ignoreSources") {
            // the one queue that writes ignoreSources (ignoreSources.js)
            applyIgnoreSources(payload.change).then(
                (ignoreSources) => sendResponse({ ok: true, ignoreSources }),
                () => sendResponse({ ok: false }),
            );
        } else if (payload.type === "hello") {
            sendResponse("Connection to background script established.");
        } else if (payload.type === "writeSync") {
            pushSyncPapers({ report: payload.report }).then(sendResponse);
        } else if (payload.type === "pullSync") {
            pullSyncPapers({ report: payload.report }).then(sendResponse);
        } else if (payload.type === "restartGist") {
            startGistInit({ restart: true }).then(sendResponse);
        } else if (payload.type === "OpenReviewNoteJSON") {
            // a refused request (e.g. 403 with an HTML page) answers nothing, not never
            fetchOpenReviewNoteJSON(payload.url)
                .then(sendResponse)
                .catch((e) => {
                    logError("[OpenReviewNoteJSON]", e);
                    sendResponse(undefined);
                });
        } else if (payload.type === "OpenReviewForumJSON") {
            fetchOpenReviewForumJSON(payload.url)
                .then(sendResponse)
                .catch((e) => {
                    logError("[OpenReviewForumJSON]", e);
                    sendResponse(undefined);
                });
        } else if (payload.type === "try-semantic-scholar") {
            trySemanticScholar(payload.paper, false).then(sendResponse);
        } else if (payload.type === "try-cross-ref") {
            tryCrossRef(payload.paper, false).then(sendResponse);
        } else if (payload.type === "try-dblp") {
            tryDBLP(payload.paper, false).then(sendResponse);
        } else if (payload.type === "try-openalex") {
            tryOpenAlex(payload.paper, false).then(sendResponse);
        } else if (payload.type === "fetch-arxiv-xml") {
            fetchArxivXML(payload.paperId)
                .then(sendResponse)
                .catch((e) => {
                    logError("[fetchArxivXML]", e);
                    sendResponse("");
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
                chrome.tabs.get(tabId, (tab) => resolve(tab)),
            );
            if (
                tabStatuses.hasOwnProperty(tabId) &&
                tabStatuses[tabId] === "complete"
            ) {
                const paperTitle = paperTitles[tab.url];
                if (paperTitle && tab.title !== paperTitle) {
                    console.log(">>> Setting tab title to :", paperTitle);
                    chrome.scripting.executeScript({
                        target: { tabId },
                        func: (title) => {
                            document.title = title;
                        },
                        args: [paperTitle],
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
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "manualParsing",
                });
            });
        } else if (command === "downloadPdf") {
            chrome.tabs.query(
                { active: true, currentWindow: true },
                async function (tabs) {
                    const url = tabs[0].url;
                    await initState();
                    const id = await parseIdFromUrl(url);
                    if (id) {
                        const paper = state.papers[id];
                        if (paper) {
                            downloadPaperPdf(paper);
                        } else {
                            warn("Unknown paper id:", id);
                        }
                    }
                },
            );
        } else if (command === "defaultAction") {
            chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    message: "defaultAction",
                });
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
} // end initBackground

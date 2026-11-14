import { initState } from "@pmu/state.js";
import { ingest } from "@pm/background/agentIngest.js";

// Chrome's offscreen document for Agent access ingest. Offscreen documents only get
// chrome.runtime: PaperMemory's storage calls go to the background, which makes them
// filtered (filterStorageRequest in agentIngest.js).
const forwardStorage = (op, argName) => (arg, callback) => {
    const response = chrome.runtime.sendMessage({
        type: "agent-storage",
        op,
        [argName]: arg,
    });
    if (!callback) return response;
    response.then(callback);
};
chrome.storage = {
    local: { get: forwardStorage("get", "keys"), set: forwardStorage("set", "items") },
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "agent-ingest-job") return;
    // only from the background, never from a tab
    if (sender.tab || sender.url !== chrome.runtime.getURL("background.js")) return;
    ingest(message.job).then((outcome) =>
        sendResponse({ type: "agent-ingest-result", jobId: message.jobId, outcome }),
    );
    return true;
});

// Their chrome.runtime has no getManifest either, from which initState reads the
// data version: read the packaged manifest
fetch(chrome.runtime.getURL("manifest.json"))
    .then((response) => response.json())
    .then((manifest) => {
        chrome.runtime.getManifest = () => manifest;
        return initState({ isContentScript: true });
    })
    .then(() => chrome.runtime.sendMessage({ type: "agent-ingest-ready" }));

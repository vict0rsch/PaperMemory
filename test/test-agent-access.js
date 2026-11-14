import { expect } from "expect";
import { filterStorageRequest } from "@pm/background/agentIngest.js";
import { isValidPairSender } from "@pm/background/agentAccess.js";
import { sendMessageToBackground, setLocalBackgroundHandler } from "@pmu/functions.js";

describe("Agent access background", () => {
    describe("#filterStorageRequest", () => {
        it("reports sync credentials, backups and Agent access keys absent", () => {
            expect(filterStorageRequest("get", "syncPAT")).toEqual([]);
            expect(
                filterStorageRequest("get", [
                    "papers",
                    "syncPAT",
                    "syncId",
                    "syncState",
                    "syncTest",
                    "sync",
                    "weeklyBackups",
                    "papersBackup",
                    "agentAccess",
                    "agentClients",
                    "prefs",
                ]),
            ).toEqual(["papers", "prefs"]);
        });

        it("drops a prefs write, and the write's callback still runs", () => {
            // the background's storage proxy: chrome.storage.local.set(filtered items,
            // callback answering the offscreen document)
            const storage = { prefs: { checkNoAuto: false } };
            const set = (items, callback) => {
                Object.assign(storage, items);
                callback();
            };
            let calledBack = false;
            const items = filterStorageRequest("set", { prefs: { checkNoAuto: true } });
            expect(items).toEqual({});
            set(items, () => (calledBack = true));
            expect(calledBack).toBe(true);
            expect(storage).toEqual({ prefs: { checkNoAuto: false } });
        });

        it("writes only papers and urlHashToId", () => {
            const papers = { __dataVersion: 10000 };
            expect(
                filterStorageRequest("set", {
                    papers,
                    urlHashToId: { abc: "Arxiv-1" },
                    weeklyBackups: {},
                    agentClients: {},
                }),
            ).toEqual({ papers, urlHashToId: { abc: "Arxiv-1" } });
        });
    });

    describe("#isValidPairSender", () => {
        const optionsUrl = "chrome-extension://pmid/options.html";
        const pairingTab = { id: 7 };
        const fromPairingTab = {
            id: "pmid",
            tab: pairingTab,
            url: `${optionsUrl}#agent-pairing=request-1`,
        };
        const makePending = () => ({
            requestId: "request-1",
            tabId: pairingTab.id,
            optionsUrl,
            clientName: "Claude Code",
        });

        it("accepts the options tab opened for the request", () => {
            expect(isValidPairSender(fromPairingTab, makePending())).toBe(true);
        });

        it("rejects a content script: other tab, web page", () => {
            const contentScript = {
                id: "pmid",
                tab: { id: 8 },
                url: "https://example.org/paper",
            };
            expect(isValidPairSender(contentScript, makePending())).toBe(false);
        });

        it("rejects a content script in the pairing tab after it navigated", () => {
            const contentScript = { ...fromPairingTab, url: "https://example.org/" };
            expect(isValidPairSender(contentScript, makePending())).toBe(false);
        });

        it("rejects the options page in another tab, and a sender without tab", () => {
            expect(
                isValidPairSender({ ...fromPairingTab, tab: { id: 8 } }, makePending()),
            ).toBe(false);
            const { tab, ...noTab } = fromPairingTab;
            expect(isValidPairSender(noTab, makePending())).toBe(false);
        });

        it("rejects a decision for an already-used requestId", () => {
            // the background keeps one pending request, deleted on its first decision
            let pending = makePending();
            const lookUp = (requestId) =>
                pending?.requestId === requestId ? pending : null;
            expect(isValidPairSender(fromPairingTab, lookUp("request-1"))).toBe(true);
            pending = null;
            expect(isValidPairSender(fromPairingTab, lookUp("request-1"))).toBe(false);
        });
    });

    describe("#sendMessageToBackground", () => {
        const previousChrome = global.chrome;
        let sent;

        before(() => {
            global.chrome = {
                runtime: {
                    id: "pmid",
                    sendMessage: (payload, callback) => {
                        sent = payload;
                        callback("runtime answer");
                    },
                },
            };
        });

        after(() => {
            setLocalBackgroundHandler(null);
            global.chrome = previousChrome;
            if (previousChrome === undefined) delete global.chrome;
        });

        beforeEach(() => (sent = undefined));

        it("calls the local background handler when it is set", async () => {
            const calls = [];
            setLocalBackgroundHandler((payload, sender, sendResponse) => {
                calls.push({ payload, sender });
                sendResponse("<feed/>");
                return true;
            });
            expect(await sendMessageToBackground({ type: "fetch-arxiv-xml" })).toBe(
                "<feed/>",
            );
            expect(calls).toEqual([
                { payload: { type: "fetch-arxiv-xml" }, sender: { id: "pmid" } },
            ]);
            expect(sent).toBeUndefined();
        });

        it("sends a runtime message when it is unset", async () => {
            setLocalBackgroundHandler(null);
            expect(await sendMessageToBackground({ type: "fetch-arxiv-xml" })).toBe(
                "runtime answer",
            );
            expect(sent).toEqual({ type: "fetch-arxiv-xml" });
        });
    });
});

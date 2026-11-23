import { expect } from "expect";
import { filterStorageRequest } from "@pm/background/agentIngest.js";
import { isValidPairSender, initAgentAccess } from "@pm/background/agentAccess.js";
import { createBadge } from "@pm/background/badge.js";
import { sendMessageToBackground, setLocalBackgroundHandler } from "@pmu/functions.js";
import { runMemoryOp, runMemoryOpFromMessage } from "@pmu/memoryQueue.js";
import { sha256Hex, makeProvenance } from "@pmu/agentOps.js";

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
                    "uploadBackup",
                    "memoryRecovery",
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

        it("writes only urlHashToId: papers go through the Memory's queue", () => {
            expect(
                filterStorageRequest("set", {
                    papers: { __dataVersion: 10000 },
                    urlHashToId: { abc: "Arxiv-1" },
                    weeklyBackups: {},
                    agentClients: {},
                }),
            ).toEqual({ urlHashToId: { abc: "Arxiv-1" } });
        });
    });

    describe("#isValidPairSender", () => {
        const previousChrome = global.chrome;
        const page = (path) => `chrome-extension://pmid/${path}`;
        const optionsTab = { id: "pmid", tab: { id: 7 }, url: page("options.html") };

        before(() => {
            global.chrome = { runtime: { id: "pmid", getURL: page } };
        });

        after(() => {
            global.chrome = previousChrome;
            if (previousChrome === undefined) delete global.chrome;
        });

        it("accepts the options page in any tab, on any section", () => {
            expect(isValidPairSender(optionsTab)).toBe(true);
            const elsewhere = { ...optionsTab, tab: { id: 8 } };
            expect(
                isValidPairSender({ ...elsewhere, url: page("options.html#sync") }),
            ).toBe(true);
            expect(
                isValidPairSender({ ...elsewhere, url: page("options.html?a=1") }),
            ).toBe(true);
        });

        it("rejects a content script: its url is its web page's", () => {
            const contentScript = { id: "pmid", tab: { id: 8 } };
            for (const url of [
                "https://example.org/paper",
                "https://example.org/options.html",
                `https://example.org/?${page("options.html")}`,
            ]) {
                expect(isValidPairSender({ ...contentScript, url })).toBe(false);
            }
        });

        it("rejects the popup, the offscreen document and the options page without a tab", () => {
            expect(isValidPairSender({ id: "pmid", url: page("popup.html") })).toBe(
                false,
            );
            expect(
                isValidPairSender({ id: "pmid", url: page("agentIngest.html") }),
            ).toBe(false);
            const { tab, ...noTab } = optionsTab;
            expect(isValidPairSender(noTab)).toBe(false);
        });

        it("rejects the other extension pages and other extensions", () => {
            for (const path of [
                "fullMemory.html",
                "bibMatcher.html",
                "welcome.html",
                "popup.html",
                "options.htm",
                "options.html.html",
            ]) {
                expect(isValidPairSender({ ...optionsTab, url: page(path) })).toBe(
                    false,
                );
            }
            expect(isValidPairSender({ ...optionsTab, id: "other" })).toBe(false);
            const otherOptions = "chrome-extension://other/options.html";
            expect(isValidPairSender({ ...optionsTab, url: otherOptions })).toBe(false);
        });
    });

    describe("#createBadge", () => {
        const RED = "rgb(195, 40, 56)";
        // the browser's action API, and its badge as shown
        const makeAction = () => {
            const badge = { text: "", color: null };
            const api = {
                setBadgeText: ({ text }) => (badge.text = text),
                setBadgeBackgroundColor: ({ color }) => (badge.color = color),
            };
            return { badge, api };
        };

        it("shows the number of pairing requests in red, and nothing once none waits", () => {
            const { badge, api } = makeAction();
            const { setPairingBadge } = createBadge(api);
            setPairingBadge(2);
            expect(badge).toEqual({ text: "2", color: RED });
            setPairingBadge(1);
            expect(badge).toEqual({ text: "1", color: RED });
            setPairingBadge(0);
            expect(badge.text).toBe("");
        });

        it("lets a sync state show over it, and shows it again once sync clears its badge", () => {
            const { badge, api } = makeAction();
            const { badgeWait, badgeOk, badgeClear, setPairingBadge } =
                createBadge(api);
            setPairingBadge(1);
            badgeWait("Push...");
            expect(badge).toEqual({ text: "Push...", color: "rgb(189, 127, 10)" });
            // a request arriving during the upload waits for sync's state to clear
            setPairingBadge(2);
            expect(badge.text).toBe("Push...");
            badgeOk();
            expect(badge).toEqual({ text: "OK!", color: "rgb(68, 164, 68)" });
            // sync clears its badge 2 s later
            const timers = [];
            const previousSetTimeout = global.setTimeout;
            global.setTimeout = (fn, ms) => timers.push({ fn, ms });
            try {
                badgeClear();
            } finally {
                global.setTimeout = previousSetTimeout;
            }
            expect(timers.map(({ ms }) => ms)).toEqual([2000]);
            expect(badge.text).toBe("OK!");
            timers[0].fn();
            expect(badge).toEqual({ text: "2", color: RED });
            // with no request waiting, sync's clear empties the badge, as before
            setPairingBadge(0);
            badgeWait("Pull...");
            badgeClear(true);
            expect(badge.text).toBe("");
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

    describe("#initAgentAccess", () => {
        // Chrome's APIs and storage, and the Native host connection, in memory: a request
        // goes in as the host forwards it, with the id "<conn>:<id>", and its answer comes
        // out of the connection's postMessage
        const previousChrome = global.chrome;
        const { now } = Date;
        let clock = 0; // added to the time, e.g. to end the Deny cooldown
        const storage = {};
        const runtimeListeners = [];
        const hostListeners = [];
        const storageListeners = []; // chrome.storage.onChanged
        const sent = []; // the messages PaperMemory posted to the Native host
        const tabs = []; // the tabs open: {id, windowId, url}
        let opensTabs = true; // whether chrome.tabs.create opens a tab
        const focused = []; // chrome.windows.update calls: {windowId, ...updateInfo}
        const activated = []; // the tabs PaperMemory made active again
        const granted = new Set(["nativeMessaging"]); // the permissions the user granted
        const notifications = new Map(); // the notifications shown: id => options
        const notificationListeners = []; // chrome.notifications.onClicked
        const broadcasts = []; // the types of the messages the background sent its pages
        // the tab of the options page that answers a click on the notification, if one
        // is open
        let optionsPageTab;
        const badges = []; // the numbers of pairing requests the toolbar badge showed
        let ingest; // the offscreen document's outcome for an ingest job
        const ingested = []; // the jobs it was given
        let connected = false;
        let nextId = 0;

        const paperId = "Arxiv-2101.00001";
        const url = "https://arxiv.org/abs/2101.00002";
        const auth = {
            clientId: "client-1",
            secret: "11".repeat(32),
            sessionId: "22".repeat(32),
        };
        const projectKey = "33".repeat(32);
        const projectAuth = { ...auth, projectKey, projectFolderName: "Demo" };
        const makePaper = (id) => ({
            id,
            source: "arxiv",
            title: "A paper",
            author: "Jane Doe",
            year: "2021",
            venue: "",
            tags: [],
            note: "",
            pdfLink: `https://arxiv.org/pdf/${id.slice(6)}.pdf`,
            codeLink: "",
            bibtex: "",
            addDate: "2021-01-01T00:00:00.000Z",
            lastOpenDate: "2021-01-01T00:00:00.000Z",
        });

        const extensionUrl = (path) => `chrome-extension://pmid/${path}`;
        // a message from an extension page or document, and its answer
        const toBackground = (message, sender) =>
            new Promise((resolve) => {
                const answers = [...runtimeListeners].map((listener) =>
                    listener(message, { id: "pmid", ...sender }, resolve),
                );
                if (!answers.includes(true)) resolve();
            });
        const fromHost = (message) =>
            hostListeners.forEach((listener) => listener(message));
        // a socket client's message, which the Native host forwards with an id
        const forward = (conn, message) => {
            const id = `${conn}:${++nextId}`;
            fromHost({ ...message, id });
            return id;
        };
        const send = (conn, op, args, requestAuth) =>
            forward(conn, { protocol: 1, op, args, auth: requestAuth });
        // poll until `get` returns a value, else null after `ms`
        const waitFor = async (get, ms = 2000) => {
            for (const start = now(); now() - start < ms;) {
                const value = get();
                if (value) return value;
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            return null;
        };
        const answerTo = (id, ms) => waitFor(() => sent.find((m) => m.id === id), ms);
        const request = (...args) => answerTo(send(...args));
        // an options page the user opened, in a tab
        const optionsPage = { tab: { id: 40 }, url: extensionUrl("options.html") };
        // the pairing requests waiting for the user, as the options page lists them
        const listRequests = () =>
            toBackground({ type: "agent-pairing-requests" }, optionsPage);
        const requestOf = async (clientName) => {
            for (const start = now(); now() - start < 2000;) {
                const listed = await listRequests();
                const pending = listed.find((r) => r.clientName === clientName);
                if (pending) return pending;
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            return null;
        };
        // a client's pairing request on a connection, once the user can see it (under
        // the name the options page shows)
        const pair = async (conn, clientName, shownAs = clientName) => {
            const id = send(conn, "pair", { clientName });
            return { conn, id, pending: await requestOf(shownAs) };
        };
        // the user's decision in an options page
        const decide = (requestId, allow, sender = optionsPage) =>
            toBackground({ type: "agent-pair-decision", requestId, allow }, sender);

        before(async () => {
            Date.now = () => now() + clock;
            Object.assign(storage, {
                agentAccess: { enabled: true },
                agentClients: {
                    [auth.clientId]: {
                        clientName: "Claude Code",
                        secretHash: await sha256Hex(auth.secret),
                        pairedAt: "2026-01-01T00:00:00.000Z",
                        lastSeenAt: "2026-01-01T00:00:00.000Z",
                    },
                },
                papers: { __dataVersion: 10000, [paperId]: makePaper(paperId) },
            });
            const event = (listeners = []) => ({
                addListener: (fn) => listeners.push(fn),
                removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
                hasListener: (fn) => listeners.includes(fn),
            });
            global.chrome = {
                runtime: {
                    id: "pmid",
                    getURL: extensionUrl,
                    onMessage: event(runtimeListeners),
                    onStartup: event(),
                    getContexts: async () => [],
                    connectNative: () => {
                        connected = true;
                        return {
                            onMessage: event(hostListeners),
                            onDisconnect: event(),
                            postMessage: (message) => sent.push(message),
                            disconnect: () => {},
                        };
                    },
                    // an ingest job, to the offscreen document; else a message to the
                    // extension's pages, which an open options page answers when the
                    // user clicked the pairing notification
                    sendMessage: (message, callback) => {
                        if (message.type !== "agent-ingest-job") {
                            broadcasts.push(message.type);
                            const show = message.type === "agent-pairing-show";
                            setTimeout(() =>
                                callback?.(show ? optionsPageTab : undefined),
                            );
                            return;
                        }
                        return (async () => {
                            ingested.push(message.job);
                            const outcome = await ingest(message.job);
                            const { jobId } = message;
                            return { type: "agent-ingest-result", jobId, outcome };
                        })();
                    },
                },
                // once created, the offscreen document says it is ready
                offscreen: {
                    createDocument: () =>
                        toBackground(
                            { type: "agent-ingest-ready" },
                            { url: extensionUrl("agentIngest.html") },
                        ),
                    closeDocument: async () => {},
                },
                storage: {
                    local: {
                        get: (key, cb) => cb({ [key]: structuredClone(storage[key]) }),
                        set: (items, cb) => {
                            Object.assign(storage, structuredClone(items));
                            cb?.();
                        },
                    },
                    onChanged: event(storageListeners),
                },
                permissions: {
                    contains: ({ permissions }, cb) =>
                        cb(permissions.every((p) => granted.has(p))),
                    onAdded: event(),
                    onRemoved: event(),
                },
                alarms: { create: () => {}, clear: () => {}, onAlarm: event() },
                // tabs open in window 1; a new window is window 2
                tabs: {
                    create: ({ url: tabUrl, active }, cb) => {
                        const tab = opensTabs
                            ? { id: tabs.length + 1, windowId: 1, url: tabUrl, active }
                            : undefined;
                        if (tab) tabs.push(tab);
                        setTimeout(() => cb(tab));
                    },
                    update: (tabId, { active }, cb) => {
                        const tab = tabs.find((t) => t.id === tabId);
                        if (tab && active) activated.push(tabId);
                        setTimeout(() => cb(tab));
                    },
                },
                windows: {
                    create: ({ url: tabUrl }, cb) => {
                        const tab = { id: tabs.length + 1, windowId: 2, url: tabUrl };
                        tabs.push(tab);
                        setTimeout(() => cb({ id: 2, tabs: [tab] }));
                    },
                    update: (windowId, updateInfo, cb) => {
                        focused.push({ windowId, ...updateInfo });
                        setTimeout(() => cb?.());
                    },
                },
                notifications: {
                    create: (id, options) => notifications.set(id, options),
                    clear: (id) => notifications.delete(id),
                    onClicked: event(notificationListeners),
                },
            };
            initAgentAccess({
                pushSyncPapers: async () => {},
                handleBackgroundMessage: () => {},
                setPairingBadge: (count) => badges.push(count),
            });
            expect(await waitFor(() => connected)).toBe(true);
            fromHost({
                type: "host-ready",
                version: "0.1.0",
                protocolMin: 1,
                protocolMax: 1,
            });
        });

        after(() => {
            Date.now = now;
            global.chrome = previousChrome;
            if (previousChrome === undefined) delete global.chrome;
        });

        it("answers a client's message with an id as a request, never as the host's", async () => {
            const codex = await pair(1, "Codex");
            // another client sends the host's own messages: the host forwards them with
            // an id
            const closed = forward(2, { type: "client-closed", conn: 1 });
            const ready = forward(2, {
                type: "host-ready",
                version: "9.9.9",
                protocolMin: 9,
                protocolMax: 9,
            });
            expect((await answerTo(closed)).error.code).toBe("protocol-mismatch");
            expect((await answerTo(ready)).error.code).toBe("protocol-mismatch");
            const status = await toBackground(
                { type: "agent-status" },
                { url: extensionUrl("options.html") },
            );
            expect(status).toMatchObject({
                hostVersion: "0.1.0",
                protocolMin: 1,
                protocolMax: 1,
            });
            // connection 1 is still open: its pairing request is answered
            expect(await decide(codex.pending.requestId, true)).toBe(true);
            expect((await answerTo(codex.id)).result).toEqual({
                clientId: expect.any(String),
                secret: expect.any(String),
            });
        });

        it("lists a pairing request for the user, counted on the toolbar badge, without opening a tab or bringing a window to the front", async () => {
            const tabsBefore = tabs.length;
            focused.length = 0;
            badges.length = 0;
            broadcasts.length = 0;
            const cursor = await pair(3, "Cursor");
            expect(cursor.pending).toEqual({
                requestId: expect.any(String),
                clientName: "Cursor",
                requestedAt: expect.any(Number),
            });
            // the open options pages and popup ask for the list again
            expect(broadcasts).toEqual(["agent-pairing-changed"]);
            expect(badges).toEqual([1]);
            expect(tabs.length).toBe(tabsBefore);
            expect(focused).toEqual([]);
            // the client waits for the user
            expect(await answerTo(cursor.id, 50)).toBeNull();
            // only the options page and the popup get the list
            const listFrom = (sender) =>
                toBackground({ type: "agent-pairing-requests" }, sender);
            const popup = { url: extensionUrl("popup.html") };
            expect(await listFrom(popup)).toEqual([cursor.pending]);
            const contentScript = { tab: { id: 9 }, url: "https://example.org/" };
            expect(await listFrom(contentScript)).toBeUndefined();
            expect(await decide(cursor.pending.requestId, true)).toBe(true);
            expect((await answerTo(cursor.id)).ok).toBe(true);
            expect(badges).toEqual([1, 0]);
            expect(await listRequests()).toEqual([]);
        });

        it("keeps a pairing request, with no time limit, until its connection closes; a decision then answers expired", async () => {
            // no timer is set to end it (the requests used to time out after 2 minutes)
            const timers = [];
            const previousSetTimeout = global.setTimeout;
            global.setTimeout = (fn, ms, ...args) => {
                timers.push(ms ?? 0);
                return previousSetTimeout(fn, ms, ...args);
            };
            let openCode;
            try {
                openCode = await pair(5, "OpenCode");
            } finally {
                global.setTimeout = previousSetTimeout;
            }
            expect(timers.filter((ms) => ms > 5000)).toEqual([]);
            clock += 60 * 60000; // an hour later
            expect(await listRequests()).toEqual([openCode.pending]);
            // the agent session ended
            fromHost({ type: "client-closed", conn: 5 });
            expect(await listRequests()).toEqual([]);
            expect(badges.at(-1)).toBe(0);
            expect(await decide(openCode.pending.requestId, true)).toBe(false);
            const names = Object.values(storage.agentClients).map((c) => c.clientName);
            expect(names).not.toContain("OpenCode");
            expect(await answerTo(openCode.id, 100)).toBeNull();
        });

        it("refuses every new pairing request for a minute after a Deny; anything but allow: true denies", async () => {
            const ohMyPi = await pair(6, "Oh-My-Pi");
            expect(await decide(ohMyPi.pending.requestId, false)).toBe(true);
            expect((await answerTo(ohMyPi.id)).error.code).toBe("denied");
            // another client's name
            const refused = await request(7, "pair", { clientName: "Zed" });
            expect(refused.error.code).toBe("rate-limited");
            clock += 60000;
            const zed = await pair(8, "Zed");
            expect(await decide(zed.pending.requestId, "true")).toBe(true);
            expect((await answerTo(zed.id)).error.code).toBe("denied");
            expect(
                Object.values(storage.agentClients).map((c) => c.clientName),
            ).not.toContain("Zed");
            clock += 60000;
            const allowed = await pair(8, "Zed");
            expect(await decide(allowed.pending.requestId, true)).toBe(true);
            expect((await answerTo(allowed.id)).ok).toBe(true);
        });

        it("keeps several pairing requests at once, oldest first, up to ten: a client asking again joins its request", async () => {
            badges.length = 0;
            const first = await pair(20, "Agent 0");
            // the same client asks again, on its connection and on another one (e.g. a
            // new session): no new request
            const again = send(20, "pair", { clientName: "Agent 0" });
            const elsewhere = send(21, "pair", { clientName: "Agent 0" });
            const others = [];
            for (let i = 1; i < 10; i++) others.push(await pair(21 + i, `Agent ${i}`));
            const listed = await listRequests();
            expect(listed.map((r) => r.clientName)).toEqual(
                Array.from({ length: 10 }, (_, i) => `Agent ${i}`),
            );
            expect(badges).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
            const busy = await request(40, "pair", { clientName: "Agent 10" });
            expect(busy.error.code).toBe("busy");
            // a client already waiting still joins its request
            const third = send(41, "pair", { clientName: "Agent 0" });
            expect(await answerTo(third, 50)).toBeNull();
            expect(await listRequests()).toEqual(listed);
            // one decision answers every request that joined it, with one credential
            expect(await decide(first.pending.requestId, true)).toBe(true);
            const answers = await Promise.all(
                [first.id, again, elsewhere, third].map((id) => answerTo(id)),
            );
            expect(answers[0].result).toEqual({
                clientId: expect.any(String),
                secret: expect.any(String),
            });
            answers.forEach((a) => expect(a.result).toEqual(answers[0].result));
            const paired = Object.values(storage.agentClients).filter(
                (c) => c.clientName === "Agent 0",
            );
            expect(paired).toHaveLength(1);
            expect(badges.at(-1)).toBe(9);
            // the others' sessions end
            for (const { conn } of others) fromHost({ type: "client-closed", conn });
            expect(await listRequests()).toEqual([]);
            expect(badges.at(-1)).toBe(0);
        });

        it("ends a joined pairing request only once no connection waits for it", async () => {
            const gemini = await pair(42, "Gemini");
            const joined = send(43, "pair", { clientName: "Gemini" });
            fromHost({ type: "client-closed", conn: 42 });
            expect(await listRequests()).toEqual([gemini.pending]);
            fromHost({ type: "client-closed", conn: 43 });
            expect(await listRequests()).toEqual([]);
            expect(await answerTo(gemini.id, 50)).toBeNull();
            expect(await answerTo(joined, 50)).toBeNull();
            // the one left waiting gets the decision
            const kimi = await pair(44, "Kimi");
            const kimiAgain = send(45, "pair", { clientName: "Kimi" });
            fromHost({ type: "client-closed", conn: 44 });
            expect(await decide(kimi.pending.requestId, true)).toBe(true);
            expect((await answerTo(kimiAgain)).ok).toBe(true);
            expect(await answerTo(kimi.id, 50)).toBeNull();
        });

        it("accepts a decision only from an options page in a tab (any), once", async () => {
            const windsurf = await pair(50, "Windsurf");
            const decision = {
                type: "agent-pair-decision",
                requestId: windsurf.pending.requestId,
                allow: true,
            };
            const refusedFrom = [
                { url: extensionUrl("popup.html") }, // the popup: no tab
                { url: extensionUrl("options.html") }, // the options page without tab
                { url: extensionUrl("agentIngest.html") }, // the offscreen document
                { tab: { id: 60 }, url: "https://example.org/paper" }, // content script
                { tab: { id: 61 }, url: extensionUrl("fullMemory.html") }, // another page
                { tab: { id: 62 }, url: extensionUrl("welcome.html") },
            ];
            for (const sender of refusedFrom) {
                expect(await toBackground(decision, sender)).toBe(false);
            }
            // another extension: not answered at all
            const otherExtension = {
                id: "other",
                tab: { id: 63 },
                url: "chrome-extension://other/options.html",
            };
            expect(await toBackground(decision, otherExtension)).toBeUndefined();
            expect(await answerTo(windsurf.id, 50)).toBeNull();
            expect(await listRequests()).toEqual([windsurf.pending]);
            // an options page the user opened on another section, in another tab
            const optionsElsewhere = {
                tab: { id: 64 },
                url: extensionUrl("options.html#sync"),
            };
            expect(await toBackground(decision, optionsElsewhere)).toBe(true);
            expect((await answerTo(windsurf.id)).ok).toBe(true);
            // once: the same decision again, from any page, is refused
            expect(await toBackground(decision, optionsPage)).toBe(false);
            expect(await toBackground({ ...decision, allow: false }, optionsPage)).toBe(
                false,
            );
            const paired = Object.values(storage.agentClients).filter(
                (c) => c.clientName === "Windsurf",
            );
            expect(paired).toHaveLength(1);
        });

        it("notifies a new pairing request only with the notifications permission; a click shows Agent access in an open options page, else in a new tab", async () => {
            // Agent access turned on before PaperMemory asked for notifications
            const silent = await pair(19, "Amp");
            await new Promise((resolve) => setTimeout(resolve, 20));
            expect(notifications.size).toBe(0);
            expect(await decide(silent.pending.requestId, true)).toBe(true);
            expect((await answerTo(silent.id)).ok).toBe(true);

            granted.add("notifications");
            // a right-to-left override would turn the rest of the title around
            const notified = await pair(19, "Amp‮gnp.exe", "Ampgnp.exe");
            expect(notified.pending).not.toBeNull();
            const shown = await waitFor(() => notifications.get("pm-agent-pairing"));
            expect(shown).toEqual({
                type: "basic",
                iconUrl: extensionUrl("icons/icon-128.png"),
                title: "Ampgnp.exe wants to use PaperMemory",
                message: "Click to allow or deny it in PaperMemory's options.",
            });
            // the user clicks it from another application, with an options page open:
            // that page shows Agent access, its tab and window come to the front
            const front = { focused: true, drawAttention: true };
            tabs.push({ id: 70, windowId: 3, url: extensionUrl("options.html#sync") });
            const tabsBefore = tabs.length;
            optionsPageTab = 70;
            focused.length = 0;
            broadcasts.length = 0;
            notificationListeners.forEach((listener) => listener("pm-agent-pairing"));
            expect(await waitFor(() => focused.length)).toBe(1);
            expect(broadcasts).toEqual(["agent-pairing-show"]);
            expect(activated.at(-1)).toBe(70);
            expect(focused[0]).toEqual({ windowId: 3, ...front });
            expect(tabs.length).toBe(tabsBefore);
            expect(notifications.size).toBe(0);
            // no options page open: one opens on Agent access, in a new tab, in front
            optionsPageTab = undefined;
            focused.length = 0;
            notificationListeners.forEach((listener) => listener("pm-agent-pairing"));
            const tab = await waitFor(() => tabs[tabsBefore]);
            const agentAccess = extensionUrl("options.html#agent-access");
            expect(tab).toMatchObject({ url: agentAccess, active: true, windowId: 1 });
            expect(await waitFor(() => focused.length)).toBe(1);
            expect(focused[0]).toEqual({ windowId: 1, ...front });
            // e.g. a browser on macOS, running without a window: in a new window
            opensTabs = false;
            focused.length = 0;
            notificationListeners.forEach((listener) => listener("pm-agent-pairing"));
            const inWindow = await waitFor(() => tabs[tabsBefore + 1]);
            opensTabs = true;
            expect(inWindow).toMatchObject({ url: agentAccess, windowId: 2 });
            expect(await waitFor(() => focused.length)).toBe(1);
            expect(focused[0]).toEqual({ windowId: 2, ...front });
            // the user's decision clears it too
            notifications.set("pm-agent-pairing", shown);
            expect(await decide(notified.pending.requestId, true)).toBe(true);
            expect((await answerTo(notified.id)).ok).toBe(true);
            expect(notifications.size).toBe(0);
            granted.delete("notifications");
        });

        it("removes the Project a failed first add created, keeps one a stored add created", async () => {
            const projectHash = await sha256Hex(projectKey);
            ingest = async () => ({ status: "failed" });
            const failedArgs = { url, tags: ["nlp"], reason: "Why" };
            const failed = await request(9, "add_paper", failedArgs, projectAuth);
            expect(failed.result.status).toBe("failed");
            // the pipeline gets the Project tag, which an agent may not apply itself
            expect(ingested.at(-1).tags).toEqual(["review", "nlp", "proj-demo"]);
            expect(storage.agentProjects).toEqual({});

            const newId = "Arxiv-2101.00002";
            ingest = async ({ tags }) => {
                const paper = {
                    ...makePaper(newId),
                    tags,
                    projectHashes: [projectHash],
                };
                storage.papers = { ...storage.papers, [newId]: paper };
                return { status: "stored", id: newId };
            };
            const storedArgs = { url, tags: [], reason: "Why" };
            const stored = await request(10, "add_paper", storedArgs, projectAuth);
            expect(stored.result.status).toBe("stored");
            expect(storage.agentProjects[projectHash]).toMatchObject({
                label: "Demo",
                tag: "proj-demo",
            });
            // attaching a paper the user added gives it the Project tag
            const attached = await request(
                11,
                "attach_paper",
                { id: paperId },
                projectAuth,
            );
            expect(attached.result.tags).toEqual(["proj-demo"]);
        });

        it("changes a paper as stored when the change runs, in the Memory's queue", async () => {
            // an add ahead keeps the change queued while another page writes the note
            let release;
            ingest = () =>
                new Promise(
                    (resolve) => (release = () => resolve({ status: "failed" })),
                );
            const adding = send(
                12,
                "add_paper",
                { url, tags: [], reason: "Why" },
                auth,
            );
            await waitFor(() => release);
            const text = "Cited in section 2";
            const appending = send(12, "append_note", { id: paperId, text }, auth);
            await runMemoryOp({ op: "patch", id: paperId, fields: { note: "Mine" } });
            const revision = storage.papersRevision;
            release();
            expect((await answerTo(adding)).result.status).toBe("failed");
            expect((await answerTo(appending)).ok).toBe(true);
            expect(storage.papers[paperId].note).toBe(`Mine\n${text}`);
            // one Memory operation: the queue counted its write
            expect(storage.papersRevision).toBe(revision + 1);
        });

        it("deletes only an Own addition, checked as stored, and its urls", async () => {
            const ownId = "Arxiv-2101.00003";
            const provenance = await makeProvenance(auth, {
                clientName: "Claude Code",
                reason: "Why",
            });
            storage.papers = {
                ...storage.papers,
                [ownId]: { ...makePaper(ownId), provenance },
            };
            storage.urlHashToId = { own: ownId, user: paperId };
            const refused = await request(13, "delete_paper", { id: paperId }, auth);
            expect(refused.error.code).toBe("not-own-addition");
            expect(storage.papers).toHaveProperty([paperId]);
            const deleted = await request(13, "delete_paper", { id: ownId }, auth);
            expect(deleted.result).toEqual({ deleted: true });
            expect(storage.papers).not.toHaveProperty([ownId]);
            expect(storage.urlHashToId).toEqual({ user: paperId });
        });

        it("an agent's paper the user's visit promoted is the user's: delete_paper → not-own-addition", async () => {
            const preprintId = "Arxiv-2101.00004";
            const publishedId = "NeurIPS-2021_abc";
            // what the pipeline stores for a new paper: the agent's fields and Provenance
            ingest = async ({ tags, provenance }) => {
                const paper = { ...makePaper(preprintId), tags, provenance };
                storage.papers = { ...storage.papers, [preprintId]: paper };
                return { status: "stored", id: preprintId };
            };
            const addArgs = { url, tags: [], reason: "Why" };
            expect((await request(14, "add_paper", addArgs, auth)).result.status).toBe(
                "stored",
            );
            // the user opens the published version: its page's queue operation (paper.js)
            const published = {
                ...makePaper(preprintId),
                id: publishedId,
                source: "neurips",
                venue: "NeurIPS",
            };
            const visit = await runMemoryOpFromMessage({
                op: "merge",
                fromId: preprintId,
                paper: published,
                overwrites: ["lastOpenDate", "venue", "id", "pdfLink", "source"],
                visit: true,
                ifMissing: "skip",
            });
            expect(visit.ok).toBe(true);
            const refused = await request(
                14,
                "delete_paper",
                { id: publishedId },
                auth,
            );
            expect(refused.error.code).toBe("not-own-addition");
            expect(storage.papers).toHaveProperty([publishedId]);
        });

        it("an agent's paper the user opened or edited is the user's: delete_paper → not-own-addition", async () => {
            const opened = "Arxiv-2101.00007";
            const edited = "Arxiv-2101.00008";
            for (const id of [opened, edited]) {
                // what the pipeline stores for a new paper: the agent's fields and Provenance
                ingest = async ({ tags, provenance }) => {
                    const paper = { ...makePaper(id), tags, provenance };
                    storage.papers = { ...storage.papers, [id]: paper };
                    return { status: "stored", id };
                };
                const addArgs = { url, tags: [], reason: "Why" };
                const added = await request(17, "add_paper", addArgs, auth);
                expect(added.result.status).toBe("stored");
            }
            // the user opens one (a plain visit) and edits the other's note, from their pages
            const visit = await runMemoryOpFromMessage({ op: "visit", id: opened });
            expect(visit.ok).toBe(true);
            const note = { op: "patch", id: edited, fields: { note: "My note" } };
            expect((await runMemoryOpFromMessage(note)).ok).toBe(true);
            for (const id of [opened, edited]) {
                const refused = await request(17, "delete_paper", { id }, auth);
                expect(refused.error.code).toBe("not-own-addition");
                expect(storage.papers).toHaveProperty([id]);
            }
        });

        it("adds a DOI: unsupported-url answers the page it resolved to, or why it was not resolved", async () => {
            const doi = "10.1080/00000000.2020.1234567";
            const resolvedUrl = `https://www.tandfonline.com/doi/full/${doi}`;
            ingest = async () => ({ status: "unsupported-url", resolvedUrl });
            const args = { url: doi, tags: [], reason: "Why" };
            const unsupported = await request(18, "add_paper", args, auth);
            // the pipeline gets the DOI as given: it resolves it
            expect(ingested.at(-1).url).toBe(doi);
            expect(unsupported.result).toEqual({
                status: "unsupported-url",
                resolvedUrl,
            });

            const message = "DOI could not be resolved";
            ingest = async () => ({ status: "unsupported-url", message });
            const doiArgs = { ...args, url: `doi:${doi}` };
            const unresolved = await request(18, "add_paper", doiArgs, auth);
            expect(ingested.at(-1).url).toBe(`doi:${doi}`);
            expect(unresolved.result).toEqual({ status: "unsupported-url", message });
        });

        // what the pipeline stores for a new paper: the agent's fields and Provenance, and
        // the note its page gave
        const storesNew =
            (id, note) =>
            async ({ tags, provenance }) => {
                const paper = { ...makePaper(id), tags, provenance, note };
                storage.papers = { ...storage.papers, [id]: paper };
                return { status: "stored", id };
            };

        it("shows who added a paper it stored, and why, in its note before the agent's note; not on a paper already stored", async () => {
            const newId = "Arxiv-2101.00009";
            ingest = storesNew(newId, "Published @ NeurIPS (2021)");
            const args = {
                url,
                tags: [],
                reason: "The baseline we compare against",
                note: "See section 3",
            };
            const added = await request(19, "add_paper", args, auth);
            expect(added.result.status).toBe("stored");
            const note = [
                "Published @ NeurIPS (2021)",
                "Added by Claude Code: The baseline we compare against",
                "See section 3",
            ].join("\n");
            expect(storage.papers[newId].note).toBe(note);
            // already in the Memory: only attached, its note unchanged
            ingest = async () => ({ status: "already-present", id: newId });
            const again = { url, tags: [], reason: "Cited again" };
            const attached = await request(19, "add_paper", again, auth);
            expect(attached.result.status).toBe("already-present");
            expect(storage.papers[newId].note).toBe(note);
        });

        it("leaves the line out of a note without room for it: the Provenance keeps the reason", async () => {
            const fullId = "Arxiv-2101.00010";
            const full = "x".repeat(19990);
            ingest = storesNew(fullId, full);
            const args = { url, tags: [], reason: "Why" };
            const added = await request(20, "add_paper", args, auth);
            expect(added.result.status).toBe("stored");
            expect(added.result.paper.provenance).toMatchObject({
                clientName: "Claude Code",
                reason: "Why",
            });
            expect(storage.papers[fullId].note).toBe(full);
        });

        // a change that passed the checks before it runs, held in the Memory's queue behind
        // a slow operation (e.g. a large replace) until `release`
        const holdMemoryQueue = () => {
            let open;
            const gate = new Promise((resolve) => (open = resolve));
            const held = runMemoryOp({
                op: "agent",
                change: async () => {
                    await gate;
                    return {};
                },
            });
            return async () => {
                open();
                await held;
            };
        };
        // a Paired client and a paper it added (its Own addition)
        const pairWithOwnAddition = async (clientId, ownId) => {
            const clientAuth = { ...auth, clientId };
            storage.agentClients[clientId] = {
                clientName: "Codex",
                secretHash: await sha256Hex(clientAuth.secret),
                pairedAt: "2026-01-01T00:00:00.000Z",
                lastSeenAt: "2026-01-01T00:00:00.000Z",
            };
            const provenance = await makeProvenance(clientAuth, {
                clientName: "Codex",
                reason: "Why",
            });
            storage.papers = {
                ...storage.papers,
                [ownId]: { ...makePaper(ownId), provenance },
            };
            return clientAuth;
        };
        // its job passed the checks before the change (lastSeenAt is written last)
        const passedChecks = (clientId) =>
            waitFor(
                () =>
                    storage.agentClients[clientId]?.lastSeenAt !==
                    "2026-01-01T00:00:00.000Z",
            );

        it("refuses a change at its commit point if its client was revoked since the job started", async () => {
            const ownId = "Arxiv-2101.00005";
            const clientAuth = await pairWithOwnAddition("client-revoked", ownId);
            const release = holdMemoryQueue();
            const deleting = send(15, "delete_paper", { id: ownId }, clientAuth);
            expect(await passedChecks(clientAuth.clientId)).toBe(true);
            const revoke = { type: "agent-revoke", clientId: clientAuth.clientId };
            const options = { url: extensionUrl("options.html") };
            expect(await toBackground(revoke, options)).toBe(true);
            await release();
            expect((await answerTo(deleting)).error.code).toBe("unauthorized");
            expect(storage.papers).toHaveProperty([ownId]);
        });

        // last: turning Agent access off disconnects from the Native host
        it("answers disabled when Agent access is turned off: the running change at its commit point, queued changes, a pairing request; clients stay paired", async () => {
            const ownId = "Arxiv-2101.00006";
            const clientAuth = await pairWithOwnAddition("client-off", ownId);
            const release = holdMemoryQueue();
            const deleting = send(16, "delete_paper", { id: ownId }, clientAuth);
            expect(await passedChecks(clientAuth.clientId)).toBe(true);
            // a change queued behind it, and pairing requests waiting for the user
            const tags = { id: paperId, tags: ["later"] };
            const tagging = send(16, "add_tags", tags, clientAuth);
            const pairings = [await pair(17, "Zed"), await pair(18, "Goose")];
            // the options page's toggle
            storage.agentAccess = { enabled: false };
            const changes = { agentAccess: { newValue: { enabled: false } } };
            storageListeners.forEach((listener) => listener(changes, "local"));
            const off = {
                code: "disabled",
                message: "Agent access is off in PaperMemory's options",
            };
            for (const { id } of pairings)
                expect((await answerTo(id)).error).toEqual(off);
            expect(await listRequests()).toEqual([]);
            expect(badges.at(-1)).toBe(0);
            await release();
            expect((await answerTo(deleting)).error).toEqual(off);
            expect((await answerTo(tagging)).error).toEqual(off);
            expect(storage.papers).toHaveProperty([ownId]);
            expect(storage.papers[paperId].tags).not.toContain("later");
            // not unauthorized: its MCP server keeps its credential, which works again
            // once Agent access is back on
            expect(storage.agentClients).toHaveProperty([clientAuth.clientId]);
        });
    });
});

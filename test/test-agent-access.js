import { expect } from "expect";
import { filterStorageRequest } from "@pm/background/agentIngest.js";
import { isValidPairSender, initAgentAccess } from "@pm/background/agentAccess.js";
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
        const tabs = []; // the tabs PaperMemory opened: {id, url}
        let opensTabs = true; // whether chrome.tabs.create opens a tab
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
        // the next pairing prompt PaperMemory opens, and the user's decision in it
        const nextTab = () => {
            const n = tabs.length;
            return waitFor(() => tabs[n]);
        };
        const decide = (tab, allow) =>
            toBackground(
                {
                    type: "agent-pair-decision",
                    requestId: tab.url.split("#agent-pairing=")[1],
                    allow,
                },
                { tab: { id: tab.id }, url: tab.url },
            );

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
                    // an ingest job, to the offscreen document
                    sendMessage: async ({ type, jobId, job }) => {
                        if (type !== "agent-ingest-job") return;
                        ingested.push(job);
                        const outcome = await ingest(job);
                        return { type: "agent-ingest-result", jobId, outcome };
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
                    contains: (permissions, cb) => cb(true),
                    onAdded: event(),
                    onRemoved: event(),
                },
                alarms: { create: () => {}, clear: () => {}, onAlarm: event() },
                tabs: {
                    create: ({ url: tabUrl }, cb) => {
                        const tab = opensTabs
                            ? { id: tabs.length + 1, url: tabUrl }
                            : undefined;
                        if (tab) tabs.push(tab);
                        setTimeout(() => cb(tab));
                    },
                },
            };
            initAgentAccess({
                pushSyncPapers: async () => {},
                handleBackgroundMessage: () => {},
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
            const prompt = nextTab();
            const pairing = send(1, "pair", { clientName: "Codex" });
            const tab = await prompt;
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
            expect(await decide(tab, true)).toBe(true);
            expect((await answerTo(pairing)).result).toEqual({
                clientId: expect.any(String),
                secret: expect.any(String),
            });
        });

        it("ends a pairing request at once when its prompt cannot open", async () => {
            opensTabs = false;
            const failed = await request(3, "pair", { clientName: "Cursor" });
            opensTabs = true;
            expect(failed.error.code).toBe("internal");
            // it no longer holds the one pending pairing request
            const prompt = nextTab();
            const pairing = send(4, "pair", { clientName: "Cursor" });
            expect(await decide(await prompt, true)).toBe(true);
            expect((await answerTo(pairing)).ok).toBe(true);
        });

        it("answers a decision as expired once the requesting connection closed", async () => {
            const prompt = nextTab();
            const pairing = send(5, "pair", { clientName: "OpenCode" });
            const tab = await prompt;
            fromHost({ type: "client-closed", conn: 5 });
            expect(await decide(tab, true)).toBe(false);
            const names = Object.values(storage.agentClients).map((c) => c.clientName);
            expect(names).not.toContain("OpenCode");
            expect(await answerTo(pairing, 100)).toBeNull();
        });

        it("refuses every pairing request for a minute after a Deny", async () => {
            let prompt = nextTab();
            const denied = send(6, "pair", { clientName: "Oh-My-Pi" });
            expect(await decide(await prompt, false)).toBe(true);
            expect((await answerTo(denied)).error.code).toBe("denied");
            // another client's name
            const refused = await request(7, "pair", { clientName: "Zed" });
            expect(refused.error.code).toBe("rate-limited");
            clock += 60000;
            prompt = nextTab();
            const allowed = send(8, "pair", { clientName: "Zed" });
            expect(await decide(await prompt, true)).toBe(true);
            expect((await answerTo(allowed)).ok).toBe(true);
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
            const refused = await request(14, "delete_paper", { id: publishedId }, auth);
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
        it("refuses a change at its commit point if Agent access was turned off since the job started", async () => {
            const ownId = "Arxiv-2101.00006";
            const clientAuth = await pairWithOwnAddition("client-off", ownId);
            const release = holdMemoryQueue();
            const deleting = send(16, "delete_paper", { id: ownId }, clientAuth);
            expect(await passedChecks(clientAuth.clientId)).toBe(true);
            // the options page's toggle
            storage.agentAccess = { enabled: false };
            const changes = { agentAccess: { newValue: { enabled: false } } };
            storageListeners.forEach((listener) => listener(changes, "local"));
            await release();
            expect((await answerTo(deleting)).error).toEqual({
                code: "unauthorized",
                message: "Agent access is off in PaperMemory",
            });
            expect(storage.papers).toHaveProperty([ownId]);
        });
    });
});

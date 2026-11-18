// Unit tests for the Memory write queue (src/shared/js/utils/memoryQueue.js) in Node, with an
// in-memory chrome.storage stub that can fail: a failed read never counts as "no Memory", a
// failed write is reported, a retried operation is applied once, a preprint merged into its
// published record keeps the user's data of both, a replace cannot hide in a batch.
import { expect } from "expect";
import { loadPaperMemoryUtils } from "./utilsForTests.js";

await loadPaperMemoryUtils();

const makeChrome = () => {
    const store = {};
    const faults = { read: null, write: null, noAnswer: 0 };
    const sent = [];
    const chrome = {
        store,
        faults,
        sent,
        runtime: {
            lastError: undefined,
            sendMessage: (payload, cb) => {
                sent.push(payload);
                if (faults.noAnswer > 0) {
                    faults.noAnswer--;
                    return setTimeout(() => cb(undefined), 1);
                }
                // the "background": its message route to the same queue, run here
                PMUtils.memoryQueue.runMemoryOpFromMessage(payload.op).then(cb);
            },
        },
        storage: {
            local: {
                get: (key, cb) =>
                    setTimeout(() => {
                        if (key === null) return cb(structuredClone(store));
                        if (faults.read && faults.read(key)) {
                            chrome.runtime.lastError = { message: "read failed" };
                            cb(undefined);
                            chrome.runtime.lastError = undefined;
                            return;
                        }
                        cb({ [key]: structuredClone(store[key]) });
                    }, 1),
                remove: (key, cb) =>
                    setTimeout(() => {
                        delete store[key];
                        cb && cb();
                    }, 1),
                set: (obj, cb) =>
                    setTimeout(() => {
                        if (faults.write && faults.write(obj)) {
                            chrome.runtime.lastError = { message: "write failed" };
                            cb && cb();
                            chrome.runtime.lastError = undefined;
                            return;
                        }
                        Object.assign(store, structuredClone(obj));
                        cb && cb();
                    }, 1),
            },
            onChanged: { addListener: () => {} },
        },
    };
    return chrome;
};

const paper = (id, extra = {}) => ({
    id,
    title: `Title ${id}`,
    author: "A B",
    pdfLink: `https://example.org/${id}.pdf`,
    source: "arxiv",
    tags: [],
    note: "",
    codeLink: "",
    favorite: false,
    favoriteDate: "",
    count: 1,
    addDate: "2024-01-01T00:00:00.000Z",
    lastOpenDate: "2024-01-01T00:00:00.000Z",
    ...extra,
});

describe("Memory queue (memoryQueue.js)", function () {
    let chrome, previous, q;

    beforeEach(() => {
        previous = global.chrome;
        chrome = makeChrome();
        global.chrome = chrome;
        q = PMUtils.memoryQueue;
        delete globalThis.__PM_MEMORY_IN_CONTEXT__;
    });
    afterEach(() => {
        global.chrome = previous;
        delete globalThis.__PM_MEMORY_IN_CONTEXT__;
    });

    it("a failed read aborts the operation: a create never replaces the library", async () => {
        chrome.store.papers = { __dataVersion: 10200, a: paper("a") };
        chrome.faults.read = (key) => key === "papers";
        const answer = await q.runMemoryOp({ op: "create", paper: paper("b") });
        expect(answer.ok).toBe(false);
        expect(answer.error).toContain("read failed");
        expect(Object.keys(chrome.store.papers)).toEqual(["__dataVersion", "a"]);
    });

    it("a failed write is reported as not saved", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.faults.write = (obj) => "papers" in obj;
        const answer = await q.runMemoryOp({
            op: "patch",
            id: "a",
            fields: { note: "x" },
        });
        expect(answer.ok).toBe(false);
        expect(answer.error).toContain("write failed");
        expect(chrome.store.papers.a.note).toBe("");
    });

    it("a failed migration answers ok: false", async () => {
        chrome.store.papers = { __dataVersion: 304, a: paper("a") };
        chrome.faults.write = (obj) => "papers" in obj;
        const answer = await q.runMemoryOp({ op: "migrate", version: 10200 });
        expect(answer.ok).toBe(false);
    });

    it("no answer from the background: retried with the same id, applied once", async () => {
        chrome.store.papers = { a: paper("a", { count: 3 }) };
        chrome.faults.noAnswer = 2; // the first two messages get no reply
        const answer = await q.memoryOp({ op: "visit", id: "a" });
        expect(answer.ok).toBe(true);
        expect(chrome.sent.length).toBe(3);
        expect(new Set(chrome.sent.map((m) => m.op.opId)).size).toBe(1);
        expect(chrome.store.papers.a.count).toBe(4);
        expect(q.getInContextRuns()).toBe(0);
    });

    it("an operation id already applied is not applied again (reply lost, then retried)", async () => {
        chrome.store.papers = { a: paper("a", { count: 3 }) };
        const op = { op: "visit", id: "a", opId: "same-op" };
        const first = await q.runMemoryOp(op);
        const again = await q.runMemoryOp(op);
        expect(first.ok && again.ok).toBe(true);
        expect(again.result.duplicate).toBe(true);
        expect(chrome.store.papers.a.count).toBe(4);
    });

    it("still no answer: the caller is told nothing was saved (no local fallback)", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.faults.noAnswer = 99;
        const answer = await q.memoryOp({
            op: "patch",
            id: "a",
            fields: { note: "x" },
        });
        expect(answer.ok).toBe(false);
        expect(chrome.store.papers.a.note).toBe("");
        expect(q.getInContextRuns()).toBe(0);
    }).timeout(10000);

    it("merging a preprint into a stored published record keeps the user's data of both", async () => {
        const pre = paper("pre", {
            tags: ["rl", "toread"],
            note: "from the preprint",
            codeLink: "https://github.com/x/y",
            favorite: true,
            favoriteDate: "2024-02-01T00:00:00.000Z",
            count: 4,
            addDate: "2023-01-01T00:00:00.000Z",
            lastOpenDate: "2024-03-01T00:00:00.000Z",
        });
        const pub = paper("pub", {
            source: "neurips",
            venue: "NeurIPS",
            tags: ["rl", "published"],
            note: "",
            count: 2,
            addDate: "2024-01-01T00:00:00.000Z",
            lastOpenDate: "2024-01-15T00:00:00.000Z",
        });
        chrome.store.papers = { pre, pub };
        const parsed = paper("pub", { source: "neurips", venue: "NeurIPS", count: 1 });
        const answer = await q.runMemoryOp({
            op: "merge",
            fromId: "pre",
            paper: parsed,
            overwrites: ["lastOpenDate", "venue", "id", "source"],
            visit: true,
        });
        expect(answer.ok).toBe(true);
        const merged = chrome.store.papers.pub;
        expect(chrome.store.papers.pre).toBe(undefined);
        expect(merged.tags).toEqual(["published", "rl", "toread"]);
        expect(merged.note).toBe("from the preprint");
        expect(merged.codeLink).toBe("https://github.com/x/y");
        expect(merged.favorite).toBe(true);
        expect(merged.count).toBe(4 + 2 + 1); // summed, + this visit
        expect(merged.addDate).toBe("2023-01-01T00:00:00.000Z");
        expect(merged.venue).toBe("NeurIPS");
        expect(merged.source).toBe("neurips");
    });

    it("a replace cannot be part of a batch", async () => {
        chrome.store.papers = { a: paper("a") };
        const answer = await q.runMemoryOp({
            op: "batch",
            ops: [{ op: "replace", memory: {}, recovery: true }],
        });
        expect(answer.ok).toBe(false);
        expect(Object.keys(chrome.store.papers)).toEqual(["a"]);
    });

    it("addTags adds to the tags stored now, in one batch write (fullMemory's bulk Add tag)", async () => {
        chrome.store.papers = {
            a: paper("a", { tags: ["vision"] }),
            b: paper("b", { tags: ["nlp", "to-read"] }),
        };
        chrome.store.papersRevision = 3;
        const answer = await q.runMemoryOp({
            op: "batch",
            ops: ["a", "b", "gone"].map((id) => ({
                op: "addTags",
                id,
                tags: ["to-read"],
            })),
        });
        expect(answer.ok).toBe(true);
        expect(chrome.store.papers.a.tags).toEqual(["to-read", "vision"]);
        expect(chrome.store.papers.b.tags).toEqual(["nlp", "to-read"]);
        expect(chrome.store.papers.gone).toBeUndefined(); // never re-created
        expect(answer.result.results[2]).toEqual({ missing: true });
        expect(chrome.store.papersRevision).toBe(4);
    });

    it("an agent change checks the Memory as stored now and is written only when it asks", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.store.papersRevision = 3;
        // Agent access (in the background): a refused change writes nothing
        const refused = await q.runMemoryOp({
            op: "agent",
            change: (papers) => {
                papers.a.note = "not written";
                return { error: { code: "bad-args" } };
            },
        });
        expect(refused).toEqual({
            ok: true,
            result: { error: { code: "bad-args" } },
            revision: 3,
        });
        expect(chrome.store.papers.a.note).toBe("");
        // a page's write meanwhile is what the next change sees
        await q.runMemoryOp({ op: "patch", id: "a", fields: { note: "typed" } });
        const made = await q.runMemoryOp({
            op: "agent",
            change: async (papers) => {
                papers.a.note += "\nappended";
                return { write: true, result: papers.a.note };
            },
        });
        expect(made).toEqual({
            ok: true,
            result: { result: "typed\nappended" },
            revision: 5,
        });
        expect(chrome.store.papers.a.note).toBe("typed\nappended");
    });

    it("an agent's add: tags and membership on the paper as stored, Provenance only on one the merge creates", async () => {
        const agent = {
            tags: ["review", "proj-x"],
            projectHash: "h",
            provenance: { clientId: "c" },
        };
        chrome.store.papers = { a: paper("a", { tags: ["mine"] }) };
        await q.runMemoryOp({ op: "visit", id: "a", agent });
        expect(chrome.store.papers.a).toMatchObject({
            tags: ["mine", "review", "proj-x"],
            projectHashes: ["h"],
            count: 2,
        });
        expect(chrome.store.papers.a.provenance).toBeUndefined();
        const created = await q.runMemoryOp({
            op: "merge",
            paper: paper("b"),
            visit: true,
            agent,
        });
        expect(created.result.created).toBe(true);
        expect(chrome.store.papers.b).toMatchObject({
            tags: ["review", "proj-x"],
            projectHashes: ["h"],
            provenance: { clientId: "c" },
        });
        // merged into the stored paper: no Provenance, the membership once
        const merged = await q.runMemoryOp({
            op: "merge",
            paper: paper("a"),
            visit: true,
            agent,
        });
        expect(merged.result.created).toBe(false);
        expect(chrome.store.papers.a.projectHashes).toEqual(["h"]);
        expect(chrome.store.papers.a.provenance).toBeUndefined();
    });

    it("an agent's merge onto a stored paper only attaches it: nothing of the parse is merged in", async () => {
        const agent = { tags: ["review"], projectHash: "h", provenance: { clientId: "c" } };
        // stored by another page meanwhile: anonymous, with the user's note
        chrome.store.papers = {
            a: paper("a", { author: "Anonymous", note: "mine", count: 4 }),
        };
        const answer = await q.runMemoryOp({
            op: "merge",
            paper: paper("a", { author: "Jane Doe", bibtex: "@article{parsed}" }),
            overwrites: ["lastOpenDate"],
            anonymousOverwrites: ["author", "year", "venue", "bibtex"],
            visit: true,
            agent,
        });
        expect(answer.result.created).toBe(false);
        const a = chrome.store.papers.a;
        expect(a).toMatchObject({
            author: "Anonymous",
            note: "mine",
            count: 5,
            tags: ["review"],
            projectHashes: ["h"],
        });
        expect(a).not.toHaveProperty("bibtex");
        expect(a).not.toHaveProperty("provenance");
    });

    it("a merge whose target was deleted meanwhile goes into the stored paper of the parsed id, never over it", async () => {
        // the fuzzy match "gone" was anonymous: the overwrites chosen for it include the note
        const overwrites = ["lastOpenDate", "author", "year", "venue", "bibtex", "note"];
        const stored = { note: "my note", tags: ["mine"], favorite: true, count: 12 };
        const parsed = paper("n", { note: "Published @ X", title: "Fresh parse" });
        chrome.store.papers = { n: paper("n", stored) };
        const userVisit = await q.runMemoryOp({
            op: "merge",
            id: "gone",
            paper: parsed,
            overwrites,
            visit: true,
            ifMissing: "skip",
        });
        expect(userVisit.result).toMatchObject({ created: false, paper: { id: "n" } });
        expect(chrome.store.papers.n).toMatchObject({ ...stored, count: 13 });
        expect(chrome.store.papers.n.title).toBe("Title n");
        expect(chrome.store.papers).not.toHaveProperty("gone");
        // an agent's: attached, no Provenance on the stored paper
        const agent = { tags: ["review"], projectHash: "h", provenance: { clientId: "c" } };
        const agentAdd = await q.runMemoryOp({
            op: "merge",
            id: "gone",
            paper: parsed,
            overwrites,
            visit: true,
            agent,
        });
        expect(agentAdd.result.created).toBe(false);
        expect(chrome.store.papers.n).toMatchObject({
            note: "my note",
            tags: ["mine", "review"],
            count: 14,
        });
        expect(chrome.store.papers.n).not.toHaveProperty("provenance");
    });

    it("a merge of a paper found stored, deleted meanwhile, is not re-created", async () => {
        chrome.store.papers = {};
        // the pipeline's merges of a fuzzy match, and of a stale copy of the stored paper
        for (const op of [
            { op: "merge", id: "gone", paper: paper("n"), ifMissing: "skip" },
            { op: "merge", fromId: "gone", paper: paper("n"), ifMissing: "skip" },
            {
                op: "merge",
                paper: paper("gone", { note: "old note" }),
                visit: true,
                ifMissing: "skip",
            },
        ]) {
            const answer = await q.runMemoryOp(op);
            expect(answer.result).toEqual({ missing: true });
        }
        expect(chrome.store.papers).toEqual({});
    });

    it("a page's merge or promotion makes an agent's paper the user's: no Provenance, Projects kept", async () => {
        const provenance = { clientId: "c" };
        const promotion = {
            op: "merge",
            fromId: "pre",
            paper: paper("pub", { venue: "NeurIPS", source: "neurips" }),
            overwrites: ["lastOpenDate", "venue", "id", "source"],
            visit: true,
        };
        // the user's visit of the published version of an agent's preprint
        chrome.store.papers = {
            pre: paper("pre", { provenance, projectHashes: ["h1"], tags: ["review"] }),
        };
        await q.runMemoryOp(promotion);
        expect(Object.keys(chrome.store.papers)).toEqual(["pub"]);
        expect(chrome.store.papers.pub.projectHashes).toEqual(["h1"]);
        expect(chrome.store.papers.pub).not.toHaveProperty("provenance");
        // both stored: one record with both Projects, no Provenance
        chrome.store.papers = {
            pre: paper("pre", { provenance, projectHashes: ["h1"] }),
            pub: paper("pub", { projectHashes: ["h2"], note: "user note" }),
        };
        await q.runMemoryOp(promotion);
        expect(Object.keys(chrome.store.papers)).toEqual(["pub"]);
        expect(chrome.store.papers.pub.projectHashes).toEqual(["h2", "h1"]);
        expect(chrome.store.papers.pub).not.toHaveProperty("provenance");
        // a re-parse merge (e.g. of an anonymous paper an agent added)
        chrome.store.papers = {
            a: paper("a", { author: "Anonymous", provenance, projectHashes: ["h1"] }),
        };
        await q.runMemoryOp({
            op: "merge",
            paper: paper("a", { author: "Jane Doe" }),
            anonymousOverwrites: ["author"],
            visit: true,
        });
        expect(chrome.store.papers.a.author).toBe("Jane Doe");
        expect(chrome.store.papers.a).not.toHaveProperty("provenance");
    });

    it("a message cannot carry an agent change or an inline Memory, even in a batch; a page's replace still can", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.store.papersRevision = 3;
        const refused = [
            { op: "agent", change: () => ({ write: true }) },
            JSON.parse(JSON.stringify({ op: "agent", change: () => ({}) })),
            { op: "replace", memory: {}, recovery: true },
            { op: "batch", ops: [{ op: "agent", change: () => ({ write: true }) }] },
            { op: "batch", ops: [{ op: "patch", id: "a", memory: {} }] },
        ];
        for (const op of refused) {
            const answer = await q.runMemoryOpFromMessage(op);
            expect(answer.ok).toBe(false);
        }
        // the same from a page (memoryOp sends {type: "memory"})
        const fromPage = await q.memoryOp({ op: "agent", change: () => ({ write: true }) });
        expect(fromPage.ok).toBe(false);
        expect(Object.keys(chrome.store.papers)).toEqual(["a"]);
        expect(chrome.store.papersRevision).toBe(3);
        expect(chrome.store).not.toHaveProperty("memoryRecovery");
        // a page's replace (e.g. a sync pull): its Memory staged, then a message
        const replaced = await q.replaceMemory({ b: paper("b") });
        expect(replaced.ok).toBe(true);
        expect(Object.keys(chrome.store.papers)).toEqual(["b"]);
    });

    it("two interleaved replaces each commit their own staging copy, then remove it", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.store.papersRevision = 7;
        // two pages stage their Memory, then both ask for the replace
        chrome.store["memoryStaging:s1"] = {
            papers: { b: paper("b") },
            date: Date.now(),
        };
        chrome.store["memoryStaging:s2"] = {
            papers: { c: paper("c") },
            date: Date.now(),
        };
        const [first, second] = await Promise.all([
            q.runMemoryOp({
                op: "replace",
                fromStaging: "s1",
                ifRevision: 7,
                recovery: true,
            }),
            q.runMemoryOp({
                op: "replace",
                fromStaging: "s2",
                ifRevision: 7,
                recovery: true,
            }),
        ]);
        expect(first.ok && !first.result.conflict).toBe(true);
        expect(first.result.recoveryKey).toBe("memoryRecovery");
        // the second was prepared against revision 7: refused, and its copy removed too
        expect(second.result.conflict).toBe(true);
        expect(Object.keys(chrome.store.papers)).toEqual(["b"]);
        expect(Object.keys(chrome.store.memoryRecovery.papers)).toEqual(["a"]);
        expect(chrome.store["memoryStaging:s1"]).toBe(undefined);
        expect(chrome.store["memoryStaging:s2"]).toBe(undefined);
    });

    it("a failed replace removes its staging copy; old copies are swept", async () => {
        chrome.store.papers = { a: paper("a") };
        chrome.store["memoryStaging:bad"] = { papers: [], date: Date.now() }; // not a Memory
        const failed = await q.runMemoryOp({ op: "replace", fromStaging: "bad" });
        expect(failed.ok).toBe(false);
        expect(chrome.store["memoryStaging:bad"]).toBe(undefined);
        expect(Object.keys(chrome.store.papers)).toEqual(["a"]);
        const now = Date.now();
        chrome.store["memoryStaging:old"] = { papers: {}, date: now - 2 * 3600e3 };
        chrome.store["memoryStaging:recent"] = { papers: {}, date: now - 60e3 };
        const swept = await q.sweepStaging(now);
        expect(swept).toEqual(["memoryStaging:old"]);
        expect(chrome.store["memoryStaging:recent"]).toBeDefined();
    });

    it("a retried operation gets the first answer again (summary), and the paper re-read", async () => {
        globalThis.__PM_MEMORY_IN_CONTEXT__ = true;
        chrome.store.papers = {};
        const op = { op: "merge", paper: paper("n"), opId: "op-merge" };
        const first = await q.memoryOp(op);
        const again = await q.memoryOp(op);
        expect(first.result.created).toBe(true);
        expect(again.result).toMatchObject({
            duplicate: true,
            created: true,
            paperId: "n",
        });
        expect(again.result.paper.id).toBe("n");
        expect(chrome.store.memoryAppliedOps.at(-1)).toMatchObject({
            id: "op-merge",
            summary: { created: true, paperId: "n" },
        });
    });

    it("notes are combined and a second code link goes into the note", async () => {
        const merged = q.reconcileRecords(
            paper("pub", {
                note: "published note",
                codeLink: "https://github.com/a/pub",
            }),
            paper("pre", {
                note: "preprint note",
                codeLink: "https://github.com/a/pre",
            }),
        );
        expect(merged.codeLink).toBe("https://github.com/a/pub");
        expect(merged.note).toBe(
            "published note\n\npreprint note\n\nCode (preprint): https://github.com/a/pre",
        );
        const same = q.reconcileRecords(
            paper("pub", { note: "same", codeLink: "https://x.org" }),
            paper("pre", { note: "same", codeLink: "https://x.org" }),
        );
        expect(same.note).toBe("same");
        expect(same.codeLink).toBe("https://x.org");
        const onlyPre = q.reconcileRecords(
            paper("pub"),
            paper("pre", { codeLink: "https://y.org" }),
        );
        expect(onlyPre.codeLink).toBe("https://y.org");
        expect(onlyPre.note).toBe("");
    });

    it("migrateData reports failure when the migrated Memory cannot be saved", async () => {
        globalThis.__PM_MEMORY_IN_CONTEXT__ = true;
        const legacy = {
            __dataVersion: 304,
            a: paper("a", { codeLink: false, venue: "" }),
        };
        chrome.store.papers = structuredClone(legacy);
        chrome.faults.write = (obj) => "papers" in obj;
        const migration = await PMUtils.data.migrateData(
            structuredClone(legacy),
            10200,
            true,
        );
        expect(migration.success).toBe(false);
        expect(chrome.store.papers.__dataVersion).toBe(304); // still the old version
        chrome.faults.write = null;
        const again = await PMUtils.data.migrateData(
            structuredClone(legacy),
            10200,
            true,
        );
        expect(again.success).toBe(true);
        expect(chrome.store.papers.__dataVersion).toBe(10200);
    });
});

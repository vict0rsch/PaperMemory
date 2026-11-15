// The Memory ("papers" in chrome.storage.local) has ONE writer: the background (service
// worker in Chrome MV3, background page in Firefox MV2). Every page and content script sends
// it operations, not snapshots: {op: "patch", id, fields}, {op: "visit", id}, … The
// background runs them one at a time: read the Memory as stored now → apply → write, then
// answers. Two pages editing different fields of a paper, or a visit counted while a note is
// being typed, therefore never undo each other.
//
// Storage: "papers" unchanged. New keys: "papersRevision" (counts writes: a replace can be
// refused when the Memory changed since it was prepared), "memoryAppliedOps" (ids of the
// last operations applied, with a summary of their answer: a retried operation is not
// applied twice), "memoryStaging:<id>" (a whole Memory written by a page before it asks
// for a replace, so large data never travels in messages; used once, swept after an hour),
// "memoryRecovery" (the Memory a restore replaced).
//
// No answer from the background (asleep, restarting): the operation is sent again a few
// times (a message wakes the service worker); its id makes a retry harmless. Still no answer:
// the caller gets {ok: false}. Operations never run outside the background in the extension;
// only unit tests (Node) may run them in their own context, with an explicit flag
// (globalThis.__PM_MEMORY_IN_CONTEXT__ = true).
import { state } from "@pmu/config.js";
import { log, warn, logError } from "@pmu/functions.js";
// static imports (content scripts are bundled without code splitting); the cycle with
// data.js / paper.js is only used at run time
import { migrateData, backupData, refreshPapersState } from "@pmu/data.js";
import { mergePapers } from "@pmu/paper.js";

let inBackground = false; // set by serveMemoryOps() in the background
let queue = Promise.resolve();
let inContextRuns = 0; // operations run outside the background (tests only)
const APPLIED_KEEP = 200; // ids of applied operations remembered
const RETRY_DELAYS = [0, 250, 750, 2000]; // ms before each attempt

/** How many operations ran outside the background (must stay 0 in the extension) */
export const getInContextRuns = () => inContextRuns;

const lastError = () => globalThis.chrome?.runtime?.lastError;

/** One key's value; rejects when the browser reports an error (never "absent") */
const storageGetOne = (key) =>
    new Promise((resolve, reject) => {
        try {
            chrome.storage.local.get(key, (data) => {
                const error = lastError();
                if (error) return reject(new Error(`Reading ${key}: ${error.message}`));
                if (data === undefined || data === null)
                    return reject(new Error(`Reading ${key}: no answer from storage`));
                resolve(data[key]);
            });
        } catch (e) {
            reject(e);
        }
    });
/** Several keys, read one by one (nothing else writes them between the reads) */
const storageGet = async (keys) => {
    const out = {};
    for (const key of [].concat(keys)) out[key] = await storageGetOne(key);
    return out;
};
/** Rejects when the write fails */
const storageSet = (obj) =>
    new Promise((resolve, reject) => {
        try {
            chrome.storage.local.set(obj, () => {
                const error = lastError();
                error ? reject(new Error(`Writing: ${error.message}`)) : resolve();
            });
        } catch (e) {
            reject(e);
        }
    });

/** Rejects when the removal fails */
const storageRemove = (key) =>
    new Promise((resolve, reject) => {
        try {
            chrome.storage.local.remove(key, () => {
                const error = lastError();
                error
                    ? reject(new Error(`Removing ${key}: ${error.message}`))
                    : resolve();
            });
        } catch (e) {
            reject(e);
        }
    });

const STAGING_PREFIX = "memoryStaging:";
const STAGING_MAX_AGE = 60 * 60 * 1000; // 1 h
const stagingKey = (id) => `${STAGING_PREFIX}${id}`;

/** What is remembered of an applied operation's answer (replayed to a retried message) */
const summarize = (result = {}) => {
    const summary = {};
    for (const key of [
        "created",
        "changed",
        "missing",
        "exists",
        "migrated",
        "recoveryKey",
    ])
        if (result[key] !== undefined) summary[key] = result[key];
    const paperId = result.paper?.id ?? result.deleted?.id;
    if (paperId) summary.paperId = paperId;
    return summary;
};

/** "Reinforcement learnings" → … (shared with retag: tags unique, sorted like savePaperTags) */
const retag = (tags, mapping) =>
    [...new Set(tags.map((t) => (mapping.has(t) ? mapping.get(t) : t)))]
        .filter(Boolean)
        .sort();

const visit = (paper) => {
    paper.count = (Number(paper.count) || 0) + 1;
    paper.lastOpenDate = new Date().toJSON();
    return paper;
};

/** Sets `fields` on `paper`; keys in `ifEmpty` only when the paper has no value for them */
const setFields = (paper, fields = {}, ifEmpty = []) => {
    for (const [key, value] of Object.entries(fields)) {
        if (ifEmpty.includes(key) && paper[key]) continue;
        paper[key] = value;
    }
    return paper;
};

const isPaperId = (id) => typeof id === "string" && id && !id.startsWith("__");
const earliest = (a, b) => (!a ? b : !b ? a : a < b ? a : b);
const latest = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Two stored records of one paper (a preprint and its published version): the published
 * record's metadata, and the user's data of both: tags (union); notes combined (the
 * published one's, a blank line, the other's; once if identical); the published code
 * link, the other's added to the note as "Code (preprint): <url>" when different;
 * favourite if either; visits summed; first added; last opened.
 * @param {object} published The record that stays (its metadata wins)
 * @param {object} other The record merged into it
 * @returns {object}
 */
export const reconcileRecords = (published, other) => {
    const out = { ...other, ...published };
    out.tags = [...new Set([...(published.tags ?? []), ...(other.tags ?? [])])].sort();
    const notes = [published.note, other.note]
        .map((n) => (typeof n === "string" ? n : ""))
        .filter((n) => n.trim());
    let note = [...new Set(notes)].join("\n\n");
    const codes = [published.codeLink, other.codeLink].filter(
        (c) => typeof c === "string" && c.trim(),
    );
    out.codeLink = codes[0] ?? "";
    if (codes.length === 2 && codes[0] !== codes[1]) {
        const line = `Code (preprint): ${codes[1]}`;
        if (!note.includes(line)) note = note ? `${note}\n\n${line}` : line;
    }
    out.note = note;
    out.favorite = !!(published.favorite || other.favorite);
    out.favoriteDate = published.favorite
        ? published.favoriteDate
        : other.favorite
          ? other.favoriteDate
          : (published.favoriteDate ?? "");
    out.count = (Number(published.count) || 0) + (Number(other.count) || 0);
    out.addDate = earliest(published.addDate, other.addDate);
    out.lastOpenDate = latest(published.lastOpenDate, other.lastOpenDate);
    return out;
};

/**
 * Applies one operation to the Memory (mutated in place)
 * @param {object | undefined} memory The stored Memory (undefined: none stored yet)
 * @param {object} op
 * @param {object} ctx {revision, staging: () => Promise<object>}
 * @returns {Promise<{memory: object, write: boolean, result: object, extra?: object}>}
 */
const apply = async (memory, op, ctx) => {
    const papers = memory ?? {};
    const keep = (result = {}) => ({ memory: papers, write: false, result });
    const done = (result = {}, extra) => ({
        memory: papers,
        write: true,
        result,
        extra,
    });
    switch (op.op) {
        case "patch": {
            // an unknown id (deleted meanwhile, anywhere) is never re-created
            if (!isPaperId(op.id) || !papers[op.id]) {
                log(
                    "[memory] patch of a paper that is not in the Memory, ignored:",
                    op.id,
                );
                return keep({ missing: true });
            }
            setFields(papers[op.id], op.fields, op.ifEmpty);
            return done({ paper: papers[op.id] });
        }
        case "visit": {
            if (!isPaperId(op.id) || !papers[op.id]) return keep({ missing: true });
            setFields(visit(papers[op.id]), op.fill, Object.keys(op.fill ?? {}));
            return done({ paper: papers[op.id] });
        }
        case "create": {
            const paper = op.paper;
            if (!isPaperId(paper?.id)) return keep({ invalid: true });
            if (papers[paper.id])
                return keep({ exists: true, paper: papers[paper.id] });
            papers[paper.id] = paper;
            return done({ paper });
        }
        case "merge": {
            // a parsed paper, merged into the stored one (stored user fields win, see
            // mergePapers) or created; fromId: a stored duplicate (a preprint) it replaces
            const target = op.id ?? op.paper.id;
            const source = op.fromId && op.fromId !== target ? papers[op.fromId] : null;
            const destination = papers[target];
            // both stored: one record with the user's data of both (then merged below)
            const base =
                source && destination
                    ? reconcileRecords(destination, source)
                    : source || destination;
            let paper;
            if (!base) {
                if (op.ifMissing === "skip") return keep({ missing: true });
                paper = op.paper;
            } else {
                const overwrites = [...(op.overwrites ?? ["lastOpenDate"])];
                if (String(base.author).toLowerCase() === "anonymous")
                    overwrites.push(...(op.anonymousOverwrites ?? []));
                paper = mergePapers({
                    newPaper: op.paper,
                    oldPaper: base,
                    overwrites,
                    incrementCount: !!op.incrementCount,
                });
                if (op.visit) visit(paper);
            }
            // e.g. a code repository found while parsing: only where there is none
            setFields(paper, op.fill, Object.keys(op.fill ?? {}));
            if (source && op.fromId !== paper.id) delete papers[op.fromId];
            papers[paper.id] = paper;
            return done({ paper, created: !base });
        }
        case "delete": {
            if (!isPaperId(op.id) || !papers[op.id]) return keep({ missing: true });
            const paper = papers[op.id];
            delete papers[op.id];
            return done({ deleted: paper });
        }
        case "retag": {
            const mapping = new Map(op.mapping);
            let changed = 0;
            for (const [id, paper] of Object.entries(papers)) {
                if (!isPaperId(id) || !paper?.tags?.some((t) => mapping.has(t)))
                    continue;
                paper.tags = retag(paper.tags, mapping);
                changed++;
            }
            return changed ? done({ changed }) : keep({ changed });
        }
        case "replace": {
            // the new Memory: written by the page under memoryStaging (fromStaging: its
            // id); inline (op.memory) only inside the background or in tests
            if (op.ifRevision !== undefined && op.ifRevision !== ctx.revision)
                return keep({ conflict: true, revision: ctx.revision });
            let next = op.memory;
            if (op.fromStaging) {
                const staging = await ctx.staging(stagingKey(op.fromStaging));
                if (!staging?.papers)
                    throw new Error("The Memory to write is missing (staging)");
                next = staging.papers;
            }
            if (!next || typeof next !== "object" || Array.isArray(next))
                throw new Error("A replace needs a Memory object");
            const extra = op.recovery
                ? {
                      memoryRecovery: {
                          date: new Date().toJSON(),
                          papers: memory ?? {},
                      },
                  }
                : undefined;
            return {
                memory: next,
                write: true,
                result: op.recovery ? { recoveryKey: "memoryRecovery" } : {},
                extra,
            };
        }
        case "migrate": {
            if (memory === undefined)
                return {
                    memory: { __dataVersion: op.version },
                    write: true,
                    result: { migrated: true },
                };
            if ((memory.__dataVersion || -1) >= 10000) return keep({ migrated: false });
            const before = structuredClone(memory);
            const migration = await migrateData(memory, op.version, false);
            if (!migration.success)
                throw new Error(`Migration failed: ${String(migration.error)}`);
            await backupData(before);
            return {
                memory: migration.papers,
                write: true,
                result: { migrated: true },
            };
        }
        case "batch": {
            let write = false;
            const results = [];
            let current = papers;
            for (const sub of op.ops) {
                // a replace keeps a recovery copy and clears staging: never inside a batch
                if (sub.op === "replace" || sub.op === "batch")
                    throw new Error(`"${sub.op}" cannot be part of a batch`);
                const out = await apply(current, sub, ctx);
                current = out.memory;
                write ||= out.write;
                results.push(out.result);
            }
            return { memory: current, write, result: { results } };
        }
        default:
            throw new Error(`Unknown Memory operation: ${op.op}`);
    }
};

/**
 * Runs an operation in this context's queue: read → apply → write (awaited) → answer.
 * A failed read or write aborts it ({ok: false}); an operation id already applied is not
 * applied again (a retried message).
 * @param {object} op
 * @returns {Promise<{ok: boolean, result?: object, revision?: number, error?: string}>}
 */
export const runMemoryOp = (op) => {
    const run = queue.then(async () => {
        try {
            const { papers, papersRevision, memoryAppliedOps } = await storageGet([
                "papers",
                "papersRevision",
                "memoryAppliedOps",
            ]);
            const revision = papersRevision ?? 0;
            const applied = memoryAppliedOps ?? [];
            if (op.opId) {
                const seen = applied.find((a) => a.id === op.opId);
                // a retried message: the first answer again (the paper itself, when the
                // caller needs it, is read back from storage by memoryOp)
                if (seen)
                    return {
                        ok: true,
                        result: { ...(seen.summary ?? {}), duplicate: true },
                        revision: seen.revision,
                    };
            }
            const out = await apply(papers, op, { revision, staging: storageGetOne });
            if (!out.write) return { ok: true, result: out.result, revision };
            const next = revision + 1;
            const write = {
                papers: out.memory,
                papersRevision: next,
                ...(out.extra ?? {}),
            };
            if (op.opId)
                write.memoryAppliedOps = [
                    ...applied,
                    { id: op.opId, revision: next, summary: summarize(out.result) },
                ].slice(-APPLIED_KEEP);
            await storageSet(write);
            return { ok: true, result: out.result, revision: next };
        } catch (e) {
            logError("[memory]", op?.op, e);
            return { ok: false, error: String(e?.message ?? e) };
        } finally {
            // the staging copy is used once, whatever happened (commit, conflict, error)
            if (op.fromStaging)
                await storageRemove(stagingKey(op.fromStaging)).catch((e) =>
                    warn("[memory] could not remove a staging copy", e),
                );
        }
    });
    queue = run.catch(() => {});
    return run;
};

/** In the background: answer the pages' operations (one queue for the whole extension) */
export const serveMemoryOps = () => {
    inBackground = true;
    sweepStaging();
};

/**
 * Removes staging copies left by replaces that never ran (a page closed meanwhile): older
 * than STAGING_MAX_AGE. Runs in the queue, so it never races a replace.
 * @param {number} now For tests
 */
export const sweepStaging = (now = Date.now()) => {
    const run = queue.then(async () => {
        try {
            const all = await new Promise((resolve, reject) =>
                chrome.storage.local.get(null, (data) => {
                    const error = lastError();
                    error ? reject(new Error(error.message)) : resolve(data ?? {});
                }),
            );
            const stale = Object.keys(all).filter(
                (key) =>
                    (key.startsWith(STAGING_PREFIX) &&
                        !(now - (all[key]?.date ?? 0) < STAGING_MAX_AGE)) ||
                    key === "memoryStaging", // the single key of an earlier dev build
            );
            for (const key of stale) await storageRemove(key);
            return stale;
        } catch (e) {
            warn("[memory] could not sweep staging copies", e);
            return [];
        }
    });
    queue = run.catch(() => {});
    return run;
};

const sendOnce = (op) =>
    new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type: "memory", op }, (response) => {
                void lastError(); // read: no "unchecked" error; no answer → undefined
                resolve(response);
            });
        } catch (e) {
            resolve(undefined);
        }
    });

const newOpId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Sends an operation to the background's queue and points this context's cached state at
 * the Memory it wrote. Retries (same operation id) when the background does not answer.
 * @param {object} op
 * @returns {Promise<{ok: boolean, result?: object, revision?: number, error?: string}>}
 */
export const memoryOp = async (op) => {
    op = { ...op, opId: op.opId ?? newOpId() };
    let answer;
    if (inBackground) answer = await runMemoryOp(op);
    else if (globalThis.__PM_MEMORY_IN_CONTEXT__ === true) {
        inContextRuns++; // unit tests only
        answer = await runMemoryOp(op);
    } else {
        for (const delay of RETRY_DELAYS) {
            if (delay) await new Promise((r) => setTimeout(r, delay));
            answer = await sendOnce(op);
            if (answer !== undefined) break;
            warn("[memory] no answer from the background, trying again");
        }
        answer ??= {
            ok: false,
            error: "PaperMemory's background did not answer. Nothing was saved.",
        };
    }
    if (answer.ok && answer.revision !== undefined) {
        // this context's cached state follows what was written (other contexts: onChanged)
        try {
            const papers = await storageGetOne("papers");
            if (inBackground) state.papers = papers ?? {};
            else refreshPapersState(papers ?? {});
            // a replayed answer has the paper's id only: the paper as stored now
            if (answer.result?.duplicate && answer.result.paperId)
                answer.result.paper = papers?.[answer.result.paperId];
        } catch (e) {
            warn("[memory] could not refresh the cached Memory", e);
        }
    }
    return answer;
};

/**
 * Replaces the whole Memory: the page writes it under memoryStaging (no large message),
 * then asks the background to commit it (checked against `ifRevision` when given)
 * @param {object} papers The new Memory
 * @param {object} opts {ifRevision, recovery}
 * @returns {Promise<{ok: boolean, result?: object, revision?: number, error?: string}>}
 */
export const replaceMemory = async (papers, { ifRevision, recovery = false } = {}) => {
    if (inBackground)
        return memoryOp({ op: "replace", memory: papers, ifRevision, recovery });
    const id = newOpId();
    try {
        // one item per replace: chrome.storage.local has no per-item limit
        // (unlimitedStorage); the queue removes it once used (or swept after an hour)
        await storageSet({ [stagingKey(id)]: { papers, date: Date.now() } });
    } catch (e) {
        return { ok: false, error: String(e?.message ?? e) };
    }
    return memoryOp({ op: "replace", fromStaging: id, ifRevision, recovery });
};

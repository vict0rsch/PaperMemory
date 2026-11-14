// ES Module imports
import { logError } from "@pmu/functions.js";
import { isPaper, addOrUpdatePaper } from "@pmu/paper.js";
import { knownPaperPages } from "@pmu/sources/index.js";

// Agent access ingest (see CONTEXT.md § Agent access): a paper a Paired client adds
// goes through the same Detect → Parse → Store pipeline as a visited page. On Chrome
// it runs in the offscreen document agentIngest.html, whose storage calls the
// background makes for it (filtered by filterStorageRequest); on Firefox, in the
// background page.

// storage keys the offscreen document never reads, besides the Agent access keys
// (`agent*`): sync credentials and state, and backups
const HIDDEN_KEYS = [
    "syncPAT",
    "syncId",
    "syncState",
    "syncTest",
    "sync",
    "weeklyBackups",
    "papersBackup",
];
// the only storage keys the offscreen document writes
const WRITABLE_KEYS = ["papers", "urlHashToId"];

/**
 * Add a paper from its URL for a Paired client: the pipeline applies the agent's
 * tags, Project membership and, to a new paper, Provenance before each write.
 * @param {object} job {url, tags, provenance, projectHash}
 * @returns {Promise<object>} {status, id?}: `stored` (new paper) or
 * `already-present`, with the paper's id; `unsupported-url` if no Source detects the
 * URL; `failed` if parsing failed or threw
 */
export const ingest = async ({ url, tags, provenance, projectHash }) => {
    try {
        const is = await isPaper(url, true);
        if (!Object.keys(knownPaperPages).some((source) => is[source] === true)) {
            return { status: "unsupported-url" };
        }
        const r = await addOrUpdatePaper({
            url,
            is,
            store: true,
            agent: { tags, provenance, projectHash },
        });
        if (!r) return { status: "failed" };
        await r.done;
        return { status: r.isNew ? "stored" : "already-present", id: r.id };
    } catch (error) {
        logError("[agentIngest]", error);
        return { status: "failed" };
    }
};

/**
 * Filter a storage call of the offscreen document before the background makes it:
 * a `get` reads neither sync credentials and state, nor backups, nor Agent access
 * keys (they are reported absent); a `set` writes only `papers` and `urlHashToId`
 * (other keys are dropped, and the call still completes).
 * @param {string} op "get" or "set"
 * @param {string|string[]|object} keysOrItems The key(s) to get, or the items to set
 * @returns {string[]|object|null} The keys to read, the items to write, or null for
 * another op
 */
export const filterStorageRequest = (op, keysOrItems) => {
    if (op === "get") {
        const keys =
            typeof keysOrItems === "string"
                ? [keysOrItems]
                : Array.isArray(keysOrItems)
                  ? keysOrItems
                  : [];
        return keys.filter(
            (key) =>
                typeof key === "string" &&
                !HIDDEN_KEYS.includes(key) &&
                !key.startsWith("agent"),
        );
    }
    if (op === "set") {
        const items = keysOrItems ?? {};
        return Object.fromEntries(
            WRITABLE_KEYS.filter((key) => Object.hasOwn(items, key)).map((key) => [
                key,
                items[key],
            ]),
        );
    }
    return null;
};

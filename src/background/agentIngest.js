// ES Module imports
import { logError } from "@pmu/functions.js";
import { isPaper, addOrUpdatePaper } from "@pmu/paper.js";
import { knownPaperPages } from "@pmu/sources/index.js";
import { urlToDoi, resolveDoi } from "@pmu/urls.js";

// Agent access ingest (see CONTEXT.md § Agent access): a paper a Paired client adds
// goes through the same Detect → Parse → Store pipeline as a visited page. On Chrome
// it runs in the offscreen document agentIngest.html, whose storage calls the
// background makes for it (filtered by filterStorageRequest) and whose Memory writes
// are operations sent to the background's queue, like a page's (memoryOp); on
// Firefox, in the background page.

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
    "uploadBackup",
    "memoryRecovery",
];
// the only storage key the offscreen document writes (its Memory writes are queue
// operations)
const WRITABLE_KEYS = ["urlHashToId"];

/**
 * Add a paper from its URL for a Paired client: the pipeline's first write carries the
 * agent's tags, Project membership and Provenance, which the Memory's queue adds to the
 * paper as stored (Provenance only to a paper that write creates; a paper already stored
 * is only attached).
 * @param {object} job {url, tags, provenance, projectHash}: `url` may be a DOI (urlToDoi),
 * whose registered page is added as if it were `url`
 * @returns {Promise<object>} {status, id?, resolvedUrl?, message?}: `stored` (new paper) or
 * `already-present`, with the paper's id; `unsupported-url` if no Source detects the
 * URL (for a DOI, `resolvedUrl`: the page it resolved to), or with `message` if the DOI
 * could not be resolved; `failed` if parsing failed or threw, the write failed, or the
 * stored paper it found was deleted meanwhile
 */
export const ingest = async ({ url, tags, provenance, projectHash }) => {
    try {
        const doi = urlToDoi(url);
        if (doi) {
            url = await resolveDoi(doi);
            if (!url)
                return {
                    status: "unsupported-url",
                    message: "DOI could not be resolved",
                };
        }
        const is = await isPaper(url, true);
        if (!Object.keys(knownPaperPages).some((source) => is[source] === true)) {
            return doi
                ? { status: "unsupported-url", resolvedUrl: url }
                : { status: "unsupported-url" };
        }
        const r = await addOrUpdatePaper({
            url,
            is,
            store: true,
            agent: { tags, provenance, projectHash },
            doi,
        });
        if (!r) return { status: "failed" };
        await r.done;
        const saved = await r.saving;
        // not written, or the stored paper it found was deleted meanwhile: not added
        if (!saved.ok || saved.result?.missing) return { status: "failed" };
        return { status: r.isNew ? "stored" : "already-present", id: r.id };
    } catch (error) {
        logError("[agentIngest]", error);
        return { status: "failed" };
    }
};

/**
 * Filter a storage call of the offscreen document before the background makes it:
 * a `get` reads neither sync credentials and state, nor backups, nor Agent access
 * keys (they are reported absent); a `set` writes only `urlHashToId` (other keys, such
 * as `papers`, are dropped, and the call still completes).
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

// "ignoreSources" (source name -> true when off) has one writer: the background. Pages (the
// sources picker of Settings and of the welcome page) send it patches, which it applies one
// at a time to the map as stored now, so two pages changing different sources never undo
// each other. Storage key and shape unchanged.
import { storageGetOne, storageSet } from "@pmu/memoryQueue.js";

let writes = Promise.resolve();
const RETRY_DELAYS = [0, 250, 750, 2000]; // ms, only while no background receives the message

/** Keeps the boolean values of a {source: bool} object */
const booleans = (obj) =>
    Object.fromEntries(
        Object.entries(obj ?? {}).filter(([, value]) => typeof value === "boolean"),
    );

/**
 * In the background: applies a change to the stored map, in this context's queue. Rejects
 * when storage reports an error (the queue goes on with the next change).
 * @param {{patch?: object, defaults?: object}} change patch: values to set; defaults: values
 *   for sources that have none yet
 * @returns {Promise<object>} The stored map after the write
 */
export const applyIgnoreSources = ({ patch, defaults } = {}) => {
    const run = writes.then(async () => {
        const stored = (await storageGetOne("ignoreSources")) ?? {};
        const next = { ...stored };
        for (const [key, value] of Object.entries(booleans(defaults)))
            if (!(key in next)) next[key] = value;
        Object.assign(next, booleans(patch));
        const changed = Object.keys(next).some((key) => next[key] !== stored[key]);
        if (changed) await storageSet({ ignoreSources: next });
        return next;
    });
    writes = run.catch(() => {}); // a failed change must not block the next ones
    return run;
};

/**
 * In a page: asks the background to apply a change. Sent again only when no background
 * received it ("Receiving end does not exist", Chrome and Firefox): a delivered change whose
 * answer was lost may have been applied, and sending it again could undo a newer one.
 * @param {{patch?: object, defaults?: object}} change See applyIgnoreSources
 * @returns {Promise<object | undefined>} The stored map; undefined: not applied, or unknown
 */
export const updateIgnoreSources = async (change) => {
    for (const delay of RETRY_DELAYS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const { answer, undelivered } = await new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: "ignoreSources", change }, (r) => {
                    const error = chrome.runtime.lastError; // read: no "unchecked" error
                    resolve({
                        answer: r,
                        undelivered: /Receiving end does not exist/i.test(
                            error?.message ?? "",
                        ),
                    });
                });
            } catch (e) {
                resolve({ undelivered: true }); // not sent at all
            }
        });
        if (!undelivered) return answer?.ok ? answer.ignoreSources : undefined;
    }
};

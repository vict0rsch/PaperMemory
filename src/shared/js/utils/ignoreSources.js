// "ignoreSources" (source name -> true when off) has one writer: the background. Pages (the
// sources picker of Settings and of the welcome page) send it patches, which it applies one
// at a time to the map as stored now, so two pages changing different sources never undo
// each other. Storage key and shape unchanged.
import { getStorage, setStorage } from "@pmu/data.js";

let writes = Promise.resolve();
const RETRY_DELAYS = [0, 250, 750, 2000]; // ms; a message wakes a sleeping service worker

/** Keeps the boolean values of a {source: bool} object */
const booleans = (obj) =>
    Object.fromEntries(
        Object.entries(obj ?? {}).filter(([, value]) => typeof value === "boolean"),
    );

/**
 * In the background: applies a change to the stored map, in this context's queue
 * @param {{patch?: object, defaults?: object}} change patch: values to set; defaults: values
 *   for sources that have none yet
 * @returns {Promise<object>} The stored map after the write
 */
export const applyIgnoreSources = ({ patch, defaults } = {}) => {
    const run = writes.then(async () => {
        const stored = (await getStorage("ignoreSources")) ?? {};
        const next = { ...stored };
        for (const [key, value] of Object.entries(booleans(defaults)))
            if (!(key in next)) next[key] = value;
        Object.assign(next, booleans(patch));
        const changed = Object.keys(next).some((key) => next[key] !== stored[key]);
        if (changed) await setStorage("ignoreSources", next);
        return next;
    });
    writes = run.catch(() => {}); // a failed write must not block the next ones
    return run;
};

/**
 * In a page: asks the background to apply a change (retried while it does not answer)
 * @param {{patch?: object, defaults?: object}} change See applyIgnoreSources
 * @returns {Promise<object | undefined>} The stored map, undefined when nothing answered
 */
export const updateIgnoreSources = async (change) => {
    for (const delay of RETRY_DELAYS) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        const answer = await new Promise((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: "ignoreSources", change }, (r) => {
                    void chrome.runtime.lastError; // no answer: undefined
                    resolve(r);
                });
            } catch (e) {
                resolve(undefined);
            }
        });
        if (answer?.ok) return answer.ignoreSources;
    }
};

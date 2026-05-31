import { cleanPapers, urlToWebsiteId, miniHash } from "@pmu/functions.js";
import { isPaper } from "@pmu/paper.js";
import { state } from "@pmu/config.js";
import { getSource, SOURCE_DISPATCH_ORDER } from "@pmu/sources/index.js";

/**
 * Find the first paper from a source whose #id matches a certain string.
 * Return its #id.
 * @param {Array<object>} papers List of papers to check
 * @param {String} source the source to filter for
 * @param {String} match the id's uniquely identifiable string to match
 * @returns {String} paper?.id
 */
export const findPaperForProperty = (papers, source, match, prop = "id") =>
    papers.find((p) => p.source === source && p[prop].includes(match))?.id;

/**
 * Tests wether a given url is a known paper source according to k nownPaperPages
 * and to local files.
 * @param {string} url The url to test
 * @returns {boolean}
 */
export const isSourceURL = async (url, noStored) =>
    Object.values(await isPaper(url, noStored)).some((i) => i);

/**
 * Parses a paper's id from a url.
 * Throws error if the url is not a paper source as defined per isPaper(url).
 *
 * @param {string} url The url to use in order to find a matching paper
 * @returns {string} The id of the paper found.
 */
export const parseIdFromUrl = async (url, tab = null) => {
    try {
        if (tab) {
            return urlToWebsiteId(url);
        }
        let idForUrl;

        const hashedUrl = miniHash(url);
        const hashedId = state.urlHashToId[hashedUrl];
        if (hashedId) {
            return hashedId;
        }

        const is = await isPaper(url, true);
        const papers = Object.values(cleanPapers(state.papers));
        const ctx = {
            papers,
            titleHashToIds: state.titleHashToIds,
            findPaperForProperty,
        };

        let matchedSource = false;
        for (const name of SOURCE_DISPATCH_ORDER) {
            if (is[name]) {
                matchedSource = true;
                idForUrl = await getSource(name).urlToId(url, ctx);
                break;
            }
        }

        // A matched source returning undefined means "not in storage yet"; let the
        // caller (addOrUpdatePaper) take the makePaper path. Only throw when the URL
        // was not recognized as any known source.
        if (!matchedSource && idForUrl === undefined) {
            if (is.localFile) {
                idForUrl = is.localFile;
            } else if (is.parsedWebsite) {
                idForUrl = is.parsedWebsite.id;
            } else {
                // Not a recognized paper source: this is an expected outcome
                // (e.g. arbitrary URLs), so return null rather than throwing.
                return null;
            }
        }

        return idForUrl;
    } catch (err) {
        console.error("Error in parseIdFromUrl:", err);
        return null;
    }
};

export const isArxivAbstractUrl = (url) => url.startsWith("https://arxiv.org/abs/");

export const getCurrentUserTab = () =>
    new Promise((resolve) => {
        const query = { active: true, lastFocusedWindow: true };
        chrome.tabs.query(query, async (tabs) => {
            resolve(tabs[0]);
        });
    });

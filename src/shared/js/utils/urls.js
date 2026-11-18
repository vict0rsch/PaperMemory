import { cleanPapers, urlToWebsiteId, miniHash } from "@pmu/functions.js";
import { isPaper } from "@pmu/paper.js";
import { state } from "@pmu/config.js";
import { getSource, SOURCE_DISPATCH_ORDER, unwrapUrl } from "@pmu/sources/index.js";
import { fetchJSON } from "@pmu/parsers.js";
import { validDoi } from "@pmu/preprintMatching.js";

// doi.org's hosts
const DOI_HOSTS = ["doi.org", "dx.doi.org", "www.doi.org"];
// how long the DOI Handle API may take before the request is aborted (ms)
const DOI_TIMEOUT = 5000;

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
 *
 * @param {string} url The url to use in order to find a matching paper
 * @param {object} [tab] The tab, for manual website parsing
 * @returns {Promise<string|undefined|null>} Never rejects. Resolves to:
 *  - a string: `urlToWebsiteId(url)` if `tab` is given; otherwise the id `url` is
 *    mapped to in `state.urlHashToId`, else the matching source's `urlToId` result,
 *    else the id of the matching local file or stored website paper.
 *  - `undefined` (or another falsy value) if a source matches the url but its
 *    `urlToId` resolves no id (e.g. the paper is not stored yet, or the url
 *    carries no identifier).
 *  - `null` if the url matches no source, local file or stored website paper, or
 *    if an error was thrown (it is logged).
 */
export const parseIdFromUrl = async (url, tab = null) => {
    try {
        if (tab) {
            return urlToWebsiteId(url);
        }
        url = unwrapUrl(url);
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

/**
 * The DOI given in place of a paper URL, for an add without a tab (an agent's add_paper,
 * the options page's import): a doi.org URL (`https://doi.org/…`, `http://dx.doi.org/…`,
 * `https://www.doi.org/…`) or a `doi:…` URI, both percent-decoded, or a bare DOI (`10.…`)
 * @param {string} url
 * @returns {string|undefined} The DOI (as validDoi accepts it), else undefined
 */
export const urlToDoi = (url) => {
    if (typeof url !== "string") return undefined;
    const value = url.trim();
    if (/^10\./.test(value)) return validDoi(value);
    let encoded;
    if (/^doi:/i.test(value)) {
        encoded = value.slice(4);
    } else {
        let parsed;
        try {
            parsed = new URL(value);
        } catch (e) {
            return undefined;
        }
        const { protocol, hostname, pathname } = parsed;
        if (!/^https?:$/.test(protocol) || !DOI_HOSTS.includes(hostname))
            return undefined;
        encoded = pathname.slice(1);
    }
    try {
        return validDoi(decodeURIComponent(encoded));
    } catch (e) {
        return undefined; // a malformed percent-encoding
    }
};

/**
 * The URL a DOI is registered to, from the DOI Handle API (doi.org)
 * @param {string} doi A DOI (see urlToDoi)
 * @returns {Promise<string|undefined>} Its http or https URL; undefined if the DOI is not
 * registered, or if the API failed or did not answer within DOI_TIMEOUT
 */
export const resolveDoi = async (doi) => {
    const { data } = await fetchJSON(
        `https://doi.org/api/handles/${encodeURIComponent(doi)}?type=URL`,
        { signal: AbortSignal.timeout(DOI_TIMEOUT) },
    );
    try {
        const url = data.values.find((v) => v.type === "URL").data.value;
        if (data.responseCode === 1 && /^https?:$/.test(new URL(url).protocol))
            return url;
    } catch (e) {
        // not registered (no answer data), no URL value, or an unexpected answer
    }
    return undefined;
};

export const getCurrentUserTab = () =>
    new Promise((resolve) => {
        const query = { active: true, lastFocusedWindow: true };
        chrome.tabs.query(query, async (tabs) => {
            resolve(tabs[0]);
        });
    });

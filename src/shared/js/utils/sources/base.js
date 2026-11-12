/**
 * Stateless paper source handler (Option A). Papers remain plain objects; this
 * class is never instantiated — only static methods are used.
 *
 * IMPORTANT — circular import constraint:
 *   `functions.js` imports `getSource` from `sources/index.js`, which in turn
 *   imports every concrete source module (including ones that import back from
 *   `functions.js`). This cycle is safe today because every source module only
 *   consumes `functions.js` bindings inside method bodies (runtime, after all
 *   modules have been evaluated). Do NOT evaluate `functions.js` exports at
 *   source-module top level (e.g. inside `static patterns = [...]` initialisers
 *   that call functions from `functions.js`); doing so hits a Temporal Dead
 *   Zone at load time and crashes the extension.
 *

 * @typedef {Object} ParsedPaperFields
 * @property {string} author
 * @property {string} bibtex
 * @property {string} id
 * @property {string} key
 * @property {string} note
 * @property {string} pdfLink
 * @property {string} title
 * @property {string} venue
 * @property {string} year
 * @property {string} [doi]
 * @property {Object} [extra]
 * @property {string} [conf]
 * @property {string|false} [codeLink]
 */

/**
 * Whether `url` is on `host` or one of its subdomains, and what follows the host
 * (path, query and fragment) starts with `path` (a string) or matches it (a
 * RegExp: anchor it with `^` to match from the start of the path). Checking the
 * parsed host keeps another site's URL that merely contains a source's address
 * (e.g. https://evil.example/?x=arxiv.org/abs/...) from being detected.
 * @param {string} url
 * @param {string} host e.g. "arxiv.org"
 * @param {string|RegExp} path e.g. "/abs/"
 * @returns {boolean} false when `url` does not parse
 */
export const isOnHost = (url, host, path) => {
    try {
        const { hostname, pathname, search, hash } = new URL(url);
        const rest = pathname + search + hash;
        return (
            (hostname === host || hostname.endsWith(`.${host}`)) &&
            (typeof path === "string" ? rest.startsWith(path) : path.test(rest))
        );
    } catch (e) {
        return false;
    }
};

export class BasePaperSource {
    /** @type {string} matches `paper.source` and `is.{name}` from isPaper() */
    static name = "";
    /** @type {string} human-readable name for UI (knownPaperPages[source].name) */
    static displayName = "";
    /**
     * `"host/path"` strings match URLs on `host` (or a subdomain) whose path
     * starts with `/path` (see `isOnHost`). Functions get the full URL: anchor
     * them on the host too, with `isOnHost`.
     * @type {(string|((url: string) => boolean))[]}
     */
    static patterns = [];
    /** @type {boolean} true for preprint hosts (dedup fuzzy match) */
    static isPreprint = false;

    /**
     * @param {string} url
     * @param {(string|((u: string) => boolean))[]} [patterns]
     * @returns {boolean}
     */
    static matches(url, patterns = this.patterns) {
        for (const pattern of patterns) {
            if (typeof pattern === "string") {
                const slash = pattern.indexOf("/");
                if (isOnHost(url, pattern.slice(0, slash), pattern.slice(slash))) {
                    return true;
                }
            } else if (typeof pattern === "function") {
                if (pattern(url)) return true;
            }
        }
        return false;
    }

    /**
     * Resolve stable paper id from URL (parseIdFromUrl branch body).
     * @param {string} url
     * @param {{ papers: object[], titleHashToIds: object, findPaperForProperty: Function }} ctx
     * @returns {Promise<string>}
     */
    static async urlToId(_url, _ctx) {
        throw new Error(`urlToId not implemented for ${this.name}`);
    }

    /**
     * Fetch / derive paper fields (former make<Source>Paper).
     * @param {string} url
     * @param {object|null} tab active tab for website source only
     * @param {object} [ctx] optional context (e.g. titleHashToIds for biorxiv id dedup)
     * @returns {Promise<ParsedPaperFields|undefined>}
     */
    static async parse(_url, _tab, _ctx) {
        throw new Error(`parse not implemented for ${this.name}`);
    }

    /** @param {object} paper @returns {string} */
    static toAbs(paper) {
        return paper.pdfLink;
    }

    /** @param {object} paper @returns {string} */
    static toPDF(paper) {
        return paper.pdfLink;
    }

    /**
     * @param {object} paper
     * @param {string} baseId shortened display id from id
     * @returns {string}
     */
    static displayId(paper, baseId) {
        return baseId;
    }

    /** @param {object} paper @returns {string} */
    static extractVenueFromNote(paper) {
        let venue = "";
        if (paper.note && paper.note.match(/(accepted|published)\ @\ .+\(?\d{4}\)?/i)) {
            venue = paper.note
                .split("@")[1]
                .trim()
                .replace(/\(?\d{4}\)?/, "")
                .split("--")[0]
                .trim();
        }
        if (venue && venue.toLowerCase() === "neurips") venue = "NeurIPS";
        return venue;
    }

    /**
     * Migration / venue helper (former makeVenue switch).
     * @param {object} paper
     * @returns {Promise<string>}
     */
    static async venue(paper) {
        return BasePaperSource.extractVenueFromNote(paper);
    }
}

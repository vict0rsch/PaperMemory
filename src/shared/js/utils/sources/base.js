/**
 * Stateless paper source handler (Option A). Papers remain plain objects; this
 * class is never instantiated — only static methods are used.
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

export class BasePaperSource {
    /** @type {string} matches `paper.source` and `is.{name}` from isPaper() */
    static name = "";
    /** @type {string} human-readable name for UI (knownPaperPages[source].name) */
    static displayName = "";
    /** @type {(string|((url: string) => boolean))[]} */
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
                if (url.includes(pattern)) return true;
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

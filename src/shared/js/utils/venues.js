// Venue-name abbreviation: one conference table + pure helpers.
// Display-time only: stored paper.venue values are never rewritten by this module.
import { journalAbbreviations, journalShortNames } from "@pmu/config.js";
import { CONFERENCES, pmlrConfOverrides } from "@pmu/venueTable.js";

export { CONFERENCES, pmlrConfOverrides };

// ----- normalisation -----

const STOP = new Set([
    "the",
    "of",
    "proceedings",
    "proc",
    "annual",
    "ieee",
    "acm",
    "cvf",
    "rsj",
]);
// short abbreviations that are also ordinary words: only match them as the whole string
const AMBIGUOUS = new Set(["alt", "chi", "rss"]);
const YEAR = /\b(?:19|20)\d{2}\b/;
const ORDINAL = /\b\d+(?:st|nd|rd|th)\b/gi;

// venue names are short: longer input is cut before any regex runs (bounded work on bad data)
const MAX_LENGTH = 400;
const bounded = (str) => String(str ?? "").slice(0, MAX_LENGTH);

/** lowercase words of a venue string, without years, ordinals, sponsor words */
const words = (str) =>
    bounded(str)
        .toLowerCase()
        .replace(ORDINAL, " ")
        .replace(/['’]\d{2}\b/g, " ")
        .replace(new RegExp(YEAR.source, "g"), " ")
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        // volume numbers ("Advances in Neural Information Processing Systems 30") are dropped
        .filter((w) => w && !STOP.has(w) && !/^\d{1,3}$/.test(w));

const key = (str) => words(str).join(" ");
const hash = (str) =>
    String(str ?? "")
        .toLowerCase()
        .replace(/\W/g, "");

/** @type {Map<string, object>} normalised name / abbreviation / alias -> entry */
const INDEX = new Map();
/** [{ entry, key: string[], isAbbr }] for in-string search */
const SEARCH = [];
for (const entry of CONFERENCES) {
    for (const n of [...entry.names, entry.abbr, ...(entry.aliases ?? [])]) {
        const k = key(n);
        INDEX.set(k, entry);
        const w = k.split(" ");
        if (w.length === 1 && AMBIGUOUS.has(w[0])) continue;
        SEARCH.push({ entry, words: w });
    }
}

/** Strip "Proceedings of the", ordinals, leading/trailing years and stray punctuation. */
const clean = (name) => {
    let s = bounded(name).trim();
    if (!/^proceedings of machine learning research/i.test(s)) {
        s = s.replace(/^(?:proceedings|proc\.?)(?:\s+of)?(?:\s+the)?\s+/i, "");
    }
    s = s.replace(ORDINAL, " ");
    s = s.replace(/^[\s,;:(\-–]*(?:(?:19|20)\d{2})[\s,;:)\-–]*/, "");
    s = s.replace(/[\s,;:(\-–]*(?:(?:19|20)\d{2})[\s,;:)\-–]*$/, "");
    s = s.replace(/\s\s+/g, " ").replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, "");
    return s || bounded(name).trim();
};

/** Find known conferences mentioned inside a string; returns the chosen entry or null. */
const findInside = (str, pickLast) => {
    const w = words(str);
    const hits = [];
    for (const { entry, words: kw } of SEARCH) {
        for (let i = 0; i + kw.length <= w.length; i++) {
            if (kw.every((x, j) => w[i + j] === x)) {
                hits.push({ entry, start: i, end: i + kw.length });
            }
        }
    }
    // drop hits contained in a longer hit (e.g. ACL inside the NAACL long name)
    const kept = hits.filter(
        (h) =>
            !hits.some(
                (o) =>
                    o !== h &&
                    o.start <= h.start &&
                    o.end >= h.end &&
                    o.end - o.start > h.end - h.start,
            ),
    );
    if (!kept.length) return null;
    kept.sort((a, b) => (pickLast ? b.start - a.start : a.start - b.start));
    return kept[0].entry;
};

/**
 * Resolve a venue string.
 * @param {string} name
 * @param {Record<string,string>} [journals] miniHash(full journal name) -> abbreviation
 * @returns {{kind: "conference"|"workshop"|"findings"|"journal"|"unknown", text: string, entry?: object, cleaned: string}}
 */
export const resolveVenue = (name, journals = journalShortNames) => {
    const cleaned = clean(name);
    const exact = (s) => INDEX.get(key(s));

    let entry = exact(cleaned);
    if (entry) return { kind: "conference", text: entry.abbr, entry, cleaned };

    if (/\bworkshops?\b/i.test(cleaned)) {
        entry = findInside(cleaned, false);
        if (entry)
            return { kind: "workshop", text: `${entry.abbr} Workshop`, entry, cleaned };
    }
    if (/\bfindings\b/i.test(cleaned)) {
        entry = findInside(cleaned, true);
        if (entry)
            return {
                kind: "findings",
                text: `Findings of ${entry.abbr}`,
                entry,
                cleaned,
            };
    }

    const parts = cleaned.split(/[,;:()\[\]]|\s[-–]\s/).map((p) => clean(p));
    if (parts.length > 1) {
        for (const p of parts) {
            entry = p && exact(p);
            if (entry) return { kind: "conference", text: entry.abbr, entry, cleaned };
        }
    }

    const journal = journals?.[hash(cleaned)];
    if (journal) return { kind: "journal", text: journal.trim(), cleaned };

    return { kind: "unknown", text: cleaned, cleaned };
};

/**
 * Short form of a venue name: known conference abbreviation, else journal abbreviation,
 * else the cleaned name. Never invents abbreviations.
 * @param {string} name
 * @param {Record<string,string>} [journals]
 * @returns {string}
 */
export const abbreviateVenue = (name, journals = journalShortNames) =>
    name ? resolveVenue(name, journals).text : "";

/**
 * Display forms for a paper's venue. Year comes from the venue string if present, else paper.year,
 * and is never duplicated. The full form is, in order: the full name kept when the venue was
 * abbreviated at match time (paper.venueFull), the known conference's name, the full name of a
 * stored journal abbreviation ("Nat. Commun." -> "Nature Communications"), the cleaned name.
 * @param {{venue?: string, venueFull?: string, year?: string|number}} paper
 * @param {Record<string,string>} [journals] miniHash(full journal name) -> abbreviation
 * @param {Record<string,string>} [fullNames] miniHash(journal abbreviation) -> full name
 * @returns {{short: string, full: string}} e.g. { short: "ICML 2023", full: "International Conference on Machine Learning (ICML) 2023" }
 */
export const formatVenue = (
    paper,
    journals = journalShortNames,
    fullNames = journalAbbreviations,
) => {
    const venue = bounded(paper?.venue).trim();
    if (!venue) return { short: "", full: "" };
    const r = resolveVenue(venue, journals);
    const year = (venue.match(YEAR)?.[0] ?? String(paper.year ?? "")).trim();
    const withYear = (s) => (YEAR.test(s) ? s : [s, year].filter(Boolean).join(" "));
    const kept = typeof paper.venueFull === "string" ? clean(paper.venueFull) : "";
    const full =
        kept ||
        (r.kind === "conference" && r.entry
            ? `${r.entry.names[0]} (${r.entry.abbr})`
            : (r.kind === "unknown" && fullNames?.[hash(r.cleaned)]?.trim()) || r.cleaned);
    return { short: withYear(r.text), full: withYear(full) };
};

// ----- Semantic Scholar -----

/**
 * A plausible acronym from S2 `publicationVenue.alternate_names`: a name resolving to a known
 * conference (-> canonical abbr), else a short mostly-uppercase token of 2-8 letters.
 * @param {{alternate_names?: string[]}|null|undefined} publicationVenue
 * @returns {string|null}
 */
export const acronymFromPublicationVenue = (publicationVenue) => {
    const alternates = publicationVenue?.alternate_names;
    // anything but an array (null, a string, an object…) counts as no alternate names
    const names = (Array.isArray(alternates) ? alternates : [])
        .filter((n) => typeof n === "string")
        .map((n) => n.trim());
    for (const n of names) {
        const entry = INDEX.get(key(n));
        if (entry) return entry.abbr;
    }
    for (const n of names) {
        if (!/^[A-Za-z][A-Za-z0-9&]{1,7}$/.test(n)) continue;
        const letters = n.replace(/[^A-Za-z]/g, "");
        const upper = letters.replace(/[^A-Z]/g, "").length;
        if (letters.length >= 2 && upper >= 2 && upper * 2 >= letters.length) return n;
    }
    return null;
};

/**
 * Venue to store for a Semantic Scholar match: publicationVenue acronym when plausible, else the
 * previous logic (strip leading year, uppercase single words) run through abbreviateVenue.
 * Workshops and "Findings of …" keep their qualifier: the acronym alone would hide it
 * ("Findings of EMNLP", never "EMNLP").
 * @param {{venue: string, publicationVenue?: object}} match
 * @param {Record<string,string>} [journals]
 * @returns {string}
 */
export const semanticScholarVenue = (match, journals = journalShortNames) => {
    let venue = match.venue
        .trim()
        .replace(/^\d{4}/, "")
        .trim();
    venue = bounded(venue);
    const acronym = acronymFromPublicationVenue(match.publicationVenue);
    const workshop = /workshop/i.test(venue);
    const findings = /\bfindings\b/i.test(venue);
    if (acronym && !workshop && !findings) return acronym;
    const r = venue ? resolveVenue(venue, journals) : { kind: "unknown", text: "" };
    if (findings && r.kind !== "findings" && acronym) return `Findings of ${acronym}`;
    const short = r.text;
    if (short === venue && venue.indexOf(" ") < 0) return venue.toUpperCase();
    return short;
};

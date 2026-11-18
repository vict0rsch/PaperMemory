// Preprint / publication discovery helpers (used by paper.js, background, bibMatcher, options).
import {
    log,
    info,
    logError,
    miniHash,
    firstNonStopLowercase,
    sendMessageToBackground,
    silentPromiseTimeout,
} from "@pmu/functions.js";
import { journalAbbreviations } from "@pmu/config.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchJSON } from "@pmu/parsers.js";
import { readJournalAbbreviations } from "@pmu/state.js";
import { semanticScholarVenue, abbreviateVenue } from "@pmu/venues.js";

// -------------------------------
// -----  PREPRINT MATCHING  -----
// -------------------------------

/**
 * A title compared loosely: lowercase letters (any script, accents dropped by NFKD) and
 * digits only
 */
export const titleKey = (title) =>
    String(title ?? "")
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, "");

/** Same title, never for empty keys (a title made of punctuation only matches nothing) */
const sameTitle = (a, b) => {
    const key = titleKey(a);
    return !!key && key === titleKey(b);
};

/** Year of a match as a string ("" when unknown) */
const yearOf = (y) => (Number(y) ? String(Number(y)) : "");

/** Whether a publication year is close enough to the preprint's (when both are known) */
const closeYear = (year, paper) =>
    !Number(paper.year) || !Number(year) || Math.abs(year - paper.year) < 3;

/**
 * The paper's BibTeX as published: its own entry (key, title, authors) with the venue as
 * journal or booktitle, the publication year and DOI; preprint-only fields removed.
 * @param {object} paper A stored paper (its `bibtex` string) or a parsed BibTeX entry
 *   ({entryType, citationKey, title, …}: BibMatcher)
 * @param {{venue: string, year?: string|number, doi?: string, proceedings?: boolean, source?: string}} pub
 * @returns {string | undefined} undefined when the paper's BibTeX cannot be read
 */
/**
 * Plain text made safe in a BibTeX value: & % $ # _ { } ~ ^ \ escaped, escapes already
 * there ("\&", "\{") kept as they are
 * @param {string} text
 * @returns {string}
 */
export const bibtexEscape = (text) =>
    String(text ?? "").replace(/\\[&%$#_{}~^\\]|[&%$#_{}~^\\]/g, (m) =>
        m.length === 2
            ? m
            : ({
                  "~": "\\textasciitilde{}",
                  "^": "\\textasciicircum{}",
                  "\\": "\\textbackslash{}",
              }[m] ?? `\\${m}`),
    );

/** What a DOI must look like to be stored or put in BibTeX */
const DOI_PATTERN = /^10\.\d{4,9}\/[^\s{}\\]+$/;

/**
 * A DOI from a remote API, without its https://doi.org/ prefix; undefined when it is not a
 * DOI (it would otherwise go unescaped into BibTeX and into the stored paper)
 * @param {unknown} doi
 * @returns {string | undefined}
 */
export const validDoi = (doi) => {
    if (typeof doi !== "string") return undefined;
    const value = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
    return DOI_PATTERN.test(value) ? value : undefined;
};

/**
 * DOIs of preprint servers: arXiv (10.48550), bioRxiv / medRxiv (10.1101 followed by digits
 * and dots only: Cold Spring Harbor's journals, e.g. 10.1101/gr.…, are publications), ChemRxiv
 * (10.26434)
 */
const PREPRINT_DOI = /^10\.(48550\/|1101\/[\d.]+$|26434\/)/i;

/**
 * Whether a record found while matching is a preprint (arXiv, bioRxiv, medRxiv, ChemRxiv…):
 * its venue names a *rxiv server, its DOI is a preprint server's, or its type says so
 * (CrossRef "posted-content", OpenAlex "preprint"). A preprint is never its own published
 * version.
 * @param {{venue?: unknown, doi?: unknown, type?: unknown}} record
 * @returns {boolean}
 */
export const isPreprintRecord = ({ venue, doi, type } = {}) =>
    /rxiv/i.test(String(venue ?? "")) ||
    PREPRINT_DOI.test(validDoi(doi) ?? "") ||
    /^(posted-content|preprint)$/i.test(String(type ?? "").trim());

/** validDoi, except a preprint server's DOI: the preprint's, not the publication's */
const publishedDoi = (doi) => {
    const value = validDoi(doi);
    return value && !PREPRINT_DOI.test(value) ? value : undefined;
};

/**
 * The bibSource field's text ("DBLP https://…"): no { } \ or line breaks, which would
 * break out of the BibTeX value
 * @param {unknown} source
 * @returns {string}
 */
export const bibSourceText = (source) =>
    String(source ?? "")
        .replace(/[{}\\\r\n\u2028\u2029]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

export const publishedBibtex = (paper, { venue, year, doi, proceedings, source }) => {
    try {
        const bib =
            typeof paper.bibtex === "string"
                ? bibtexToObject(paper.bibtex)
                : paper.entryType && paper.citationKey
                  ? { ...paper }
                  : null;
        if (!bib) return undefined;
        for (const [key, value] of Object.entries(bib)) {
            if (/^(entryType|citationKey|title|author|url)$/.test(key)) continue;
            if (
                /^(journal|booktitle|eprint|archiveprefix|primaryclass|note)$/i.test(
                    key,
                ) ||
                /\b(arxiv|biorxiv|medrxiv|chemrxiv)\b/i.test(String(value)) ||
                // the preprint's DOI (a bioRxiv entry's doi field)
                PREPRINT_DOI.test(validDoi(value) ?? "")
            )
                delete bib[key];
        }
        bib.entryType = proceedings ? "inproceedings" : "article";
        // the venue is plain text (an API's), the rest of the entry is BibTeX already
        bib[proceedings ? "booktitle" : "journal"] = bibtexEscape(venue);
        if (year) bib.year = String(year);
        doi = validDoi(doi);
        source = bibSourceText(source);
        if (doi) bib.doi = doi;
        if (source) bib.bibSource = source;
        return bibtexToString(bib);
    } catch (error) {
        return undefined;
    }
};

/** How long a matching request may take before it is aborted (ms) */
export const MATCH_TIMEOUT = 15000;

/** fetch options with a deadline: the request is aborted after MATCH_TIMEOUT */
const withDeadline = (options = {}) => ({
    ...options,
    signal: AbortSignal.timeout(MATCH_TIMEOUT),
});

/** fetchJSON, tried once more after a short wait when the API answers 429 (rate limit) */
const fetchJSONRetry = async (url, options, wait = 1500) => {
    let response = await fetchJSON(url, withDeadline(options));
    if (response.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, wait));
        response = await fetchJSON(url, withDeadline(options));
    }
    return response;
};

// --------------------------------------------
// -----  Try CrossRef's API for a match  -----
// --------------------------------------------

/**
 * Looks for a title in crossref's database, querying titles and looking for an exact match. If no
 * exact match is found, it will return an empty note "". If a match is found and `item.event.name`
 * exists, it will be used for a new note.
 * @param {object} paper The paper to look for in crossref's database for an exact title match
 * @returns {string} The note for the paper as `Accepted @ ${items.event.name} -- [crossref.org]`
 */
export const tryCrossRef = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-cross-ref", paper });
    }
    try {
        // the 5 best title matches: the published version is not always the first one
        const api = `https://api.crossref.org/works?rows=5&mailto=schmidtv%40mila.quebec&select=event%2Ctitle%2Cissued%2Ctype%2CDOI&query.title=${encodeURIComponent(
            paper.title,
        )}`;
        const response = await fetch(api, withDeadline());
        const status = response.status;
        if (!response.ok) {
            log(`[Crossref] ${api} returned ${status}`);
            return { status };
        }
        const json = await response.json();

        // the event's year, else the publication's
        const itemYear = (it) =>
            yearOf(
                it.event?.start?.["date-parts"]?.[0]?.[0] ??
                    it.issued?.["date-parts"]?.[0]?.[0],
            );
        // an exact title match, with an event (a conference; journals have none), in the
        // same years as the preprint, and not a preprint (posted-content: bioRxiv…)
        const items = json.message?.items;
        const item = (Array.isArray(items) ? items : []).find(
            (it) =>
                it &&
                typeof it === "object" &&
                sameTitle(it.title?.[0], paper.title) &&
                typeof it.event?.name === "string" &&
                it.event.name.trim() &&
                !isPreprintRecord({
                    venue: it.event.name,
                    doi: it.DOI,
                    type: it.type,
                }) &&
                closeYear(itemYear(it), paper),
        );
        if (!item) return { status };

        info("Found a CrossRef match");
        const venue = item.event.name.trim();
        const year = itemYear(item);
        const note = `Accepted @ ${venue} -- [crossref.org]`;
        const bibtex = publishedBibtex(paper, {
            venue,
            year,
            proceedings: true,
            source: "CrossRef",
        });
        return { venue, note, bibtex, year: year || undefined, status };
    } catch (error) {
        // something went wrong, log the error, return {}
        logError("[Crossref]", error);
        return {};
    }
};

// ----------------------------------------
// -----  Try DBLP's data for a match  -----
// ----------------------------------------

// dblp.org's search API and record pages answer a bot challenge page (Anubis) to programs
// since 2026: the SPARQL endpoint (QLever) has the same data and answers JSON.
const DBLP_SPARQL = "https://sparql.dblp.org/sparql";

/**
 * The SPARQL query: titles containing the 3 longest words of the paper's title (QLever's
 * text index, fast), then the exact title (letters and digits, case-insensitive)
 * @param {string} title
 * @returns {string}
 */
/** The SPARQL filter's key (ASCII letters and digits); titleKey checks the hits after */
const asciiKey = (title) => title.toLowerCase().replace(/[^a-z0-9]/g, "");

/** DBLP's volume / track qualifiers, not part of the venue: "NAACL-HLT (1)", "ICLR (Poster)" */
const DBLP_TRACK =
    /\s*\((\d+|Poster|Posters|Oral|Spotlight|Short Papers|Long Papers|Demo|Demos|Main)\)$/i;

/**
 * A DBLP venue as stored: track qualifiers dropped, "ICLR (Workshop)" → "ICLR Workshop"
 * @param {string} name
 * @returns {string}
 */
export const dblpVenueName = (name) =>
    name
        .trim()
        .replace(DBLP_TRACK, "")
        .replace(/\s*\((Workshops?)\)$/i, " $1")
        .trim();

export const dblpQuery = (title) => {
    const words = [...new Set(title.toLowerCase().match(/[a-z0-9]+/g) ?? [])]
        .sort((a, b) => b.length - a.length)
        .slice(0, 3)
        .join(" ");
    return `PREFIX dblp: <https://dblp.org/rdf/schema#>
PREFIX ql: <http://qlever.cs.uni-freiburg.de/builtin-functions/>
SELECT ?p ?title ?venue ?year ?type ?doi WHERE {
  ?text ql:contains-entity ?title . ?text ql:contains-word "${words}" .
  ?p dblp:title ?title . ?p dblp:yearOfPublication ?year .
  OPTIONAL { ?p dblp:publishedIn ?venue } OPTIONAL { ?p dblp:bibtexType ?type } OPTIONAL { ?p dblp:doi ?doi }
  FILTER(REPLACE(LCASE(STR(?title)), "[^a-z0-9]", "") = "${asciiKey(title)}")
} LIMIT 20`;
};

export const tryDBLP = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-dblp", paper });
    }
    try {
        if (!titleKey(paper.title) || !asciiKey(paper.title)) return {};
        const { data, status } = await fetchJSONRetry(
            `${DBLP_SPARQL}?query=${encodeURIComponent(dblpQuery(paper.title))}`,
            { headers: { Accept: "application/sparql-results+json" } },
        );
        if (status === 429) return { status };
        const text = (v) => (typeof v?.value === "string" ? v.value.trim() : "");
        const bindings = data?.results?.bindings;
        const hits = (Array.isArray(bindings) ? bindings : [])
            // a malformed record is skipped, not the whole answer
            .filter((b) => b && typeof b === "object")
            .map((b) => ({
                url: text(b.p),
                title: text(b.title),
                venue: text(b.venue),
                year: yearOf(text(b.year)),
                proceedings: /Inproceedings$/i.test(text(b.type)),
                doi: publishedDoi(text(b.doi)) ?? "",
                // the venue only: DBLP gives ICLR papers their arXiv DOI
                preprint: isPreprintRecord({ venue: text(b.venue) }),
            }))
            // CoRR: the arXiv version itself
            .filter(
                (h) =>
                    h.venue &&
                    h.venue !== "CoRR" &&
                    !h.preprint &&
                    h.year &&
                    sameTitle(h.title, paper.title) &&
                    closeYear(h.year, paper),
            )
            .sort((a, b) => Number(a.year) - Number(b.year));
        const hit = hits[0];
        if (!hit) return { status };

        info("Found a DBLP match");
        await readJournalAbbreviations().catch(() => {});
        const name = dblpVenueName(hit.venue);
        const venue = (
            journalAbbreviations[miniHash(name)] ?? abbreviateVenue(name)
        ).trim();
        const year = hit.year;
        const note = `Accepted @ ${venue} ${year} -- [dblp.org]`;
        const bibtex = publishedBibtex(paper, {
            venue,
            year,
            doi: hit.doi,
            proceedings: hit.proceedings,
            source: `DBLP ${hit.url}`,
        });
        // DBLP's own citation key (what its .bib used): BibMatcher's "new key" option
        // (a remote value: only characters a BibTeX key can hold)
        const citationKey = hit.url.match(/\/rec\/([\w./:-]+)$/)?.[1];
        return {
            venue,
            note,
            bibtex,
            year,
            doi: hit.doi || undefined,
            citationKey: citationKey ? `DBLP:${citationKey}` : undefined,
            status,
        };
    } catch (error) {
        // something went wrong, log the error, return {}
        logError("[DBLP]", error);
        return {};
    }
};

export const trySemanticScholar = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({
            type: "try-semantic-scholar",
            paper,
        });
    }
    try {
        const { data, status } = await fetchJSONRetry(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
                paper.title,
            )}&fields=title,venue,year,authors,externalIds,url,publicationVenue&limit=5`,
        );
        const matches = data;

        if (matches && Array.isArray(matches.data) && matches.data.length > 0) {
            for (const match of matches.data) {
                if (
                    match &&
                    typeof match === "object" &&
                    sameTitle(match.title, paper.title) &&
                    Math.abs(match.year - paper.year) < 3 &&
                    typeof match.venue === "string" &&
                    match.venue.trim() &&
                    // arXiv, bioRxiv, medRxiv, ChemRxiv: the preprint itself
                    !isPreprintRecord({ venue: match.venue }) &&
                    !isPreprintRecord({ venue: match.publicationVenue?.name }) &&
                    // a preprint server's DOI: a publication only when Semantic Scholar
                    // knows its journal or conference (NeurIPS papers keep their arXiv DOI;
                    // a bioRxiv record's venue is "Cold Spring Harbor Laboratory")
                    (!isPreprintRecord({ doi: match.externalIds?.DOI }) ||
                        ["journal", "conference"].includes(
                            match.publicationVenue?.type,
                        ))
                ) {
                    info("Found a Semantic Scholar match");
                    await readJournalAbbreviations().catch(() => {});
                    const venue = semanticScholarVenue(match);
                    // the full name, kept when the stored venue is an abbreviation (Info panel)
                    const fullName = match.venue
                        .trim()
                        .replace(/^\d{4}/, "")
                        .trim();
                    const venueFull = fullName !== venue ? fullName : undefined;
                    const year = (match.year + "").trim();
                    const note = `Accepted @ ${venue} (${year}) -- [semanticscholar.org]`;
                    const authors = (match.authors ?? [])
                        .map((a) => a.name)
                        .join(" and ");
                    const doi = publishedDoi(match.externalIds?.DOI);
                    // the key Semantic Scholar matches get: BibMatcher's "new key"
                    const citationKey =
                        miniHash(
                            (match.authors?.[0]?.name ?? paper.author ?? "")
                                .split(" ")
                                .last(),
                        ) +
                        year +
                        firstNonStopLowercase(paper.title);
                    // the paper's own entry (its citation key kept), else one built here
                    const bibtex =
                        publishedBibtex(paper, {
                            venue,
                            year,
                            doi,
                            source: `Semantic Scholar ${match.url}`,
                        }) ??
                        bibtexToString({
                            entryType: "article",
                            citationKey,
                            title: paper.title,
                            author: authors || paper.author,
                            journal: bibtexEscape(venue),
                            year,
                            doi,
                            bibSource: bibSourceText(`Semantic Scholar ${match.url}`),
                        });
                    return {
                        venue,
                        venueFull,
                        note,
                        bibtex,
                        year,
                        doi,
                        citationKey,
                        status,
                    };
                }
            }
        }
        return { status };
    } catch (error) {
        logError("[SemanticScholar]", error);
    }
    return { status: 404 };
};

export const tryGoogleScholar = async (paper) => {
    const resp = await sendMessageToBackground({
        type: "google-scholar",
        paper,
    });
    resp?.note && info("Found a Google Scholar match", resp.note);
    return resp ?? {};
};

// Unpaywall's title search was retired on 2026-09-18 (HTTP 410): OpenAlex, from the same
// team and on the same data, replaces it.
const OPENALEX_PUBLISHED = new Set(["journal", "conference"]);

export const tryOpenAlex = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-openalex", paper });
    }
    try {
        // "," and "|" separate filter values: not part of the searched title
        const query = encodeURIComponent(paper.title.replace(/[,|]/g, " "));
        const { data, status } = await fetchJSONRetry(
            `https://api.openalex.org/works?filter=title.search:${query}&per_page=10&select=id,doi,display_name,publication_year,type,primary_location`,
        );
        const results = data?.results;
        const match = (Array.isArray(results) ? results : []).find((work) => {
            // a malformed record is skipped, not the whole answer
            if (!work || typeof work !== "object") return false;
            const source = work.primary_location?.source;
            return (
                typeof source?.display_name === "string" &&
                sameTitle(work.display_name, paper.title) &&
                !isPreprintRecord({
                    venue: source.display_name,
                    doi: work.doi,
                    type: work.type,
                }) &&
                OPENALEX_PUBLISHED.has(source?.type) &&
                closeYear(work.publication_year, paper)
            );
        });
        if (!match) return { status };

        info("Found an OpenAlex match");
        await readJournalAbbreviations().catch(() => {});
        const source = match.primary_location.source;
        // some sources have several names: "IEEE … Pattern Recognition/Proceedings - IEEE …"
        const names = source.display_name.split("/").map((n) => n.trim());
        const fullName = names[0].length >= 10 ? names[0] : source.display_name.trim();
        const venue = abbreviateVenue(fullName) || fullName;
        const venueFull = venue !== fullName ? fullName : undefined;
        const year = yearOf(match.publication_year);
        const doi = validDoi(match.doi) ?? "";
        const note = `Accepted @ ${venue}${year ? ` (${year})` : ""} -- [openalex.org]`;
        const bibtex = publishedBibtex(paper, {
            venue,
            year,
            doi,
            proceedings: source.type === "conference",
            source: `OpenAlex ${match.id}`,
        });
        return {
            venue,
            venueFull,
            note,
            bibtex,
            year: year || undefined,
            doi: doi || undefined,
            status,
        };
    } catch (error) {
        logError("[OpenAlex]", error);
        return {};
    }
};

export const tryPreprintMatch = async (paper) => {
    let note, venue, venueFull, bibtex, doi;
    let matches = {};

    let names = ["GoogleScholar", "SemanticScholar", "CrossRef", "DBLP", "OpenAlex"];
    let matchPromises = [
        silentPromiseTimeout(tryGoogleScholar(paper)),
        silentPromiseTimeout(trySemanticScholar(paper, true)),
        silentPromiseTimeout(tryCrossRef(paper)),
        silentPromiseTimeout(tryDBLP(paper)),
        silentPromiseTimeout(tryOpenAlex(paper)),
    ];

    for (const [n, name] of Object.entries(names)) {
        matches[name] = await matchPromises[n];
        ({ note, venue, venueFull, bibtex, doi } = matches[name] ?? {});
        if (note) {
            break;
        } else {
            log(`[${name}] No publication found`);
        }
    }

    return { note, venue, venueFull, bibtex, doi };
};

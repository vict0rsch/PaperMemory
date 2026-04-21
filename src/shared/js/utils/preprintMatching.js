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
import { getStorage } from "@pmu/data.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchJSON, fetchText } from "@pmu/parsers.js";
import { readJournalAbbreviations } from "@pmu/state.js";

export const decodeHtml = (html) => {
    // https://stackoverflow.com/questions/5796718/html-entity-decode
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

// -------------------------------
// -----  PREPRINT MATCHING  -----
// -------------------------------

export const tryPWCMatch = async (paper) => {
    const pwcPrefs = (await getStorage("pwcPrefs")) ?? {};
    let bibtex;
    const payload = {
        type: "papersWithCode",
        pwcPrefs,
        paper: paper,
    };
    const { url, note, venue, pubYear } =
        (await sendMessageToBackground(payload)) ?? {};
    if (url && !paper.codeLink) {
        log("[PapersWithCode] Discovered a code repository:", url);
    } else {
        log("[PapersWithCode] No code repository found");
    }
    if (venue && !paper.venue) {
        log("[PapersWithCode] Found a publication venue:", venue);
        const paperBib = bibtexToObject(paper.bibtex);
        bibtex = bibtexToString({
            ...paperBib,
            year: pubYear,
            journal: venue,
        });
    } else if (!paper.venue) {
        log("[PapersWithCode] No publication found");
    }

    return {
        codeLink: url,
        note,
        venue,
        bibtex,
    };
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
        // fetch crossref' api for the paper's title
        const title = encodeURI(paper.title);
        const api = `https://api.crossref.org/works?rows=1&mailto=schmidtv%40mila.quebec&select=event%2Ctitle&query.title=${title}`;
        const json = await fetch(api).then((response) => response.json());

        // assert the response is valid
        if (json.status !== "ok") {
            log(`[Crossref] ${api} returned ${json.message.status}`);
            return {};
        }
        // assert there is a (loose) match
        if (json.message.items.length === 0) return {};

        // compare matched item's title to the paper's title
        const crossTitle = json.message.items[0].title[0]
            ?.toLowerCase()
            .replaceAll("\n", " ")
            .replaceAll(/\s\s+/g, " ");
        const refTitle = paper.title
            .toLowerCase()
            .replaceAll("\n", " ")
            .replaceAll(/\s\s+/g, " ");
        if (crossTitle !== refTitle) {
            return {};
        }

        // assert the matched item has an event with a name
        // (this may be too restrictive for journals, to improve)
        if (!json.message.items[0].event || !json.message.items[0].event.name) {
            return {};
        }

        // return the note
        info("Found a CrossRef match");
        const venue = json.message.items[0].event.name.trim();
        const note = `Accepted @ ${venue} -- [crossref.org]`;
        return { venue, note };
    } catch (error) {
        // something went wrong, log the error, return {}
        logError("[Crossref]", error);
        return {};
    }
};

export const tryDBLP = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-dblp", paper });
    }
    try {
        const title = encodeURI(paper.title);
        const api = `https://dblp.org/search/publ/api?q=${title}&format=json`;
        const response = await fetch(api);

        if (response.status === 429) {
            return { status: 429 };
        }

        const json = await response.json();

        if (
            !json.result ||
            !json.result.hits ||
            !json.result.hits.hit ||
            !json.result.hits.hit.length
        ) {
            return {};
        }

        const hits = json.result.hits.hit.sort(
            (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10),
        );

        for (const hit of hits) {
            const hitTitle = decodeHtml(
                hit.info.title
                    ?.toLowerCase()
                    .replaceAll("\n", " ")
                    .replaceAll(".", "")
                    .replaceAll(/\s\s+/g, " "),
            );
            const refTitle = paper.title
                .toLowerCase()
                .replaceAll("\n", " ")
                .replaceAll(".", "")
                .replaceAll(/\s\s+/g, " ");
            if (hitTitle === refTitle && hit.info.venue !== "CoRR") {
                info("Found a DBLP match");
                const bibtex = await fetchText(hit.info.url + ".bib");
                const abbr = miniHash(hit.info.venue);
                await readJournalAbbreviations();
                const venue = (journalAbbreviations[abbr] ?? hit.info.venue).trim();
                const year = hit.info.year;
                const url = hit.info.url;
                const note = `Accepted @ ${venue} ${year} -- [dblp.org]`;
                return { venue, note, bibtex };
            }
        }
        return {};
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
        const { data, status } = await fetchJSON(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURI(
                paper.title,
            )}&fields=title,venue,year,authors,externalIds,url&limit=5`,
        );
        const matches = data;

        if (matches && matches.data && matches.data.length > 0) {
            for (const match of matches.data) {
                if (
                    miniHash(match.title) === miniHash(paper.title) &&
                    Math.abs(match.year - paper.year) < 3 &&
                    match.venue &&
                    !match.venue.toLowerCase().includes("arxiv") &&
                    !match.venue.toLowerCase().includes("biorxiv")
                ) {
                    info("Found a Semantic Scholar match");
                    let venue = match.venue
                        .trim()
                        .replace(/^\d{4}/, "")
                        .trim();
                    if (venue.indexOf(" ") < 0) venue = venue.toUpperCase();
                    const year = (match.year + "").trim();
                    const note = `Accepted @ ${venue} (${year}) -- [semanticscholar.org]`;
                    const authors = match.authors.map((a) => a.name).join(" and ");
                    let doi = match.externalIds.DOI;
                    // if (doi) {
                    //     doi = doi.replaceAll("_", "\\{_}");
                    // }
                    const bibtex = bibtexToString({
                        entryType: "article",
                        citationKey:
                            miniHash(match.authors[0].name.split(" ").last()) +
                            year +
                            firstNonStopLowercase(paper.title),
                        title: paper.title,
                        author: authors,
                        journal: venue,
                        year,
                        doi,
                        bibSource: `Semantic Scholar ${match.url}`,
                    });
                    return { venue, note, bibtex, status };
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
    resp.note && info("Found a Google Scholar match", resp.note);
    return resp;
};

export const tryUnpaywall = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-unpaywall", paper });
    }
    const url = `https://api.unpaywall.org/v2/search?query=${encodeURI(
        paper.title,
    )}&is_oa=true&email=papermemory+${parseInt(Math.random() * 1000)}@gmail.com`;
    const { data, status } = await fetchJSON(url);
    if (data && status === 200) {
        const match = data.results?.find(
            (m) => miniHash(m.response.title) === miniHash(paper.title),
        );
        if (match && match.journal_name) {
            const venue = match.journal_name;
            const note = `Accepted @ ${venue} (${match.year}) -- [unpaywall.org]`;
            const doi = match.doi;
            return { venue, note, doi };
        }
    }
    return { status };
};

export const tryPreprintMatch = async (paper, tryPwc = false) => {
    let note, venue, bibtex, code, doi;
    let matches = {};

    let names = ["GoogleScholar", "SemanticScholar", "CrossRef", "DBLP", "Unpaywall"];
    let matchPromises = [
        silentPromiseTimeout(tryGoogleScholar(paper)),
        silentPromiseTimeout(trySemanticScholar(paper, true)),
        silentPromiseTimeout(tryCrossRef(paper)),
        silentPromiseTimeout(tryDBLP(paper)),
        silentPromiseTimeout(tryUnpaywall(paper)),
    ];

    if (tryPwc) {
        matchPromises.push(silentPromiseTimeout(tryPWCMatch(paper)));
        names.push("PapersWithCode");
    }

    for (const [n, name] of Object.entries(names)) {
        matches[name] = await matchPromises[n];
        ({ note, venue, bibtex, doi } = matches[name] ?? {});
        if (note) {
            break;
        } else {
            log(`[${name}] No publication found`);
        }
    }

    if (tryPwc) {
        const name = "PapersWithCode";
        if (!matches.hasOwnProperty(name)) {
            matches[name] = await silentPromiseTimeout(matchPromises[name]);
        }
        if (matches[name].codeLink && !paper.codeLink) {
            code = matches[name].codeLink;
        }
    }

    return { note, venue, bibtex, code, doi };
};

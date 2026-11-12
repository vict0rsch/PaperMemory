// ES Module imports
import {
    log,
    info,
    warn,
    miniHash,
    sendMessageToBackground,
    firstNonStopLowercase,
    isPdfUrl,
    noParamUrl,
    parseUrl,
    spaceCamelCase,
    logError,
    toSingleSpace,
    parseCVFUrl,
} from "@pmu/functions.js";
import { state, journalAbbreviations } from "@pmu/config.js";
import {
    extractBibtexValue,
    bibtexToString,
    bibtexToObject,
} from "@pmu/bibtexParser.js";
import { queryAll, querySelector } from "@pmu/miniquery.js";
import { readJournalAbbreviations } from "@pmu/state.js";

export const flipAuthor = (author) => author.split(", ").reverse().join(" ");

export const flipAndAuthors = (authors) =>
    authors.split(" and ").map(flipAuthor).join(" and ");

export const fetchDom = async (url) => {
    const html = await fetch(url).then((response) =>
        response.ok ? response.text() : "",
    );
    return new DOMParser().parseFromString(html.replaceAll("\n", ""), "text/html");
};

export const fetchText = async (url) => {
    try {
        const response = await fetch(url);
        const text = response.ok ? await response.text() : "";
        return text.trim();
    } catch (error) {
        logError("fetchText error:", error);
        return "";
    }
};

export const fetchJSON = async (url) => {
    try {
        const response = await fetch(url);
        const status = response.status;
        const data = response.ok ? await response.json() : null;
        return { data, status };
    } catch (error) {
        logError("fetchJSON error:", error);
        return {};
    }
};

/**
 * Fetches a bibtex string from a url or doi and converts it to a paper object.
 * @param {Object} options - The options object. Either `url` or `doi` must be provided, but not both.
 * @param {string} options.url - The url to fetch the bibtex from.
 * @param {string} options.doi - The doi to fetch the bibtex from.
 * @param {boolean} [options.flipAuthors=false] - Whether to flip "Last, First" to "First Last".
 * @returns {Object} The paper object. Typically does not contain the `id` and `pdfLink` keys.
 */
export const fetchBibtexToPaper = async ({ url, doi, flipAuthors = false }) => {
    let bibtex;
    if (url && doi) {
        throw new Error("fetchBibtexToPaper: both url and doi provided");
    }
    if (doi) {
        bibtex = await fetchText(
            `https://citation.doi.org/format?doi=${doi}&style=bibtex&lang=en-US`,
        );
    } else if (url) {
        bibtex = await fetchText(url);
    } else {
        throw new Error("fetchBibtexToPaper: no url or doi provided");
    }
    const bibObj = bibtexToObject(bibtex);
    delete bibObj.abstract;
    bibtex = bibtexToString(bibObj);
    bibObj.bibtex = bibtex;
    bibObj.key = bibObj.citationKey;
    if (flipAuthors && bibObj.author) {
        bibObj.author = flipAndAuthors(bibObj.author);
    }
    const bibVenue = bibObj.journal || bibObj.booktitle || "";
    if (bibVenue) {
        bibObj.venue = bibVenue;
        bibObj.note = `Published @ ${bibVenue} (${bibObj.year})`;
    }
    return bibObj;
};

// -------------------
// -----  Parse  -----
// -------------------

export const extractCrossrefData = (crossrefResponse) => {
    if (!crossrefResponse.status || crossrefResponse.status !== "ok") {
        logError("Cannot parse CrossRef response", crossrefResponse);
        return;
    }
    if (crossrefResponse["message-type"] !== "work") {
        logError("Unknown `message-type` from CrossRef", crossrefResponse);
        return;
    }

    const data = crossrefResponse.message;
    log("Crossref data.message: ", data);

    const author = data.author.map((a) => `${a.given} ${a.family}`).join(" and ");

    const year = data.issued
        ? data.issued["date-parts"][0][0] + ""
        : data.published
          ? data.published["date-parts"][0][0] + ""
          : null;

    if (!year) {
        logError("Cannot find year in CrossRef data", data);
        return;
    }

    const title = data.title[0];

    if (!title) {
        logError("Cannot find title in CrossRef data", data);
        return;
    }

    const venue = data["container-title"][0] ?? "Springer";
    const key = [
        miniHash(data.author[0].family),
        year.slice(2),
        firstNonStopLowercase(title),
    ].join("");

    const doi = data.DOI;
    const entryType =
        data.type === "book"
            ? "book"
            : data.type === "book-chapter"
              ? "InBook"
              : data.type.includes("article")
                ? "Article"
                : "InProceedings";
    let bibData = {
        entryType,
        citationKey: key,
        publisher: data.publisher,
        author,
        title,
        year,
        doi,
    };
    if (data.page) {
        bibData.pages = data.page;
    }
    if (data.volume) {
        bibData.volume = data.volume;
    }
    if (data.type.includes("journal")) {
        bibData.journal = venue;
    }
    if (data.link && data.link.length > 0) {
        const pdf = data.link.find((l) => l["content-type"] === "application/pdf");
        if (pdf) {
            bibData.pdf = pdf.URL;
        }
        const url =
            data.link.find((l) => l["content-type"] === "text/html") ?? data.link[0];
        if (url) {
            bibData.url = url.URL;
        }
    }
    const bibtex = bibtexToString(bibData);

    return { ...bibData, bibtex, venue };
};

export const fetchCrossRefDataForDoi = async (doi) => {
    const { data, status } = await fetchJSON(
        `https://api.crossref.org/works/${doi}?mailto=schmidtv%40mila.quebec`,
    );
    return { data: extractCrossrefData(data), status };
};

// get all dc variations
const getDCPatterns = (value) => {
    const spec = value.slice(3);
    const lowers = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.toLowerCase());
    const caps = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.capitalize());
    return [...lowers, ...caps];
};

export const getMetaContent = ({
    selector,
    dom,
    all = false,
    pure = false,
    dcpattern = null,
}) => {
    let query = "";
    for (const [k, v] of Object.entries(selector)) {
        if (!/dc\W/.test(v.toLowerCase())) {
            // not a dc key
            query += `meta[${k}='${v}']`;
        } else {
            query += getDCPatterns(v)
                .map((dcp) => `meta[${k}='${dcp}']`)
                .join(",");
        }
    }
    if (all) {
        const candidate = queryAll(query, dom).map(
            (el) => el.getAttribute("content") ?? "",
        );
        if (pure) return candidate;
        return candidate.map(spaceCamelCase).map(toSingleSpace);
    }

    const candidate = dom.querySelector(query)?.getAttribute("content") ?? "";
    if (pure) return candidate;
    return toSingleSpace(spaceCamelCase(candidate));
};

export const extractDataFromDCMetaTags = (dom) => {
    let author =
        getMetaContent({
            selector: { name: "dc.Creator" },
            dom,
            all: true,
        }).join(" and ") ||
        getMetaContent({
            selector: { name: "citation_author" },
            dom,
            all: true,
        }).join(" and ");

    if (!author) {
        return null;
    }

    const year = (
        getMetaContent({
            selector: { name: "dc.Date" },
            dom,
        }) ||
        getMetaContent({
            selector: { name: "citation_publication_date" },
            dom,
        })
    )
        .split("-")[0] // account for YYYY-MM-DD
        .split("/")[0]; // account for YYYY/MM/DD

    const publisher =
        getMetaContent({
            selector: { name: "dc.Publisher" },
            dom,
        }).replaceAll("\n", " ") ||
        getMetaContent({
            selector: { property: "og:site_name" },
            dom,
            pure: true,
        });

    const title =
        getMetaContent({
            selector: { name: "dc.Title" },
            dom,
        }) ||
        getMetaContent({
            selector: { name: "citation_title" },
            dom,
        });

    const venue = getMetaContent({
        selector: { name: "citation_journal_title" },
        dom,
    });

    const pdfLink = getMetaContent({
        selector: { name: "citation_pdf_url" },
        dom,
        pure: true,
    });

    const doi =
        getMetaContent({
            selector: { scheme: "doi" },
            dom,
        }) ||
        getMetaContent({
            selector: { name: "citation_doi" },
            dom,
        });

    const key = `${author
        .split(" and ")[0]
        .split(" ")
        .find(
            (v, k) => k >= 1 && miniHash(v).length > 1, // ignore middle initials
        )}${year}${firstNonStopLowercase(title)}`.toLowerCase();
    const bibtex = bibtexToString({
        citationKey: key,
        entryType: "article",
        title,
        author,
        year,
        doi,
        publisher,
        journal: venue,
    });
    const note = venue ? `Published @ ${venue} (${year})` : "";

    return {
        author,
        year,
        publisher,
        title,
        venue,
        key,
        doi,
        bibtex,
        pdfLink,
        note,
    };
};

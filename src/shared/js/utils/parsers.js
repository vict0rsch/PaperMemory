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
export const fetchCvfHTML = async (url) => {
    let paperPage, text;
    if (url.endsWith(".pdf")) {
        paperPage = url
            .replace("/papers_backup/", "/papers/")
            .replace("/papers/", "/html/")
            .replace(".pdf", ".html");
    } else {
        paperPage = url;
    }

    text = await fetch(paperPage).then((response) => {
        return response.ok ? response.text() : "";
    });

    if (!text && paperPage.includes("thecvf.com/content_")) {
        const { conf, year } = parseCVFUrl(url);
        paperPage = paperPage.replace(
            `/content_${conf}_${year}/`,
            `/content_${conf.toLowerCase()}_${year}/`,
        );
        text = await fetch(paperPage).then((response) => {
            return response.ok ? response.text() : "";
        });
    }

    return text;
};

export const getOpenReviewNoteJSON = (url) => {
    return sendMessageToBackground({ type: "OpenReviewNoteJSON", url });
};

export const getOpenReviewForumJSON = (url) => {
    return sendMessageToBackground({ type: "OpenReviewForumJSON", url });
};

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

export const fetchBibtexToPaper = async ({ url, doi }) => {
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
    if (bibObj.journal) {
        bibObj.venue = bibObj.journal;
        bibObj.note = `Published in ${bibObj.journal} (${bibObj.year})`;
    }
    return bibObj;
};

// -------------------
// -----  Parse  -----
// -------------------

/**
 * Extract the author from a bibtex string, as an "and" separated list of names.
 * eg: "John Doe and Jane Doe"
 * @param {string} bibtex The bibtex string to extract the author from.
 * @returns {string} The author.
 */
export const extractAuthor = (bibtex) =>
    extractBibtexValue(bibtex, "author")
        .replaceAll("{", "")
        .replaceAll("}", "")
        .replaceAll("\\", "")
        .split(" and ")
        .map((a) => a.split(", ").reverse().join(" "))
        .join(" and ");

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

export const makeOpenReviewBibTex = (paper, url) => {
    const title = paper.content.title;
    const author = paper.content.authors.join(" and ");
    const year = paper.cdate ? new Date(paper.cdate).getFullYear() : "0000";
    if (!paper.cdate) {
        log("makeOpenReviewBibTex: no cdate found in", paper);
    }

    let key = paper.content.authors[0].split(" ").last();
    key += year;
    key += firstNonStopLowercase(title);

    let bibtex = "";
    bibtex += `@inproceedings{${key},\n`;
    bibtex += `    title={${title}},\n`;
    bibtex += `    author={${author}},\n`;
    bibtex += `    year={${year}},\n`;
    bibtex += `    url={${url}},\n`;
    bibtex += `}`;

    return bibtex;
};

/**
 * Extracts the value of the `value` key in the `content` object of a paper
 * returned by the OpenReview API v2.
 * Eg. v1: { content: { title: "My title" }
 * Eg. v2: { content: { title: { value: "My title" } }
 * @param {Object} paper - A paper returned by the OpenReview API v2 or v1.
 * @returns {Object} The paper with the `value` key extracted from the `content` object.
 */
export const extractAPIv2ContentValue = (paper) => {
    const content = {};
    let isV2 = false;
    for (const [k, v] of Object.entries(paper.content)) {
        if (v && v.value) {
            content[k] = v.value;
            isV2 = true;
        } else {
            content[k] = v;
        }
    }
    paper.content = content;
    return { isV2, paper };
};
export const findACLValue = (dom, key) => {
    const dt = queryAll("dt", dom).filter((v) => v.innerText.includes(key))[0];
    return dt.nextElementSibling.innerText;
};
export const parseAIPIdOrDOI = (url) => {
    if (isPdfUrl(noParamUrl(url))) {
        return {
            doi: noParamUrl(url)
                .split("/")
                .last()
                .split("_")
                .last()
                .replace(".pdf", ""),
        };
    }
    return {
        aipId: url.includes("/article/")
            ? url.split("/article/")[1].split("/")[3]
            : url.includes("/article-split/")
              ? url.split("/article-split/")[1].split("/")[3]
              : url.split("/article-abstract/")[1].split("/")[3],
    };
};
export const findCellPii = async (url) => {
    const isPdf = url.toLowerCase().includes("showpdf");
    const isPdfExtended = url.toLowerCase().includes("pdfextended");
    let pii;
    if (isPdf || isPdfExtended) {
        const cellData = state.cellJournalData;
        pii = isPdf ? new URL(url).searchParams.get("pii") : url.split("/").last();
        const issn = pii.match(/\d{4}-\d{3}[0-9X]/g)[0];
        let venue;
        Object.entries(cellData).forEach(([key, value]) => {
            if (value.issn.includes(issn)) {
                venue = key;
            }
        });
        if (!venue) {
            warn(`[findCellPii] No Cell journal found for ISSN: ${issn}`);
            return { pii, url };
        }
        const target = venue
            .split(" ")
            .map((w) => w.toLowerCase())
            .join("-");
        url = isPdf
            ? noParamUrl(url).split("/showPdf")[0] + `/${target}/fulltext/${pii}`
            : noParamUrl(url).split("/pdfExtended")[0] + `/fulltext/${pii}`;
        url = url.replace("/action/", "/");
    } else {
        pii = noParamUrl(url).split("/").last();
    }
    return { pii, url };
};

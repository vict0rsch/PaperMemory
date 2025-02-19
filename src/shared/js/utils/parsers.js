// -------------------
// -----  Utils  -----
// -------------------

const decodeHtml = (html) => {
    // https://stackoverflow.com/questions/5796718/html-entity-decode
    var txt = document.createElement("textarea");
    txt.innerHTML = html;
    return txt.value;
};

const flipAuthor = (author) => author.split(", ").reverse().join(" ");
const flipAndAuthors = (authors) =>
    authors.split(" and ").map(flipAuthor).join(" and ");

// -------------------
// -----  Fetch  -----
// -------------------

const fetchArxivXML = async (paperId) => {
    const arxivId = paperId.replace("Arxiv-", "").replace("_", "/");
    return fetch(
        "https://export.arxiv.org/api/query?" +
            new URLSearchParams({ id_list: arxivId })
    );
};

const fetchCvfHTML = async (url) => {
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
            `/content_${conf.toLowerCase()}_${year}/`
        );
        text = await fetch(paperPage).then((response) => {
            return response.ok ? response.text() : "";
        });
    }

    return text;
};

const getOpenReviewNoteJSON = (url) => {
    return sendMessageToBackground({ type: "OpenReviewNoteJSON", url });
};

const getOpenReviewForumJSON = (url) => {
    return sendMessageToBackground({ type: "OpenReviewForumJSON", url });
};

const fetchDom = async (url) => {
    const html = await fetch(url).then((response) =>
        response.ok ? response.text() : ""
    );
    return new DOMParser().parseFromString(html.replaceAll("\n", ""), "text/html");
};

const fetchText = async (url) => {
    try {
        const response = await fetch(url);
        const text = response.ok ? await response.text() : "";
        return text.trim();
    } catch (error) {
        logError("fetchText error:", error);
        return "";
    }
};

const fetchJSON = async (url) => {
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

const fetchBibtex = async (url) => {
    let bibtex = await fetchText(url);
    const bibObj = bibtexToObject(bibtex);
    delete bibObj.abstract;
    bibtex = bibtexToString(bibObj);
    const note = `Published in ${bibObj.journal} (${bibObj.year})`;
    return {
        ...bibObj,
        bibtex,
        note,
        venue: bibObj.journal,
        key: bibObj.citationKey,
    };
};

// -------------------
// -----  Parse  -----
// -------------------

const extractCrossrefData = (crossrefResponse) => {
    if (!crossrefResponse.status || crossrefResponse.status !== "ok") {
        error("Cannot parse CrossRef response", crossrefResponse);
        return;
    }
    if (crossrefResponse["message-type"] !== "work") {
        error("Unknown `message-type` from CrossRef", crossrefResponse);
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
        error("Cannot find year in CrossRef data", data);
        return;
    }

    const title = data.title[0];

    if (!title) {
        error("Cannot find title in CrossRef data", data);
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

const fetchCrossRefDataForDoi = async (doi) => {
    const { data, status } = await fetchJSON(
        `https://api.crossref.org/works/${doi}?mailto=schmidtv%40mila.quebec`
    );
    return { data: extractCrossrefData(data), status };
};

const fetchSemanticScholarDataForDoi = async (doi) => {
    const { data } = await fetchJSON(
        `https://api.semanticscholar.org/graph/v1/paper/${doi}?fields=venue,year,authors,title`
    );

    let bibData;
    if (data) {
        bibData = {};
        if (data.venue) {
            bibData.venue = data.venue;
        }
        if (data.year) {
            bibData.year = data.year;
        }
        if (data.authors) {
            bibData.author = data.authors.map((a) => a.name).join(" and ");
        }
        if (data.title) {
            bibData.title = data.title;
        }
        const citationKey = `${miniHash(data.authors[0].name)}${firstNonStopLowercase(
            bibData.title
        )}`;
        const bibtex = bibtexToString({
            entryType: "article",
            citationKey,
            ...bibData,
        });
        bibData.bibtex = bibtex;
        bibData.key = citationKey;
    }
    return bibData;
};

// get all dc variations
const getDCPatterns = (value) => {
    const spec = value.slice(3);
    const lowers = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.toLowerCase());
    const caps = ["dc.", "DC:", "DC.", "dc:"].map((v) => v + spec.capitalize());
    return [...lowers, ...caps];
};
const getMetaContent = ({
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
            (el) => el.getAttribute("content") ?? ""
        );
        if (pure) return candidate;
        return candidate.map(spaceCamelCase).map(toSingleSpace);
    }

    const candidate = dom.querySelector(query)?.getAttribute("content") ?? "";
    if (pure) return candidate;
    return toSingleSpace(spaceCamelCase(candidate));
};

const extractDataFromDCMetaTags = (dom) => {
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
            (v, k) => k >= 1 && miniHash(v).length > 1 // ignore middle initials
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

    return { author, year, publisher, title, venue, key, doi, bibtex, pdfLink, note };
};

const makeArxivPaper = async (url) => {
    const arxivId = arxivIdFromURL(url);
    const response = await fetchArxivXML(arxivId);
    const xmlData = await response.text();
    var doc = new DOMParser().parseFromString(xmlData.replaceAll("\n", ""), "text/xml");

    const authors = queryAll("author name", doc).map((el) => el.innerHTML);
    const author = authors.join(" and ");

    const pdfLink = [...doc.getElementsByTagName("link")]
        .map((l) => l.getAttribute("href"))
        .filter((h) => h.includes("arxiv.org/pdf/"))[0]
        .replace(/v\d+\.pdf$/gi, ".pdf");

    const title = doc.querySelector("entry title").innerHTML;
    const year = doc.querySelector("entry published").innerHTML.slice(0, 4);
    const key =
        authors[0].split(" ").last().toLowerCase() +
        year +
        firstNonStopLowercase(title);

    const id = `Arxiv-${arxivId.replace("/", "_")}`;

    let bibtex = "";
    bibtex += `@article{${key},\n`;
    bibtex += `    title={${title} },\n`;
    bibtex += `    author={${author} },\n`;
    bibtex += `    year={${year}},\n`;
    bibtex += `    journal={arXiv preprint arXiv: ${arxivId}}\n`;
    bibtex += `}`;

    const venue = "";

    return { author, bibtex, id, key, pdfLink, title, venue, year };
};

const makeNeuripsPaper = async (url) => {
    if (url.endsWith(".pdf")) {
        url = url
            .replace("/file/", "/hash/")
            .replace(/-Paper(.*)\.pdf/, "-Abstract$1.html");
    }
    const hash = url.split("/").slice(-1)[0].split("-Paper")[0];

    const dom = await fetchDom(url);

    const citeUrl = [...dom.getElementsByTagName("a")]
        .filter((a) => a.innerText === "Bibtex")[0]
        ?.getAttribute("href");

    let bibtex, author, title, year, key;

    if (citeUrl) {
        bibtex = await fetchText(`https://${parseUrl(url).host}${citeUrl}`);
        ({ author, citationKey, title, year } = bibtexToObject(bibtex));
        author = flipAndAuthors(author);
        key = citationKey;
    } else {
        const paragraphs = queryAll(".container-fluid .col p", dom);

        title = dom.getElementsByTagName("h4")[0].innerHTML;
        const h4Authors = queryAll("h4", dom).filter(
            (h) => h.innerText === "Authors"
        )[0];

        author = h4Authors.nextElementSibling.innerText
            .split(", ")
            .map((author) =>
                author
                    .split(" ")
                    .map((p) => p.capitalize())
                    .join(" ")
            )
            .join(" and ");
        year = paragraphs[0].innerHTML.match(/\d{4}/)[0];
        key = `neurips${year}${hash.slice(0, 8)}`;

        bibtex = "";
        bibtex += `@inproceedings{NEURIPS${year}_${hash.slice(0, 8)},\n`;
        bibtex += `    author={${author}},\n`;
        bibtex += `    booktitle={Advances in Neural Information Processing Systems},\n`;
        bibtex += `    editor={H.Larochelle and M.Ranzato and R.Hadsell and M.F.Balcan and H.Lin},\n`;
        bibtex += `    publisher={Curran Associates, Inc.},\n`;
        bibtex += `    title={${title}},\n`;
        bibtex += `    url={${url}},\n`;
        bibtex += `    year={${year}}\n`;
        bibtex += `}`;
        bibtex = bibtexToString(bibtex);
    }

    const pdfLink = url
        .replace("/hash/", "/file/")
        .replace("-Abstract.html", "-Paper.pdf");
    const id = `NeurIPS-${year}_${hash.slice(0, 8)}`;
    const venue = "NeurIPS";
    const note = `Accepted @ ${venue} (${year})`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeCVFPaper = async (url) => {
    const htmlText = await fetchCvfHTML(url);
    const dom = new DOMParser().parseFromString(
        htmlText.replaceAll("\n", ""),
        "text/html"
    );
    const title = dom.getElementById("papertitle").innerText.trim();
    let author = dom
        .querySelector("#authors i")
        .innerText.split(",")
        .map((a) => a.trim())
        .join(" and ");
    const { year, id, conf } = parseCVFUrl(url);
    let pdfLink = "";
    if (url.endsWith(".pdf")) {
        pdfLink = url;
    } else {
        let href = [...dom.getElementsByTagName("a")]
            .filter((a) => a.innerText === "pdf")[0]
            .getAttribute("href");
        if (href.startsWith("../")) {
            href = href.replaceAll("../", "");
        }
        if (!href.startsWith("/")) {
            href = "/" + href;
        }
        pdfLink = "http://openaccess.thecvf.com" + href;
    }
    const venue = conf;
    const note = `Accepted @ ${venue} (${year})`;
    const bibtex = bibtexToString(dom.querySelector(".bibref").innerText);
    const key = bibtex.split("{")[1].split(",")[0];

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeOpenReviewBibTex = (paper, url) => {
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
const extractAPIv2ContentValue = (paper) => {
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

const makeOpenReviewPaper = async (url) => {
    const noteJson = await getOpenReviewNoteJSON(url);
    const forumJson = await getOpenReviewForumJSON(url);

    if (noteJson.status === 403 && noteJson.name === "ForbiddenError") {
        logError(
            dedent(`Error parsing OpenReview url ${url}.
            Most likely because this entry is protected and you do not have the rights to access it.

            1/ Make sure you are logged in.
            2/ Alternatively, this may be due to OpenReview changing the visibility of this paper.

            Try accessing this URL manually to make sure.`)
        );
        throw Error(noteJson.message);
    } else if (noteJson.status === 404 && noteJson.name === "NotFoundError") {
        logError(dedent(`Error parsing OpenReview url ${url}.`));
        throw Error(noteJson.message);
    }

    var paper = noteJson.notes[0];
    let isV2 = false;
    var forum = forumJson.notes;

    ({ isV2, paper } = extractAPIv2ContentValue(paper));
    console.log("paper", paper);
    const title = paper.content.title;
    const author = (
        paper.content.authors ||
        paper.content.authors?.value || ["Anonymous"]
    ).join(" and ");
    const bibtex = bibtexToString(
        paper.content._bibtex || makeOpenReviewBibTex(paper, url)
    );
    const bibObj = bibtexToObject(bibtex);
    const key = bibObj.citationKey;
    const year = bibObj.year;

    let pdfLink;
    if (paper.pdf) {
        pdfLink = `https://openreview.net/pdf?id=${paper.id}`;
    } else {
        if (paper.html) {
            pdfLink = paper.html.replace("/forum?id=", "/pdf?id=");
        } else {
            pdfLink = url.replace("/forum?id=", "/pdf?id=");
        }
    }

    const confParts = paper.invitation?.split("/") || paper.domain.split("/");
    let organizer = confParts[0].split(".")[0];
    let event = confParts
        .slice(1)
        .join("/")
        .split("-")[0]
        .replaceAll("/", " ")
        .replace(" Conference", "");

    let overrideOrg = organizer;
    let overridden = false;
    if (global.overrideORConfs.hasOwnProperty(organizer)) {
        overrideOrg = global.overrideORConfs[organizer];
        overridden = true;
    }
    if (overridden) {
        event = event.replace(overrideOrg, "");
        organizer = overrideOrg;
    }

    const conf = `${organizer} ${event}`
        .replace(/ \d\d\d\d/g, "")
        .replace(/\s\s+/g, " ");
    const id = `OR-${organizer}-${year}_${paper.id}`;

    let candidates, decision, note;

    candidates = isV2
        ? forum.filter((r) => r?.content?.recommendation?.value)
        : forum.filter(
              (r) =>
                  ["Final Decision", "Paper Decision", "Acceptance Decision"].indexOf(
                      r?.content?.title
                  ) > -1
          );
    let venue = "";
    if (candidates && candidates.length > 0) {
        decision = isV2
            ? candidates[0].content.recommendation.value
            : candidates[0].content.decision;
        decision = decision
            .split(" ")
            .map((v, i) => {
                return i === 0 ? cleanStr(v) + "ed" : v;
            })
            .join(" ");
        note = `${decision} @ ${conf} (${year})`;
        if (decision.toLowerCase().indexOf("rejected") < 0) {
            venue = conf;
        }
    }

    if (author !== "Anonymous" && !venue && bibObj.booktitle) {
        note = `Accepted @ ${bibObj.booktitle}`;
        venue = bibObj.booktitle;
    }
    if (author === "Anonymous" && decision != "Rejected") {
        note = `Under review @ ${conf} (${year}) (${new Date().toLocaleDateString()})`;
    }

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeBioRxivPaper = async (url) => {
    const biorxivAPI = "https://api.biorxiv.org/";
    const pageURL = url.replace(".full.pdf", "");
    const biorxivID = url
        .split("/")
        .slice(-2)
        .join("/")
        .replace(".full.pdf", "")
        .split("v")[0];
    const api = `${biorxivAPI}/details/biorxiv/${biorxivID}`;
    const data = await fetch(api).then((response) => {
        return response.json();
    });

    if (data.messages[0].status !== "ok")
        throw new Error(`${api} returned ${data.messages[0].status}`);

    const paper = data.collection.last();

    const pageText = await fetchText(pageURL);

    const dom = new DOMParser().parseFromString(
        pageText.replaceAll("\n", ""),
        "text/html"
    );
    const bibtextLink = dom.querySelector(".bibtext a").getAttribute("href");
    const bibtex = bibtexToString(await (await fetch(bibtextLink)).text());

    const author = extractAuthor(bibtex);

    const id = await parseIdFromUrl(url);
    const key = bibtex.split("\n")[0].split("{")[1].replace(",", "").trim();
    const note = "";
    const pdfLink = cleanBiorxivURL(url) + ".full.pdf";
    const title = paper.title;
    const year = paper.date.split("-")[0];
    const venue = "";

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makePMLRPaper = async (url) => {
    const key = url.split("/").last().split(".")[0];
    const id = await parseIdFromUrl(url);

    const absURL = url.includes(".html")
        ? url
        : url.split("/").slice(0, -2).join("/") + `/${key}.html`;

    const pdfLink = absURL.replace(".html", "") + `/${key}.pdf`;

    const dom = await fetchDom(absURL);

    const bibtexRaw = dom
        .getElementById("bibtex")
        .innerText.replaceAll("\t", " ")
        .replaceAll(/\s\s+/g, " ");
    let bibtex = bibtexRaw;
    const items = bibtexRaw.match(/,\ ?\w+ ?= ?{/g);
    for (const item of items) {
        bibtex = bibtex.replace(
            item,
            item.replace(", ", ",\n    ").replace(" = ", "=")
        );
    }
    if (bibtex.endsWith("}}")) {
        bibtex = bibtex.slice(0, -2) + "}\n}";
    }
    bibtex = bibtexToString(bibtex);

    const author = extractAuthor(bibtex);
    const title = dom.getElementsByTagName("h1")[0].innerText;
    const year = extractBibtexValue(bibtex, "year");

    let conf = extractBibtexValue(bibtex, "booktitle").replaceAll(
        "Proceedings of the",
        ""
    );
    let venue = conf;
    note = `Accepted @ ${venue} (${year})`;
    for (const long in global.overridePMLRConfs) {
        if (conf.includes(long)) {
            venue = global.overridePMLRConfs[long];
            conf = venue + " " + year;
            note = "Accepted @ " + conf;
            break;
        }
    }

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const findACLValue = (dom, key) => {
    const dt = queryAll("dt", dom).filter((v) => v.innerText.includes(key))[0];
    return dt.nextElementSibling.innerText;
};

const makeACLPaper = async (url) => {
    url = url.replace(".pdf", "");
    const dom = await fetchDom(url);

    const bibtexEl = dom.getElementById("citeBibtexContent");
    if (!bibtexEl) return;

    const title = dom.getElementById("title").innerText;
    const bibtex = bibtexToString(bibtexEl.innerText);

    const bibtexData = bibtexToObject(bibtex);

    const year = bibtexData.year;
    const author = bibtexData.author
        .replace(/\s+/g, " ")
        .split(" and ")
        .map((v) =>
            v
                .split(",")
                .map((a) => a.trim())
                .reverse()
                .join(" ")
        )
        .join(" and ");
    const key = bibtexData.citationKey;

    const venue = findACLValue(dom, "Venue");
    const pdfLink = findACLValue(dom, "PDF");
    const aid = findACLValue(dom, "Anthology ID");

    const id = `ACL-${venue}-${year}_${aid}`;
    const note = `Accepted @ ${venue} (${year})`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makePNASPaper = async (url) => {
    /*
        https://www.pnas.org/doi/10.1073/pnas.2114679118
        https://www.pnas.org/doi/epdf/10.1073/pnas.2114679118
        https://www.pnas.org/doi/pdf/10.1073/pnas.2114679118
    */

    url = url.replace(".full.pdf", "").replace(/\/doi\/e?pdf\//, "/doi/abs/");
    const dom = await fetchDom(url);

    const title = dom.getElementsByTagName("h1")[0].innerText;
    const author = queryAll(
        ".authors span[property='author'] a:not([property='email']):not(.orcid-id)",
        dom
    )
        .filter((el) => !el.getAttribute("href").includes("mailto:"))
        .map((el) => el.innerText)
        .join(" and ");

    const year = dom
        .querySelector("span[property='datePublished']")
        .innerText.match(/\d{4}/g)[0];

    const pid = url.endsWith("/")
        ? url.split("/").slice(-2)[0]
        : url.split("/").slice(-1)[0];

    const id = `PNAS-${year}_${pid}`;
    const pdfLink =
        url.includes("/doi/pdf/") || url.includes("/doi/epdf/")
            ? url.replace("/doi/epdf/", "/doi/pdf/")
            : url.replace("/doi/abs/", "/doi/pdf/").replace("/doi/full/", "/doi/pdf/");
    const doi = [...dom.querySelector(".core-container").getElementsByTagName("a")]
        .map((a) => a.getAttribute("href"))
        .filter((a) => a?.includes("https://doi.org"))[0]
        .split("/")
        .slice(-2)
        .join("/");
    const key = `doi:${doi}`;
    const bibtex = bibtexToString(`
    @article{${key},
        author={${author}},
        title={${title}},
        journal = {Proceedings of the National Academy of Sciences},
        year={${year}},
        doi={${doi}},
        eprint={${pdfLink}},
        URL={${pdfLink.replace("/doi/pdf/", "/doi/abs/")}}
    }`);
    const venue = "PNAS";

    const note = `Published @ PNAS (${year})`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeNaturePaper = async (url) => {
    url = url.replace(".pdf", "").split("#")[0];
    const pdfLink = url + ".pdf";
    const hash = url.split("/").last();

    const dom = await fetchDom(url);

    const title = dom.querySelector("h1.c-article-title").innerText;
    const author = queryAll("ul.c-article-author-list li", dom)
        .map((a) =>
            a.innerText
                .replace(/(\ ?,)|&|…|\d/g, "")
                .split(/orcid/i)[0]
                .trim()
        )
        .filter((a) => a.length > 0)
        .join(" and ");
    const year = dom
        .querySelector(".c-article-info-details")
        .innerText.match(/\(\d{4}\)/)[0]
        .replace(/\(|\)/g, "");
    const journal = dom.querySelector(".c-article-info-details [data-test]").innerText;
    const id = `Nature-${year}_${hash}`;

    const doiClasses = [
        ".c-bibliographic-information__citation",
        ".c-bibliographic-information__value",
    ];
    let doi;
    for (const doiClass of doiClasses) {
        doi = querySelector(doiClass)?.innerText.split("https://doi.org/")[1];
        if (doi) break;
    }
    if (!doi) {
        doi = [...dom.getElementsByTagName("span")]
            .map((a) => a.innerText)
            .filter((a) => a.includes("https://doi.org"))[0];
    }

    const key = `${author.split(" ")[1]}${year}${firstNonStopLowercase(title)}`;
    let bibData = {
        citationKey: key,
        entryType: "article",
        author,
        title,
        journal,
        year,
    };
    if (doi) {
        bibData.doi = doi;
        bibData.url = `https://doi.org/${doi}`;
    }
    const bibtex = bibtexToString(bibData);
    const note = `Published @ ${journal} (${year})`;
    const venue = journal;
    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeACSPaper = async (url) => {
    url = url.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
    const doi = url.replace("/abs/", "/").split("/doi/")[1];
    const citeUrl = `https://pubs.acs.org/action/downloadCitation?doi=${doi}&include=cit&format=bibtex&direct=true`;
    const bibtex = await fetchText(citeUrl);
    const data = bibtexToObject(bibtex);
    const author = data.author.replaceAll("\n", "").trim();
    const title = data.title.trim();
    const year = data.year.trim();
    const key = data.citationKey.trim();
    const pdfLink = `https://pubs.acs.org/doi/pdf/${doi}`;
    const note = `Published @ ${data.journal} (${data.year})`;
    const id = `ACS_${doi.replaceAll(".", "").replaceAll("/", "")}`;
    const venue = data.journal;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeIOPPaper = async (url) => {
    url = url.split("#")[0];
    if (url.endsWith("/pdf")) url = url.slice(0, -4);
    const dom = await fetchDom(url);
    const bibtexPath = queryAll(".btn-multi-block a", dom)
        .filter((a) => a.innerText === "BibTeX")
        .map((a) => a.getAttribute("href"))[0];
    const citeUrl = `https://${parseUrl(url).host}${bibtexPath}`;
    const bibtex = await fetchText(citeUrl);
    const data = bibtexToObject(bibtex);
    const author = data.author.replaceAll("\n", "").trim();
    const title = data.title.trim();
    const year = data.year.trim();
    const key = data.citationKey.trim();
    const pdfLink = url + "/pdf";
    const venue = data.journal;
    const note = `Published @ ${venue} (${year})`;
    const doi = url.split("/article/").last().split("/meta")[0];
    const id = `IOPscience_${miniHash(doi)}`;
    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeJMLRPaper = async (url) => {
    if (url.includes("/papers/volume")) {
        url = url.replace("/papers/volume", "/papers/v");
    }
    if (url.endsWith(".pdf")) {
        url = url.split("/").slice(0, -1).join("/");
    }
    url = url.replace(".html", "");
    const jid = url.split("/").last();
    const citeUrl = url + ".bib";
    const bibtex = await fetchText(citeUrl);
    const data = bibtexToObject(bibtex);

    const { author, year, title, citationKey } = data;
    const key = citationKey.trim();
    const id = `JMLR-${year}_${jid}`;
    const note = `Published @ JMLR (${year})`;
    const pdfLink = url.replace("/papers/v", "/papers/volume") + `/${jid}.pdf`;
    const venue = "JMLR";

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makePMCPaper = async (url) => {
    const pmcid = url.match(/PMC\d+/)[0].replace("PMC", "");
    const absUrl = url.split(`PMC${pmcid}`)[0] + `PMC${pmcid}`;
    // https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=7537588&download=true
    const api = "https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pmc/?format=csl&id=";
    const data = await (await fetch(`${api}${pmcid}&download=true`)).json();
    const year = data["epub-date"]
        ? data["epub-date"]["date-parts"][0][0] + ""
        : data.issued["date-parts"][0][0] + "";
    const author = data.author.map((a) => `${a.given} ${a.family}`).join(" and ");
    const venue = data["container-title"]
        .split(" ")
        .map((p) => p.capitalize())
        .join(" ");
    const title = data.title;
    const id = `PMC-${year}_${pmcid}`;
    const key = `${data.author[0].family}${year}${firstNonStopLowercase(title)}`;
    const bibtex = bibtexToString({
        entryType: "article",
        citationKey: key,
        journal: venue,
        issn: data["ISSN"],
        volume: data.volume,
        page: data.page,
        doi: data.DOI,
        PMID: data.PMID,
        PMCID: data.PMCID,
        publisher: data.publisher,
        author,
        title,
    });

    let pdfLink;
    if (isPdfUrl(url)) {
        pdfLink = url;
    } else {
        pdfLink = `${absUrl}/pdf`;
    }

    const note = `Published @ ${venue} (${year})`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makePubMedPaper = async (url) => {
    const dom = await fetchDom(url.split("?")[0]);
    const metas = [...dom.getElementsByTagName("meta")].filter((el) =>
        el.getAttribute("name")?.includes("citation_")
    );
    const data = Object.fromEntries(
        metas.map((el) => [
            el.getAttribute("name").replace("citation_", ""),
            el.getAttribute("content"),
        ])
    );
    const author = document
        .querySelector("div.authors-list")
        .innerText.replace(/\d/gi, "")
        .split(",")
        .map((a) => a.trim())
        .join(" and ");

    const title = data.title;
    const venue = data.journal_title;
    const year = data.date.split("/")[2];
    const id = `PubMed-${year}_${data.pmid}`;
    const key = `${author
        .split(" and ")[0]
        .split(" ")
        .last()}${year}${firstNonStopLowercase(data.title)}`;

    const bibtexObj = {
        entryType: "article",
        citationKey: key,
        publisher: data.publisher,
        doi: data.doi,
        issn: data.issn,
        journal: venue,
        year,
        author,
    };
    const bibtex = bibtexToString(bibtexObj);
    const note = `Accepted @ ${journal} (${year})`;
    const pdfLink = "";

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeIJCAIPaper = async (url) => {
    const procId = url.endsWith(".pdf")
        ? url
              .replace(".pdf", "")
              .split("/")
              .last()
              .match(/[1-9]\d*/)[0]
        : url.split("/").last();

    const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];

    // ijcai bibtexs have issues with note = {NOTE}\n with a missing ","
    const bibtex = (
        await fetchText(`https://www.ijcai.org/proceedings/${year}/bibtex/${procId}`)
    ).replace(/}\n/gi, "},\n");
    const data = bibtexToObject(
        bibtex
            .split("\n")
            .filter((line) => !/note\s+=/gi.test(line))
            .join("\n")
    );

    const key = data.citationKey;
    const title = data.title;
    const author = flipAndAuthors(data.author);
    const id = `IJCAI-${year}_${procId}`;
    const note = `Accepted @ IJCAI (${year})`;
    const venue = "IJCAI";
    const pdfId = procId.padStart(4, 0);
    const pdfLink = `https://www.ijcai.org/proceedings/${year}/${pdfId}.pdf`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeACMPaper = async (url) => {
    let pdfLink;
    url = noParamUrl(url);
    if (isPdfUrl(url)) {
        pdfLink = url;
    } else {
        pdfLink = url.replace(/\/doi\/?(abs|full)?\//, "/doi/pdf/");
    }
    const dom = await fetchDom(url.replace("/doi/pdf/", "/doi/"));

    let author, year, title, venue, key, doi, bibtex, note;
    const metaTagsData = extractDataFromDCMetaTags(dom);
    if (metaTagsData) {
        ({ author, year, title, venue, key, doi, bibtex, note } = metaTagsData);
    } else {
        title = dom.querySelector(".citation__title").innerText;
        author = queryAll(
            "ul[aria-label='authors'] li.loa__item .loa__author-name",
            dom
        )
            .map((el) => el.innerText.replace(",", "").trim())
            .join(" and ");
        const publication = dom.querySelector(".issue-item__detail a").innerText;
        venue = publication.split("'")[0].trim();
        year = "20" + publication.split("'")[1].split(":")[0].trim();
        doi = pdfLink.split("/doi/pdf/")[1];

        note = `Accepted @ ${venue} (${year})`;
        key = doi;
        bibtex = bibtexToString({
            entryType: "article",
            citationKey: doi,
            journal: venue,
            author,
            title,
            year,
            publisher: "Association for Computing Machinery",
            address: "New York, NY, USA",
            url: noParamUrl(url).replace("/doi/pdf/", "/doi/"),
        });
    }
    const id = `ACM-${year}_${miniHash(doi)}`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeIEEEPaper = async (url) => {
    if (isPdfUrl(url)) {
        const articleId = url
            .split("/stamp/stamp.jsp?tp=&arnumber=")[1]
            .match(/\d+/)[0];
        url = `https://ieeexplore.ieee.org/document/${articleId}/`;
    }
    const dom = await fetchDom(url);
    const metadata = JSON.parse(
        [...dom.getElementsByTagName("script")]
            .filter((s) => s.innerHTML?.includes("metadata="))[0]
            .innerHTML.split("metadata=")[1]
            .split(/};\s*/)[0] + "}"
    );

    const title = metadata.title;
    const author = metadata.authors.map((a) => a.name).join(" and ");
    const year = metadata.publicationYear;
    const pdfLink = `${parseUrl(url).origin}${metadata.pdfUrl}`;
    const venue = metadata.publicationTitle;
    const key = metadata.articleId;
    const bibtex = bibtexToString({
        entryType: "article",
        citationKey: key,
        journal: venue,
        volume: metadata.volume,
        pages: `${metadata.startPage}-${metadata.endPage}`,
        doi: metadata.doi,
        title,
        year,
        author,
    });
    const id = `IEEE-${year}_${key}`;
    const note = `Accepted @ ${venue} (${year})`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeSpringerPaper = async (url) => {
    // https://link.springer.com/chapter/10.1007/978-981-16-1220-6_12
    // https://link.springer.com/article/10.1007/s00148-021-00864-z
    // https://link.springer.com/content/pdf/10.1007/s00148-021-00864-z.pdf
    // https://link.springer.com/article/10.1007/s00148-021-00864-z?noAccess=true
    // https://citation-needed.springer.com/v2/references/10.1007/s41095-022-0271-y?format=bibtex&flavour=citation
    const types = [...global.sourceExtras.springer.types, "content/pdf"];
    const springerType = types.find((c) => url.includes(`/${c}/`));
    if (!springerType) {
        throw new Error(
            `Could not find Springer type for ${url} (known: ${types.join(", ")})`
        );
    }
    const doi = url.split(`/${springerType}/`)[1].split("?")[0].replace(".pdf", "");

    const { data } = await fetchCrossRefDataForDoi(doi);

    if (!data) {
        throw new Error("Aborting Springer paper parsing, see error above");
    }

    const { author, bibtex, citationKey, year, title, venue } = data;

    const id = `Springer-${year}_${miniHash(doi)}`;
    const note = `Published @ ${venue} (${year})`;

    const pdfLink =
        data.pdf ??
        (springerType === "content/pdf"
            ? url
            : url.replace(`/${springerType}/`, "/content/pdf/") + ".pdf");

    return {
        author,
        bibtex,
        id,
        key: citationKey,
        note,
        pdfLink,
        title,
        venue,
        year,
        extra: { url: `https://doi.org/${doi}` },
    };
};

const makeAPSPaper = async (url) => {
    url = url.split("#")[0];
    const [journal, type] = parseUrl(url).pathname.split("/").slice(1, 3);
    const doi = url.split(`/${journal}/${type}/`).last();
    const exportPath = url.replace(`/${journal}/${type}/`, `/${journal}/export/`);
    const bibtex = await fetchText(`${exportPath}?type=bibtex&download=true`);
    const data = bibtexToObject(bibtex);
    const pdfLink = url.replace(`/${journal}/${type}/`, `/${journal}/pdf/`);
    const id = `APS-${data.year}_${miniHash(doi)}`;
    const journalKey = data.journal ?? data.publisher;
    await readJournalAbbreviations();
    const venue = global.journalAbbreviations[miniHash(journalKey)] ?? journalKey;
    const note = `Published @ ${venue} (${data.year})`;
    return {
        author: flipAndAuthors(data.author),
        bibtex,
        id,
        key: data.citationKey,
        note,
        pdfLink,
        title: data.title,
        venue,
        year: data.year,
    };
};

const makeWileyPaper = async (url) => {
    const pdfLink = url.replace(/\/doi\/(abs|epdf|full)\//g, "/doi/pdf/");
    const absLink = pdfLink.replace("/doi/pdf/", "/doi/abs/");
    const dom = await fetchDom(absLink);

    const author = queryAll("meta[name=citation_author]", dom)
        .map((m) => m.getAttribute("content"))
        .join(" and ");
    const venue = dom
        .querySelector("meta[name=citation_journal_title]")
        .getAttribute("content");
    const title = dom
        .querySelector("meta[name=citation_title]")
        .getAttribute("content");
    const publisher = dom
        .querySelector("meta[name=citation_publisher]")
        .getAttribute("content");
    const year =
        dom
            .querySelector("meta[name=citation_publication_date]")
            ?.getAttribute("content")
            ?.split("/")[0] ??
        dom
            .querySelector("meta[name=citation_online_date]")
            ?.getAttribute("content")
            ?.split("/")[0];
    const doi = dom.querySelector("meta[name=citation_doi]").getAttribute("content");

    const note = `Published @ ${venue} (${year})`;
    const id = `Wiley-${year}_${miniHash(doi)}`;
    const bibtex = bibtexToString({
        citationKey: doi,
        entryType: "article",
        title,
        author,
        year,
        doi,
        publisher,
        journal: venue,
    });

    return { author, bibtex, id, key: doi, note, pdfLink, title, venue, year };
};

const makeScienceDirectPaper = async (url) => {
    const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
    const bibtex = await fetchText(
        `https://www.sciencedirect.com/sdfe/arp/cite?pii=${pii}&format=text%2Fx-bibtex&withabstract=false`
    );
    const data = bibtexToObject(bibtex);

    const { author, journal, year, doi, title, citationKey } = data;
    const note = `Published @ ${journal} (${year})`;
    const id = `ScienceDirect-${year}_${miniHash(pii)}`;
    const venue = journal ?? "Science Direct";
    const pdfLink = `https://reader.elsevier.com/reader/sd/pii/${pii}`;

    return { author, bibtex, id, key: citationKey, note, pdfLink, title, venue, year };
};

const makeSciencePaper = async (url) => {
    let author, bibtex, id, key, note, pdfLink, title, venue, year, doi, absUrl;

    doi = noParamUrl(url).split("/doi/")[1];
    if (!doi.startsWith("10.")) {
        doi = doi.split("/").slice(1).join("/");
    }
    pdfLink = `https://science.org/doi/pdf/${doi}`;
    absUrl = `https://science.org/doi/full/${doi}`;

    const { data } = await fetchCrossRefDataForDoi(doi);
    if (data) {
        ({ author, bibtex, title, venue, year } = data);
        key = data.citationKey;
        note = `Published @ ${venue} (${year})`;
    } else {
        const dom = await fetchDom(absUrl);
        ({ author, year, publisher, title, venue, key, bibtex, note } =
            extractDataFromDCMetaTags(dom));
    }

    id = `Science-${year}_${miniHash(doi)}`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeFrontiersPaper = async (url) => {
    url = url.replace(/\/pdf$/, "/full");
    const doi = noParamUrl(url).split("/articles/")[1].split("/full")[0];
    const bib = await fetchText(`https://www.frontiersin.org/articles/${doi}/bibTex`);
    const data = Object.fromEntries(
        Object.entries(bibtexToObject(bib)).map(([k, v]) => [
            k === "citationKey" || k === "entryType" ? k : k.toLowerCase(),
            v,
        ])
    );
    data.author = flipAndAuthors(data.author);
    delete data.abstract;
    const { author, journal, year, title, citationKey } = data;
    const bibtex = bibtexToString(data);

    const venue = journal;
    const note = `Published @ ${venue} (${year})`;
    const id = `Frontiers-${year}_${miniHash(doi)}`;
    const key = citationKey;
    const pdfLink = url.replace(/\/full$/, "/pdf");

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeIHEPPaper = async (url) => {
    let data, num;
    if (url.includes("/files/")) {
        const hash = url.split("/files/")[1].split("/")[0];
        const api = `https://inspirehep.net/api/literature?q=documents.key:${hash}`;
        const results = (await fetchJSON(api)).data;
        data = results.hits.hits.find(
            (h) => !!h.metadata.documents.find((d) => d.key === hash)
        );
        if (!data) {
            warn("Could not find an Inspire HEP record for the url", url);
            return;
        }
        num = data.metadata.control_number;
    } else {
        num = url.match(/\/literature\/(\d+)/)[1];
    }
    if (!num) {
        warn("Could not find an Inspire HEP id for the url", url);
        return;
    }
    const bibtex = await fetchText(
        `https://inspirehep.net/api/literature/${num}?format=bibtex`
    );
    if (!data) {
        ({ data } = await fetchJSON(
            `https://inspirehep.net/api/literature/${num}?format=json`
        ));
    }
    const bibObj = bibtexToObject(bibtex);
    let title = bibObj.title ?? data.metadata.titles[0].title;
    if (title.startsWith("{") && title.endsWith("}")) title = title.slice(1, -1);
    const pdfLink = data.metadata.documents?.[0]?.url ?? url;
    const author = flipAndAuthors(bibObj.author);
    const year = bibObj.year ?? data.created.split("-")[0];
    const id = `IHEP-${num}`;
    const venue = bibObj.journal ?? "Inspire HEP";
    const key = bibObj.citationKey;
    const note = `Published @ ${venue} (${year})`;
    const doi = bibObj.doi ?? "";

    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makePLOSPaper = async (url) => {
    const doi = url.split("?id=").last().split("&")[0];
    let { bibtex, key, author, venue, title, note, year } = await fetchBibtex(
        `${url.split("/article")[0]}/article/citation/bibtex?id=${doi}`
    );
    const pdfLink = `${url.split("/article")[0]}/article/file?id=${doi}&type=printable`;
    const section = url.split("journals.plos.org/")[1].split("/")[0];

    author = flipAndAuthors(author);
    const id = `PLOS-${section}_${miniHash(doi)}`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makeRSCPaper = async (url) => {
    const rscId = noParamUrl(url).split("/").last();
    const type = url
        .split("/")
        .find(
            (s) => s === "articlehtml" || s === "articlepdf" || s === "articlelanding"
        )
        .replace("article", "");
    const pdfLink =
        type === "articlepdf" ? url : url.replace(`/article${type}/`, "/articlepdf/");

    let { bibtex, key, author, venue, title, note, year, doi } = await fetchBibtex(
        `https://pubs.rsc.org/en/content/formatedresult?markedids=${rscId}&downloadtype=article&managertype=bibtex`
    );
    author = flipAndAuthors(author);
    const id = `RSC-${venue.replaceAll(" ", "")}_${miniHash(rscId)}`;
    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makeWebsitePaper = async (tab) => {
    const url = tab.url;
    const dom = await fetchDom(url);
    const og = Object.fromEntries(
        [...dom.querySelectorAll("meta")]
            .filter((m) => m.getAttribute("property"))
            .filter((m) => m.getAttribute("property").startsWith("og:"))
            .map((m) => [
                m.getAttribute("property").replace("og:", ""),
                m.getAttribute("content"),
            ])
    );

    const author =
        og.site_name || parseUrl(url).hostname.replace("www.", "").capitalize();
    const year = new Date().getFullYear() + "";
    const id = `Website_${urlToWebsiteId(url)}`;
    const note = og.description || "";
    const pdfLink = url;
    const title = og.title || tab.title;
    const key = `${miniHash(author)}${year}${firstNonStopLowercase(title)}`;
    const venue = "";
    const accessDate = new Date().toISOString().split("T")[0];
    const bib = `@misc{${key},
        author = {${author}},
        title = {${title}},
        year = {${year}},
        url = {${url}},
        note = {Accessed ${accessDate}}
    }`;
    const bibtex = bibtexToString(bibtexToObject(bib));
    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeMDPIPaper = async (url) => {
    url = noParamUrl(url);
    if (url.split("/").last().startsWith("pdf")) {
        url = url.split("/").slice(0, -1).join("/");
    }
    if (url.endsWith("/notes")) {
        url = url.replace("/notes", "");
    }
    if (url.endsWith("/reprints")) {
        url = url.replace("/reprints", "");
    }
    const dom = await fetchDom(url);
    let { author, year, publisher, title, venue, key, doi, bibtex, note, pdfLink } =
        extractDataFromDCMetaTags(dom);

    const id = `MDPI-${year}_${miniHash(url.split("mdpi.com/")[1])}`;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makeOUPPaper = async (url) => {
    url = noParamUrl(url);
    const resourceId = url.split("/").last();
    let bibtex = await fetchText(
        `https://academic.oup.com/Citation/Download?resourceId=${resourceId}&resourceType=3&citationFormat=2`
    );
    const paper = bibtexToObject(bibtex);
    delete paper.abstract;
    bibtex = bibtexToString(paper);
    let { title, year, author, journal, doi, citationKey, eprint } = paper;
    author = flipAndAuthors(author);
    const venue = journal;
    const note = `Published @ ${venue} (${year})`;
    const key = citationKey;
    const num = url.split("https://academic.oup.com/")[1].split("/").slice(2).join("");
    const id = `OUP-${year}_${miniHash(num)}`;
    const pdfLink = eprint?.replaceAll("\\", "") ?? url;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makerHALPaper = async (url) => {
    url = noParamUrl(url).replace(/(hal\.science\/\w+-\d+)(v\d+)?(\/document)?/, "$1"); // remove version
    const halId = url.split("/").last();
    const bibURL = `https://hal.science/${halId}/bibtex`;
    let bibtex = await fetchText(bibURL);
    const paper = bibtexToObject(bibtex);
    let { title, year, journal, author, doi, pdf } = paper;

    const venue = journal;
    const note = venue ? `Published @ ${venue} (${year})` : "";
    const key = paper.citationKey;
    author = flipAndAuthors(author);
    bibtex = bibtexToString(bibtex);
    const id = `HAL-${year}_${miniHash(halId)}`;
    const pdfLink = pdf ?? url;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

const makeChemRxivPaper = async (url) => {
    let chemRxivId;
    let absUrl = url;
    if (isPdfUrl(url)) {
        chemRxivId = url.split("/item/")[1].split("/")[0];
        absUrl = "https://chemrxiv.org/engage/chemrxiv/article-details/" + chemRxivId;
    } else {
        chemRxivId = noParamUrl(url).split("/").last();
    }
    const dom = await fetchDom(absUrl);
    const { author, year, publisher, title, venue, key, doi, bibtex, pdfLink, note } =
        extractDataFromDCMetaTags(dom);
    const id = `ChemRxiv-${year}_${miniHash(chemRxivId)}`;
    return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
};

// -------------------------------
// -----  PREPRINT MATCHING  -----
// -------------------------------

const tryPWCMatch = async (paper) => {
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
    } else {
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
const tryCrossRef = async (paper, toBackground) => {
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

const tryDBLP = async (paper, toBackground) => {
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
            (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10)
        );

        for (const hit of hits) {
            const hitTitle = decodeHtml(
                hit.info.title
                    ?.toLowerCase()
                    .replaceAll("\n", " ")
                    .replaceAll(".", "")
                    .replaceAll(/\s\s+/g, " ")
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
                const venue = (
                    global.journalAbbreviations[abbr] ?? hit.info.venue
                ).trim();
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

const trySemanticScholar = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-semantic-scholar", paper });
    }
    try {
        const { data, status } = await fetchJSON(
            `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURI(
                paper.title
            )}&fields=title,venue,year,authors,externalIds,url&limit=5`
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

const tryGoogleScholar = async (paper) => {
    const resp = await sendMessageToBackground({ type: "google-scholar", paper });
    resp.note && info("Found a Google Scholar match", resp.note);
    return resp;
};

const tryUnpaywall = async (paper, toBackground) => {
    if (toBackground) {
        return await sendMessageToBackground({ type: "try-unpaywall", paper });
    }
    const url = `https://api.unpaywall.org/v2/search?query=${encodeURI(
        paper.title
    )}&is_oa=true&email=papermemory+${parseInt(Math.random() * 1000)}@gmail.com`;
    const { data, status } = await fetchJSON(url);
    if (data && status === 200) {
        const match = data.results?.find(
            (m) => miniHash(m.response.title) === miniHash(paper.title)
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

const tryPreprintMatch = async (paper, tryPwc = false) => {
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
            matches[name] = await matchPromises[name];
        }
        if (matches[name].codeLink && !paper.codeLink) {
            code = matches[name].codeLink;
        }
    }

    return { note, venue, bibtex, code, doi };
};

// -----------------------------
// -----  Creating papers  -----
// -----------------------------

const initPaper = async (paper) => {
    if (!paper.note) {
        paper.note = "";
    }

    paper.md = `[${paper.title}](${paper.pdfLink})`;
    paper.tags = [];
    paper.codeLink = paper.codeLink ?? "";
    paper.favorite = false;
    paper.favoriteDate = "";
    paper.addDate = new Date().toJSON();
    paper.lastOpenDate = paper.addDate;
    paper.count = 1;
    paper.code = {};

    for (const k in paper) {
        if (paper.hasOwnProperty(k) && typeof paper[k] === "string") {
            paper[k] = paper[k].trim();
        }
    }

    paper = await autoTagPaper(paper);
    validatePaper(paper);

    return paper;
};

const autoTagPaper = async (paper) => {
    try {
        const autoTags = await getStorage("autoTags");
        if (!autoTags || !autoTags.length) return paper;
        let tags = new Set();
        for (const at of autoTags) {
            if (!at.tags?.length) continue;
            if (!at.title && !at.author) continue;

            const titleMatch = at.title
                ? new RegExp(at.title, "i").test(paper.title)
                : true;
            const authorMatch = at.author
                ? new RegExp(at.author, "i").test(paper.author)
                : true;

            if (titleMatch && authorMatch) {
                at.tags.forEach((t) => tags.add(t));
            }
        }
        paper.tags = [...tags].sort();
        if (paper.tags.length) {
            log("Automatically adding tags:", paper.tags);
        }
        return paper;
    } catch (error) {
        log("Error auto-tagging:", error);
        log("Paper:", paper);
        return paper;
    }
};

const makePaper = async (is, url, tab = false) => {
    let paper;
    if (tab) {
        paper = await makeWebsitePaper(tab);
        if (paper) {
            paper.source = "website";
        }
    } else if (is.arxiv) {
        paper = await makeArxivPaper(url);
        if (paper) {
            paper.source = "arxiv";
        }
        // paper.codes = await fetchCodes(paper)
    } else if (is.neurips) {
        paper = await makeNeuripsPaper(url);
        if (paper) {
            paper.source = "neurips";
        }
        // paper.codes = await fetchCodes(paper);
    } else if (is.cvf) {
        paper = await makeCVFPaper(url);
        if (paper) {
            paper.source = "cvf";
        }
    } else if (is.openreview) {
        paper = await makeOpenReviewPaper(url);
        if (paper) {
            paper.source = "openreview";
        }
    } else if (is.biorxiv) {
        paper = await makeBioRxivPaper(url);
        if (paper) {
            paper.source = "biorxiv";
        }
    } else if (is.pmlr) {
        paper = await makePMLRPaper(url);
        if (paper) {
            paper.source = "pmlr";
        }
    } else if (is.acl) {
        paper = await makeACLPaper(url);
        if (paper) {
            paper.source = "acl";
        }
    } else if (is.pnas) {
        paper = await makePNASPaper(url);
        if (paper) {
            paper.source = "pnas";
        }
    } else if (is.nature) {
        paper = await makeNaturePaper(url);
        if (paper) {
            paper.source = "nature";
        }
    } else if (is.acs) {
        paper = await makeACSPaper(url);
        if (paper) {
            paper.source = "acs";
        }
    } else if (is.iop) {
        paper = await makeIOPPaper(url);
        if (paper) {
            paper.source = "iop";
        }
    } else if (is.jmlr) {
        paper = await makeJMLRPaper(url);
        if (paper) {
            paper.source = "jmlr";
        }
    } else if (is.pmc) {
        paper = await makePMCPaper(url);
        if (paper) {
            paper.source = "pmc";
        }
    } else if (is.ijcai) {
        paper = await makeIJCAIPaper(url);
        if (paper) {
            paper.source = "ijcai";
        }
    } else if (is.acm) {
        paper = await makeACMPaper(url);
        if (paper) {
            paper.source = "acm";
        }
    } else if (is.ieee) {
        paper = await makeIEEEPaper(url);
        if (paper) {
            paper.source = "ieee";
        }
    } else if (is.springer) {
        paper = await makeSpringerPaper(url);
        if (paper) {
            paper.source = "springer";
        }
    } else if (is.aps) {
        paper = await makeAPSPaper(url);
        if (paper) {
            paper.source = "aps";
        }
    } else if (is.wiley) {
        paper = await makeWileyPaper(url);
        if (paper) {
            paper.source = "wiley";
        }
    } else if (is.sciencedirect) {
        paper = await makeScienceDirectPaper(url);
        if (paper) {
            paper.source = "sciencedirect";
        }
    } else if (is.science) {
        paper = await makeSciencePaper(url);
        if (paper) {
            paper.source = "science";
        }
    } else if (is.frontiers) {
        paper = await makeFrontiersPaper(url);
        if (paper) {
            paper.source = "frontiers";
        }
    } else if (is.ihep) {
        paper = await makeIHEPPaper(url);
        if (paper) {
            paper.source = "ihep";
        }
    } else if (is.plos) {
        paper = await makePLOSPaper(url);
        if (paper) {
            paper.source = "plos";
        }
    } else if (is.rsc) {
        paper = await makeRSCPaper(url);
        if (paper) {
            paper.source = "rsc";
        }
    } else if (is.mdpi) {
        paper = await makeMDPIPaper(url);
        if (paper) {
            paper.source = "mdpi";
        }
    } else if (is.oup) {
        paper = await makeOUPPaper(url);
        if (paper) {
            paper.source = "oup";
        }
    } else if (is.hal) {
        paper = await makerHALPaper(url);
        if (paper) {
            paper.source = "hal";
        }
    } else if (is.chemrxiv) {
        paper = await makeChemRxivPaper(url);
        if (paper) {
            paper.source = "chemrxiv";
        }
    } else {
        throw new Error("Unknown paper source: " + JSON.stringify({ is, url }));
    }

    if (typeof paper === "undefined") {
        return;
    }

    return await initPaper(paper);
};

const findFuzzyPaperMatch = (hashes, paper) => {
    const paperHash = miniHash(paper.title);
    if (hashes.hasOwnProperty(paperHash)) {
        const matches = hashes[paperHash];
        const nonPreprint = matches.find(
            (m) => !global.preprintSources.some((s) => m.toLowerCase().startsWith(s))
        );
        if (nonPreprint) {
            return nonPreprint;
        }
        return matches[0];
    }
    return null;
};

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = {
        decodeHtml,
        flipAuthor,
        flipAndAuthors,
        fetchArxivXML,
        fetchCvfHTML,
        getOpenReviewNoteJSON,
        getOpenReviewForumJSON,
        fetchDom,
        fetchText,
        fetchJSON,
        fetchBibtex,
        extractCrossrefData,
        fetchCrossRefDataForDoi,
        fetchSemanticScholarDataForDoi,
        getMetaContent,
        extractDataFromDCMetaTags,
        makeArxivPaper,
        makeNeuripsPaper,
        makeCVFPaper,
        makeOpenReviewBibTex,
        extractAPIv2ContentValue,
        makeOpenReviewPaper,
        makeBioRxivPaper,
        makePMLRPaper,
        findACLValue,
        makeACLPaper,
        makePNASPaper,
        makeNaturePaper,
        makeACSPaper,
        makeIOPPaper,
        makeJMLRPaper,
        makePMCPaper,
        makePubMedPaper,
        makeIJCAIPaper,
        makeACMPaper,
        makeIEEEPaper,
        makeSpringerPaper,
        makeAPSPaper,
        makeWileyPaper,
        makeScienceDirectPaper,
        makeSciencePaper,
        makeFrontiersPaper,
        makeIHEPPaper,
        makePLOSPaper,
        makeRSCPaper,
        makeWebsitePaper,
        makeMDPIPaper,
        makeOUPPaper,
        makerHALPaper,
        tryPWCMatch,
        tryCrossRef,
        tryDBLP,
        trySemanticScholar,
        tryGoogleScholar,
        tryUnpaywall,
        tryPreprintMatch,
        initPaper,
        autoTagPaper,
        makePaper,
        findFuzzyPaperMatch,
    };
}

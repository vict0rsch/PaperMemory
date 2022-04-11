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
    const arxivId = paperId.replace("Arxiv-", "");
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

const fetchOpenReviewNoteJSON = async (url) => {
    const id = url.match(/id=([\w-])+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?id=${id}`;
    return fetch(api).then((response) => {
        return response.json();
    });
};
const fetchOpenReviewForumJSON = async (url) => {
    const id = url.match(/id=([\w-])+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?forum=${id}`;
    return fetch(api).then((response) => {
        return response.json();
    });
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
        console.log("fetchText error:", error);
        return "";
    }
};

// -------------------
// -----  Parse  -----
// -------------------

const makeArxivPaper = async (memoryId) => {
    const response = await fetchArxivXML(memoryId);
    const xmlData = await response.text();
    var doc = new DOMParser().parseFromString(xmlData.replaceAll("\n", ""), "text/xml");

    const authors = Array.from(doc.querySelectorAll("author name")).map(
        (el) => el.innerHTML
    );
    const author = authors.join(" and ");

    const pdfLink = Array.from(doc.getElementsByTagName("link"))
        .map((l) => l.getAttribute("href"))
        .filter((h) => h.includes("arxiv.org/pdf/"))[0]
        .replace(/v\d+\.pdf$/gi, ".pdf");

    const title = doc.querySelector("entry title").innerHTML;
    const year = doc.querySelector("entry published").innerHTML.slice(0, 4);
    const key =
        authors[0].split(" ").last().toLowerCase() +
        year +
        firstNonStopLowercase(title);

    const id = memoryId;
    const conf = "arXiv";

    let bibtex = "";
    bibtex += `@article{${key},\n`;
    bibtex += `    title={${title} },\n`;
    bibtex += `    author={${author} },\n`;
    bibtex += `    year={${year}},\n`;
    bibtex += `    journal={arXiv preprint arXiv: ${id}}\n`;
    bibtex += `}`;

    const venue = "";

    return { author, bibtex, conf, id, key, pdfLink, title, venue, year };
};

const makeNeuripsPaper = async (url) => {
    if (url.endsWith(".pdf")) {
        url = url.replace("/file/", "/hash/").replace("-Paper.pdf", "-Abstract.html");
    }
    const hash = url.split("/").slice(-1)[0].replace("-Paper.pdf", "");

    const dom = await fetchDom(url);

    const citeUrl = Array.from(dom.getElementsByTagName("a"))
        .filter((a) => a.innerText === "Bibtex")[0]
        ?.getAttribute("href");

    let bibtex, author, title, year, key;

    if (citeUrl) {
        bibtex = await fetchText(`${parseUrl(url).host}${citeUrl}`);
        ({ author, citationKey, title, year } = bibtexToObject(bibtex));
        author = flipAndAuthors(author);
        key = citationKey;
    } else {
        const paragraphs = Array.from(dom.querySelectorAll(".container-fluid .col p"));

        title = dom.getElementsByTagName("h4")[0].innerHTML;
        const h4Authors = Array.from(document.querySelectorAll("h4")).filter(
            (h) => h.innerText === "Authors"
        )[0];

        author = h4Authors.nextElementSibling.innerText
            .split(", ")
            .map((author, k) => {
                const parts = author.split(" ");
                const caps = parts.map((part, i) => {
                    return capitalize(part);
                });
                return caps.join(" ");
            })
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
    const conf = `NeurIPS ${year}`;
    const note = `Accepted @ ${conf}`;

    const venue = "NeurIPS";

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
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
        const href = Array.from(dom.getElementsByTagName("a"))
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
    const note = `Accepted @ ${conf} ${year}`;
    const bibtex = bibtexToString(dom.querySelector(".bibref").innerText);
    const key = bibtex.split("{")[1].split(",")[0];
    const venue = conf;

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
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

const makeOpenReviewPaper = async (url) => {
    const noteJson = await fetchOpenReviewNoteJSON(url);
    const forumJson = await fetchOpenReviewForumJSON(url);

    var paper = noteJson.notes[0];
    var forum = forumJson.notes;

    const title = paper.content.title;
    const author = paper.content.authors.join(" and ");
    const bibtex = bibtexToString(
        paper.content._bibtex || makeOpenReviewBibTex(paper, url)
    );
    const obj = bibtexToObject(bibtex);
    const key = obj.citationKey;
    const year = obj.year;

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

    const confParts = paper.invitation.split("/");
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

    candidates = forum.filter((r) => {
        return (
            r &&
            r.content &&
            ["Final Decision", "Paper Decision", "Acceptance Decision"].indexOf(
                r.content.title
            ) > -1
        );
    });
    let venue = "";
    if (candidates && candidates.length > 0) {
        decision = candidates[0].content.decision
            .split(" ")
            .map((v, i) => {
                return i === 0 ? v + "ed" : v;
            })
            .join(" ");
        note = `${decision} @ ${conf} ${year}`;
        if (decision.toLowerCase().indexOf("rejected") < 0) {
            venue = conf;
        }
    }

    if (author === "Anonymous") {
        note = `Under review @ ${conf} ${year} (${new Date().toLocaleDateString()})`;
    }

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
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

    const conf = "BioRxiv";
    const id = await parseIdFromUrl(url);
    const key = bibtex.split("\n")[0].split("{")[1].replace(",", "").trim();
    const note = "";
    const pdfLink = cleanBiorxivURL(url) + ".full.pdf";
    const title = paper.title;
    const year = paper.date.split("-")[0];
    const venue = "";

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
};

const makePMLRPaper = async (url) => {
    const key = url.split("/").last().split(".")[0];
    const id = await parseIdFromUrl(url);

    const absURL = url.includes(".html")
        ? url
        : url.split("/").slice(0, -2).join("/") + `/${key}.html`;

    const pdfLink = absURL.replace(".html", "") + `/${key}.pdf`;

    const dom = await fetchDom(absURL);

    const bibURL = dom
        .getElementById("button-bibtex1")
        .getAttribute("onclick")
        .match(/https.+\.bib/)[0];
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
    note = "Accepted @ " + conf + ` (${year})`;
    for (const long in global.overridePMLRConfs) {
        if (conf.includes(long)) {
            venue = global.overridePMLRConfs[long];
            conf = venue + " " + year;
            note = "Accepted @ " + conf;
            break;
        }
    }

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
};

const findACLValue = (dom, key) => {
    const dt = Array.from(dom.querySelectorAll("dt")).filter((v) =>
        v.innerText.includes(key)
    )[0];
    return dt.nextElementSibling.innerText;
};

const makeACLPaper = async (url) => {
    url = url.replace(".pdf", "");
    const dom = await fetchDom(url);

    const bibtexEl = dom.getElementById("citeBibtexContent");
    if (!bibtexEl) return;

    const title = dom.getElementById("title").innerText;
    const bibtex = bibtexToString(bibtexEl.innerText);

    const bibtexData = bibtexToJson(bibtex)[0];
    const entries = bibtexData.entryTags;

    const year = entries.year;
    const author = entries.author
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

    const conf = findACLValue(dom, "Venue");
    const pdfLink = findACLValue(dom, "PDF");
    const aid = findACLValue(dom, "Anthology ID");

    const id = `ACL-${conf}-${year}_${aid}`;
    const note = `Accepted @ ${conf} ${year}`;
    const venue = conf;

    return { author, bibtex, conf, id, key, note, pdfLink, title, venue, year };
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
    const author = Array.from(
        dom.querySelectorAll(
            ".authors span[property='author'] a:not([property='email']):not(.orcid-id)"
        )
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
    const doi = Array.from(
        dom.querySelector(".self-citation").getElementsByTagName("a")
    )
        .map((a) => a.getAttribute("href"))
        .filter((a) => a.includes("https://doi.org"))[0]
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
    const author = Array.from(dom.querySelectorAll("ul.c-article-author-list li"))
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
    const id = `Nature_${hash}`;
    const doi = document
        .querySelector(".c-bibliographic-information__citation")
        .innerText.split("https://doi.org/")[1];
    const bibURL = `https://doi.org/${doi}`;
    const key = `${author.split(" ")[1]}${year}${firstNonStopLowercase(title)}`;
    const bibtex = bibtexToString(`@article{${key},
        author={${author}},
        title={${title}},
        journal = {${journal}},
        year={${year}},
        doi={${doi}},
        url={${bibURL}}
    }`);
    const note = `Published @ ${journal} (${year})`;
    const venue = journal;
    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeACSPaper = async (url) => {
    url = url.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
    const doi = url.replace("/abs/", "/").split("/doi/")[1];
    console.log("doi: ", doi);
    const citeUrl = `https://pubs.acs.org/action/downloadCitation?doi=${doi}&include=cit&format=bibtex&direct=true`;
    const bibtex = await fetchText(citeUrl);
    const data = bibtexToObject(bibtex);
    const author = data.author.replaceAll("\n", "").trim();
    const title = data.title.trim();
    const year = data.year.trim();
    const key = data.citationKey.trim();
    const pdfLink = url.replace("/doi/", "/doi/pdf/");
    const note = `Published @ ${data.journal} (${data.year})`;
    const id = `ACS_${doi.replaceAll(".", "").replaceAll("/", "")}`;
    const venue = data.journal;

    return { author, bibtex, id, key, note, pdfLink, title, venue, year };
};

const makeIOPPaper = async (url) => {
    url = url.split("#")[0];
    if (url.endsWith("/pdf")) url = url.slice(0, -4);
    const dom = await fetchDom(url);
    const bibtexPath = Array.from(dom.querySelectorAll(".btn-multi-block a"))
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
    const doi = url.split("/article/").last();
    const id = `IOPscience_${doi.replaceAll(".", "").replaceAll("/", "")}`;
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

const makePubMedPaper = async (url) => {
    const dom = await fetchDom(url);
    const metas = Array.from(dom.getElementsByTagName("meta")).filter((el) =>
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

// --------------------------------------------
// -----  Try CrossRef's API for a match  -----
// --------------------------------------------
/**
 * Looks for a title in crossref's database, querying titles and looking for an exact match. If no
 * exact match is found, it will return an empty note "". If a match is found and `item.event.name`
 * exists, it will be used for a new note.
 * @param {object} paper The paper to look for in crossref's database for an exact ttile match
 * @returns {string} The note for the paper as `Accepted @ ${items.event.name} -- [crossref.org]`
 */
const tryCrossRef = async (paper) => {
    try {
        // fetch crossref' api for the paper's title
        const title = encodeURI(paper.title);
        const api = `https://api.crossref.org/works?rows=1&mailto=schmidtv%40mila.quebec&select=event%2Ctitle&query.title=${title}`;
        const json = await fetch(api).then((response) => response.json());

        // assert the response is valid
        if (json.status !== "ok") {
            log(`[Crossref] ${api} returned ${json.message.status}`);
            return { note: null };
        }
        // assert there is a (loose) match
        if (json.message.items.length === 0) return { note: null };

        // compare matched item's title to the paper's title
        const crossTitle = json.message.items[0].title[0]
            .toLowerCase()
            .replaceAll("\n", " ")
            .replaceAll(/\s\s+/g, " ");
        const refTitle = paper.title
            .toLowerCase()
            .replaceAll("\n", " ")
            .replaceAll(/\s\s+/g, " ");
        if (crossTitle !== refTitle) {
            return { note: null };
        }

        // assert the matched item has an event with a name
        // (this may be too restrictive for journals, to improve)
        if (!json.message.items[0].event || !json.message.items[0].event.name) {
            return { note: null };
        }

        // return the note
        info("Found a CrossRef match");
        const venue = json.message.items[0].event.name.trim();
        const note = `Accepted @ ${venue} -- [crossref.org]`;
        return { venue, note };
    } catch (error) {
        // something went wrong, log the error, return {note: null}
        log("[Crossref]", error);
        return { note: null };
    }
};

const tryDBLP = async (paper) => {
    try {
        const title = encodeURI(paper.title);
        const api = `https://dblp.org/search/publ/api?q=${title}&format=json`;
        const json = await fetch(api).then((response) => response.json());

        if (
            !json.result ||
            !json.result.hits ||
            !json.result.hits.hit ||
            !json.result.hits.hit.length
        ) {
            return { note: null };
        }

        const hits = json.result.hits.hit.sort(
            (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10)
        );

        for (const hit of hits) {
            const hitTitle = decodeHtml(
                hit.info.title
                    .toLowerCase()
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
                const abbr = hit.info.venue.toLowerCase().replaceAll(".", "").trim();
                const venue = (
                    global.journalAbbreviations[abbr] || hit.info.venue
                ).trim();
                const year = hit.info.year;
                const url = hit.info.url;
                const note = `Accepted @ ${venue} ${year} -- [dblp.org]`;
                return { venue, note, bibtex };
            }
        }
        return { note: null };
    } catch (error) {
        // something went wrong, log the error, return {note: null}
        log("[DBLP]", error);
        return { note: null };
    }
};

const tryPreprintMatch = async (paper) => {
    let note, venue, bibtex;

    dblpMatch = await tryDBLP(paper);
    note = dblpMatch.note;
    venue = dblpMatch.venue;
    bibtex = dblpMatch.bibtex;
    if (!note) {
        log("[DBLP] No publication found");
        crossRefMatch = await tryCrossRef(paper);
        note = crossRefMatch.note;
        venue = crossRefMatch.venue;
    }
    if (!note) {
        log("[CrossRef] No publication found");
    }
    return { note, venue, bibtex };
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
    paper.codeLink = "";
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
        paper.tags = Array.from(tags).sort();
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

const makePaper = async (is, url, id) => {
    let paper;
    if (is.arxiv) {
        paper = await makeArxivPaper(id);
        paper.source = "arxiv";
        // paper.codes = await fetchCodes(paper)
    } else if (is.neurips) {
        paper = await makeNeuripsPaper(url);
        paper.source = "neurips";
        // paper.codes = await fetchCodes(paper);
    } else if (is.cvf) {
        paper = await makeCVFPaper(url);
        paper.source = "cvf";
    } else if (is.openreview) {
        paper = await makeOpenReviewPaper(url);
        paper.source = "openreview";
    } else if (is.biorxiv) {
        paper = await makeBioRxivPaper(url);
        paper.source = "biorxiv";
    } else if (is.pmlr) {
        paper = await makePMLRPaper(url);
        paper.source = "pmlr";
    } else if (is.acl) {
        paper = await makeACLPaper(url);
        if (paper) {
            paper.source = "pmlr";
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
    } else {
        throw new Error("Unknown paper source: " + JSON.stringify({ is, url, id }));
    }

    if (typeof paper === "undefined") {
        return;
    }

    return await initPaper(paper);
};

const findFuzzyPaperMatch = (paper) => {
    for (const paperId in global.state.papers) {
        if (paperId === "__dataVersion") continue;
        const item = global.state.papers[paperId];
        if (
            Math.abs(item.title.length - paper.title.length) <
            global.fuzzyTitleMatchMinDist
        ) {
            const dist = levenshtein(item.title, paper.title);
            if (dist < global.fuzzyTitleMatchMinDist) {
                return item.id;
            }
        }
    }
    return null;
};

// -------------------
// -----  Utils  -----
// -------------------

const extractBibtexValue = (bibtex, key) => {
    const regex = new RegExp(`${key}\\s?=\\s?{(.+)},`, "gi");
    console.log(regex);
    const match = regex.exec(bibtex);
    if (match) {
        const regex2 = new RegExp(`${key}\\s?=\\s?{`, "gi");
        return match[0].replace(regex2, "").slice(0, -2);
    }
    return "";
};

const extractAuthor = (bibtex) =>
    extractBibtexValue(bibtex, "author")
        .replaceAll("{", "")
        .replaceAll("}", "")
        .replaceAll("\\", "")
        .split(" and ")
        .map((a) => a.split(", ").reverse().join(" "))
        .join(" and ");

// -------------------
// -----  Fetch  -----
// -------------------

const fetchArxivXML = async (paperId) => {
    const arxivId = paperId.replace("Arxiv-", "");
    return $.get(`https://export.arxiv.org/api/query`, { id_list: arxivId });
};

const fetchNeuripsHTML = async (url) => {
    let paperPage;
    if (url.endsWith(".pdf")) {
        paperPage = url
            .replace("/file/", "/hash/")
            .replace("-Paper.pdf", "-Abstract.html");
    } else {
        paperPage = url;
    }

    return fetch(paperPage).then((response) => {
        return response.text();
    });
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
    const id = url.match(/id=\w+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?id=${id}`;
    return fetch(api).then((response) => {
        return response.json();
    });
};
const fetchOpenReviewForumJSON = async (url) => {
    const id = url.match(/id=\w+/)[0].replace("id=", "");
    const api = `https://api.openreview.net/notes?forum=${id}`;
    return fetch(api).then((response) => {
        return response.json();
    });
};

// -------------------
// -----  Parse  -----
// -------------------

const parseArxivBibtex = async (memoryId) => {
    let xmlData;
    if (typeof data === "undefined") {
        xmlData = await fetchArxivXML(memoryId);
    } else {
        xmlData = data;
    }
    var bib = $(xmlData);
    var authors = [];
    var key = "";
    bib.find("author name").each((k, v) => {
        authors.push($(v).text());
        if (k === 0) {
            key += $(v)
                .text()
                .split(" ")
                [$(v).text().split(" ").length - 1].toLowerCase();
        }
    });
    var pdfLink = "";
    bib.find("link").each((k, v) => {
        const link = $(v).attr("href");
        if (link && link.indexOf("arxiv.org/pdf/") >= 0) {
            pdfLink = link;
        }
    });
    const pdfVersion = pdfLink.match(/v\d+\.pdf/gi);
    if (pdfVersion && pdfVersion.length > 0) {
        pdfLink = pdfLink.replace(pdfVersion[0], ".pdf");
    }
    const author = authors.join(" and ");
    const title = $(bib.find("entry title")[0]).text();
    const year = $(bib.find("entry published")[0]).text().slice(0, 4);
    key += year;
    key += firstNonStopLowercase(title);

    const id = memoryId;
    const conf = "arXiv";

    let bibtex = "";
    bibtex += `@article{${key},\n`;
    bibtex += `    title={${title} },\n`;
    bibtex += `    author={${author} },\n`;
    bibtex += `    year={${year}},\n`;
    bibtex += `    journal={arXiv preprint arXiv: ${id}}\n`;
    bibtex += `}`;

    return { author, bibtex, conf, id, key, pdfLink, title, year };
};

const parseNeuripsHTML = async (url) => {
    const htmlText = await fetchNeuripsHTML(url);
    const dom = new DOMParser().parseFromString(
        htmlText.replaceAll("\n", ""),
        "text/html"
    );
    const doc = $(dom);

    const ps = doc.find(".container-fluid .col p");
    const hash = url.split("/").slice(-1)[0].replace("-Paper.pdf", "");

    const title = doc.find("h4").first().text();
    const author = $(ps[1])
        .text()
        .split(", ")
        .map((author, k) => {
            const parts = author.split(" ");
            const caps = parts.map((part, i) => {
                return capitalize(part);
            });
            return caps.join(" ");
        })
        .join(" and ");
    const pdfLink = url;
    const year = $(ps[0]).text().match(/\d{4}/)[0];
    const key = `neurips${year}${hash.slice(0, 8)}`;
    const id = `NeurIPS-${year}_${hash.slice(0, 8)}`;
    const conf = `NeurIPS ${year}`;
    const note = `Accepted @ ${conf}`;

    let bibtex = "";

    bibtex += `@inproceedings{NEURIPS${year}_${hash.slice(0, 8)},\n`;
    bibtex += `    author={${author}},\n`;
    bibtex += `    booktitle={Advances in Neural Information Processing Systems},\n`;
    bibtex += `    editor={H.Larochelle and M.Ranzato and R.Hadsell and M.F.Balcan and H.Lin},\n`;
    bibtex += `    publisher={Curran Associates, Inc.},\n`;
    bibtex += `    title={${title}},\n`;
    bibtex += `    url={${url}},\n`;
    bibtex += `    year={${year}}\n`;
    bibtex += `}`;

    return { author, bibtex, conf, id, key, note, pdfLink, title, year };
};

const parseCvfHTML = async (url) => {
    const htmlText = await fetchCvfHTML(url);
    const dom = new DOMParser().parseFromString(
        htmlText.replaceAll("\n", ""),
        "text/html"
    );
    const doc = $(dom);

    const title = doc.find("#papertitle").text().trim();
    let author = doc.find("#authors i").first().text();
    author = author
        .split(",")
        .map((a) => a.trim())
        .join(" and ");
    const { year, id, conf } = parseCVFUrl(url);
    let pdfLink = "";
    if (url.endsWith(".pdf")) {
        pdfLink = url;
    } else {
        doc.find("a").each((k, v) => {
            if ($(v).text() === "pdf") {
                let href = $(v).attr("href");
                if (href.startsWith("../")) {
                    href = href.replaceAll("../", "");
                }
                if (!href.startsWith("/")) {
                    href = "/" + href;
                }
                pdfLink = "http://openaccess.thecvf.com" + href;
            }
        });
    }
    const note = `Accepted @ ${conf} ${year}`;
    const bibtex = doc.find(".bibref").first().text();
    const key = bibtex.split("{")[1].split(",")[0];

    return { author, bibtex, conf, id, key, note, pdfLink, title, year };
};

makeOpenReviewBibTex = (paper, url) => {
    const title = paper.content.title;
    const author = paper.content.authors.join(" and ");
    const year = paper.cdate ? new Date(paper.cdate).getFullYear() : "0000";
    if (!paper.cdate) {
        console.log("makeOpenReviewBibTex: no cdate found in", paper);
    }

    let key = paper.content.authors[0].split(" ").reverse()[0];
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

const parseOpenReviewJSON = async (url) => {
    const noteJson = await fetchOpenReviewNoteJSON(url);
    const forumJson = await fetchOpenReviewForumJSON(url);

    var paper = noteJson.notes[0];
    console.log("paper: ", paper);
    var forum = forumJson.notes;
    console.log("forum: ", forum);

    const title = paper.content.title;
    const author = paper.content.authors.join(" and ");
    const bibtex = paper.content._bibtex || makeOpenReviewBibTex(paper, url);
    const key = bibtex.split("{")[1].split(",")[0].trim();
    const year = bibtex.split("year={")[1].split("}")[0];

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
    console.log("forum: ", forum);
    if (candidates && candidates.length > 0) {
        decision = candidates[0].content.decision
            .split(" ")
            .map((v, i) => {
                return i === 0 ? v + "ed" : v;
            })
            .join(" ");
        note = `${decision} @ ${conf} ${year}`;
    }

    if (author === "Anonymous") {
        note = `Under review @ ${conf} ${year} (${new Date().toLocaleDateString()})`;
    }

    return { author, bibtex, conf, id, key, note, pdfLink, title, year };
};

const parseBiorxivJSON = async (url) => {
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

    const paper = data.collection.reverse()[0];

    const pageData = await fetch(pageURL);
    const pageText = await pageData.text();
    const dom = new DOMParser().parseFromString(
        pageText.replaceAll("\n", ""),
        "text/html"
    );
    const bibtextLink = dom.querySelector(".bibtext a").href;
    const bibtex = await (await fetch(bibtextLink)).text();

    const author = extractAuthor(bibtex);

    const conf = "BioRxiv";
    const id = parseIdFromUrl(url);
    const key = bibtex.split("\n")[0].split("{")[1].replace(",", "").trim();
    const note = "";
    const pdfLink = cleanBiorxivURL(url) + ".full.pdf";
    const title = paper.title;
    const year = paper.date.split("-")[0];

    return { author, bibtex, conf, id, key, note, pdfLink, title, year };
};

const parsePMLRHTML = async (url) => {
    const key = url.split("/").reverse()[0].split(".")[0];
    const id = parseIdFromUrl(url);

    const absURL = url.includes(".html")
        ? url
        : url.split("/").slice(0, -2).join("/") + `${key}.html`;

    const pdfLink = absURL.replace(".html", "") + `/${key}.pdf`;

    const doc = new DOMParser().parseFromString(
        (await (await fetch(absURL)).text()).replaceAll("\n", ""),
        "text/html"
    );

    const bibURL = doc
        .getElementById("button-bibtex1")
        .getAttribute("onclick")
        .match(/https.+\.bib/)[0];
    const bibtexRaw = doc
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

    const author = extractAuthor(bibtex);
    const title = doc.getElementsByTagName("h1")[0].innerText;
    const year = extractBibtexValue(bibtex, "year");

    let conf = extractBibtexValue(bibtex, "booktitle").replaceAll(
        "Proceedings of the",
        ""
    );
    note = "Accepted @ " + conf + ` (${year})`;
    for (const long in global.overridePMLRConfs) {
        if (conf.includes(long)) {
            conf = global.overridePMLRConfs[long] + " " + year;
            note = "Accepted @ " + conf;
            break;
        }
    }

    return { author, bibtex, conf, id, key, note, pdfLink, title, year };
};

// ----------------------------------------------
// -----  Papers With Code: non functional  -----
// ----------------------------------------------

const fetchOpts = {
    headers: {
        mode: "no-cors",
    },
};

const fetchPWCId = async (arxiv_id, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxiv_id) {
        pwcPath += new URLSearchParams({ arxiv_id });
    } else if (title) {
        pwcPath += new URLSearchParams({ title });
    }
    const json = await $.getJSON(pwcPath);
    console.log({ json });

    if (json["count"] !== 1) return;
    return json["results"][0]["id"];
};

const fetchCodes = async (paper) => {
    let arxiv_id, title;
    if ((paper.source = "neurips")) {
        title = paper.title;
    } else {
        arxiv_id = paper.id;
    }

    const pwcId = await fetchPWCId(arxiv_id, title);
    if (!pwcId) return [];

    let codePath = `https://paperswithcode.com/api/v1/papers/${pwcId}/repositories/?`;
    codePath += new URLSearchParams({ page: 1, items_per_page: 10 });

    const response = await fetch(codePath);
    const json = await response.json();
    if (json["count"] < 1) return;

    let codes = json["results"];
    codes.sort((a, b) => a.stars - b.stars);
    return codes.slice(0, 5);
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
            console.log(`[PM][Crossref] ${api} returned ${json.message.status}`);
            return "";
        }
        // assert there is a (loose) match
        if (json.message.items.length === 0) return "";

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
            return "";
        }

        // assert the matched item has an event with a name
        // (this may be too restrictive for journals, to improve)
        if (!json.message.items[0].event || !json.message.items[0].event.name)
            return "";

        // return the note
        info("Found a CrossRef match");
        return `Accepted @ ${json.message.items[0].event.name.trim()} -- [crossref.org]`;
    } catch (error) {
        // something went wrong, log the error, return ""
        console.log("[PM][Crossref]", error);
        return "";
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
            console.log("[PM][DBLP] No hits found");
            return "";
        }

        const hits = json.result.hits.hit.sort(
            (a, b) => parseInt(a.info.year, 10) - parseInt(b.info.year, 10)
        );

        for (const hit of hits) {
            const hitTitle = hit.info.title
                .toLowerCase()
                .replaceAll("\n", " ")
                .replaceAll(".", "")
                .replaceAll(/\s\s+/g, " ");
            const refTitle = paper.title
                .toLowerCase()
                .replaceAll("\n", " ")
                .replaceAll(".", "")
                .replaceAll(/\s\s+/g, " ");
            if (hitTitle === refTitle && hit.info.venue !== "CoRR") {
                info("Found a DBLP match");
                const venue =
                    global.overrideDBLPVenues[hit.info.venue] || hit.info.venue;
                const year = hit.info.year;
                const url = hit.info.url;
                const note = `Accepted @ ${venue.trim()} ${year} -- [dblp.org]\n${url}`;
                return note;
            }
        }
        console.log("[PM][DBLP] No match found");
        return "";
    } catch (error) {
        // something went wrong, log the error, return ""
        console.log("[PM][DBLP]", error);
        return "";
    }
};

const tryPreprintMatch = async (paper) => {
    let note = "";
    note = await tryDBLP(paper);
    if (!note) {
        note = await tryCrossRef(paper);
    }
    return note;
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

    for (const k in paper) {
        if (paper.hasOwnProperty(k) && typeof paper[k] === "string") {
            paper[k] = paper[k].trim();
        }
    }

    validatePaper(paper);

    return paper;
};

const makePaper = async (is, url, id) => {
    let paper;
    if (is.arxiv) {
        paper = await parseArxivBibtex(id);
        paper.source = "arxiv";
        // paper.codes = await fetchCodes(paper)
    } else if (is.neurips) {
        paper = await parseNeuripsHTML(url);
        paper.source = "neurips";
        // paper.codes = await fetchCodes(paper);
    } else if (is.cvf) {
        paper = await parseCvfHTML(url);
        paper.source = "cvf";
    } else if (is.openreview) {
        paper = await parseOpenReviewJSON(url);
        paper.source = "openreview";
    } else if (is.biorxiv) {
        paper = await parseBiorxivJSON(url);
        paper.source = "biorxiv";
    } else if (is.pmlr) {
        paper = await parsePMLRHTML(url);
        paper.source = "pmlr";
    } else {
        throw Error("Unknown paper source: " + JSON.stringify({ is, url, id }));
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

const addOrUpdatePaper = async (url, is, checks) => {
    let paper, isNew;

    // Extract id from url
    const id = parseIdFromUrl(url);
    console.log("id: ", id);

    if (id && global.state.papers.hasOwnProperty(id)) {
        // Update paper if it exists
        global.state.papers = updatePaper(global.state.papers, id);
        paper = global.state.papers[id];
        isNew = false;
    } else {
        // Or create a new one if it does not
        paper = await makePaper(is, url, id);
        const existingId = null; // findFuzzyPaperMatch(paper);
        if (existingId) {
            // Update paper as already it exists
            info(
                `Found a fuzzy match for (${id}) ${paper.title}`,
                global.state.papers[existingId]
            );
            global.state.papers = updatePaper(global.state.papers, existingId);
            paper = global.state.papers[existingId];
            isNew = false;
        } else {
            global.state.papers[paper.id] = paper;
            isNew = true;
        }
    }

    chrome.storage.local.set({ papers: global.state.papers }, async () => {
        if (isNew) {
            console.log("Added '" + paper.title + "' to your Memory");
            console.log("paper: ", paper);
            // display red slider feedback if the user did not disable it
            // from the menu
            checks && checks.checkFeedback && feedback("Added to your Memory!", paper);
            console.log("note", paper.note);
            if (!paper.note) {
                const note = await tryPreprintMatch(paper);
                console.log("note: ", note);
                if (note) {
                    console.log("[PM] Updating preprint note to", note);
                    paper.note = note;
                    global.state.papers[paper.id] = paper;
                    chrome.storage.local.set({ papers: global.state.papers });
                }
            }
        } else {
            console.log("Updated '" + paper.title + "' in your Memory");
        }
    });

    return { paper, id };
};

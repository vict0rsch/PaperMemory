// ES Module imports
import {
    log,
    info,
    warn,
    logError,
    eventId,
    miniHash,
    cleanStr,
    sendMessageToBackground,
    getStoredFiles,
    noParamUrl,
    urlToWebsiteId,
    parseUrl,
    consoleHeader,
    logOk,
    silentPromiseTimeout,
    cleanPapers,
    arxivIdFromURL,
    cleanBiorxivURL,
    parseCVFUrl,
    isPdfUrl,
} from "@pmu/functions.js";
import {
    state,
    knownPaperPages,
    preprintSources,
    overrideORConfs,
    overridePMLRConfs,
    overrideDBLPVenues,
    sourceExtras,
} from "@pmu/config.js";
import {
    getStorage,
    setStorage,
    getTheme,
    validatePaper,
    makeVenue,
    makeTitleHashToIdList,
    deletePaperInStorage,
    updateDuplicatedUrls,
} from "@pmu/data.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { pushToRemote } from "@pmu/sync.js";
import {
    tryPWCMatch,
    tryPreprintMatch,
    makePaper,
    findCellPii,
    parseAIPIdOrDOI,
} from "@pmu/parsers.js";
import { parseIdFromUrl } from "@pmu/urls.js";
import { findLocalFile, isKnownLocalFile } from "@pmu/files.js";

/**
 * Is this url associated with a known paper source?
 * For each known paper source in config.js/knownPaperPages, this function
 * checks whether the url includes one of the listed paths.
 * Also checks for local files in the PaperMemoryStore
 *
 * @param {string} url the url to check
 * @param {boolean} noStored if true, don't check for local files
 * @returns {object} boolean map from sources.
 */
export const isPaper = async (url, noStored = false) => {
    let is = {};
    if (!url) return is;
    for (const source in knownPaperPages) {
        const patterns = knownPaperPages[source].patterns;
        // default source status: false
        is[source] = false;
        for (const pattern of patterns) {
            if (typeof pattern === "string") {
                if (url.includes(pattern)) {
                    // known pattern: store as true
                    is[source] = true;
                }
            } else if (typeof pattern === "function") {
                is[source] = pattern(url) ?? false;
            }
            if (is[source]) break;
        }
    }
    // is the url a local file in the memory?
    is.localFile = isKnownLocalFile(url) ?? false;
    is.stored = noStored ? false : ((await findLocalFile(url)) ?? false);
    is.parsedWebsite = state.papers[`Website_${urlToWebsiteId(url)}`] ?? false;
    return is;
};

export const findFuzzyPaperMatch = (hashes, paper) => {
    const paperHash = miniHash(paper.title);
    if (hashes.hasOwnProperty(paperHash)) {
        const matches = hashes[paperHash];
        const nonPreprint = matches.find(
            (m) => !preprintSources.some((s) => m.toLowerCase().startsWith(s)),
        );
        if (nonPreprint) {
            return nonPreprint;
        }
        return matches[0];
    }
    return null;
};

/**
 * Get the url to the paper's abstract / display page.
 * In other words: not not the pdf's.
 * eg: https://arxiv.org/abs/1901.01234 (not https://arxiv.org/pdf/1901.01234.pdf)
 *
 * @param {object} paper the paper whose abstract url we're looking for
 * @returns {string} the url to the paper's abstract
 */
export const paperToAbs = (paper) => {
    var journal, type, doi, pii;
    const pdf = paper.pdfLink;
    var abs = "";
    switch (paper.source) {
        case "arxiv":
            abs = pdf.replace("/pdf/", "/abs/").replace(".pdf", "");
            break;

        case "neurips":
            abs = pdf
                .replace("/file/", "/hash/")
                .replace("-Paper.pdf", "-Abstract.html");
            break;

        case "cvf":
            abs = pdf.replace("/papers/", "/html/").replace(".pdf", ".html");
            break;

        case "openreview":
            abs = pdf.replace("/pdf?", "/forum?");
            break;

        case "biorxiv":
            abs = pdf.replace(".full.pdf", "");
            break;

        case "pmlr":
            abs = pdf.split("/").slice(0, -1).join("/") + ".html";
            break;

        case "acl":
            abs = pdf.replace(".pdf", "");
            break;
        case "pnas":
            abs = pdf.replace(".full.pdf", "").replace("/doi/pdf/", "/doi/full/");
            break;
        case "nature":
            abs = pdf.replace(".pdf", "");
            break;
        case "acs":
            abs = pdf
                .replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/")
                .split("?")[0];
            break;
        case "iop":
            abs = pdf.split("#")[0].replace(/\/pdf$/, "");
            break;
        case "jmlr":
            abs =
                pdf
                    .split("/")
                    .slice(0, -1)
                    .join("/")
                    .replace("/papers/volume", "/papers/v") + ".html";
            break;
        case "pmc":
            const pmcid = pdf.match(/PMC\d+/)[0];
            abs = pdf.split(pmcid)[0] + pmcid;
            break;

        case "ijcai":
            const procId = pdf
                .replace(".pdf", "")
                .split("/")
                .last()
                .match(/[1-9]\d*/);
            const year = pdf.match(/proceedings\/\d+/gi)[0].split("/")[1];
            abs = `https://www.ijcai.org/proceedings/${year}/${procId}`;
            break;
        case "acm":
            abs = pdf.replace("/doi/pdf/", "/doi/");
            break;

        case "ieee":
            abs = `https://ieeexplore.ieee.org/document/${paper.key}`;
            break;

        case "springer":
            abs = paper.extra.url;
            break;

        case "aps":
            const urlParts = parseUrl(pdf).pathname.split("/").slice(1, 3);
            journal = urlParts[0];
            type = urlParts[1];
            abs = pdf.replace(`/${journal}/${type}/`, `/${journal}/abstract/`);
            break;

        case "wiley":
            abs = pdf.replace(/\/doi\/e?pdf\//g, `/doi/abs/`);
            break;

        case "sciencedirect":
            pii = pdf.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
            abs = `https://www.sciencedirect.com/science/article/pii/${pii}`;
            break;

        case "science":
            doi = pdf.split("/doi/")[1];
            if (!doi.startsWith("10.")) {
                doi = doi.split("/").slice(1).join("/");
            }
            abs = `https://science.org/doi/full/${doi}`;
            break;

        case "frontiers":
            abs = pdf.replace(/\/pdf$/, "/full");
            break;

        case "ihep":
            abs = `https://inspirehep.net/literature/${paper.id.split("-")[1]}`;
            break;

        case "plos":
            abs = pdf.replace("/article/file?", "/article?").split("&")[0];
            break;

        case "rsc":
            abs = pdf.replace("/articlepdf/", "/articlelanding/");
            break;

        case "website":
            abs = paper.pdfLink;
            break;

        case "mdpi":
            abs = paper.pdfLink.split("/pdf")[0];
            break;

        case "oup":
            abs = `https://doi.org/${paper.doi}`;
            break;

        case "hal":
            abs = pdf.split("/file/")[0].split("/document")[0];
            break;

        case "chemrxiv":
            abs = `https://chemrxiv.org/engage/chemrxiv/article-details/${
                pdf.split("/item/")[1].split("/")[0]
            }`;
            break;

        case "cell":
            journal = paper.id.split("_")[0].split("fulltext")[0];
            pii = new URL(pdf).searchParams.get("pii");
            abs = `https://www.cell.com/${journal}/fulltext/${pii}`;
            break;

        case "aip":
            abs = `https://doi.org/${paper.doi}`;
            break;

        default:
            abs = "https://xkcd.com/1969/";
            break;
    }

    return abs.replace("http://", "https://");
};

/**
 * Get the url to the paper's online pdf.
 *
 * @param {object} paper the paper whose pdf url we're looking for
 * @returns {string} the url to the paper's pdf
 */
export const paperToPDF = (paper) => {
    let pdf = paper.pdfLink;
    switch (paper.source) {
        case "arxiv":
            // remove potential version so it's to the latest
            pdf = pdf
                .replace("arxiv.org/abs/", "arxiv.org/pdf/")
                .replace(/\.pdf$/, "")
                .replace(/v\d+$/gi, "");
            pdf += ".pdf";

            break;

        case "neurips":
            pdf = pdf
                .replace("/hash/", "/file/")
                .replace("-Abstract.html", "-Paper.pdf");
            break;

        case "cvf":
            pdf = pdf.replace("/html/", "/papers/").replace(".html", ".pdf");
            break;

        case "openreview":
            pdf = pdf.replace("/forum?", "/pdf?");
            break;

        case "biorxiv":
            pdf = cleanBiorxivURL(pdf) + ".full.pdf";
            break;

        case "pmlr":
            break;

        case "acl":
            break;

        case "pnas":
            break;

        case "nature":
            if (!pdf.endsWith(".pdf")) pdf += ".pdf";
            break;
        case "iop":
            if (!pdf.endsWith("/pdf")) pdf += "/pdf";
            break;

        case "acs":
            break;

        case "jmlr":
            break;

        case "pmc":
            break;

        case "ijcai":
            break;

        case "acm":
            break;

        case "ieee":
            break;

        case "springer":
            break;

        case "aps":
            break;

        case "wiley":
            break;

        case "sciencedirect":
            break;

        case "science":
            break;

        case "frontiers":
            break;

        case "ihep":
            break;

        case "plos":
            break;

        case "rsc":
            break;

        case "mdpi":
            break;

        case "oup":
            break;

        case "hal":
            break;

        case "chemrxiv":
            break;

        case "website":
            break;

        case "cell":
            break;

        case "aip":
            break;

        default:
            pdf = "https://xkcd.com/1969/";
            break;
    }

    return pdf.replace("http://", "https://");
};

export const mergePapers = (options = { newPaper: {}, oldPaper: {} }) => {
    const { oldPaper, newPaper, ...extra } = options;
    let mergedPaper = { ...oldPaper };

    const defaults = {
        overwrites: ["lastOpenDate"],
        incrementCount: false,
        syncMerge: false,
    };

    const opts = { ...defaults, ...extra };

    for (const attribute in newPaper) {
        if (!oldPaper.hasOwnProperty(attribute)) {
            mergedPaper[attribute] = newPaper[attribute];
        } else if (newPaper[attribute] && !oldPaper[attribute]) {
            mergedPaper[attribute] = newPaper[attribute];
        }
    }
    if (opts.incrementCount && mergedPaper.count === 1) {
        mergedPaper.count += 1;
    }
    if (opts.syncMerge) {
        // add counts
        mergedPaper.count = oldPaper.count + newPaper.count;

        // combine notes
        mergedPaper.note = oldPaper.note ?? "";
        if (newPaper.note && newPaper.note !== oldPaper.note) {
            mergedPaper.note += "\n\n--[Sync Merge]--\n";
            mergedPaper.note += newPaper.note;
        }

        // combine tags
        mergedPaper.tags = [...oldPaper.tags, ...newPaper.tags];

        mergedPaper.lastOpenDate = newPaper.lastOpenDate;
        // keep most recent open date
        if (newPaper.lastOpenDate > oldPaper.lastOpenDate) {
            mergedPaper.lastOpenDate = newPaper.lastOpenDate;
        }
        mergedPaper.addDate = newPaper.addDate;
        // keep oldest add date
        if (newPaper.addDate > oldPaper.addDate) {
            mergedPaper.addDate = newPaper.addDate;
        }
    }
    for (const attribute of opts.overwrites) {
        if (newPaper.hasOwnProperty(attribute)) {
            mergedPaper[attribute] = newPaper[attribute];
        }
    }

    return mergedPaper;
};

export const updatePaperVisits = (paper) => {
    paper.count += 1;
    paper.lastOpenDate = new Date().toJSON();
    log("Updating paper to:", paper);
    return paper;
};

/**
 *  Adds a new paper to the memory or updates the counts and open dates of an existing paper.
 *
 * @param {string} url The url from which to parse a paper
 * @param {object} is The paper's source info
 * @param {object} checks The user's preferences
 * @returns
 */
export const addOrUpdatePaper = async ({
    url,
    is,
    prefs,
    tab,
    store = true,
    contentScriptCallbacks = { update: () => {}, preprints: () => {}, feedback: null },
}) => {
    // start time
    const aouStart = Date.now();

    let paper, isNew;
    let pwc = {};

    consoleHeader(`PaperMemory Parsing ${String.fromCodePoint("0x1F4DD")}`);

    // Extract id from url
    state.papers = (await getStorage("papers")) ?? {};
    const id = await parseIdFromUrl(url, tab);
    const paperExists = state.papers.hasOwnProperty(id);
    prefs &&
        prefs.checkFeedback &&
        contentScriptCallbacks.feedback &&
        contentScriptCallbacks.feedback({ loading: true });

    if (id && paperExists && state.papers[id].author.toLowerCase() !== "anonymous") {
        // Update paper if it exists
        paper = updatePaperVisits(state.papers[id]);
        isNew = false;
    } else {
        // Or create a new one if it does not
        let newPaper = await makePaper(is, url, tab);
        if (!newPaper) {
            return;
        }
        state.titleHashToIds = makeTitleHashToIdList(state.papers);
        const existingId = findFuzzyPaperMatch(state.titleHashToIds, newPaper);
        if (existingId && store) {
            // Update paper as already it exists
            let existingPaper = state.papers[existingId];
            log("New paper", newPaper, "already exists as", existingPaper);
            addPaperToTitleHashToId(newPaper);

            if (existingPaper.venue) {
                let overwrites = ["lastOpenDate"];
                if (existingPaper.author.toLowerCase() === "anonymous") {
                    overwrites.push("author");
                    overwrites.push("year");
                    overwrites.push("venue");
                    overwrites.push("bibtex");
                    overwrites.push("note");
                }
                console.log("overwrites: ", overwrites);
                existingPaper = mergePapers({
                    newPaper,
                    overwrites,
                    oldPaper: existingPaper,
                    incrementCount: false,
                });
                updateDuplicatedUrls(url, existingId);
            } else if (newPaper.venue) {
                updateDuplicatedUrls(paperToAbs(existingPaper), newPaper.id);
                updateDuplicatedUrls(paperToPDF(existingPaper), newPaper.id);
                await deletePaperInStorage(existingPaper.id, state.papers);
                existingPaper = mergePapers({
                    newPaper: newPaper,
                    oldPaper: existingPaper,
                    incrementCount: false,
                    overwrites: [
                        "lastOpenDate",
                        "venue",
                        "bibtex",
                        "id",
                        "key",
                        "pdfLink",
                        "source",
                        "year",
                        "author",
                    ],
                });
            } else if (existingPaper.author.toLowerCase() === "anonymous") {
                existingPaper = mergePapers({
                    newPaper,
                    oldPaper: existingPaper,
                    incrementCount: true, // ?
                    overwrites: [
                        "lastOpenDate",
                        "author",
                        "year",
                        "venue",
                        "bibtex",
                        "note",
                    ],
                });
            }
            newPaper = updatePaperVisits(existingPaper);
            isNew = false;
        } else {
            // set isNew to True for the storage setter
            isNew = true;
        }
        paper = newPaper;
    }

    if (!paper.codeLink || !paper.venue) {
        try {
            const pwcMatch = await silentPromiseTimeout(tryPWCMatch(paper));

            const pwcCodeLink = !paper.codeLink && pwcMatch?.codeLink;
            const pwcNote = pwcMatch?.note;
            const pwcBibtex = pwcMatch?.bibtex;
            const pwcVenue = !paper.venue && pwcMatch?.venue;

            pwc = {
                codeLink: pwcCodeLink,
                note: pwcNote,
                venue: pwcVenue,
                bibtex: pwcBibtex,
            };

            if (pwc.codeLink) {
                paper.codeLink = pwc.codeLink;
                if (pwcMatch.hasOwnProperty("note")) delete pwcMatch.note;
                paper.code = pwcMatch;
            }
        } catch (error) {
            log("Error trying to discover a code repository:");
            log(error);
        }
    }

    state.papers = (await getStorage("papers")) ?? {};

    // minimize risk of concurrent writes to the same paper
    if (isNew && state.papers.hasOwnProperty(paper.id)) {
        warn("Paper has been created by another page: merging papers.");
        paper = mergePapers({
            newPaper: state.papers[paper.id],
            oldPaper: paper,
            incrementCount: true,
        });
        isNew = false;
    }

    // Store may be false if the user has disabled:
    //   * paper storage from Abstract URLs
    //   * automatic parsing altogether
    // but we still want to display paper metadata on arxiv.org
    if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;

    chrome.storage.local.set({ papers: state.papers }, async () => {
        // tell the content script the paper has been parsed/updated
        contentScriptCallbacks["update"](paper);
        pushToRemote();

        let notifText;
        if (isNew || pwc.codeLink) {
            if (isNew) {
                // new paper
                if (store) {
                    logOk("Added '" + paper.title + "' to your Memory!");
                } else {
                    warn(
                        "Discovered '" +
                            paper.title +
                            "' but did not store it (`store` is false).",
                    );
                }
                log("paper: ", paper);

                notifText = "Saved ✓";
                if (pwc.codeLink) {
                    notifText +=
                        "<br/><div id='feedback-pwc'>(+ repo from PapersWithCode) </div>";
                }

                prefs &&
                    prefs.checkFeedback &&
                    store &&
                    contentScriptCallbacks.feedback &&
                    contentScriptCallbacks.feedback({ text: notifText, paper });
            } else {
                // existing paper but new code repo
                notifText = "Found a code repository on PapersWithCode!";
                prefs &&
                    prefs.checkFeedback &&
                    store &&
                    contentScriptCallbacks.feedback &&
                    contentScriptCallbacks.feedback({ text: notifText });
            }
        } else {
            store && logOk("Updated '" + paper.title + "' in your Memory");
        }

        // anyway: try and update note with actual publication
        if (!paper.note || !paper.venue || paper.author.toLowerCase() === "anonymous") {
            const preprintMatch = await tryPreprintMatch(paper);
            for (const key of ["note", "venue", "bibtex", "doi"]) {
                if (!paper[key] || key === "bibtex") {
                    const value = preprintMatch[key] ?? pwc[key];
                    if (value) {
                        log(`Updating preprint ${key} to`, value);
                        paper[key] = value;
                    }
                }
                if (key === "bibtex" && preprintMatch[key]) {
                    const bibObj = bibtexToObject(preprintMatch[key]);
                    if (bibObj.year !== paper.year) {
                        paper.year = bibObj.year;
                    }
                }
            }

            state.papers = (await getStorage("papers")) ?? {};

            // minimize risk of concurrent writes to the same paper
            if (
                isNew &&
                state.papers.hasOwnProperty(paper.id) &&
                state.papers[paper.id].count > 1
            ) {
                warn("Paper has been created by another page: merging papers.");
                paper = mergePapers({
                    newPaper: state.papers[paper.id],
                    oldPaper: paper,
                    incrementCount: false,
                });
            }

            // record updated paper if store is true
            if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;
            await new Promise((resolve) =>
                chrome.storage.local.set({ papers: state.papers }, resolve),
            );
        }
        // tell the content script the pre-print matching procedure has finished
        contentScriptCallbacks["preprints"](paper);
        pushToRemote();

        info(`Done processing paper (${(Date.now() - aouStart) / 1e3}s).`);
        console.groupEnd();
        contentScriptCallbacks["done"](paper);
    });

    return { paper, id };
};

/**
 * Make a markdown link to the paper's abstract or pdf.
 * @param {object} paper The paper to make a link for
 * @param {object} prefs The user's preferences to determine whether to link to the pdf or the abstract
 * @returns {string} The markdown link
 */
export const makeMdLink = (paper, prefs = {}) => {
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    let yearAndVenue = "";
    if (prefs.checkMdYearVenue) {
        yearAndVenue = paper.note.match(/(.+)\s*@\s*([\w\s]+\(?\d{4}\)?)/i);
        if (yearAndVenue) {
            yearAndVenue = yearAndVenue[2]?.replace(/\s+/g, " ").replace(/[\(\)]/g, "");
        }
        if (!yearAndVenue) {
            yearAndVenue = "";
            if (paper.venue) {
                yearAndVenue += paper.venue + " ";
            }
            yearAndVenue += paper.year;
        }
    }
    let title = paper.title;
    if (yearAndVenue) {
        title = `${title} (${yearAndVenue.replace(/\s+/g, " ")})`;
    }
    const md = `[${title}](${link})`;
    return md;
};

/**
 * Add a paper to the title hash to id list.
 * @param {object} paper The paper to add
 */
export const addPaperToTitleHashToId = (paper) => {
    const id = paper.id;
    const hashedTitle = miniHash(paper.title);
    if (!state.titleHashToIds.hasOwnProperty(hashedTitle)) {
        state.titleHashToIds[hashedTitle] = [];
    }
    if (!state.titleHashToIds[hashedTitle].includes(id)) {
        state.titleHashToIds[hashedTitle].push(id);
    }
};

/**
 * Is this url associated with a known paper source?
 * For each known paper source in config.js/knownPaperPages, this function
 * checks whether the url includes one of the listed paths.
 * Also checks for local files in the PaperMemoryStore
 *
 * @param {string} url the url to check
 * @returns {object} boolean map from sources.
 */
const isPaper = async (url, noStored = false) => {
    let is = {};
    if (!url) return is;
    for (const source in global.knownPaperPages) {
        const paths = global.knownPaperPages[source];
        // default source status: false
        is[source] = false;
        for (const path of paths) {
            if (typeof path === "string") {
                if (url.includes(path)) {
                    // known path: store as true
                    is[source] = true;
                }
            } else if (typeof path === "function") {
                is[source] = path(url);
            }
        }
    }
    // is the url a local file in the memory?
    is.localFile = isKnownLocalFile(url);
    is.stored = noStored ? false : await findLocalFile(url);
    return is;
};

/**
 * Tests wether a given url is a known paper source according to knownPaperPages
 * and to local files.
 * @param {string} url The url to test
 * @returns {boolean}
 */
const isKnownURL = async (url, noStored) =>
    Object.values(await isPaper(url, noStored)).some((i) => i);

/**
 * Get the url to the paper's abstract / display page.
 * In other words: not not the pdf's.
 * eg: https://arxiv.org/abs/1901.01234 (not https://arxiv.org/pdf/1901.01234.pdf)
 *
 * @param {object} paper the paper whose abstract url we're looking for
 * @returns {string} the url to the paper's abstract
 */
const paperToAbs = (paper) => {
    const pdf = paper.pdfLink;
    let abs = "";
    switch (paper.source) {
        case "arxiv":
            abs = `https://arxiv.org/abs/${paper.id.split("-")[1]}`;
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
            const [journal, type] = parseUrl(pdf).pathname.split("/").slice(1, 3);
            abs = pdf.replace(`/${journal}/${type}/`, `/${journal}/abstract/`);
            break;

        case "wiley":
            abs = pdf.replace(/\/doi\/e?pdf\//g, `/doi/abs/`);
            break;

        case "sciencedirect":
            const pii = pdf.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
            abs = `https://www.sciencedirect.com/science/article/pii/${pii}`;
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
const paperToPDF = (paper) => {
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

        default:
            pdf = "https://xkcd.com/1969/";
            break;
    }

    return pdf.replace("http://", "https://");
};

/**
 * Given a single paper or an url, find a matching file in the users'
 * downloads/PaperMemoryStore/ folder.
 * If a url is provided, it is first checked whether it is a known paper.
 * If not, the promise will resolve to null.
 * If it is, the promise will resolve to the file object as per the chrome.downloads.search API.
 * @param {object || string} paperOrUrl The paper to match to local files
 * @returns {Promise} Resolves a file object if exactly one is found, null otherwise
 */
const findLocalFile = async (paperOrUrl) => {
    if (typeof paperOrUrl === "string") {
        // paperOrUrl is an url: find its paper (if any)
        let id;
        try {
            id = await parseIdFromUrl(paperOrUrl);
        } catch (error) {
            // no paper found
            return new Promise((resolve) => resolve(null));
        }
        if (global.state.papers.hasOwnProperty(id)) {
            paper = global.state.papers[id];
        } else {
            // The id found does not exist (parseIdFromUrl bug?)
            return new Promise((resolve) => resolve(null));
        }
    } else {
        // the paper is an actual paper object not a url
        paper = paperOrUrl;
    }
    // Return a Promise searching PaperMemoryStore/.*
    const storedFiles = await getStoredFiles();
    const matches = await matchPapersToFiles({ [paper.id]: paper }, storedFiles);
    const localFile = Object.values(matches);
    // resolve to a file object if exactly one is found otherwise to null
    return localFile.length === 1 ? localFile[0] : null;
};

/**
 * For each file in the files array, check if there exists a paper such that:
 *
 * 1. the file's finalUrl matches a paper's id as per parseIdFromUrl(candidate.finalUrl)
 * 2. if not, if there exists any paper such that the file's filename contains the paper's title
 *
 * [Note: title matching is done by first lowercasing then removing all non-alphanumeric characters]
 *
 * @param {object} papers An object mapping ids to papers, just like global.state.papers
 * @param {array} files An array of file objects as per the chrome.downloads.search API
 * @returns {object} An object mapping ids to files
 */
const matchPapersToFiles = async (papers, files) => {
    // pre-compute paper's simplified titles
    const titles = Object.fromEntries(
        Object.values(papers).map((paper) => [paper.id, miniHash(paper.title)])
    );
    // filter non-existing file handles
    files = files.filter(
        (f) =>
            f.exists &&
            f.state === "complete" &&
            !f.filename.toLowerCase().includes("readme.txt")
    );
    // pre-compute file's simplified titles
    const fileTitles = Object.fromEntries(
        files.map((f) => [f.id, miniHash(f.filename)])
    );

    // matching object to return
    let matches = {};

    for (const candidate of files) {
        let id;

        try {
            // find the file's id from its finalUrl
            id = await parseIdFromUrl(candidate.finalUrl);
            // if an id is found and it is in the papers requested for matching
            if (id && papers.hasOwnProperty(id)) matches[id] = candidate;
        } catch (error) {
            id = null;
        }
        if (!id) {
            // no id was found, try to match titles.
            // This is expensive so it should be rare.
            const candidateTitle = fileTitles[candidate.id];
            const match = Object.entries(titles).filter(([id, title]) =>
                title.includes(candidateTitle)
            );
            if (match.length === 1) {
                matches[match[0][0]] = candidate;
            }
        }
    }
    return matches;
};

const matchAllFilesToPapers = () => {
    return new Promise((resolve, reject) => {
        chrome.downloads.search(
            {
                filenameRegex: "PaperMemoryStore/.*",
            },
            async (files) => {
                const matches = await matchPapersToFiles(
                    cleanPapers(global.state.papers),
                    files
                );
                resolve(matches);
            }
        );
    });
};

const mergePapers = (options = { newPaper: {}, oldPaper: {} }) => {
    const { oldPaper, newPaper, ...extra } = options;
    let mergedPaper = { ...oldPaper };

    const defaults = {
        overwrites: ["lastOpenDate"],
        incrementCount: false,
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
    for (const attribute of opts.overwrites) {
        if (newPaper.hasOwnProperty(attribute)) {
            mergedPaper[attribute] = newPaper[attribute];
        }
    }

    return mergedPaper;
};

/**
 *  Adds a new paper to the memory or updates the counts and open dates of an existing paper.
 *
 * @param {string} url The url from which to parse a paper
 * @param {object} is The paper's source info
 * @param {object} checks The user's preferences
 * @returns
 */
const addOrUpdatePaper = async (url, is, prefs) => {
    const aouStart = Date.now();
    let paper, isNew, pwcUrl, pwcNote, pwcVenue;

    // Extract id from url
    global.state.papers = (await getStorage("papers")) ?? {};
    const id = await parseIdFromUrl(url);
    const paperExists = global.state.papers.hasOwnProperty(id);
    log("Id for url:", id, "--", "Paper exists:", Boolean(paperExists));

    if (id && paperExists) {
        // Update paper if it exists
        paper = updatePaperVisits(global.state.papers[id]);
        isNew = false;
    } else {
        // Or create a new one if it does not
        paper = await makePaper(is, url);
        if (!paper) {
            return;
        }
        const existingId = findFuzzyPaperMatch(global.state.titleHashToIds, paper);
        if (existingId) {
            // Update paper as already it exists
            let existingPaper = global.state.papers[existingId];
            log("New paper", paper, "already exists as", existingPaper);
            addPaperToTitleHashToId(paper);
            if (
                (!paper.venue && existingPaper.venue) ||
                (paper.venue && existingPaper.venue)
            ) {
                existingPaper = mergePapers({
                    newPaper: paper,
                    oldPaper: existingPaper,
                    incrementCount: false,
                    overwrites: ["lastOpenDate"],
                });
                updateDuplicatedUrls(url, existingId);
            } else if (!existingPaper.venue && paper.venue) {
                await updateDuplicatedUrls(paperToAbs(existingPaper), paper.id);
                await updateDuplicatedUrls(paperToPDF(existingPaper), paper.id);
                await deletePaperInStorage(existingPaper.id, global.state.papers);

                existingPaper = mergePapers({
                    newPaper: paper,
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
                    ],
                });
            }
            paper = updatePaperVisits(existingPaper);
            isNew = false;
        } else {
            // set isNew to True for the storage setter
            isNew = true;
        }
    }

    if (!paper.codeLink || !paper.venue) {
        try {
            const pwc = await tryPWCMatch(paper);

            pwcUrl = !paper.codeLink && pwc?.url;
            pwcNote = pwc?.note;
            pwcVenue = !paper.venue && pwc?.venue;

            if (pwcUrl) {
                log("Discovered a code repository from PapersWithCode:", pwcUrl);
                paper.codeLink = pwcUrl;
                if (pwc.hasOwnProperty("note")) delete pwc.note;
                paper.code = pwc;
            } else {
                if (!paper.codeLink) {
                    log("No code repository found from PapersWithCode");
                }
            }
        } catch (error) {
            log("Error trying to discover a code repository:");
            log(error);
        }
    }

    global.state.papers = (await getStorage("papers")) ?? {};
    if (isNew && global.state.papers.hasOwnProperty(paper.id)) {
        warn("Paper has been created by another page: merging papers.");
        paper = mergePapers({
            newPaper: global.state.papers[paper.id],
            oldPaper: paper,
            incrementCount: true,
        });
        isNew = false;
    }
    global.state.papers[paper.id] = paper;

    chrome.storage.local.set({ papers: global.state.papers }, async () => {
        let notifText;
        if (isNew || pwcUrl) {
            if (isNew) {
                // new paper

                logOk("Added '" + paper.title + "' to your Memory!");
                log("paper: ", paper);
                notifText = "Added to your Memory";
                if (pwcUrl) {
                    notifText +=
                        "<br/><div id='feedback-pwc'>(+ repo from PapersWithCode) </div>";
                }
                prefs && prefs.checkFeedback && feedback(notifText, paper);
            } else {
                // existing paper but new code repo

                notifText = "Found a code repository on PapersWithCode!";
                prefs && prefs.checkFeedback && feedback(notifText);
            }
        } else {
            logOk("Updated '" + paper.title + "' in your Memory");
        }

        if (!paper.venue && !pwcVenue) {
            log("[PapersWithCode] No publication found");
        }

        // anyway: try and update note with actual publication
        if (!paper.note || !paper.venue) {
            const { note, venue, bibtex } = await tryPreprintMatch(paper);
            if (note || venue || bibtex) {
                if (!paper.note) {
                    if (note) {
                        log("Updating preprint note to", note);
                        paper.note = note;
                    } else if (pwcNote) {
                        log("Updating preprint note to", pwcNote);
                        paper.note = pwcNote;
                    }
                }
                if (!paper.venue) {
                    if (venue) {
                        log("Updating preprint venue to", venue);
                        paper.venue = venue;
                    } else if (pwcVenue) {
                        log("Updating preprint venue to", pwcVenue);
                        paper.venue = pwcVenue;
                    }
                }
                if (bibtex) {
                    log("Updating preprint bibtex to", bibtex);
                    paper.bibtex = bibtex;
                }
                global.state.papers = (await getStorage("papers")) ?? {};
                if (isNew && global.state.papers[paper.id].count > 1) {
                    warn("Paper has been created by another page: merging papers.");
                    paper = mergePapers({
                        newPaper: global.state.papers[paper.id],
                        oldPaper: paper,
                        incrementCount: false,
                    });
                }
                global.state.papers[paper.id] = paper;
                chrome.storage.local.set({ papers: global.state.papers });
            }
        }
        info(`Done processing paper (${(Date.now() - aouStart) / 1000}s).`);
    });

    return { paper, id };
};

/**
 * Parses a paper's id from a url.
 * Throws error if the url is not a paper source as defined per isPaper(url).
 *
 * @param {string} url The url to use in order to find a matching paper
 * @returns {string} The id of the paper found.
 */
const parseIdFromUrl = async (url) => {
    let idForUrl;
    const hashedUrl = miniHash(url);
    const hashedId = global.state.urlHashToId[hashedUrl];
    if (hashedId) {
        return hashedId;
    }
    const is = await isPaper(url, true);
    if (is.arxiv) {
        const arxivId = url.match(/\d{4}\.\d{4,5}/g)[0];
        idForUrl = `Arxiv-${arxivId}`;

        const existingIds = Object.values(global.state.titleHashToIds).find((ids) =>
            ids.includes(idForUrl)
        );
        if (existingIds) {
            idForUrl = existingIds.find((id) => !id.startsWith("Arxiv-")) ?? idForUrl;
        }
    } else if (is.neurips) {
        const year = url.split("/paper/")[1].split("/")[0];
        const hash = url.split("/").last().split("-")[0].slice(0, 8);
        idForUrl = `NeurIPS-${year}_${hash}`;
    } else if (is.cvf) {
        idForUrl = parseCVFUrl(url).id;
    } else if (is.openreview) {
        const OR_id = url.match(/id=\w+/)[0].replace("id=", "");
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.id.includes(OR_id);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.biorxiv) {
        url = cleanBiorxivURL(url);
        let id = url.split("/").last();
        if (id.match(/v\d+$/)) {
            id = id.split("v")[0];
        }
        idForUrl = `Biorxiv-${id}`;

        const existingIds = Object.values(global.state.titleHashToIds).find((ids) =>
            ids.includes(idForUrl)
        );
        if (existingIds) {
            idForUrl = existingIds.find((id) => !id.startsWith("Biorxiv-")) ?? idForUrl;
        }
    } else if (is.pmlr) {
        const key = url.split("/").last().split(".")[0];
        const year = "20" + key.match(/\d+/)[0];
        idForUrl = `PMLR-${year}-${key}`;
    } else if (is.acl) {
        url = url.replace(".pdf", "");
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        const key = url.split("/").last();
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "acl" && p.id.includes(key);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.pnas) {
        url = url.replace(".full.pdf", "");
        const pid = url.endsWith("/")
            ? url.split("/").slice(-2)[0]
            : url.split("/").slice(-1)[0];

        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "pnas" && p.id.includes(pid);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.nature) {
        url = url.replace(".pdf", "").split("#")[0];
        const hash = url.split("/").last();
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "nature" && p.id.includes(hash);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.acs) {
        url = url
            .replace("pubs.acs.org/doi/pdf/", "/doi/")
            .replace("pubs.acs.org/doi/abs/", "/doi/")
            .split("?")[0];
        const doi = url.split("/doi/")[1].replaceAll(".", "").replaceAll("/", "");
        idForUrl = `ACS_${doi}`;
    } else if (is.iop) {
        url = url.split("#")[0].replace(/\/pdf$/, "");
        const doi = url.split("/article/")[1].replaceAll(".", "").replaceAll("/", "");
        idForUrl = `IOPscience_${doi}`;
    } else if (is.jmlr) {
        if (url.endsWith(".pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        url = url.replace(".html", "");
        const jid = url.split("/").last();
        const year = `20${jid.match(/\d+/)[0]}`;
        idForUrl = `JMLR-${year}_${jid}`;
    } else if (is.pmc) {
        const pmcid = url.match(/PMC\d+/g)[0].replace("PMC", "");
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "pmc" && p.id.includes(pmcid);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.ijcai) {
        const procId = url.endsWith(".pdf")
            ? url
                  .replace(".pdf", "")
                  .split("/")
                  .last()
                  .match(/[1-9]\d*/)
            : url.split("/").last();
        const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];
        idForUrl = `IJCAI-${year}_${procId}`;
    } else if (is.acm) {
        const doi = url
            .replace("/doi/pdf/", "/doi/")
            .split("/doi/")[1]
            .replaceAll(/(\.|\/)/gi, "");
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "acm" && p.id.includes(doi);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.ieee) {
        const articleId = url.includes("ieee.org/document/")
            ? url.split("ieee.org/document/")[1].match(/\d+/)[0]
            : url.split("arnumber=")[1].match(/\d+/)[0];
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "ieee" && p.id.includes(articleId);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.springer) {
        const types = global.sourceExtras.springer.types;
        let type = types.filter((c) => url.includes(`/${c}/`))[0];
        if (!type) {
            if (!url.includes("/content/pdf/")) {
                throw new Error(`Could not find Springer type for ${url}`);
            }
            type = "content/pdf";
        }
        let doi = url.split(`/${type}/`)[1].split("?")[0].replace(".pdf", "");
        doi = miniHash(doi);
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "springer" && p.id.includes(doi);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.aps) {
        const [journal, type] = parseUrl(url.split("#")[0])
            .pathname.split("/")
            .slice(1, 3);
        const doi = miniHash(url.split(`/${journal}/${type}/`).last());
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "aps" && p.id.includes(doi);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.wiley) {
        const doi = miniHash(
            url.split("?")[0].split("#")[0].split("/").slice(-2).join("/")
        );
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "wiley" && p.id.includes(doi);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.sciencedirect) {
        const pii = miniHash(
            url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0]
        );
        const paper = Object.values(cleanPapers(global.state.papers)).filter((p) => {
            return p.source === "sciencedirect" && p.id.includes(pii);
        })[0];
        idForUrl = paper && paper.id;
    } else if (is.localFile) {
        idForUrl = is.localFile;
    } else {
        throw new Error("unknown paper url");
    }

    return idForUrl;
};

/**
 * A function to detect whether the current local file is known in the
 * user's memory by ensuring there exists a paper whose title is in the filename.
 * The loose comparison is made against lowercase and letter-only strings.
 *
 * @param {string} url The current url (potentially: local file)
 * @returns {string || boolean} false if no paper is found, the paper's id if found
 */
const isKnownLocalFile = (url) => {
    if (!url.startsWith("file://")) return false;
    if (!url.endsWith(".pdf")) return false;

    const filePath = decodeURIComponent(url).replace("file://", "");
    const storedPaths = Object.entries(global.state.files).filter(
        ([id, file]) => file.filename === filePath
    );

    if (storedPaths.length > 0) {
        console.log("Found stored");
        return storedPaths[0][0];
    }

    const filename = decodeURIComponent(url.split("/").last())
        .toLowerCase()
        .replace(/\W/g, "");
    const titles = Object.values(cleanPapers(global.state.papers))
        .map((p) => {
            return { title: miniHash(p.title), id: p.id };
        })
        .filter((t) => filename.includes(t.title));

    if (titles.length === 0) return false;

    return titles[0].id;
};

const makeMdLink = (paper, prefs = {}) => {
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

// ----------------------------------------------------
// -----  TESTS: modules for node.js environment  -----
// ----------------------------------------------------
var dummyModule = module;
if (typeof dummyModule !== "undefined" && dummyModule.exports != null) {
    dummyModule.exports = {
        isPaper,
        isKnownURL,
        paperToAbs,
        paperToPDF,
        findLocalFile,
        matchPapersToFiles,
        matchAllFilesToPapers,
        mergePapers,
        addOrUpdatePaper,
        parseIdFromUrl,
        isKnownLocalFile,
        makeMdLink,
    };
}

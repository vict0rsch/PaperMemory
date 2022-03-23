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
    for (const source in global.knownPaperPages) {
        const paths = global.knownPaperPages[source];
        // default source status: false
        is[source] = false;
        for (const path of paths) {
            if (url.includes(path)) {
                // known path: store as true
                is[source] = true;
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

        case "acs":
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
        Object.values(papers).map((paper) => [
            paper.id,
            paper.title.toLowerCase().replace(/\W/g, ""),
        ])
    );
    // filter non-existing file handles
    files = files.filter((f) => f.exists && f.state === "complete");
    // pre-compute file's simplified titles
    const fileTitles = Object.fromEntries(
        files.map((f) => [f.id, f.filename.toLowerCase().replace(/\W/g, "")])
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

const makeVenue = async (paper) => {
    let venue = "";
    if (paper.note && paper.note.match(/(accepted|published)\ @\ .+\(?\d{4}\)?/i)) {
        venue = paper.note
            .split("@")[1]
            .trim()
            .replace(/\(?\d{4}\)?/, "")
            .split("--")[0]
            .trim();
    }
    if (venue) {
        if (venue.toLowerCase() === "neurips") venue = "NeurIPS";
    }
    switch (paper.source) {
        case "arxiv":
            break;
        case "neurips":
            venue = "NeurIPS";
            break;
        case "cvf":
            if (!venue) {
                venue = (await makeCVFPaper(paper.pdfLink)).venue;
            }
            break;
        case "openreview":
            if (!venue) {
                venue = (await makeOpenReviewPaper(paper.pdfLink)).venue;
            }
            break;
        case "biorxiv":
            break;
        case "pmlr":
            venue = paper.conf.split(/\d{4}/)[0];
            break;
        case "acl":
            venue = paper.conf;
            break;
        case "pnas":
            venue = "PNAS";
            break;
        case "nature":
            if (!venue) {
                venue = paper.venue;
            }
            break;
        case "acs":
            venue = paper.venue;
            break;
        default:
            break;
    }
    return venue;
};

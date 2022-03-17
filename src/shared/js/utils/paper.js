/**
 * Is this url associated with a known paper source?
 * For each known paper source in config.js/knownPaperPages, this function
 * checks whether the url includes one of the listed paths.
 * Also checks for local files in the PaperMemoryStore
 *
 * @param {string} url the url to check
 * @returns {object} boolean map from sources.
 */
const isPaper = (url) => {
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
    return is;
};

/**
 * Tests wether a given url is a known paper source according to knownPaperPages
 * and to local files.
 * @param {string} url The url to test
 * @returns {boolean}
 */
const isKnownURL = (url) => Object.values(isPaper(url)).some((i) => i);

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
            abs = pdf.replace(".full.pdf", "");
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
            pdf = pdf.replace(/v\d+\.pdf/gi, ".pdf");
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

        default:
            pdf = "https://xkcd.com/1969/";
            break;
    }

    return pdf.replace("http://", "https://");
};

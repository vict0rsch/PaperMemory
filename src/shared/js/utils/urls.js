import {
    cleanPapers,
    isPdfUrl,
    urlToWebsiteId,
    arxivIdFromURL,
    noParamUrl,
    parseCVFUrl,
    miniHash,
    cleanBiorxivURL,
    parseUrl,
} from "@pmu/functions.js";
import { parseAIPIdOrDOI, findCellPii } from "@pmu/parsers.js";
import { isPaper } from "@pmu/paper.js";
import { state, sourceExtras } from "@pmu/config.js";

/**
 * Find the first paper from a source whose #id matches a certain string.
 * Return its #id.
 * @param {Array<object>} papers List of papers to check
 * @param {String} source the source to filter for
 * @param {String} match the id's uniquely identifiable string to match
 * @returns {String} paper?.id
 */
export const findPaperForProperty = (papers, source, match, prop = "id") =>
    papers.find((p) => p.source === source && p[prop].includes(match))?.id;

/**
 * Tests wether a given url is a known paper source according to k nownPaperPages
 * and to local files.
 * @param {string} url The url to test
 * @returns {boolean}
 */
export const isSourceURL = async (url, noStored) =>
    Object.values(await isPaper(url, noStored)).some((i) => i);

/**
 * Parses a paper's id from a url.
 * Throws error if the url is not a paper source as defined per isPaper(url).
 *
 * @param {string} url The url to use in order to find a matching paper
 * @returns {string} The id of the paper found.
 */
export const parseIdFromUrl = async (url, tab = null) => {
    if (tab) {
        return urlToWebsiteId(url);
    }
    let idForUrl;

    const hashedUrl = miniHash(url);
    const hashedId = state.urlHashToId[hashedUrl];
    if (hashedId) {
        return hashedId;
    }

    const is = await isPaper(url, true);
    const papers = Object.values(cleanPapers(state.papers));

    if (is.arxiv) {
        let arxivId = arxivIdFromURL(url);
        idForUrl = `Arxiv-${arxivId}`;

        const existingIds = Object.values(state.titleHashToIds).find((ids) =>
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
        idForUrl = findPaperForProperty(papers, "openreview", OR_id);
    } else if (is.biorxiv) {
        url = cleanBiorxivURL(url);
        let id = url.split("/").last();
        if (id.match(/v\d+$/)) {
            id = id.split("v")[0];
        }
        idForUrl = `Biorxiv-${id}`;

        const existingIds = Object.values(state.titleHashToIds).find((ids) =>
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
        idForUrl = findPaperForProperty(papers, "acl", key);
    } else if (is.pnas) {
        url = url.replace(".full.pdf", "");
        const pid = url.endsWith("/")
            ? url.split("/").slice(-2)[0]
            : url.split("/").slice(-1)[0];

        idForUrl = findPaperForProperty(papers, "pnas", pid);
    } else if (is.nature) {
        url = url.replace(".pdf", "").split("#")[0];
        const hash = url.split("/").last();
        idForUrl = findPaperForProperty(papers, "nature", hash);
    } else if (is.acs) {
        url = noParamUrl(url)
            .replace("pubs.acs.org/doi/pdf/", "/doi/")
            .replace("pubs.acs.org/doi/abs/", "/doi/");
        const doi = miniHash(url.split("/doi/")[1]);
        idForUrl = `ACS_${doi}`;
    } else if (is.iop) {
        url = noParamUrl(url).replace(/\/pdf$/, "");
        const doi = miniHash(url.split("/article/")[1].split("/meta")[0]);
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
        idForUrl = findPaperForProperty(papers, "pmc", pmcid);
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
        const doi = url.replace(/\/doi\/?(pdf|abs|full)?\//, "/doi/").split("/doi/")[1];
        idForUrl = findPaperForProperty(papers, "acm", miniHash(doi));
    } else if (is.ieee) {
        const articleId = url.includes("ieee.org/document/")
            ? url.split("ieee.org/document/")[1].match(/\d+/)[0]
            : url.includes("ieee.org/abstract/document/")
            ? url.split("ieee.org/abstract/document/")[1].match(/\d+/)[0]
            : url.split("arnumber=")[1].match(/\d+/)[0];
        idForUrl = findPaperForProperty(papers, "ieee", articleId);
    } else if (is.springer) {
        const types = sourceExtras.springer.types;
        let type = types.filter((c) => url.includes(`/${c}/`))[0];
        if (!type) {
            if (!url.includes("/content/pdf/")) {
                throw new Error(`Could not find Springer type for ${url}`);
            }
            type = "content/pdf";
        }
        let doi = noParamUrl(url).split(`/${type}/`)[1].replace(".pdf", "");
        idForUrl = findPaperForProperty(papers, "springer", miniHash(doi));
    } else if (is.aps) {
        const [journal, type] = parseUrl(url.split("#")[0])
            .pathname.split("/")
            .slice(1, 3);
        const doi = url.split(`/${journal}/${type}/`).last();
        idForUrl = findPaperForProperty(papers, "aps", miniHash(doi));
    } else if (is.wiley) {
        const doi = url.split("?")[0].split("#")[0].split("/").slice(-2).join("/");
        idForUrl = findPaperForProperty(papers, "wiley", miniHash(doi));
    } else if (is.sciencedirect) {
        const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
        idForUrl = findPaperForProperty(papers, "sciencedirect", miniHash(pii));
    } else if (is.science) {
        let doi = noParamUrl(url).split("/doi/")[1];
        if (!doi.startsWith("10.")) {
            doi = doi.split("/").slice(1).join("/");
        }
        idForUrl = findPaperForProperty(papers, "science", miniHash(doi));
    } else if (is.frontiers) {
        let doi = noParamUrl(url)
            .split("/articles/")[1]
            .split("/")
            .slice(0, -1)
            .join("/");
        idForUrl = findPaperForProperty(papers, "frontiers", miniHash(doi));
    } else if (is.ihep) {
        if (url.includes("/literature/")) {
            const num = noParamUrl(url).match(/\/literature\/(\d+)/)[1];
            idForUrl = findPaperForProperty(papers, "ihep", num);
        } else {
            const hash = noParamUrl(url).split("/files/")[1].split("/")[0];
            idForUrl = findPaperForProperty(papers, "ihep", hash, "pdfLink");
        }
    } else if (is.plos) {
        const doi = url.split("?id=").last().split("&")[0];
        idForUrl = findPaperForProperty(papers, "plos", miniHash(doi));
    } else if (is.rsc) {
        const rscId = noParamUrl(url).replace("/unauth", "").split("/").last();
        idForUrl = findPaperForProperty(papers, "rsc", miniHash(rscId));
    } else if (is.mdpi) {
        const mdpiId = noParamUrl(
            url
                .split("mdpi.com/")[1]
                .split("/pdf")[0]
                .split("/reprints")[0]
                .split("/notes")[0]
        );
        idForUrl = findPaperForProperty(papers, "mdpi", miniHash(mdpiId));
    } else if (is.oup) {
        url = noParamUrl(url).split("https://academic.oup.com/").last();
        if (isPdfUrl(url)) {
            url = url.split("/").slice(0, -1).join("/");
        }
        const num = url.split("/").slice(2).join("");
        idForUrl = findPaperForProperty(papers, "oup", miniHash(num));
    } else if (is.hal) {
        url = noParamUrl(url).replace(
            /(hal\.science\/\w+-\d+)(v\d+)?((\/document|\/file\/.+\.pdf))?/,
            "$1"
        );
        const halId = url.split("/").last();
        idForUrl = findPaperForProperty(papers, "hal", miniHash(halId));
    } else if (is.chemrxiv) {
        let chemRxivId = isPdfUrl(url)
            ? (chemRxivId = url.split("/item/")[1].split("/")[0])
            : (chemRxivId = noParamUrl(url).split("/").last());
        idForUrl = findPaperForProperty(papers, "chemrxiv", miniHash(chemRxivId));
    } else if (is.cell) {
        ({ url } = await findCellPii(url));
        idForUrl = findPaperForProperty(
            papers,
            "cell",
            miniHash(url.split("cell.com/")[1])
        );
    } else if (is.aip) {
        const { aipId, doi } = parseAIPIdOrDOI(url);
        idForUrl = doi
            ? findPaperForProperty(papers, "aip", doi, "doi")
            : findPaperForProperty(papers, "aip", miniHash(aipId));
    } else if (is.localFile) {
        idForUrl = is.localFile;
    } else if (is.parsedWebsite) {
        idForUrl = is.parsedWebsite.id;
    } else {
        throw new Error(
            "`parseIdFromUrl` failed, unknown paper url. Is: " + JSON.stringify(is)
        );
    }

    return idForUrl;
};

export const isArxivAbstractUrl = (url) => url.startsWith("https://arxiv.org/abs/");

import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl, isPdfUrl } from "@pmu/functions.js";
import { extractDataFromDCMetaTags, fetchDom } from "@pmu/parsers.js";

export class ChemrxivSource extends BasePaperSource {
    static name = "chemrxiv";
    static displayName = "ChemRxiv";
    static patterns = [
        "chemrxiv.org/engage/chemrxiv/article-details/",
        "https://chemrxiv.org/doi/",
        (url) =>
            url.includes("https://chemrxiv.org/engage/api-gateway/chemrxiv/assets") &&
            url.endsWith(".pdf"),
    ];

    static async urlToId(url, ctx) {
        let chemRxivId = isPdfUrl(url)
            ? url.split("/item/")[1].split("/")[0]
            : noParamUrl(url).split("/").last();
        return ctx.findPaperForProperty(ctx.papers, "chemrxiv", miniHash(chemRxivId));
    }

    static async parse(url) {
        let chemRxivId;
        let absUrl = url;
        if (isPdfUrl(url)) {
            chemRxivId = url.split("/item/")[1].split("/")[0];
            absUrl =
                "https://chemrxiv.org/engage/chemrxiv/article-details/" + chemRxivId;
        } else {
            chemRxivId = noParamUrl(url).split("/").last();
        }
        const dom = await fetchDom(absUrl);
        const {
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
        } = extractDataFromDCMetaTags(dom);
        const id = `ChemRxiv-${year}_${miniHash(chemRxivId)}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return `https://chemrxiv.org/engage/chemrxiv/article-details/${
            pdf.split("/item/")[1].split("/")[0]
        }`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl, isPdfUrl, warn } from "@pmu/functions.js";
import { fetchBibtexToPaper, parseAIPIdOrDOI } from "@pmu/parsers.js";

export class AipSource extends BasePaperSource {
    static name = "aip";
    static displayName = "AIP (American Institute of Physics)";
    static patterns = [
        (url) =>
            Boolean(
                url.match(
                    /pubs.aip.org\/aip\/.+\/(article|article-abstract|article-split)\//g,
                ) || url.match(/watermark.silverchair.com\/.+\.pdf/g),
            ),
    ];

    static async urlToId(url, ctx) {
        const { aipId, doi } = parseAIPIdOrDOI(url);
        return doi
            ? ctx.findPaperForProperty(ctx.papers, "aip", doi, "doi")
            : ctx.findPaperForProperty(ctx.papers, "aip", miniHash(aipId));
    }

    static async parse(url) {
        url = noParamUrl(url);
        if (isPdfUrl(url)) {
            warn("PaperMemory cannot parse AIP papers from pdf urls");
            return;
        }
        const { aipId } = parseAIPIdOrDOI(url);
        const bibURL = `https://pubs.aip.org/Citation/Download?resourceId=${aipId}&resourceType=3&citationFormat=2`;
        const { author, bibtex, key, note, eprint, title, venue, year, doi } =
            await fetchBibtexToPaper({ url: bibURL });
        const id = `AIP-${year}_${miniHash(aipId)}`;
        const pdfLink = eprint.replaceAll("\\", "");
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return `https://doi.org/${paper.doi}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

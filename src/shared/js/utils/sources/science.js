import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import {
    extractDataFromDCMetaTags,
    fetchCrossRefDataForDoi,
    fetchDom,
} from "@pmu/parsers.js";

export class ScienceSource extends BasePaperSource {
    static name = "science";
    static displayName = "Science";
    static patterns = [
        (url) => Boolean(url.match(/science\.org\/doi\/?(abs|full|pdf|epdf)?\//g)),
    ];

    static async urlToId(url, ctx) {
        let doi = noParamUrl(url).split("/doi/")[1];
        if (!doi.startsWith("10.")) {
            doi = doi.split("/").slice(1).join("/");
        }
        return ctx.findPaperForProperty(ctx.papers, "science", miniHash(doi));
    }

    static async parse(url) {
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
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        let doi = pdf.split("/doi/")[1];
        if (!doi.startsWith("10.")) {
            doi = doi.split("/").slice(1).join("/");
        }
        return `https://science.org/doi/full/${doi}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

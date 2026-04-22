import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

export class WileySource extends BasePaperSource {
    static name = "wiley";
    static displayName = "Wiley";
    static patterns = [
        (url) =>
            Boolean(
                url.match(
                    /onlinelibrary\.wiley\.com\/doi\/(abs\/|full\/|pdf\/|epdf\/|10\.)/g,
                ),
            ),
    ];

    static async urlToId(url, ctx) {
        const doi = url.split("?")[0].split("#")[0].split("/").slice(-2).join("/");
        return ctx.findPaperForProperty(ctx.papers, "wiley", miniHash(doi));
    }

    static async parse(url) {
        url = noParamUrl(url);
        const pdfLink = url.match(/\/doi\/10\./g)
            ? url.replace("/doi/", "/doi/pdf/")
            : url.replace(/\/doi\/(abs|epdf|full)\//g, "/doi/pdf/");
        const absLink = pdfLink.replace("/doi/pdf/", "/doi/abs/");
        const doi = absLink.split("/doi/abs/")[1];
        const paper = await fetchBibtexToPaper({ doi });
        const { author, title, year, bibtex, venue, note } = paper;
        const id = `Wiley-${year}_${miniHash(doi)}`;

        return {
            author,
            bibtex,
            id,
            key: miniHash(doi),
            note,
            pdfLink,
            title,
            venue,
            year,
            doi,
        };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace(/\/doi\/e?pdf\//g, `/doi/abs/`);
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

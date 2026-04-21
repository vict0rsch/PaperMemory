import { BasePaperSource } from "./base.js";
import { miniHash } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class PlosSource extends BasePaperSource {
    static name = "plos";
    static displayName = "PLOS (Public Library of Science)";
    static patterns = [(url) => /journals\.plos\.org\/.+\/article.+id=/gi.test(url)];

    static async urlToId(url, ctx) {
        const doi = url.split("?id=").last().split("&")[0];
        return ctx.findPaperForProperty(ctx.papers, "plos", miniHash(doi));
    }

    static async parse(url) {
        const doi = url.split("?id=").last().split("&")[0];
        let { bibtex, key, author, venue, title, note, year } =
            await fetchBibtexToPaper({
                doi,
            });
        const pdfLink = `${url.split("/article")[0]}/article/file?id=${doi}&type=printable`;
        const section = url.split("journals.plos.org/")[1].split("/")[0];

        author = flipAndAuthors(author);
        const id = `PLOS-${section}_${miniHash(doi)}`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/article/file?", "/article?").split("&")[0];
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

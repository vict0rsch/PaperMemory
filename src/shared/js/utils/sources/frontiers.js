import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchText } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class FrontiersSource extends BasePaperSource {
    static name = "frontiers";
    static displayName = "Frontiers";
    static patterns = [
        "frontiersin.org/articles",
        (url) => url.match(/frontiersin\.org\/.+\/articles\//),
    ];

    static async urlToId(url, ctx) {
        let doi = noParamUrl(url)
            .split("/articles/")[1]
            .split("/")
            .slice(0, -1)
            .join("/");
        return ctx.findPaperForProperty(ctx.papers, "frontiers", miniHash(doi));
    }

    static async parse(url) {
        url = url.replace(/\/pdf$/, "/full");
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        const doi = noParamUrl(url).split("/articles/")[1].split("/full")[0];
        const bib = await fetchText(noParamUrl(url).replace("/full", "") + "/bibTex");
        const data = Object.fromEntries(
            Object.entries(bibtexToObject(bib)).map(([k, v]) => [
                k === "citationKey" || k === "entryType" ? k : k.toLowerCase(),
                v,
            ]),
        );
        data.author = flipAndAuthors(data.author);
        delete data.abstract;
        const { author, journal, year, title, citationKey } = data;
        const bibtex = bibtexToString(data);

        const venue = journal;
        const note = `Published @ ${venue} (${year})`;
        const id = `Frontiers-${year}_${miniHash(doi)}`;
        const key = citationKey;
        const pdfLink = url.replace(/\/full$/, "/pdf");

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace(/\/pdf$/, "/full");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

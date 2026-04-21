import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl, isPdfUrl } from "@pmu/functions.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchText } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class OupSource extends BasePaperSource {
    static name = "oup";
    static displayName = "OUP (Oxford University Press)";
    static patterns = [
        (url) =>
            (url
                .split("https://academic.oup.com/")[1]
                ?.split("/")[1]
                ?.indexOf("article") ?? -1) >= 0,
    ];

    static async urlToId(url, ctx) {
        let u = noParamUrl(url).split("https://academic.oup.com/").last();
        if (isPdfUrl(u)) {
            u = u.split("/").slice(0, -1).join("/");
        }
        const num = u.split("/").slice(2).join("");
        return ctx.findPaperForProperty(ctx.papers, "oup", miniHash(num));
    }

    static async parse(url) {
        url = noParamUrl(url);
        const resourceId = url.split("/").last();
        let bibtex = await fetchText(
            `https://academic.oup.com/Citation/Download?resourceId=${resourceId}&resourceType=3&citationFormat=2`,
        );
        const paper = bibtexToObject(bibtex);
        delete paper.abstract;
        bibtex = bibtexToString(paper);
        let { title, year, author, journal, doi, citationKey, eprint } = paper;
        author = flipAndAuthors(author);
        const venue = journal;
        const note = `Published @ ${venue} (${year})`;
        const key = citationKey;
        const num = url
            .split("https://academic.oup.com/")[1]
            .split("/")
            .slice(2)
            .join("");
        const id = `OUP-${year}_${miniHash(num)}`;
        const pdfLink = eprint?.replaceAll("\\", "") ?? url;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return `https://doi.org/${paper.doi}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

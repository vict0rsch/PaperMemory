import { BasePaperSource } from "./base.js";
import { miniHash } from "@pmu/functions.js";
import { fetchText } from "@pmu/parsers.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";

export class SciencedirectSource extends BasePaperSource {
    static name = "sciencedirect";
    static displayName = "ScienceDirect";
    static patterns = [
        "sciencedirect.com/science/article/pii/",
        "sciencedirect.com/science/article/abs/pii/",
        "reader.elsevier.com/reader/sd/pii/",
    ];

    static async urlToId(url, ctx) {
        const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
        return ctx.findPaperForProperty(ctx.papers, "sciencedirect", miniHash(pii));
    }

    static async parse(url) {
        const pii = url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
        const bibtex = await fetchText(
            `https://www.sciencedirect.com/sdfe/arp/cite?pii=${pii}&format=text%2Fx-bibtex&withabstract=false`,
        );
        const data = bibtexToObject(bibtex);

        const { author, journal, year, doi, title, citationKey } = data;
        const note = `Published @ ${journal} (${year})`;
        const id = `ScienceDirect-${year}_${miniHash(pii)}`;
        const venue = journal ?? "Science Direct";
        const pdfLink = `https://reader.elsevier.com/reader/sd/pii/${pii}`;

        return {
            author,
            bibtex,
            id,
            key: citationKey,
            note,
            pdfLink,
            title,
            venue,
            year,
        };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        const pii = pdf.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
        return `https://www.sciencedirect.com/science/article/pii/${pii}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

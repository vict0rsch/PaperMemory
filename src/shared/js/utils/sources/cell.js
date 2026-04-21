import { BasePaperSource } from "./base.js";
import { miniHash } from "@pmu/functions.js";
import { fetchBibtexToPaper, fetchDom, findCellPii } from "@pmu/parsers.js";

export class CellSource extends BasePaperSource {
    static name = "cell";
    static displayName = "Cell";
    static patterns = [
        (url) =>
            url.includes("cell.com/") &&
            url.split("cell.com/")[1].match(/\d{4}-\d{3}[0-9X]/),
    ];

    static async urlToId(url, ctx) {
        const { url: resolved } = await findCellPii(url);
        return ctx.findPaperForProperty(
            ctx.papers,
            "cell",
            miniHash(resolved.split("cell.com/")[1]),
        );
    }

    static async parse(url) {
        let pii;
        ({ pii, url } = await findCellPii(url));
        const pdfLink = `https://www.cell.com/action/showPdf?pii=${pii}`;
        const dom = await fetchDom(url);
        const doi = dom.head
            .querySelector('meta[name="citation_doi"]')
            .getAttribute("content");
        const paper = await fetchBibtexToPaper({ doi });
        const { author, year, title, venue, bibtex, note, citationKey } = paper;
        const id = `Cell-${year}_${miniHash(url.split("cell.com/")[1])}`;
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
            doi,
        };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        const journal = paper.id.split("_")[0].split("fulltext")[0];
        const pii = new URL(pdf).searchParams.get("pii");
        return `https://www.cell.com/${journal}/fulltext/${pii}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

import { BasePaperSource } from "./base.js";
import { miniHash, warn, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper, fetchDom } from "@pmu/parsers.js";
import { state } from "@pmu/config.js";

const findCellPii = async (url) => {
    const isPdf = url.toLowerCase().includes("showpdf");
    const isPdfExtended = url.toLowerCase().includes("pdfextended");
    let pii;
    if (isPdf || isPdfExtended) {
        const cellData = state.cellJournalData ?? {};
        pii = isPdf ? new URL(url).searchParams.get("pii") : url.split("/").last();
        const issn = pii.match(/\d{4}-\d{3}[0-9X]/g)[0];
        let venue;
        Object.entries(cellData).forEach(([key, value]) => {
            if (value.issn.includes(issn)) {
                venue = key;
            }
        });
        if (!venue) {
            warn(`[findCellPii] No Cell journal found for ISSN: ${issn}`);
            return { pii, url };
        }
        const target = venue
            .split(" ")
            .map((w) => w.toLowerCase())
            .join("-");
        url = isPdf
            ? noParamUrl(url).split("/showPdf")[0] + `/${target}/fulltext/${pii}`
            : noParamUrl(url).split("/pdfExtended")[0] + `/fulltext/${pii}`;
        url = url.replace("/action/", "/");
    } else {
        pii = noParamUrl(url).split("/").last();
    }
    return { pii, url };
};

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

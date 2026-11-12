import { BasePaperSource } from "./base.js";
import { isPdfUrl, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper, fetchText } from "@pmu/parsers.js";

export class PmcSource extends BasePaperSource {
    static name = "pmc";
    static displayName = "PMC (PubMed Central)";
    static patterns = [
        "ncbi.nlm.nih.gov/pmc/articles/PMC",
        "ncbi.nlm.nih.gov/articles/PMC",
        (url) => url.match(/ncbi.nlm.nih.gov\/\d+/),
    ];

    static async urlToId(url, ctx) {
        url = noParamUrl(url);
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        if (isPdfUrl(url)) {
            url = url.split("/pdf")[0];
        }
        const pmcid = url.includes("PMC")
            ? url.match(/PMC\d+/)[0].replace("PMC", "")
            : url.match(/ncbi.nlm.nih.gov\/(\d+)/)[1];
        return ctx.findPaperForProperty(ctx.papers, "pmc", pmcid);
    }

    static async parse(url) {
        url = noParamUrl(url);
        if (url.endsWith("/")) {
            url = url.slice(0, -1);
        }
        if (isPdfUrl(url)) {
            url = url.split("/pdf")[0];
        }
        const pmcid = url.includes("PMC")
            ? url.match(/PMC\d+/)[0].replace("PMC", "")
            : url.match(/ncbi.nlm.nih.gov\/(\d+)/)[1];
        const pdfLink = url + "/pdf";
        const html = await fetchText(url);
        const doi = html.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)[0];
        const { author, bibtex, key, note, title, venue, year } =
            await fetchBibtexToPaper({
                doi,
            });
        const id = `PMC-${year}_${pmcid}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        const pmcid = pdf.match(/PMC\d+/)[0];
        return pdf.split(pmcid)[0] + pmcid;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

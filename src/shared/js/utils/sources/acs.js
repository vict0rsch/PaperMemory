import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

export class AcsSource extends BasePaperSource {
    static name = "acs";
    static displayName = "ACS (American Chemical Society)";
    static patterns = ["pubs.acs.org/doi/"];

    static async urlToId(url, ctx) {
        let u = noParamUrl(url)
            .replace("pubs.acs.org/doi/pdf/", "/doi/")
            .replace("pubs.acs.org/doi/abs/", "/doi/");
        const doi = miniHash(u.split("/doi/")[1]);
        return `ACS_${doi}`;
    }

    static async parse(url) {
        url = url.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
        const doi = url.replace("/abs/", "/").split("/doi/")[1];
        const citeUrl = `https://pubs.acs.org/action/downloadCitation?doi=${doi}&include=cit&format=bibtex&direct=true`;
        const data = await fetchBibtexToPaper({ url: citeUrl });
        const author = data.author.replaceAll("\n", "").trim();
        const { bibtex, title, year, key } = data;
        const pdfLink = `https://pubs.acs.org/doi/pdf/${doi}`;
        const note = `Published @ ${data.journal} (${data.year})`;
        const id = `ACS_${doi.replaceAll(".", "").replaceAll("/", "")}`;
        const venue = data.journal;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return pdf.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static displayId(paper, id) {
        if (!id.includes(paper.year + "")) {
            id += `-${paper.year}`;
        }
        return id;
    }

    static async venue(paper) {
        return paper.venue;
    }
}

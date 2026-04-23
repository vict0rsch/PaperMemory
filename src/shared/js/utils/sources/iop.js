import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

export class IopSource extends BasePaperSource {
    static name = "iop";
    static displayName = "IOP (Institute Of Physics)";
    static patterns = ["iopscience.iop.org/article/"];

    static async urlToId(url) {
        let u = noParamUrl(url).replace(/\/pdf$/, "");
        const doi = miniHash(u.split("/article/")[1].split("/meta")[0]);
        return `IOPscience_${doi}`;
    }

    static async parse(url) {
        let author, bibtex, id, key, note, pdfLink, title, venue, year;
        url = url.split("#")[0];
        if (url.endsWith("/pdf")) url = url.slice(0, -4);

        const doi = url.split("/article/").last().split("/meta")[0];

        const data = await fetchBibtexToPaper({ doi });

        ({ author, bibtex, key, note, title, venue, year } = data);
        id = `IOPscience_${miniHash(doi)}`;
        pdfLink = url + "/pdf";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.split("#")[0].replace(/\/pdf$/, "");
    }

    static toPDF(paper) {
        let pdf = paper.pdfLink;
        if (!pdf.endsWith("/pdf")) pdf += "/pdf";
        return pdf;
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

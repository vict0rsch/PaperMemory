import { BasePaperSource } from "./base.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

export class JmlrSource extends BasePaperSource {
    static name = "jmlr";
    static displayName = "JMLR (Journal of Machine Learning Research)";
    static patterns = [
        (url) => url.includes("jmlr.org/papers/v") && !url.endsWith("/"),
    ];

    static async urlToId(url) {
        if (url.endsWith(".pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        url = url.replace(".html", "");
        const jid = url.split("/").last();
        const year = `20${jid.match(/\d+/)[0]}`;
        return `JMLR-${year}_${jid}`;
    }

    static async parse(url) {
        if (url.includes("/papers/volume")) {
            url = url.replace("/papers/volume", "/papers/v");
        }
        if (url.endsWith(".pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        url = url.replace(".html", "");
        const jid = url.split("/").last();
        const data = await fetchBibtexToPaper({ url: `${url}.bib` });
        const { author, bibtex, year, title, citationKey } = data;
        const key = citationKey.trim();
        const id = `JMLR-${year}_${jid}`;
        const note = `Published @ JMLR (${year})`;
        const pdfLink = url.replace("/papers/v", "/papers/volume") + `/${jid}.pdf`;
        const venue = "JMLR";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return (
            pdf
                .split("/")
                .slice(0, -1)
                .join("/")
                .replace("/papers/volume", "/papers/v") + ".html"
        );
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

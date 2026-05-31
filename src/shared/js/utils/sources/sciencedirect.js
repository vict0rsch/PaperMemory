import { BasePaperSource } from "./base.js";
import { miniHash } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

/**
 * Extract the article PII from any known ScienceDirect URL shape:
 *   - abstract page:   .../science/article/pii/{pii}
 *   - stable PDF link: .../science/article/pii/{pii}/pdfft
 *   - signed redirect: pdf.sciencedirectassets.com/.../1-s2.0-{pii}/main.pdf?...&pii={pii}
 * The signed redirect (the actual S3 asset) carries the PII as a `pii` query
 * param, with the `1-s2.0-{pii}` path segment as a fallback. We never store the
 * signed URL or its security tokens — only the PII is read from it.
 * @param {string} url
 * @returns {string|undefined}
 */
const sciencedirectPii = (url) => {
    if (url.includes("/pii/")) {
        return url.split("/pii/")[1].split("/")[0].split("#")[0].split("?")[0];
    }
    const param = new URL(url).searchParams.get("pii");
    if (param) return param;
    const segment = url
        .split("?")[0]
        .split("/")
        .reverse()
        .find((s) => /^1-s2\.0-S/.test(s));
    return segment ? segment.replace("1-s2.0-", "") : undefined;
};

export class SciencedirectSource extends BasePaperSource {
    static name = "sciencedirect";
    static displayName = "ScienceDirect";
    static patterns = [
        "sciencedirect.com/science/article/pii/",
        "sciencedirect.com/science/article/abs/pii/",
        "reader.elsevier.com/reader/sd/pii/",
        "pdf.sciencedirectassets.com/",
    ];

    static async urlToId(url, ctx) {
        const pii = sciencedirectPii(url);
        return ctx.findPaperForProperty(ctx.papers, "sciencedirect", miniHash(pii));
    }

    static async parse(url) {
        const pii = sciencedirectPii(url);
        const data = await fetchBibtexToPaper({
            url: `https://www.sciencedirect.com/sdfe/arp/cite?pii=${pii}&format=text%2Fx-bibtex&withabstract=false`,
        });
        const { author, bibtex, journal, year, title, citationKey } = data;
        const note = `Published @ ${journal} (${year})`;
        const id = `ScienceDirect-${year}_${miniHash(pii)}`;
        const venue = journal ?? "Science Direct";
        const pdfLink = `https://www.sciencedirect.com/science/article/pii/${pii}/pdfft`;

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
        const pii = sciencedirectPii(paper.pdfLink);
        return `https://www.sciencedirect.com/science/article/pii/${pii}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

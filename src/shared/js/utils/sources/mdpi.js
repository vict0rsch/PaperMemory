import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { extractDataFromDCMetaTags, fetchDom } from "@pmu/parsers.js";

export class MdpiSource extends BasePaperSource {
    static name = "mdpi";
    static displayName = "MDPI (Multidisciplinary Digital Publishing Institute)";
    static patterns = [(url) => /mdpi\.com\/\d+-.+/gi.test(url)];

    static async urlToId(url, ctx) {
        const mdpiId = noParamUrl(
            url
                .split("mdpi.com/")[1]
                .split("/pdf")[0]
                .split("/reprints")[0]
                .split("/notes")[0],
        );
        return ctx.findPaperForProperty(ctx.papers, "mdpi", miniHash(mdpiId));
    }

    static async parse(url) {
        url = noParamUrl(url);
        if (url.split("/").last().startsWith("pdf")) {
            url = url.split("/").slice(0, -1).join("/");
        }
        if (url.endsWith("/notes")) {
            url = url.replace("/notes", "");
        }
        if (url.endsWith("/reprints")) {
            url = url.replace("/reprints", "");
        }
        const dom = await fetchDom(url);
        let { author, year, publisher, title, venue, key, doi, bibtex, note, pdfLink } =
            extractDataFromDCMetaTags(dom);

        const id = `MDPI-${year}_${miniHash(url.split("mdpi.com/")[1])}`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return paper.pdfLink.split("/pdf")[0];
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

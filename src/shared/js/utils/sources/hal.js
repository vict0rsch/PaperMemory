import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";

export class HalSource extends BasePaperSource {
    static name = "hal";
    static displayName = "HAL";
    static patterns = [
        (url) => /hal\.science\/\w+-\d+(v\d+)?(\/document)?$/gi.test(url),
        (url) => /hal\.science\/\w+-\d+(v\d+)?\/file\/.+\.pdf$/gi.test(url),
    ];

    static async urlToId(url, ctx) {
        let u = noParamUrl(url).replace(
            /(hal\.science\/\w+-\d+)(v\d+)?((\/document|\/file\/.+\.pdf))?/,
            "$1",
        );
        const halId = u.split("/").last();
        return ctx.findPaperForProperty(ctx.papers, "hal", miniHash(halId));
    }

    static async parse(url) {
        url = noParamUrl(url).replace(
            /(hal\.science\/\w+-\d+)(v\d+)?(\/document)?/,
            "$1",
        ); // remove version
        const halId = url.match(/(hal-\d+)/)[1];
        const bibURL = `https://hal.science/${halId}/bibtex`;
        const { author, bibtex, key, note, title, venue, year } =
            await fetchBibtexToPaper({ url: bibURL });

        const id = `HAL-${year}_${miniHash(halId)}`;
        const pdfLink = url;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return pdf.split("/file/")[0].split("/document")[0];
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

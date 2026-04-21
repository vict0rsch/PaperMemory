import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class RscSource extends BasePaperSource {
    static name = "rsc";
    static displayName = "RSC (Royal Society of Chemistry)";
    static patterns = ["pubs.rsc.org/en/content/article"];

    static async urlToId(url, ctx) {
        const rscId = noParamUrl(url).replace("/unauth", "").split("/").last();
        return ctx.findPaperForProperty(ctx.papers, "rsc", miniHash(rscId));
    }

    static async parse(url) {
        url = noParamUrl(url).replace("/unauth", "");
        const rscId = url.split("/").last();
        const type = url
            .split("/")
            .find(
                (s) =>
                    s === "articlehtml" || s === "articlepdf" || s === "articlelanding",
            )
            .replace("article", "");
        const pdfLink =
            type === "articlepdf"
                ? url
                : url.replace(`/article${type}/`, "/articlepdf/");

        let { bibtex, key, author, venue, title, note, year, doi } =
            await fetchBibtexToPaper({
                url: `https://pubs.rsc.org/en/content/formatedresult?markedids=${rscId}&downloadtype=article&managertype=bibtex`,
            });
        author = flipAndAuthors(author);
        const id = `RSC-${venue.replaceAll(" ", "")}_${miniHash(rscId)}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/articlepdf/", "/articlelanding/");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

import { BasePaperSource } from "./base.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchDom, findACLValue } from "@pmu/parsers.js";

export class AclSource extends BasePaperSource {
    static name = "acl";
    static displayName = "ACL Anthology (Association for Computational Linguistics)";
    static patterns = ["aclanthology.org/"];

    static async urlToId(url, ctx) {
        let u = url.replace(".pdf", "");
        if (u.endsWith("/")) {
            u = u.slice(0, -1);
        }
        const key = u.split("/").last();
        return ctx.findPaperForProperty(ctx.papers, "acl", key);
    }

    static async parse(url) {
        url = url.replace(".pdf", "");
        const dom = await fetchDom(url);

        const bibtexEl = dom.getElementById("citeBibtexContent");
        if (!bibtexEl) return;

        const title = dom.getElementById("title").innerText;
        const bibtex = bibtexToString(bibtexEl.innerText);

        const bibtexData = bibtexToObject(bibtex);

        const year = bibtexData.year;
        const author = bibtexData.author
            .replace(/\s+/g, " ")
            .split(" and ")
            .map((v) =>
                v
                    .split(",")
                    .map((a) => a.trim())
                    .reverse()
                    .join(" "),
            )
            .join(" and ");
        const key = bibtexData.citationKey;

        const venue = findACLValue(dom, "Venue");
        const pdfLink = findACLValue(dom, "PDF");
        const aid = findACLValue(dom, "Anthology ID");

        const id = `ACL-${venue}-${year}_${aid}`;
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace(".pdf", "");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static async venue(paper) {
        let venue = BasePaperSource.extractVenueFromNote(paper);
        return paper.conf ?? venue;
    }
}

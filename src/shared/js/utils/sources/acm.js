import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl, isPdfUrl } from "@pmu/functions.js";
import { bibtexToString } from "@pmu/bibtexParser.js";

export class AcmSource extends BasePaperSource {
    static name = "acm";
    static displayName = "ACM (Association for Computing Machinery)";
    static patterns = ["dl.acm.org/doi/"];

    static async urlToId(url, ctx) {
        const doi = url.replace(/\/doi\/?(pdf|abs|full)?\//, "/doi/").split("/doi/")[1];
        return ctx.findPaperForProperty(ctx.papers, "acm", miniHash(doi));
    }

    static async parse(url) {
        let author, year, title, venue, key, bibtex, note, id, doi, pdfLink;
        url = noParamUrl(url);
        if (isPdfUrl(url)) {
            pdfLink = url;
        } else {
            pdfLink = url.replace(/\/doi\/?(abs|full)?\//, "/doi/pdf/");
        }
        doi = "10.5555/" + url.split("10.5555/")[1];
        const response = await fetch(
            "https://dl.acm.org/action/exportCiteProcCitation",
            {
                headers: {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                },
                referrer: `https://dl.acm.org/doi/${doi}`,
                body: `dois=${doi}&targetFile=custom-bibtex&format=bibTex`,
                method: "POST",
                mode: "cors",
            },
        );
        if (response.ok) {
            const data = await response.json();
            if (data && data.items && data.items.length > 0) {
                const item = data.items[0][doi];
                title = item.title;
                author = item.author.map((a) => `${a.given} ${a.family}`).join(" and ");
                year = item.issued["date-parts"][0][0] + "";
                venue = item["collection-title"];
                const ISBN = item.ISBN;
                bibtex = bibtexToString({
                    entryType: "article",
                    citationKey: doi,
                    journal: venue,
                    doi,
                    title,
                    ISBN,
                    year,
                });
                id = `ACM-${year}_${miniHash(doi)}`;
                key = doi;
                note = `Published @ ${venue} (${year})`;
            } else {
                throw new Error("Insufficient data from ACM citation");
            }
        } else {
            throw new Error("Failed to fetch ACM citation", response);
        }

        if (venue.match(/'\d+/g)) {
            venue = venue.replace(/'\d+/g, "");
        }
        if (venue.match(/\d+/g)) {
            venue = venue.replace(/\d+/g, "");
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/doi/pdf/", "/doi/");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

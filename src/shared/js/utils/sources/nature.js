import { BasePaperSource } from "./base.js";
import { firstNonStopLowercase } from "@pmu/functions.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import { queryAll, querySelector } from "@pmu/miniquery.js";
import { fetchDom } from "@pmu/parsers.js";

export class NatureSource extends BasePaperSource {
    static name = "nature";
    static displayName = "Nature";
    static patterns = ["nature.com/articles/"];

    static async urlToId(url, ctx) {
        const u = url.replace(".pdf", "").split("#")[0];
        const hash = u.split("/").last();
        return ctx.findPaperForProperty(ctx.papers, "nature", hash);
    }

    static async parse(url) {
        url = url.replace(".pdf", "").split("#")[0];
        const pdfLink = url + ".pdf";
        const hash = url.split("/").last();

        const dom = await fetchDom(url);

        const title = dom.querySelector("h1.c-article-title").innerText;
        const author = queryAll("ul.c-article-author-list li", dom)
            .map((a) =>
                a.innerText
                    .replace(/(\ ?,)|&|…|\d/g, "")
                    .split(/orcid/i)[0]
                    .trim(),
            )
            .filter((a) => a.length > 0)
            .join(" and ");
        const year = dom
            .querySelector(".c-article-info-details")
            .innerText.match(/\(\d{4}\)/)[0]
            .replace(/\(|\)/g, "");
        const journal = dom.querySelector(
            ".c-article-info-details [data-test]",
        ).innerText;
        const id = `Nature-${year}_${hash}`;

        const doiClasses = [
            ".c-bibliographic-information__citation",
            ".c-bibliographic-information__value",
        ];
        let doi;
        for (const doiClass of doiClasses) {
            doi = querySelector(doiClass, dom)?.innerText.split("https://doi.org/")[1];
            if (doi) break;
        }
        if (!doi) {
            doi = [...dom.getElementsByTagName("span")]
                .map((a) => a.innerText)
                .filter((a) => a.includes("https://doi.org"))[0];
        }

        const key = `${author.split(" ")[1]}${year}${firstNonStopLowercase(title)}`;
        let bibData = {
            citationKey: key,
            entryType: "article",
            author,
            title,
            journal,
            year,
        };
        if (doi) {
            bibData.doi = doi;
            bibData.url = `https://doi.org/${doi}`;
        }
        const bibtex = bibtexToString(bibData);
        const note = `Published @ ${journal} (${year})`;
        const venue = journal;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace(".pdf", "");
    }

    static toPDF(paper) {
        let pdf = paper.pdfLink;
        if (!pdf.endsWith(".pdf")) pdf += ".pdf";
        return pdf;
    }

    static displayId(paper, id) {
        if (paper.note?.match(/^Published\ @.+\(\d+\)$/)) {
            const journal = paper.note.split("@")[1].split("(")[0].trim();
            id += `-${journal
                .split(" ")
                .map((j) => j[0].toUpperCase())
                .join("")}`;
        }
        if (!id.includes(paper.year + "")) {
            id += `-${paper.year}`;
        }
        return id;
    }

    static async venue(paper) {
        let venue = BasePaperSource.extractVenueFromNote(paper);
        if (!venue) {
            venue = paper.venue;
        }
        return venue;
    }
}

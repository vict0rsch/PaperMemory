import { BasePaperSource } from "./base.js";
import { isPdfUrl, parseUrl } from "@pmu/functions.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import { fetchDom } from "@pmu/parsers.js";

export class IeeeSource extends BasePaperSource {
    static name = "ieee";
    static displayName = "IEEE (Institute of Electrical and Electronics Engineers)";
    static patterns = [
        "ieeexplore.ieee.org/document/",
        "ieeexplore.ieee.org/abstract/document/",
        "ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=",
    ];

    static async urlToId(url, ctx) {
        const articleId = url.includes("ieee.org/document/")
            ? url.split("ieee.org/document/")[1].match(/\d+/)[0]
            : url.includes("ieee.org/abstract/document/")
              ? url.split("ieee.org/abstract/document/")[1].match(/\d+/)[0]
              : url.split("arnumber=")[1].match(/\d+/)[0];
        return ctx.findPaperForProperty(ctx.papers, "ieee", articleId);
    }

    static async parse(url) {
        if (isPdfUrl(url)) {
            const articleId = url
                .split("/stamp/stamp.jsp?tp=&arnumber=")[1]
                .match(/\d+/)[0];
            url = `https://ieeexplore.ieee.org/document/${articleId}/`;
        }
        const dom = await fetchDom(url);
        const metadata = JSON.parse(
            [...dom.getElementsByTagName("script")]
                .filter((s) => s.innerHTML?.includes("metadata="))[0]
                .innerHTML.split("metadata=")[1]
                .split(/};\s*/)[0] + "}",
        );

        const title = metadata.title;
        const author = metadata.authors.map((a) => a.name).join(" and ");
        const year = metadata.publicationYear;
        const pdfLink = `${parseUrl(url).origin}${metadata.pdfUrl}`;
        const venue = metadata.publicationTitle;
        const key = metadata.articleId;
        const bibtex = bibtexToString({
            entryType: "article",
            citationKey: key,
            journal: venue,
            volume: metadata.volume,
            pages: `${metadata.startPage}-${metadata.endPage}`,
            doi: metadata.doi,
            title,
            year,
            author,
        });
        const id = `IEEE-${year}_${key}`;
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return `https://ieeexplore.ieee.org/document/${paper.key}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

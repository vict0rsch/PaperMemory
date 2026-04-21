import { BasePaperSource } from "./base.js";
import {
    arxivIdFromURL,
    firstNonStopLowercase,
    sendMessageToBackground,
} from "@pmu/functions.js";
import { queryAll } from "@pmu/miniquery.js";

export class ArxivSource extends BasePaperSource {
    static name = "arxiv";
    static displayName = "ArXiv";
    static isPreprint = true;
    static patterns = [
        "arxiv.org/abs/",
        "arxiv.org/pdf/",
        "scirate.com/arxiv/",
        "ar5iv.labs.arxiv.org/html/",
        "alphaxiv.org/abs/",
        "alphaxiv.org/pdf/",
        (url) =>
            url.includes("huggingface.co/papers/") &&
            url.split("huggingface.co/papers/")[1].match(/\d+\.\d+/),
    ];

    static async urlToId(url, ctx) {
        let arxivId = arxivIdFromURL(url);
        let idForUrl = `Arxiv-${arxivId}`;
        const existingIds = Object.values(ctx.titleHashToIds).find((ids) =>
            ids.includes(idForUrl),
        );
        if (existingIds) {
            idForUrl = existingIds.find((id) => !id.startsWith("Arxiv-")) ?? idForUrl;
        }
        return idForUrl;
    }

    static async parse(url, _tab, _ctx) {
        const arxivId = arxivIdFromURL(url);
        const xmlData = await sendMessageToBackground({
            type: "fetch-arxiv-xml",
            paperId: arxivId,
        });
        const doc = new DOMParser().parseFromString(
            xmlData.replaceAll("\n", ""),
            "text/xml",
        );

        const authors = queryAll("author name", doc).map((el) => el.innerHTML);
        const author = authors.join(" and ");

        const pdfLink = [...doc.getElementsByTagName("link")]
            .map((l) => l.getAttribute("href"))
            .filter((h) => h.includes("arxiv.org/pdf/"))[0]
            .replace(/v\d+(\.pdf)?$/gi, ".pdf");

        let title = doc.querySelector("entry title");
        title = title?.textContent || title?.innerText || "";
        const year = doc.querySelector("entry published").innerHTML.slice(0, 4);
        const key =
            authors[0].split(" ").last().toLowerCase() +
            year +
            firstNonStopLowercase(title);

        const id = `Arxiv-${arxivId.replace("/", "_")}`;

        let bibtex = "";
        bibtex += `@article{${key},\n`;
        bibtex += `    title={${title} },\n`;
        bibtex += `    author={${author} },\n`;
        bibtex += `    year={${year}},\n`;
        bibtex += `    journal={arXiv preprint arXiv: ${arxivId}}\n`;
        bibtex += `}`;

        const venue = "";

        return { author, bibtex, id, key, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return pdf.replace("/pdf/", "/abs/").replace(".pdf", "");
    }

    static toPDF(paper) {
        let pdf = paper.pdfLink;
        pdf = pdf
            .replace("arxiv.org/abs/", "arxiv.org/pdf/")
            .replace(/\.pdf$/, "")
            .replace(/v\d+$/gi, "");
        pdf += ".pdf";
        return pdf;
    }

    static async venue() {
        return "";
    }
}

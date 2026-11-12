import { BasePaperSource } from "./base.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { fetchText } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class IjcaiSource extends BasePaperSource {
    static name = "ijcai";
    static displayName =
        "IJCAI (International Joint Conferences on Artificial Intelligence)";
    static patterns = [(url) => /ijcai\.org\/proceedings\/\d{4}\/\d+/gi.test(url)];

    static async urlToId(url) {
        const procId = url.endsWith(".pdf")
            ? url
                  .replace(".pdf", "")
                  .split("/")
                  .last()
                  .match(/[1-9]\d*/)[0]
            : url.split("/").last();
        const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];
        return `IJCAI-${year}_${procId}`;
    }

    static async parse(url) {
        const procId = url.endsWith(".pdf")
            ? url
                  .replace(".pdf", "")
                  .split("/")
                  .last()
                  .match(/[1-9]\d*/)[0]
            : url.split("/").last();

        const year = url.match(/proceedings\/\d+/gi)[0].split("/")[1];

        const bibtex = (
            await fetchText(
                `https://www.ijcai.org/proceedings/${year}/bibtex/${procId}`,
            )
        ).replace(/}\n/gi, "},\n");
        const data = bibtexToObject(
            bibtex
                .split("\n")
                .filter((line) => !/note\s+=/gi.test(line))
                .join("\n"),
        );

        const key = data.citationKey;
        const title = data.title;
        const author = flipAndAuthors(data.author);
        const id = `IJCAI-${year}_${procId}`;
        const note = `Accepted @ IJCAI (${year})`;
        const venue = "IJCAI";
        const pdfId = procId.padStart(4, 0);
        const pdfLink = `https://www.ijcai.org/proceedings/${year}/${pdfId}.pdf`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        const procId = pdf
            .replace(".pdf", "")
            .split("/")
            .last()
            .match(/[1-9]\d*/);
        const year = pdf.match(/proceedings\/\d+/gi)[0].split("/")[1];
        return `https://www.ijcai.org/proceedings/${year}/${procId}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static async venue() {
        return "IJCAI";
    }
}

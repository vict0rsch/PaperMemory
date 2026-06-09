import { BasePaperSource } from "./base.js";
import { extractBibtexValue, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchDom } from "@pmu/parsers.js";

/**
 * Extract the author from a bibtex string, as an "and" separated list of names.
 * eg: "John Doe and Jane Doe"
 * @param {string} bibtex The bibtex string to extract the author from.
 * @returns {string} The author.
 */
const extractAuthor = (bibtex) =>
    extractBibtexValue(bibtex, "author")
        .replaceAll("{", "")
        .replaceAll("}", "")
        .replaceAll("\\", "")
        .split(" and ")
        .map((a) => a.split(", ").reverse().join(" "))
        .join(" and ");

export class PMLRSource extends BasePaperSource {
    static name = "pmlr";
    static displayName = "PMLR (Proceedings of Machine Learning Research)";
    static patterns = ["proceedings.mlr.press/"];

    /** @type {Record<string, string>} long booktitle substring → short venue */
    static confOverrides = {
        "Conference on Learning Theory": "CoLT",
        "International Conference on Machine Learning": "ICML",
        "Conference on Uncertainty in Artificial Intelligence": "UAI",
        "Conference on Robot Learning": "CoRL",
        "International Conference on Artificial Intelligence and Statistics": "AISTATS",
        "International Conference on Algorithmic Learning Theory": "ALT",
    };

    static async urlToId(url) {
        const key = url.split("/").last().split(".")[0];
        const year = "20" + key.match(/\d+/)[0];
        return `PMLR-${year}-${key}`;
    }

    static async parse(url) {
        const key = url.split("/").last().split(".")[0];
        const id = await PMLRSource.urlToId(url);

        const absURL = url.includes(".html")
            ? url
            : url.split("/").slice(0, -1).join("/") + ".html";

        const pdfLink = absURL.replace(".html", "") + `/${key}.pdf`;

        const dom = await fetchDom(absURL);

        const bibtexRaw = dom
            .getElementById("bibtex")
            .innerText.replaceAll("\t", " ")
            .replaceAll(/\s\s+/g, " ");
        let bibtex = bibtexRaw;
        const items = bibtexRaw.match(/,\ ?\w+ ?= ?{/g);
        for (const item of items) {
            bibtex = bibtex.replace(
                item,
                item.replace(", ", ",\n    ").replace(" = ", "="),
            );
        }
        if (bibtex.endsWith("}}")) {
            bibtex = bibtex.slice(0, -2) + "}\n}";
        }
        bibtex = bibtexToString(bibtex);

        const author = extractAuthor(bibtex);
        const title = dom.getElementsByTagName("h1")[0].innerText;
        const year = extractBibtexValue(bibtex, "year");

        let conf = extractBibtexValue(bibtex, "booktitle").replaceAll(
            "Proceedings of the",
            "",
        );
        let venue = conf;
        let note = `Accepted @ ${venue} (${year})`;
        for (const long in PMLRSource.confOverrides) {
            if (conf.includes(long)) {
                venue = PMLRSource.confOverrides[long];
                conf = venue + " " + year;
                note = "Accepted @ " + conf;
                break;
            }
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return pdf.split("/").slice(0, -1).join("/") + ".html";
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static async venue(paper) {
        return paper.conf?.split(/\d{4}/)[0] ?? "";
    }
}

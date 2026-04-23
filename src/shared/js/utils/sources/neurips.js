import { BasePaperSource } from "./base.js";
import { cleanStr, firstNonStopLowercase, parseUrl } from "@pmu/functions.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { queryAll } from "@pmu/miniquery.js";
import { fetchDom, fetchText, flipAndAuthors } from "@pmu/parsers.js";

export class NeuripsSource extends BasePaperSource {
    static name = "neurips";
    static displayName = "NeurIPS (Neural Information Processing Systems)";
    static patterns = [
        "neurips.cc/paper/",
        "neurips.cc/paper_files/paper/",
        "nips.cc/paper/",
        "nips.cc/paper_files/paper/",
    ];

    static async urlToId(url) {
        const year = url.split("/paper/")[1].split("/")[0];
        const hash = url.split("/").last().split("-")[0].slice(0, 8);
        return `NeurIPS-${year}_${hash}`;
    }

    static async parse(url) {
        if (url.endsWith(".pdf")) {
            url = url
                .replace("/file/", "/hash/")
                .replace(/-Paper(.*)\.pdf/, "-Abstract$1.html");
        }
        const hash = url.split("/").slice(-1)[0].split("-Paper")[0];

        const dom = await fetchDom(url);

        const citeUrl = [...dom.getElementsByTagName("a")]
            .filter((a) => a.innerText === "Bibtex")[0]
            ?.getAttribute("href");

        let bibtex, author, title, year, key, citationKey;

        if (citeUrl) {
            bibtex = await fetchText(`https://${parseUrl(url).host}${citeUrl}`);
            ({ author, citationKey, title, year } = bibtexToObject(bibtex));
            author = flipAndAuthors(author);
            key = citationKey;
        } else {
            const paragraphs = queryAll(".container-fluid .col p", dom);

            title = dom.getElementsByTagName("h4")[0].innerHTML;
            const h4Authors = queryAll("h4", dom).filter(
                (h) => h.innerText === "Authors",
            )[0];

            author = h4Authors.nextElementSibling.innerText
                .split(", ")
                .map((authorName) =>
                    authorName
                        .split(" ")
                        .map((p) => p.capitalize())
                        .join(" "),
                )
                .join(" and ");
            year = paragraphs[0].innerHTML.match(/\d{4}/)[0];
            key = `neurips${year}${hash.slice(0, 8)}`;

            bibtex = "";
            bibtex += `@inproceedings{NEURIPS${year}_${hash.slice(0, 8)},\n`;
            bibtex += `    author={${author}},\n`;
            bibtex += `    booktitle={Advances in Neural Information Processing Systems},\n`;
            bibtex += `    editor={H.Larochelle and M.Ranzato and R.Hadsell and M.F.Balcan and H.Lin},\n`;
            bibtex += `    publisher={Curran Associates, Inc.},\n`;
            bibtex += `    title={${title}},\n`;
            bibtex += `    url={${url}},\n`;
            bibtex += `    year={${year}}\n`;
            bibtex += `}`;
            bibtex = bibtexToString(bibtex);
        }

        const pdfLink = url
            .replace("/hash/", "/file/")
            .replace("-Abstract.html", "-Paper.pdf");
        const id = `NeurIPS-${year}_${hash.slice(0, 8)}`;
        const venue = "NeurIPS";
        const note = `Accepted @ ${venue} (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink
            .replace("/file/", "/hash/")
            .replace("-Paper.pdf", "-Abstract.html");
    }

    static toPDF(paper) {
        return paper.pdfLink
            .replace("/hash/", "/file/")
            .replace("-Abstract.html", "-Paper.pdf");
    }

    static async venue() {
        return "NeurIPS";
    }
}

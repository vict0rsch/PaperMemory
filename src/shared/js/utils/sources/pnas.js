import { BasePaperSource } from "./base.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import { queryAll } from "@pmu/miniquery.js";
import { fetchDom } from "@pmu/parsers.js";

export class PnasSource extends BasePaperSource {
    static name = "pnas";
    static displayName = "PNAS (Proceedings of the National Academy of Sciences)";
    static patterns = ["pnas.org/content/", "pnas.org/doi/"];

    static async urlToId(url, ctx) {
        const u = url.replace(".full.pdf", "");
        const pid = u.endsWith("/")
            ? u.split("/").slice(-2)[0]
            : u.split("/").slice(-1)[0];

        return ctx.findPaperForProperty(ctx.papers, "pnas", pid);
    }

    static async parse(url) {
        url = url.replace(".full.pdf", "").replace(/\/doi\/e?pdf\//, "/doi/abs/");
        const dom = await fetchDom(url);

        const title = dom.getElementsByTagName("h1")[0].innerText;
        const author = queryAll(
            ".authors span[property='author'] a:not([property='email']):not(.orcid-id)",
            dom,
        )
            .filter((el) => !el.getAttribute("href").includes("mailto:"))
            .map((el) => el.innerText)
            .join(" and ");

        const year = dom
            .querySelector("span[property='datePublished']")
            .innerText.match(/\d{4}/g)[0];

        const pid = url.endsWith("/")
            ? url.split("/").slice(-2)[0]
            : url.split("/").slice(-1)[0];

        const id = `PNAS-${year}_${pid}`;
        const pdfLink =
            url.includes("/doi/pdf/") || url.includes("/doi/epdf/")
                ? url.replace("/doi/epdf/", "/doi/pdf/")
                : url
                      .replace("/doi/abs/", "/doi/pdf/")
                      .replace("/doi/full/", "/doi/pdf/");
        const doi = [...dom.querySelector(".core-container").getElementsByTagName("a")]
            .map((a) => a.getAttribute("href"))
            .filter((a) => a?.includes("https://doi.org"))[0]
            .split("/")
            .slice(-2)
            .join("/");
        const key = `doi:${doi}`;
        const bibtex = bibtexToString(`
    @article{${key},
        author={${author}},
        title={${title}},
        journal = {Proceedings of the National Academy of Sciences},
        year={${year}},
        doi={${doi}},
        eprint={${pdfLink}},
        URL={${pdfLink.replace("/doi/pdf/", "/doi/abs/")}}
    }`);
        const venue = "PNAS";

        const note = `Published @ PNAS (${year})`;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink
            .replace(".full.pdf", "")
            .replace("/doi/pdf/", "/doi/full/");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static async venue() {
        return "PNAS";
    }
}

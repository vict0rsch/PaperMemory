import { BasePaperSource } from "./base.js";
import {
    firstNonStopLowercase,
    miniHash,
    parseUrl,
    urlToWebsiteId,
} from "@pmu/functions.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import { fetchDom } from "@pmu/parsers.js";

export class WebsiteSource extends BasePaperSource {
    static name = "website";
    static displayName = "Manually parsed website";
    static patterns = [];

    static matches() {
        return false;
    }

    static async urlToId(url) {
        return urlToWebsiteId(url);
    }

    static async parse(_url, tab) {
        const url = tab.url;
        const dom = await fetchDom(url);
        const og = Object.fromEntries(
            [...dom.querySelectorAll("meta")]
                .filter((m) => m.getAttribute("property"))
                .filter((m) => m.getAttribute("property").startsWith("og:"))
                .map((m) => [
                    m.getAttribute("property").replace("og:", ""),
                    m.getAttribute("content"),
                ]),
        );

        const author =
            og.site_name || parseUrl(url).hostname.replace("www.", "").capitalize();
        const year = new Date().getFullYear() + "";
        const id = `Website_${urlToWebsiteId(url)}`;
        const note = og.description || "";
        const pdfLink = url;
        const title = og.title || tab.title;
        const key = `${miniHash(author)}${year}${firstNonStopLowercase(title)}`;
        const venue = "";
        const accessDate = new Date().toISOString().split("T")[0];
        const bib = `@misc{${key},
        author = {${author}},
        title = {${title}},
        year = {${year}},
        url = {${url}},
        note = {Accessed ${accessDate}}
    }`;
        const bibtex = bibtexToString(bibtexToObject(bib));
        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

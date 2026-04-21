import { BasePaperSource } from "./base.js";
import { cleanBiorxivURL } from "@pmu/functions.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import {
    extractAuthor,
    fetchBibtexToPaper,
    extractDataFromDCMetaTags,
} from "@pmu/parsers.js";

export class BiorxivSource extends BasePaperSource {
    static name = "biorxiv";
    static displayName = "BioRxiv";
    static isPreprint = true;
    static patterns = ["biorxiv.org/content"];

    static async urlToId(url, ctx) {
        url = cleanBiorxivURL(url);
        let id = url.split("/").last();
        if (id.match(/v\d+$/)) {
            id = id.split("v")[0];
        }
        let idForUrl = `Biorxiv-${id}`;
        const existingIds = Object.values(ctx.titleHashToIds).find((ids) =>
            ids.includes(idForUrl),
        );
        if (existingIds) {
            idForUrl = existingIds.find((i) => !i.startsWith("Biorxiv-")) ?? idForUrl;
        }
        return idForUrl;
    }

    static async parse(url, _tab, ctx) {
        let author, bibtex, id, key, note, pdfLink, title, venue, year;
        const biorxivAPI = "https://api.biorxiv.org";
        const pageURL = url.replace(".full.pdf", "");
        let doi = url
            .split("/")
            .slice(-2)
            .join("/")
            .replace(".full.pdf", "")
            .split("v")[0];
        const api = `${biorxivAPI}/details/biorxiv/${doi}`;
        const data = await fetch(api).then((response) => {
            return response.json();
        });

        const paper = data.collection.length > 0 ? data.collection.last() : undefined;

        if (paper && paper.published.startsWith("10.")) {
            doi = paper.published;
            const paperData = await fetchBibtexToPaper({ doi });
            ({ author, bibtex, key, note, title, venue, year } = paperData);
        } else {
            const pageText = await (await fetch(pageURL)).text();

            const dom = new DOMParser().parseFromString(
                pageText.replaceAll("\n", ""),
                "text/html",
            );

            ({ author, bibtex, key, note, title, venue, year } =
                extractDataFromDCMetaTags(dom));
        }
        pdfLink = cleanBiorxivURL(url) + ".full.pdf";
        id = await BiorxivSource.urlToId(url, ctx);

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace(".full.pdf", "");
    }

    static toPDF(paper) {
        return cleanBiorxivURL(paper.pdfLink) + ".full.pdf";
    }

    static async venue() {
        return "";
    }
}

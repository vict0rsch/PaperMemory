import { BasePaperSource } from "./base.js";
import { noParamUrl, warn } from "@pmu/functions.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { fetchJSON, fetchText } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";

export class IhepSource extends BasePaperSource {
    static name = "ihep";
    static displayName = "IHEP (INSPIRE - High Energy Physics)";
    static patterns = ["inspirehep.net/literature/", "inspirehep.net/files/"];

    static async urlToId(url, ctx) {
        if (url.includes("/literature/")) {
            const num = noParamUrl(url).match(/\/literature\/(\d+)/)[1];
            return ctx.findPaperForProperty(ctx.papers, "ihep", num);
        } else {
            const hash = noParamUrl(url).split("/files/")[1].split("/")[0];
            return ctx.findPaperForProperty(ctx.papers, "ihep", hash, "pdfLink");
        }
    }

    static async parse(url) {
        let data, num;
        if (url.includes("/files/")) {
            const hash = url.split("/files/")[1].split("/")[0];
            const api = `https://inspirehep.net/api/literature?q=documents.key:${hash}`;
            const results = (await fetchJSON(api)).data;
            data = results.hits.hits.find(
                (h) => !!h.metadata.documents.find((d) => d.key === hash),
            );
            if (!data) {
                warn("Could not find an Inspire HEP record for the url", url);
                return;
            }
            num = data.metadata.control_number;
        } else {
            num = url.match(/\/literature\/(\d+)/)[1];
        }
        if (!num) {
            warn("Could not find an Inspire HEP id for the url", url);
            return;
        }
        const bibtex = await fetchText(
            `https://inspirehep.net/api/literature/${num}?format=bibtex`,
        );
        if (!data) {
            ({ data } = await fetchJSON(
                `https://inspirehep.net/api/literature/${num}?format=json`,
            ));
        }
        const bibObj = bibtexToObject(bibtex);
        let title = bibObj.title ?? data.metadata.titles[0].title;
        if (title.startsWith("{") && title.endsWith("}")) title = title.slice(1, -1);
        const pdfLink = data.metadata.documents?.[0]?.url ?? url;
        const author = flipAndAuthors(bibObj.author);
        const year = bibObj.year ?? data.created.split("-")[0];
        const id = `IHEP-${num}`;
        const venue = bibObj.journal ?? "Inspire HEP";
        const key = bibObj.citationKey;
        const note = `Published @ ${venue} (${year})`;
        const doi = bibObj.doi ?? "";

        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return `https://inspirehep.net/literature/${paper.id.split("-")[1]}`;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

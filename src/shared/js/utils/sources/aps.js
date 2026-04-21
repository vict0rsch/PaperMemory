import { BasePaperSource } from "./base.js";
import { miniHash, parseUrl } from "@pmu/functions.js";
import { journalAbbreviations } from "@pmu/config.js";
import { bibtexToObject } from "@pmu/bibtexParser.js";
import { fetchText } from "@pmu/parsers.js";
import { flipAndAuthors } from "@pmu/parsers.js";
import { readJournalAbbreviations } from "@pmu/state.js";

export class ApsSource extends BasePaperSource {
    static name = "aps";
    static displayName = "APS (American Physical Society)";
    static patterns = [
        (url) => Boolean(url.match(/journals\.aps\.org\/\w+\/(abstract|pdf)\//g)),
    ];

    static async urlToId(url, ctx) {
        const [journal, type] = parseUrl(url.split("#")[0])
            .pathname.split("/")
            .slice(1, 3);
        const doi = url.split(`/${journal}/${type}/`).last();
        return ctx.findPaperForProperty(ctx.papers, "aps", miniHash(doi));
    }

    static async parse(url) {
        url = url.split("#")[0];
        const [journal, type] = parseUrl(url).pathname.split("/").slice(1, 3);
        const doi = url.split(`/${journal}/${type}/`).last();
        const exportPath = url.replace(`/${journal}/${type}/`, `/${journal}/export/`);
        const bibtex = await fetchText(`${exportPath}?type=bibtex&download=true`);
        const data = bibtexToObject(bibtex);
        const pdfLink = url.replace(`/${journal}/${type}/`, `/${journal}/pdf/`);
        const id = `APS-${data.year}_${miniHash(doi)}`;
        const journalKey = data.journal ?? data.publisher;
        await readJournalAbbreviations();
        const venue = journalAbbreviations[miniHash(journalKey)] ?? journalKey;
        const note = `Published @ ${venue} (${data.year})`;
        return {
            author: flipAndAuthors(data.author),
            bibtex,
            id,
            key: data.citationKey,
            note,
            pdfLink,
            title: data.title,
            venue,
            year: data.year,
        };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        const urlParts = parseUrl(pdf).pathname.split("/").slice(1, 3);
        const journal = urlParts[0];
        const type = urlParts[1];
        return pdf.replace(`/${journal}/${type}/`, `/${journal}/abstract/`);
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

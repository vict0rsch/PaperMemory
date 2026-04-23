import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchCrossRefDataForDoi } from "@pmu/parsers.js";

export class SpringerSource extends BasePaperSource {
    static name = "springer";
    static displayName = "Springer";
    static types = ["chapter", "article", "book", "referenceworkentry"];
    static patterns = [
        ...SpringerSource.types.map((type) => `link.springer.com/${type}/`),
        "link.springer.com/content/pdf/",
    ];

    static async urlToId(url, ctx) {
        const types = [...SpringerSource.types, "content/pdf"];
        let type = types.filter((c) => url.includes(`/${c}/`))[0];
        if (!type) {
            if (!url.includes("/content/pdf/")) {
                throw new Error(`Could not find Springer type for ${url}`);
            }
            type = "content/pdf";
        }
        let doi = noParamUrl(url).split(`/${type}/`)[1].replace(".pdf", "");
        return ctx.findPaperForProperty(ctx.papers, "springer", miniHash(doi));
    }

    static async parse(url) {
        const types = [...SpringerSource.types, "content/pdf"];
        const springerType = types.find((c) => url.includes(`/${c}/`));
        if (!springerType) {
            throw new Error(
                `Could not find Springer type for ${url} (known: ${types.join(", ")})`,
            );
        }
        const doi = url.split(`/${springerType}/`)[1].split("?")[0].replace(".pdf", "");

        const { data } = await fetchCrossRefDataForDoi(doi);

        if (!data) {
            throw new Error("Aborting Springer paper parsing, see error above");
        }

        const { author, bibtex, citationKey, year, title, venue } = data;

        const id = `Springer-${year}_${miniHash(doi)}`;
        const note = `Published @ ${venue} (${year})`;

        const pdfLink =
            data.pdf ??
            (springerType === "content/pdf"
                ? url
                : url.replace(`/${springerType}/`, "/content/pdf/") + ".pdf");

        return {
            author,
            bibtex,
            id,
            key: citationKey,
            note,
            pdfLink,
            title,
            venue,
            year,
            extra: { url: `https://doi.org/${doi}` },
        };
    }

    static toAbs(paper) {
        return paper.extra.url;
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

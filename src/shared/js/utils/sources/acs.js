import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper, fetchDom } from "@pmu/parsers.js";

export class AcsSource extends BasePaperSource {
    static name = "acs";
    static displayName = "ACS (American Chemical Society)";
    static patterns = [
        "pubs.acs.org/doi/",
        // Silverchair article pages: /<journal>/article/... and /<journal>/article-abstract/...
        (url) => {
            try {
                const { hostname, pathname } = new URL(url);
                return (
                    hostname === "pubs.acs.org" &&
                    /^\/[^/]+\/article(-abstract)?\//.test(pathname)
                );
            } catch (e) {
                return false;
            }
        },
    ];

    static async urlToId(url, ctx) {
        // Silverchair article URLs carry no DOI: return undefined so that
        // addOrUpdatePaper parses the page and matches the paper on its DOI-based id.
        if (!url.includes("pubs.acs.org/doi/")) return;
        let u = noParamUrl(url)
            .replace("pubs.acs.org/doi/pdf/", "/doi/")
            .replace("pubs.acs.org/doi/abs/", "/doi/");
        const doi = miniHash(u.split("/doi/")[1]);
        return `ACS_${doi}`;
    }

    static async parse(url) {
        url = url.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
        const doi = url.includes("pubs.acs.org/doi/")
            ? url.replace("/abs/", "/").split("/doi/")[1]
            : (await fetchDom(url))
                  .querySelector('meta[name="citation_doi"]')
                  ?.getAttribute("content");
        if (!/^10\.\d{4,9}\/[-._;()\/:A-Za-z0-9]+$/.test(doi)) {
            throw new Error(`ACS: invalid or missing DOI (${doi}) for ${url}`);
        }
        const data = await fetchBibtexToPaper({ doi });
        const author = data.author.replaceAll("\n", "").trim();
        const { bibtex, title, year, key } = data;
        const pdfLink = `https://pubs.acs.org/doi/pdf/${doi}`;
        const note = `Published @ ${data.journal} (${data.year})`;
        const id = `ACS_${doi.replaceAll(".", "").replaceAll("/", "")}`;
        const venue = data.journal;

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        const pdf = paper.pdfLink;
        return pdf.replace("pubs.acs.org/doi/pdf/", "pubs.acs.org/doi/").split("?")[0];
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }

    static displayId(paper, id) {
        if (!id.includes(paper.year + "")) {
            id += `-${paper.year}`;
        }
        return id;
    }

    static async venue(paper) {
        return paper.venue;
    }
}

import { BasePaperSource } from "./base.js";
import { miniHash, noParamUrl } from "@pmu/functions.js";
import { fetchBibtexToPaper, fetchDom } from "@pmu/parsers.js";

/**
 * Validate a DOI read from a URL or page metadata, and the article code it ends
 * with (`rscId`, lowercased, e.g. d2dd00066k), before either reaches a fetch,
 * an id, `miniHash` or a stored link.
 * @param {string|undefined} doi
 * @param {string} from where the DOI was read, for the error message
 * @returns {{ doi: string, rscId: string }}
 */
const checkDoi = (doi, from) => {
    if (!/^10\.\d{4,9}\/[-._;()\/:A-Za-z0-9]+$/.test(doi ?? "")) {
        throw new Error(`RSC: missing or invalid DOI in ${from}: ${doi}`);
    }
    const rscId = doi.split("/").last();
    if (!/^[a-z0-9]+$/i.test(rscId)) {
        throw new Error(`RSC: invalid article code in ${from}: ${rscId}`);
    }
    return { doi, rscId: rscId.toLowerCase() };
};

/**
 * Read the journal code (e.g. dd) and, when the URL carries it, the checked DOI
 * and article code from any known RSC URL shape:
 *   - legacy abstract/PDF URL:
 *       pubs.rsc.org/en/content/article{landing,pdf,html}/{year}/{journal}/{rscId}
 *   - Silverchair abstract URL, whose DOI is only in the page's metadata:
 *       pubs.rsc.org/{journal}/article/{vol}/{issue}/{page}/{id}/{slug}
 *   - signed CDN PDF URL:
 *       rscj.silverchair-cdn.com/rscj/content_public/journal/{journal}/{vol}/{issue}/10.1039_{rscId}/{n}/{rscId}.pdf?Expires=...
 * Only the path is read from the signed PDF URL: its expiring tokens are never
 * stored.
 * @param {string} url
 * @returns {{ journal: string, doi?: string, rscId?: string }}
 */
const parseRscUrl = (url) => {
    url = noParamUrl(url).replace("/unauth", "");
    if (url.includes("pubs.rsc.org/en/content/article")) {
        const [journal, rscId] = url.split("/").slice(-2);
        return { journal, ...checkDoi(`10.1039/${rscId}`, "legacy URL") };
    }
    if (url.includes("/content_public/journal/")) {
        const parts = url.split("/content_public/journal/")[1].split("/");
        const doi = parts.find((p) => p.startsWith("10.1039_"))?.replace("_", "/");
        return { journal: parts[0], ...checkDoi(doi, "CDN URL path") };
    }
    const { hostname, pathname } = new URL(url);
    if (hostname !== "pubs.rsc.org") {
        throw new Error(`RSC: unexpected host: ${hostname}`);
    }
    return { journal: pathname.split("/")[1] };
};

export class RscSource extends BasePaperSource {
    static name = "rsc";
    static displayName = "RSC (Royal Society of Chemistry)";
    static patterns = [
        "pubs.rsc.org/en/content/article",
        (url) => {
            try {
                const { hostname, pathname } = new URL(url);
                return (
                    hostname === "pubs.rsc.org" &&
                    /^\/[a-z]+\/article\/\d+\/\d+\/\d+\/\d+(\/|$)/.test(pathname)
                );
            } catch (error) {
                return false;
            }
        },
        (url) => {
            try {
                const { hostname, pathname } = new URL(url);
                const pdfPath =
                    /^\/rscj\/content_public\/journal\/[a-z]+\/.+\/10\.1039_[a-z0-9]+\//i;
                return (
                    hostname === "rscj.silverchair-cdn.com" && pdfPath.test(pathname)
                );
            } catch (error) {
                return false;
            }
        },
    ];

    static async urlToId(url, ctx) {
        const { rscId } = parseRscUrl(url);
        return rscId && ctx.findPaperForProperty(ctx.papers, "rsc", miniHash(rscId));
    }

    static async parse(url) {
        let { journal, doi, rscId } = parseRscUrl(url);
        if (!doi) {
            // Silverchair abstract URLs only carry the DOI in the page's metadata
            const dom = await fetchDom(url);
            const metaDoi = dom
                .querySelector("meta[name='citation_doi']")
                ?.getAttribute("content");
            ({ doi, rscId } = checkDoi(metaDoi, "citation_doi meta"));
        }
        if (!/^[a-z0-9]+$/i.test(journal)) {
            throw new Error(`RSC: invalid journal code: ${journal}`);
        }

        const { bibtex, key, author, venue, title, note, year } =
            await fetchBibtexToPaper({ doi, flipAuthors: true });
        const id = `RSC-${venue.replaceAll(" ", "")}_${miniHash(rscId)}`;
        const pdfLink = `https://pubs.rsc.org/en/content/articlepdf/${year}/${journal}/${rscId}`;
        return { author, bibtex, id, key, note, pdfLink, title, venue, year, doi };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/articlepdf/", "/articlelanding/");
    }

    static toPDF(paper) {
        return paper.pdfLink;
    }
}

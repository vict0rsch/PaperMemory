import { BasePaperSource } from "./base.js";
import { parseCVFUrl } from "@pmu/functions.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import { fetchCvfHTML } from "@pmu/parsers.js";

export class CVFSource extends BasePaperSource {
    static name = "cvf";
    static displayName = "CVF (Computer Vision Foundation)";
    static patterns = ["openaccess.thecvf.com/content"];

    static async urlToId(url) {
        return parseCVFUrl(url).id;
    }

    static async parse(url) {
        const htmlText = await fetchCvfHTML(url);
        const dom = new DOMParser().parseFromString(
            htmlText.replaceAll("\n", ""),
            "text/html",
        );
        const title = dom.getElementById("papertitle").innerText.trim();
        let author = dom
            .querySelector("#authors i")
            .innerText.split(",")
            .map((a) => a.trim())
            .join(" and ");
        const { year, id, conf } = parseCVFUrl(url);
        let pdfLink = "";
        if (url.endsWith(".pdf")) {
            pdfLink = url;
        } else {
            let href = [...dom.getElementsByTagName("a")]
                .filter((a) => a.innerText === "pdf")[0]
                .getAttribute("href");
            if (href.startsWith("../")) {
                href = href.replaceAll("../", "");
            }
            if (!href.startsWith("/")) {
                href = "/" + href;
            }
            pdfLink = "http://openaccess.thecvf.com" + href;
        }
        const venue = conf;
        const note = `Accepted @ ${venue} (${year})`;
        const bibtex = bibtexToString(dom.querySelector(".bibref").innerText);
        const key = bibtex.split("{")[1].split(",")[0];

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/papers/", "/html/").replace(".pdf", ".html");
    }

    static toPDF(paper) {
        return paper.pdfLink.replace("/html/", "/papers/").replace(".html", ".pdf");
    }

    static async venue(paper) {
        let venue = BasePaperSource.extractVenueFromNote(paper);
        if (!venue) {
            venue = (await CVFSource.parse(paper.pdfLink, null, {})).venue;
        }
        return venue;
    }
}

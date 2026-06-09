import { expect } from "expect";
import { JSDOM } from "jsdom";

import { loadPaperMemoryUtils, range, readJSON } from "./utilsForTests.js";

await loadPaperMemoryUtils();
// create fake `document`, parseUrl() will need it for instance
global.document = new JSDOM(`<!DOCTYPE html>`).window.document;
// initState() (which loads the Cell journal data) does not run in unit tests,
// so populate it directly from the same source the extension fetches at runtime.
PMUtils.config.state.cellJournalData = readJSON("./public/data/cell.json");

describe("Bibtex parser", function () {
    var bdata = readJSON("./test/data/bibtexs.json");

    it("Test data is balanced", function () {
        expect(bdata.strings.length).toEqual(bdata.objects.length);
    });

    describe("#bibtexToObject", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(PMUtils.bibtexParser.bibtexToObject(bdata.strings[i])).toEqual(
                    bdata.objects[i],
                );
            });
        }
    });

    describe("#bibtexToString(object)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(PMUtils.bibtexParser.bibtexToString(bdata.objects[i])).toEqual(
                    bdata.strings[i],
                );
            });
        }
    });
    describe("#bibtexToString(string)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(
                    PMUtils.bibtexParser.bibtexToString(
                        PMUtils.bibtexParser.bibtexToString(bdata.objects[i]),
                    ),
                ).toEqual(bdata.strings[i]);
            });
        }
    });

    describe("String -> Object -> String", function () {
        for (const [b, bstring] of bdata["strings"].entries()) {
            const bobj = PMUtils.bibtexParser.bibtexToObject(bstring);
            it(`String ${b}`, function () {
                expect(PMUtils.bibtexParser.bibtexToString(bobj)).toEqual(bstring);
            });
        }
    });

    describe("Object -> String -> Object", function () {
        for (const [b, bobj] of bdata.objects.entries()) {
            const bstring = PMUtils.bibtexParser.bibtexToString(bobj);
            it(`Object ${b}`, function () {
                expect(PMUtils.bibtexParser.bibtexToObject(bstring)).toEqual(bobj);
            });
        }
    });

    describe("#extractBibtexValue", function () {
        for (const i of range(bdata.strings.length)) {
            const bobj = bdata.objects[i];
            const bstring = bdata.strings[i];
            describe(`String ${i}`, function () {
                for (const attribute in bobj) {
                    it(`Attribute ${attribute}`, function () {
                        expect(
                            PMUtils.bibtexParser.extractBibtexValue(bstring, attribute),
                        ).toEqual(bobj[attribute]);
                    });
                }
            });
        }
    });
});

describe("paper.js", () => {
    var allUrls = readJSON("./test/data/urls.json");

    describe("#paperToAbs", () => {
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, async function () {
                let paper = {
                    source,
                    pdfLink: urls[1],
                };
                let target = urls[0];
                if (source === "arxiv") {
                    paper.id = "Arxiv-1703.10593";
                }
                if (source === "springer") {
                    paper.extra = {
                        url: urls[0],
                    };
                }
                if (source === "ieee") {
                    paper.key = "9090146";
                }
                if (source === "ihep") {
                    paper.id = "IHEP-2095720";
                }
                if (source === "aip") {
                    paper.doi = "10.1063/5.0134317";
                    target = `https://doi.org/${paper.doi}`;
                }
                if (source === "oup") {
                    paper.doi = "10.1093/brain/awae043";
                    target = `https://doi.org/${paper.doi}`;
                }
                if (source === "cell") {
                    this.skip();
                }
                expect(PMUtils.paper.paperToAbs(paper)).toEqual(target);
            });
        }
    });
    describe("#paperToPDF", () => {
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, () => {
                const paper = {
                    source,
                    pdfLink: urls[1],
                };
                expect(PMUtils.paper.paperToPDF(paper)).toEqual(urls[1]);
            });
        }
    });

    describe("#isPaper", () => {
        const names = ["from abstract", "from pdf"];
        for (const [source, urls] of Object.entries(allUrls)) {
            for (const [i, url] of urls.slice(0, 2).entries()) {
                it(`${source} - ${names[i]}`, async function () {
                    if (i > 0 && urls[2]?.noPdf) {
                        this.skip();
                    }
                    const isp = await PMUtils.paper.isPaper(url);
                    if (source === "cell") {
                        expect(isp[source]).toHaveLength(1);
                        return;
                    }
                    let target = Object.fromEntries(
                        Object.keys(isp).map((k) => [k, false]),
                    );
                    target.stored = false;
                    target[source] = true;
                    expect(isp).toEqual(target);
                });
            }
        }
        for (const [u, url] of ["arxiv.org", "https://google.com"].entries()) {
            it(`Negative ${u} (${url})`, async () => {
                const isp = await PMUtils.paper.isPaper(url);
                let target = Object.fromEntries(
                    Object.keys(isp).map((k) => [k, false]),
                );
                target.stored = false;
                expect(isp).toEqual(target);
            });
        }
    });

    describe("#sciencedirect signed PDF redirect", () => {
        // Sanitised stand-in for the pdf.sciencedirectassets.com redirect: the
        // real one carries an AWS X-Amz-Security-Token and expires in minutes, so
        // we only keep the PII-bearing parts and drop every credential param.
        const signedUrl =
            "https://pdf.sciencedirectassets.com/271664/1-s2.0-S0001457526X20048/1-s2.0-S0001457526002083/main.pdf?pii=S0001457526002083&type=client";

        it("is recognised as a sciencedirect page", async () => {
            const isp = await PMUtils.paper.isPaper(signedUrl);
            expect(isp.sciencedirect).toBe(true);
        });

        it("resolves to the abstract page from its PII", () => {
            const paper = { source: "sciencedirect", pdfLink: signedUrl };
            expect(PMUtils.paper.paperToAbs(paper)).toEqual(
                "https://www.sciencedirect.com/science/article/pii/S0001457526002083",
            );
        });
    });
});

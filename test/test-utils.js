import { expect } from "expect";
import { JSDOM } from "jsdom";
import { getSource } from "@pmu/sources/index.js";

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
                    let target = Object.fromEntries(
                        Object.keys(isp).map((k) => [k, false]),
                    );
                    target.stored = false;
                    target[source] = true;
                    expect(isp).toEqual(target);
                });
            }
        }
        for (const [u, url] of [
            "arxiv.org",
            "https://google.com",
            "https://notarxiv.org/abs/1703.10593",
        ].entries()) {
            it(`Negative ${u} (${url})`, async () => {
                const isp = await PMUtils.paper.isPaper(url);
                let target = Object.fromEntries(
                    Object.keys(isp).map((k) => [k, false]),
                );
                target.stored = false;
                expect(isp).toEqual(target);
            });
        }
        // Another site's URL that only contains a paper URL (in its query,
        // fragment or path, or as a host prefix) is not that paper's page.
        for (const [source, urls] of Object.entries(allUrls)) {
            it(`Negative cross-host ${source}`, async () => {
                const offenders = [];
                for (const url of urls.slice(0, 2)) {
                    const { hostname } = new URL(url);
                    const bare = url.replace(/^https?:\/\//, "");
                    for (const crafted of [
                        `https://evil.example/?x=${bare}`,
                        `https://evil.example/#${url}`,
                        `https://evil.example/${bare}`,
                        url.replace(hostname, `${hostname}.evil.example`),
                    ]) {
                        const isp = await PMUtils.paper.isPaper(crafted);
                        const detected = Object.keys(isp).filter((k) => isp[k]);
                        if (detected.length) offenders.push({ crafted, detected });
                    }
                }
                expect(offenders).toEqual([]);
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

        it("is not recognised inside another site's URL", async () => {
            const isp = await PMUtils.paper.isPaper(
                `https://evil.example/?x=${signedUrl.replace("https://", "")}`,
            );
            expect(isp.sciencedirect).toBe(false);
        });

        it("resolves to the abstract page from its PII", () => {
            const paper = { source: "sciencedirect", pdfLink: signedUrl };
            expect(PMUtils.paper.paperToAbs(paper)).toEqual(
                "https://www.sciencedirect.com/science/article/pii/S0001457526002083",
            );
        });
    });

    describe("#oup urlToId", () => {
        it("gives an http:// URL the same id as its https:// URL", async () => {
            // id of the paper stored from the urls.json abstract URL (path numbers)
            const id = "OUP-2024_14737437617466";
            const ctx = {
                papers: [{ source: "oup", id }],
                findPaperForProperty: PMUtils.urls.findPaperForProperty,
            };
            const url = allUrls.oup[0];
            const oup = getSource("oup");
            expect(await oup.urlToId(url, ctx)).toEqual(id);
            expect(await oup.urlToId(url.replace("https://", "http://"), ctx)).toEqual(
                id,
            );
        });
    });

    describe("#addOrUpdatePaper", () => {
        // ACS Silverchair article url: AcsSource.urlToId reads no DOI from it
        const url = "https://pubs.acs.org/jpca/article/123/12/2345/123456/Some-Title";
        const id = "ACS_101021acsjpca9b00311";
        const acs = getSource("acs");
        const parse = acs.parse;
        // in-memory chrome.storage.local
        const storage = {};

        before(() => {
            global.chrome = {
                storage: {
                    local: {
                        get: (key, cb) => cb({ [key]: structuredClone(storage[key]) }),
                        set: (items, cb) => {
                            Object.assign(storage, structuredClone(items));
                            cb && cb();
                        },
                    },
                },
                runtime: { sendMessage: (payload, cb) => cb() },
            };
            // parse without network
            acs.parse = async () => ({
                author: "Jane Doe",
                bibtex: "@article{doe2019,\n  title = {CO2 reduction},\n  year = {2019}\n}",
                id,
                key: "doe2019",
                note: "Published @ The Journal of Physical Chemistry A (2019)",
                pdfLink: "https://pubs.acs.org/doi/pdf/10.1021/acs.jpca.9b00311",
                title: "CO2 reduction",
                venue: "The Journal of Physical Chemistry A",
                year: "2019",
            });
        });

        after(() => {
            acs.parse = parse;
            delete global.chrome;
        });

        it("first capture from a url urlToId cannot resolve maps it to the stored id", async () => {
            const state = PMUtils.config.state;
            // another page mapped a url after this one read the map
            state.urlHashToId = {};
            storage.urlHashToId = { otherpageurl: "Other-id" };
            expect(await PMUtils.urls.parseIdFromUrl(url)).toBeFalsy();

            const is = await PMUtils.paper.isPaper(url, true);
            await new Promise((done) =>
                PMUtils.paper.addOrUpdatePaper({
                    url,
                    is,
                    contentScriptCallbacks: {
                        update: () => {},
                        preprints: () => {},
                        done,
                    },
                }),
            );
            expect(storage.papers[id]).toBeDefined();

            // resolve the url from the stored map, as another page would
            state.urlHashToId = await PMUtils.data.getStorage("urlHashToId");
            expect(await PMUtils.urls.parseIdFromUrl(url)).toEqual(id);
            expect(state.urlHashToId.otherpageurl).toEqual("Other-id");
        });
    });
});

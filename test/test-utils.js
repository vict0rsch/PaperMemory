const { expect } = require("expect");
const { JSDOM } = require("jsdom");

const { loadPaperMemoryUtils, range, readJSON } = require("./utilsForTests");

loadPaperMemoryUtils();
// create fake `document`, parseUrl() will need it for instance
global.document = new JSDOM(`<!DOCTYPE html>`).window.document;

describe("Bibtex parser", function () {
    var bdata = readJSON("./data/bibtexs.json");

    it("Test data is balanced", function () {
        expect(bdata.strings.length).toEqual(bdata.objects.length);
    });

    describe("#bibtexToObject", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bibtexToObject(bdata.strings[i])).toEqual(bdata.objects[i]);
            });
        }
    });

    describe("#bibtexToString(object)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bibtexToString(bdata.objects[i])).toEqual(bdata.strings[i]);
            });
        }
    });
    describe("#bibtexToString(string)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bibtexToString(bibtexToString(bdata.objects[i]))).toEqual(
                    bdata.strings[i]
                );
            });
        }
    });

    describe("String -> Object -> String", function () {
        for (const [b, bstring] of bdata["strings"].entries()) {
            const bobj = bibtexToObject(bstring);
            it(`String ${b}`, function () {
                expect(bibtexToString(bobj)).toEqual(bstring);
            });
        }
    });

    describe("Object -> String -> Object", function () {
        for (const [b, bobj] of bdata.objects.entries()) {
            const bstring = bibtexToString(bobj);
            it(`Object ${b}`, function () {
                expect(bibtexToObject(bstring)).toEqual(bobj);
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
                        expect(extractBibtexValue(bstring, attribute)).toEqual(
                            bobj[attribute]
                        );
                    });
                }
            });
        }
    });
});

describe("paper.js", () => {
    var allUrls = readJSON("./data/urls.json");

    describe("#paperToAbs", () => {
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, () => {
                let paper = {
                    source,
                    pdfLink: urls[1],
                };
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
                expect(paperToAbs(paper)).toEqual(urls[0]);
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
                expect(paperToPDF(paper)).toEqual(urls[1]);
            });
        }
    });

    describe("#isPaper", () => {
        const names = ["from abstract", "from pdf"];
        for (const [source, urls] of Object.entries(allUrls)) {
            for (const [i, url] of urls.slice(0, 2).entries()) {
                it(`${source} - ${names[i]}`, async () => {
                    const isp = await isPaper(url);
                    let target = Object.fromEntries(
                        Object.keys(isp).map((k) => [k, false])
                    );
                    target.stored = null;
                    target[source] = true;
                    expect(isp).toEqual(target);
                });
            }
        }
        for (const [u, url] of ["arxiv.org", "https://google.com"].entries()) {
            it(`Negative ${u} (${url})`, async () => {
                const isp = await isPaper(url);
                let target = Object.fromEntries(
                    Object.keys(isp).map((k) => [k, false])
                );
                target.stored = null;
                expect(isp).toEqual(target);
            });
        }
    });
});

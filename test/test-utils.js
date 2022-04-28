const { expect } = require("expect");
const fs = require("fs");

const { cleanBiorxivURL } = require("../src/shared/js/utils/functions");
const bp = require("../src/shared/js/utils/bibtexParser");
const pjs = require("../src/shared/js/utils/paper");

Object.defineProperty(Array.prototype, "last", {
    value: function (i = 0) {
        return this.reverse()[i];
    },
});

Object.defineProperty(String.prototype, "capitalize", {
    value: function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    },
});

const range = (n) => [...Array(n).keys()];

describe("Bibtex parser", function () {
    var bdata = JSON.parse(fs.readFileSync("./data/bibtexs.json"));

    it("Test data is balanced", function () {
        expect(bdata.strings.length).toEqual(bdata.objects.length);
    });

    describe("#bibtexToObject", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bp.bibtexToObject(bdata.strings[i])).toEqual(bdata.objects[i]);
            });
        }
    });

    describe("#bibtexToString(object)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bp.bibtexToString(bdata.objects[i])).toEqual(bdata.strings[i]);
            });
        }
    });
    describe("#bibtexToString(string)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(bp.bibtexToString(bp.bibtexToString(bdata.objects[i]))).toEqual(
                    bdata.strings[i]
                );
            });
        }
    });

    describe("String -> Object -> String", function () {
        for (const [b, bstring] of bdata["strings"].entries()) {
            const bobj = bp.bibtexToObject(bstring);
            it(`String ${b}`, function () {
                expect(bp.bibtexToString(bobj)).toEqual(bstring);
            });
        }
    });

    describe("Object -> String -> Object", function () {
        for (const [b, bobj] of bdata.objects.entries()) {
            const bstring = bp.bibtexToString(bobj);
            it(`Object ${b}`, function () {
                expect(bp.bibtexToObject(bstring)).toEqual(bobj);
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
                        expect(bp.extractBibtexValue(bstring, attribute)).toEqual(
                            bobj[attribute]
                        );
                    });
                }
            });
        }
    });
});

describe("paper.js", () => {
    var allUrls = JSON.parse(fs.readFileSync("./data/urls.json"));

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
                expect(pjs.paperToAbs(paper)).toEqual(urls[0]);
            });
        }
    });
    describe("#paperToPDF", () => {
        global.cleanBiorxivURL = cleanBiorxivURL;
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, () => {
                const paper = {
                    source,
                    pdfLink: urls[1],
                };
                expect(pjs.paperToPDF(paper)).toEqual(urls[1]);
            });
        }
    });
});

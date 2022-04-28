const { expect } = require("expect");
const fs = require("fs");
const glob = require("glob");
const utilsFiles = glob.sync("../src/shared/js/utils/*.js");
const utilsModules = utilsFiles.map((file) => require(file));

for (const module of utilsModules) {
    for (const [name, func] of Object.entries(module)) {
        global[name] = func;
    }
}

const range = (n) => [...Array(n).keys()];

describe("Bibtex parser", function () {
    var bdata = JSON.parse(fs.readFileSync("./data/bibtexs.json"));

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

            });
        }
    });
});

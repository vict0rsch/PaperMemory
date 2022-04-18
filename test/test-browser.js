const expect = require("expect");
const fs = require("fs");
const { isRegExp } = require("util/types");

const { makeBrowser, getMemoryData, extensionURL } = require("./browser");
const { allIds, allValues } = require("./processMemory");

describe("Tests v1", function () {
    it("v1.a", function () {
        console.log("v1.a");
    });
    it("v1.b", function () {
        console.log("v1.a");
    });
});

describe("Test paper detection and storage", function () {
    var browser, page, memoryData, dataVersion, urls;

    before(async function () {
        browser = await makeBrowser();
        page = await browser.newPage();
    });

    describe("Batch visits", function () {
        // it("Adds all sources to the Memory", async () => {});
        // don't use arrow functions they don't have `this`

        urls = JSON.parse(fs.readFileSync("./data/urls.json"));
        const pageTimeout = 400000;
        const timeout = (Object.keys(urls).length + 1) * 4 * pageTimeout;
        console.log("timeout: ", timeout);
        this.timeout(timeout);
        this.slow(timeout);

        before(async function () {
            let s = 0;
            for (const source in { ...urls }) {
                if (s > 2) {
                    delete urls[source]; // dev: testing page loop but stopping here for now
                } else {
                    const targets = urls[source].filter((u) => typeof u === "string");
                    for (const target of targets) {
                        console.log("Going to: ", target);
                        await page.goto(target);
                        await page.waitForTimeout(pageTimeout);
                    }
                }
                s += 1;
            }

            await page.goto(extensionURL);
            await page.waitForTimeout(pageTimeout);

            memoryData = await getMemoryData(page);
            console.log("memoryData: ", memoryData);
            dataVersion = memoryData["__dataVersion"];
            delete memoryData["__dataVersion"];
            // const pdfs = allValues(memoryData, "pdfLink");
            // const sources = allValues(memoryData, "source");

            // const targetSources = Object.keys(urls);
            // const targetPdfs = Object.values(urls).flat();
        });

        it("Adds all sources uniquely to the Memory", async function () {
            const ids = allIds(memoryData);
            expect(ids.length).toBe(Object.keys(urls).length);
        });

        //     it("Pdf and Abstract are matched to the same Memory item", async function () {
        //         const counts = allValues(memoryData, "count");
        //         expect(counts.every((m) => m === 2)).toBe(true);
        //     });

        //     it("No undefined keys", async function () {
        //         expect(
        //             Object.values(memoryData).every((item) =>
        //                 Object.values(item).every(
        //                     (v) => typeof v !== "undefined" && v !== "undefined"
        //                 )
        //             )
        //         ).toBe(true);
        //     });
        // });

        // describe("Per source specifics", function () {
        //     beforeEach(async function () {
        //         await page.evaluate(async () => {
        //             await setStorage("papers", {});
        //         });
        //     });

        //     for (const source in urls) {
        //         context(source.toLocaleUpperCase(), function () {
        //             it("Exactly 1 paper per source", function () {
        //                 let paper = Object.values(memoryData).filter(
        //                     (p) => p.source === "arxiv"
        //                 );
        //                 expect(paper.length).toBe(1);
        //             });
        //             if (urls[source].length === 3) {
        //                 const additionalTest = urls[source][2];
        //                 let paper = Object.values(memoryData).filter(
        //                     (p) => p.source === "arxiv"
        //                 )[0];
        //                 if (additionalTest["code"]) {
        //                     it("Check it has a codeLink", function () {
        //                         expect(typeof paper.codeLink === "string").toBe(
        //                             true,
        //                             `${source}: code link should not be ${typeof paper.codeLink}${
        //                                 paper.codeLink
        //                             }`
        //                         );
        //                     });
        //                 }
        //                 it("Check venue is a string", function () {
        //                     expect(typeof paper.venue).toMatch("string");
        //                 });
        //                 it("Check venue value", function () {
        //                     if (additionalTest["venue"]) {
        //                         expect(
        //                             paper.venue.toLowerCase().replace(/\s/gi, "")
        //                         ).toMatch(
        //                             additionalTest["venue"]
        //                                 .toLowerCase()
        //                                 .replace(/\s/gi, "")
        //                         );
        //                     } else {
        //                         expect(
        //                             paper.venue.toLowerCase().replace(/\s/gi, "")
        //                         ).toMatch(source.toLowerCase().replace(/\s/gi, ""));
        //                     }
        //                 });
        //             }
        //         });
        //     }

        // context("Arxiv",function () {
        //     it("Arxiv test1", function () {
        //         paper = paper[0];
        //     });
        //     it("Arxiv test2");
        // });

        // context("NeurIPS",function () {
        //     it("NeurIPS test1");
        //     it("NeurIPS test2");
        // });
        // context("PMLR",function () {
        //     it("PMLR test1");
        //     it("PMLR test2");
        // });
        // context("BioRxiv",function () {
        //     it("BioRxiv test1");
        //     it("BioRxiv test2");
        // });
    });

    after(async () => {
        await browser.close();
    });
});

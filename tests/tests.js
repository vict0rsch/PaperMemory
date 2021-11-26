const expect = require("expect");
const fs = require("fs");

const { makeBrowser, getMemoryData, extensionURL } = require("./browser");
const { allIds, allValues } = require("./processMemory");

describe("Test paper detection and storage", function () {
    var browser, page, memoryData, dataVersion, urls;

    before(async () => {
        browser = await makeBrowser();
        page = await browser.newPage();
    });

    describe("Batch visits", function () {
        // // it("Adds all sources to the Memory", async () => {});
        // // don't use arrow functions they don't have `this`

        urls = JSON.parse(fs.readFileSync("./data/urls.json"));
        const pageTimeout = 800;
        const timeout = (Object.keys(urls).length + 1) * 4 * pageTimeout;
        this.timeout(timeout);
        this.slow(timeout);

        before(async function () {
            let s = 0;
            for (const source in { ...urls }) {
                if (s > 2) {
                    delete urls[source]; // dev: testing page loop but stopping here for now
                } else {
                    const targets = urls[source];
                    for (const target of targets) {
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

        it("Pdf and Abstract are matched to the same Memory item", async function () {
            const counts = allValues(memoryData, "count");
            expect(counts.every((m) => m === 2)).toBe(true);
        });

        it("No undefined keys", async function () {
            expect(
                Object.values(memoryData).every((item) =>
                    Object.values(item).every(
                        (v) => typeof v !== "undefined" && v !== "undefined"
                    )
                )
            ).toBe(true);
        });
    });

    describe("Per source specifics", function () {
        beforeEach(async function () {
            await page.evaluate(async () => {
                await setStorage("papers", {});
            });
        });

        context("Arxiv", () => {
            it("Arxiv test1");
            it("Arxiv test2");
        });

        context("NeurIPS", () => {
            it("NeurIPS test1");
            it("NeurIPS test2");
        });
        context("PMLR", () => {
            it("PMLR test1");
            it("PMLR test2");
        });
        context("BioRxiv", () => {
            it("BioRxiv test1");
            it("BioRxiv test2");
        });
    });

    after(async () => {
        await browser.close();
    });
});

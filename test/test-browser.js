// ❯ env MAX_SOURCES=2 PAGE_TIMEOUT_S=8 npm run test

const expect = require("expect");
const fs = require("fs");
const { isRegExp } = require("util/types");

const { makeBrowser, getMemoryData, extensionURL } = require("./browser");
const { allIds, allValues } = require("./processMemory");

const paperForSource = (source, memoryData) => {
    return Object.values(memoryData).filter((p) => p.source === source)[0];
};

const maxSources = process.env.MAX_SOURCES ?? 1e10;
const pageTimeout = process.env.PAGE_TIMEOUT_S * 1000 ?? 6 * 1000;

console.log("Test params:");
console.log("    pageTimeout: ", pageTimeout);
console.log("    maxSources:  ", maxSources);
console.log("--------------------------");

describe("Test paper detection and storage", function () {
    var browser, page, memoryData, dataVersion, urls;

    before(async function () {
        this.timeout(4 * 1000);
        browser = await makeBrowser();
    });

    describe("Batch visits", function () {
        // it("Adds all sources to the Memory", async () => {});
        // don't use arrow functions they don't have `this`

        urls = JSON.parse(fs.readFileSync("./data/urls.json"));
        const timeout = (Object.keys(urls).length + 1) * 4 * pageTimeout;
        this.timeout(timeout);
        this.slow(timeout);

        before(async function () {
            const total = Math.min(maxSources, Object.keys(urls).length);
            for (const [idx, [source, targets]] of Object.entries(urls).entries()) {
                if (idx >= maxSources) {
                    delete urls[source]; // dev: testing page loop but stopping here for now
                } else {
                    for (const [t, target] of targets
                        .filter((u) => typeof u === "string")
                        .entries()) {
                        const prefix = `${" ".repeat(8)}(${idx * 2 + t}/${total})`;
                        console.log(`${prefix}Going to: ${target}`);
                        const p = await browser.newPage();
                        await p.goto(target, { waitUntil: "load" });
                        await p.waitForTimeout(500);
                    }
                }
            }

            await new Promise((resolve) => setTimeout(resolve, pageTimeout));

            const page = await browser.newPage();
            await page.goto(extensionURL);
            await page.waitForTimeout(1000);
            memoryData = await getMemoryData(page);
            fs.writeFileSync(
                `./tmp/memory-${new Date()}.json`,
                JSON.stringify(memoryData, null, 2)
            );
            dataVersion = memoryData["__dataVersion"];
            delete memoryData["__dataVersion"];
            // const pdfs = allValues(memoryData, "pdfLink");
            // const sources = allValues(memoryData, "source");

            // const targetSources = Object.keys(urls);
            // const targetPdfs = Object.values(urls).flat();
        });

        describe("Global memory inspection", function () {
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
            Object.keys(urls)
                .slice(0, maxSources)
                .map((source) => {
                    describe(source.toLocaleUpperCase(), function () {
                        it("1 paper per source", function () {
                            const papers = Object.values(memoryData).filter(
                                (p) => p.source === source
                            );
                            expect(papers.length).toBe(1);
                        });

                        if (urls[source].length === 3) {
                            const additionalTest = urls[source][2];
                            if (additionalTest["code"]) {
                                it("#codeLink", function () {
                                    const paper = paperForSource(source, memoryData);
                                    expect(typeof paper.codeLink === "string").toBe(
                                        true,
                                        `${source}: code link should not be ${typeof paper.codeLink}${
                                            paper.codeLink
                                        }`
                                    );
                                });
                            }
                            it("#venue is a string", function () {
                                const paper = paperForSource(source, memoryData);
                                expect(typeof paper.venue).toMatch("string");
                            });
                            it("#venue value", function () {
                                const paper = paperForSource(source, memoryData);
                                if (additionalTest["venue"]) {
                                    expect(
                                        paper.venue.toLowerCase().replace(/\s/gi, "")
                                    ).toMatch(
                                        additionalTest["venue"]
                                            .toLowerCase()
                                            .replace(/\s/gi, "")
                                    );
                                } else {
                                    expect(
                                        paper.venue.toLowerCase().replace(/\s/gi, "")
                                    ).toMatch(source.toLowerCase().replace(/\s/gi, ""));
                                }
                            });
                        }
                    });
                });
        });
    });

    after(async () => {
        await browser.close();
    });
});

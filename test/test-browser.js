// ❯ env MAX_SOURCES=2 PAGE_TIMEOUT_S=8 npm run test

const expect = require("expect");
const fs = require("fs");
const { isRegExp } = require("util/types");

const { makeBrowser, getMemoryData, extensionPopupURL } = require("./browser");
const { allIds, allAttributes } = require("./processMemory");

const paperForSource = (source, memoryData) => {
    return Object.values(memoryData).filter((p) => p.source === source)[0];
};

const sleep = async (duration) => {
    await new Promise((resolve) => setTimeout(resolve, duration));
};

// global constants to parametrize the tests
const maxSources = process.env.MAX_SOURCES ?? -1;
const pageTimeout = process.env.PAGE_TIMEOUT ?? 500;

console.log("Test params:");
console.log("    pageTimeout: ", pageTimeout);
console.log("    maxSources:  ", maxSources);
console.log("--------------------------");

// --------------------------------
// -----  Main test function  -----
// --------------------------------

describe("Test paper detection and storage", function () {
    // "global" variables for this test
    var browser, memoryData, dataVersion;

    // load tests configurations
    var urls = JSON.parse(fs.readFileSync("./data/urls.json"));
    if (maxSources > 0) {
        urls = Object.fromEntries(Object.entries(urls).slice(0, maxSources));
    }
    var sources = Object.keys(urls);

    const timeout = (sources.length + 1) * 20 * pageTimeout;
    this.timeout(timeout);
    this.slow(timeout);

    // --------------------------
    // -----  Prepare Data  -----
    // --------------------------

    before(async function () {
        // create browser
        browser = await makeBrowser();

        // count total urls to visit depending on maxSources
        const nUrls = sources.length;

        // visit all relevant urls
        for (const [idx, [source, targets]] of Object.entries(urls).entries()) {
            // for each target url (abstract, pdf), visit the url
            // and wait a little for it to load

            // filter out the additional test configs
            const targetUrls = targets.filter((u) => typeof u === "string");
            for (const [t, target] of targetUrls.entries()) {
                // log prefix
                const prefix = `${" ".repeat(4)}(${idx * 2 + t + 1}/${nUrls * 2})`;
                console.log(`${prefix} Going to: ${target}`);

                // create page
                const p = await browser.newPage();
                // asynchronously go to url
                p.goto(target);
                // wait for 1s to give this page a heads up
                // (if 2 pages for the same source are loaded too fast, one of them
                // will overwrite the other instead of taking it into account)
                await sleep(1000);
            }
        }

        const sleepSecs = 10 + (nUrls * pageTimeout) / 1000;
        console.log(" ".repeat(4) + `Waiting for pages to load (${sleepSecs}s)`);
        // wait for all pages to load
        await sleep(sleepSecs * 1000);

        // go to the extension's popup url
        const page = await browser.newPage();
        await page.goto(extensionPopupURL);
        await page.waitForTimeout(1000);

        // retrieve the data parsed by PaperMemory
        memoryData = await getMemoryData(page);

        // dump this data for human analysis
        const fname = `./tmp/memory-${new Date()}.json`;
        fs.writeFileSync(fname, JSON.stringify(memoryData, null, 2));

        // remove data version key
        dataVersion = memoryData["__dataVersion"];
        delete memoryData["__dataVersion"];
    });

    // --------------------------------------
    // -----  Global memory inspection  -----
    // --------------------------------------

    describe("Global memory inspection", function () {
        it("Adds all sources (uniquely) to the Memory", async function () {
            const memorySources = allAttributes(memoryData, "source").sort();
            const refSources = sources.sort();
            expect(memorySources).toEqual(refSources);
        });

        it("Pdf and Abstract are matched to the same Memory item", async function () {
            const memoryCounts = allAttributes(memoryData, "count");
            const memorySources = allAttributes(memoryData, "source");
            const memoryCountsBySource = Object.fromEntries(
                [...Array(sources.length).keys()].map((i) => [
                    memorySources[i],
                    memoryCounts[i],
                ])
            );
            const refCountsBySource = Object.fromEntries(sources.map((s) => [s, 2]));
            expect(memoryCountsBySource).toEqual(refCountsBySource);
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

    // ------------------------------
    // -----  Per source tests  -----
    // ------------------------------

    describe("Per source specifics", function () {
        // execute shared tests for all sources
        sources.map((source) => {
            describe(source.toLocaleUpperCase(), function () {
                it("1 paper per source", function () {
                    const papers = Object.values(memoryData).filter(
                        (p) => p.source === source
                    );
                    expect(papers.length).toBe(1);
                });

                // more tests parameterized in the 3rd item in the list for this source
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

                    it("#venue matches source", function () {
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
                            // the venue is the same as the source
                            expect(
                                paper.venue.toLowerCase().replace(/\s/gi, "")
                            ).toMatch(source.toLowerCase().replace(/\s/gi, ""));
                        }
                    });
                }
            });
        });
    });

    after(async () => {
        await browser.close();
    });
});

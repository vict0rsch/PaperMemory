// ❯ env MAX_SOURCES=2 PAGE_TIMEOUT_S=8 npm run test

// ---------------------
// -----  Imports  -----
// ---------------------

const { expect } = require("expect");
const fs = require("fs");
const {
    makeBrowser,
    getMemoryPapers,
    extensionPopupURL,
    visitPaperPage,
} = require("./browser");

const { readJSON } = require("./utilsForTests");

const { allAttributes } = require("./processMemory");

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

// run tests for a maximum number of distinct sources
const maxSources = process.env.maxSources ?? -1;
// float to go to next paper page if the previous does not respond (-1: wait)
const pageTimeout = parseFloat(process.env.pageTimeout ?? -1);
// only run tests for a specific paper source (as per ./data/urls.json)
const singleSource = process.env.singleSource?.toLowerCase() ?? false;
// keep pages and browser open at the end of tests to inspect
const keepOpen = !!(process.env.keepOpen ?? false);
// write the memory to ./tmp as a JSON file
const dump = !!(process.env.dump ?? false);
// only run tests for a specific abstract<->pdf order
const singleOrder = process.env.singleOrder ?? false;
// ignore sources to parse papers from (','-separated sources as per ./data/urls.json)
let ignoreSources = process.env.ignoreSources ?? [];

// check env vars
var orders = ["abs;pdf", "pdf;abs"];

if (maxSources > 0 && singleSource) {
    throw new Error("Please specify either maxSources xor singleSource");
}

if (singleOrder && orders.indexOf(singleOrder) === -1) {
    throw new Error(
        `Unknown order: ${singleOrder}. Valid orders: ${orders.join(" and ")}`
    );
}

if (typeof ignoreSources === "string") {
    ignoreSources = ignoreSources.split(",").map((source) => source.trim());
}

console.log("Test params:");
console.log("    pageTimeout   : ", pageTimeout);
console.log("    maxSources    : ", maxSources);
console.log("    singleSource  : ", singleSource);
console.log("    keepOpen      : ", keepOpen);
console.log("    dump          : ", dump);
console.log("    singleOrder   : ", singleOrder);
console.log("    ignoreSources : ", ignoreSources);
console.log("--------------------------");

// util to find a paper in the Memory from a specific source
const paperForSource = (source, memoryPapers) => {
    return Object.values(memoryPapers).find((p) => p.source === source);
};

const ignoreSingleOrder = (s, urls, order) =>
    urls[s][2] && urls[s][2].singleOrder && urls[s][2].singleOrder !== order;

// --------------------------------
// -----  Main test function  -----
// --------------------------------

describe("Test paper detection and storage", function () {
    // "global" variables for this test
    var browser, memoryPapers, dataVersion;

    // load tests configurations
    var urls = readJSON("./data/urls.json");
    if (maxSources > 0) {
        urls = Object.fromEntries(Object.entries(urls).slice(0, maxSources));
    } else if (singleSource) {
        urls = { [singleSource]: urls[singleSource] };
    }

    if (ignoreSources && ignoreSources.length > 0) {
        urls = Object.fromEntries(
            Object.entries(urls).filter(
                ([source, v]) => ignoreSources.indexOf(source) < 0
            )
        );
    }

    for (const source in urls) {
        const targets = urls[source];
        if (targets.length === 3 && targets[2].botPrevention) {
            console.log(
                `\n>>> Skipping test for ${source} because its website ` +
                    `prevents automated browsing`
            );
            delete urls[source];
        } else if (targets.length === 3 && targets[2].noPdf) {
            console.log(
                `\n>>> Skipping test for ${source} because its ` +
                    `pdf page does not exist`
            );
            delete urls[source];
        }
    }

    var sources = Object.keys(urls);

    if (singleOrder) {
        orders = [singleOrder];
    }

    const timeout = (sources.length + 1) * 20 * 5000;
    this.timeout(timeout * orders.length);
    this.slow(timeout * orders.length);

    // --------------------------
    // -----  Prepare Data  -----
    // --------------------------

    for (const [o, order] of orders.entries()) {
        describe("Parsing order: " + order, function () {
            before(async function () {
                // create browser
                browser = await makeBrowser();

                // count total urls to visit depending on maxSources
                const nUrls = sources.length;

                // visit all relevant urls
                // all abstracts then all pdfs

                const indices = order === "abs;pdf" ? [0, 1] : [1, 0];

                for (const t of indices) {
                    for (const [idx, targets] of Object.values(urls).entries()) {
                        // for each target url (abstract, pdf), visit the url
                        // and wait a little for it to load

                        // filter out the additional test configs
                        const targetUrls = targets.filter((u) => typeof u === "string");
                        if (t >= targetUrls.length) {
                            continue;
                        }
                        if (targets.length > 2) {
                            if (
                                targets[2].singleOrder &&
                                targets[2].singleOrder !== order
                            ) {
                                continue;
                            }
                        }
                        const target = targetUrls[t];
                        // log prefix
                        const n = idx + (o > 0 ? 1 - t : t) * nUrls + 1;
                        const prefix = `${" ".repeat(6)}(${n}/${nUrls * 2})`;
                        console.log(`${prefix} Going to: ${target}`);

                        await visitPaperPage(browser, target, {
                            timeout: pageTimeout,
                            keepOpen,
                        });
                    }
                }

                // go to the extension's popup url
                const page = await browser.newPage();
                await page.goto(extensionPopupURL);
                await page.waitForTimeout(1e3);

                // retrieve the data parsed by PaperMemory
                memoryPapers = await getMemoryPapers(page);

                if (dump) {
                    // dump this data for human analysis
                    const fname = `./tmp/memory-${new Date()}.json`;
                    fs.writeFileSync(fname, JSON.stringify(memoryPapers, null, 2));
                }

                // remove data version key
                dataVersion = memoryPapers["__dataVersion"];
                delete memoryPapers["__dataVersion"];
            });

            // --------------------------------------
            // -----  Global memory inspection  -----
            // --------------------------------------

            describe("Global memory inspection", function () {
                it("All sources are detected", async function () {
                    const memorySources = allAttributes(memoryPapers, "source").sort();
                    const refSources = sources
                        .filter((s) => !ignoreSingleOrder(s, urls, order))
                        .sort();
                    expect(memorySources).toEqual(refSources);
                });

                it("Pdf and Abstract are matched to the same Memory item", async function () {
                    const filteredSources = sources.filter(
                        (s) => !ignoreSingleOrder(s, urls, order)
                    );
                    const memoryCounts = allAttributes(memoryPapers, "count");
                    const memorySources = allAttributes(memoryPapers, "source");
                    const memoryCountsBySource = Object.fromEntries(
                        [...Array(filteredSources.length).keys()].map((i) => [
                            memorySources[i],
                            memoryCounts[i],
                        ])
                    );
                    const refCountsBySource = Object.fromEntries(
                        filteredSources.map((s) => [s, 2])
                    );
                    expect(memoryCountsBySource).toEqual(refCountsBySource);
                });

                it("No undefined keys", async function () {
                    expect(
                        Object.values(memoryPapers).every((item) =>
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
                const filteredSources = sources.filter(
                    (s) => !ignoreSingleOrder(s, urls, order)
                );
                filteredSources.map((source) => {
                    describe(source.toLocaleUpperCase(), function () {
                        it("1 paper for source", function () {
                            const papers = Object.values(memoryPapers).filter(
                                (p) => p.source === source
                            );
                            expect(papers.length).toBe(1);
                        });

                        it("#count is 2", function () {
                            const paper = paperForSource(source, memoryPapers);
                            expect(paper.count).toEqual(2);
                        });

                        // more tests parameterized in the 3rd item in the list for this source
                        if (urls[source].length === 3) {
                            const additionalTest = urls[source][2];

                            if (additionalTest["code"]) {
                                it("#codeLink", function () {
                                    const paper = paperForSource(source, memoryPapers);
                                    expect(typeof paper.codeLink === "string").toBe(
                                        true,
                                        `${source}: code link should not be ${typeof paper.codeLink}${
                                            paper.codeLink
                                        }`
                                    );
                                });
                            }

                            it("#venue is a string", function () {
                                const paper = paperForSource(source, memoryPapers);
                                expect(typeof paper.venue).toMatch("string");
                            });

                            it("#venue matches source", function () {
                                const paper = paperForSource(source, memoryPapers);
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
                !keepOpen && (await browser.close());
            });
        });
    }
});

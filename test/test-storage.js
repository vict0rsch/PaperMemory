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

var orders = ["abs;pdf", "pdf;abs"];

// global constants to parametrize the tests
const loadSecs = parseFloat(process.env.load_secs ?? 10);
const maxSources = process.env.max_sources ?? -1;
const pageTimeout = parseFloat(process.env.page_timeout ?? 5000);
const singleSource = process.env.source?.toLowerCase() ?? false;
const keepBrowser = Boolean(process.env.keep_browser ?? false);
const dumpMemory = process.env.dump_memory ?? false;
const singleOrder = process.env.order ?? false;

if (maxSources > 0 && singleSource) {
    throw new Error("Please specify either MAX_SOURCES xor SINGLE_SOURCE");
}

if (singleOrder && orders.indexOf(singleOrder) === -1) {
    throw new Error(
        `Unknown order: ${singleOrder}. Valid orders: ${orders.join(" and ")}`
    );
}

console.log("Test params:");
console.log("    loadSecs    : ", loadSecs);
console.log("    pageTimeout : ", pageTimeout);
console.log("    maxSources  : ", maxSources);
console.log("    singleSource: ", singleSource);
console.log("    keepBrowser : ", keepBrowser);
console.log("    dumpMemory  : ", dumpMemory);
console.log("    singleOrder : ", singleOrder);
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
    } else if (singleSource) {
        urls = { [singleSource]: urls[singleSource] };
    }

    for (const source in urls) {
        const targets = urls[source];
        if (targets.length === 3 && targets[2].botPrevention) {
            console.log(
                `\n>>> Skipping test for ${source} because its website ` +
                    `prevents automated browsing`
            );
            delete urls[source];
        }
    }

    var sources = Object.keys(urls);

    if (singleOrder) {
        orders = [singleOrder];
    }

    const timeout = (sources.length + 1) * 20 * pageTimeout + loadSecs * 1000;
    this.timeout(timeout * orders.length);
    this.slow(timeout * orders.length);

    // --------------------------
    // -----  Prepare Data  -----
    // --------------------------

    for (const order of orders) {
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
                        const target = targetUrls[t];
                        // log prefix
                        const prefix = `${" ".repeat(4)}(${idx + t * nUrls + 1}/${
                            nUrls * 2
                        })`;
                        console.log(`${prefix} Going to: ${target}`);

                        // create page
                        const p = await browser.newPage();
                        const paperIsStored = new Promise((resolve) => {
                            p.on(
                                "console",
                                (msg) =>
                                    msg
                                        .text()
                                        .match(/\[PM\]\s*Done processing paper/) &&
                                    resolve()
                            );
                            setTimeout(resolve, pageTimeout);
                        });
                        // asynchronously go to url
                        p.goto(target);
                        const pageIsLoaded = new Promise((resolve) => {
                            p.once("load", resolve);
                            setTimeout(resolve, pageTimeout);
                        });
                        await pageIsLoaded;
                        await paperIsStored;
                    }
                }

                // wait for all pages to load
                await sleep(pageTimeout);

                // go to the extension's popup url
                const page = await browser.newPage();
                await page.goto(extensionPopupURL);
                await page.waitForTimeout(1000);

                // retrieve the data parsed by PaperMemory
                memoryData = await getMemoryData(page);

                if (dumpMemory) {
                    // dump this data for human analysis
                    const fname = `./tmp/memory-${new Date()}.json`;
                    fs.writeFileSync(fname, JSON.stringify(memoryData, null, 2));
                }

                // remove data version key
                dataVersion = memoryData["__dataVersion"];
                delete memoryData["__dataVersion"];
            });

            // --------------------------------------
            // -----  Global memory inspection  -----
            // --------------------------------------

            describe("Global memory inspection", function () {
                it("All sources are detected", async function () {
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
                    const refCountsBySource = Object.fromEntries(
                        sources.map((s) => [s, 2])
                    );
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
                        it("1 paper for source", function () {
                            const papers = Object.values(memoryData).filter(
                                (p) => p.source === source
                            );
                            expect(papers.length).toBe(1);
                        });

                        it("#count is 2", function () {
                            const paper = paperForSource(source, memoryData);
                            expect(paper.count).toEqual(2);
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
                !keepBrowser && (await browser.close());
            });
        });
    }
});

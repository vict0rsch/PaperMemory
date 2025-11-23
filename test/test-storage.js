// ❯ env MAX_SOURCES=2 PAGE_TIMEOUT_S=8 npm run test

// ---------------------
// -----  Imports  -----
// ---------------------

import { expect } from "expect";
import fs from "fs";
import { basename } from "node:path";
import {
    makeBrowser,
    getMemoryPapers,
    findExtensionId,
    getPMURLs,
    visitPaperPage,
} from "./browser.js";

import { readURLs, root, loadConfig, loadPaperMemoryUtils } from "./utilsForTests.js";
import { allAttributes } from "./processMemory.js";

// make all functions in utils.min.js available in the `global` scope
await loadPaperMemoryUtils();

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

var {
    onlySources,
    maxSources,
    pageTimeout,
    keepOpen,
    dump,
    singleOrder,
    ignoreSources,
    headless,
} = loadConfig();

// check env vars
var orders = ["abs;pdf", "pdf;abs"];

if (maxSources > 0 && onlySources && onlySources.length > 0) {
    throw new Error("Please specify either maxSources xor onlySources");
}

if (singleOrder && orders.indexOf(singleOrder) === -1) {
    throw new Error(
        `Unknown order: ${singleOrder}. Valid orders: ${orders.join(" and ")}`
    );
}

if (typeof ignoreSources === "string") {
    ignoreSources = ignoreSources.split(",").map((source) => source.trim());
}

console.log(`\n${basename(import.meta.url)} args:`);
console.log("  pageTimeout   : ", pageTimeout);
console.log("  maxSources    : ", maxSources);
console.log("  onlySources   : ", onlySources);
console.log("  keepOpen      : ", keepOpen);
console.log("  dump          : ", dump);
console.log("  singleOrder   : ", singleOrder);
console.log("  ignoreSources : ", ignoreSources);
console.log("  headless      : ", headless);

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
    var urls = readURLs();
    if (maxSources > 0) {
        console.info("Truncating urls to maxSources: ", maxSources);
        urls = Object.fromEntries(Object.entries(urls).slice(0, maxSources));
    } else if (onlySources && onlySources.length > 0) {
        urls = Object.fromEntries(
            Object.entries(urls).filter(([source, v]) => onlySources.includes(source))
        );
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
                `\n>>> Skipping test for "${source}" because its website ` +
                    `prevents automated browsing. Remember to test manually:` +
                    `\n    ${targets[0]}` +
                    `\n    ${targets[1]}`
            );
            delete urls[source];
        } else if (targets.length === 3 && targets[2].noPdf) {
            console.log(
                `\n>>> Skipping PDF test for ${source} because its ` +
                    `pdf page does not exist / cannot be parsed to an ID`
            );
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
    describe("Check all sources have a test", function () {
        it("All sources have at least one test", function () {
            const knownSources = Object.keys(PMUtils.config.knownPaperPages);
            const testSources = readURLs();
            const missingTests = [];
            for (const source of knownSources) {
                if (source == "website") continue;
                if (!testSources[source]) {
                    missingTests.push(source);
                }
            }
            expect(missingTests).toEqual([]);
        });
    });

    for (const [orderIdx, order] of orders.entries()) {
        describe("Parsing order: " + order, function () {
            before(async function () {
                !Object.keys(urls).length && this.skip();
                // create browser
                browser = await makeBrowser(headless);

                // count total urls to visit depending on maxSources
                const nUrls = sources.length;

                // visit all relevant urls
                // all abstracts then all pdfs

                const sourceOrder = order === "abs;pdf" ? [0, 1] : [1, 0];

                for (const sourceOrderIdx of sourceOrder) {
                    for (const [targetIdx, targets] of Object.values(urls).entries()) {
                        // for each target url (abstract, pdf), visit the url
                        // and wait a little for it to load
                        const isPDF = sourceOrderIdx === 1;
                        if (isPDF && targets[2]?.noPdf) continue;
                        // filter out the additional test configs
                        const targetUrls = targets.filter((u) => typeof u === "string");
                        if (sourceOrderIdx >= targetUrls.length) {
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
                        // TODO: handle no pdf but still check abstracts
                        const target = targetUrls[sourceOrderIdx];
                        // log prefix
                        const n =
                            targetIdx +
                            (orderIdx > 0 ? 1 - sourceOrderIdx : sourceOrderIdx) *
                                nUrls +
                            1;
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
                const extensionId = await findExtensionId(browser);
                const { popupURL } = getPMURLs(extensionId);
                await page.goto(popupURL);

                // retrieve the data parsed by PaperMemory
                memoryPapers = await getMemoryPapers(page);

                if (dump) {
                    // dump this data for human analysis
                    const fname = `${root}/test/tmp/memory-${new Date()}.json`;
                    // create the directory if it doesn't exist
                    fs.mkdirSync(`${root}/test/tmp`, { recursive: true });
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

                it("Pdf and Abstract are matched to the same Memory item (count is 2 --or 3 to account for redirections--)", async function () {
                    const filteredSources = sources.filter(
                        (s) => !ignoreSingleOrder(s, urls, order)
                    );
                    for (const paper of Object.values(memoryPapers)) {
                        let targetMinCount = 2;
                        if (urls[paper.source][2]?.noPdf) targetMinCount--;
                        expect(paper.count).toBeGreaterThanOrEqual(targetMinCount);
                    }
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
                            expect(papers).toBeDefined();
                            expect(papers?.length).toBe(1);
                        });

                        it("#count is appropriate for the source", function () {
                            const paper = paperForSource(source, memoryPapers);
                            expect(paper).toBeDefined();
                            let sourceCount = 2;
                            if (urls[source][2]?.noPdf) sourceCount--;
                            expect(paper?.count).toBeGreaterThanOrEqual(sourceCount);
                        });

                        // more tests parameterized in the 3rd item in the list for this source
                        if (urls[source].length === 3) {
                            const additionalTest = urls[source][2];

                            if (additionalTest["code"]) {
                                it("#codeLink", function () {
                                    const paper = paperForSource(source, memoryPapers);
                                    expect(paper).toBeDefined();
                                    expect(typeof paper?.codeLink === "string").toBe(
                                        true,
                                        `${source}: code link should not be ${typeof paper?.codeLink}${
                                            paper?.codeLink
                                        }`
                                    );
                                });
                            }

                            it("#venue is a string", function () {
                                const paper = paperForSource(source, memoryPapers);
                                expect(paper).toBeDefined();
                                expect(typeof paper?.venue).toMatch("string");
                            });

                            it("#venue matches source", function () {
                                const paper = paperForSource(source, memoryPapers);
                                expect(paper).toBeDefined();
                                if (additionalTest["venue"]) {
                                    const testVenues = additionalTest["venue"]
                                        .split(";")
                                        .map((v) =>
                                            v.trim().toLowerCase().replace(/\s/gi, "")
                                        );
                                    const hasVenue = testVenues.some((v) =>
                                        paper?.venue
                                            ?.toLowerCase()
                                            .replace(/\s/gi, "")
                                            .includes(v)
                                    );
                                    if (!hasVenue) {
                                        throw new Error(
                                            `${source}: ${
                                                paper?.venue
                                            } does not match ${testVenues.join(", ")}`
                                        );
                                    }
                                } else {
                                    // the venue is the same as the source
                                    expect(
                                        paper?.venue?.toLowerCase().replace(/\s/gi, "")
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

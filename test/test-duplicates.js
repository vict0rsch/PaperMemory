// ---------------------
// -----  Imports  -----
// ---------------------

import { expect } from "expect";
import fs from "fs";
import { basename } from "node:path";
import {
    makeBrowser,
    getPaperMemoryState,
    findExtensionId,
    getPMURLs,
    visitPaperPage,
} from "./browser.js";

import {
    loadPaperMemoryUtils,
    sleep,
    readURLs,
    readDuplicates,
    root,
    loadConfig,
} from "./utilsForTests.js";

// make all functions in utils.min.js available in the `global` scope
await loadPaperMemoryUtils();

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

let {
    keepOpen,
    dump,
    singleOrder,
    singleName,
    ignoreSources,
    pageTimeout,
    maxSources,
    onlySources,
    headless,
} = loadConfig();

console.log(`\n${basename(import.meta.url)} args:`);
console.log("  keepOpen      : ", keepOpen);
console.log("  dump          : ", dump);
console.log("  singleOrder   : ", singleOrder);
console.log("  singleName    : ", singleName);
console.log("  ignoreSources : ", ignoreSources);
console.log("  pageTimeout   : ", pageTimeout);
console.log("  maxSources    : ", maxSources);
console.log("  onlySources   : ", onlySources);
console.log("  headless      : ", headless);
// check env vars

var orders = ["pre;pub", "pub;pre"];

if (typeof ignoreSources === "string") {
    ignoreSources = ignoreSources.split(",").map((source) => source.trim());
}

if (singleOrder && orders.indexOf(singleOrder) === -1) {
    throw new Error(
        `Unknown order: ${singleOrder}. Valid orders: ${orders.join(" and ")}`
    );
}

// make non-duplicated items to visit before known duplicates:
// select the first item of each source and format it as duplicates
// (= [{url: string}])
let urls = readURLs();

// Apply maxSources truncation (same logic as test-storage.js)
if (maxSources > 0) {
    console.log(`Truncating preDuplicates to maxSources: ${maxSources}`);
    urls = Object.fromEntries(Object.entries(urls).slice(0, maxSources));
} else if (onlySources && onlySources.length > 0) {
    urls = Object.fromEntries(
        Object.entries(urls).filter(([source, v]) => onlySources.includes(source))
    );
}

let preDuplicates = Object.entries(urls)
    .filter(([source, urls]) => !ignoreSources.includes(source))
    .map(([source, urls]) => urls)
    .filter((urls) => urls.length < 3 || !urls[2].botPrevention)
    .map((urls) => [{ url: urls[0] }])
    .map((value) => ({ value, sort: Math.random() })) // shuffle
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value)
    .slice(0, 5); // get 5 random items

if (singleName) {
    preDuplicates = [];
}

console.log(`\nUsing ${preDuplicates.length} pre-duplicates`);

let allDuplicates = readDuplicates().filter(
    (duplicates) => !singleName || duplicates[0].name === singleName
);

if (maxSources > 0) {
    console.log(`Truncating allDuplicates to maxSources: ${maxSources}`);
    allDuplicates = allDuplicates.slice(0, maxSources);
}

// --------------------------------
// -----  Main test function  -----
// --------------------------------

describe("Paper de-duplication", function () {
    var memoryState, browser, memoryPage;

    if (singleOrder) {
        orders = [singleOrder];
    }

    const timeout = (allDuplicates.length + 1) * 20 * 5000;
    this.timeout(timeout * orders.length);
    this.slow(timeout * orders.length);

    // make sure de-duplication works if a pre-print or a publication is opened first
    for (const [o, order] of orders.entries()) {
        describe(`Testing order ${order}`, function () {
            after(async function () {
                await browser.close();
            });

            // before the tests: visit paper pages
            before(async function () {
                // create browser
                browser = await makeBrowser(headless);
                // visit non-duplicated papers first, then known duplicates
                const allVisits = [...preDuplicates, ...allDuplicates];
                // count total number of urls to visit
                const nUrls = allVisits
                    .map((duplicates) => duplicates.length)
                    .reduce((sum, count) => sum + count, 0);
                // current number of urls visited
                let n = 0;
                for (let duplicates of allVisits) {
                    // sort papers to visit by their type according to current `order`
                    if (order === "pre;pub") {
                        duplicates = [
                            ...duplicates.filter((d) => d.type === "preprint"),
                            ...duplicates.filter((d) => d.type !== "preprint"),
                        ];
                    } else {
                        duplicates = [
                            ...duplicates.filter((d) => d.type !== "preprint"),
                            ...duplicates.filter((d) => d.type === "preprint"),
                        ];
                    }

                    // visit the paper urls
                    for (const dup of duplicates) {
                        console.log(`      (${n + 1}/${nUrls}) visiting ${dup.url}`);
                        await visitPaperPage(browser, dup.url, {
                            keepOpen,
                            timeout: pageTimeout,
                        });
                        n += 1;
                    }
                }

                // go to the extension popup's page
                memoryPage = (await browser.pages())[0];
                const extensionId = await findExtensionId(browser);
                const { popupURL } = getPMURLs(extensionId);
                await memoryPage.goto(popupURL);
                // wait for it to load
                await sleep(1e3);
                // get PaperMemory's state
                memoryState = await getPaperMemoryState(memoryPage);

                if (dump) {
                    // dump this data for human analysis
                    const fname = `${root}/test/tmp/duplicate-memory-${new Date()}.json`;
                    // create the directory if it doesn't exist
                    fs.mkdirSync(`${root}/test/tmp`, { recursive: true });
                    fs.writeFileSync(fname, JSON.stringify(memoryState, null, 2));
                }
            });

            // ---------------------------------
            // -----  State data is ready  -----
            // ---------------------------------

            // for each duplicate paper:
            for (const [i, duplicates] of allDuplicates.entries()) {
                describe(`(${i + 1}/${allDuplicates.length}) Counting ${
                    duplicates[0].name
                }`, function () {
                    // test variables
                    var hashedName, hashedTitle, ids, papers;

                    beforeEach(async function () {
                        // before each duplicate test: find the right objects
                        hashedName = PMUtils.functions.miniHash(duplicates[0].name);
                        hashedTitle = Object.keys(memoryState.titleHashToIds).find(
                            (k) => k.includes(hashedName)
                        );
                        ids = memoryState.titleHashToIds[hashedTitle];
                        papers = ids.map((id) => memoryState.papers[id]);
                    });

                    it("There exists a paper with multiple counts", function () {
                        const multipleCountsPaper = papers.filter((p) => p.count > 1);
                        expect(multipleCountsPaper.length).toEqual(1);
                        expect(multipleCountsPaper[0].count).toEqual(duplicates.length);
                    });
                    it("All other papers have a single count", function () {
                        const singleCountPapers = papers.filter((p) => p.count === 1);
                        const multipleCountsPaper = papers.find((p) => p.count > 1);
                        const targetSingles = memoryState.titleHashToIds[
                            hashedTitle
                        ].filter((id) => id !== multipleCountsPaper?.id).length;
                        expect(singleCountPapers.length).toEqual(targetSingles);
                    });
                });
            }
        });

        after(async function () {
            !keepOpen && (await browser.close());
        });
    }
});

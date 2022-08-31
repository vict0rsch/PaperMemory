// ---------------------
// -----  Imports  -----
// ---------------------

const { expect } = require("expect");
const fs = require("fs");
const {
    makeBrowser,
    getPaperMemoryState,
    extensionPopupURL,
    visitPaperPage,
} = require("./browser");

const { loadPaperMemoryUtils, sleep, readJSON } = require("./utilsForTests");

// make all functions in utils.min.js available in the `global` scope
loadPaperMemoryUtils();

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

// keep pages and browser open at the end of tests to inspect
const keepOpen = Boolean(process.env.keepOpen ?? false);
// write the state to ./tmp as a JSON file
const dump = Boolean(process.env.dump) ?? false;
// only run tests for a specific publication<->preprint order
const singleOrder = process.env.singleOrder ?? "";
// only run tests for a specific named duplicate
const singleName = process.env.singleName ?? "";
// ignore pre-duplicate sources (','-separated sources as per ./data/urls.json)
let ignoreSources = process.env.ignoreSources ?? [];

console.log("Test params:");
console.log("    keepOpen      : ", keepOpen);
console.log("    dump          : ", dump);
console.log("    singleOrder   : ", singleOrder);
console.log("    singleName    : ", singleName);
console.log("    ignoreSources : ", ignoreSources);

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
const preDuplicates = Object.entries(readJSON("./data/urls.json"))
    .filter(([source, urls]) => !ignoreSources.includes(source))
    .map(([source, urls]) => urls)
    .filter((urls) => urls.length < 3 || !urls[2].botPrevention)
    .map((urls) => [{ url: urls[0] }]);

console.log(`\nUsing ${preDuplicates.length} pre-duplicates`);

const allDuplicates = readJSON("./data/duplicates.json").filter(
    (duplicates) => !singleName || duplicates[0].name === singleName
);

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
            // before the tests: visit paper pages
            before(async function () {
                // create browser
                browser = await makeBrowser();
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
                        await visitPaperPage(browser, dup.url, { keepOpen });
                        n += 1;
                    }
                }

                // go to the extension popup's page
                memoryPage = await browser.newPage();
                await memoryPage.goto(extensionPopupURL);
                // wait for it to load
                await sleep(1e3);
                // get PaperMemory's state
                memoryState = await getPaperMemoryState(memoryPage);

                if (dump) {
                    // dump this data for human analysis
                    const fname = `./tmp/duplicate-memory-${new Date()}.json`;
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
                        hashedName = miniHash(duplicates[0].name);
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

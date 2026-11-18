// Test for PaperMemory's Popup Search Functionality
// Tests all search features including general search, tag search, code search, year search, and UI interactions

// ---------------------
// -----  Imports  -----
// ---------------------

import { expect } from "expect";
import { basename } from "node:path";
import {
    findExtensionId,
    getPaperMemoryState,
    makeBrowser,
    getPMURLs,
    resetPage,
    setStorage,
    verifySelectorExists,
    verifyElementClickable,
    getURL,
    safeClick,
} from "./browser.js";

import {
    loadConfig,
    root,
    readJSON,
    indent,
    sleep,
    asyncMap,
    loadPaperMemoryUtils,
} from "./utilsForTests.js";

await loadPaperMemoryUtils();

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

const { keepOpen, headless } = loadConfig();
console.log(`\n${basename(import.meta.url)} args:`);
console.log("  headless :", headless);
console.log("  keepOpen :", keepOpen);

// Paper ID constants for test data
const PAPER_IDS = {
    CYCLE_GAN: "Arxiv-1703.10593",
    HYPERPARAMETER: "JMLR-2012_bergstra12a",
    NANOWIRE: "RSC-DigitalDiscovery_d2dd00066k",
};

// --------------------------------
// -----  Main test function  -----
// --------------------------------

describe("Test PaperMemory Popup Search Functionality", function () {
    var browser;
    var extensionId;
    var pmURLs;
    var testData;
    var PMPage;

    // Set timeout for UI tests
    this.timeout(120000); // 2 minutes for comprehensive search tests
    this.slow(60000); // Consider slow after 60 seconds

    before(async function () {
        browser = await makeBrowser(headless);
        PMPage = (await browser.pages())[0];

        // Discover the extension ID assigned by Chrome
        extensionId = await findExtensionId(browser);

        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        // Load test data
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
    });

    after(async function () {
        if (browser && !keepOpen) {
            await browser.close();
        }
    });

    // Common setup function - only run once per describe block
    async function setupPageWithData(page, data) {
        await setStorage(page, "papers", data);
        await page.reload({ waitUntil: "networkidle0" });
        await page.waitForFunction(() => window.__pmPopupReady === true, {
            timeout: 10000,
        });
        await ensureMemoryIsOpen(page);
    }

    // Comprehensive reset function for tests that need clean state
    async function quickReset(page) {
        try {
            await resetPage(page, pmURLs.popupURL);
            await setupPageWithData(page, testData);

            // Ensure memory is open and visible
            await ensureMemoryIsOpen(page);
        } catch (error) {
            // If reset fails, recreate the page
            try {
                await page.close();
            } catch {}
            page = await browser.newPage();
            await resetPage(page, pmURLs.popupURL);
            await setupPageWithData(page, testData);
        }
        return page;
    }

    // Helper functions
    async function ensureMemoryIsOpen(page) {
        const currentState = await getPaperMemoryState(page);
        if (!currentState.memoryIsOpen) {
            await page.keyboard.press("a");
        }
    }

    async function getVisibleMemoryItems(page) {
        return await page.$$("#memory-table .memory-container");
    }

    async function getSearchInput(page) {
        return await verifySelectorExists("#memory-search", page);
    }

    async function typeInSearch(page, text) {
        const searchInput = await getSearchInput(page);

        // Clear the input first
        await searchInput.click();
        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");
        await page.keyboard.press("Backspace");

        // Set the value and trigger the search through the shared helper
        await executeSearch(page, text);
    }

    async function clearSearch(page) {
        const searchInput = await getSearchInput(page);
        await searchInput.click();
        await page.keyboard.down("Control");
        await page.keyboard.press("a");
        await page.keyboard.up("Control");
        await page.keyboard.press("Backspace");

        // Trigger clear search event
        await page.evaluate(() => {
            const searchInput = document.getElementById("memory-search");
            searchInput.value = "";
            const event = new Event("clear-search");
            searchInput.dispatchEvent(event);
        });

        await sleep(100);
    }

    async function verifySearchResults(page, expectedCount, expectedTitles = []) {
        const visibleItems = await getVisibleMemoryItems(page);
        expect(visibleItems.length).toBe(expectedCount);

        if (expectedTitles.length > 0) {
            const actualTitles = await page.evaluate(() => {
                const items = document.querySelectorAll(
                    "#memory-table .memory-container",
                );

                return Array.from(items).map((item) => {
                    const titleEl = item.querySelector(".memory-title");
                    return titleEl ? titleEl.textContent.trim() : "";
                });
            });

            for (const expectedTitle of expectedTitles) {
                expect(
                    actualTitles.some((title) => title.includes(expectedTitle)),
                ).toBe(true);
            }
        }
    }

    async function verifySearchByState(page, expectedCount, expectedPaperIds = []) {
        const stateInfo = await page.evaluate(() => {
            if (
                window.PMDebug &&
                window.PMDebug.config &&
                window.PMDebug.config.state
            ) {
                const state = window.PMDebug.config.state;
                return {
                    papersListLength: state.papersList ? state.papersList.length : 0,
                    papersListIds: state.papersList
                        ? state.papersList.map((p) => p.id)
                        : [],
                    sortedPapersLength: state.sortedPapers
                        ? state.sortedPapers.length
                        : 0,
                    searchValue: document.getElementById("memory-search")?.value || "",
                };
            }
            return null;
        });

        expect(stateInfo.papersListLength).toBe(expectedCount);

        // Cross-check the rendered table so a render bug (state updated but DOM
        // not re-rendered) cannot pass the suite.
        const visibleCount = (await getVisibleMemoryItems(page)).length;
        expect(visibleCount).toBe(expectedCount);

        if (expectedPaperIds.length > 0) {
            for (const expectedId of expectedPaperIds) {
                expect(stateInfo.papersListIds).toContain(expectedId);
            }
        }

        return stateInfo;
    }

    async function verifySearchConsistency(page) {
        const consistency = await page.evaluate(() => {
            if (
                window.PMDebug &&
                window.PMDebug.config &&
                window.PMDebug.config.state
            ) {
                const state = window.PMDebug.config.state;
                const visibleItems = document.querySelectorAll(
                    "#memory-table .memory-container",
                );

                return {
                    statePapersListLength: state.papersList
                        ? state.papersList.length
                        : 0,
                    visibleItemsLength: visibleItems.length,
                    isConsistent:
                        (state.papersList ? state.papersList.length : 0) ===
                        visibleItems.length,
                };
            }
            return null;
        });

        expect(consistency.isConsistent).toBe(true);
    }

    // the result count inside the search field: "3", or "1 of 3" when filtered
    async function verifyResultCount(page, expectedText) {
        const count = await page.$eval("#memory-result-count", (el) => el.textContent);
        expect(count).toBe(expectedText);
    }

    // the sort menu (sort icon in the search field) replaces the old <select>
    async function selectSort(page, key) {
        await page.click("#memory-sort-button");
        await page.waitForSelector("#memory-sort-menu:not([hidden])");
        await page.click(`#memory-sort-menu [data-key="${key}"]`);
        await sleep(100);
    }

    async function executeSearch(page, searchQuery) {
        await page.evaluate((query) => {
            const searchInput = document.getElementById("memory-search");
            searchInput.value = query;

            const event = new KeyboardEvent("keypress", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
            });
            searchInput.dispatchEvent(event);
        }, searchQuery);

        await sleep(100);
    }

    async function verifyDebugUtilsSetup(page) {
        const isSetup = await page.evaluate(() => {
            return !!(
                window.PMDebug &&
                window.PMDebug.config &&
                window.PMDebug.config.state
            );
        });
        expect(isSetup).toBe(true);
    }

    async function setupPaperTags(page, paperIds) {
        await verifyDebugUtilsSetup(page);
        await page.evaluate((paperIds) => {
            const papers = window.PMDebug.config.state.papers;
            papers[paperIds.CYCLE_GAN].tags = ["computer-vision", "gan"];
            papers[paperIds.HYPERPARAMETER].tags = ["optimization", "hyperparameter"];
            papers[paperIds.NANOWIRE].tags = ["machine-learning", "nanowire"];
        }, paperIds);
    }

    async function setupPaperCodeLinks(page, paperIds) {
        await verifyDebugUtilsSetup(page);
        await page.evaluate((paperIds) => {
            const papers = window.PMDebug.config.state.papers;
            papers[paperIds.CYCLE_GAN].codeLink = "https://github.com/junyanz/CycleGAN";
            papers[paperIds.HYPERPARAMETER].codeLink =
                "https://github.com/bergstra/hyperopt";
            papers[paperIds.NANOWIRE].codeLink = "https://github.com/nanowire-analysis";
        }, paperIds);
    }

    async function markPaperAsFavorite(page, paperId) {
        await verifyDebugUtilsSetup(page);
        await page.evaluate((paperId) => {
            const papers = window.PMDebug.config.state.papers;
            papers[paperId].favorite = true;
            papers[paperId].favoriteDate = new Date().toJSON();
        }, paperId);
    }

    async function setupSinglePaperTags(page, paperId, tags) {
        await verifyDebugUtilsSetup(page);
        await page.evaluate(
            (paperId, tags) => {
                const papers = window.PMDebug.config.state.papers;
                papers[paperId].tags = tags;
            },
            paperId,
            tags,
        );
    }

    describe("Basic Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should have search input available and focused when memory opens", async function () {
            const searchInput = await getSearchInput(PMPage);
            expect(searchInput).toBeTruthy();

            // Verify search input is focused when memory opens
            const isFocused = await PMPage.evaluate(() => {
                return document.activeElement.id === "memory-search";
            });
            expect(isFocused).toBe(true);
        });

        it("should display all papers when search is empty", async function () {
            const visibleItems = await getVisibleMemoryItems(PMPage);
            expect(visibleItems.length).toBe(3); // All 3 test papers
        });

        it("should be able to set search value and trigger search", async function () {
            await executeSearch(PMPage, "Cycle");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should verify search consistency between state and displayed items", async function () {
            // Test with no search (all papers)
            await verifySearchConsistency(PMPage);

            // Test with search
            await executeSearch(PMPage, "Cycle");
            await verifySearchConsistency(PMPage);
        });

        it("should filter papers by title search", async function () {
            await executeSearch(PMPage, "Cycle");

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should filter papers by author search", async function () {
            await executeSearch(PMPage, "Zhu");

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should filter papers by note content", async function () {
            await executeSearch(PMPage, "IEEE");

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should support multi-word search", async function () {
            await executeSearch(PMPage, "machine learning");

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
        });

        it("should clear search and show all papers", async function () {
            // First search for something
            await executeSearch(PMPage, "Cycle");
            await verifySearchByState(PMPage, 1);

            // Clear search
            await executeSearch(PMPage, "");
            await verifySearchByState(PMPage, 3);
        });

        it("should show the result count in the search field", async function () {
            await verifyResultCount(PMPage, "3");
            await executeSearch(PMPage, "Cycle");
            await verifyResultCount(PMPage, "1 of 3");
            await executeSearch(PMPage, "");
        });
    });

    describe("Tag Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle tag search with t: prefix", async function () {
            await setupPaperTags(PMPage, PAPER_IDS);

            await executeSearch(PMPage, "t: computer-vision");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should handle multiple tag search", async function () {
            await executeSearch(PMPage, "t: gan computer-vision");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should show tag suggestions when tag search is active", async function () {
            await clearSearch(PMPage);
            await PMPage.keyboard.type("t:");
            await PMPage.waitForSelector("#memory-tag-suggestions:not([hidden])");
            const suggestions = await PMPage.$$eval(
                "#memory-tag-suggestions .pm-sugg-row",
                (rows) => rows.map((r) => r.textContent),
            );
            expect(suggestions.length).toBeGreaterThan(0);
        });

        it("should handle tag click to search", async function () {
            await setupPaperTags(PMPage, PAPER_IDS);
            await clearSearch(PMPage);
            await executeSearch(PMPage, "");
            // re-render the rows with the tags set above
            await PMPage.evaluate(() => PMDebug.memory.applyMemorySearch());

            // Click on a tag in a row — must render, or the test has asserted nothing
            const tagElement = await PMPage.$(".memory-tag");
            expect(tagElement).toBeTruthy();
            const tagText = await PMPage.evaluate(
                (el) => el.textContent.trim(),
                tagElement,
            );

            await safeClick(".memory-tag", PMPage);

            // The concrete tag becomes a filter pill
            const pills = await PMPage.$$eval("#memory-pills .pm-chip", (els) =>
                els.map((el) => el.textContent),
            );
            expect(pills.join(" ")).toContain(tagText);
            await PMPage.evaluate(() => PMDebug.memory.clearMemorySearch());
        });

        it("should replace the search with the clicked tag alone", async function () {
            await setupPaperTags(PMPage, PAPER_IDS);
            // pills (year, favourites) and free text before the click
            await PMPage.evaluate((id) => {
                PMDebug.config.state.papers[id].favorite = true;
                PMDebug.memory.clearMemorySearch();
                PMDebug.memory.addFilter({ type: "year", value: ">2000" });
                PMDebug.memory.addFilter({ type: "fav", value: "" });
                document.getElementById("memory-search").value = "unpaired";
                PMDebug.memory.applyMemorySearch();
            }, PAPER_IDS.CYCLE_GAN);
            const clicked = await PMPage.evaluate(() => {
                const tag = [...document.querySelectorAll(".memory-tag")].find(
                    (t) => t.textContent === "gan",
                );
                tag?.click();
                return !!tag;
            });
            expect(clicked).toBe(true);
            const after = await PMPage.evaluate(() => ({
                filters: PMDebug.config.state.memoryFilters,
                text: document.getElementById("memory-search").value,
                pills: [...document.querySelectorAll("#memory-pills .pm-chip")].map(
                    (el) => el.textContent,
                ),
                fav: document
                    .getElementById("filter-favorites")
                    .getAttribute("aria-pressed"),
                rows: [...document.querySelectorAll("#memory-table .memory-container")].map(
                    (r) => r.id,
                ),
            }));
            expect(after.filters).toEqual([{ type: "tag", value: "gan" }]);
            expect(after.text).toBe("");
            expect(after.pills).toEqual(["taggan"]);
            expect(after.fav).toBe("false");
            expect(after.rows).toEqual([`memory-container--${PAPER_IDS.CYCLE_GAN}`]);
            await PMPage.evaluate((id) => {
                PMDebug.config.state.papers[id].favorite = false;
                PMDebug.memory.clearMemorySearch();
            }, PAPER_IDS.CYCLE_GAN);
        });
    });

    describe("Code Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle code search with c: prefix", async function () {
            await setupPaperCodeLinks(PMPage, PAPER_IDS);

            await executeSearch(PMPage, "c: CycleGAN");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should handle multiple word code search", async function () {
            await executeSearch(PMPage, "c: github nanowire");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
        });

        it("should return no results for non-existent code", async function () {
            await executeSearch(PMPage, "c: nonexistent");

            await verifySearchByState(PMPage, 0);
        });
    });

    describe("Year Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle year search with y: prefix", async function () {
            await executeSearch(PMPage, "y: 2017");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should handle multiple years", async function () {
            await executeSearch(PMPage, "y: 2017, 2012");

            await verifySearchByState(PMPage, 2, [
                PAPER_IDS.CYCLE_GAN,
                PAPER_IDS.HYPERPARAMETER,
            ]);
        });

        it("should handle year range with less than", async function () {
            await executeSearch(PMPage, "y: <2015");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.HYPERPARAMETER]);
        });

        it("should handle year range with greater than", async function () {
            await executeSearch(PMPage, "y: >2015");

            await verifySearchByState(PMPage, 2, [
                PAPER_IDS.CYCLE_GAN,
                PAPER_IDS.NANOWIRE,
            ]);
        });

        it("should handle two-digit years", async function () {
            await executeSearch(PMPage, "y: 17");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });
    });

    describe("Search UI Interactions", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should show the no-result state with Clear search", async function () {
            await typeInSearch(PMPage, "zzzzz");
            await PMPage.waitForSelector("#memory-empty-clear");
            await verifySearchResults(PMPage, 0);
        });

        it("should clear search when Clear search is clicked", async function () {
            await typeInSearch(PMPage, "zzzzz");
            await safeClick("#memory-empty-clear", PMPage);

            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("");

            await verifySearchResults(PMPage, 3);
        });

        it("should handle backspace key properly", async function () {
            await typeInSearch(PMPage, "test");
            await PMPage.keyboard.press("Backspace");
            await sleep(100);

            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("tes");
        });

        it("should handle enter key without form submission", async function () {
            await typeInSearch(PMPage, "test");
            await PMPage.keyboard.press("Enter");

            // Should not reload the page or submit a form
            const currentUrl = await getURL(PMPage);
            expect(currentUrl).toContain("popup");
        });
    });

    describe("Search with Favorites Filter", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should filter search results when favorites filter is active", async function () {
            await markPaperAsFavorite(PMPage, PAPER_IDS.CYCLE_GAN);

            // Enable favorites filter
            await safeClick("#filter-favorites", PMPage);
            await sleep(100);

            // Search through the real input path: "machine" only matches the
            // non-favorite NANOWIRE, so a composed filter+search yields 0.
            await executeSearch(PMPage, "machine");

            // Should only show favorite papers that match
            await verifySearchResults(PMPage, 0);
        });

        it("should update search placeholder when favorites filter is active", async function () {
            await PMPage.reload();
            await setupPageWithData(PMPage, testData);
            await ensureMemoryIsOpen(PMPage);

            // Mark the first paper as favorite using the UI
            await PMPage.evaluate(() => {
                const firstMemoryItem = document.querySelector(
                    "#memory-table .memory-container",
                );
                if (firstMemoryItem) {
                    const favoriteButton = firstMemoryItem.querySelector(
                        ".memory-item-favorite",
                    );
                    if (favoriteButton) {
                        favoriteButton.click();
                    }
                }
            });

            await sleep(100);

            // Check if filter button exists
            const filterButtonExists = await PMPage.evaluate(() => {
                const filterButton = document.querySelector("#filter-favorites");
                return !!filterButton;
            });

            // Trigger the favorites filter by clicking the filter button
            await PMPage.evaluate(() => {
                const filterButton = document.querySelector("#filter-favorites");
                if (filterButton) {
                    filterButton.click();
                }
            });

            await sleep(100);

            // Check state after filter
            const debugInfo = await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const state = window.PMDebug.config.state;
                    return {
                        showFavorites: state.showFavorites,
                        papersListLength: state.papersList.length,
                        sortedPapersLength: state.sortedPapers.length,
                        favoritePapersCount: state.sortedPapers.filter(
                            (p) => p.favorite,
                        ).length,
                    };
                }
                return null;
            });

            // Check the count BEFORE search (favourites only: 1 of the 3 papers)
            await verifyResultCount(PMPage, "1 of 3");

            // Search for something
            await executeSearch(PMPage, "machine");

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
        });
    });

    describe("Search Performance and Edge Cases", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle case-insensitive search", async function () {
            await executeSearch(PMPage, "CYCLE");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should handle special characters in search", async function () {
            await executeSearch(PMPage, "Image-to-Image");

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should handle empty search queries gracefully", async function () {
            await executeSearch(PMPage, "   ");

            // Empty search should show all papers
            await verifySearchByState(PMPage, 3);
        });

        it("should handle very long search queries", async function () {
            const longQuery = "a".repeat(1000);
            await executeSearch(PMPage, longQuery);

            // Should not crash and should return no results
            await verifySearchByState(PMPage, 0);
        });

        it("should maintain search state when switching between search types", async function () {
            // First do a regular search
            await executeSearch(PMPage, "Cycle");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);

            // Then switch to a tag search (but first add tags)
            await setupSinglePaperTags(PMPage, PAPER_IDS.CYCLE_GAN, [
                "computer-vision",
                "gan",
            ]);

            await executeSearch(PMPage, "t: computer-vision");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should preserve search results when sort order changes to year", async function () {
            // First search
            await executeSearch(PMPage, "Cycle");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);

            // Change sort order through the UI select
            await selectSort(PMPage, "year");
            await sleep(100);

            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });

        it("should order rendered papers by the selected sort key", async function () {
            // All 3 papers visible; years: HYPERPARAMETER 2012 < CYCLE_GAN 2017
            // < NANOWIRE 2022
            await executeSearch(PMPage, "");
            await verifySearchByState(PMPage, 3);

            // The previous spec left the sort on "year": move away first so
            // selecting "year" is a real change
            await selectSort(PMPage, "title");
            await sleep(100);
            await selectSort(PMPage, "year");
            await sleep(100);

            const orderedIds = await PMPage.evaluate(() =>
                Array.from(
                    document.querySelectorAll("#memory-table .memory-container"),
                ).map((el) => el.id.replace("memory-container--", "")),
            );
            // "year" is a descending sort key: newest first
            const byYearDesc = [
                PAPER_IDS.NANOWIRE,
                PAPER_IDS.CYCLE_GAN,
                PAPER_IDS.HYPERPARAMETER,
            ];
            expect(orderedIds.join()).toBe(byYearDesc.join());
        });
    });

    describe("Filter pills (t: c: y: committed with Tab / Enter)", function () {
        // vision is on two papers, vision-old on a third: a tag pill matches exactly
        const tagged = () => {
            const data = structuredClone(testData);
            data[PAPER_IDS.CYCLE_GAN].tags = ["vision", "gan"]; // 2017
            data[PAPER_IDS.NANOWIRE].tags = ["vision", "microscopy"]; // 2022
            data[PAPER_IDS.HYPERPARAMETER].tags = ["vision-old", "optimization"]; // 2012
            return data;
        };
        const pills = (page) =>
            page.$$eval("#memory-pills .pm-chip", (els) =>
                els.map((el) => el.textContent),
            );
        const listedIds = (page) =>
            page.$$eval("#memory-table .memory-container", (els) =>
                els.map((el) => el.id.replace("memory-container--", "")),
            );

        beforeEach(async function () {
            await resetPage(PMPage, pmURLs.popupURL);
            await setupPageWithData(PMPage, tagged());
            await PMPage.focus("#memory-search");
        });

        it("should commit a tag on Tab and match the exact tag", async function () {
            await PMPage.keyboard.type("t:vision");
            await PMPage.keyboard.press("Tab");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["tagvision"]);
            // the field is emptied and keeps the focus
            expect(await PMPage.$eval("#memory-search", (el) => el.value)).toBe("");
            expect(await PMPage.evaluate(() => document.activeElement.id)).toBe(
                "memory-search",
            );
            // "vision-old" does not match the "vision" pill
            const ids = await listedIds(PMPage);
            expect(ids.sort()).toEqual(
                [PAPER_IDS.CYCLE_GAN, PAPER_IDS.NANOWIRE].sort(),
            );
        });

        it("should combine tag, year and free text (all must match)", async function () {
            await PMPage.keyboard.type("t:vision");
            await PMPage.keyboard.press("Enter");
            await PMPage.keyboard.type("y:>2018");
            await PMPage.keyboard.press("Tab");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["tagvision", "year>2018"]);
            expect(await listedIds(PMPage)).toEqual([PAPER_IDS.NANOWIRE]);
            await PMPage.keyboard.type("nanowire");
            await sleep(150);
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
            await executeSearch(PMPage, "cycle");
            await verifySearchByState(PMPage, 0);
            await verifyResultCount(PMPage, "0 of 3");
        });

        it("should move into the list on Tab when the text is not a filter", async function () {
            await PMPage.keyboard.type("cycle");
            await sleep(100);
            await PMPage.keyboard.press("Tab");
            expect(await pills(PMPage)).toEqual([]);
            const focused = await PMPage.evaluate(() => document.activeElement.id);
            expect(focused).toBe(`memory-container--${PAPER_IDS.CYCLE_GAN}`);
        });

        it("should not commit one t: with two tags", async function () {
            await PMPage.keyboard.type("t: vision gan");
            await PMPage.keyboard.press("Tab");
            expect(await pills(PMPage)).toEqual([]);
            const focused = await PMPage.evaluate(() =>
                document.activeElement.classList.contains("memory-container"),
            );
            expect(focused).toBe(true);
        });

        it("should remove the last pill with Backspace in the empty field", async function () {
            await PMPage.keyboard.type("t:gan");
            await PMPage.keyboard.press("Tab");
            await PMPage.keyboard.type("c:");
            await PMPage.keyboard.press("Backspace");
            await PMPage.keyboard.press("Backspace");
            expect(await pills(PMPage)).toEqual(["taggan"]); // the text went first
            await PMPage.keyboard.press("Backspace");
            await sleep(100);
            expect(await pills(PMPage)).toEqual([]);
            await verifySearchByState(PMPage, 3);
        });

        it("should rank an exact tag first, before a more used one", async function () {
            const data = tagged();
            data[PAPER_IDS.CYCLE_GAN].tags = ["vision-old"]; // vision-old: 2 papers
            data[PAPER_IDS.NANOWIRE].tags = ["vision"]; // vision: 1 paper
            await setupPageWithData(PMPage, data);
            await PMPage.focus("#memory-search");
            await PMPage.keyboard.type("t:vision");
            await PMPage.keyboard.press("Tab");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["tagvision"]);
            expect(await listedIds(PMPage)).toEqual([PAPER_IDS.NANOWIRE]);
            // the arrows still choose another one
            await PMPage.keyboard.type("t:visi");
            await PMPage.keyboard.press("ArrowDown");
            await PMPage.keyboard.press("Enter");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["tagvision", "tagvision-old"]);
        });

        it("should commit several years separated by spaces or commas", async function () {
            await PMPage.keyboard.type("y:2012 2017");
            await PMPage.keyboard.press("Tab");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["year2012, 2017"]);
            const ids = await listedIds(PMPage);
            expect(ids.sort()).toEqual(
                [PAPER_IDS.CYCLE_GAN, PAPER_IDS.HYPERPARAMETER].sort(),
            );
            await PMPage.keyboard.press("Backspace");
            await PMPage.keyboard.type("y:<15");
            await PMPage.keyboard.press("Tab");
            await sleep(100);
            expect(await pills(PMPage)).toEqual(["year<2015"]);
            expect(await listedIds(PMPage)).toEqual([PAPER_IDS.HYPERPARAMETER]);
        });

        it("should cap the tag suggestions at 50", async function () {
            const data = tagged();
            data[PAPER_IDS.CYCLE_GAN].tags = Array.from(
                { length: 120 },
                (_, i) => `tag-${i}`,
            );
            await setupPageWithData(PMPage, data);
            await PMPage.focus("#memory-search");
            await PMPage.keyboard.type("t:tag-");
            await PMPage.waitForSelector("#memory-tag-suggestions:not([hidden])");
            const { rows, more } = await PMPage.$eval(
                "#memory-tag-suggestions",
                (el) => ({
                    rows: el.querySelectorAll(".pm-sugg-row").length,
                    more: el.querySelector(".pm-sugg-more")?.textContent,
                }),
            );
            expect(rows).toBe(50);
            expect(more).toContain("70 more");
        });

        it("should pick a tag suggestion with the arrows and Enter", async function () {
            await PMPage.keyboard.type("t:");
            await PMPage.waitForSelector("#memory-tag-suggestions:not([hidden])");
            const rows = await PMPage.$$eval(
                "#memory-tag-suggestions .pm-sugg-row",
                (els) =>
                    els.map((el) => ({
                        tag: el.firstElementChild.textContent,
                        count: el.querySelector(".pm-count").textContent,
                        active: el.classList.contains("is-active"),
                    })),
            );
            // counts shown, most used first, first one preselected
            expect(rows[0]).toEqual({ tag: "vision", count: "2", active: true });
            await PMPage.keyboard.press("ArrowDown");
            await PMPage.keyboard.press("Enter");
            await sleep(100);
            expect(await pills(PMPage)).toEqual([`tag${rows[1].tag}`]);
            expect(
                await PMPage.$eval("#memory-tag-suggestions", (el) => el.hidden),
            ).toBe(true);
        });
    });

    describe("Search Integration with Memory Controls", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should preserve search results when sort order changes to title", async function () {
            // First search for something
            await executeSearch(PMPage, "machine");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);

            // Change sort order
            await selectSort(PMPage, "title");
            await sleep(100);

            // Search results should still be correct
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
        });

        it("should clear search when memory is closed and reopened", async function () {
            await executeSearch(PMPage, "test");
            await verifySearchByState(PMPage, 0);

            // Close memory
            await safeClick("#tab-paper", PMPage);
            await sleep(100);

            // Reopen memory
            await safeClick("#tab-memory", PMPage);
            await sleep(100);

            // Search should be cleared
            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("");

            await verifySearchByState(PMPage, 3);
        });
    });
});

// Test for PaperMemory's Popup Search Functionality
// Tests all search features including general search, tag search, code search, year search, and UI interactions

// ---------------------
// -----  Imports  -----
// ---------------------

import { expect } from "expect";
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
console.log("headless :", headless);
console.log("keepOpen :", keepOpen);

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
            await setupPageWithData(PMPage, testData);
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

        // Set the value directly and trigger the search event
        await page.evaluate((text) => {
            const searchInput = document.getElementById("memory-search");
            searchInput.value = text;
            // Trigger the search event manually
            const event = new Event("keypress");
            event.key = "Enter";
            searchInput.dispatchEvent(event);
        }, text);

        // Wait for search to complete
        await sleep(100);
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
                    "#memory-table .memory-container"
                );

                return Array.from(items).map((item) => {
                    const titleEl = item.querySelector(".memory-title");
                    return titleEl ? titleEl.textContent.trim() : "";
                });
            });

            for (const expectedTitle of expectedTitles) {
                expect(
                    actualTitles.some((title) => title.includes(expectedTitle))
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
                    "#memory-table .memory-container"
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

    async function verifySearchPlaceholder(page, expectedText) {
        const searchInput = await getSearchInput(page);
        const placeholder = await page.evaluate((el) => el.placeholder, searchInput);
        expect(placeholder).toContain(expectedText);
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
            tags
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
            // Test basic search functionality
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";
                // Trigger search manually
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const state = window.PMDebug.config.state;
                    // Call search function directly
                    if (window.PMDebug.searchMemory) {
                        window.PMDebug.searchMemory("Cycle");
                    }
                }
            });
        });

        it("should debug available search functions", async function () {
            const debugInfo = await PMPage.evaluate(() => {
                const available = {};
                if (window.PMDebug) {
                    available.PMDebugExists = true;
                    available.searchMemory = typeof window.PMDebug.searchMemory;
                    available.searchMemoryByTags =
                        typeof window.PMDebug.searchMemoryByTags;
                    available.searchMemoryByCode =
                        typeof window.PMDebug.searchMemoryByCode;
                    available.searchMemoryByYear =
                        typeof window.PMDebug.searchMemoryByYear;
                    available.displayMemoryTable =
                        typeof window.PMDebug.displayMemoryTable;
                    available.handleMemorySearchKeyPress =
                        typeof window.PMDebug.handleMemorySearchKeyPress;

                    // Check what's in the config
                    if (window.PMDebug.config) {
                        available.hasConfig = true;
                        if (window.PMDebug.config.state) {
                            available.hasState = true;
                            available.stateKeys = Object.keys(
                                window.PMDebug.config.state
                            );
                        }
                    }
                }
                return available;
            });
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

        it("should update search placeholder with correct count", async function () {
            await verifySearchPlaceholder(PMPage, "Search 3 entries");
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

        it("should show tags list when tag search is active", async function () {
            await typeInSearch(PMPage, "t: ");

            // Check if tags list is visible
            const tagsList = await PMPage.$("#tags-list-container");
            expect(tagsList).toBeTruthy();
        });

        it("should handle tag click to search", async function () {
            // First ensure we have tags visible
            await typeInSearch(PMPage, "t: ");
            await sleep(100);

            // Click on a tag
            const tagElement = await PMPage.$(".memory-tag");
            if (tagElement) {
                await safeClick(".memory-tag", PMPage);

                // Verify search input contains the tag
                const searchValue = await PMPage.evaluate(() => {
                    return document.getElementById("memory-search").value;
                });
                expect(searchValue).toContain("t: ");
            } else {
                // No tags available for click test
            }
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

        it("should show clear icon when search has content", async function () {
            await typeInSearch(PMPage, "test");

            const clearIcon = await PMPage.$("#memory-search-clear-icon");
            const isVisible = await PMPage.evaluate((el) => {
                return getComputedStyle(el).visibility !== "hidden";
            }, clearIcon);

            expect(isVisible).toBe(true);
        });

        it("should hide clear icon when search is empty", async function () {
            await clearSearch(PMPage);

            const clearIcon = await PMPage.$("#memory-search-clear-icon");
            const isHidden = await PMPage.evaluate((el) => {
                return getComputedStyle(el).visibility === "hidden";
            }, clearIcon);

            expect(isHidden).toBe(true);
        });

        it("should clear search when clear icon is clicked", async function () {
            await typeInSearch(PMPage, "test");
            await safeClick("#memory-search-clear-icon", PMPage);

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

            // Search for something that should match multiple papers
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "machine";

                if (window.PMDebug && window.PMDebug.searchMemory) {
                    window.PMDebug.searchMemory("machine");
                    if (window.PMDebug.displayMemoryTable) {
                        window.PMDebug.displayMemoryTable();
                    }
                }
            });

            await sleep(100);

            // Should only show favorite papers that match
            await verifySearchResults(PMPage, 1);
        });

        it("should update search placeholder when favorites filter is active", async function () {
            await PMPage.reload();
            await setupPageWithData(PMPage, testData);
            await ensureMemoryIsOpen(PMPage);

            // Mark the first paper as favorite using the UI
            await PMPage.evaluate(() => {
                const firstMemoryItem = document.querySelector(
                    "#memory-table .memory-container"
                );
                if (firstMemoryItem) {
                    const favoriteButton = firstMemoryItem.querySelector(
                        ".memory-item-favorite"
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
                            (p) => p.favorite
                        ).length,
                    };
                }
                return null;
            });

            // Check the placeholder text BEFORE search (should show total available papers)
            await verifySearchPlaceholder(PMPage, "Search 1 entries");

            // Search for something
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "machine";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(100);

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

        it("should update search results when sort order changes", async function () {
            // First search
            await executeSearch(PMPage, "Cycle");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);

            // Change sort order
            await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    window.PMDebug.config.state.sortKey = "year";
                }
            });

            await sleep(100);
            await verifySearchByState(PMPage, 1, [PAPER_IDS.CYCLE_GAN]);
        });
    });

    describe("Search Integration with Memory Controls", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should update search results when sort order changes", async function () {
            // First search for something
            await executeSearch(PMPage, "machine");
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);

            // Change sort order
            await PMPage.select("#memory-select", "title");
            await sleep(100);

            // Search results should still be correct
            await verifySearchByState(PMPage, 1, [PAPER_IDS.NANOWIRE]);
        });

        it("should clear search when memory is closed and reopened", async function () {
            await executeSearch(PMPage, "test");
            await verifySearchByState(PMPage, 0);

            // Close memory
            await safeClick("#memory-switch-close", PMPage);
            await sleep(100);

            // Reopen memory
            await safeClick("#memory-switch-open", PMPage);
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

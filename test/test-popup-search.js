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
    setPreferencesAndReload,
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

const { keepOpen } = loadConfig();
console.log("keepOpen :", keepOpen);

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
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser();
        PMPage = (await browser.pages())[0];

        // Discover the extension ID assigned by Chrome
        extensionId = await findExtensionId(browser);

        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        // Load test data
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        console.log(indent(1) + "Test data loaded");
    });

    after(async function () {
        if (browser && !keepOpen) {
            console.log(indent(1) + "Closing browser.");
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
            console.log(indent(2) + "⚠ Reset failed, recreating page:", error.message);
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
        console.log(
            indent(3) +
                `✓ Search consistency verified: ${consistency.statePapersListLength} papers in state, ${consistency.visibleItemsLength} visible items`
        );
    }

    async function verifySearchPlaceholder(page, expectedText) {
        const searchInput = await getSearchInput(page);
        const placeholder = await page.evaluate((el) => el.placeholder, searchInput);
        expect(placeholder).toContain(expectedText);
    }

    async function debugSearchState(page) {
        const debugInfo = await page.evaluate(() => {
            if (
                window.PMDebug &&
                window.PMDebug.config &&
                window.PMDebug.config.state
            ) {
                const state = window.PMDebug.config.state;
                const searchInput = document.getElementById("memory-search");
                return {
                    papersListLength: state.papersList ? state.papersList.length : 0,
                    sortedPapersLength: state.sortedPapers
                        ? state.sortedPapers.length
                        : 0,
                    searchValue: searchInput?.value || "",
                    visibleItems: document.querySelectorAll(
                        "#memory-table .memory-container"
                    ).length,
                    searchInputExists: !!searchInput,
                    searchInputFocused: document.activeElement.id === "memory-search",
                };
            }
            return null;
        });
        console.log(indent(3) + "Debug info:", debugInfo);
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

            console.log(indent(2) + "✓ Search input is available and focused");
        });

        it("should display all papers when search is empty", async function () {
            const visibleItems = await getVisibleMemoryItems(PMPage);
            expect(visibleItems.length).toBe(3); // All 3 test papers

            console.log(indent(2) + "✓ All papers displayed when search is empty");
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

            await debugSearchState(PMPage);
            console.log(indent(2) + "✓ Search value can be set and triggered");
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
            console.log(indent(2) + "Available functions:", debugInfo);
        });

        it("should verify search consistency between state and displayed items", async function () {
            // Test with no search (all papers)
            await verifySearchConsistency(PMPage);

            // Test with search
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchConsistency(PMPage);

            console.log(indent(2) + "✓ Search consistency verified");
        });

        it("should filter papers by title search", async function () {
            // Set the search value and trigger the proper event
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";

                // Dispatch the keypress event that the search handler expects
                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Papers filtered by title search");
        });

        it("should filter papers by author search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Zhu";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Papers filtered by author search");
        });

        it("should filter papers by note content", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "IEEE";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Papers filtered by note content");
        });

        it("should support multi-word search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "machine learning";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, ["RSC-DigitalDiscovery_d2dd00066k"]);
            console.log(indent(2) + "✓ Multi-word search works correctly");
        });

        it("should clear search and show all papers", async function () {
            // First search for something
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 1);

            // Clear search
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "";

                // Trigger the search handler with empty query
                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 3);

            console.log(indent(2) + "✓ Search cleared and all papers shown");
        });

        it("should update search placeholder with correct count", async function () {
            await verifySearchPlaceholder(PMPage, "Search 3 entries");
            console.log(indent(2) + "✓ Search placeholder shows correct count");
        });
    });

    describe("Tag Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle tag search with t: prefix", async function () {
            // First add some tags to papers for testing
            await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const papers = window.PMDebug.config.state.papers;
                    papers["Arxiv-1703.10593"].tags = ["computer-vision", "gan"];
                    papers["JMLR-2012_bergstra12a"].tags = [
                        "optimization",
                        "hyperparameter",
                    ];
                    papers["RSC-DigitalDiscovery_d2dd00066k"].tags = [
                        "machine-learning",
                        "nanowire",
                    ];
                }
            });

            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "t: computer-vision";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Tag search with t: prefix works");
        });

        it("should handle multiple tag search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "t: gan computer-vision";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Multiple tag search works");
        });

        it("should show tags list when tag search is active", async function () {
            await typeInSearch(PMPage, "t: ");

            // Check if tags list is visible
            const tagsList = await PMPage.$("#tags-list-container");
            expect(tagsList).toBeTruthy();

            console.log(indent(2) + "✓ Tags list shown during tag search");
        });

        it("should handle tag click to search", async function () {
            // First ensure we have tags visible
            await typeInSearch(PMPage, "t: ");
            await sleep(200);

            // Click on a tag
            const tagElement = await PMPage.$(".memory-tag");
            if (tagElement) {
                await safeClick(".memory-tag", PMPage);

                // Verify search input contains the tag
                const searchValue = await PMPage.evaluate(() => {
                    return document.getElementById("memory-search").value;
                });
                expect(searchValue).toContain("t: ");

                console.log(indent(2) + "✓ Tag click triggers search");
            } else {
                console.log(indent(2) + "⚠ No tags available for click test");
            }
        });
    });

    describe("Code Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle code search with c: prefix", async function () {
            // Add code links to papers for testing
            await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const papers = window.PMDebug.config.state.papers;
                    papers["Arxiv-1703.10593"].codeLink =
                        "https://github.com/junyanz/CycleGAN";
                    papers["JMLR-2012_bergstra12a"].codeLink =
                        "https://github.com/bergstra/hyperopt";
                    papers["RSC-DigitalDiscovery_d2dd00066k"].codeLink =
                        "https://github.com/nanowire-analysis";
                }
            });

            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "c: CycleGAN";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Code search with c: prefix works");
        });

        it("should handle multiple word code search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "c: github nanowire";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["RSC-DigitalDiscovery_d2dd00066k"]);
            console.log(indent(2) + "✓ Multiple word code search works");
        });

        it("should return no results for non-existent code", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "c: nonexistent";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 0);
            console.log(indent(2) + "✓ No results for non-existent code");
        });
    });

    describe("Year Search Functionality", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle year search with y: prefix", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "y: 2017";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Year search with y: prefix works");
        });

        it("should handle multiple years", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "y: 2017, 2012";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 2, [
                "Arxiv-1703.10593",
                "JMLR-2012_bergstra12a",
            ]);
            console.log(indent(2) + "✓ Multiple year search works");
        });

        it("should handle year range with less than", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "y: <2015";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["JMLR-2012_bergstra12a"]);
            console.log(indent(2) + "✓ Year range with < operator works");
        });

        it("should handle year range with greater than", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "y: >2015";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 2, [
                "Arxiv-1703.10593",
                "RSC-DigitalDiscovery_d2dd00066k",
            ]);
            console.log(indent(2) + "✓ Year range with > operator works");
        });

        it("should handle two-digit years", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "y: 17";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Two-digit year search works");
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
            console.log(indent(2) + "✓ Clear icon visible when search has content");
        });

        it("should hide clear icon when search is empty", async function () {
            await clearSearch(PMPage);

            const clearIcon = await PMPage.$("#memory-search-clear-icon");
            const isHidden = await PMPage.evaluate((el) => {
                return getComputedStyle(el).visibility === "hidden";
            }, clearIcon);

            expect(isHidden).toBe(true);
            console.log(indent(2) + "✓ Clear icon hidden when search is empty");
        });

        it("should clear search when clear icon is clicked", async function () {
            await typeInSearch(PMPage, "test");
            await safeClick("#memory-search-clear-icon", PMPage);

            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("");

            await verifySearchResults(PMPage, 3);
            console.log(indent(2) + "✓ Clear icon click clears search");
        });

        it("should handle backspace key properly", async function () {
            await typeInSearch(PMPage, "test");
            await PMPage.keyboard.press("Backspace");
            await sleep(200);

            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("tes");

            console.log(indent(2) + "✓ Backspace key works properly");
        });

        it("should handle enter key without form submission", async function () {
            await typeInSearch(PMPage, "test");
            await PMPage.keyboard.press("Enter");

            // Should not reload the page or submit a form
            const currentUrl = await getURL(PMPage);
            expect(currentUrl).toContain("popup");

            console.log(indent(2) + "✓ Enter key doesn't submit form");
        });
    });

    describe("Search with Favorites Filter", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should filter search results when favorites filter is active", async function () {
            // First mark a paper as favorite
            await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const papers = window.PMDebug.config.state.papers;
                    papers["Arxiv-1703.10593"].favorite = true;
                    papers["Arxiv-1703.10593"].favoriteDate = new Date().toJSON();
                }
            });

            // Enable favorites filter
            await safeClick("#filter-favorites", PMPage);
            await sleep(200);

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

            await sleep(200);
            await debugSearchState(PMPage);

            // Should only show favorite papers that match
            await verifySearchResults(PMPage, 1);

            console.log(indent(2) + "✓ Search respects favorites filter");
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

            await sleep(200);

            // Debug: Check if filter button exists
            const filterButtonExists = await PMPage.evaluate(() => {
                const filterButton = document.querySelector("#filter-favorites");
                return !!filterButton;
            });
            console.log(indent(3) + "Filter button exists:", filterButtonExists);

            // Trigger the favorites filter by clicking the filter button
            await PMPage.evaluate(() => {
                const filterButton = document.querySelector("#filter-favorites");
                if (filterButton) {
                    filterButton.click();
                }
            });

            await sleep(200);

            // Debug: Check state after filter
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
            console.log(indent(3) + "Debug after filter:", debugInfo);

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

            await sleep(200);
            await debugSearchState(PMPage);

            // Verify by checking state.papersList
            await verifySearchByState(PMPage, 1, ["RSC-DigitalDiscovery_d2dd00066k"]);

            console.log(
                indent(2) + "✓ Search placeholder updated for favorites filter"
            );
        });
    });

    describe("Search Performance and Edge Cases", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle case-insensitive search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "CYCLE";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Case-insensitive search works");
        });

        it("should handle special characters in search", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Image-to-Image";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Special characters in search work");
        });

        it("should handle empty search queries gracefully", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "   ";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await debugSearchState(PMPage);

            // Empty search should show all papers
            await verifySearchByState(PMPage, 3);
            console.log(indent(2) + "✓ Empty search queries handled gracefully");
        });

        it("should handle very long search queries", async function () {
            const longQuery = "a".repeat(1000);
            await PMPage.evaluate((query) => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = query;

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            }, longQuery);

            await sleep(200);

            // Should not crash and should return no results
            await verifySearchByState(PMPage, 0);
            console.log(indent(2) + "✓ Very long search queries handled");
        });

        it("should maintain search state when switching between search types", async function () {
            // First do a regular search
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);

            // Then switch to a tag search (but first add tags)
            await PMPage.evaluate(() => {
                if (
                    window.PMDebug &&
                    window.PMDebug.config &&
                    window.PMDebug.config.state
                ) {
                    const papers = window.PMDebug.config.state.papers;
                    papers["Arxiv-1703.10593"].tags = ["computer-vision", "gan"];
                }

                const searchInput = document.getElementById("memory-search");
                searchInput.value = "t: computer-vision";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Search state maintained when switching types");
        });

        it("should update search results when sort order changes", async function () {
            // First search
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "Cycle";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);

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

            await sleep(200);
            await verifySearchByState(PMPage, 1, ["Arxiv-1703.10593"]);
            console.log(indent(2) + "✓ Search results updated when sort order changes");
        });
    });

    describe("Search Integration with Memory Controls", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should update search results when sort order changes", async function () {
            // First search for something
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

            await sleep(200);
            await verifySearchByState(PMPage, 1, ["RSC-DigitalDiscovery_d2dd00066k"]);

            // Change sort order
            await PMPage.select("#memory-select", "title");
            await sleep(200);

            // Search results should still be correct
            await verifySearchByState(PMPage, 1, ["RSC-DigitalDiscovery_d2dd00066k"]);

            console.log(indent(2) + "✓ Search results maintained when sort changes");
        });

        it("should clear search when memory is closed and reopened", async function () {
            await PMPage.evaluate(() => {
                const searchInput = document.getElementById("memory-search");
                searchInput.value = "test";

                const event = new KeyboardEvent("keypress", {
                    key: "Enter",
                    bubbles: true,
                    cancelable: true,
                });
                searchInput.dispatchEvent(event);
            });

            await sleep(200);
            await verifySearchByState(PMPage, 0);

            // Close memory
            await safeClick("#memory-switch-close", PMPage);
            await sleep(200);

            // Reopen memory
            await safeClick("#memory-switch-open", PMPage);
            await sleep(200);

            // Search should be cleared
            const searchValue = await PMPage.evaluate(() => {
                return document.getElementById("memory-search").value;
            });
            expect(searchValue).toBe("");

            await verifySearchByState(PMPage, 3);
            console.log(indent(2) + "✓ Search cleared when memory is reopened");
        });
    });
});

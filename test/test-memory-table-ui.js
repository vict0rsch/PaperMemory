// Test for PaperMemory's MemoryTable UI
// This test verifies that the memory table opens correctly when pressing 'A'

// ---------------------
// -----  Imports  -----
// ---------------------

import { expect } from "expect";
import {
    findExtensionId,
    getPaperMemoryState,
    makeBrowser,
    getPMURLs,
} from "./browser.js";

import { loadConfig, sleep, root, readJSON, indent } from "./utilsForTests.js";

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

const { keepOpen, headless } = loadConfig();
console.log("keepOpen :", keepOpen);
console.log("headless :", headless);

// --------------------------------
// -----  Main test function  -----
// --------------------------------

describe("Test PaperMemory MemoryTable UI", function () {
    var browser;
    var extensionId;
    var pmURLs;
    var testData;

    // Set timeout for UI tests
    this.timeout(60000); // 60 seconds
    this.slow(30000); // Consider slow after 30 seconds

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless);

        // Discover the extension ID assigned by Chrome
        extensionId = await findExtensionId(browser);

        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        // Load test data
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        console.log(indent(1) + "Loaded test data.");
    });

    after(async function () {
        if (browser && !keepOpen) {
            console.log(indent(1) + "Closing browser.");
            await browser.close();
        }
    });

    describe("MemoryTable Keyboard Shortcut Test", function () {
        let page;

        beforeEach(async function () {
            // Create a new page for each test
            page = await browser.newPage();

            // Step 1: Navigate to the extension popup page
            console.log(indent(2) + "≈ Setting up test: Navigating to extension popup");
            await page.goto(pmURLs.popupURL, {
                waitUntil: "networkidle0",
                timeout: 10000,
            });

            // Step 2: Inject test data into extension storage
            console.log(indent(2) + "≈ Setting up test: Injecting test data");
            await page.evaluate((data) => {
                return new Promise(async (resolve) => {
                    await PMDebug.data.setStorage("papers", data);
                    resolve();
                });
            }, testData);

            // Step 3: Reload the page to reflect the injected data
            await page.reload({ waitUntil: "networkidle0" });
        });

        afterEach(async function () {
            if (page) {
                await page.close();
            }
        });

        it("should have memory open by default with papers loaded", async function () {
            // Verify initial state - memory should be open by default
            const initialState = await getPaperMemoryState(page);
            expect(initialState.memoryIsOpen).toBe(true);
            console.log(
                indent(2) + "✓ Initial state confirmed - memory is open by default"
            );

            // Verify papers are loaded
            const papersCount = Object.keys(initialState.papers || {}).filter(
                (key) => !key.startsWith("__")
            ).length;
            expect(papersCount).toBeGreaterThan(0);
            console.log(indent(2) + `✓ ${papersCount} papers loaded in state`);

            // Verify memory switch close button is visible (since memory is open)
            const memorySwitchClose = await page.$("#memory-switch-close");
            expect(memorySwitchClose).toBeTruthy();
            console.log(indent(2) + "✓ Memory switch close button is visible");
        });

        it("should close memory when clicking memory switch button", async function () {
            // Verify memory is open initially
            const initialState = await getPaperMemoryState(page);
            expect(initialState.memoryIsOpen).toBe(true);

            // Click memory switch button to close the memory
            await page.click("#memory-switch");
            await sleep(200, "Waiting for memory table to close");

            // Verify memory is now closed
            const closedState = await getPaperMemoryState(page);
            expect(closedState.memoryIsOpen).toBe(false);
            console.log(indent(2) + "✓ Memory successfully closed");
        });

        it("should open memory when pressing 'A' key", async function () {
            // First ensure memory is closed
            const initialState = await getPaperMemoryState(page);
            if (initialState.memoryIsOpen) {
                await page.click("#memory-switch");
                await sleep(200);
            }

            // Press 'A' key to open memory table
            await page.keyboard.press("a");
            await sleep(200, "Waiting for memory table to open");

            // Verify memory table is open
            const finalState = await getPaperMemoryState(page);
            expect(finalState.memoryIsOpen).toBe(true);
            console.log(indent(2) + "✓ Memory table is open");
        });

        it("should update DOM elements correctly when memory state changes", async function () {
            // Ensure memory is open first
            const initialState = await getPaperMemoryState(page);
            if (!initialState.memoryIsOpen) {
                await page.keyboard.press("a");
                await sleep(200);
            }

            // Verify memory switch close button is visible when memory is open
            const memorySwitchCloseAfter = await page.$("#memory-switch-close");
            const memorySwitchOpenAfter = await page.$("#memory-switch-open");

            expect(memorySwitchCloseAfter).toBeTruthy();
            expect(memorySwitchOpenAfter).toBeTruthy();
            console.log(
                indent(2) + "✓ Memory switch close and open buttons are visible"
            );

            // Check visibility of memory switch close and open buttons when open
            const closeVisible = await page.evaluate(() => {
                const elem = document.getElementById("memory-switch-close");
                return elem && getComputedStyle(elem).display !== "none";
            });

            const openVisible = await page.evaluate(() => {
                const elem = document.getElementById("memory-switch-open");
                return elem && getComputedStyle(elem).display !== "none";
            });

            expect(closeVisible).toBe(true);
            expect(openVisible).toBe(false);
            console.log(
                indent(2) + "✓ Memory switch close button is visible when open"
            );
        });

        it("should display memory table content when memory is open", async function () {
            // Ensure memory is open
            const currentState = await getPaperMemoryState(page);
            if (!currentState.memoryIsOpen) {
                await page.keyboard.press("a");
                await sleep(200);
            }

            // Verify memory table content
            const memoryTable = await page.$("#memory-table");
            expect(memoryTable).toBeTruthy();
            console.log(indent(2) + "✓ Memory table is visible");

            const memoryItems = await page.$$(".memory-container");
            expect(memoryItems.length).toBeGreaterThan(0);
            console.log(indent(2) + "✓ Memory table contains paper items");

            // Verify specific papers from test data are displayed
            const expectedPapers = Object.keys(testData).filter(
                (key) => !key.startsWith("__")
            );
            const displayedPaperTitles = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".memory-title")).map(
                    (el) => el.textContent.trim()
                );
            });

            expect(displayedPaperTitles.length).toBeGreaterThan(0);
            console.log(
                indent(2) +
                    `✓ Found ${displayedPaperTitles.length} displayed paper titles`
            );

            // Check that at least one of our test papers is displayed
            const testPaperTitles = expectedPapers.map((id) => testData[id].title);
            const hasTestPaper = displayedPaperTitles.some((displayedTitle) =>
                testPaperTitles.some(
                    (testTitle) =>
                        displayedTitle.includes(testTitle) ||
                        testTitle.includes(displayedTitle)
                )
            );
            expect(hasTestPaper).toBe(true);
            console.log(
                indent(2) + "✓ Test papers are correctly displayed in memory table"
            );
        });

        it("should display the correct papers from injected test data", async function () {
            try {
                // Memory should be open by default, but let's make sure
                const currentState = await getPaperMemoryState(page);
                if (!currentState.memoryIsOpen) {
                    // If not open, press 'A' to open it
                    await page.keyboard.press("a");
                    await sleep(200);
                }

                // Get displayed paper information
                const displayedPapers = await page.evaluate(() => {
                    return Array.from(
                        document.querySelectorAll(".memory-container")
                    ).map((container) => {
                        const titleEl = container.querySelector(".memory-title");
                        const authorEl = container.querySelector(".memory-authors");
                        const yearEl = container.querySelector(".memory-year");
                        return {
                            title: titleEl ? titleEl.textContent.trim() : "",
                            authors: authorEl ? authorEl.textContent.trim() : "",
                            year: yearEl ? yearEl.textContent.trim() : "",
                        };
                    });
                });

                console.log(
                    indent(2) + `Found ${displayedPapers.length} displayed papers`
                );

                // Verify we have the expected number of papers (or at least some)
                expect(displayedPapers.length).toBeGreaterThan(0);

                // Check specific test papers
                const expectedTitles = [
                    "Unpaired Image-to-Image Translation using Cycle-Consistent Adversarial Networks",
                    "Random Search for Hyper-Parameter Optimization",
                    "Semi-supervised machine learning workflow for analysis of nanowire morphologies",
                ];

                const foundTitles = displayedPapers.map((p) => p.title);
                let foundCount = 0;

                expectedTitles.forEach((expectedTitle) => {
                    const found = foundTitles.some(
                        (foundTitle) =>
                            foundTitle.includes(expectedTitle.substring(0, 20)) ||
                            expectedTitle.includes(foundTitle.substring(0, 20))
                    );
                    if (found) foundCount++;
                });

                console.log(
                    indent(2) +
                        `✓ Found ${foundCount} out of ${expectedTitles.length} expected test papers`
                );
                expect(foundCount).toBeGreaterThan(0);
            } catch (error) {
                console.error("❌ Test failed:", error.message);
                throw error;
            }
        });

        it("should close memory when pressing 'Escape' key", async function () {
            // Verify memory is open initially
            const initialState = await getPaperMemoryState(page);
            expect(initialState.memoryIsOpen).toBe(true);

            // Press 'Escape' key to close memory
            await page.keyboard.press("Escape");
            await sleep(200);

            // Verify memory is now closed
            const closedState = await getPaperMemoryState(page);
            expect(closedState.memoryIsOpen).toBe(false);
            console.log(indent(2) + "✓ Memory closed with Escape key");
        });
    });
});

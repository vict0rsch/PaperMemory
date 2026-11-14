// Test for PaperMemory's MemoryTable UI
// This test verifies that the memory table opens correctly when pressing 'A'

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
} from "./browser.js";

import { loadConfig, sleep, root, readJSON, indent } from "./utilsForTests.js";

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

const { keepOpen, headless } = loadConfig();
console.log(`\n${basename(import.meta.url)} args:`);
console.log("  keepOpen :", keepOpen);
console.log("  headless :", headless);

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
            await page.waitForFunction(() => window.__pmPopupReady === true, {
                timeout: 10000,
            });
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
                indent(2) + "✓ Initial state confirmed - memory is open by default",
            );

            // Verify papers are loaded
            const papersCount = Object.keys(initialState.papers || {}).filter(
                (key) => !key.startsWith("__"),
            ).length;
            expect(papersCount).toBeGreaterThan(0);
            console.log(indent(2) + `✓ ${papersCount} papers loaded in state`);

            // Verify the Memory tab is the selected one (since memory is open)
            const memoryTabSelected = await page.$eval("#tab-memory", (el) =>
                el.getAttribute("aria-selected"),
            );
            expect(memoryTabSelected).toBe("true");
            console.log(indent(2) + "✓ Memory tab is selected");
        });

        it("should close memory when clicking memory switch button", async function () {
            // Verify memory is open initially
            const initialState = await getPaperMemoryState(page);
            expect(initialState.memoryIsOpen).toBe(true);

            // Click the Paper tab to close the memory
            await page.click("#tab-paper");
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
                await page.click("#tab-paper");
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

            // Both tabs are visible; the Memory tab is selected when memory is open
            const tabs = await page.evaluate(() =>
                ["tab-paper", "tab-memory"].map((id) => {
                    const elem = document.getElementById(id);
                    return {
                        visible: !!elem && getComputedStyle(elem).display !== "none",
                        selected: elem?.getAttribute("aria-selected"),
                    };
                }),
            );

            expect(tabs[0]).toEqual({ visible: true, selected: "false" });
            expect(tabs[1]).toEqual({ visible: true, selected: "true" });
            console.log(indent(2) + "✓ Memory tab is selected when open");

            // the same key closes the memory again (when not typing in the search field)
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press("a");
            await sleep(200);
            expect((await getPaperMemoryState(page)).memoryIsOpen).toBe(false);
            expect(
                await page.$eval("#tab-paper", (el) => el.getAttribute("aria-selected")),
            ).toBe("true");
            await page.keyboard.press("a");
            await sleep(200);
            console.log(indent(2) + "✓ 'a' toggles the memory");
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
                (key) => !key.startsWith("__"),
            );
            const displayedPaperTitles = await page.evaluate(() => {
                return Array.from(document.querySelectorAll(".memory-title")).map(
                    (el) => el.textContent.trim(),
                );
            });

            expect(displayedPaperTitles.length).toBeGreaterThan(0);
            console.log(
                indent(2) +
                    `✓ Found ${displayedPaperTitles.length} displayed paper titles`,
            );

            // Check that at least one of our test papers is displayed
            const testPaperTitles = expectedPapers.map((id) => testData[id].title);
            const hasTestPaper = displayedPaperTitles.some((displayedTitle) =>
                testPaperTitles.some(
                    (testTitle) =>
                        displayedTitle.includes(testTitle) ||
                        testTitle.includes(displayedTitle),
                ),
            );
            expect(hasTestPaper).toBe(true);
            console.log(
                indent(2) + "✓ Test papers are correctly displayed in memory table",
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
                        document.querySelectorAll(".memory-container"),
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
                    indent(2) + `Found ${displayedPapers.length} displayed papers`,
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
                            expectedTitle.includes(foundTitle.substring(0, 20)),
                    );
                    if (found) foundCount++;
                });

                console.log(
                    indent(2) +
                        `✓ Found ${foundCount} out of ${expectedTitles.length} expected test papers`,
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

    describe("Memory rows: venue line and Info panel", function () {
        let page;
        const CG = "Arxiv-1703.10593";
        const rowSel = (id) => `#memory-container--${id.replaceAll(".", "\\.")}`;

        /** Opens the popup's Memory with the test papers (patched) */
        const openWith = async (patch = (d) => d) => {
            page = await browser.newPage();
            await page.setViewport({ width: 450, height: 600 });
            await page.goto(pmURLs.popupURL, { waitUntil: "networkidle0" });
            await page.evaluate(
                (data) => PMDebug.data.setStorage("papers", data),
                patch(structuredClone(testData)),
            );
            await page.reload({ waitUntil: "networkidle0" });
            await page.waitForFunction(() => window.__pmPopupReady === true, {
                timeout: 10000,
            });
            if (!(await getPaperMemoryState(page)).memoryIsOpen) {
                await page.keyboard.press("a");
                await sleep(200);
            }
        };
        /** A row's lines and its Info panel (null when closed) */
        const rowInfo = (id) =>
            page.evaluate((sel) => {
                const row = document.querySelector(sel);
                const panel = row.querySelector(".pm-info-pop");
                const btn = row.querySelector(".memory-item-info");
                const box = document.getElementById("memory-scroll").getBoundingClientRect();
                const r = panel?.getBoundingClientRect();
                return {
                    meta: row.querySelector(".memory-authors").textContent,
                    venue: row.querySelector(".memory-venue")?.textContent ?? null,
                    height: row.getBoundingClientRect().height,
                    expanded: btn.getAttribute("aria-expanded"),
                    describedBy: row.getAttribute("aria-describedby"),
                    panel: panel && {
                        role: panel.getAttribute("role"),
                        up: panel.classList.contains("is-up"),
                        inside:
                            r.top >= box.top &&
                            r.bottom <= box.bottom &&
                            r.left >= 0 &&
                            r.right <= 450,
                        fields: Object.fromEntries(
                            [...panel.querySelectorAll("dt")].map((dt) => [
                                dt.textContent,
                                dt.nextElementSibling.textContent,
                            ]),
                        ),
                    },
                };
            }, rowSel(id));

        afterEach(async function () {
            await page?.close();
        });

        it("should show the venue line only with a venue, and the year after the authors otherwise", async function () {
            await openWith((d) => {
                d["RSC-DigitalDiscovery_d2dd00066k"].venue = "";
                return d;
            });
            const cg = await rowInfo(CG);
            expect(cg.venue).toBe("ICCV 2017");
            expect(cg.meta).toBe("Zhu, Park, Isola +1");
            const jmlr = await rowInfo("JMLR-2012_bergstra12a");
            expect(jmlr.venue).toBe("JMLR 2012");
            const preprint = await rowInfo("RSC-DigitalDiscovery_d2dd00066k");
            expect(preprint.venue).toBe(null);
            expect(preprint.meta).toBe("Lu, Montz, Emrick +1 · 2022");
            // the source / ID is in no row line
            const text = await page.$eval("#memory-table", (el) => el.innerText);
            expect(text).not.toContain("1703.10593");
        });

        it("should open the Info panel on ⓘ click without changing the row height", async function () {
            await openWith();
            const before = await rowInfo(CG);
            expect(before.panel).toBe(null);
            await page.click(`${rowSel(CG)} .memory-item-info`);
            const open = await rowInfo(CG);
            expect(open.panel.role).toBe("dialog");
            expect(open.expanded).toBe("true");
            expect(open.describedBy).toBeTruthy();
            expect(open.height).toBe(before.height);
            expect(open.panel.inside).toBe(true);
            expect(Object.keys(open.panel.fields)).toEqual([
                "Added",
                "Last opened",
                "Visits",
                "Source",
                "Publication",
                "Citation key",
            ]);
            expect(open.panel.fields.Source).toBe("arXiv 1703.10593");
            expect(open.panel.fields.Publication).toBe(
                "International Conference on Computer Vision (ICCV) 2017",
            );
            // second click closes
            await page.click(`${rowSel(CG)} .memory-item-info`);
            const closed = await rowInfo(CG);
            expect(closed.panel).toBe(null);
            expect(closed.expanded).toBe("false");
            expect(closed.describedBy).toBe(null);
            // a click outside closes
            await page.click(`${rowSel(CG)} .memory-item-info`);
            await page.click("#memory-search");
            expect((await rowInfo(CG)).panel).toBe(null);
        });

        it("should toggle the Info panel with 'd' on the focused row and close it when the focus moves", async function () {
            await openWith((d) => {
                d["RSC-DigitalDiscovery_d2dd00066k"].venue = "";
                return d;
            });
            await page.focus(rowSel(CG));
            await page.keyboard.press("d");
            expect((await rowInfo(CG)).panel).not.toBe(null);
            expect(await page.evaluate(() => document.activeElement.id)).toBe(
                `memory-container--${CG}`,
            );
            await page.keyboard.press("d");
            expect((await rowInfo(CG)).panel).toBe(null);
            // Tab to another row closes it; that row's d opens its own
            await page.keyboard.press("d");
            const ids = await page.$$eval("#memory-table .memory-container", (els) =>
                els.map((el) => el.id.split("--")[1]),
            );
            const next = ids[ids.indexOf(CG) + 1] ?? ids[ids.indexOf(CG) - 1];
            await page.focus(rowSel(next));
            expect((await rowInfo(CG)).panel).toBe(null);
            expect(await page.$$eval(".pm-info-pop", (els) => els.length)).toBe(0);
            // no venue: no Publication
            await page.focus(rowSel("RSC-DigitalDiscovery_d2dd00066k"));
            await page.keyboard.press("d");
            const rsc = await rowInfo("RSC-DigitalDiscovery_d2dd00066k");
            expect(rsc.panel.fields.Publication).toBeUndefined();
            expect(rsc.panel.inside).toBe(true);
        });

        it("should open upward at the bottom edge and show the PDF file when there is one", async function () {
            await openWith();
            const last = await page.$eval("#memory-table .memory-container:last-child", (el) =>
                el.id.split("--").slice(1).join("--"),
            );
            await page.evaluate((id) => {
                PMDebug.config.state.files[id] = { id: 1, filename: "PaperMemoryStore/x.pdf" };
            }, last);
            await page.focus(rowSel(last));
            await page.keyboard.press("d");
            const info = await rowInfo(last);
            expect(info.panel.up).toBe(true);
            expect(info.panel.inside).toBe(true);
            expect(info.panel.fields["PDF file"]).toBe("PaperMemoryStore/x.pdf");
        });

        it("should cap a panel taller than the room left and scroll inside it", async function () {
            await openWith((d) => {
                d[CG].venueFull = Array.from({ length: 40 }, (_, i) => `Word${i}`).join(" ");
                return d;
            });
            await page.evaluate((id) => {
                PMDebug.config.state.files[id] = {
                    id: 1,
                    filename: `PaperMemoryStore/${"very long file name ".repeat(30)}.pdf`,
                };
            }, CG);
            await page.focus(rowSel(CG));
            await page.keyboard.press("d");
            const panel = await page.$eval(`${rowSel(CG)} .pm-info-pop`, (el) => {
                const r = el.getBoundingClientRect();
                const box = document.getElementById("memory-scroll").getBoundingClientRect();
                return {
                    inside: r.top >= box.top && r.bottom <= box.bottom,
                    scrolls: el.scrollHeight > el.clientHeight,
                    focusable: el.tabIndex === 0,
                };
            });
            expect(panel).toEqual({ inside: true, scrolls: true, focusable: true });
        });

        it("should show our tooltip (name + key) on icon-only controls, inside the popup", async function () {
            await openWith();
            const hover = async (sel) => {
                await page.hover(sel);
                return page.evaluate(() => {
                    const tip = document.querySelector(".pm-tip-float");
                    const r = tip?.getBoundingClientRect();
                    return {
                        shown: !!tip && !tip.hidden,
                        text: tip?.textContent,
                        inside: !!r && r.left >= 0 && r.top >= 0 && r.right <= 450 && r.bottom <= 600,
                    };
                });
            };
            expect(await hover("#menu-switch")).toEqual({
                shown: true,
                text: "Settings p",
                inside: true,
            });
            expect(await hover("#memory-tags-button")).toMatchObject({
                text: "Browse tags",
                inside: true,
            });
            const last = "#memory-table .memory-container:last-child";
            expect(await hover(`${last} .memory-delete`)).toMatchObject({
                text: "Delete ⌫",
                inside: true,
            });
            expect(await hover(`${last} .memory-item-info`)).toMatchObject({
                text: "Info d",
                inside: true,
            });
            // no native title next to our tooltip; the name stays in aria-label
            const titled = await page.$$eval("[data-tip]", (els) =>
                els.filter(
                    (el) =>
                        el.hasAttribute("title") ||
                        (el.tagName === "BUTTON" && !el.getAttribute("aria-label")),
                ).length,
            );
            expect(titled).toBe(0);
            await page.mouse.move(5, 300);
            expect((await page.$eval(".pm-tip-float", (el) => el.hidden))).toBe(true);
        });
    });

    describe("Memory rows: round 2 (clear ×, edit keys, +N, time tooltip)", function () {
        let page;
        const CG = "Arxiv-1703.10593";
        const rowSel = (id) => `#memory-container--${id.replaceAll(".", "\\.")}`;
        const open = async () => {
            page = await browser.newPage();
            await page.setViewport({ width: 450, height: 600 });
            await page.goto(pmURLs.popupURL, { waitUntil: "networkidle0" });
            await page.evaluate((data) => PMDebug.data.setStorage("papers", data), testData);
            await page.reload({ waitUntil: "networkidle0" });
            await page.waitForFunction(() => window.__pmPopupReady === true, { timeout: 10000 });
            if (!(await getPaperMemoryState(page)).memoryIsOpen) {
                await page.keyboard.press("a");
                await sleep(200);
            }
        };
        afterEach(async function () {
            await page?.close();
        });
        const xHidden = () => page.$eval("#memory-search-x", (el) => el.hidden);

        it("should show the × only with text or pills, and clear both", async function () {
            await open();
            expect(await xHidden()).toBe(true);
            await page.focus("#memory-search");
            await page.keyboard.type("unpaired");
            expect(await xHidden()).toBe(false);
            await page.click("#memory-search-x");
            expect(await page.$eval("#memory-search", (el) => el.value)).toBe("");
            expect(await xHidden()).toBe(true);
            // pills only (year + favourites), no text
            await page.evaluate(() => {
                PMDebug.memory.addFilter({ type: "year", value: ">2000" });
                PMDebug.memory.addFilter({ type: "fav", value: "" });
            });
            expect(await xHidden()).toBe(false);
            await page.click("#memory-search-x");
            const after = await page.evaluate(() => ({
                filters: PMDebug.config.state.memoryFilters.length,
                fav: document.getElementById("filter-favorites").getAttribute("aria-pressed"),
                focused: document.activeElement.id,
                tip: document.getElementById("memory-search-x").dataset.tip,
            }));
            expect(after).toEqual({
                filters: 0,
                fav: "false",
                focused: "memory-search",
                tip: "Clear search",
            });
            expect(await xHidden()).toBe(true);
        });

        it("should save and close the row edit form with Ctrl+↵ from the Done button and from the row, and close it with Esc", async function () {
            await open();
            const isEdit = () =>
                page.$eval(rowSel(CG), (el) => el.classList.contains("is-edit"));
            const ctrlEnter = async () => {
                await page.keyboard.down("Control");
                await page.keyboard.press("Enter");
                await page.keyboard.up("Control");
                await sleep(150);
            };
            await page.focus(rowSel(CG));
            await page.keyboard.press("e");
            expect(await isEdit()).toBe(true);
            await page.focus(`${rowSel(CG)} .memory-edit-done`);
            await ctrlEnter();
            expect(await isEdit()).toBe(false);

            await page.focus(rowSel(CG));
            await page.keyboard.press("e");
            await page.focus(rowSel(CG)); // the row itself, outside the form
            await ctrlEnter();
            expect(await isEdit()).toBe(false);

            await page.focus(rowSel(CG));
            await page.keyboard.press("e");
            await page.evaluate(() => document.activeElement.blur()); // nothing focused
            await page.keyboard.press("Escape");
            await sleep(150);
            expect(await isEdit()).toBe(false);
            expect((await getPaperMemoryState(page)).memoryIsOpen).toBe(true);

            // typing in a field still does not trigger row shortcuts
            await page.focus(rowSel(CG));
            await page.keyboard.press("e");
            await page.keyboard.type("d");
            expect(await page.$$eval(".pm-info-pop", (els) => els.length)).toBe(0);
            expect(await isEdit()).toBe(true);
        });

        it("should ignore Ctrl+↵ while an IME composes, and let Esc close an open Info panel before the editor", async function () {
            await open();
            const isEdit = () =>
                page.$eval(rowSel(CG), (el) => el.classList.contains("is-edit"));
            await page.focus(rowSel(CG));
            await page.keyboard.press("e");
            await page.focus(rowSel(CG));
            await page.evaluate(() =>
                document.activeElement.dispatchEvent(
                    new KeyboardEvent("keydown", {
                        key: "Enter",
                        ctrlKey: true,
                        isComposing: true,
                        bubbles: true,
                    }),
                ),
            );
            await sleep(150);
            expect(await isEdit()).toBe(true);
            // another row's Info panel open: the first Esc closes only the panel
            const other = await page.$eval(
                "#memory-table .memory-container:not(.is-edit)",
                (el) => el.id,
            );
            await page.click(`#${other.replaceAll(".", "\\.")} .memory-item-info`);
            expect(await page.$$eval(".pm-info-pop", (els) => els.length)).toBe(1);
            await page.keyboard.press("Escape");
            expect(await page.$$eval(".pm-info-pop", (els) => els.length)).toBe(0);
            expect(await isEdit()).toBe(true);
            await page.keyboard.press("Escape");
            await sleep(150);
            expect(await isEdit()).toBe(false);
        });

        it("should expand the authors on '+N' click and with '+', keeping the year", async function () {
            await open();
            const meta = (id) => page.$eval(`${rowSel(id)} .memory-authors`, (el) => el.textContent);
            const before = await page.$eval(rowSel(CG), (el) => el.getBoundingClientRect().height);
            await page.click(`${rowSel(CG)} .pm-item-authors-more`);
            expect(await meta(CG)).toBe("Jun-Yan Zhu, Taesung Park, Phillip Isola, Alexei A. Efros");
            const after = await page.$eval(rowSel(CG), (el) => el.getBoundingClientRect().height);
            expect(after).toBeGreaterThanOrEqual(before);
            // a preprint: the year stays after the full list
            await page.evaluate(() => {
                PMDebug.config.state.papers["RSC-DigitalDiscovery_d2dd00066k"].venue = "";
                PMDebug.memory.applyMemorySearch();
            });
            await page.focus(rowSel("RSC-DigitalDiscovery_d2dd00066k"));
            await page.keyboard.press("+");
            expect(await meta("RSC-DigitalDiscovery_d2dd00066k")).toBe(
                "Shizhao Lu, Brian Montz, Todd Emrick, Arthi Jayaraman · 2022",
            );
        });

        it("should give the last-opened time our tooltip with the full date", async function () {
            await open();
            const time = await page.$eval(`${rowSel(CG)} time`, (el) => ({
                tip: el.dataset.tip,
                label: el.getAttribute("aria-label"),
                title: el.hasAttribute("title"),
            }));
            expect(time.tip).toMatch(/^Last opened \d{1,2} \w{3} \d{4}, \d{2}:\d{2}$/);
            expect(time.label).toBe(time.tip);
            expect(time.title).toBe(false);
            await page.hover(`${rowSel(CG)} time`);
            expect(await page.$eval(".pm-tip-float", (el) => el.textContent)).toBe(time.tip);
        });
    });

    describe("fullMemory rows: Info panel and tag click", function () {
        let page;
        afterEach(async function () {
            await page?.close();
        });
        const openFull = async () => {
            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 900 });
            await page.goto(pmURLs.popupURL, { waitUntil: "networkidle0" });
            await page.evaluate((data) => PMDebug.data.setStorage("papers", data), testData);
            await page.goto(pmURLs.fullMemoryURL, { waitUntil: "networkidle0" });
            await page.waitForSelector("#memory-table .memory-container");
        };

        it("should toggle the focused row's Info panel with 'd'", async function () {
            await openFull();
            await page.focus("#memory-table .memory-container");
            await page.keyboard.press("d");
            expect(await page.$$eval("#memory-table .pm-info-pop", (els) => els.length)).toBe(1);
            await page.keyboard.press("d");
            expect(await page.$$eval("#memory-table .pm-info-pop", (els) => els.length)).toBe(0);
            await page.keyboard.press("d");
            await page.keyboard.press("Escape");
            expect(await page.$$eval("#memory-table .pm-info-pop", (els) => els.length)).toBe(0);
        });

        it("should replace the search with the clicked tag (favourites cleared)", async function () {
            await openFull();
            await page.evaluate(() => {
                const p = PMDebug.config.state.papers["Arxiv-1703.10593"];
                p.tags = ["gan"];
                p.favorite = true;
                PMDebug.memory.addFilter({ type: "fav", value: "" });
                document.getElementById("memory-search").value = "unpaired";
                PMDebug.memory.applyMemorySearch();
            });
            await page.evaluate(() => document.querySelector(".memory-tag").click());
            const after = await page.evaluate(() => ({
                filters: PMDebug.config.state.memoryFilters,
                text: document.getElementById("memory-search").value,
                fav: document.getElementById("filter-favorites").getAttribute("aria-pressed"),
                rows: document.querySelectorAll("#memory-table .memory-container").length,
            }));
            expect(after).toEqual({ filters: [], text: "t:gan", fav: "false", rows: 1 });
        });

        it("should save and close a row editor with Ctrl+↵ and close it with Esc, wherever the focus is", async function () {
            await openFull();
            const row = "#memory-table .memory-container";
            const isEdit = () => page.$eval(row, (el) => el.classList.contains("is-edit"));
            await page.click(`${row} .memory-item-edit`);
            expect(await isEdit()).toBe(true);
            await page.focus(row); // the row, outside the form
            await page.keyboard.down("Control");
            await page.keyboard.press("Enter");
            await page.keyboard.up("Control");
            await sleep(150);
            expect(await isEdit()).toBe(false);
            await page.click(`${row} .memory-item-edit`);
            await page.evaluate(() => document.activeElement.blur());
            await page.keyboard.press("Escape");
            await sleep(150);
            expect(await isEdit()).toBe(false);
        });
    });
});

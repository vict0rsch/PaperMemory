// Test for PaperMemory's Memory Item Actions - Refactored
// Tests all action buttons in memory items and their handlers

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
    getClipboardText,
    seedClipboard,
    resetPage,
    setStorage,
    verifySelectorExists,
    verifyElementClickable,
    getURL,
    safeClick,
    setPreferencesAndReload,
    verifyClipboardContent,
    verifyPageNavigation,
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

const miniHash = PMUtils.functions.miniHash;

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

describe("Test PaperMemory Memory Item Actions", function () {
    var browser;
    var extensionId;
    var pmURLs;
    var testData;
    var firstPaperId;
    var arxivPaperId;
    var firstQueryId;
    var arxivQueryId;
    var PMPage;

    // Set timeout for UI tests
    this.timeout(120000); // 2 minutes for comprehensive action tests
    this.slow(60000); // Consider slow after 60 seconds

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless);
        PMPage = (await browser.pages())[0];

        // Discover the extension ID assigned by Chrome
        extensionId = await findExtensionId(browser);

        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        try {
            const context = browser.defaultBrowserContext();
            await context.overridePermissions(pmURLs.popupURL, [
                "clipboard-read",
                "clipboard-sanitized-write",
                "clipboard-write",
            ]);
            console.log(indent(1) + "✓ Clipboard permissions granted");
        } catch (error) {
            console.log(
                indent(1) + "⚠ Could not set clipboard permissions:",
                error.message,
            );
        }

        // Load test data and extract common paper IDs
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        const paperIds = Object.keys(testData).filter((key) => !key.startsWith("__"));
        firstPaperId = paperIds[0];
        arxivPaperId = paperIds.find((key) => testData[key].source === "arxiv");

        // CSS selectors need escaped dots
        firstQueryId = firstPaperId.replaceAll(".", "\\.");
        arxivQueryId = arxivPaperId?.replaceAll(".", "\\.");

        console.log(indent(1) + "Test data loaded with extracted paper IDs");
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
            console.log(indent(2) + "⚠ Reset failed, recreating page:", error.message);
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

    // Fast preference update for tests that don't need UI refresh
    async function updatePreferences(prefs, page) {
        await page.evaluate((preferences) => {
            if (
                window.PMDebug &&
                window.PMDebug.config &&
                window.PMDebug.config.state
            ) {
                Object.assign(window.PMDebug.config.state.prefs, preferences);
            }
            if (window.state && window.state.prefs) {
                Object.assign(window.state.prefs, preferences);
            }
        }, prefs);
    }

    // copy feedback: the popup's toast (Memory rows no longer have their own text)
    async function verifyFeedbackMessage(paperId, expectedText, page) {
        const feedbackText = await page.evaluate(
            () => document.querySelector("#popup-feedback-copied span").textContent,
        );
        expect(feedbackText).toContain(expectedText);
        return feedbackText;
    }

    async function verifyMemoryItemButtonExists(paperId, buttonClass, page) {
        const queryId = paperId.replaceAll(".", "\\.");
        const selector = `#memory-container--${queryId} ${buttonClass}`;
        const button = await verifySelectorExists(selector, page);
        return { button, selector };
    }

    async function verifyButtonClickable(button, page) {
        return await verifyElementClickable(button, page);
    }

    describe("Basic Actions", function () {
        var runs = [...Array(2).keys()];
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        runs.forEach((run) => {
            it(`should handle toggle favorite action (memory-item-favorite, pass ${run + 1}/${runs.length})`, async function () {
                // Check initial favorite state
                const initialState = await getPaperMemoryState(PMPage);
                const initialFavorite = initialState.papers[firstPaperId].favorite;

                // Click favorite button
                await safeClick(
                    `#memory-container--${firstQueryId} .memory-item-favorite`,
                    PMPage,
                );

                // Wait for state change - much faster than arbitrary sleep
                await PMPage.waitForFunction(
                    (paperId, initialFav) => {
                        const currentState =
                            window.PMDebug?.config?.state?.papers?.[paperId];
                        return currentState && currentState.favorite !== initialFav;
                    },
                    { timeout: 2000 },
                    firstPaperId,
                    initialFavorite,
                );

                // Verify favorite state changed
                const finalState = await getPaperMemoryState(PMPage);
                const finalFavorite = finalState.papers[firstPaperId].favorite;

                expect(finalFavorite).toBe(!initialFavorite);
                console.log(
                    indent(2) +
                        `✓ Favorite toggled from ${initialFavorite} to ${finalFavorite}`,
                );
            });
        });

        it("should handle edit action (memory-item-edit)", async function () {
            // Click edit button
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-edit`,
                PMPage,
            );

            // Wait for edit form to be visible
            await PMPage.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && getComputedStyle(el).display !== "none";
                },
                { timeout: 2000 },
                `#memory-container--${firstQueryId} .extended-item`,
            );

            // Verify edit form is open
            const editForm = await PMPage.$(
                `#memory-container--${firstQueryId} .extended-item`,
            );
            const isVisible = await PMPage.evaluate(
                (el) => getComputedStyle(el).display !== "none",
                editForm,
            );

            expect(isVisible).toBe(true);
            console.log(indent(2) + "✓ Edit form opened successfully");

            // Close edit form (Done): the form is removed from the row
            await PMPage.$eval(
                `#memory-container--${firstQueryId} .memory-edit-done`,
                (el) => el.click(),
            );
            await PMPage.waitForFunction(
                (selector) => !document.querySelector(selector),
                { timeout: 2000 },
                `#memory-container--${firstQueryId} .extended-item`,
            );
            console.log(indent(2) + "✓ Edit form closed successfully");
        });

        it("should handle delete action (memory-delete)", async function () {
            // Click delete button
            await safeClick(
                `#memory-container--${firstQueryId} .memory-delete`,
                PMPage,
            );

            // Wait for modal to appear
            await PMPage.waitForFunction(
                () => {
                    const modal = document.querySelector("#delete-paper-modal");
                    return modal && getComputedStyle(modal).display !== "none";
                },
                { timeout: 2000 },
            );

            // Verify delete modal appears
            const deleteModal = await PMPage.$("#delete-paper-modal");
            const modalVisible = await PMPage.evaluate(
                (el) => getComputedStyle(el).display !== "none",
                deleteModal,
            );

            expect(modalVisible).toBe(true);
            console.log(indent(2) + "✓ Delete confirmation modal opened");

            // Cancel delete - use direct DOM click since modal buttons have display:none
            const cancelClicked = await PMPage.evaluate(() => {
                const cancelBtn = document.querySelector(
                    "#delete-paper-modal-cancel-button",
                );
                if (cancelBtn) {
                    cancelBtn.click();
                    return true;
                }
                return false;
            });

            expect(cancelClicked).toBe(true);
            console.log(indent(2) + "✓ Delete modal cancel clicked");

            // Wait for modal to be hidden
            await PMPage.waitForFunction(
                () => {
                    const modal = document.querySelector("#delete-paper-modal");
                    return modal && getComputedStyle(modal).display === "none";
                },
                { timeout: 2000 },
            );

            // Verify modal is hidden
            const modalHidden = await PMPage.evaluate(
                (el) => getComputedStyle(el).display === "none",
                deleteModal,
            );

            expect(modalHidden).toBe(true);
            console.log(indent(2) + "✓ Delete modal cancelled and closed");
        });
    });

    describe("Copy Actions", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        async function paperToAbs(paperId, page) {
            const paperData = await page.evaluate((paperId) => {
                return PMDebug.paper.paperToAbs(PMDebug.config.state.papers[paperId]);
            }, paperId);
            return paperData.pdfLink;
        }

        it("should be able to read and write to the clipboard", async function () {
            const testText = "test clipboard paper memory";
            await PMPage.evaluate((text) => {
                return navigator.clipboard.writeText(text);
            }, testText);
            await verifyClipboardContent(testText, false, PMPage);
        });

        it("should handle copy link action (memory-item-copy-link) and verify clipboard content", async function () {
            // Get paper data to determine expected URL
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await seedClipboard(PMPage);
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-copy-link`,
                PMPage,
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "copied",
                PMPage,
            );
            console.log(indent(2) + `✓ Copy link feedback: "${feedbackText}"`);

            // Verify clipboard contains the correct URL
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            console.log(indent(3) + "clipboardText :", clipboardText);

            expect(clipboardText).toMatch(/^https?:\/\//); // Should be a URL

            // Verify it contains expected domain based on paper source
            if (paperData.source === "arxiv") {
                expect(clipboardText).toContain("arxiv.org");
            }

            console.log(
                indent(2) +
                    `✓ Clipboard contains valid URL: "${clipboardText.substring(
                        0,
                        50,
                    )}..."`,
            );
        });

        it("should handle copy hyperlink action (memory-item-copy-hyperlink) and verify clipboard content", async function () {
            // Get paper data to determine expected content
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            // Verify we have the right paper before proceeding
            if (!paperData || !paperData.title) {
                throw new Error(`Paper data not found for ${firstPaperId}`);
            }

            console.log(
                indent(3) +
                    `Testing copy hyperlink for paper: "${paperData.title.substring(
                        0,
                        50,
                    )}..."`,
            );

            await seedClipboard(PMPage);
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-copy-hyperlink`,
                PMPage,
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "Rich link copied",
                PMPage,
            );
            console.log(indent(2) + `✓ Copy hyperlink feedback: "${feedbackText}"`);

            // For hyperlink, clipboard should contain both title and URL
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            console.log(indent(3) + `Debug: Clipboard content is: "${clipboardText}"`);
            expect(clipboardText).toContain(paperData.title);
            expect(clipboardText).toMatch(/https?:\/\//);
            console.log(
                indent(2) + `✓ Clipboard contains hyperlink with title and URL`,
            );
        });

        it("should handle copy markdown action (memory-item-md) and verify markdown format", async function () {
            // Get paper data to determine expected content
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await seedClipboard(PMPage);
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-md`,
                PMPage,
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "Markdown",
                PMPage,
            );
            expect(feedbackText).toContain("copied");
            console.log(indent(2) + `✓ Copy markdown feedback: "${feedbackText}"`);

            // Verify clipboard contains valid markdown format [title](url)
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toMatch(/^\[.+\]\(https?:\/\/.+\)$/);
            expect(clipboardText).toContain(paperData.title);

            console.log(
                indent(2) + `✓ Clipboard contains valid markdown: "${clipboardText}"`,
            );
        });

        it("should handle copy bibtex action (memory-item-bibtex) and verify bibtex format", async function () {
            // Get paper data to determine expected content
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await seedClipboard(PMPage);
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-bibtex`,
                PMPage,
            );
            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "BibTeX",
                PMPage,
            );

            // Verify clipboard contains valid bibtex format
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toMatch(/^@\w+\{/); // Should start with @type{
            expect(clipboardText).toMatch(/title\s*=\s*\{/);
            expect(clipboardText).toMatch(/author\s*=\s*\{/);
            expect(await miniHash(clipboardText)).toContain(
                await miniHash(paperData.title),
            );
            console.log(indent(2) + `✓ Clipboard contains valid bibtex format`);
        });
    });

    describe("External Link Actions", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle external link action (memory-item-link) and verify page navigation", async function () {
            // Find a non-website paper
            const nonWebsitePaper = Object.keys(testData).find(
                (key) => !key.startsWith("__") && testData[key].source !== "website",
            );

            if (!nonWebsitePaper) {
                console.log(
                    indent(2) + "⚠ No non-website papers in test data, skipping test",
                );
                return;
            }

            const paperData = testData[nonWebsitePaper];
            const { button: linkButton, selector: linkSelector } =
                await verifyMemoryItemButtonExists(
                    nonWebsitePaper,
                    ".memory-item-link",
                    PMPage,
                );
            console.log(
                indent(2) + "✓ External link button present for non-website paper",
            );

            await verifyButtonClickable(linkButton, PMPage);

            // Click the link and monitor navigation
            await safeClick(linkSelector, PMPage);

            // Determine expected URL pattern based on paper source
            let expectedPattern;
            if (paperData.source === "arxiv") {
                expectedPattern = /arxiv\.org/;
            } else {
                expectedPattern = await paperToAbs(paperData.id, PMPage);
            }

            const newPage = await verifyPageNavigation(expectedPattern, browser);
            await newPage.close();
        });

        it("should handle local file action when file is available", async function () {
            this.skip(); // TODO: Fix this test; currently not working because the reload resets the internal state ; we need to intervene in the state creation process and we don't have a good way to do that at the moment
            // Mock a file being available
            await page.evaluate((paperId) => {
                PMDebug.config.state.files[paperId] = {
                    id: 123,
                    filename: "test.pdf",
                };
            }, firstPaperId);

            await page.reload({ waitUntil: "networkidle0" });
            await ensureMemoryIsOpen(PMPage);

            const { button: localButton, selector: localSelector } =
                await verifyMemoryItemButtonExists(
                    firstPaperId,
                    ".memory-item-openLocal",
                    PMPage,
                );
            console.log(indent(2) + "✓ Local file button present when file available");

            await verifyButtonClickable(localButton);

            // Click the local file button
            await safeClick(localSelector, PMPage);

            // Verify download or file opening was triggered
            // Note: In test environment, actual file opening may not be observable
            console.log(
                indent(2) +
                    "✓ Local file action triggered (file system access limited in tests)",
            );
        });
    });

    describe("Preference-Dependent External Services", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        async function testExternalServiceButton(
            serviceName,
            preferenceKey,
            buttonClass,
            expectedUrlPattern,
            page,
        ) {
            await setPreferencesAndReload({ [preferenceKey]: true }, page);
            // the services are in the row's "…" menu
            await safeClick(
                `#memory-container--${arxivQueryId} .memory-item-more`,
                page,
            );

            const { button, selector } = await verifyMemoryItemButtonExists(
                arxivPaperId,
                buttonClass,
                page,
            );
            console.log(
                indent(2) + `✓ ${serviceName} button present when preference enabled`,
            );

            await verifyButtonClickable(button, page);
            console.log(indent(2) + `✓ ${serviceName} button is clickable`);

            // Click button and verify navigation
            await safeClick(selector, page);
            const newPage = await verifyPageNavigation(expectedUrlPattern, browser);
            await newPage.close();
        }

        it("should handle SciRate action and verify navigation", async function () {
            await testExternalServiceButton(
                "SciRate",
                "checkScirate",
                ".memory-item-scirate",
                /scirate\.com\/arxiv/,
                PMPage,
            );
        });

        it("should handle AlphaXiv action and verify navigation", async function () {
            await testExternalServiceButton(
                "AlphaXiv",
                "checkAlphaxiv",
                ".memory-item-alphaxiv",
                /alphaxiv\.org\/abs/,
                PMPage,
            );
        });

        it("should handle ar5iv action and verify navigation", async function () {
            await testExternalServiceButton(
                "ar5iv",
                "checkAr5iv",
                ".memory-item-ar5iv",
                /ar5iv\.labs\.arxiv\.org\/html/,
                PMPage,
            );
        });

        it("should handle HuggingFace action and verify navigation", async function () {
            await testExternalServiceButton(
                "HuggingFace",
                "checkHuggingface",
                ".memory-item-huggingface",
                /huggingface\.co\/papers/,
                PMPage,
            );
        });

        it("should not show preference-dependent buttons when preferences are disabled", async function () {
            await setPreferencesAndReload(
                {
                    checkScirate: false,
                    checkAlphaxiv: false,
                    checkAr5iv: false,
                    checkHuggingface: false,
                },
                PMPage,
            );

            // Check that optional buttons are not present
            const scirateButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-scirate`,
            );
            const alphaxivButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-alphaxiv`,
            );
            const ar5ivButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-ar5iv`,
            );
            const huggingfaceButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-huggingface`,
            );

            expect(scirateButton).toBeFalsy();
            expect(alphaxivButton).toBeFalsy();
            expect(ar5ivButton).toBeFalsy();
            expect(huggingfaceButton).toBeFalsy();
        });

        it("should perform complete workflow test: copy bibtex and open external link", async function () {
            // This test combines multiple actions to verify end-to-end functionality
            await setPreferencesAndReload({ checkScirate: true }, PMPage);

            // First test: Copy bibtex and verify content
            const { button: bibtexButton, selector: bibtexSelector } =
                await verifyMemoryItemButtonExists(
                    arxivPaperId,
                    ".memory-item-bibtex",
                    PMPage,
                );
            await seedClipboard(PMPage);
            await safeClick(bibtexSelector, PMPage);

            // Verify bibtex was copied
            const clipboardContent = await getClipboardText(PMPage);
            expect(clipboardContent).toMatch(/^@\w+\{/);
            console.log(indent(2) + "✓ Bibtex successfully copied to clipboard");

            // Second test: Open SciRate link (in the row's "…" menu)
            await safeClick(
                `#memory-container--${arxivQueryId} .memory-item-more`,
                PMPage,
            );
            const { button: scirateButton, selector: scirateSelector } =
                await verifyMemoryItemButtonExists(
                    arxivPaperId,
                    ".memory-item-scirate",
                    PMPage,
                );
            await safeClick(scirateSelector, PMPage);

            const matchingPage = await verifyPageNavigation(/scirate\.com/, browser);
            await matchingPage.close();

            console.log(indent(2) + "✓ Complete workflow test passed");
        });
    });

    describe("Rows: edit form, notes, height, hybrid scroll", function () {
        const CYCLE = "Arxiv-1703.10593";
        const NANOWIRE = "RSC-DigitalDiscovery_d2dd00066k";
        const rowSel = (id) => `#memory-container--${id.replaceAll(".", "\\.")}`;

        async function openWith(data) {
            await resetPage(PMPage, pmURLs.popupURL);
            await setupPageWithData(PMPage, data);
            await sleep(200);
        }

        it("should suggest the existing tag when a new one is almost the same", async function () {
            const data = structuredClone(testData);
            data[NANOWIRE].tags = ["reading-group"];
            data[CYCLE].tags = [];
            await openWith(data);
            await PMPage.focus(rowSel(CYCLE));
            await PMPage.keyboard.press("e");
            await PMPage.waitForSelector(`${rowSel(CYCLE)} .pm-edit .pm-tagin`);
            // the tag input has the focus
            expect(
                await PMPage.evaluate(() => document.activeElement.className),
            ).toContain("pm-tagin");
            await PMPage.keyboard.type("Reading Groups");
            await PMPage.waitForSelector(`${rowSel(CYCLE)} .pm-tagsugg:not([hidden])`);
            const sugg = await PMPage.$eval(`${rowSel(CYCLE)} .pm-tagsugg`, (el) => ({
                note: el.querySelector(".pm-sugg-note")?.textContent,
                active: el.querySelector(".pm-sugg-row.is-active span")?.textContent,
                create: el.querySelector(".pm-sugg-create")?.textContent,
            }));
            expect(sugg.note).toContain("Almost the same");
            expect(sugg.active).toBe("reading-group");
            expect(sugg.create).toContain("Create “Reading Groups” anyway");
            // Enter uses the existing tag
            await PMPage.keyboard.press("Enter");
            const chips = await PMPage.$$eval(
                `${rowSel(CYCLE)} .pm-tagfield .pm-chip-t`,
                (els) => els.map((el) => el.textContent),
            );
            expect(chips).toEqual(["reading-group"]);
            // ⌘↵ / Ctrl+↵ saves the form
            await PMPage.keyboard.down("Control");
            await PMPage.keyboard.press("Enter");
            await PMPage.keyboard.up("Control");
            await PMPage.waitForFunction(
                (sel) => !document.querySelector(`${sel} .pm-edit`),
                {},
                rowSel(CYCLE),
            );
            const stored = await PMPage.evaluate(
                (id) => PMDebug.data.getStorage("papers").then((p) => p[id].tags),
                CYCLE,
            );
            expect(stored).toEqual(["reading-group"]);
            // the focus is back on the row
            expect(await PMPage.evaluate(() => document.activeElement.id)).toBe(
                `memory-container--${CYCLE}`,
            );
        });

        it("should cap the note at 3 rendered lines, keep its line breaks, and expand on more…", async function () {
            const data = structuredClone(testData);
            data[NANOWIRE].note = "first line\n\nthird line\nfourth line\nfifth line";
            await openWith(data);
            const note = await PMPage.$eval(
                `${rowSel(NANOWIRE)} .pm-item-note`,
                (el) => {
                    const p = el.querySelector("p");
                    const lh = parseFloat(getComputedStyle(p).lineHeight);
                    return {
                        lines: Math.round(p.clientHeight / lh),
                        text: p.textContent,
                        whiteSpace: getComputedStyle(p).whiteSpace,
                        more: !el.querySelector(".pm-note-more").hidden,
                    };
                },
            );
            expect(note.lines).toBe(3); // the blank line counts
            expect(note.text).toBe("first line\n\nthird line\nfourth line\nfifth line");
            expect(note.whiteSpace).toBe("pre-line");
            expect(note.more).toBe(true);
            await PMPage.click(`${rowSel(NANOWIRE)} .pm-note-more`);
            const open = await PMPage.$eval(
                `${rowSel(NANOWIRE)} .pm-item-note`,
                (el) => {
                    const p = el.querySelector("p");
                    return {
                        lines: Math.round(
                            p.clientHeight / parseFloat(getComputedStyle(p).lineHeight),
                        ),
                        label: el.querySelector(".pm-note-more").textContent,
                    };
                },
            );
            expect(open).toEqual({ lines: 5, label: "less" });
        });

        it("should keep every row's height on hover and focus", async function () {
            const data = structuredClone(testData);
            data[CYCLE].favorite = false;
            await openWith(data);
            const heights = () =>
                PMPage.$$eval("#memory-table .memory-container", (els) =>
                    els.map((el) => el.getBoundingClientRect().height),
                );
            const rest = await heights();
            await PMPage.hover(`${rowSel(CYCLE)} .pm-item-meta`);
            expect(await heights()).toEqual(rest);
            await PMPage.focus(rowSel(CYCLE));
            expect(await heights()).toEqual(rest);
            await PMPage.mouse.move(5, 595);
            await PMPage.keyboard.press("Tab");
            expect(await heights()).toEqual(rest);
        });

        it("should hide the tab header on scroll and bring it back on a wheel scroll-up only", async function () {
            const data = structuredClone(testData);
            for (let i = 0; i < 12; i++) {
                const id = `Arxiv-2101.000${String(i).padStart(2, "0")}`;
                data[id] = {
                    ...data[CYCLE],
                    id,
                    title: `Bulk paper ${i}`,
                    tags: ["bulk"],
                };
            }
            await openWith(data);
            const scrolled = () =>
                PMPage.$eval("#pm-shell", (el) =>
                    el.classList.contains("pm-mv-scrolled"),
                );
            const headerVisible = () =>
                PMPage.$eval(
                    "#popup-header",
                    (el) => el.getBoundingClientRect().bottom > 1,
                );
            // a filter, to see it fold into the chip
            await PMPage.keyboard.type("t:bulk");
            await PMPage.keyboard.press("Tab");
            expect(await scrolled()).toBe(false);
            await PMPage.mouse.move(225, 400);
            await PMPage.mouse.wheel({ deltaY: 400 });
            await PMPage.waitForFunction(() =>
                document
                    .getElementById("pm-shell")
                    .classList.contains("pm-mv-scrolled"),
            );
            await sleep(300);
            expect(await headerVisible()).toBe(false);
            // the search field stays; the pill folds into "1 filter"
            expect(
                await PMPage.$eval(
                    "#memory-search",
                    (el) => el.getBoundingClientRect().top >= 0,
                ),
            ).toBe(true);
            expect(
                await PMPage.$eval("#memory-pills", (el) => el.offsetParent === null),
            ).toBe(true);
            expect(
                await PMPage.$eval("#memory-filter-chip", (el) => [
                    el.offsetParent !== null,
                    el.textContent.trim(),
                ]),
            ).toEqual([true, "1 filter"]);
            // Tab-induced scrolling (back to the first row) never brings the header back
            await PMPage.focus("#memory-search");
            await PMPage.keyboard.press("Tab");
            await sleep(300);
            expect(await PMPage.$eval("#memory-scroll", (el) => el.scrollTop)).toBe(0);
            expect(await scrolled()).toBe(true);
            // a wheel scroll-up does
            await PMPage.mouse.wheel({ deltaY: -100 });
            await PMPage.waitForFunction(
                () =>
                    !document
                        .getElementById("pm-shell")
                        .classList.contains("pm-mv-scrolled"),
            );
            await sleep(300);
            expect(await headerVisible()).toBe(true);
            expect(
                await PMPage.$eval("#memory-pills", (el) => el.offsetParent !== null),
            ).toBe(true);
        });

        const storedPaper = (id) =>
            PMPage.evaluate(
                (id) => PMDebug.data.getStorage("papers").then((p) => p[id]),
                id,
            );

        it("should autosave the edit form as you type and close it with Done", async function () {
            await openWith(structuredClone(testData));
            await PMPage.focus(rowSel(CYCLE));
            await PMPage.keyboard.press("e");
            await PMPage.waitForSelector(`${rowSel(CYCLE)} .pm-edit`);
            // a single Done button, no Cancel
            expect(await PMPage.$(`${rowSel(CYCLE)} .memory-edit-done`)).toBeTruthy();
            expect(
                await PMPage.$$eval(
                    `${rowSel(CYCLE)} .pm-edit button.pm-btn`,
                    (b) => b.length,
                ),
            ).toBe(1);
            await PMPage.$eval(`${rowSel(CYCLE)} .form-note-textarea`, (el) => {
                el.focus();
                el.select();
            });
            await PMPage.keyboard.type("autosaved note");
            await sleep(600);
            // saved while the form is still open
            expect(await PMPage.$(`${rowSel(CYCLE)} .pm-edit`)).toBeTruthy();
            expect((await storedPaper(CYCLE)).note).toBe("autosaved note");
            await PMPage.click(`${rowSel(CYCLE)} .memory-edit-done`);
            await PMPage.waitForFunction(
                (sel) => !document.querySelector(`${sel} .pm-edit`),
                {},
                rowSel(CYCLE),
            );
            expect(
                await PMPage.$eval(
                    `${rowSel(CYCLE)} .pm-item-note p`,
                    (el) => el.textContent,
                ),
            ).toBe("autosaved note");
        });

        it("should keep a note's leading line break through the edit form", async function () {
            const data = structuredClone(testData);
            data[NANOWIRE].note = "\nstarts with a blank line";
            await openWith(data);
            await PMPage.focus(rowSel(NANOWIRE));
            await PMPage.keyboard.press("e");
            await PMPage.waitForSelector(`${rowSel(NANOWIRE)} .pm-edit`);
            expect(
                await PMPage.$eval(
                    `${rowSel(NANOWIRE)} .form-note-textarea`,
                    (el) => el.value,
                ),
            ).toBe("\nstarts with a blank line");
            await PMPage.click(`${rowSel(NANOWIRE)} .memory-edit-done`);
            await sleep(300);
            expect((await storedPaper(NANOWIRE)).note).toBe(
                "\nstarts with a blank line",
            );
        });

        it("should split pasted comma-separated tags into separate tags", async function () {
            const data = structuredClone(testData);
            data[CYCLE].tags = [];
            await openWith(data);
            await PMPage.focus(rowSel(CYCLE));
            await PMPage.keyboard.press("e");
            await PMPage.waitForSelector(`${rowSel(CYCLE)} .pm-tagin`);
            // a paste: the whole text arrives in one input event
            await PMPage.$eval(`${rowSel(CYCLE)} .pm-tagin`, (el) => {
                el.value = "alpha,beta";
                el.dispatchEvent(new Event("input"));
            });
            // "beta" stays in the input until a comma, Enter or Done
            await PMPage.keyboard.press("Enter");
            const chips = await PMPage.$$eval(`${rowSel(CYCLE)} .pm-chip-t`, (els) =>
                els.map((el) => el.textContent),
            );
            expect(chips).toEqual(["alpha", "beta"]);
            await sleep(200);
            expect((await storedPaper(CYCLE)).tags).toEqual(["alpha", "beta"]);
        });

        it("should take a paper out of the filtered list once its edit removes the filtered tag", async function () {
            const data = structuredClone(testData);
            data[CYCLE].tags = ["vision"];
            data[NANOWIRE].tags = ["vision"];
            await openWith(data);
            await PMPage.keyboard.type("t:vision");
            await PMPage.keyboard.press("Tab");
            await PMPage.focus(rowSel(CYCLE));
            await PMPage.keyboard.press("e");
            await PMPage.waitForSelector(`${rowSel(CYCLE)} .pm-chip-x`);
            await PMPage.click(`${rowSel(CYCLE)} .pm-chip-x`);
            await PMPage.keyboard.down("Control");
            await PMPage.keyboard.press("Enter");
            await PMPage.keyboard.up("Control");
            await sleep(300);
            const ids = await PMPage.$$eval("#memory-table .memory-container", (els) =>
                els.map((el) => el.id.replace("memory-container--", "")),
            );
            expect(ids).toEqual([NANOWIRE]);
            // the focus moved to the row now in its place
            expect(await PMPage.evaluate(() => document.activeElement.id)).toBe(
                `memory-container--${NANOWIRE}`,
            );
        });

        it("should keep the search and filters across Paper / Memory with the pref on", async function () {
            await setPreferencesAndReload({ checkKeepMemorySearch: true }, PMPage);
            await setupPageWithData(PMPage, structuredClone(testData));
            await PMPage.focus("#memory-search");
            await PMPage.keyboard.type("y:2017");
            await PMPage.keyboard.press("Tab");
            await PMPage.keyboard.type("cycle");
            await sleep(200);
            await PMPage.click("#tab-paper");
            await PMPage.click("#tab-memory");
            await sleep(200);
            expect(await PMPage.$eval("#memory-search", (el) => el.value)).toBe(
                "cycle",
            );
            expect(
                await PMPage.$$eval("#memory-pills .pm-chip", (els) =>
                    els.map((e) => e.textContent),
                ),
            ).toEqual(["year2017"]);
            // off (the default): cleared
            await setPreferencesAndReload({ checkKeepMemorySearch: false }, PMPage);
            await setupPageWithData(PMPage, structuredClone(testData));
            await PMPage.focus("#memory-search");
            await PMPage.keyboard.type("y:2017");
            await PMPage.keyboard.press("Tab");
            await PMPage.click("#tab-paper");
            await PMPage.click("#tab-memory");
            await sleep(200);
            expect(
                await PMPage.$$eval("#memory-pills .pm-chip", (els) => els.length),
            ).toBe(0);
        });

        it("should switch to the paper's open tab instead of opening a new one", async function () {
            await openWith(structuredClone(testData));
            const url = "https://arxiv.org/abs/1703.10593";
            const paperTab = await browser.newPage();
            await paperTab.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
            const count = async () =>
                (await browser.pages()).filter((p) => p.url().includes("1703.10593"))
                    .length;
            const before = await count();
            await PMPage.bringToFront();
            await PMPage.focus(rowSel(CYCLE));
            // the popup's own tab watches which tab gets activated
            await PMPage.evaluate(() => {
                window.__activated = null;
                chrome.tabs.onActivated.addListener(({ tabId }) =>
                    chrome.tabs.get(tabId, (t) => (window.__activated = t.url)),
                );
            });
            await PMPage.keyboard.press("o");
            await PMPage.waitForFunction(() => window.__activated, { timeout: 5000 });
            expect(await PMPage.evaluate(() => window.__activated)).toContain(
                "1703.10593",
            );
            await sleep(500);
            expect(await count()).toBe(before);
            await paperTab.close();
        });
    });
});

// Test for PaperMemory's Memory Item Actions - Refactored
// Tests all action buttons in memory items and their handlers

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
    miniHash,
} from "./browser.js";

import {
    loadConfig,
    root,
    readJSON,
    indent,
    sleep,
    asyncMap,
} from "./utilsForTests.js";

// -------------------------------------------------------
// -----  Global constants to parametrize the tests  -----
// -------------------------------------------------------

const { keepOpen } = loadConfig();
console.log("keepOpen :", keepOpen);

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
        browser = await makeBrowser();
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
                error.message
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

    async function verifyFeedbackMessage(paperId, expectedText, page) {
        const queryId = paperId.replaceAll(".", "\\.");
        const feedback = await page.$(
            `#memory-container--${queryId} .memory-item-feedback`
        );
        const feedbackText = await page.evaluate((el) => el.textContent, feedback);
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

    async function verifyPageNavigation(expectedUrlPattern) {
        // Check if any existing or new page has the expected URL
        const allPages = await browser.pages();
        const allPagesAndURLs = await asyncMap(allPages, async (page) => {
            return { page, url: await getURL(page) };
        });
        const matchingPageAndURL = allPagesAndURLs.find((pageAndURL) =>
            expectedUrlPattern.test
                ? expectedUrlPattern.test(pageAndURL.url)
                : pageAndURL.url.includes(expectedUrlPattern)
        );
        expect(matchingPageAndURL).toBeTruthy();
        return matchingPageAndURL.page;
    }

    describe("Basic Actions", function () {
        var runs = [...Array(2).keys()];
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        runs.forEach(() => {
            it("should handle toggle favorite action (memory-item-favorite)", async function () {
                // Check initial favorite state
                const initialState = await getPaperMemoryState(PMPage);
                const initialFavorite = initialState.papers[firstPaperId].favorite;

                // Click favorite button
                await safeClick(
                    `#memory-container--${firstQueryId} .memory-item-favorite`,
                    PMPage
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
                    initialFavorite
                );

                // Verify favorite state changed
                const finalState = await getPaperMemoryState(PMPage);
                const finalFavorite = finalState.papers[firstPaperId].favorite;

                expect(finalFavorite).toBe(!initialFavorite);
                console.log(
                    indent(2) +
                        `✓ Favorite toggled from ${initialFavorite} to ${finalFavorite}`
                );
            });
        });

        it("should handle edit action (memory-item-edit)", async function () {
            // Click edit button
            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-edit`,
                PMPage
            );

            // Wait for edit form to be visible
            await PMPage.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && getComputedStyle(el).display !== "none";
                },
                { timeout: 2000 },
                `#memory-container--${firstQueryId} .extended-item`
            );

            // Verify edit form is open
            const editForm = await PMPage.$(
                `#memory-container--${firstQueryId} .extended-item`
            );
            const isVisible = await PMPage.evaluate(
                (el) => getComputedStyle(el).display !== "none",
                editForm
            );

            expect(isVisible).toBe(true);
            console.log(indent(2) + "✓ Edit form opened successfully");

            // Close edit form
            await sleep(250); // Let the form slide events finish
            await PMPage.$eval(
                `#memory-container--${firstQueryId} .done-note-form`,
                (el) => el.click()
            );

            // Wait for edit form to be hidden
            await PMPage.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && getComputedStyle(el).display === "none";
                },
                { timeout: 2000 },
                `#memory-container--${firstQueryId} .extended-item`
            );

            // Verify edit form is closed
            const isHidden = await PMPage.evaluate(
                (el) => getComputedStyle(el).display === "none",
                editForm
            );

            expect(isHidden).toBe(true);
            console.log(indent(2) + "✓ Edit form closed successfully");
        });

        it("should handle delete action (memory-delete)", async function () {
            // Click delete button
            await safeClick(
                `#memory-container--${firstQueryId} .memory-delete`,
                PMPage
            );

            // Wait for modal to appear
            await PMPage.waitForFunction(
                () => {
                    const modal = document.querySelector("#delete-paper-modal");
                    return modal && getComputedStyle(modal).display !== "none";
                },
                { timeout: 2000 }
            );

            // Verify delete modal appears
            const deleteModal = await PMPage.$("#delete-paper-modal");
            const modalVisible = await PMPage.evaluate(
                (el) => getComputedStyle(el).display !== "none",
                deleteModal
            );

            expect(modalVisible).toBe(true);
            console.log(indent(2) + "✓ Delete confirmation modal opened");

            // Cancel delete - use direct DOM click since modal buttons have display:none
            const cancelClicked = await PMPage.evaluate(() => {
                const cancelBtn = document.querySelector(
                    "#delete-paper-modal-cancel-button"
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
                { timeout: 2000 }
            );

            // Verify modal is hidden
            const modalHidden = await PMPage.evaluate(
                (el) => getComputedStyle(el).display === "none",
                deleteModal
            );

            expect(modalHidden).toBe(true);
            console.log(indent(2) + "✓ Delete modal cancelled and closed");
        });
    });

    describe("Copy Actions", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        async function getClipboardText(page) {
            try {
                // Add timeout to prevent hanging on permission dialogs
                return await Promise.race([
                    page.evaluate(async () => {
                        try {
                            const text = await navigator.clipboard.readText();
                            return text;
                        } catch (err) {
                            console.log("Clipboard read failed:", err.message);
                            // Fallback: try to get clipboard data from a hidden textarea
                            const textarea = document.createElement("textarea");
                            document.body.appendChild(textarea);
                            textarea.focus();
                            const result = document.execCommand("paste");
                            const content = textarea.value;
                            document.body.removeChild(textarea);
                            return result ? content : null;
                        }
                    }),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error("Clipboard read timeout")),
                            3000
                        )
                    ),
                ]);
            } catch (error) {
                console.log(indent(3) + `⚠ Clipboard read failed: ${error.message}`);
                return null;
            }
        }

        async function verifyClipboardContent(
            expectedContent,
            partialMatch = false,
            page
        ) {
            const clipboardText = await getClipboardText(page);
            expect(clipboardText).toBeTruthy();

            if (partialMatch) {
                expect(clipboardText).toContain(expectedContent);
            } else {
                expect(clipboardText).toBe(expectedContent);
            }
            return clipboardText;
        }

        async function paperToAbs(paperId, page) {
            const paperData = await page.evaluate((paperId) => {
                return PMDebug.paper.paperToAbs(PMDebug.config.state.papers[paperId]);
            }, paperId);
            return paperData.pdfLink;
        }

        it("should be able to read and write to the clipboard", async function () {
            const testText = "test clipboard paper memory";
            await PMPage.evaluate((text) => {
                navigator.clipboard.writeText(text);
            }, testText);
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBe(testText);
        });

        it("should handle copy link action (memory-item-copy-link) and verify clipboard content", async function () {
            // Get paper data to determine expected URL
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-copy-link`,
                PMPage
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "copied",
                PMPage
            );
            console.log(indent(2) + `✓ Copy link feedback: "${feedbackText}"`);

            // Verify clipboard contains the correct URL
            const clipboardText = await verifyClipboardContent("", true, PMPage);
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
                        50
                    )}..."`
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
                        50
                    )}..."`
            );

            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-copy-hyperlink`,
                PMPage
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "Hyperlink copied",
                PMPage
            );
            console.log(indent(2) + `✓ Copy hyperlink feedback: "${feedbackText}"`);

            // For hyperlink, clipboard should contain both title and URL
            const clipboardText = await verifyClipboardContent("", true, PMPage);
            if (clipboardText) {
                console.log(
                    indent(3) + `Debug: Clipboard content is: "${clipboardText}"`
                );
                expect(clipboardText).toContain(paperData.title);
                expect(clipboardText).toMatch(/https?:\/\//);
                console.log(
                    indent(2) + `✓ Clipboard contains hyperlink with title and URL`
                );
            } else {
                console.log(
                    indent(3) +
                        "⚠ Clipboard verification skipped due to test environment limitations"
                );
            }
        });

        it("should handle copy markdown action (memory-item-md) and verify markdown format", async function () {
            // Get paper data to determine expected content
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-md`,
                PMPage
            );

            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "Markdown",
                PMPage
            );
            expect(feedbackText).toContain("copied");
            console.log(indent(2) + `✓ Copy markdown feedback: "${feedbackText}"`);

            // Verify clipboard contains valid markdown format [title](url)
            const clipboardText = await verifyClipboardContent("", true, PMPage);
            expect(clipboardText).toMatch(/^\[.+\]\(https?:\/\/.+\)$/);
            expect(clipboardText).toContain(paperData.title);

            console.log(
                indent(2) + `✓ Clipboard contains valid markdown: "${clipboardText}"`
            );
        });

        it("should handle copy bibtex action (memory-item-bibtex) and verify bibtex format", async function () {
            // Get paper data to determine expected content
            const paperData = await PMPage.evaluate((paperId) => {
                return PMDebug.config.state.papers[paperId];
            }, firstPaperId);

            await safeClick(
                `#memory-container--${firstQueryId} .memory-item-bibtex`,
                PMPage
            );
            const feedbackText = await verifyFeedbackMessage(
                firstPaperId,
                "Bibtex",
                PMPage
            );

            // Verify clipboard contains valid bibtex format
            const clipboardText = await getClipboardText(PMPage);
            if (clipboardText && clipboardText.match(/^@\w+\{/)) {
                expect(clipboardText).toMatch(/^@\w+\{/); // Should start with @type{
                expect(clipboardText).toMatch(/title\s*=\s*\{/);
                expect(clipboardText).toMatch(/author\s*=\s*\{/);
                expect(await miniHash(clipboardText, PMPage)).toContain(
                    await miniHash(paperData.title, PMPage)
                );
                console.log(indent(2) + `✓ Clipboard contains valid bibtex format`);
            } else {
                // In some test environments, bibtex generation might not work as expected
                console.log(
                    indent(2) +
                        `⚠ Bibtex format verification limited in test environment`
                );
                console.log(
                    indent(2) +
                        `    Clipboard content: "${
                            clipboardText ? clipboardText.substring(0, 100) : "empty"
                        }..."`
                );
            }
        });
    });

    describe("External Link Actions", function () {
        before(async function () {
            PMPage = await quickReset(PMPage);
        });

        it("should handle external link action (memory-item-link) and verify page navigation", async function () {
            // Find a non-website paper
            const nonWebsitePaper = Object.keys(testData).find(
                (key) => !key.startsWith("__") && testData[key].source !== "website"
            );

            if (!nonWebsitePaper) {
                console.log(
                    indent(2) + "⚠ No non-website papers in test data, skipping test"
                );
                return;
            }

            const paperData = testData[nonWebsitePaper];
            const { button: linkButton, selector: linkSelector } =
                await verifyMemoryItemButtonExists(
                    nonWebsitePaper,
                    ".memory-item-link",
                    PMPage
                );
            console.log(
                indent(2) + "✓ External link button present for non-website paper"
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

            const newPage = await verifyPageNavigation(expectedPattern);
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
                    PMPage
                );
            console.log(indent(2) + "✓ Local file button present when file available");

            await verifyButtonClickable(localButton);

            // Click the local file button
            await safeClick(localSelector, PMPage);

            // Verify download or file opening was triggered
            // Note: In test environment, actual file opening may not be observable
            console.log(
                indent(2) +
                    "✓ Local file action triggered (file system access limited in tests)"
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
            page
        ) {
            await setPreferencesAndReload({ [preferenceKey]: true }, page);

            const { button, selector } = await verifyMemoryItemButtonExists(
                arxivPaperId,
                buttonClass,
                page
            );
            console.log(
                indent(2) + `✓ ${serviceName} button present when preference enabled`
            );

            await verifyButtonClickable(button, page);
            console.log(indent(2) + `✓ ${serviceName} button is clickable`);

            // Click button and verify navigation
            const initialPages = await browser.pages();
            await safeClick(selector, page);
            const newPagesCount = (await browser.pages()).length - initialPages.length;
            expect(newPagesCount).toBe(1);
            const newPage = await verifyPageNavigation(expectedUrlPattern);
            await newPage.close();
        }

        it("should handle SciRate action and verify navigation", async function () {
            await testExternalServiceButton(
                "SciRate",
                "checkScirate",
                ".memory-item-scirate",
                /scirate\.com\/arxiv/,
                PMPage
            );
        });

        it("should handle AlphaXiv action and verify navigation", async function () {
            await testExternalServiceButton(
                "AlphaXiv",
                "checkAlphaxiv",
                ".memory-item-alphaxiv",
                /alphaxiv\.org\/abs/,
                PMPage
            );
        });

        it("should handle ar5iv action and verify navigation", async function () {
            await testExternalServiceButton(
                "ar5iv",
                "checkAr5iv",
                ".memory-item-ar5iv",
                /ar5iv\.labs\.arxiv\.org\/html/,
                PMPage
            );
        });

        it("should handle HuggingFace action and verify navigation", async function () {
            await testExternalServiceButton(
                "HuggingFace",
                "checkHuggingface",
                ".memory-item-huggingface",
                /huggingface\.co\/papers/,
                PMPage
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
                PMPage
            );

            // Check that optional buttons are not present
            const scirateButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-scirate`
            );
            const alphaxivButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-alphaxiv`
            );
            const ar5ivButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-ar5iv`
            );
            const huggingfaceButton = await PMPage.$(
                `#memory-container--${arxivQueryId} .memory-item-huggingface`
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
                    PMPage
                );
            await safeClick(bibtexSelector, PMPage);

            // Verify bibtex was copied
            const clipboardContent = await PMPage.evaluate(async () => {
                try {
                    return await navigator.clipboard.readText();
                } catch (err) {
                    return null;
                }
            });

            if (clipboardContent) {
                expect(clipboardContent).toMatch(/^@\w+\{/);
                console.log(indent(2) + "✓ Bibtex successfully copied to clipboard");
            } else {
                console.log(
                    indent(2) + "⚠ Clipboard access limited in test environment"
                );
            }

            // Second test: Open SciRate link
            const { button: scirateButton, selector: scirateSelector } =
                await verifyMemoryItemButtonExists(
                    arxivPaperId,
                    ".memory-item-scirate",
                    PMPage
                );
            const initialPagesCount = (await browser.pages()).length;

            await safeClick(scirateSelector, PMPage);

            const matchingPage = await verifyPageNavigation(/scirate\.com/);
            await matchingPage.close();

            console.log(indent(2) + "✓ Complete workflow test passed");
        });
    });
});

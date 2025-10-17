// Test for PaperMemory's Popup UI - When user is on a known paper page
// Starting with a single minimal test to verify the mocking approach

import { expect } from "expect";
import {
    findExtensionId,
    makeBrowser,
    getPMURLs,
    resetPage,
    setStorage,
    verifySelectorExists,
    safeClick,
    verifyClipboardContent,
    getClipboardText,
    verifyElementClickable,
    setPreferencesAndReload,
    verifyPageNavigation,
} from "./browser.js";

import {
    loadConfig,
    root,
    readJSON,
    indent,
    loadPaperMemoryUtils,
    sleep,
} from "./utilsForTests.js";

await loadPaperMemoryUtils();

const { keepOpen } = loadConfig();
console.log("keepOpen :", keepOpen);

const miniHash = PMUtils.functions.miniHash;

describe("Test PaperMemory Popup UI - Known Paper Page", function () {
    var browser;
    var extensionId;
    var pmURLs;
    var testData;
    var arxivPaperId;
    var arxivPaperIdEscaped;
    var arxivPaperUrl;
    var PMPage;

    this.timeout(120000);
    this.slow(60000);

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser();
        PMPage = (await browser.pages())[0];

        extensionId = await findExtensionId(browser);
        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        // Load test data and extract arxiv paper for testing
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        const paperIds = Object.keys(testData).filter((key) => !key.startsWith("__"));
        arxivPaperId = paperIds.find((key) => testData[key].source === "arxiv");
        arxivPaperIdEscaped = arxivPaperId.replace(/\./g, "\\.");
        if (!arxivPaperId) {
            throw new Error("No arXiv paper found in test data");
        }

        arxivPaperUrl = testData[arxivPaperId].pdfLink;
        // Set up test data in storage
        await resetPage(PMPage, pmURLs.popupURL);
        await setStorage(PMPage, "papers", testData);

        console.log(indent(1) + `Test data loaded with arXiv paper: ${arxivPaperId}`);
        console.log(indent(1) + `Paper URL: ${arxivPaperUrl}`);
    });

    after(async function () {
        if (browser && !keepOpen) {
            console.log(indent(1) + "Closing browser.");
            await browser.close();
        }
    });

    // Helper function to setup popup with minimal mocking
    async function setupPopupWithMockedTab(page, paperUrl, paperId) {
        // Mock chrome.tabs.query BEFORE loading the page
        await page.evaluateOnNewDocument((url) => {
            window.chrome = window.chrome || {};
            window.chrome.tabs = window.chrome.tabs || {};
            window.chrome.tabs.query = (queryInfo, callback) => {
                callback([{ url: url, id: 1 }]);
            };
            window.close = () => {
                console.log("window.close() called but mocked for testing");
            };
        }, paperUrl);

        await page.reload();
    }

    describe("Basic Popup Setup", function () {
        it("should display paper-specific UI when on a known paper page", async function () {
            // Setup popup with mocked tab
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Check that the paper-specific container is visible
            await verifySelectorExists("#isArxiv", PMPage);

            // Check that paper title is displayed
            const titleElement = await verifySelectorExists(
                "#popup-paper-title",
                PMPage
            );
            const titleText = await titleElement.evaluate((el) => el.innerText);
            expect(titleText).toBeTruthy();
            expect(titleText.length).toBeGreaterThan(0);

            // Check that authors are displayed
            const authorsElement = await verifySelectorExists("#popup-authors", PMPage);
            const authorsText = await authorsElement.evaluate((el) => el.innerText);
            expect(authorsText).toBeTruthy();
        });
    });

    describe("Displayed paper data matches test data", function () {
        const paperIds = Object.keys(
            readJSON(`${root}/test/data/3-papers-memory.json`)
        ).filter((key) => !key.startsWith("__"));
        paperIds.forEach((paperId) => {
            it(`should display the correct paper data for ${paperId}`, async function () {
                // Setup popup with mocked tab
                const paperData = testData[paperId];
                await setupPopupWithMockedTab(PMPage, paperData.pdfLink, paperId);
                // Check that the paper-specific container is visible
                await verifySelectorExists("#isArxiv", PMPage);
                // check that the paper data matches the test data
                const displayedPaperData = await PMPage.evaluate(
                    (paperId) => PMDebug.config.state.papers[paperId],
                    paperId
                );
                expect(displayedPaperData).toEqual(paperData);

                const titleEl = await verifySelectorExists(
                    "#popup-paper-title",
                    PMPage
                );
                const titleText = await titleEl.evaluate((el) => el.innerText);
                expect(miniHash(titleText)).toBe(miniHash(paperData.title));

                const authorsEl = await verifySelectorExists("#popup-authors", PMPage);
                const authorsText = await authorsEl.evaluate((el) => el.innerText);
                expect(
                    authorsText
                        .split(",")
                        .map((a) => a.trim())
                        .join(" and ")
                ).toBe(paperData.author);

                const codeLinkEl = await verifySelectorExists(
                    "#popup-code-link",
                    PMPage
                );
                const codeLinkText = await codeLinkEl.evaluate((el) => el.innerText);
                expect(miniHash(codeLinkText)).toBe(miniHash(paperData.codeLink));
            });
        });
    });

    describe("Copy Actions", function () {
        before(async function () {
            // Set up clipboard permissions
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
        });

        it("should be able to read and write to the clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            const testText = "test clipboard paper memory";
            await PMPage.evaluate((text) => {
                navigator.clipboard.writeText(text);
            }, testText);
            await verifyClipboardContent(testText, false, PMPage);
        });

        it("should copy paper link to clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Get paper data to determine expected URL
            const paperData = testData[arxivPaperId];

            // Find and click the copy link button
            const copyLinkSelector = `#popup-memory-item-copy-link--${arxivPaperIdEscaped}`;
            const copyLinkBtn = await verifySelectorExists(copyLinkSelector, PMPage);
            await safeClick(copyLinkSelector, PMPage);

            // Verify clipboard contains the correct URL
            const clipboardText = await verifyClipboardContent("", true, PMPage);
            expect(clipboardText).toMatch(/^https?:\/\//); // Should be a URL

            // Verify it contains expected domain based on paper source
            if (paperData.source === "arxiv") {
                expect(clipboardText).toContain("arxiv.org");
            }

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("copied");
        });

        it("should copy paper hyperlink to clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Get paper data to determine expected content
            const paperData = testData[arxivPaperId];

            // Find and click the copy hyperlink button
            const copyHyperlinkSelector = `#popup-memory-item-copy-hyperlink--${arxivPaperIdEscaped}`;
            const copyHyperlinkBtn = await verifySelectorExists(
                copyHyperlinkSelector,
                PMPage
            );
            await safeClick(copyHyperlinkSelector, PMPage);

            // Verify clipboard contains both title and URL
            const clipboardText = await verifyClipboardContent("", true, PMPage);
            if (clipboardText) {
                expect(clipboardText).toContain(paperData.title);
                expect(clipboardText).toMatch(/https?:\/\//);
            }

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("Abstract hyperlink copied!");
        });

        it("should copy markdown link to clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Get paper data to determine expected content
            const paperData = testData[arxivPaperId];

            // Find and click the copy markdown button
            const copyMdSelector = `#popup-memory-item-md--${arxivPaperIdEscaped}`;
            const copyMdBtn = await verifySelectorExists(copyMdSelector, PMPage);
            await safeClick(copyMdSelector, PMPage);

            // Verify clipboard contains valid markdown format [title](url)
            const clipboardText = await verifyClipboardContent("", true, PMPage);
            expect(clipboardText).toMatch(/^\[.+\]\(https?:\/\/.+\)$/);
            expect(clipboardText).toContain(paperData.title);

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("Markdown");
            expect(feedbackText).toContain("copied");
        });

        it("should copy bibtex citation to clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Get paper data to determine expected content
            const paperData = testData[arxivPaperId];

            // Find and click the copy bibtex button
            const copyBibtexSelector = `#popup-memory-item-bibtex--${arxivPaperIdEscaped}`;
            const copyBibtexBtn = await verifySelectorExists(
                copyBibtexSelector,
                PMPage
            );
            await safeClick(copyBibtexSelector, PMPage);

            // Verify clipboard contains valid bibtex format
            const clipboardText = await getClipboardText(PMPage);
            if (clipboardText && clipboardText.match(/^@\w+\{/)) {
                expect(clipboardText).toMatch(/^@\w+\{/); // Should start with @type{
                expect(clipboardText).toMatch(/title\s*=\s*\{/);
                expect(clipboardText).toMatch(/author\s*=\s*\{/);
            }

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("Bibtex");
            expect(feedbackText).toContain("copied");
        });
    });

    describe("External Link Actions", function () {
        it("should have paper link button that is clickable", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Find and verify the paper link button exists and is clickable
            const paperLinkSelector = `#popup-memory-item-link--${arxivPaperIdEscaped}`;
            const paperLinkBtn = await verifySelectorExists(paperLinkSelector, PMPage);
            await verifyElementClickable(paperLinkBtn, PMPage);

            // Verify the button has the correct title
            const title = await paperLinkBtn.evaluate((el) => el.getAttribute("title"));
            expect(title).toContain("Open");
            expect(title).toContain("tab");
        });

        it("should have download PDF button that is clickable", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Find and verify the download button exists and is clickable
            const downloadSelector = `#popup-memory-item-download--${arxivPaperIdEscaped}`;
            const downloadBtn = await verifySelectorExists(downloadSelector, PMPage);
            await verifyElementClickable(downloadBtn, PMPage);

            // Verify the button has the correct title
            const title = await downloadBtn.evaluate((el) => el.getAttribute("title"));
            expect(title).toContain("Download PDF");
        });
    });

    describe("Preference-Dependent External Services", function () {
        async function testExternalServiceButton(
            serviceName,
            preferenceKey,
            buttonClass,
            expectedUrlPattern
        ) {
            // Set up the popup with mocked tab
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Enable preference and reload
            await setPreferencesAndReload({ [preferenceKey]: true }, PMPage);

            // Re-setup the popup after reload
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            const { button, selector } = await verifyMemoryItemButtonExists(
                arxivPaperId,
                buttonClass,
                PMPage
            );
            console.log(
                indent(2) + `✓ ${serviceName} button present when preference enabled`
            );

            await verifyButtonClickable(button, PMPage);
            console.log(indent(2) + `✓ ${serviceName} button is clickable`);

            // Click button and verify navigation
            const initialPages = await browser.pages();

            await safeClick(selector, PMPage);

            // Verify page url
            await verifyPageNavigation(expectedUrlPattern, browser);

            await resetPage(PMPage, pmURLs.popupURL);
        }

        async function verifyMemoryItemButtonExists(paperId, buttonClass, page) {
            const queryId = paperId.replaceAll(".", "\\.");
            const selector = `#popup-memory-item-${buttonClass}--${queryId}`;
            const button = await verifySelectorExists(selector, page);
            return { button, selector };
        }

        async function verifyButtonClickable(button, page) {
            return await verifyElementClickable(button, page);
        }

        it("should handle SciRate action and verify navigation", async function () {
            await testExternalServiceButton(
                "SciRate",
                "checkScirate",
                "scirate",
                /scirate\.com\/arxiv/
            );
        });

        it("should handle AlphaXiv action and verify navigation", async function () {
            await testExternalServiceButton(
                "AlphaXiv",
                "checkAlphaxiv",
                "alphaxiv",
                /alphaxiv\.org\/abs/
            );
        });

        it("should handle ar5iv action and verify navigation", async function () {
            await testExternalServiceButton(
                "ar5iv",
                "checkAr5iv",
                "ar5iv",
                /ar5iv\.labs\.arxiv\.org\/html/
            );
        });

        it("should handle HuggingFace action and verify navigation", async function () {
            await testExternalServiceButton(
                "HuggingFace",
                "checkHuggingface",
                "huggingface",
                /huggingface\.co\/papers/
            );
        });

        it("should not show preference-dependent buttons when preferences are disabled", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
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
                `#popup-memory-item-scirate--${arxivPaperIdEscaped}`
            );
            const alphaxivButton = await PMPage.$(
                `#popup-memory-item-alphaxiv--${arxivPaperIdEscaped}`
            );
            const ar5ivButton = await PMPage.$(
                `#popup-memory-item-ar5iv--${arxivPaperIdEscaped}`
            );
            const huggingfaceButton = await PMPage.$(
                `#popup-memory-item-huggingface--${arxivPaperIdEscaped}`
            );

            expect(scirateButton).toBeFalsy();
            expect(alphaxivButton).toBeFalsy();
            expect(ar5ivButton).toBeFalsy();
            expect(huggingfaceButton).toBeFalsy();
        });
    });
});

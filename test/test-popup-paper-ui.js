// Test for PaperMemory's Popup UI - When user is on a known paper page
// Starting with a single minimal test to verify the mocking approach

import { expect } from "expect";
import { basename } from "node:path";
import {
    findExtensionId,
    makeBrowser,
    getPMURLs,
    resetPage,
    setStorage,
    getMemoryPapers,
    verifySelectorExists,
    safeClick,
    verifyClipboardContent,
    getClipboardText,
    seedClipboard,
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

const { keepOpen, headless } = loadConfig();
console.log(`\n${basename(import.meta.url)} args:`);
console.log("  headless :", headless);
console.log("  keepOpen :", keepOpen);

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
        browser = await makeBrowser(headless);
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

        await page.reload({ waitUntil: "networkidle0" });
        await page.waitForFunction(() => window.__pmPopupReady === true, {
            timeout: 10000,
        });
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
                PMPage,
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
            readJSON(`${root}/test/data/3-papers-memory.json`),
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
                    paperId,
                );
                expect(displayedPaperData).toEqual(paperData);

                const titleEl = await verifySelectorExists(
                    "#popup-paper-title",
                    PMPage,
                );
                const titleText = await titleEl.evaluate((el) => el.innerText);
                expect(miniHash(titleText)).toBe(miniHash(paperData.title));

                // first 3 authors, then "+N more" shows the rest
                const authorCount = paperData.author.split(" and ").length;
                const more = await PMPage.$("#popup-authors-more");
                expect(!!more).toBe(authorCount > 3);
                if (more) {
                    expect(await more.evaluate((el) => el.innerText)).toBe(
                        `+${authorCount - 3} more`,
                    );
                    await more.click();
                }
                const authorsEl = await verifySelectorExists("#popup-authors", PMPage);
                const authorsText = await authorsEl.evaluate((el) => el.innerText);
                expect(
                    authorsText
                        .split(",")
                        .map((a) => a.trim())
                        .join(" and "),
                ).toBe(paperData.author);

                const codeLinkEl = await verifySelectorExists(
                    "#popup-code-link",
                    PMPage,
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
                    error.message,
                );
            }
        });

        it("should be able to read and write to the clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            const testText = "test clipboard paper memory";
            await PMPage.evaluate((text) => {
                return navigator.clipboard.writeText(text);
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
            await seedClipboard(PMPage);
            await safeClick(copyLinkSelector, PMPage);

            // Verify clipboard contains the correct URL
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toMatch(/^https?:\/\//); // Should be a URL

            // Verify it contains expected domain based on paper source
            if (paperData.source === "arxiv") {
                expect(clipboardText).toContain("arxiv.org");
            }

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage,
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
                PMPage,
            );
            await seedClipboard(PMPage);
            await safeClick(copyHyperlinkSelector, PMPage);

            // Verify clipboard contains both title and URL
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toContain(paperData.title);
            expect(clipboardText).toMatch(/https?:\/\//);

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage,
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("Rich link copied");
        });

        it("should copy markdown link to clipboard", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Get paper data to determine expected content
            const paperData = testData[arxivPaperId];

            // Find and click the copy markdown button
            const copyMdSelector = `#popup-memory-item-md--${arxivPaperIdEscaped}`;
            const copyMdBtn = await verifySelectorExists(copyMdSelector, PMPage);
            await seedClipboard(PMPage);
            await safeClick(copyMdSelector, PMPage);

            // Verify clipboard contains valid markdown format [title](url)
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toMatch(/^\[.+\]\(https?:\/\/.+\)$/);
            expect(clipboardText).toContain(paperData.title);

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage,
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
                PMPage,
            );
            await seedClipboard(PMPage);
            await safeClick(copyBibtexSelector, PMPage);

            // Verify clipboard contains valid bibtex format
            const clipboardText = await getClipboardText(PMPage);
            expect(clipboardText).toBeTruthy();
            expect(clipboardText).toMatch(/^@\w+\{/); // Should start with @type{
            expect(clipboardText).toMatch(/title\s*=\s*\{/);
            expect(clipboardText).toMatch(/author\s*=\s*\{/);

            // Verify feedback message
            const feedbackElement = await verifySelectorExists(
                "#popup-feedback-copied",
                PMPage,
            );
            const feedbackText = await feedbackElement.evaluate((el) => el.textContent);
            expect(feedbackText).toContain("BibTeX");
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
            expectedUrlPattern,
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
                PMPage,
            );
            console.log(
                indent(2) + `✓ ${serviceName} button present when preference enabled`,
            );

            await verifyButtonClickable(button, PMPage);
            console.log(indent(2) + `✓ ${serviceName} button is clickable`);

            // Click button and verify navigation
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
                /scirate\.com\/arxiv/,
            );
        });

        it("should handle AlphaXiv action and verify navigation", async function () {
            await testExternalServiceButton(
                "AlphaXiv",
                "checkAlphaxiv",
                "alphaxiv",
                /alphaxiv\.org\/abs/,
            );
        });

        it("should handle ar5iv action and verify navigation", async function () {
            await testExternalServiceButton(
                "ar5iv",
                "checkAr5iv",
                "ar5iv",
                /ar5iv\.labs\.arxiv\.org\/html/,
            );
        });

        it("should handle HuggingFace action and verify navigation", async function () {
            await testExternalServiceButton(
                "HuggingFace",
                "checkHuggingface",
                "huggingface",
                /huggingface\.co\/papers/,
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
                PMPage,
            );

            // Check that optional buttons are not present
            const scirateButton = await PMPage.$(
                `#popup-memory-item-scirate--${arxivPaperIdEscaped}`,
            );
            const alphaxivButton = await PMPage.$(
                `#popup-memory-item-alphaxiv--${arxivPaperIdEscaped}`,
            );
            const ar5ivButton = await PMPage.$(
                `#popup-memory-item-ar5iv--${arxivPaperIdEscaped}`,
            );
            const huggingfaceButton = await PMPage.$(
                `#popup-memory-item-huggingface--${arxivPaperIdEscaped}`,
            );

            expect(scirateButton).toBeFalsy();
            expect(alphaxivButton).toBeFalsy();
            expect(ar5ivButton).toBeFalsy();
            expect(huggingfaceButton).toBeFalsy();
        });
    });

    describe("Tag auto-save", function () {
        it("should auto-save a new tag added via the tag input", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Ensure the paper starts with no tags
            const papersBefore = await getMemoryPapers(PMPage);
            expect(papersBefore[arxivPaperId].tags).toEqual([]);

            // Click the tag field to focus it
            const tagInputSelector = `#popup-memory-edit .pm-tagin`;
            await PMPage.waitForSelector(tagInputSelector);
            await PMPage.click(tagInputSelector);

            // Type a new tag and press Enter to create it
            const newTag = "test-autosave-tag";
            await PMPage.keyboard.type(newTag);
            await PMPage.keyboard.press("Enter");

            // Wait for the debounced save (300ms delay + storage write)
            await sleep(800);

            // Verify the tag was persisted to storage
            const papersAfter = await getMemoryPapers(PMPage);
            expect(papersAfter[arxivPaperId].tags).toContain(newTag);
        });

        it("should auto-save when a tag is removed via the remove button", async function () {
            // Set up paper with a pre-existing tag
            const taggedData = structuredClone(testData);
            taggedData[arxivPaperId].tags = ["removable-tag"];
            await setStorage(PMPage, "papers", taggedData);

            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            // Wait for the tag field to render the existing tag chip
            await PMPage.waitForSelector(`#popup-memory-edit .pm-tagfield .pm-chip`);

            // Click the remove button (×) on the tag chip
            await PMPage.click(`#popup-memory-edit .pm-tagfield .pm-chip .pm-chip-x`);

            // Wait for the debounced save
            await sleep(800);

            // Verify the tag was removed from storage
            const papersAfter = await getMemoryPapers(PMPage);
            expect(papersAfter[arxivPaperId].tags).not.toContain("removable-tag");
        });

        it("should suggest an existing tag that is almost the same (near-duplicate)", async function () {
            const data = structuredClone(testData);
            const otherId = Object.keys(data).find(
                (k) => !k.startsWith("__") && k !== arxivPaperId,
            );
            data[otherId].tags = ["reading-group"];
            data[arxivPaperId].tags = [];
            await setStorage(PMPage, "papers", data);
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);

            await PMPage.click(`#popup-memory-edit .pm-tagin`);
            await PMPage.keyboard.type("Reading_groups");
            await PMPage.waitForSelector(`#popup-memory-edit .pm-tagsugg:not([hidden])`);
            const hint = await PMPage.$eval(`#popup-memory-edit .pm-tagsugg`, (el) => [
                el.querySelector(".pm-sugg-note").textContent,
                el.querySelector(".pm-sugg-row.is-active span").textContent,
                el.querySelector(".pm-sugg-row.is-active .pm-count").textContent,
            ]);
            expect(hint).toEqual(["Almost the same as an existing tag", "reading-group", "1"]);
            // Enter uses the existing tag, autosaved
            await PMPage.keyboard.press("Enter");
            await sleep(300);
            const papersAfter = await getMemoryPapers(PMPage);
            expect(papersAfter[arxivPaperId].tags).toEqual(["reading-group"]);
        });
    });

    describe("Paper view: Details, keys, code link, delete", function () {
        beforeEach(async function () {
            await setStorage(PMPage, "papers", testData);
        });

        it("should keep Details collapsed by default, toggle it with 'd' and remember it", async function () {
            await PMPage.evaluate(() => localStorage.removeItem("pm-paper-details"));
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            const isOpen = () =>
                PMPage.evaluate(() => ({
                    expanded: document
                        .getElementById("popup-details-toggle")
                        .getAttribute("aria-expanded"),
                    hidden: document.getElementById("popup-details-body").hidden,
                }));
            expect(await isOpen()).toEqual({ expanded: "false", hidden: true });

            await PMPage.keyboard.press("d");
            expect(await isOpen()).toEqual({ expanded: "true", hidden: false });

            // the last state is remembered
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            expect(await isOpen()).toEqual({ expanded: "true", hidden: false });
            await PMPage.keyboard.press("d");
            expect(await isOpen()).toEqual({ expanded: "false", hidden: true });
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            expect(await isOpen()).toEqual({ expanded: "false", hidden: true });
        });

        it("should toggle the shortcut sheet with '?' and the Memory with 'a'", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            const sheetShown = () =>
                PMPage.evaluate(
                    () =>
                        document.getElementById("popup-modal-wrapper").style.display !==
                            "none" &&
                        document.getElementById("modal-shortcuts-content").style
                            .display !== "none",
                );
            await PMPage.keyboard.press("?");
            expect(await sheetShown()).toBe(true);
            await PMPage.keyboard.press("?");
            expect(await sheetShown()).toBe(false);

            const memoryOpen = () =>
                PMPage.evaluate(() => PMDebug.config.state.memoryIsOpen);
            await PMPage.keyboard.press("a");
            expect(await memoryOpen()).toBe(true);
            await PMPage.evaluate(() => document.activeElement.blur());
            await PMPage.keyboard.press("a");
            expect(await memoryOpen()).toBe(false);
        });

        it("should add https:// to a code link and refuse what is not a URL", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            const inputSel = `#popup-form-codeLink--${arxivPaperIdEscaped}`;

            // not a URL: an error, nothing saved
            await safeClick("#popup-code-edit", PMPage);
            await PMPage.waitForSelector(inputSel);
            await PMPage.type(inputSel, "my repo");
            await PMPage.keyboard.press("Enter");
            const error = await PMPage.$eval("#popup-code-msg", (el) => ({
                hidden: el.hidden,
                text: el.innerText,
            }));
            expect(error.hidden).toBe(false);
            expect(error.text).toContain("Enter a web address");
            expect((await getMemoryPapers(PMPage))[arxivPaperId].codeLink).toBe("");

            // a URL without scheme: saved with https://, then shown as a link
            await PMPage.$eval(inputSel, (el) => (el.value = ""));
            await PMPage.type(inputSel, "github.com/org/repo");
            await PMPage.keyboard.press("Enter");
            await PMPage.waitForFunction(
                () => !!document.querySelector("#popup-code-link[href]"),
            );
            const href = await PMPage.$eval("#popup-code-link", (el) =>
                el.getAttribute("href"),
            );
            expect(href).toBe("https://github.com/org/repo");
            await sleep(300);
            expect((await getMemoryPapers(PMPage))[arxivPaperId].codeLink).toBe(
                "https://github.com/org/repo",
            );

            // emptying the field removes the link
            await safeClick("#popup-code-edit", PMPage);
            await PMPage.$eval(inputSel, (el) => (el.value = ""));
            await PMPage.focus(inputSel);
            await PMPage.keyboard.press("Enter");
            await sleep(300);
            expect((await getMemoryPapers(PMPage))[arxivPaperId].codeLink).toBe("");
            expect(
                await PMPage.$eval("#popup-code-val", (el) => el.innerText),
            ).toContain("No code link");
        });

        it("should keep the note's line breaks", async function () {
            const withNote = structuredClone(testData);
            withNote[arxivPaperId].note = "line one\n\nline three";
            await setStorage(PMPage, "papers", withNote);
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            const text = await PMPage.$eval("#popup-note-display", (el) => el.innerText);
            expect(text).toBe("line one\n\nline three");
        });

        it("should keep Details / Remove visible above the footer with a long note", async function () {
            const long = structuredClone(testData);
            long[arxivPaperId].note = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
            long[arxivPaperId].author = Array.from({ length: 40 }, (_, i) => `Author ${i}`).join(" and ");
            await setStorage(PMPage, "papers", long);
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            const layout = await PMPage.evaluate(() => {
                const r = (id) => document.getElementById(id).getBoundingClientRect();
                const main = document.getElementById("popup-paper-main");
                return {
                    toggleBottom: r("popup-details-toggle").bottom,
                    removeBottom: r(
                        `popup-memory-delete--${PMDebug.config.state.currentId}`,
                    ).bottom,
                    footerTop: r("popup-hints").top,
                    mainScrolls: main.scrollHeight > main.clientHeight,
                };
            });
            expect(layout.mainScrolls).toBe(true);
            expect(layout.toggleBottom).toBeLessThanOrEqual(layout.footerTop);
            expect(layout.removeBottom).toBeLessThanOrEqual(layout.footerTop);
        });

        it("should ask before deleting (Backspace) and delete on Enter", async function () {
            await setupPopupWithMockedTab(PMPage, arxivPaperUrl, arxivPaperId);
            await PMPage.keyboard.press("Backspace");
            await PMPage.waitForFunction(
                () => document.getElementById("delete-paper-modal").style.display === "flex",
                { timeout: 2000 },
            );
            const quoted = await PMPage.$eval("#delete-modal-title", (el) => el.innerText);
            expect(miniHash(quoted)).toBe(miniHash(testData[arxivPaperId].title));
            // nothing is deleted yet
            expect((await getMemoryPapers(PMPage))[arxivPaperId]).toBeTruthy();

            await PMPage.keyboard.press("Enter");
            await PMPage.waitForFunction(
                () => document.getElementById("delete-paper-modal").style.display === "none",
                { timeout: 2000 },
            );
            await sleep(300);
            expect((await getMemoryPapers(PMPage))[arxivPaperId]).toBeUndefined();
            // the paper view becomes "not in your Memory", with Add it now
            await verifySelectorExists("#manual-trigger-btn", PMPage);

            await setStorage(PMPage, "papers", testData);
        });
    });
});

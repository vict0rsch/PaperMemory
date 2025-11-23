import { expect } from "expect";
import {
    findExtensionId,
    makeBrowser,
    getPMURLs,
    resetPage,
    verifySelectorExists,
    safeClick,
    verifyElementClickable,
    setStorage,
    getClipboardText,
    visitPaperPage,
} from "./browser.js";

import {
    loadConfig,
    root,
    loadPaperMemoryUtils,
    indent,
    readJSON,
} from "./utilsForTests.js";

await loadPaperMemoryUtils();

const { keepOpen, headless } = loadConfig();

describe("Popup Menu Tests", function () {
    var browser;
    var extensionId;
    var pmURLs;
    var PMPage;
    var arxivPaperId;
    var escapedArxivPaperId;
    var arxivPaperUrl;
    var testData;

    this.timeout(60000);
    this.slow(30000);

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless);
        PMPage = (await browser.pages())[0];

        extensionId = await findExtensionId(browser);
        if (!extensionId) {
            throw new Error("Extension ID not found - extension not loaded properly");
        }

        pmURLs = getPMURLs(extensionId);

        // 1. Load popup to initialize PMDebug/extension context
        await resetPage(PMPage, pmURLs.popupURL);
        await PMPage.waitForFunction(() => typeof window.PMDebug !== "undefined");

        // 2. Load test data
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        const paperIds = Object.keys(testData).filter((key) => !key.startsWith("__"));
        arxivPaperId = paperIds.find((key) => testData[key].source === "arxiv");
        escapedArxivPaperId = arxivPaperId.replace(/\./g, "\\.");
        arxivPaperUrl = testData[arxivPaperId].pdfLink;

        // 3. Set up test data in storage
        await setStorage(PMPage, "papers", testData);
        await setStorage(PMPage, "prefs", { checkDirectOpen: false });

        // 4. Mock chrome APIs for the page
        await PMPage.evaluateOnNewDocument((url) => {
            window.chrome = window.chrome || {};
            window.chrome.tabs = window.chrome.tabs || {};
            window.chrome.tabs.query = (queryInfo, callback) => {
                const returnUrl = window.__mockTabUrl || url;
                callback([{ url: returnUrl, id: 1 }]);
            };
            window.chrome.tabs.update = (arg1, arg2, arg3) => {
                let props = typeof arg1 === "object" ? arg1 : arg2;
                window.__lastTabUpdate = props;
                if (typeof arg2 === "function") arg2();
                if (typeof arg3 === "function") arg3();
            };
            window.chrome.tabs.create = (props, callback) => {
                window.__lastTabCreate = props;
                if (callback) callback();
            };
            window.chrome.downloads = window.chrome.downloads || {};
            window.chrome.downloads.search = (query, callback) => {
                const mockFiles = window.__mockFiles || [];
                callback(mockFiles);
            };
            // Mock window.close to prevent popup from closing and crashing tests
            window.close = () => {
                console.log("[Mock] window.close called");
            };
        }, arxivPaperUrl);

        // 5. Grant permissions
        const context = browser.defaultBrowserContext();
        await context.overridePermissions(pmURLs.popupURL, [
            "clipboard-read",
            "clipboard-sanitized-write",
            "clipboard-write",
        ]);

        // 6. Reload popup to apply mocks and data
        await resetPage(PMPage, pmURLs.popupURL);
    });

    after(async function () {
        if (browser && !keepOpen) {
            console.log(indent(1) + "Closing browser.");
            await browser.close();
        }
    });

    // Helper to check menu visibility
    async function isMenuVisible(page) {
        return await page.evaluate(() => {
            const menu = document.getElementById("menu-container");
            return menu && menu.style.display !== "none";
        });
    }

    // Helper to set a preference safely
    async function setPreference(page, key, value) {
        await page.evaluate(
            async ({ key, value }) => {
                const current = (await PMDebug.data.getStorage("prefs")) || {};
                current[key] = value;
                await PMDebug.data.setStorage("prefs", current);
            },
            { key, value }
        );
        await page.reload();
        await page.waitForFunction(() => typeof window.PMDebug !== "undefined");

        // Verify
        const val = await page.evaluate(async (key) => {
            return (await PMDebug.data.getStorage("prefs"))[key];
        }, key);
        if (val !== value) {
            await page.evaluate(
                async ({ key, value }) => {
                    const current = (await PMDebug.data.getStorage("prefs")) || {};
                    current[key] = value;
                    await PMDebug.data.setStorage("prefs", current);
                },
                { key, value }
            );
            await page.reload();
            await page.waitForFunction(() => typeof window.PMDebug !== "undefined");
        }
    }

    describe("Menu Visibility", function () {
        it("should be hidden by default", async function () {
            await resetPage(PMPage, pmURLs.popupURL);
            const visible = await isMenuVisible(PMPage);
            expect(visible).toBe(false);
        });

        it("should open when clicking the menu button", async function () {
            await PMPage.waitForSelector("#menu-switch", {
                visible: true,
                timeout: 10000,
            });
            await verifyElementClickable(
                await verifySelectorExists("#menu-switch", PMPage),
                PMPage
            );
            await safeClick("#menu-switch", PMPage);
            // Wait for animation/display change
            await PMPage.waitForFunction(
                () =>
                    document.getElementById("menu-container").style.display !== "none",
                { timeout: 5000 }
            );
            const visible = await isMenuVisible(PMPage);
            expect(visible).toBe(true);
        });

        it("should close when clicking the menu button again", async function () {
            await safeClick("#menu-switch", PMPage);
            await PMPage.waitForFunction(
                () =>
                    document.getElementById("menu-container").style.display === "none",
                { timeout: 5000 }
            );
            const visible = await isMenuVisible(PMPage);
            expect(visible).toBe(false);
        });

        it("should open with keyboard shortcut 'p'", async function () {
            await PMPage.keyboard.press("p");
            await PMPage.waitForFunction(
                () =>
                    document.getElementById("menu-container").style.display !== "none",
                { timeout: 5000 }
            );
            const visible = await isMenuVisible(PMPage);
            expect(visible).toBe(true);
        });

        it("should close with Escape key", async function () {
            await PMPage.keyboard.press("Escape");
            await PMPage.waitForFunction(
                () =>
                    document.getElementById("menu-container").style.display === "none",
                { timeout: 5000 }
            );
            const visible = await isMenuVisible(PMPage);
            expect(visible).toBe(false);
        });
    });

    describe("Configuration Options - Logic verification", function () {
        // --- checkPreferPdf ---
        describe("checkPreferPdf", function () {
            it("should copy PDF link when checkPreferPdf is true", async function () {
                await setPreference(PMPage, "checkPreferPdf", true);
                const copyLinkSelector = `#popup-memory-item-copy-link--${escapedArxivPaperId}`;
                await safeClick(copyLinkSelector, PMPage);
                const clipboardText = await getClipboardText(PMPage);
                expect(clipboardText).toContain(".pdf");
                expect(clipboardText).not.toContain("/abs/");
            });

            it("should copy Abstract link when checkPreferPdf is false", async function () {
                await setPreference(PMPage, "checkPreferPdf", false);
                const copyLinkSelector = `#popup-memory-item-copy-link--${escapedArxivPaperId}`;
                await safeClick(copyLinkSelector, PMPage);
                const clipboardText = await getClipboardText(PMPage);
                expect(clipboardText).not.toContain(".pdf");
                expect(clipboardText).toContain("/abs/");
            });
        });

        // --- checkMdYearVenue ---
        describe("checkMdYearVenue", function () {
            it("should include year and venue in markdown link when enabled", async function () {
                await setPreference(PMPage, "checkMdYearVenue", true);
                const copyMdSelector = `#popup-memory-item-md--${escapedArxivPaperId}`;
                await safeClick(copyMdSelector, PMPage);
                const clipboardText = await getClipboardText(PMPage);
                const paper = testData[arxivPaperId];
                expect(clipboardText).toContain(paper.year);
                if (paper.venue) {
                    expect(clipboardText).toContain(paper.venue);
                }
            });

            it("should NOT include year and venue in markdown link when disabled", async function () {
                await setPreference(PMPage, "checkMdYearVenue", false);
                const copyMdSelector = `#popup-memory-item-md--${escapedArxivPaperId}`;
                await safeClick(copyMdSelector, PMPage);
                const clipboardText = await getClipboardText(PMPage);
                // We check strict format [Title](Link)
                const match = clipboardText.match(/^\[(.*)\]\((.*)\)$/);
                expect(match).toBeTruthy();
                const titleInMd = match[1];
                expect(titleInMd).toBe(testData[arxivPaperId].title);
            });
        });

        // --- checkScirate ---
        describe("checkScirate", function () {
            it("should show SciRate button when enabled (for ArXiv) and open link", async function () {
                await setPreference(PMPage, "checkScirate", true);
                const selector = `#popup-memory-item-scirate--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeTruthy();

                // Verify click opens correct URL
                await safeClick(selector, PMPage);
                const lastUpdate = await PMPage.evaluate(() => window.__lastTabUpdate);
                expect(lastUpdate).toBeTruthy();
                expect(lastUpdate.url).toContain("scirate.com/arxiv/");
            });

            it("should NOT show SciRate button when disabled", async function () {
                await setPreference(PMPage, "checkScirate", false);
                const selector = `#popup-memory-item-scirate--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeNull();
            });
        });

        // --- checkAlphaxiv ---
        describe("checkAlphaxiv", function () {
            it("should show AlphaXiv button when enabled (for ArXiv) and open link", async function () {
                await setPreference(PMPage, "checkAlphaxiv", true);
                const selector = `#popup-memory-item-alphaxiv--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeTruthy();

                // Verify click opens correct URL
                await safeClick(selector, PMPage);
                const lastUpdate = await PMPage.evaluate(() => window.__lastTabUpdate);
                expect(lastUpdate).toBeTruthy();
                expect(lastUpdate.url).toContain("alphaxiv.org/abs/");
            });

            it("should NOT show AlphaXiv button when disabled", async function () {
                await setPreference(PMPage, "checkAlphaxiv", false);
                const selector = `#popup-memory-item-alphaxiv--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeNull();
            });
        });

        // --- checkAr5iv ---
        describe("checkAr5iv", function () {
            it("should show Ar5iv button when enabled (for ArXiv) and open link", async function () {
                await setPreference(PMPage, "checkAr5iv", true);
                const selector = `#popup-memory-item-ar5iv--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeTruthy();

                await safeClick(selector, PMPage);
                const lastUpdate = await PMPage.evaluate(() => window.__lastTabUpdate);
                expect(lastUpdate).toBeTruthy();
                expect(lastUpdate.url).toContain("ar5iv.labs.arxiv.org/html/");
            });

            it("should NOT show Ar5iv button when disabled", async function () {
                await setPreference(PMPage, "checkAr5iv", false);
                const selector = `#popup-memory-item-ar5iv--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeNull();
            });
        });

        // --- checkHuggingface ---
        describe("checkHuggingface", function () {
            it("should show HuggingFace button when enabled (for ArXiv) and open link", async function () {
                await setPreference(PMPage, "checkHuggingface", true);
                const selector = `#popup-memory-item-huggingface--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeTruthy();

                await safeClick(selector, PMPage);
                const lastUpdate = await PMPage.evaluate(() => window.__lastTabUpdate);
                expect(lastUpdate).toBeTruthy();
                expect(lastUpdate.url).toContain("huggingface.co/papers/");
            });

            it("should NOT show HuggingFace button when disabled", async function () {
                await setPreference(PMPage, "checkHuggingface", false);
                const selector = `#popup-memory-item-huggingface--${escapedArxivPaperId}`;
                const exists = await PMPage.$(selector);
                expect(exists).toBeNull();
            });
        });

        // --- checkDirectOpen ---
        describe("checkDirectOpen", function () {
            it("should NOT switch to memory view if on a paper page, even if enabled", async function () {
                await setPreference(PMPage, "checkDirectOpen", true);
                const memoryContainer = await PMPage.$("#memory-container");
                const isVisible = await memoryContainer.evaluate(
                    (el) => el.style.display !== "none"
                );
                expect(isVisible).toBe(false);
            });

            it("should switch to memory view if not on a paper page when enabled", async function () {
                await setPreference(PMPage, "checkDirectOpen", true);
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = "https://google.com";
                });
                await PMPage.reload();
                await PMPage.waitForFunction(
                    () => typeof window.PMDebug !== "undefined"
                );

                const memoryContainer = await PMPage.$("#memory-container");
                const isVisible = await memoryContainer.evaluate(
                    (el) => el.style.display !== "none"
                );
                expect(isVisible).toBe(true);
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = null;
                });
                await PMPage.reload();
            });
        });

        // --- checkWebsiteParsing ---
        describe("checkWebsiteParsing", function () {
            it("should show manual parsing button when enabled", async function () {
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = "https://google.com";
                });

                await setPreference(PMPage, "checkWebsiteParsing", true);

                const selector = "#website-trigger-btn";
                await PMPage.waitForSelector(selector, { timeout: 2000 });
                const exists = await PMPage.$(selector);
                expect(exists).toBeTruthy();

                // Cleanup
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = null;
                });
                await setPreference(PMPage, "checkWebsiteParsing", false);
            });

            it("should NOT show manual parsing button when disabled", async function () {
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = "https://google.com";
                });

                await setPreference(PMPage, "checkWebsiteParsing", false);

                const selector = "#website-trigger-btn";
                await PMPage.evaluate(() => new Promise((r) => setTimeout(r, 500)));
                const exists = await PMPage.$(selector);
                expect(exists).toBeNull();

                // Cleanup
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = null;
                });
                // await PMPage.reload();
            });
        });

        // --- checkStore ---
        describe("checkStore", function () {
            it("should show Open Local button when enabled and file exists", async function () {
                const paperTitle = testData[arxivPaperId].title;
                // Mock file existence
                await PMPage.evaluateOnNewDocument(
                    (url, title) => {
                        window.__mockFiles = [
                            {
                                id: 123,
                                url: url,
                                finalUrl: url,
                                state: "complete",
                                exists: true,
                                filename: `PaperMemoryStore/${title}.pdf`,
                            },
                        ];
                    },
                    arxivPaperUrl,
                    paperTitle
                );

                await setPreference(PMPage, "checkStore", true);

                const btnId = `popup-memory-item-openLocal--${arxivPaperId}`;
                await PMPage.waitForFunction(
                    (id) => !!document.getElementById(id),
                    { timeout: 5000 },
                    btnId
                );
                const exists = await PMPage.evaluate(
                    (id) => !!document.getElementById(id),
                    btnId
                );
                expect(exists).toBe(true);

                // Cleanup
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockFiles = [];
                });
                await setPreference(PMPage, "checkStore", false);
            });

            it("should show Download button when disabled even if file exists", async function () {
                const paperTitle = testData[arxivPaperId].title;
                // Mock file existence
                await PMPage.evaluateOnNewDocument(
                    (url, title) => {
                        window.__mockFiles = [
                            {
                                id: 123,
                                url: url,
                                finalUrl: url,
                                state: "complete",
                                exists: true,
                                filename: `PaperMemoryStore/${title}.pdf`,
                            },
                        ];
                    },
                    arxivPaperUrl,
                    paperTitle
                );

                await setPreference(PMPage, "checkStore", false);

                const btnId = `popup-memory-item-download--${arxivPaperId}`;
                await PMPage.waitForFunction(
                    (id) => !!document.getElementById(id),
                    { timeout: 5000 },
                    btnId
                );
                const exists = await PMPage.evaluate(
                    (id) => !!document.getElementById(id),
                    btnId
                );
                expect(exists).toBe(true);

                // Cleanup
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockFiles = [];
                });
                await PMPage.reload();
            });
        });

        // --- checkDarkMode ---
        describe("checkDarkMode", function () {
            it("should enable dark mode css when enabled", async function () {
                await setPreference(PMPage, "checkDarkMode", true);
                const hasDarkMode = await PMPage.evaluate(() => {
                    const links = Array.from(document.querySelectorAll("link"));
                    return links.some((l) => l.href.includes("dark.min.css"));
                });
                expect(hasDarkMode).toBe(true);
            });

            it("should disable dark mode css when disabled", async function () {
                await setPreference(PMPage, "checkDarkMode", false);
                const hasDarkMode = await PMPage.evaluate(() => {
                    const links = Array.from(document.querySelectorAll("link"));
                    return links.some((l) => l.href.includes("dark.min.css"));
                });
                expect(hasDarkMode).toBe(false);
            });
        });

        // --- checkNoAuto ---
        describe("checkNoAuto", function () {
            it("should disable auto recording and show manual trigger button", async function () {
                // 1. Enable checkDirectOpen AND checkNoAuto
                await setPreference(PMPage, "checkDirectOpen", true);
                await setPreference(PMPage, "checkNoAuto", true);

                // 2. Verify memory is NOT open (checkDirectOpen suppressed) for a non-memory URL
                const unknownPaperUrl = "https://arxiv.org/abs/2301.00001";
                const paperId = "2301.00001";

                // Use visitPaperPage to visit the url with a new page
                const paperPage = await browser.newPage();
                await visitPaperPage(browser, unknownPaperUrl, {
                    page: paperPage,
                    timeout: 4000, // Wait to ensure it DOESN'T parse
                    keepOpen: true,
                });

                // Now verify storage from the popup page (PMPage)
                await PMPage.bringToFront();
                await PMPage.reload();
                await PMPage.waitForFunction(
                    () => typeof window.PMDebug !== "undefined"
                );

                // 3. Verify memory is NOT open (checkDirectOpen suppressed)
                const memoryContainer = await PMPage.$("#memory-container");
                const isHidden = await memoryContainer.evaluate(
                    (el) => el.style.display === "none"
                );
                expect(isHidden).toBe(true);

                // 4. Verify paper is NOT in storage
                const papers = await PMPage.evaluate(async () => {
                    return await PMDebug.data.getStorage("papers");
                });
                expect(papers[paperId]).toBeUndefined();

                // 5. Verify "Try manual trigger" button exists and is visible
                // Update mock to make popup think it's on the paper page
                await PMPage.evaluateOnNewDocument((url) => {
                    window.__mockTabUrl = url;
                    Object.defineProperty(navigator, "userAgent", {
                        get: () =>
                            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
                    });
                }, unknownPaperUrl);
                await PMPage.reload();
                await PMPage.waitForFunction(
                    () => typeof window.PMDebug !== "undefined"
                );

                const manualBtnSelector = "#manual-trigger-btn";
                await verifySelectorExists(manualBtnSelector, PMPage);
                const btnVisible = await PMPage.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    return el && el.offsetParent !== null;
                }, manualBtnSelector);
                expect(btnVisible).toBe(true);

                // Cleanup
                await paperPage.close();
                await setPreference(PMPage, "checkNoAuto", false);
                await setPreference(PMPage, "checkDirectOpen", false);
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockTabUrl = null;
                });
                await PMPage.reload();
            });
        });

        // --- checkEnterLocalPdf ---
        describe("checkEnterLocalPdf", function () {
            it("should try to open local file when pressing 'o' if checkEnterLocalPdf is true", async function () {
                // Mock file existence, chrome.downloads.open and chrome.tabs.create
                await PMPage.evaluateOnNewDocument((url) => {
                    window.__mockFiles = [
                        {
                            id: 123,
                            url: url,
                            finalUrl: url,
                            state: "complete",
                            exists: true,
                            filename: "PaperMemoryStore/test_paper.pdf",
                        },
                    ];
                    window.chrome = window.chrome || {};
                    window.chrome.downloads = window.chrome.downloads || {};
                    window.chrome.downloads.open = (id) => {
                        window.__mockDownloadsOpenId = id;
                    };
                    window.chrome.tabs = window.chrome.tabs || {};
                    window.chrome.tabs.create = (props) => {
                        window.__mockTabsCreate = props;
                    };
                    window.chrome.tabs.update = (id, props) => {
                        window.__mockTabsUpdate = { id, props };
                    };
                }, arxivPaperUrl);

                await setPreference(PMPage, "checkEnterLocalPdf", true);
                await setPreference(PMPage, "checkStore", true);

                // Open memory view
                await PMPage.keyboard.press("a");
                await PMPage.waitForFunction(
                    () =>
                        document.getElementById("memory-container").style.display !==
                        "none"
                );

                // Focus the memory item
                const itemSelector = `#memory-container--${escapedArxivPaperId}`;
                // Use evaluate to focus because PMPage.focus might be flaky with custom divs
                await PMPage.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (el) el.focus();
                }, itemSelector);

                // Press 'o'
                await PMPage.keyboard.press("o");

                // Check if download opened
                try {
                    await PMPage.waitForFunction(
                        () => window.__mockDownloadsOpenId !== undefined,
                        { timeout: 2000 }
                    );
                    const openedId = await PMPage.evaluate(
                        () => window.__mockDownloadsOpenId
                    );
                    expect(openedId).toBe(123);
                } catch (e) {
                    // If failed, check if it tried to open a tab instead (fallback)
                    const tabOpened = await PMPage.evaluate(
                        () => window.__mockTabsCreate || window.__mockTabsUpdate
                    );
                    if (tabOpened) {
                        throw new Error(
                            `Expected download open, but got tab open: ${JSON.stringify(
                                tabOpened
                            )}`
                        );
                    }
                    throw e;
                }

                // Cleanup
                await setPreference(PMPage, "checkEnterLocalPdf", false);
                await PMPage.evaluateOnNewDocument(() => {
                    window.__mockFiles = [];
                    window.__mockDownloadsOpenId = undefined;
                    window.__mockTabsCreate = undefined;
                    window.__mockTabsUpdate = undefined;
                });
                await PMPage.reload();
            });
        });
    });

    describe("Configuration Options - Storage verification", function () {
        const checkboxes = [
            "checkDownload",
            "checkMd",
            "checkBib",
            "checkFeedback",
            "checkDarkMode",
            "checkDirectOpen",
            "checkPdfTitle",
            "checkScirate",
            "checkAlphaxiv",
            "checkAr5iv",
            "checkHuggingface",
            "checkMdYearVenue",
            "checkPreferPdf",
            "checkPdfOnly",
            "checkEnterLocalPdf",
            "checkStore",
            "checkWebsiteParsing",
        ];

        before(async function () {
            // Open menu for all tests in this block
            await resetPage(PMPage, pmURLs.popupURL);
            await safeClick("#menu-switch", PMPage);
            await PMPage.waitForFunction(
                () => document.getElementById("menu-container").style.display !== "none"
            );
        });

        for (const checkboxId of checkboxes) {
            it(`should toggle ${checkboxId} and update storage`, async function () {
                const selector = `#${checkboxId}`;
                await verifySelectorExists(selector, PMPage);

                // Get initial state
                const initialChecked = await PMPage.evaluate((sel) => {
                    return document.querySelector(sel).checked;
                }, selector);

                // Click to toggle
                await safeClick(selector, PMPage);

                // Verify DOM update
                const newChecked = await PMPage.evaluate((sel) => {
                    return document.querySelector(sel).checked;
                }, selector);
                expect(newChecked).toBe(!initialChecked);

                // Verify Storage update
                const storedPrefs = await PMPage.evaluate(() => {
                    return new Promise((resolve) => {
                        chrome.storage.local.get("prefs", (result) => {
                            resolve(result.prefs || {});
                        });
                    });
                });
                expect(storedPrefs[checkboxId]).toBe(newChecked);

                // Toggle back to restore state
                await safeClick(selector, PMPage);
            });
        }
    });

    describe("Menu Links and Actions", function () {
        before(async function () {
            await resetPage(PMPage, pmURLs.popupURL);
            await safeClick("#menu-switch", PMPage);
        });

        it("should have a functioning User Guide button and display shortcuts", async function () {
            // The user guide button opens a modal
            await safeClick("#keyboardShortcutsMenu", PMPage);
            // Verify modal is open
            await PMPage.waitForSelector("#popup-modal-wrapper", { visible: true });
            const modalVisible = await PMPage.evaluate(() => {
                const modal = document.getElementById("popup-modal-wrapper");
                return modal && modal.style.display !== "none";
            });
            expect(modalVisible).toBe(true);

            // Verify shortcuts list is populated
            const shortcuts = await PMPage.$$eval(
                "#user-guide-shortcuts-ul li",
                (els) => els.map((e) => e.innerText)
            );
            expect(shortcuts.length).toBeGreaterThan(0);
            // Check for a known shortcut description
            expect(shortcuts.some((s) => s.includes("Open the paper"))).toBe(true);

            // Close modal
            await safeClick("#close-popup-modal", PMPage);
        });

        it("should have links to external tools", async function () {
            const links = [
                { id: "bib-matcher", text: "BibMatcher" },
                { id: "full-memory", text: "full-page memory" },
                { id: "advanced-configuration", text: "options page" },
            ];

            for (const link of links) {
                const el = await verifySelectorExists(`#${link.id}`, PMPage);
                const text = await el.evaluate((node) => node.innerText);
                // Just checking the element exists and is visible in the menu
                expect(text).toContain(link.text);
            }
        });

        it("should display PaperMemory version", async function () {
            const versionEl = await verifySelectorExists("#pm-version", PMPage);
            const versionText = await versionEl.evaluate((el) => el.innerText);
            const packageJson = readJSON(`${root}/package.json`);
            expect(versionText).toBe(packageJson.version);
        });
    });

    describe("Default Action Configuration", function () {
        it("should change default action and affect Enter key behavior", async function () {
            // 1. Open menu
            await resetPage(PMPage, pmURLs.popupURL);
            await safeClick("#menu-switch", PMPage);

            // 2. Change default action to "Copy Link" (value="c")
            const selector = "#memory-item-default-action";
            await verifySelectorExists(selector, PMPage);
            await PMPage.select(selector, "c");

            // 3. Verify storage update
            const storedAction = await PMPage.evaluate(() => {
                return new Promise((resolve) => {
                    chrome.storage.local.get("defaultKeyboardAction", (result) => {
                        resolve(result.defaultKeyboardAction);
                    });
                });
            });
            expect(storedAction).toBe("c");

            // 4. Close menu
            await safeClick("#menu-switch", PMPage);

            // 5. Setup: Ensure memory is open and we have a paper
            await PMPage.keyboard.press("a"); // Open memory
            await PMPage.waitForFunction(
                () =>
                    document.getElementById("memory-container").style.display !== "none"
            );

            // 6. Focus a memory item and press Enter
            // Ensure clipboard is empty first
            await PMPage.evaluate(() => navigator.clipboard.writeText(""));

            const itemSelector = `#memory-container--${escapedArxivPaperId}`;
            await PMPage.focus(itemSelector);
            await PMPage.keyboard.press("Enter");

            // 7. Verify "Copy Link" behavior (check clipboard)
            const clipboardText = await getClipboardText(PMPage);
            // Should contain the pdf link or abs link depending on prefs, but certainly arxiv.org
            expect(clipboardText).toContain("arxiv.org");

            // Cleanup: Reset to 'o'
            await PMPage.evaluate(() => {
                chrome.storage.local.set({ defaultKeyboardAction: "o" });
            });
        });
    });
});

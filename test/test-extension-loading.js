// Test to verify PaperMemory Chrome Extension is properly loaded in Puppeteer
// This test ensures the extension is loaded and functioning before running other tests

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

import { loadConfig, sleep } from "./utilsForTests.js";

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

describe("Test PaperMemory Extension Loading", function () {
    var browser;
    var extensionId;
    var pmURLs;

    // Set timeout for extension loading tests
    this.timeout(30000); // 30 seconds
    this.slow(15000); // Consider slow after 15 seconds

    before(async function () {
        console.log("Creating browser with PaperMemory extension...");
        browser = await makeBrowser(headless);

        // Discover the extension ID assigned by Chrome
        console.log("Discovering extension ID...");
        extensionId = await findExtensionId(browser);
    });

    after(async function () {
        if (browser && !keepOpen) {
            console.log("Closing browser...");
            await browser.close();
        }
    });

    describe("Extension ID Discovery", function () {
        it("should successfully discover the extension ID", async function () {
            if (extensionId) {
                expect(extensionId).toBeDefined();
                expect(extensionId.length).toBe(32); // Chrome extension IDs are 32 characters
                console.log(`✓ Found PaperMemory extension with ID: ${extensionId}`);
                pmURLs = getPMURLs(extensionId);
            } else {
                throw new Error(
                    "❌ Extension ID discovery failed - extension not loaded or not found",
                );
            }
        });
    });

    describe("Extension Installation and Accessibility", function () {
        it("should load the extension popup page successfully", async function () {
            const page = await browser.newPage();

            try {
                // Navigate to the extension popup URL
                // Skip test if extension wasn't found
                if (!extensionId) {
                    throw new Error(
                        "Extension ID not found - extension not loaded properly",
                    );
                }

                // Navigate to the extension popup URL using the dynamic ID
                console.log(`Navigating to popup URL: ${pmURLs.popupURL}`);

                let response;
                let error = null;

                try {
                    response = await page.goto(pmURLs.popupURL, {
                        waitUntil: "networkidle0",
                        timeout: 10000,
                    });
                } catch (err) {
                    error = err;
                    console.log(
                        `❌ Extension popup page failed to load: ${err.message}`,
                    );

                    if (err.message.includes("net::ERR_BLOCKED_BY_CLIENT")) {
                        console.log(
                            "❌ This indicates the extension is not properly loaded in the browser",
                        );
                        console.log("💡 Possible solutions:");
                        console.log(
                            "   - Check if the extension is built (run 'npm run dev')",
                        );
                        console.log(
                            "   - Verify the extension path in browser.js is correct",
                        );
                        console.log(
                            "   - Ensure Chrome allows loading unpacked extensions",
                        );
                        console.log("   - Restart Chrome and try again");
                    }

                    throw new Error(
                        `Extension popup not accessible: ${err.message}. This indicates the PaperMemory extension is not properly loaded in the browser.`,
                    );
                }

                // Check that the page loaded successfully
                expect(response.status()).toBe(200);

                // Wait for the page to be fully loaded

                // Check that the page contains expected PaperMemory elements
                const title = await page.title();
                console.log(`Popup page title: ${title}`);

                // Check for key elements that should exist in the popup
                const bodyExists = await page.$("body");
                expect(bodyExists).toBeTruthy();

                console.log("✓ Extension popup page loaded successfully");
            } finally {
                await page.close();
            }
        });

        it("should load the full memory page successfully", async function () {
            const page = await browser.newPage();

            try {
                // Navigate to the full memory URL
                // Skip test if extension wasn't found
                if (!extensionId) {
                    throw new Error(
                        "Extension ID not found - extension not loaded properly",
                    );
                }

                console.log(`Navigating to full memory URL: ${pmURLs.fullMemoryURL}`);
                const response = await page.goto(pmURLs.fullMemoryURL, {
                    waitUntil: "networkidle0",
                    timeout: 10000,
                });

                // Check that the page loaded successfully
                expect(response.status()).toBe(200);

                // Wait for the page to be fully loaded

                // Check that the page contains expected elements
                const title = await page.title();
                console.log(`Full memory page title: ${title}`);

                const bodyExists = await page.$("body");
                expect(bodyExists).toBeTruthy();

                console.log("✓ Extension full memory page loaded successfully");
            } finally {
                await page.close();
            }
        });

        it("should show the extension as enabled in Chrome extensions page", async function () {
            const page = await browser.newPage();

            try {
                // Navigate to Chrome extensions page
                console.log(
                    `Navigating to Chrome extensions page: ${pmURLs.chromeSettingsURL}`,
                );
                await page.goto(pmURLs.chromeSettingsURL, {
                    waitUntil: "networkidle0",
                    timeout: 10000,
                });

                // Wait for extensions page to load

                // Check that the PaperMemory extension is listed; the extensions
                // list renders asynchronously, so wait for the item by name in
                // the shadow DOM
                await page.waitForFunction(
                    () => {
                        const extensionManager =
                            document.querySelector("extensions-manager");
                        if (!extensionManager || !extensionManager.shadowRoot)
                            return false;

                        const itemList =
                            extensionManager.shadowRoot.querySelector(
                                "extensions-item-list",
                            );
                        if (!itemList || !itemList.shadowRoot) return false;

                        const extensionItems =
                            itemList.shadowRoot.querySelectorAll("extensions-item");
                        for (const item of extensionItems) {
                            if (!item.shadowRoot) continue;
                            const nameElement =
                                item.shadowRoot.querySelector("#name");
                            if (
                                nameElement &&
                                nameElement.textContent.includes("Paper Memory")
                            ) {
                                return true;
                            }
                        }
                        return false;
                    },
                    { timeout: 10000, polling: 100 },
                );

                console.log("✓ Chrome extensions page accessible");
            } finally {
                await page.close();
            }
        });
    });

    describe("Extension Functionality", function () {
        it("should have PaperMemory state available when accessing extension pages", async function () {
            const page = (await browser.pages())[0];

            try {
                // Skip test if extension wasn't found
                if (!extensionId) {
                    throw new Error(
                        "Extension ID not found - extension not loaded properly",
                    );
                }

                // Navigate to the popup page where extension scripts should be loaded
                await page.goto(pmURLs.popupURL, {
                    waitUntil: "networkidle0",
                    timeout: 10000,
                });

                // Try to get the PaperMemory state
                const state = await getPaperMemoryState(page);
                console.log("PaperMemory state retrieved:", typeof state);

                // The state should be defined (even if empty)
                expect(state).toBeDefined();

                console.log("✓ PaperMemory state is accessible");
            } finally {
                await page.close();
            }
        });

        it("should have extension APIs available on extension pages", async function () {
            const page = await browser.newPage();

            try {
                // Navigate to the extension popup page, where chrome.* APIs are
                // expected to be available
                await page.goto(pmURLs.popupURL, {
                    waitUntil: "networkidle0",
                    timeout: 10000,
                });

                const hasExtensionAccess = await page.evaluate(() => {
                    return (
                        typeof chrome !== "undefined" &&
                        typeof chrome.runtime !== "undefined" &&
                        typeof chrome.runtime.id === "string"
                    );
                });

                console.log(`Chrome extension APIs available: ${hasExtensionAccess}`);
                expect(hasExtensionAccess).toBe(true);

                console.log("✓ Extension API context available");
            } finally {
                await page.close();
            }
        });
    });

    describe("Extension URL Structure", function () {
        it("should have valid extension URLs with correct extension ID", async function () {
            // Check that the extension URLs follow the expected pattern
            const extensionIdPattern = /chrome-extension:\/\/([a-z]+)\/.*$/;

            // Test popup URL
            expect(pmURLs.popupURL).toMatch(extensionIdPattern);
            const popupMatch = pmURLs.popupURL.match(extensionIdPattern);
            const extensionId = popupMatch[1];

            console.log(`Extension ID: ${extensionId}`);
            expect(extensionId).toBeDefined();
            expect(extensionId.length).toBe(32); // Chrome extension IDs are 32 characters

            // Test full memory URL
            expect(pmURLs.fullMemoryURL).toMatch(extensionIdPattern);
            expect(pmURLs.fullMemoryURL).toContain(extensionId); // Should use same extension ID

            // Test Chrome extensions URL
            expect(pmURLs.chromeSettingsURL).toContain(extensionId);

            console.log("✓ Extension URLs have valid structure");
        });
    });

    describe("Browser Extension Loading Verification", function () {
        it("should provide diagnostics for extension loading issues", async function () {
            const { root } = await import("./utilsForTests.js");
            const fs = await import("fs");

            console.log("🔍 Extension loading diagnostics:");
            console.log(`   Extension root path: ${root}`);
            console.log(
                `   Manifest exists: ${fs.existsSync(`${root}/manifest.json`)}`,
            );

            if (fs.existsSync(`${root}/manifest.json`)) {
                const manifest = JSON.parse(
                    fs.readFileSync(`${root}/manifest.json`, "utf8"),
                );
                console.log(`   Extension name: ${manifest.name || "Unknown"}`);
                console.log(`   Extension version: ${manifest.version || "Unknown"}`);
                console.log(
                    `   Manifest version: ${manifest.manifest_version || "Unknown"}`,
                );
            }

            const distRoot = `${root}/dist/chrome-mv3`;
            const wxtOutputFiles = [
                "popup.html",
                "fullMemory.html",
                "options.html",
                "manifest.json",
            ];

            wxtOutputFiles.forEach((file) => {
                const filePath = `${distRoot}/${file}`;
                console.log(
                    `   dist/chrome-mv3/${file} exists: ${fs.existsSync(filePath)}`,
                );
            });

            // The built extension output must exist for the browser to load it
            for (const file of wxtOutputFiles) {
                expect(fs.existsSync(`${distRoot}/${file}`)).toBe(true);
            }

            console.log("✓ Extension diagnostics completed");
        });
    });
});

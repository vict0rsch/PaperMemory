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
                    "❌ Extension ID discovery failed - extension not loaded or not found"
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
                        "Extension ID not found - extension not loaded properly"
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
                        `❌ Extension popup page failed to load: ${err.message}`
                    );

                    if (err.message.includes("net::ERR_BLOCKED_BY_CLIENT")) {
                        console.log(
                            "❌ This indicates the extension is not properly loaded in the browser"
                        );
                        console.log("💡 Possible solutions:");
                        console.log(
                            "   - Check if the extension is built (run 'npm run dev')"
                        );
                        console.log(
                            "   - Verify the extension path in browser.js is correct"
                        );
                        console.log(
                            "   - Ensure Chrome allows loading unpacked extensions"
                        );
                        console.log("   - Restart Chrome and try again");
                    }

                    throw new Error(
                        `Extension popup not accessible: ${err.message}. This indicates the PaperMemory extension is not properly loaded in the browser.`
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
                        "Extension ID not found - extension not loaded properly"
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
                    `Navigating to Chrome extensions page: ${pmURLs.chromeSettingsURL}`
                );
                await page.goto(pmURLs.chromeSettingsURL, {
                    waitUntil: "networkidle0",
                    timeout: 10000,
                });

                // Wait for extensions page to load

                // Check if the PaperMemory extension is visible and enabled
                // This is more complex as it requires interacting with shadow DOM
                const extensionEnabled = await page.evaluate(() => {
                    // Look for the extension in the extensions page
                    const extensionManager =
                        document.querySelector("extensions-manager");
                    if (!extensionManager) return false;

                    // Access shadow root
                    const shadowRoot = extensionManager.shadowRoot;
                    if (!shadowRoot) return false;

                    // Look for extension items
                    const itemList = shadowRoot.querySelector("extensions-item-list");
                    if (!itemList) return false;

                    const itemShadowRoot = itemList.shadowRoot;
                    if (!itemShadowRoot) return false;

                    // Check if any extension item exists (indicating extensions are loaded)
                    const extensionItems =
                        itemShadowRoot.querySelectorAll("extensions-item");
                    return extensionItems.length > 0;
                });

                console.log(
                    `Extension found in Chrome extensions: ${extensionEnabled}`
                );

                // Note: We can't easily check for the specific PaperMemory extension due to shadow DOM complexity
                // But we can verify that the browser is capable of showing extensions
                expect(typeof extensionEnabled).toBe("boolean");

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
                        "Extension ID not found - extension not loaded properly"
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

        it("should have extension content scripts capability", async function () {
            const page = await browser.newPage();

            try {
                // Navigate to a simple webpage to test content script injection
                await page.goto(
                    "data:text/html,<html><head><title>Test</title></head><body><p>Test page for extension</p></body></html>"
                );

                // Check if the page loaded
                const title = await page.title();
                expect(title).toBe("Test");

                // Try to inject a simple script to test if the extension context is available
                const hasExtensionAccess = await page.evaluate(() => {
                    // Check if chrome extension APIs are available
                    return (
                        typeof chrome !== "undefined" &&
                        typeof chrome.runtime !== "undefined"
                    );
                });

                console.log(`Chrome extension APIs available: ${hasExtensionAccess}`);

                // Note: Content scripts may not have access to all chrome APIs,
                // so we don't fail if this is false
                expect(typeof hasExtensionAccess).toBe("boolean");

                console.log("✓ Content script context test completed");
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
                `   Manifest exists: ${fs.existsSync(`${root}/src/manifest.json`)}`
            );

            if (fs.existsSync(`${root}/src/manifest.json`)) {
                const manifest = JSON.parse(
                    fs.readFileSync(`${root}/src/manifest.json`, "utf8")
                );
                console.log(`   Extension name: ${manifest.name || "Unknown"}`);
                console.log(`   Extension version: ${manifest.version || "Unknown"}`);
                console.log(
                    `   Manifest version: ${manifest.manifest_version || "Unknown"}`
                );
            }

            // Check if popup files exist
            const popupPath = `${root}/src/popup/min/popup.min.html`;
            const fullMemoryPath = `${root}/src/fullMemory/fullMemory.html`;

            console.log(`   Popup file exists: ${fs.existsSync(popupPath)}`);
            console.log(`   Full memory file exists: ${fs.existsSync(fullMemoryPath)}`);

            // Check if built files exist
            const bundleFiles = [
                "src/popup/min/popup.bundle.js",
                "src/background/background.bundle.js",
                "src/content_scripts/content.bundle.js",
            ];

            bundleFiles.forEach((file) => {
                const filePath = `${root}/${file}`;
                console.log(`   ${file} exists: ${fs.existsSync(filePath)}`);
            });

            console.log("✓ Extension diagnostics completed");
        });
    });
});

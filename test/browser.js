import { expect } from "expect";

import puppeteer from "puppeteer";
import { sleep, root } from "./utilsForTests.js";
import fs from "fs";

export const makeBrowser = async (headless = false, windowSize = "1200,900") => {
    const browser = await puppeteer.launch({
        headless,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            `--load-extension=${root}`,
            `--window-size=${windowSize}`,
            "--user-agent=PuppeteerAgent",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-web-security", // Allow clipboard access
            "--disable-dev-shm-usage",
            "--disable-gpu",
        ],
    });
    return browser;
};

export const getMemoryPapers = async (page) => {
    return await page.evaluate(
        () =>
            new Promise(async (resolve) => {
                resolve(await PMDebug.data.getStorage("papers"));
            })
    );
};

export const getPaperMemoryState = async (page) => {
    return await page.evaluate(
        () =>
            new Promise(async (resolve, reject) => {
                try {
                    resolve(PMDebug.config.state);
                } catch (e) {
                    reject(e);
                }
            })
    );
};

export const visitPaperPage = async (browser, target, options = {}) => {
    const defaults = {
        page: null,
        timeout: null,
        keepOpen: false,
        dontScreenshot: false,
    };
    const opts = { ...defaults, ...options };

    const p = opts.page || (await browser.pages())[0] || (await browser.newPage());
    await p.goto(target);
    const paperIsStored = new Promise((resolve, reject) => {
        let screenshotTimeout;
        p.waitForSelector("meta[name='pm-complete-secret-html']")
            .then(() => {
                clearTimeout(screenshotTimeout);
                resolve();
            })
            .catch(() => {
                // Ignore errors (e.g. timeout or target closed)
            });
        screenshotTimeout = setTimeout(async () => {
            const element = await p.evaluate(() => {
                return document.querySelector("meta[name='pm-complete-secret-html']");
            });
            if (!element && !opts.dontScreenshot) {
                console.log(`No element found: taking a screenshot`);
                if (!fs.existsSync(`${root}/tmp`)) {
                    console.log(`Creating tmp directory in ${root}/tmp`);
                    fs.mkdirSync(`${root}/tmp`);
                }
                let screenshotName = `screenshot_${Date.now()}_${target
                    .replaceAll("https://", "")
                    .replaceAll("/", "__")}.jpg`;
                screenshotName = screenshotName
                    .replace(/[^a-zA-Z0-9\-_\.]/g, "")
                    .slice(0, 100);
                const screenshotPath = `${root}/tmp/${screenshotName}`;
                await p.screenshot({
                    path: screenshotPath,
                    fullPage: true,
                });
                console.log(`Screenshot taken and saved to ${screenshotPath}\n\n`);
            }
            resolve();
        }, 5000);
    });
    opts.timeout > 0 && (await paperIsStored);
    opts.timeout > 0 && (await sleep(opts.timeout));
    !opts.keepOpen && (await p.close());
};

// Helper function to find the actual extension ID from the Chrome extensions page
export const findExtensionId = async (browser) => {
    const page = await browser.newPage();
    try {
        await page.goto("chrome://extensions/", { waitUntil: "networkidle0" });

        // Extract extension IDs from the page
        const extensionId = await page.evaluate(() => {
            const extensionManager = document.querySelector("extensions-manager");
            if (!extensionManager || !extensionManager.shadowRoot) return null;

            const itemList =
                extensionManager.shadowRoot.querySelector("extensions-item-list");
            if (!itemList || !itemList.shadowRoot) return null;

            const extensionItems =
                itemList.shadowRoot.querySelectorAll("extensions-item");
            for (const item of extensionItems) {
                if (!item.shadowRoot) continue;

                const nameElement = item.shadowRoot.querySelector("#name");
                if (nameElement && nameElement.textContent.includes("Paper Memory")) {
                    return item.id;
                }
            }
            return null;
        });

        return extensionId;
    } finally {
        await page.close();
    }
};

export const baseExtensionPopupURL =
    "chrome-extension://{EXTENSION_ID}/src/popup/min/popup.min.html";
export const baseFullMemoryURL =
    "chrome-extension://{EXTENSION_ID}/src/fullMemory/fullMemory.html?noRefresh=true";
export const baseChromeExtensionsURL = "chrome://extensions/?id={EXTENSION_ID}";

/**
 * Get the URLs for the PaperMemory extension.
 * @param {string} extensionId - The ID of the PaperMemory extension.
 * @returns {Object} An object with the URLs for the PaperMemory extension.
 */
export const getPMURLs = (extensionId) => {
    return {
        popupURL: baseExtensionPopupURL.replace("{EXTENSION_ID}", extensionId),
        fullMemoryURL: baseFullMemoryURL.replace("{EXTENSION_ID}", extensionId),
        chromeSettingsURL: baseChromeExtensionsURL.replace(
            "{EXTENSION_ID}",
            extensionId
        ),
    };
};

export const resetPage = async (page, url) => {
    await page.goto(url, {
        waitUntil: "networkidle0",
    });
    await page.bringToFront();
};

export const setStorage = async (page, key, value) =>
    await page.evaluate(
        ({ key, value }) => {
            return new Promise(async (resolve) => {
                await PMDebug.data.setStorage(key, value);
                resolve();
            });
        },
        { key, value }
    );

export const verifySelectorExists = async (selector, page) => {
    // Wait for button to be present
    await page.waitForSelector(selector, { timeout: 2000 });
    const el = await page.$(selector);
    expect(el).toBeTruthy();
    return el;
};

export const verifyElementClickable = async (el, page) => {
    const isClickable = await page.evaluate(
        (el) =>
            el &&
            !el.disabled &&
            getComputedStyle(el).pointerEvents !== "none" &&
            getComputedStyle(el).visibility !== "hidden" &&
            getComputedStyle(el).opacity !== "0",
        el
    );
    expect(isClickable).toBe(true);
    return isClickable;
};

export const getURL = async (page) => {
    let documentState = null;
    while (documentState !== "complete") {
        documentState && (await sleep(50));
        documentState = await page.evaluate(() => document.readyState);
    }
    let url = await page.evaluate(() => document.location.href);
    while (url === "about:blank") {
        await sleep(50);
        url = await page.evaluate(() => document.location.href);
    }
    return url;
};

export const safeClick = async (selector, page) => {
    // Wait for element and ensure it's clickable
    await page.waitForSelector(selector, { visible: true, timeout: 3000 });

    // Scroll element into view
    await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (element) {
            element.scrollIntoView({ behavior: "instant", block: "center" });
        }
    }, selector);

    // Try to click
    try {
        await page.click(selector);
    } catch (error) {
        console.log(`   ⚠ Direct click failed for ${selector}, trying evaluate click`);
        await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) {
                element.click();
            }
        }, selector);
    }
    await sleep(100);
};

export const miniHash = async (str, page) => {
    return await page.evaluate(async (s) => {
        return await new Promise((resolve) => {
            resolve(PMDebug.functions.miniHash(s));
        });
    }, str);
};

export const setPreferencesAndReload = async (prefs, page) => {
    await page.evaluate((preferences) => {
        return new Promise(async (resolve) => {
            await PMDebug.data.setStorage("prefs", preferences);
            resolve();
        });
    }, prefs);

    await page.reload({ waitUntil: "networkidle0" });
};

export const getClipboardText = async (page) => {
    const indent = (n) => " ".repeat(n * 4);
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
                setTimeout(() => reject(new Error("Clipboard read timeout")), 1000)
            ),
        ]);
    } catch (error) {
        console.log(indent(3) + `⚠ Clipboard read failed: ${error.message}`);
        return null;
    }
};

export const verifyClipboardContent = async (
    expectedContent,
    partialMatch = false,
    page
) => {
    const clipboardText = await getClipboardText(page);
    expect(clipboardText).toBeTruthy();

    if (partialMatch) {
        expect(clipboardText).toContain(expectedContent);
    } else {
        expect(clipboardText).toBe(expectedContent);
    }
    return clipboardText;
};

export const verifyPageNavigation = async (expectedUrlPattern, browser) => {
    // Check if any existing or new page has the expected URL
    const allPages = await browser.pages();
    const allPagesAndURLs = await Promise.all(
        allPages.map(async (page) => {
            try {
                const url = await getURL(page);
                return { page, url };
            } catch (e) {
                return { page, url: null };
            }
        })
    );

    const matchingPageAndURL = allPagesAndURLs.find((pageAndURL) =>
        expectedUrlPattern.test
            ? expectedUrlPattern.test(pageAndURL.url)
            : pageAndURL.url && pageAndURL.url.includes(expectedUrlPattern)
    );

    expect(matchingPageAndURL).toBeTruthy();
    return matchingPageAndURL.page;
};

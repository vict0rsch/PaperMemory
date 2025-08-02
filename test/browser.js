import puppeteer from "puppeteer";
import { sleep, root } from "./utilsForTests.js";
import fs from "fs";

export const makeBrowser = async (windowSize = "1200,900") => {
    const browser = await puppeteer.launch({
        headless: false,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            `--load-extension=${root}`,
            `--window-size=${windowSize}`,
            "--user-agent=PuppeteerAgent",
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
    const defaults = { page: null, timeout: null, keepOpen: false };
    const opts = { ...defaults, ...options };

    const p = opts.page || (await browser.newPage());
    const paperIsStored = new Promise(
        (resolve) =>
            p.on("console", (msg) =>
                msg.text().match(/\[PM\]\s*Done processing paper/)
            ) && resolve()
    );
    await p.goto(target);
    await paperIsStored;
    opts.timeout && opts.timeout > 0 && (await sleep(opts.timeout));
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

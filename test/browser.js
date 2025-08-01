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
                resolve(await PMDebug.functions.getStorage("papers"));
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

export const extensionPopupURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html";
export const fullMemoryURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/fullMemory/fullMemory.html?noRefresh=true";
export const chromeExtensionsURL =
    "chrome://extensions/?id=ehchlpggdaffcncbeopdopnndhdjelbc";

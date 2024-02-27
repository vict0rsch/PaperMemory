const puppeteer = require("puppeteer");
const { sleep, root } = require("./utilsForTests");
const fs = require("fs");

exports.makeBrowser = async (windowSize = "1200,900") => {
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

exports.getMemoryPapers = async (page) => {
    return await page.evaluate(
        () =>
            new Promise(async (resolve) => {
                resolve(await getStorage("papers"));
            })
    );
};

exports.getPaperMemoryState = async (page) => {
    return await page.evaluate(
        () =>
            new Promise(async (resolve) => {
                resolve(global.state);
            })
    );
};

exports.visitPaperPage = async (browser, target, options = {}) => {
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

exports.extensionPopupURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html";
exports.fullMemoryURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/fullMemory/fullMemory.html?noRefresh=true";
exports.chromeExtensionsURL =
    "chrome://extensions/?id=ehchlpggdaffcncbeopdopnndhdjelbc";

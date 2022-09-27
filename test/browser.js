const puppeteer = require("puppeteer");

exports.makeBrowser = async (windowSize = "1200,900") => {
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revisionInfo = await browserFetcher.download("818858");
    const browser = await puppeteer.launch({
        executablePath: revisionInfo.executablePath,
        headless: false,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            "--load-extension=../",
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

    const paperIsStored = new Promise((resolve) => {
        p.on(
            "console",
            (msg) => msg.text().match(/\[PM\]\s*Done processing paper/) && resolve()
        );
        opts.timeout && opts.timeout > 0 && setTimeout(resolve, opts.timeout);
    });
    // asynchronously go to url
    p.goto(target);
    const pageIsLoaded = new Promise((resolve) => {
        p.once("load", resolve);
        opts.timeout && opts.timeout > 0 && setTimeout(resolve, opts.timeout);
    });
    await pageIsLoaded;
    await paperIsStored;
    !opts.keepOpen && (await p.close());
};

exports.extensionPopupURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html";
exports.fullMemoryURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/fullMemory/fullMemory.html?noRefresh=true";
exports.chromeExtensionsURL =
    "chrome://extensions/?id=ehchlpggdaffcncbeopdopnndhdjelbc";

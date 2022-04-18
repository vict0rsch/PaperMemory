const puppeteer = require("puppeteer");

exports.makeBrowser = async () => {
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revisionInfo = await browserFetcher.download("818858");
    const browser = await puppeteer.launch({
        executablePath: revisionInfo.executablePath,
        headless: false,
        ignoreHTTPSErrors: true,
        ignoreDefaultArgs: ["--disable-extensions"],
        args: [
            "--load-extension=../",
            `--window-size=500,600`,
            "--user-agent=PuppeteerAgent",
        ],
    });
    return browser;
};

exports.getMemoryData = async (page) => {
    return await page.evaluate(
        () =>
            new Promise(async (resolve) => {
                resolve(await getStorage("papers"));
            })
    );
};

exports.extensionPopupURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html";

const puppeteer = require("puppeteer");

// (async () => {
//     const browserFetcher = puppeteer.createBrowserFetcher();
//     const revisionInfo = await browserFetcher.download("818858");
//     const browser = await puppeteer.launch({
//         executablePath: revisionInfo.executablePath,
//         headless: false,
//         ignoreHTTPSErrors: true,
//         ignoreDefaultArgs: ["--disable-extensions"],
//         args: [
//             "--load-extension=../",
//             `--window-size=500,600`,
//             "--user-agent=PuppeteerAgent",
//         ],
//     });

//     const puppetPage = await browser.newPage();

//     // -------------------------------
//     // -----  Visit all sources  -----
//     // -------------------------------

//     let s = 0;
//     for (const source in testPages) {
//         if (s > -1) {
//             // dev: testing page loop but stopping here for now
//             break;
//         }
//         const pages = testPages[source];
//         let k = 0;
//         for (const page of pages) {
//             await puppetPage.goto(page);
//             await puppetPage.waitForTimeout(2000);
//             await puppetPage.screenshot({
//                 path: `../extra/archives/screenshots/${source}-${k}.png`,
//             });
//             k += 1;
//         }
//         s += 1;
//     }

//     await puppetPage.goto(
//         "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html"
//     );

//     // ----------------------------------
//     // -----  Load additional data  -----
//     // ----------------------------------

//     data = JSON.parse(fs.readFileSync("./testData.json"));
//     await puppetPage.evaluate((data) => {
//         setStorage("papers", data);
//     }, data);

//     await puppetPage.reload();

//     // Retrieve data from storage
//     const logged = await puppetPage.evaluate(
//         () =>
//             new Promise(async (resolve) => {
//                 resolve(await getStorage("papers"));
//             })
//     );

//     console.log(logged);
// })();

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

exports.extensionURL =
    "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html";

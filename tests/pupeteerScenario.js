const puppeteer = require("puppeteer");
const fs = require("fs");

var testPages = {
    arxiv: [
        "https://arxiv.org/abs/1703.10593",
        "https://arxiv.org/pdf/1703.10593v7.pdf",
    ],
    openreview: [
        "https://openreview.net/forum?id=EZNOb_uNpJk",
        "https://openreview.net/pdf?id=EZNOb_uNpJk",
    ],
    neurips: [
        "https://proceedings.neurips.cc/paper/2019/hash/0118a063b4aae95277f0bc1752c75abf-Abstract.html",
        "https://proceedings.neurips.cc/paper/2019/file/0118a063b4aae95277f0bc1752c75abf-Paper.pdf",
    ],
    biorxiv: [
        "https://www.biorxiv.org/content/10.1101/2021.11.08.467690v2",
        "https://www.biorxiv.org/content/10.1101/2021.11.08.467690v2.full.pdf",
    ],
    cvf: [
        "https://openaccess.thecvf.com/content_CVPR_2020/html/Bhattacharjee_DUNIT_Detection-Based_Unsupervised_Image-to-Image_Translation_CVPR_2020_paper.html",
        "https://openaccess.thecvf.com/content_CVPR_2020/papers/Bhattacharjee_DUNIT_Detection-Based_Unsupervised_Image-to-Image_Translation_CVPR_2020_paper.pdf",
    ],
    pmlr: [
        "https://proceedings.mlr.press/v130/husain21a.html",
        "https://proceedings.mlr.press/v130/husain21a/husain21a.pdf",
    ],
};

(async () => {
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

    const puppetPage = await browser.newPage();

    // -------------------------------
    // -----  Visit all sources  -----
    // -------------------------------

    let s = 0;
    for (const source in testPages) {
        if (s > -1) {
            // dev: testing page loop but stopping here for now
            break;
        }
        const pages = testPages[source];
        let k = 0;
        for (const page of pages) {
            await puppetPage.goto(page);
            await puppetPage.waitForTimeout(2000);
            await puppetPage.screenshot({
                path: `../extra/archives/screenshots/${source}-${k}.png`,
            });
            k += 1;
        }
        s += 1;
    }

    await puppetPage.goto(
        "chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/popup/min/popup.min.html"
    );

    // ----------------------------------
    // -----  Load additional data  -----
    // ----------------------------------

    data = JSON.parse(fs.readFileSync("./testData.json"));
    await puppetPage.evaluate((data) => {
        setStorage("papers", data);
    }, data);

    await puppetPage.reload();

    // Retrieve data from storage
    const logged = await puppetPage.evaluate(
        () =>
            new Promise(async (resolve) => {
                resolve(await getStorage("papers"));
            })
    );

    console.log(logged);
})();

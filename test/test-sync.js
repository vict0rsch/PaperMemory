const {
    makeBrowser,
    fullMemoryURL,
    extensionPopupURL,
    visitPaperPage,
} = require("./browser");
const { readJSON, sleep, loadPaperMemoryUtils } = require("./utilsForTests");

const pat = process.env.github_pat;

if (!pat) {
    throw new Error("Please specify `github_pat` env var.");
}

loadPaperMemoryUtils();

const setupSync = async (browser) => {
    const [page] = await browser.pages();
    await page.goto(extensionPopupURL);
    await page.evaluate(() => {
        warn(12);
        warn(5);
    });
    await page.evaluate(async () => {
        warn(12);
        warn(5);
    });
    await page.evaluate(async (pat) => {
        await setStorage("syncPAT", pat);
        await setStorage("syncState", true);
        await sendMessageToBackground({ type: "reSync" });
        info("syncState: ", await getStorage("syncState"));
    }, pat);
};

describe("Test Github Gist Sync", async function () {
    let urls = readJSON("./data/urls.json");
    urls = [urls["acl"][0], urls["arxiv"][0], urls["jmlr"][0]];

    let browsers = [await makeBrowser(), await makeBrowser()];

    const pages = await Promise.all(
        browsers.map(async (browser) => (await browser.pages())[0])
    );
    // Go to extension url on both devices
    await Promise.all(pages.map(async (page) => await page.goto(extensionPopupURL)));
    // Start syncing on device 1
    await setupSync(browsers[0]);
    // Go to paper pages on device 1
    await Promise.all(urls.map(async (url) => await visitPaperPage(browsers[0], url)));
    // Push papers from device 1
    await pages[0].evaluate(async () => await pushToRemote());
    // Wait a little
    await sleep(2000);
    // Setup sync on device 2
    await setupSync(browsers[1]);
    // Pull to devcie 2
    await pages[1].evaluate(async () => await pullFromRemote());
    // Wait a little
    await sleep(2000);
    // See full memories
    await Promise.all(pages.map(async (page) => await page.goto(fullMemoryURL)));
});

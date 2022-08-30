const {
    makeBrowser,
    fullMemoryURL,
    extensionPopupURL,
    visitPaperPage,
    getMemoryPapers,
} = require("./browser");
const { expect } = require("expect");

const { readJSON, sleep, loadPaperMemoryUtils, asyncMap } = require("./utilsForTests");

const pat = process.env.github_pat;
const keepOpen = !!(process.env.keepOpen ?? false);

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
        await sendMessageToBackground({ type: "restartGist" });
        info("syncState: ", await getStorage("syncState"));
    }, pat);
};

describe("Test Github Gist Sync", async function () {
    let urls = readJSON("./data/urls.json");
    urls = [urls["acl"][0], urls["arxiv"][0], urls["jmlr"][0]];

    this.slow(30 * 1000);
    this.timeout(30 * 2 * 1000);

    describe("Papers are added on Device 1 and pulled on Device 2", async function () {
        let pages, browsers;
        beforeEach(async function () {
            browsers = [await makeBrowser(), await makeBrowser()];

            pages = await asyncMap(
                browsers,
                async (browser) => (await browser.pages())[0]
            );
            // Go to extension url on both devices
            await asyncMap(pages, async (page) => await page.goto(extensionPopupURL));
            // Start syncing on device 1
            await setupSync(browsers[0]);
            // Go to paper pages on device 1
            await asyncMap(urls, async (url) => await visitPaperPage(browsers[0], url));
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
            await asyncMap(pages, async (page) => await page.goto(fullMemoryURL));
        });

        it("Memories are equal", async function () {
            // get all memories
            const memories = await asyncMap(pages, getMemoryPapers);
            expect(memories[0]).toEqual(memories[1]);
        });

        it("Removing a paper", async function () {
            await sleep(4000);
            const memory = await getMemoryPapers(pages[0]);
            const id = Object.keys(memory).filter((k) => !k.startsWith("_"))[0];
            console.log("id: ", id);
            await pages[0].evaluate(async (id) => {
                console.log("Before deletion: ", await getStorage("papers"));
                await deletePaperInStorage(id);
                console.log("After deletion: ", await getStorage("papers"));
                await pushToRemote();
            }, id);
            await sleep(2000);
            await pages[1].evaluate(async (id) => {
                await initSyncAndState();
            }, id);
            await sleep(2000);
            const memories = await asyncMap(pages, getMemoryPapers);
            expect(memories[0]).toEqual(memories[1]);
            expect(
                Object.keys(memories[0]).filter((k) => !k.startsWith("_")).length
            ).toEqual(urls.length - 1);
        });

        afterEach(async function () {
            if (!keepOpen) {
                await asyncMap(browsers, (browser) => browser.close());
            }
        });
    });
});

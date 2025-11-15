import {
    makeBrowser,
    getPMURLs,
    findExtensionId,
    getMemoryPapers,
    getPaperMemoryState,
} from "./browser.js";
import { expect } from "expect";
import {
    readJSON,
    sleep,
    asyncMap,
    loadConfig,
    loadPaperMemoryUtils,
} from "./utilsForTests.js";

const { keepOpen, headless } = loadConfig();
const pat = process.env.github_pat ?? process.env.pm_ghp;
console.log("headless :", headless);
console.log("keepOpen :", keepOpen);
// make all functions in utils.min.js available in the `global` scope
await loadPaperMemoryUtils();

var pmURLs;

if (!pat) {
    throw new Error("Please specify `github_pat` env var.");
}

const setupSync = async (browser, goto = true) => {
    const [page] = await browser.pages();
    if (goto) {
        await page.goto(pmURLs.fullMemoryURL, { waitUntil: "networkidle0" });
    }
    await page.evaluate(async (pat) => {
        const { setStorage, getStorage } = PMDebug.data;
        const { sendMessageToBackground, info } = PMDebug.functions;

        await setStorage("syncTest", true);
        await setStorage("syncPAT", pat);
        await setStorage("syncState", true);
        await sendMessageToBackground({ type: "restartGist" });
        info("syncState: ", await getStorage("syncState"));
    }, pat);
    // const state = await getPaperMemoryState(page);
    // console.log("setupSync -> Initial papers", Object.keys(state.papers));
};

describe("Test Github Gist Sync", async function () {
    let urls = readJSON("./test/data/urls.json");
    const miniMemory = readJSON("./test/data/3-papers-memory.json");
    urls = [urls["acl"][0], urls["arxiv"][0], urls["jmlr"][0]];

    this.slow(60e3);
    this.timeout(120e3);

    describe("Papers are added on Device 0 and pulled on Device 1", async function () {
        let pages, browsers, memories;
        before(async function () {
            browsers = [await makeBrowser(headless), await makeBrowser(headless)];
            pmURLs = getPMURLs(await findExtensionId(browsers[0]));

            pages = await asyncMap(
                browsers,
                async (browser) => (await browser.pages())[0]
            );
            // Go to extension url on both devices
            await asyncMap(
                pages,
                async (page) =>
                    await page.goto(pmURLs.popupURL, { waitUntil: "networkidle0" })
            );
            // Enable sync on both devices
            await asyncMap(browsers, setupSync);
            // Device 0 discovers papers
            await pages[0].evaluate(async (mem) => {
                await PMDebug.data.setStorage("papers", mem);
            }, miniMemory);
            // Push papers from device 0
            await pages[0].evaluate(async () => await PMDebug.sync.pushToRemote());
            await sleep(3000, "Waiting for push to remote");
            // Pull to device 1
            await pages[1].evaluate(async () => await PMDebug.sync.pullFromRemote());
            // See full memories
            await asyncMap(
                pages,
                async (page) =>
                    await page.goto(pmURLs.fullMemoryURL, { waitUntil: "networkidle0" })
            );
            await asyncMap(pages, async (page) => await page.reload());
            memories = await asyncMap(pages, getMemoryPapers);
        });

        it("Memories are equal", async function () {
            // get all memories
            expect(memories[0]).toEqual(memories[1]);
        });
        it("Memories contain as many papers as urls", async function () {
            // get all memories
            expect(
                Object.keys(memories[0]).filter((k) => !k.startsWith("_")).length
            ).toEqual(urls.length);
            expect(
                Object.keys(memories[1]).filter((k) => !k.startsWith("_")).length
            ).toEqual(urls.length);
        });
        it("Memories contain the right papers", async function () {
            // get all memories
            expect(
                Object.keys(memories[1]).filter((k) => !k.startsWith("_")).length
            ).toEqual(Object.keys(miniMemory).filter((k) => !k.startsWith("_")).length);
        });

        after(async function () {
            if (!keepOpen) {
                await asyncMap(browsers, (browser) => browser.close());
            }
            await sleep(1000, "After test timeout (1s)");
        });
    });

    describe("Removing a paper on Device 1", async function () {
        let memories, browsers, pages;
        before(async function () {
            browsers = [await makeBrowser(headless), await makeBrowser(headless)];

            pages = await asyncMap(
                browsers,
                async (browser) => (await browser.pages())[0]
            );
            // Go to extension url on both devices
            await asyncMap(
                pages,
                async (page) =>
                    await page.goto(pmURLs.fullMemoryURL, { waitUntil: "networkidle0" })
            );
            // Start syncing on device 1
            await asyncMap(browsers, (b) => setupSync(b, false));
            // Go to paper pages on device 0
            await asyncMap(
                pages,
                async (page) =>
                    await page.evaluate(async (mem) => {
                        await PMDebug.data.setStorage("papers", mem);
                        await PMDebug.state.initState();
                        await PMDebug.memory.makeMemoryHTML();
                    }, miniMemory)
            );
            // Push papers from device 0
            await pages[0].evaluate(async () => await PMDebug.sync.pushToRemote());
            await sleep(3000, "Waiting for push to remote");

            // console.log(
            //     "Memories before deletion: ",
            //     (await asyncMap(pages, getMemoryPapers)).map((papers) =>
            //         Object.keys(papers)
            //     )
            // );

            // Select paper id to delete
            const memory = await getMemoryPapers(pages[0]);
            const id = Object.keys(memory).find((k) => !k.startsWith("_"));

            // Delete paper on device 0 and push update
            await pages[0].evaluate(async (id) => {
                console.log(
                    "[test-sync] Before delete storage: ",
                    await PMDebug.data.getStorage("papers")
                );
                console.log(
                    "[test-sync] Before delete state: ",
                    PMDebug.config.state.papers
                );
                await PMDebug.data.deletePaperInStorage(id);
                console.log(
                    "[test-sync] After delete storage: ",
                    await PMDebug.data.getStorage("papers")
                );
                console.log(
                    "[test-sync] After delete state: ",
                    PMDebug.config.state.papers
                );
                await PMDebug.sync.pushToRemote();
                console.log(
                    "[test-sync] After push storage: ",
                    await PMDebug.data.getStorage("papers")
                );
                console.log(
                    "[test-sync] After push state: ",
                    PMDebug.config.state.papers
                );
            }, id);

            await pages[0].evaluate(() => {
                PMDebug.memory.makeMemoryHTML();
                console.log("[test-sync] New Memory HTML");
            });

            await pages[1].evaluate(async (id) => {
                console.log(
                    "[test-sync] Before pull: ",
                    await PMDebug.data.getStorage("papers")
                );
                await PMDebug.sync.initSyncAndState();
                console.log(
                    "[test-sync] After pull: ",
                    await PMDebug.data.getStorage("papers")
                );
            }, id);

            await pages[1].evaluate(() => {
                PMDebug.memory.makeMemoryHTML();
                console.log("[test-sync] New Memory HTML");
            });

            memories = await asyncMap(pages, getMemoryPapers);
        });

        it("Devices have the same number of papers", () => {
            expect(
                Object.keys(memories[0]).filter((k) => !k.startsWith("_")).length
            ).toEqual(
                Object.keys(memories[1]).filter((k) => !k.startsWith("_")).length
            );
        });
        it("Devices have 1 fewer paper than originally", () => {
            expect(
                Object.keys(memories[0]).filter((k) => !k.startsWith("_")).length
            ).toEqual(urls.length - 1);
        });
        it("Memories match exactly", () => {
            expect(memories[0]).toEqual(memories[1]);
        });

        after(async function () {
            if (!keepOpen) {
                await asyncMap(browsers, (browser) => browser.close());
            }
        });
    });
});

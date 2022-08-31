const {
    makeBrowser,
    fullMemoryURL,
    extensionPopupURL,
    getMemoryPapers,
    getPaperMemoryState,
} = require("./browser");
const { expect } = require("expect");
const { readJSON, sleep, asyncMap } = require("./utilsForTests");

const pat = process.env.github_pat ?? process.env.pm_ghp;
const keepOpen = !!(process.env.keepOpen ?? false);

if (!pat) {
    throw new Error("Please specify `github_pat` env var.");
}

const setupSync = async (browser, goto = true) => {
    const [page] = await browser.pages();
    goto && (await page.goto(extensionPopupURL));
    await page.evaluate(async (pat) => {
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
    let urls = readJSON("./data/urls.json");
    const miniMemory = readJSON("./data/3-papers-memory.json");
    urls = [urls["acl"][0], urls["arxiv"][0], urls["jmlr"][0]];

    this.slow(60e3);
    this.timeout(120e3);

    describe("Papers are added on Device 0 and pulled on Device 1", async function () {
        let pages, browsers, memories;
        before(async function () {
            browsers = [await makeBrowser(), await makeBrowser()];

            pages = await asyncMap(
                browsers,
                async (browser) => (await browser.pages())[0]
            );
            // Go to extension url on both devices
            await asyncMap(pages, async (page) => await page.goto(extensionPopupURL));
            // Enable sync on both devices
            await asyncMap(browsers, setupSync);
            // Device 0 discovers papers
            await pages[0].evaluate(async (mem) => {
                await setStorage("papers", mem);
            }, miniMemory);
            // Push papers from device 0
            await pages[0].evaluate(async () => await pushToRemote());
            // Pull to device 1
            await pages[1].evaluate(async () => await pullFromRemote());
            // See full memories
            await asyncMap(pages, async (page) => await page.goto(fullMemoryURL));
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
        });
    });

    describe("Removing a paper on Device 1", async function () {
        let memories, browsers;
        before(async function () {
            browsers = [await makeBrowser(), await makeBrowser()];

            pages = await asyncMap(
                browsers,
                async (browser) => (await browser.pages())[0]
            );
            // Go to extension url on both devices
            await asyncMap(pages, async (page) => await page.goto(fullMemoryURL));
            // Start syncing on device 1
            await asyncMap(browsers, (b) => setupSync(b, false));
            // Go to paper pages on device 0
            await asyncMap(
                pages,
                async (page) =>
                    await page.evaluate(async (mem) => {
                        await setStorage("papers", mem);
                        await initState();
                        await makeMemoryHTML();
                    }, miniMemory)
            );
            // Push papers from device 0
            await pages[0].evaluate(async () => await pushToRemote());

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
                    await getStorage("papers")
                );
                console.log("[test-sync] Before delete state: ", state.papers);
                await deletePaperInStorage(id);
                console.log(
                    "[test-sync] After delete storage: ",
                    await getStorage("papers")
                );
                console.log("[test-sync] After delete state: ", state.papers);
                await pushToRemote();
                console.log(
                    "[test-sync] After push storage: ",
                    await getStorage("papers")
                );
                console.log("[test-sync] After push state: ", state.papers);
            }, id);

            await pages[0].evaluate(() => {
                makeMemoryHTML();
                console.log("[test-sync] New Memory HTML");
            });

            await pages[1].evaluate(async (id) => {
                console.log("[test-sync] Before pull: ", await getStorage("papers"));
                await initSyncAndState();
                console.log("[test-sync] After pull: ", await getStorage("papers"));
            }, id);

            await pages[1].evaluate(() => {
                makeMemoryHTML();
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

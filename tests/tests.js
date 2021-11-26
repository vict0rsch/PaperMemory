const expect = require("expect");
const { makeBrowser, getMemoryData, extensionURL } = require("./browser");
const fs = require("fs");

describe("Test PaperMemory", () => {
    var browser, page;

    before(async () => {
        browser = await makeBrowser();
        page = await browser.newPage();
    });

    // it("Adds all sources to the Memory", async () => {});
    it("Adds all sources to the Memory", async () => {
        const urls = JSON.parse(fs.readFileSync("./data/urls.json"));
        let s = 0;
        for (const source in urls) {
            if (s > -1) {
                // dev: testing page loop but stopping here for now
                break;
            }
            const targets = urls[source];
            for (const target of targets) {
                await page.goto(target);
                await page.waitForTimeout(2000);
            }
            s += 1;
        }

        await page.goto(extensionURL);
        await page.waitForTimeout(2000);

        const memoryData = await getMemoryData(page);

        console.log(memoryData);
    });

    after(async () => {
        await browser.close();
    });
});

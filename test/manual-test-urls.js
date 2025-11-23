import { makeBrowser, visitPaperPage } from "./browser.js";
import { readJSON, sleep, root } from "./utilsForTests.js";

const testUrls = readJSON(`${root}/test/data/urls.json`);

const browser = await makeBrowser();

const options = {
    keepOpen: true,
    timeout: -1,
};

const gotToPaperPage = async (url) => {
    try {
        const page = await browser.newPage();
        await visitPaperPage(browser, url, {
            ...options,
            page,
        });
    } catch (error) {
        console.error(`Error visiting paper page ${url}:`, error);
    }
};

for (const [source, urls] of Object.entries(testUrls)) {
    if (urls[2]?.botPrevention) {
        console.log(
            `\nManual test for ${source} because it has bot prevention:\n  ${urls[0]}\n  ${urls[1]}`
        );
        await gotToPaperPage(urls[0]);
        await gotToPaperPage(urls[1]);
    }
}

console.log("Done");

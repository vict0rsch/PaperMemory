import { makeBrowser, visitPaperPage } from "./browser.js";
import { hasManualBotPrevention, readURLs } from "./utilsForTests.js";

const testUrls = readURLs();

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
    if (hasManualBotPrevention(urls)) {
        console.log(
            `\nManual test for ${source} because it has manual bot prevention:\n  ${urls[0]}\n  ${urls[1]}`,
        );
        await gotToPaperPage(urls[0]);
        await gotToPaperPage(urls[1]);
    }
}

console.log("Done");

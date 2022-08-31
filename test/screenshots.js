const { makeBrowser, extensionPopupURL } = require("./browser");

const nowStr = () => {
    d = new Date().toJSON();
    return d.replaceAll(":", "-").split(".")[0];
};

(async () => {
    const root = extensionPopupURL.split("/src/")[0];

    let capture = ["options", "menu"];
    if (process.env.capture) {
        if (capture.indexOf(process.env.capture) < 0) {
            throw new Error(`Unknown capture parameter ${process.env.capture}`);
        }
        capture = [process.env.capture];
    }

    const path = process.env.capture ?? "./tmp";
    const now = nowStr();

    let browser, page;
    if (capture.indexOf("options") > -1) {
        browser = await makeBrowser("2000,1000");
        page = await browser.newPage();
        await page.goto(`${root}/src/options/options.html`, {
            waitUntil: "domcontentloaded",
        });
        await new Promise((resolve) => {
            page.evaluate(async (resolve) => {
                setStorage("checkDarkMode", true, resolve);
            }, resolve);
        });
        await page.reload({
            waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(500000);
        await page.screenshot({
            path: `${path}/${now}-options.png`,
            fullPage: true,
        });
        await browser.close();
    }
    if (capture.indexOf("menu") > -1) {
        browser = await makeBrowser();
        page = await browser.newPage();
        await page.goto(`${root}/src/popup/min/popup.min.html`, {
            waitUntil: "domcontentloaded",
        });
        await page.waitForTimeout(1e3);
        await page.click("#memory-switch");
        await page.waitForTimeout(1e3);
        await page.screenshot({
            path: `${path}/${now}-menu.png`,
            fullPage: true,
        });
        await browser.close();
    }
})();

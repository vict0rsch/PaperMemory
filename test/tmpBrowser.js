import { makeBrowser } from "./browser.js";

const openBrowser = process.env.openBrowser ?? false;

if (openBrowser) {
    const browser = await makeBrowser();
    const p = (await browser.pages())[0];
    p.on("console", (msg) => {
        console.log("msg.text() :", msg.text());
    });
} else {
    console.log("Set `openBrowser` to `true` to open a browser");
}

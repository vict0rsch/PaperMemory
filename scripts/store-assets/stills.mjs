// Store images: captures of the real build at 2x (WORK/captures), composed with frame.html into
// extra/store: screenshot-1..5.png (+ -dark variants) at 1280x800, the 440x280 promo tile and the
// 1400x560 marquee. The captures are reused as still backgrounds by videos.mjs.
import fs from "node:fs";
import * as L from "./lib.mjs";

export const CAP = `${L.WORK}/captures`;
const ATT = "Arxiv-1706.03762";
export const ARX = { tab: "[1706.03762] Attention Is All You Need", url: "arxiv.org/abs/1706.03762" };
export const CYC = { tab: "[1703.10593] Unpaired Image-to-Image Translation using…", url: "arxiv.org/abs/1703.10593" };
export const EXT = (p) => ({ tab: `PaperMemory · ${p}`, url: `PaperMemory · ${p}` });
const cap = (n) => `${CAP}/${n}.png`;

/**
 * The pages shown behind the popup (600 px tall, over a 660 px page area): scroll just enough
 * that arXiv's own sidebar links (Google Scholar…) sit under the popup, not in the strip below it
 */
const underPopup = (page) =>
    page.evaluate(() => {
        const a = [...document.querySelectorAll("a")].find((e) => /Google Scholar/.test(e.textContent));
        const bottom = a?.getBoundingClientRect().bottom ?? 0;
        if (bottom > 595) window.scrollBy(0, bottom - 590);
    });
/** arXiv abstract pages at 1280 x 660 (2x): first visit with its notice, saved, a second paper */
export const captureArxiv = async (env) => {
    await env.prefs("light");
    await env.seed([ATT]);
    let page = await env.arxiv("1706.03762", 1280, 660, 2);
    await page.waitForFunction(() => !!document.querySelector("papermemory-notices")?.shadowRoot?.querySelector(".pm-toast"), { timeout: 20000 });
    await L.sleep(1200);
    await page.screenshot({ path: cap("abs-first") });
    await page.close();
    await env.seed();
    page = await env.arxiv("1706.03762", 1280, 660, 2);
    await L.sleep(5000); // the published venue line
    await L.hideNotices(page);
    await underPopup(page);
    await page.screenshot({ path: cap("abs-saved") });
    await (await page.$("papermemory-block")).screenshot({ path: cap("crop-block") });
    await page.close();
    page = await env.arxiv("1703.10593", 1280, 660, 2);
    await L.sleep(5000);
    await L.hideNotices(page);
    await underPopup(page);
    await page.screenshot({ path: cap("abs-cyclegan") });
    await page.close();
};

const capturePopups = async (env) => {
    await env.seed();
    const noCaret = (p) => p.addStyleTag({ content: "* { caret-color: transparent !important; }" }); // a still, not a blink
    let page = await env.popup("https://arxiv.org/abs/1703.10593", 2);
    await page.screenshot({ path: cap("popup-paper-light") });
    await page.close();
    for (const theme of ["light", "dark"]) {
        page = await env.popup("https://arxiv.org/abs/1706.03762", 2, theme);
        await noCaret(page);
        await page.keyboard.press("a");
        await L.sleep(400);
        if (theme === "light") await page.screenshot({ path: cap("popup-memory-light") });
        await page.keyboard.type("t:transf");
        await page.keyboard.press("Tab");
        await L.sleep(300);
        await page.screenshot({ path: cap(`popup-memory-pill-${theme}`) });
        await page.close();
    }
};

/** fullMemory at 1440 x 743 (shown scaled to 1280 x 660), the CycleGAN row selected */
const captureFullMemory = async (env) => {
    for (const theme of ["light", "dark"]) {
        await env.prefs(theme);
        const page = await env.page(1440, 743, 2, theme);
        await page.goto(env.ext("fullMemory.html"), { waitUntil: "networkidle0" });
        await L.sleep(800);
        await page.evaluate(() => document.querySelector('tr[data-id="Arxiv-1703.10593"]')?.focus());
        await page.mouse.move(700, 738);
        await L.sleep(300);
        await page.screenshot({ path: cap(`fullmemory-1440-${theme}`) });
        await page.close();
    }
    await env.prefs("light");
};

/** BibMatcher results at 1440 wide (full page): one accepted, one rejected, the BERT diff open */
const captureBibMatcher = async (env) => {
    const { page, done } = await L.bibmatcher(env, 1440, 1000, 2);
    await L.bibMatch(page);
    await L.bibAct(page, "vaswani2017attention", "accept");
    await L.bibAct(page, "hoffmann2022training", "reject");
    await L.bibAct(page, "devlin2018bert", "toggle");
    await page.evaluate(() => document.activeElement?.blur());
    await L.sleep(300);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: cap("bibmatcher-results"), fullPage: true });
    // the Results heading 11 px under the toolbar (as in the mockup), in the 1280-wide frame
    const top = await page.evaluate(() => [...document.querySelectorAll("h2, h3")].find((e) => /^\s*Results/.test(e.textContent))?.getBoundingClientRect().top + scrollY);
    fs.writeFileSync(`${CAP}/bibmatcher.json`, JSON.stringify({ by: Math.round((top * 1280) / 1440) - 11 }));
    await done();
};

export const capture = async (env) => {
    L.mkdir(CAP);
    await captureArxiv(env);
    await capturePopups(env);
    await captureFullMemory(env);
    await captureBibMatcher(env);
};

export const compose = async (env) => {
    L.mkdir(L.STORE);
    const { by } = JSON.parse(fs.readFileSync(`${CAP}/bibmatcher.json`, "utf8"));
    const shot = (name, head, s) => L.render(env, { t: "shot", head, ...s }, `${L.WORK}/${name}.png`, [1280, 800, 1]);
    const full = { ...EXT("Memory"), bg: cap("fullmemory-1440-light") };
    const pill = { ...ARX, bg: cap("abs-saved"), popup: cap("popup-memory-pill-light") };
    const out = {
        "screenshot-1": await shot("screenshot-1", "Papers are saved as you read them", { ...ARX, bg: cap("abs-first") }),
        "screenshot-2": await shot("screenshot-2", "Find a paper by tag, year or text", pill),
        "screenshot-2-dark": await shot("screenshot-2-dark", "Find a paper by tag, year or text", { ...pill, popup: cap("popup-memory-pill-dark"), dark: true }),
        "screenshot-3": await shot("screenshot-3", "Tags, notes, links and details for every paper", { ...CYC, bg: cap("abs-cyclegan"), popup: cap("popup-paper-light") }),
        "screenshot-4": await shot("screenshot-4", "Your whole Memory in a full page", full),
        "screenshot-4-dark": await shot("screenshot-4-dark", "Your whole Memory in a full page", { ...full, bg: cap("fullmemory-1440-dark"), dark: true }),
        "screenshot-5": await shot("screenshot-5", "Replace preprints in your .bib with published versions", { ...EXT("BibMatcher"), bg: cap("bibmatcher-results"), by }),
        "promo-tile-440x280": await L.render(env, { t: "tile", block: cap("crop-block") }, `${L.WORK}/tile.png`, [440, 280, 1]),
        "marquee-1400x560": await L.render(env, { t: "marq", popup: cap("popup-memory-light"), block: cap("crop-block") }, `${L.WORK}/marquee.png`, [1400, 560, 1]),
    };
    // smaller PNGs: ffmpeg's encoder with the best filter per row
    for (const [name, src] of Object.entries(out))
        L.ffmpeg(["-i", src, "-pred", "mixed", "-compression_level", "9", `${L.STORE}/${name}.png`]);
};

const DOCS = `${L.ROOT}docs/assets`;
const LOOPS = ["saved", "find", "cite", "export", "bibmatcher"];

/** The views only the docs show: popup Settings panel, "?" sheet, a non-paper page, options groups, welcome tab */
const captureDocsViews = async (env) => {
    await env.seed();
    let page = await env.popup("https://arxiv.org/abs/1706.03762", 2);
    await page.click("#menu-switch");
    await L.sleep(500);
    await page.mouse.move(5, 590);
    await page.screenshot({ path: `${DOCS}/popup-settings.png` });
    await page.close();
    page = await env.popup("https://arxiv.org/abs/1706.03762", 2);
    await page.keyboard.press("?");
    await L.sleep(500);
    await page.screenshot({ path: `${DOCS}/shortcuts.png` });
    await page.close();
    page = await env.popup("https://example.com/", 2);
    await page.screenshot({ path: `${DOCS}/add-website.png` });
    await page.close();
    await env.prefs("light");
    page = await env.page(1440, 900, 2);
    await page.goto(env.ext("options.html"), { waitUntil: "networkidle0" });
    await L.sleep(800);
    await page.screenshot({ path: `${DOCS}/options-page.png` });
    for (const [group, name] of [["sync", "options-sync"], ["data", "options-data"]]) {
        await page.evaluate((g) => document.getElementById(g).scrollIntoView(), group);
        await L.sleep(500);
        await page.screenshot({ path: `${DOCS}/${name}.png` });
    }
    await page.close();
    page = await env.page(1100, 900, 2);
    await page.goto(env.ext("welcome.html"), { waitUntil: "networkidle0" });
    await L.sleep(800);
    await page.screenshot({ path: `${DOCS}/welcome-tab.png`, fullPage: true });
    await page.close();
};

/** Unframed light-theme images for the docs site and the Readme, plus the five loops (docs/assets) */
export const docsAssets = async (env) => {
    L.mkdir(DOCS);
    for (const [from, to] of [
        ["popup-paper-light", "popup-paper"],
        ["popup-memory-pill-light", "popup-memory"],
        ["fullmemory-1440-light", "full-page-memory"],
        ["crop-block", "papermemory-block"],
        ["bibmatcher-results", "bibmatcher"],
    ])
        fs.copyFileSync(cap(from), `${DOCS}/${to}.png`);
    await captureDocsViews(env);
    for (const n of LOOPS) fs.copyFileSync(`${L.OUT}/loop-${n}.gif`, `${DOCS}/loop-${n}.gif`);
};

// Shared helpers for the store assets: the browser with the real build, seeded storage, pages,
// screencast recording, frame rendering (frame.html) and ffmpeg.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { seedPapers } from "./data.mjs";

export const HERE = new URL(".", import.meta.url).pathname;
export const ROOT = new URL("../../", import.meta.url).pathname;
export const STORE = `${ROOT}extra/store`;
export const OUT = `${ROOT}design-review/step7/out`;
export const WORK = `${ROOT}design-review/step7/work`; // captures and intermediate clips
export const FFMPEG = process.env.FFMPEG || "/opt/homebrew/bin/ffmpeg";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const mkdir = (d) => (fs.mkdirSync(d, { recursive: true }), d);

export const ffmpeg = (args) => execFileSync(FFMPEG, ["-hide_banner", "-v", "error", "-y", ...args], { stdio: "inherit" });

// Light defaults of a fresh profile (src/shared/js/utils/config.js), as the test helpers write them
const NAMES = ["checkBib", "checkMd", "checkDownload", "checkPdfTitle", "checkFeedback", "checkDarkMode", "checkDirectOpen", "checkStore", "checkScirate", "checkAlphaxiv", "checkAr5iv", "checkHuggingface", "checkOfficialRepos", "checkPdfOnly", "checkNoAuto", "checkMdYearVenue", "checkEnterLocalPdf", "checkWebsiteParsing", "checkPreferPdf"];
const FALSE = ["checkDarkMode", "checkStore", "checkScirate", "checkAlphaxiv", "checkAr5iv", "checkHuggingface", "checkOfficialRepos", "checkPdfOnly", "checkNoAuto", "checkMdYearVenue", "checkPreferPdf"];
const defaultPrefs = Object.fromEntries(NAMES.map((n) => [n, !FALSE.includes(n)]));

/** The real build (dist/chrome-mv3) in a headless browser, a fresh profile, the Memory seeded */
export const start = async ({ scale = 2 } = {}) => {
    // as test/browser.js's makeBrowser, plus a screen scale (2): the screencast then sends
    // 2560 x 1200 frames for a 1280 x 600 viewport (it ignores the emulated device scale)
    const { launch } = await import("cloakbrowser/puppeteer");
    const browser = await launch({
        headless: true,
        extensionPaths: [`${ROOT}dist/chrome-mv3`],
        args: ["--window-size=1500,1000", `--force-device-scale-factor=${scale}`, "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
        launchOptions: { acceptInsecureCerts: true },
    });
    const welcome = await browser.waitForTarget((t) => t.type() === "page" && t.url().endsWith("/welcome.html"), { timeout: 10000 }).catch(() => null);
    await (await welcome?.page())?.close();
    const worker = await browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith("chrome-extension://"));
    const id = new URL(worker.url()).host;
    const ext = (p) => `chrome-extension://${id}/${p}`;
    const boot = (await browser.pages())[0] || (await browser.newPage());
    await boot.goto(ext("popup.html"), { waitUntil: "networkidle0" });
    const env = { browser, ext, boot };
    env.prefs = (theme, extra = {}) =>
        boot.evaluate((p) => new Promise((res) => chrome.storage.local.set({ prefs: p }, res)), { ...defaultPrefs, ...extra, theme, checkDarkMode: theme === "dark" });
    /** Seed the Memory; without: ids left out (e.g. the paper a shot is about to open) */
    env.seed = (without = []) => {
        const s = seedPapers();
        for (const k of without) delete s[k];
        return boot.evaluate((v) => PMDebug.data.setStorage("papers", v), s);
    };
    /** A page at a viewport (CSS px) and device scale, the theme set before the page's scripts */
    env.page = async (w, h, dsf, theme = "light") => {
        const page = await browser.newPage();
        await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
        await page.evaluateOnNewDocument((t) => {
            try {
                localStorage.setItem("pm-theme", t);
            } catch (e) {}
        }, theme);
        return page;
    };
    /** The popup opened as a tab, as if over `url` (the active tab is mocked) */
    env.popup = async (url, dsf, theme = "light") => {
        await env.prefs(theme, { checkDirectOpen: false });
        const page = await env.page(450, 600, dsf, theme);
        await page.evaluateOnNewDocument((url) => {
            window.chrome = window.chrome || {};
            window.chrome.tabs = window.chrome.tabs || {};
            window.chrome.tabs.query = (q, cb) => cb([{ url, id: 1 }]);
            window.close = () => {};
        }, url);
        await page.goto(ext("popup.html"), { waitUntil: "networkidle0" });
        await page.waitForFunction(() => window.__pmPopupReady === true, { timeout: 15000 });
        await page.mouse.move(5, 590); // no hover state
        await sleep(300);
        return page;
    };
    /** An arXiv abstract page, once the PaperMemory block is there */
    env.arxiv = async (arxivId, w, h, dsf) => {
        const page = await env.page(w, h, dsf);
        await page.goto(`https://arxiv.org/abs/${arxivId}`, { waitUntil: "domcontentloaded", timeout: 40000 });
        await page.waitForSelector("papermemory-block", { timeout: 25000 });
        return page;
    };
    env.close = () => browser.close();
    return env;
};

/** Click a control of the arXiv block (shadow DOM) */
export const blockAct = (page, act) =>
    page.evaluate((a) => document.querySelector("papermemory-block").shadowRoot.querySelector(`[data-act="${a}"]`)?.click(), act);
export const hideNotices = (page) => page.evaluate(() => document.querySelector("papermemory-notices")?.remove());
/** Wait until the block shows the published venue line, or give up quietly */
export const settleBlock = (page, ms = 8000) =>
    page
        .waitForFunction(() => /Published|In your Memory/.test(document.querySelector("papermemory-block")?.shadowRoot?.textContent || ""), { timeout: ms })
        .catch(() => {});

/** Render one frame.html frame (see its header) to a PNG at w x h CSS px and device scale dsf */
export const render = async (env, spec, path, [w, h, dsf]) => {
    const page = await env.browser.newPage();
    try {
        await page.setViewport({ width: w, height: h, deviceScaleFactor: dsf });
        await page.goto(`file://${HERE}frame.html#${encodeURIComponent(JSON.stringify(spec))}`);
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
        });
        await sleep(150);
        await page.screenshot({ path, omitBackground: true });
    } finally {
        await page.close();
    }
    return path;
};

/**
 * Record a page with the CDP screencast while `run(mark)` drives it. `mark()` sets the start of
 * the clip (default: the first frame). Frames are kept with their timestamps.
 */
export const record = async (page, run, size, format = "png") => {
    await page.bringToFront();
    const cdp = await page.createCDPSession();
    const frames = [];
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
        frames.push({ t: metadata.timestamp, data, ext: format === "jpeg" ? "jpg" : "png" });
        cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format, quality: 92, maxWidth: size[0], maxHeight: size[1], everyNthFrame: 1 });
    let start = null;
    await run(() => (start = Date.now() / 1000));
    const end = Date.now() / 1000;
    await cdp.send("Page.stopScreencast");
    await cdp.detach();
    return { frames, start: start ?? frames[0]?.t, end };
};

/**
 * Write the frames of `rec` covering [start, start + dur] and an ffmpeg concat list with each
 * frame's display time; returns the list's path. The last frame is held to the end.
 */
export const clipFrames = (rec, dur, dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
    mkdir(dir);
    const { frames, start } = rec;
    const end = start + dur;
    let first = frames.findLastIndex((f) => f.t <= start);
    if (first < 0) first = 0;
    const lines = [];
    let last;
    for (let i = first; i < frames.length && frames[i].t < end; i++) {
        const from = Math.max(frames[i].t, start);
        const to = Math.min(frames[i + 1]?.t ?? end, end);
        if (to - from < 1e-4) continue;
        last = `${dir}/${String(i).padStart(5, "0")}.${frames[i].ext}`;
        fs.writeFileSync(last, Buffer.from(frames[i].data, "base64"));
        lines.push(`file '${last}'`, `duration ${(to - from).toFixed(4)}`);
    }
    lines.push(`file '${last}'`); // the concat demuxer ignores the last duration otherwise
    fs.writeFileSync(`${dir}/list.txt`, lines.join("\n") + "\n");
    return `${dir}/list.txt`;
};

/**
 * BibMatcher (with the sample .bib dropped in, unless drop is false) and the source
 * answers mocked while it is open; returns { page, done } (done() closes it and stops the mocks).
 */
export const bibmatcher = async (env, w, h, dsf, { drop = true } = {}) => {
    const { intercept, resetMocks } = await import("./data.mjs");
    // the service worker stops when idle: the popup wakes it, then its current target is used
    await env.boot.reload({ waitUntil: "networkidle0" });
    const worker = await env.browser.waitForTarget((t) => t.type() === "service_worker" && t.url().startsWith(env.ext("")), { timeout: 10000 });
    const sessions = [await env.browser.target().createCDPSession(), await worker.createCDPSession()];
    for (const s of sessions) await intercept(s);
    resetMocks();
    await env.prefs("light");
    const page = await env.page(w, h, dsf);
    await page.goto(env.ext("bibMatcher.html"), { waitUntil: "networkidle0" });
    await page.waitForFunction(() => document.documentElement.dataset.bibmatcherReady === "true");
    await page.$eval("#api-timeout", (el) => (el.checked = false));
    if (drop) await bibDrop(page);
    const done = async () => {
        await page.close();
        for (const s of sessions) await s.send("Fetch.disable").catch(() => {});
        for (const s of sessions) await s.detach().catch(() => {});
    };
    return { page, done };
};
/** Drop the sample .bib on the page, as if thesis-refs.bib was chosen */
export const bibDrop = async (page) => {
    const { BIB } = await import("./data.mjs");
    await page.evaluate((text) => {
        const dt = new DataTransfer();
        dt.items.add(new File([text], "thesis-refs.bib"));
        document.body.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, BIB);
    await page.waitForFunction(() => document.getElementById("b-filecount").textContent !== "");
};
/** A result row's control: accept, reject, toggle (its diff) */
export const bibAct = (page, key, act) =>
    page.evaluate(
        (k, a) =>
            [...document.querySelectorAll("#b-rows .b-item")]
                .find((it) => it.querySelector(".b-key").textContent === k)
                .querySelector(`.b-row [data-act="${a}"]`)
                .click(),
        key,
        act,
    );
export const bibMatch = async (page) => {
    await page.click("#match-bib");
    await page.waitForFunction(() => document.body.dataset.state === "done", { timeout: 60000 });
};

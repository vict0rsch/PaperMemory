// Videos: each shot drives the real extension and records it with the CDP screencast, then ffmpeg
// composites it into the drawn browser of frame.html (toolbar 90 px, page 1920 x 900, caption band
// 90 px at 1080p; the popup, recorded as a tab, under the toolbar icon) and joins the shots with
// short cross-fades. Storyboards, captions and timings: the approved step-7 mockups.
// Loops have no caption band (page 1920 x 990) and end on their first frame.
import fs from "node:fs";
import * as L from "./lib.mjs";
import { CAP, ARX, CYC, EXT, captureArxiv } from "./stills.mjs";

const S = 1.5; // 1280 x 720 CSS px -> 1920 x 1080
const ATT = "Arxiv-1706.03762";
const ARX_URL = "https://arxiv.org/abs/1706.03762";
const CYC_URL = "https://arxiv.org/abs/1703.10593";
const at = (t0) => async (s) => {
    const ms = t0 + s * 1000 - Date.now();
    if (ms > 0) await L.sleep(ms);
};
/** Run `steps` ([[seconds, fn]…]) at their times after mark(), then hold until `dur` */
const timeline = (steps) => async (page, mark, dur) => {
    mark();
    const wait = at(Date.now());
    for (const [s, fn] of steps) {
        await wait(s);
        await fn(page);
    }
    await wait(dur + 0.1);
};
const key = (k) => (p) => p.keyboard.press(k);
const type = (text, delay = 90) => (p) => p.keyboard.type(text, { delay });

// ---------- scenes: open a page in its start state (before mark), the drawn browser around it
const arxivSaved = (arxivId, chrome) => ({
    chrome,
    open: async (env, h) => {
        await env.seed();
        const page = await env.arxiv(arxivId, 1280, h, S);
        await L.sleep(4500);
        await L.hideNotices(page);
        return page;
    },
});
/** The first visit, recorded from the navigation */
const arxivFirst = {
    chrome: ARX,
    open: async (env, h) => {
        await env.seed([ATT]);
        return env.page(1280, h, S);
    },
    run: async (page, mark, dur) => {
        // from the page's response: it paints, the block appears, then the notice
        const nav = page.goto(ARX_URL, { waitUntil: "domcontentloaded", timeout: 40000 });
        await page.waitForResponse((r) => r.url() === ARX_URL && r.request().isNavigationRequest(), { timeout: 40000 });
        mark();
        const t0 = Date.now();
        await nav;
        await L.sleep(t0 + dur * 1000 + 100 - Date.now());
    },
};
const popup = (url, chrome, bg, prep) => ({
    chrome: { ...chrome, bg: `${CAP}/${bg}.png` },
    popup: true,
    open: async (env) => {
        await env.seed();
        const page = await env.popup(url, S);
        if (prep) await prep(page);
        return page;
    },
});
const memoryTab = async (p) => {
    await p.keyboard.press("a");
    await L.sleep(400);
};
const fullMemory = (prep) => ({
    chrome: EXT("Memory"),
    open: async (env, h) => {
        await env.seed();
        await env.prefs("light");
        const page = await env.page(1280, h, S);
        await page.goto(env.ext("fullMemory.html"), { waitUntil: "networkidle0" });
        await L.sleep(800);
        await page.evaluate(() => document.querySelector('tr[data-id="Arxiv-1706.03762"]')?.focus());
        await page.mouse.move(700, h - 5);
        if (prep) await prep(page);
        await L.sleep(300);
        return page;
    },
});
const settingsAt = (prep) => ({
    chrome: EXT("Settings"),
    open: async (env, h) => {
        await env.prefs("light");
        const page = await env.page(1280, h, S);
        await page.goto(env.ext("options.html"), { waitUntil: "networkidle0" });
        await L.sleep(600);
        if (prep) await prep(page);
        return page;
    },
});
const settings = settingsAt();
/** Sync section from its connection status down (its heading and intro stay above the sticky bar) */
const syncSettings = settingsAt(async (p) => {
    await p.click('[data-nav="sync"]');
    await L.sleep(1200);
    await p.evaluate(() => {
        let bar = document.elementFromPoint(640, 5);
        while (bar && !/sticky|fixed/.test(getComputedStyle(bar).position)) bar = bar.parentElement;
        const intro = [...document.querySelectorAll("#sync p, section p")].find((e) => e.textContent.includes("Keeps one private gist"));
        window.scrollTo(0, intro.getBoundingClientRect().bottom + scrollY - (bar?.getBoundingClientRect().bottom || 0) + 6);
    });
    await L.sleep(300);
});
/** BibMatcher: { drop: the sample loaded, results: matched and scrolled to Results } */
const bib = ({ drop = true, results = true, closed = false } = {}) => ({
    chrome: EXT("BibMatcher"),
    open: async (env, h) => {
        const { page, done } = await L.bibmatcher(env, 1280, h, S, { drop });
        page.done = done;
        if (results) {
            await L.bibMatch(page);
            if (!closed) {
                await L.bibAct(page, "vaswani2017attention", "accept");
                await L.bibAct(page, "hoffmann2022training", "reject");
            }
            await page.evaluate(() => document.activeElement?.blur());
            await page.evaluate(() => [...document.querySelectorAll("h2, h3")].find((e) => /^\s*Results/.test(e.textContent))?.scrollIntoView({ block: "start" }));
            await page.evaluate(() => window.scrollBy(0, -20));
            await L.sleep(400);
        }
        return page;
    },
});
const card = (vp, sm) => ({ card: [vp, sm] });
const TITLE = card("Saves the papers you read.");
const END = card("Free and open source", "Chrome · Edge · Brave · Firefox &nbsp;·&nbsp; papermemory.org");

const bibRow = (k, a) => (p) => L.bibAct(p, k, a);
const smoothScroll = (y) => (p) => p.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), y);
/** Scroll the popup's paper list (its own scroller, so the header stays) */
const listScroll = (y) => (p) =>
    p.evaluate((y) => {
        let el = document.querySelector(".pm-item, [id^='memory-container--']");
        while (el && !(el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        (el || document.scrollingElement).scrollBy({ top: y, behavior: "smooth" });
    }, y);
const addTag = (tag) => async (p) => {
    await p.click(".pm-tagin");
    await p.keyboard.type(tag, { delay: 90 });
    await p.keyboard.press("Enter");
};

// [scene, seconds, caption, timeline]
const PROMO = [
    [TITLE, 3],
    [arxivFirst, 5, "Open a paper. It is saved."],
    [arxivSaved("1706.03762", ARX), 4, "BibTeX and a Markdown link, on the page", [[0.7, (p) => L.blockAct(p, "bib-show")], [2.2, (p) => L.blockAct(p, "bib-copy")]]],
    [popup(ARX_URL, ARX, "abs-saved"), 5, "Add tags, a note and a code link", [[0.8, addTag("attention")]]],
    // mockup shots 5 and 6 (same caption): one continuous shot
    [popup(ARX_URL, ARX, "abs-saved"), 6, "Search by tag, year or text", [[0.3, memoryTab], [0.9, type("t:transf", 110)], [3.2, key("Tab")]]],
    [fullMemory(), 5, "Your whole Memory in a full page", [[1.2, key("Tab")], [2.8, key("Tab")]]],
    [bib(), 5, "Published versions for the preprints in your .bib", [[0.8, bibRow("devlin2018bert", "toggle")], [3.2, bibRow("devlin2018bert", "accept")]]],
    [END, 3],
];
const WALK = [
    [TITLE, 3],
    [arxivFirst, 5, "Open a paper on a supported site. It is saved."],
    [arxivSaved("1706.03762", ARX), 5, "BibTeX, Markdown link and PDF download on arXiv", [[0.8, (p) => L.blockAct(p, "bib-show")], [2.3, (p) => L.blockAct(p, "bib-copy")], [3.6, (p) => L.blockAct(p, "md")]]],
    [popup(ARX_URL, ARX, "abs-saved"), 5, "The popup shows the paper you are on", [[1.2, key("m")], [2.8, key("b")]]],
    [popup(CYC_URL, CYC, "abs-cyclegan"), 5, "Tags, a code link and a note", [[0.6, key("e")], [1.0, addTag("unpaired")], [2.4, (p) => p.focus("textarea.pm-textarea:not([hidden])")], [2.6, type("\nCompare with pix2pix.", 60)], [4.3, (p) => p.click("#popup-edit-done")]]],
    [popup(CYC_URL, CYC, "abs-cyclegan"), 4, "Info: dates, visits, source, citation key", [[0.8, key("d")], [3.2, key("d")]]],
    [popup(ARX_URL, ARX, "abs-saved"), 5, "Memory: every paper you opened", [[0.4, key("a")], [2.0, listScroll(320)], [3.6, listScroll(-320)]]],
    [popup(ARX_URL, ARX, "abs-saved", memoryTab), 4, "Type t: for a tag, y: for a year, c: for code", [[0.5, type("t:transf", 120)]]],
    [popup(ARX_URL, ARX, "abs-saved", async (p) => (await memoryTab(p), await p.keyboard.type("t:transf"), await p.keyboard.press("Tab"))), 5, "Filters combine with free text", [[0.5, type("y:>2017", 110)], [1.6, key("Tab")], [2.2, type("vision", 110)]]],
    [fullMemory(), 5, "The full-page Memory", [[0.8, key("Tab")], [1.8, key("Tab")], [3.2, (p) => p.click('.m-sort[data-sort="lastOpenDate"]')]]],
    [fullMemory(), 5, "Tag, export or delete several papers at once", [[0.6, (p) => p.click('tr[data-id="Arxiv-1706.03762"] .m-select')], [1.1, (p) => p.click('tr[data-id="Arxiv-1703.10593"] .m-select')], [1.6, (p) => p.click('tr[data-id="Arxiv-2010.11929"] .m-select')], [2.8, (p) => p.click('[data-bulk="tag"]')]]],
    [settings, 5, "Settings: theme, sources, shortcuts", [[0.8, (p) => p.click('[data-set-theme="dark"]')], [2.2, (p) => p.click('[data-set-theme="light"]')], [3.0, smoothScroll(420)]]],
    [syncSettings, 5, "Sync through a private Gist in your own GitHub", [[1.2, (p) => p.click("#pat-input")]]],
    // no Match click here: it scrolls the sources line into view (shot 15 shows the results)
    [bib({ drop: false, results: false }), 5, "BibMatcher: load a .bib file", [[0.6, (p) => L.bibDrop(p)], [2.4, (p) => p.evaluate(() => document.querySelector("textarea").scrollBy({ top: 260, behavior: "smooth" }))]]],
    [bib(), 5, "Accept or reject each published version", [[0.8, bibRow("devlin2018bert", "toggle")], [2.4, bibRow("devlin2018bert", "accept")], [3.4, smoothScroll(500)]]],
    [END, 3],
];
const LOOPS = {
    "arxiv-block": [arxivSaved("1706.03762", ARX), 5, [[1.0, (p) => L.blockAct(p, "bib-show")], [4.0, (p) => L.blockAct(p, "bib-show")]]],
    "popup-search": [popup(ARX_URL, ARX, "abs-saved", memoryTab), 7, [[0.5, type("t:transf", 220)], [3.0, key("Tab")], [6.0, (p) => p.click("#memory-search-x")], [6.2, (p) => p.mouse.move(5, 590)]]],
    "one-key-copy": [popup(ARX_URL, ARX, "abs-saved"), 5, [[1.0, key("b")]]],
    bibmatcher: [bib({ closed: true }), 7, [[1.0, bibRow("devlin2018bert", "toggle")], [6.0, bibRow("devlin2018bert", "toggle")]]],
};

// ---------- recording and compositing
const CLIPS = `${L.WORK}/clips`;
const X264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv444p", "-r", "30"];

/** One shot -> CLIPS/<name>.mp4, 1920 x 1080, exactly `dur` seconds; retried once (a live site) */
const shot = (env, name, s, dur) =>
    shotOnce(env, name, s, dur).catch((e) => (console.log(`retrying ${name}: ${e.message}`), shotOnce(env, name, s, dur)));
const shotOnce = async (env, name, [scene, , cap, steps = []], dur) => {
    const h = cap ? 600 : 660;
    const base = await L.render(env, scene.card ? { t: "vid", card: scene.card } : { t: "vid", ...scene.chrome, popup: !!scene.popup, cap }, `${CLIPS}/${name}-base.png`, [1280, 720, S]);
    const out = `${CLIPS}/${name}.mp4`;
    if (scene.card) return L.ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(dur), "-i", base, ...X264, out]), out;
    const page = await scene.open(env, h);
    const size = scene.popup ? [450 * S, 600 * S] : [1280 * S, h * S];
    const rec = await L.record(page, (mark) => (scene.run || timeline(steps))(page, mark, dur), size);
    await (page.done ? page.done() : page.close());
    const list = L.clipFrames(rec, dur, `${CLIPS}/${name}-frames`);
    const inputs = ["-loop", "1", "-framerate", "30", "-i", base, "-f", "concat", "-safe", "0", "-i", list];
    const filter = scene.popup
        ? // the popup's rounded bottom corners (mask), kept above the caption band
          `[1:v]fps=30,format=rgba,crop=675:${cap ? 898 : 900}:0:0[p];[2:v]format=gray,crop=675:${cap ? 898 : 900}:0:0[m];[p][m]alphamerge[pa];[0:v][pa]overlay=1227:92:shortest=1`
        : `[1:v]fps=30[p];[0:v][p]overlay=0:90:shortest=1`;
    const mask = scene.popup ? ["-loop", "1", "-i", `${CLIPS}/mask.png`] : [];
    L.ffmpeg([...inputs, ...mask, "-filter_complex", filter, "-t", String(dur), ...X264, out]);
    return out;
};

/** Shots joined by cross-fades (0.2 s; 0.5 s next to a card), total = the storyboard's length */
const film = async (env, name, shots) => {
    const fade = (i) => (i >= shots.length - 1 ? 0 : shots[i][0].card || shots[i + 1][0].card ? 0.5 : 0.2);
    const clips = [];
    for (const [i, s] of shots.entries()) {
        console.log(`${name} ${i + 1}/${shots.length} ${s[2] || "card"}`);
        clips.push(await shot(env, `${name}-${String(i + 1).padStart(2, "0")}`, s, s[1] + fade(i)));
    }
    let chain = "",
        prev = "[0:v]",
        t = 0;
    for (let i = 0; i < clips.length - 1; i++) {
        t += shots[i][1];
        const next = i === clips.length - 2 ? "[v]" : `[x${i}]`;
        chain += `${prev}[${i + 1}:v]xfade=transition=fade:duration=${fade(i)}:offset=${t.toFixed(3)}${next};`;
        prev = next;
    }
    const mp4 = `${L.OUT}/${name}-1080p.mp4`;
    L.ffmpeg([...clips.flatMap((c) => ["-i", c]), "-filter_complex", chain.slice(0, -1), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4]);
    L.ffmpeg(["-i", mp4, "-an", "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", `${L.OUT}/${name}-1080p.webm`]);
};

/** A loop: one shot, 1280 x 720 WebM and a 960 x 540 GIF (15 fps) */
const loop = async (env, name, [scene, dur, steps]) => {
    console.log(`loop ${name}`);
    const clip = await shot(env, `loop-${name}`, [scene, dur, "", steps], dur);
    L.ffmpeg(["-i", clip, "-an", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", `${L.OUT}/loop-${name}.webm`]);
    L.ffmpeg(["-i", clip, "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", `${L.OUT}/loop-${name}.gif`]);
};

/** Everything, or only the films / loops whose name contains `only` */
export const videos = async (env, only) => {
    L.mkdir(CLIPS);
    L.mkdir(L.OUT);
    if (!fs.existsSync(`${CAP}/abs-cyclegan.png`)) L.mkdir(CAP), await captureArxiv(env);
    await L.render(env, { t: "mask" }, `${CLIPS}/mask.png`, [450, 600, S]);
    const want = (n) => !only || n.includes(only);
    if (want("promo")) await film(env, "promo", PROMO);
    if (want("walkthrough")) await film(env, "walkthrough", WALK);
    for (const [name, l] of Object.entries(LOOPS)) if (want(`loop-${name}`)) await loop(env, name, l);
};

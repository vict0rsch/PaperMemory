// Videos: each shot drives the real extension and records it with the CDP screencast, with visual
// cues (cues.mjs: a cursor that clicks, rings on what appears, a 1.4x camera), then ffmpeg
// composites it into the drawn browser of frame.html (toolbar 90 px, page 1920 x 900, caption band
// 90 px at 1080p; the popup, recorded as a tab, under the toolbar icon) and joins the shots with
// short cross-fades. Storyboards, captions and timings: the approved step-7 mockups.
// Pages are recorded at 2x (2560 px wide) so the zoom stays sharp, then scaled to 1920.
// Loops have no caption band (page 1920 x 990), no zoom, and end on their first frame.
import fs from "node:fs";
import * as L from "./lib.mjs";
import { cues, cameraFilter, cropped } from "./cues.mjs";
import { CAP, ARX, CYC, EXT } from "./stills.mjs";

// framing A (slate): a 1280 x 800 browser (60 px drawn chrome + a 1280 x 740 page) drawn at 1.25
// as a 1600 x 1000 window at 160, 24 on a 1920 x 1080 backdrop; the chapter line under it
const PH = 740; // page height (CSS px)
const WIN = [160, 99, 1600, 925]; // the page area in the frame (px)
const K = 2; // recording scale (the browser's screen scale, see lib.start)
const Z = 1.6; // camera zoom
const ZB = 1.4; // BibMatcher's diff
const POP = [818, 1]; // the popup in the page area (CSS px): under the toolbar icon
const ATT = "Arxiv-1706.03762";
const ARX_URL = "https://arxiv.org/abs/1706.03762";
const CYC_URL = "https://arxiv.org/abs/1703.10593";
const at = (t0) => async (s) => {
    const ms = t0 + s * 1000 - Date.now();
    if (ms > 0) await L.sleep(ms);
};
/** `pre` (before the clip), then `steps` ([[seconds, fn(page, cues)]…]) after mark(), held to `dur` */
const timeline = (steps, pre) => async (page, c, mark, dur) => {
    await c.install();
    if (pre) await pre(page, c);
    mark();
    c.start();
    const wait = at(Date.now());
    for (const [s, fn] of steps) {
        await wait(s);
        await fn(page, c);
    }
    await wait(dur + 0.1);
};
const key = (k) => (p) => p.keyboard.press(k);
const type = (text, delay = 90) => (p) => p.keyboard.type(text, { delay });

// element pickers (run in the page) and cue steps
const Q = (s) => document.querySelector(s);
const BLOCK = (a) => {
    const b = document.querySelector("papermemory-block");
    return a ? b.shadowRoot.querySelector(`[data-act="${a}"]`) : b;
};
const TOAST = () => document.querySelector("papermemory-notices").shadowRoot.querySelector(".pm-toast");
const BIBROW = ([k, a]) => {
    const it = [...document.querySelectorAll("#b-rows .b-item")].find((i) => i.querySelector(".b-key").textContent === k);
    return it.querySelector(a ? `.b-row [data-act="${a}"]` : ".b-row");
};
const click = (pick, arg, ms = 700) => async (p, c) => {
    const [x, y] = await c.center(pick, arg);
    await c.click(x, y, ms);
};
const clickQ = (sel, ms) => click(Q, sel, ms);
// (no zoom on BibMatcher's results: the table and its diffs are wider than a 1.4x view)
const focus = (pick, arg) => async (p, c) => c.fit(await c.center(pick, arg), Z);
const focusAt = (pick, arg) => async (p, c) => c.fitInitial(await c.center(pick, arg), Z);
/** Start on the arXiv block as it is with its BibTeX open (opened, measured, closed again) */
const onBlockOpen = async (p, c) => {
    await L.blockAct(p, "bib-show");
    await L.sleep(300);
    const box = await c.center(BLOCK);
    await L.blockAct(p, "bib-show");
    await L.sleep(300);
    await p.evaluate(() => document.activeElement?.blur());
    c.fitInitial(box, Z);
};
const ring = (pick, arg, ms = 1000) => async (p, c) => c.highlight(await c.center(pick, arg), ms);
/** Loops: the cursor starts and ends at the same place (dx, dy from an element) */
const parkAt = (pick, arg, dx, dy) => async (p, c) => {
    const [x, y] = await c.center(pick, arg);
    p.park = [x + dx, y + dy];
    await c.show(...p.park);
    await L.sleep(300);
};
const unpark = (ms = 600) => (p, c) => c.move(...p.park, ms);

// ---------- scenes: open a page in its start state (before mark), the drawn browser around it
const arxivSaved = (arxivId, chrome) => ({
    chrome,
    open: async (env, h) => {
        await env.seed();
        const page = await env.arxiv(arxivId, 1280, h, K);
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
        return env.page(1280, h, K);
    },
    // from the page's response
    run: async (page, c, mark, dur) => {
        const nav = page.goto(ARX_URL, { waitUntil: "domcontentloaded", timeout: 40000 });
        await page.waitForResponse((r) => r.url() === ARX_URL && r.request().isNavigationRequest(), { timeout: 40000 });
        mark();
        c.start();
        const wait = at(Date.now());
        await nav;
        await c.install();
        await page.waitForFunction(() => !!document.querySelector("papermemory-notices")?.shadowRoot?.querySelector(".pm-toast"), { polling: 50, timeout: 20000 });
        // the whole page, then the "Saved" notice and the block, each zoomed onto and ringed
        await page.waitForFunction(() => !!document.querySelector("papermemory-notices")?.shadowRoot?.querySelector(".pm-toast"), { polling: 50, timeout: 20000 });
        await wait(1.0);
        c.fit(await c.center(TOAST), Z);
        await L.sleep(600);
        await c.highlight(await c.center(TOAST), 1100);
        await L.sleep(1200);
        c.fit(await c.center(BLOCK), Z);
        await L.sleep(600);
        await c.highlight(await c.center(BLOCK), 1100);
        await wait(dur + 0.1);
    },
};
const popup = (url, chrome, bg, prep) => ({
    chrome: { ...chrome, bg: `${CAP}/${bg}-740.png` },
    popup: true,
    offset: POP,
    open: async (env) => {
        await env.seed();
        const page = await env.popup(url, K);
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
        const page = await env.page(1280, h, K);
        // "Export .bib" saves through a link click: keep the file's text for the viewer instead
        await page.evaluateOnNewDocument(() => {
            const click = HTMLAnchorElement.prototype.click;
            HTMLAnchorElement.prototype.click = function () {
                if (!this.download || !this.href.startsWith("blob:")) return click.call(this);
                const name = this.download;
                fetch(this.href).then((r) => r.text()).then((text) => (window.__pmExport = { name, text }));
            };
        });
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
        const page = await env.page(1280, h, K);
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
        const { page, done } = await L.bibmatcher(env, 1280, h, K, { drop });
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
// ---------- cards and chapter bands (step7-video-direction.md)
const OPEN = { card: { t: "slateopen", h: "Saves the papers you read.", p: "Automatically, as you browse arXiv, OpenReview and more." } };
const END = { card: { t: "slateend" } };
const CHAPTERS = [
    ["Saves the papers you read.", "", "Open a paper. It is saved."],
    ["Find it again.", "Search titles, authors, tags, years and your notes.", "Find it again"],
    ["Cite it in one click.", "BibTeX from any paper page, or a whole .bib for your thesis.", "Cite it in one click"],
    ["From preprint to published.", "BibMatcher updates the arXiv entries of your .bib file.", "From preprint to published"],
    ["Make it yours.", "Tags, notes and code links on every paper.", "Make it yours"],
    ["Sync your Memory.", "Through a private Gist in your own GitHub.", "Sync your Memory"],
];
const chapter = (n, of) => ({ card: { t: "slatechap", n, of, h: CHAPTERS[n - 1][0], p: CHAPTERS[n - 1][1] }, title: CHAPTERS[n - 1][0] });
const band = (n, of, s, key) => ({ n, of, t: CHAPTERS[n - 1][2], s, key });

const smoothScroll = (y) => (p) => p.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), y);
/** Scroll the popup's paper list (its own scroller) */
const listScroll = (y) => (p) => p.evaluate((y) => document.getElementById("memory-scroll").scrollBy({ top: y, behavior: "smooth" }), y);
const ROW = (id, part = ".c-paper") => `tr[data-id="${id}"] ${part}`;
const TAGIN = "#popup-memory-edit .pm-tagin";
const PRE = () => document.querySelector("papermemory-block").shadowRoot.querySelector("#pm-bibtex");
const VENUE = () => document.querySelector("papermemory-block").shadowRoot.querySelector(".venue");
// (BibMatcher's diff is zoomed at ZB: it is wide)
const DIFF = () => {
    // the removed and added lines of the open diff, as one box
    const ls = [...document.querySelectorAll(".b-diff .is-del, .b-diff .is-add")];
    const r = ls.map((l) => l.getBoundingClientRect());
    const box = document.getElementById("pm-cue-box") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "pm-cue-box" }));
    Object.assign(box.style, { position: "fixed", pointerEvents: "none", left: `${r[0].left}px`, top: `${r[0].top}px`, width: `${r[0].width}px`, height: `${r.at(-1).bottom - r[0].top}px` });
    return box;
};
// BibMatcher's input: from "Your bibliography" to the text area (the sources line stays out)
const INPUT = () => {
    const h = document.getElementById("b-input-title").getBoundingClientRect(), d = document.getElementById("b-drop").getBoundingClientRect();
    const box = document.getElementById("pm-cue-box") || document.body.appendChild(Object.assign(document.createElement("div"), { id: "pm-cue-box" }));
    Object.assign(box.style, { position: "fixed", pointerEvents: "none", left: `${d.left}px`, top: `${h.top}px`, width: `${d.width}px`, height: `${d.bottom - h.top}px` });
    return box;
};
const memoryWith = (q) => async (p) => {
    await memoryTab(p);
    await p.keyboard.type(q);
    await p.keyboard.press("Tab");
    await L.sleep(300);
};
// a popup shot starts zoomed on the whole popup
const onPopup = () => async (p, c) => c.fitInitial([225, 300, 450, 600], Z);
const resultsTop = (p) => p.evaluate(() => window.scrollTo(0, 0));

// one shot per idea; the cursor only for clicks; one ring, on the result
const SAVE = [arxivFirst, 5];
const FIND = [popup(ARX_URL, ARX, "abs-saved", memoryTab), 6, [[0.3, clickQ("#memory-search", 500)], [1.0, type("t:transf", 110)], [2.6, key("Tab")], [3.2, ring(Q, "#memory-scroll", 1300)]], onPopup()];
const CITE = (dur, md) => [arxivSaved("1706.03762", ARX), dur, [[0.3, click(BLOCK, "bib-show")], [1.7, click(BLOCK, "bib-copy", 600)], [2.5, ring(PRE, undefined, 1200)], ...(md ? [[3.9, click(BLOCK, "md", 600)]] : [])], onBlockOpen];
const EXPORT = (dur) => [fullMemory(), dur, [[0.3, clickQ('.m-tag[data-tag="transformers"]', 700)], [1.2, clickQ("#m-select-all", 600)], [2.0, clickQ('[data-bulk="export"]', 600)],
    [2.7, async (p, c) => {
        await p.waitForFunction(() => !!window.__pmExport, { timeout: 5000 });
        const { name, text } = await p.evaluate(() => window.__pmExport);
        await c.hide();
        await c.file(name, text);
        await L.sleep(350);
        await c.highlight(await c.center(Q, "#pm-cue-file"), 1300);
    }]]];
const DIFFZOOM = [bib(), 6, [[0.4, click(BIBROW, ["devlin2018bert", "toggle"])], [1.3, async (p, c) => {
    await c.hide();
    c.fit(await c.center(DIFF), ZB);
}], [2.2, ring(DIFF, undefined, 1500)]]];
const TAGS = (dur) => [popup(CYC_URL, CYC, "abs-cyclegan"), dur, [[0.3, clickQ(TAGIN, 600)], [1.0, type("unpaired", 80)], [1.8, key("Enter")], [2.2, ring(Q, '[id^="popup-item-tags--"]', 1200)]], onPopup()];
const FULL = (dur, rows) => [fullMemory(), dur, [...rows.map((id, i) => [0.3 + i * 1.4, clickQ(ROW(id), 700)]), [0.3 + rows.length * 1.4 - 0.3, ring(Q, "#m-detail", 1300)]]];

// [scene, seconds, band, steps, pre]
const P = (s, n, ...st) => [s[0], s[1], band(n, 5, ...st), s[2], s[3]];
const PROMO = [
    [OPEN, 2.5],
    P(SAVE, 1),
    [chapter(2, 5), 1.5],
    P(FIND, 2),
    [chapter(3, 5), 1.5],
    P(CITE(4.5), 3),
    P(EXPORT(4.5), 3),
    [chapter(4, 5), 1.5],
    P(DIFFZOOM, 4),
    [chapter(5, 5), 1.5],
    P(TAGS(4), 5),
    P(FULL(3, ["Arxiv-1703.10593"]), 5),
    [END, 4],
];
const W = (s, n, st, k) => [s[0], s[1], band(n, 6, st, k), s[2], s[3]];
const WALK = [
    [OPEN, 3],
    W([arxivFirst, 5], 1),
    W([arxivSaved("1706.03762", ARX), 4, [[1.0, ring(VENUE, undefined, 1500)]], focusAt(BLOCK)], 1, "the published venue, on the arXiv page"),
    [chapter(2, 6), 1.5],
    W([popup(ARX_URL, ARX, "abs-saved", memoryTab), 4, [[0.6, listScroll(320)], [2.4, listScroll(-320)]], onPopup()], 2, "every paper you opened"),
    W(FIND, 2, "t: for a tag, y: for a year, c: for code"),
    W([popup(ARX_URL, ARX, "abs-saved", memoryWith("t:transf")), 4, [[0.4, type("image", 130)], [1.8, ring(Q, "#memory-scroll", 1300)]], onPopup()], 2, "filters combine with text"),
    [chapter(3, 6), 1.5],
    W(CITE(5, true), 3),
    W([popup(ARX_URL, ARX, "abs-saved"), 4, [[1.0, key("b")], [1.4, ring(Q, "#popup-feedback-copied", 1300)]], onPopup()], 3, "or one key in the popup", "B"),
    W(EXPORT(5), 3, "or a whole .bib for your thesis"),
    [chapter(4, 6), 1.5],
    W([bib({ drop: false, results: false }), 4, [[0.6, (p) => L.bibDrop(p)], [1.2, ring(Q, "#b-filechip", 1300)]], async (p, c) => c.fitInitial(await c.center(INPUT), Z)], 4, "load your .bib"),
    W(DIFFZOOM, 4),
    W([bib(), 4, [[0.5, click(BIBROW, ["devlin2018bert", "accept"])], [1.5, ring(BIBROW, ["devlin2018bert"], 1300)]]], 4, "accept each published version"),
    [chapter(5, 6), 1.5],
    W([popup(CYC_URL, CYC, "abs-cyclegan"), 6, [[0.5, key("e")], [0.8, clickQ(TAGIN, 600)], [1.5, type("unpaired", 60)], [2.1, key("Enter")], [2.3, clickQ("textarea.pm-textarea:not([hidden])", 500)], [2.9, (p) => p.evaluate(() => document.querySelector("textarea.pm-textarea:not([hidden])").setSelectionRange(1e4, 1e4))], [3.0, type("\nCompare with pix2pix.", 40)], [4.1, clickQ("#popup-edit-done", 450)], [4.7, ring(Q, "#popup-memory-edit", 1200)]], onPopup()], 5),
    W(FULL(5, ["Arxiv-1703.10593", "Arxiv-2010.11929"]), 5, "your whole Memory in a full page"),
    W([fullMemory(), 5, [[0.3, clickQ(ROW("Arxiv-1706.03762", ".m-select"), 600)], [1.0, clickQ(ROW("Arxiv-1703.10593", ".m-select"), 400)], [1.6, clickQ(ROW("Arxiv-2010.11929", ".m-select"), 400)], [2.3, clickQ('[data-bulk="tag"]', 600)],
        // the "Add tags" dialog, the bulk bar (and its Delete) below the view
        [3.0, async (p, c) => { await c.hide(); c.fit(await c.center(Q, "#o-dialog"), Z); }], [3.7, ring(Q, "#o-dialog", 1100)]]], 5, "tag several papers at once"),
    [chapter(6, 6), 2.5],
    [END, 4],
];
// [scene, seconds, steps, pre]; the cursor parks at the same place at the start and the end
// loops keep one fixed 1.4x framing (seamless; arXiv's own sidebar links stay out of the view)
const both = (...fs) => async (p, c) => {
    for (const f of fs) await f(p, c);
};
const LOOPS = {
    "arxiv-block": [arxivSaved("1706.03762", ARX), 5, [[0.5, click(BLOCK, "bib-show")], [3.5, click(BLOCK, "bib-show", 450)], [4.1, unpark(600)]], both(onBlockOpen, parkAt(BLOCK, "bib-show", -110, 80))],
    "popup-search": [popup(ARX_URL, ARX, "abs-saved", memoryTab), 7, [[0.5, type("t:transf", 220)], [3.0, key("Tab")], [5.3, clickQ("#memory-search-x", 600)], [6.1, unpark(600)]], both(onPopup(), parkAt(Q, "#memory-search-field", 60, 90))],
    "one-key-copy": [popup(ARX_URL, ARX, "abs-saved"), 5, [[1.0, key("b")]], onPopup()],
    bibmatcher: [bib({ closed: true }), 7, [[0.4, click(BIBROW, ["devlin2018bert", "toggle"], 600)], [1.3, unpark(500)], [5.0, click(BIBROW, ["devlin2018bert", "toggle"], 600)], [6.0, unpark(600)]], parkAt(BIBROW, ["devlin2018bert", "toggle"], -160, 70)],
};

// ---------- recording and compositing
const CLIPS = `${L.WORK}/clips`;
const X264 = ["-c:v", "libx264", "-preset", "medium", "-crf", "12", "-pix_fmt", "yuv444p", "-r", "30"];

/** One shot -> CLIPS/<name>.mp4, 1920 x 1080, exactly `dur` seconds; retried once (a live site) */
const shot = (env, name, s, dur) =>
    shotOnce(env, name, s, dur).catch((e) => (console.log(`retrying ${name}: ${e.message}`), shotOnce(env, name, s, dur)));
const shotOnce = async (env, name, [scene, , line, steps = [], pre], dur) => {
    const base = await L.render(env, scene.card || { t: "slate", ...scene.chrome, bg: undefined, popup: !!scene.popup, line }, `${CLIPS}/${name}-base.png`, [1920, 1080, 1]);
    const out = `${CLIPS}/${name}.mp4`;
    if (scene.card) return L.ffmpeg(["-loop", "1", "-framerate", "30", "-t", String(dur), "-i", base, ...X264, out]), out;
    const page = await scene.open(env, PH);
    const c = cues(page, scene.offset, [1280, PH]);
    const size = scene.popup ? [450 * K, 600 * K] : [1280 * K, PH * K];
    const rec = await L.record(page, (mark) => (scene.run || timeline(steps, pre))(page, c, mark, dur), size, "jpeg");
    await (page.done ? page.done() : page.close());
    const crops = cropped(c.keys, [1280, PH]);
    if (crops.length) throw new Error(`${name}: the camera crops its target: ${crops.join("; ")}`);
    const list = L.clipFrames(rec, dur, `${CLIPS}/${name}-frames`);
    // the page area (2560 x 1480): camera -> 1600 x 925, rounded bottom corners, into the window
    const cam = cameraFilter(c.keys, [1280, PH], K, [WIN[2], WIN[3]]);
    const into = `[wm]format=gray[wmg];[pg][wmg]alphamerge[pgw];[0:v][pgw]overlay=${WIN[0]}:${WIN[1]}:shortest=1`;
    const inputs = ["-loop", "1", "-framerate", "30", "-i", base, "-f", "concat", "-safe", "0", "-i", list];
    let filter;
    if (scene.popup) {
        // the page still with the popup's shadow, then the popup (rounded bottom corners: mask)
        const still = await L.render(env, { t: "pagearea", bg: scene.chrome.bg }, `${CLIPS}/${name}-still.png`, [1280, PH, K]);
        inputs.push("-loop", "1", "-framerate", "30", "-i", still, "-loop", "1", "-i", `${CLIPS}/mask.png`, "-loop", "1", "-i", `${CLIPS}/wmask.png`);
        filter =
            `[1:v]format=rgba,fps=30[p];[3:v]format=gray[m];[p][m]alphamerge[pa];` +
            `[2:v]format=rgba[st];[st][pa]overlay=${POP[0] * K}:${POP[1] * K}:shortest=1,format=rgb24,${cam},format=rgba[pg];[4:v]copy[wm];${into}`;
    } else {
        inputs.push("-loop", "1", "-i", `${CLIPS}/wmask.png`);
        filter = `[1:v]format=rgb24,fps=30,${cam},format=rgba[pg];[2:v]copy[wm];${into}`;
    }
    L.ffmpeg([...inputs, "-filter_complex", filter, "-t", String(dur), ...X264, out]);
    return out;
};

/**
 * Shots joined by cross-fades (0.25 s next to a card, 0.2 s inside a chapter), total = the sum
 * of the shots' lengths. Writes <name>-chapters.txt (YouTube: "m:ss Title" at the cards).
 */
const film = async (env, name, shots) => {
    const fade = (i) => (i >= shots.length - 1 ? 0 : shots[i][0].card || shots[i + 1][0].card ? 0.25 : 0.2);
    const clips = [];
    for (const [i, s] of shots.entries()) {
        console.log(`${name} ${i + 1}/${shots.length} ${s[0].title || s[0].card?.t || s[2]?.s || s[2]?.t}`);
        clips.push(await shot(env, `${name}-${String(i + 1).padStart(2, "0")}`, s, s[1] + fade(i)));
    }
    let chain = "",
        prev = "[0:v]",
        t = 0;
    const chapters = [];
    for (let i = 0; i < clips.length; i++) {
        if (i === 0) chapters.push([0, CHAPTERS[0][0]]);
        else if (shots[i][0].title) chapters.push([t, shots[i][0].title]);
        if (i === clips.length - 1) break;
        t += shots[i][1];
        const next = i === clips.length - 2 ? "[v]" : `[x${i}]`;
        chain += `${prev}[${i + 1}:v]xfade=transition=fade:duration=${fade(i)}:offset=${t.toFixed(3)}${next};`;
        prev = next;
    }
    const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    if (name === "walkthrough") fs.writeFileSync(`${L.OUT}/${name}-chapters.txt`, chapters.map(([t, title]) => `${mmss(t)} ${title.replace(/\.$/, "")}`).join("\n") + "\n");
    const mp4 = `${L.OUT}/${name}-1080p.mp4`;
    L.ffmpeg([...clips.flatMap((c) => ["-i", c]), "-filter_complex", chain.slice(0, -1), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-profile:v", "high", "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4]);
    L.ffmpeg(["-i", mp4, "-an", "-c:v", "libvpx-vp9", "-crf", "32", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", `${L.OUT}/${name}-1080p.webm`]);
};

/** A loop: one shot, 1280 x 720 WebM and a 960 x 540 GIF (15 fps) */
const loop = async (env, name, [scene, dur, steps, pre]) => {
    console.log(`loop ${name}`);
    const clip = await shot(env, `loop-${name}`, [scene, dur, null, steps, pre], dur);
    L.ffmpeg(["-i", clip, "-an", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-row-mt", "1", "-pix_fmt", "yuv420p", `${L.OUT}/loop-${name}.webm`]);
    L.ffmpeg(["-i", clip, "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle", "-loop", "0", `${L.OUT}/loop-${name}.gif`]);
};

/** The arXiv pages behind the popup, at the window's 1280 x 740 (2x), unscrolled */
const captureBackgrounds = async (env) => {
    await env.prefs("light");
    await env.seed();
    for (const [id, name] of [["1706.03762", "abs-saved"], ["1703.10593", "abs-cyclegan"]]) {
        const page = await env.arxiv(id, 1280, PH, K);
        await L.sleep(5000);
        await L.hideNotices(page);
        await page.screenshot({ path: `${CAP}/${name}-740.png` });
        await page.close();
    }
};

/** Everything, or only the films / loops whose name contains `only` */
export const videos = async (env, only) => {
    L.mkdir(CLIPS);
    L.mkdir(L.OUT);
    L.mkdir(CAP);
    await captureBackgrounds(env);
    await L.render(env, { t: "mask" }, `${CLIPS}/mask.png`, [450, 600, K]);
    await L.render(env, { t: "wmask" }, `${CLIPS}/wmask.png`, [WIN[2], WIN[3], 1]);
    const want = (n) => !only || n.includes(only);
    if (want("promo")) await film(env, "promo", PROMO);
    if (want("walkthrough")) await film(env, "walkthrough", WALK);
    for (const [name, l] of Object.entries(LOOPS)) if (want(`loop-${name}`)) await loop(env, name, l);
};

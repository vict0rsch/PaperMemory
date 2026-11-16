// The welcome page (src/entrypoints/welcome, src/welcome/welcome.js): opened on install only
// (src/background/welcome.js), top bar, sources shared with the options page, theme switch,
// shortcut test ("popup opened" message from the popup, "no shortcut set"), reachable from
// Settings.
import { expect } from "expect";
import { findExtensionId, makeBrowser } from "./browser.js";
import { loadConfig, indent, sleep } from "./utilsForTests.js";
import { openWelcomeOnInstall } from "../src/background/welcome.js";
import { formatShortcut, shortcutKeys } from "../src/popup/js/shortcuts.js";

const { headless } = loadConfig();

describe("Welcome page", function () {
    let browser, page, base, installTab;

    this.timeout(60000);
    this.slow(20000);

    const storageGet = (key) =>
        page.evaluate(
            (k) => new Promise((r) => chrome.storage.local.get(k, (d) => r(d[k]))),
            key,
        );
    const storageSet = (obj) =>
        page.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, r)), obj);
    const waitForStorage = (fn, arg) =>
        page.waitForFunction(fn, { timeout: 5000, polling: 100 }, arg);
    /**
     * A fresh load of the welcome page (on a page of its own); shortcut: what the browser
     * reports as the popup's shortcut ("" = none), or [elsewhere, macOS]; name: the popup
     * command's name (_execute_browser_action in the Firefox MV2 build)
     */
    const openWelcome = async (
        p = page,
        { shortcut, name = "_execute_action" } = {},
    ) => {
        await p.goto("about:blank");
        if (shortcut !== undefined)
            await p.evaluateOnNewDocument(
                (shortcut, name) => {
                    const mac = /Mac/.test(navigator.userAgent);
                    chrome.commands.getAll = (cb) =>
                        cb([
                            {
                                name,
                                shortcut:
                                    typeof shortcut === "string"
                                        ? shortcut
                                        : shortcut[+mac],
                            },
                        ]);
                },
                shortcut,
                name,
            );
        await p.goto(`${base}/welcome.html`, { waitUntil: "networkidle0" });
        await p.waitForFunction(
            () => document.documentElement.dataset.welcomeReady === "true",
            { timeout: 15000 },
        );
    };
    const keyState = (p = page) => p.$eval("#w-shortcut", (el) => el.dataset.key);

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless, "1200,900", { keepWelcomeTab: true });
        // a fresh profile is an install: the background opens the welcome tab
        installTab = await browser
            .waitForTarget((t) => t.url().endsWith("/welcome.html"), { timeout: 15000 })
            .catch(() => null);
        if (installTab) await (await installTab.page())?.close();
        const id = await findExtensionId(browser);
        if (!id) throw new Error("Extension ID not found");
        base = `chrome-extension://${id}`;
        page = (await browser.pages())[0];
        await page.goto(`${base}/welcome.html`, { waitUntil: "networkidle0" });
    });

    beforeEach(async function () {
        await storageSet({ ignoreSources: {}, prefs: { theme: "light" } });
        await openWelcome();
    });

    after(async function () {
        await browser?.close();
    });

    describe("Opening", function () {
        it("opens by itself on install", function () {
            expect(installTab).not.toBe(null);
        });

        it("the onInstalled handler opens the tab for reason install only", function () {
            const created = [];
            const saved = globalThis.chrome;
            globalThis.chrome = {
                runtime: { getURL: (p) => `chrome-extension://x${p}` },
                tabs: { create: (o) => created.push(o) },
            };
            try {
                for (const reason of [
                    "update",
                    "chrome_update",
                    "browser_update",
                    "shared_module_update",
                ])
                    openWelcomeOnInstall({ reason });
                expect(created).toEqual([]);
                openWelcomeOnInstall({ reason: "install" });
                expect(created).toEqual([{ url: "chrome-extension://x/welcome.html" }]);
            } finally {
                globalThis.chrome = saved;
            }
        });

        it("Settings > General > Welcome page opens it", async function () {
            await page.goto(`${base}/options.html`, { waitUntil: "networkidle0" });
            await page.waitForFunction(
                () => document.documentElement.dataset.optionsReady === "true",
                { timeout: 15000 },
            );
            await Promise.all([page.waitForNavigation(), page.click("#open-welcome")]);
            expect(page.url()).toBe(`${base}/welcome.html`);
            await page.waitForFunction(
                () => document.documentElement.dataset.welcomeReady === "true",
                { timeout: 15000 },
            );
        });
    });

    describe("Page", function () {
        it("has the top bar (no page current), four steps and no recording toggle", async function () {
            expect(await page.$("#pm-topbar")).not.toBe(null);
            expect(await page.$("#pm-topbar [aria-current]")).toBe(null);
            const steps = await page.$$eval(".o-section-title", (h) =>
                h.map((x) => x.textContent.trim().replace(/\s+/g, " ")),
            );
            expect(steps).toEqual([
                "1What gets recorded",
                "2Open it from the keyboard",
                "3Where to record from",
                "4Theme",
            ]);
            expect(await page.$("#checkNoAuto")).toBe(null);
            const arxiv = await page.$eval("#w-try-arxiv", (a) => a.href);
            expect(arxiv).toBe("https://arxiv.org/abs/2305.05577v1");
            // every link that leaves the extension opens a new tab and has a tooltip
            const out = await page.$$eval('a[href^="http"]', (as) =>
                as.map((a) => [a.target, !!a.dataset.tip, a.getAttribute("rel")]),
            );
            expect(out.length).toBeGreaterThan(0);
            for (const o of out)
                expect(o).toEqual(["_blank", true, "noopener noreferrer"]);
        });
    });

    describe("Sources", function () {
        it("turning sources off here is what the options page shows", async function () {
            const n = Number(
                (await page.$eval("#sources-count", (el) => el.textContent)).match(
                    /of (\d+)/,
                )[1],
            );
            expect(await page.$eval("#sources-count", (el) => el.textContent)).toBe(
                `${n} of ${n} on`,
            );
            await page.click("#source-arxiv");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("ignoreSources", ({ ignoreSources }) =>
                            r(ignoreSources.arxiv === true),
                        ),
                    ),
            );
            const options = await browser.newPage();
            try {
                await options.goto(`${base}/options.html`, {
                    waitUntil: "networkidle0",
                });
                await options.waitForFunction(
                    () => document.documentElement.dataset.optionsReady === "true",
                    { timeout: 15000 },
                );
                expect(await options.$eval("#source-arxiv", (el) => el.checked)).toBe(
                    false,
                );
                expect(
                    await options.$eval("#sources-count", (el) => el.textContent),
                ).toBe(`${n - 1} of ${n} on`);

                await page.bringToFront();
                await page.click("#sources-all-off");
                await waitForStorage(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.get(
                                "ignoreSources",
                                ({ ignoreSources }) =>
                                    r(Object.values(ignoreSources).every(Boolean)),
                            ),
                        ),
                );
                await sleep(150);
                expect(await page.$eval("#sources-count", (el) => el.textContent)).toBe(
                    `0 of ${n} on`,
                );
                await options.reload({ waitUntil: "networkidle0" });
                await options.waitForFunction(
                    () => document.documentElement.dataset.optionsReady === "true",
                    { timeout: 15000 },
                );
                expect(
                    await options.$eval("#sources-count", (el) => el.textContent),
                ).toBe(`0 of ${n} on`);
            } finally {
                await options.close();
            }
        });

        it("two pages turning different sources off at once both keep their change, and follow each other", async function () {
            const options = await browser.newPage();
            const count = (p) => p.$eval("#sources-count", (el) => el.textContent);
            try {
                await options.goto(`${base}/options.html`, {
                    waitUntil: "networkidle0",
                });
                await options.waitForFunction(
                    () => document.documentElement.dataset.optionsReady === "true",
                    { timeout: 15000 },
                );
                const [a, b] = await page.$$eval("[data-source]", (els) =>
                    els.slice(0, 2).map((el) => el.dataset.source),
                );
                const n = Number((await count(page)).match(/of (\d+)/)[1]);
                const click = (p, key) =>
                    p.evaluate(
                        (key) =>
                            document.querySelector(`[data-source="${key}"]`).click(),
                        key,
                    );
                await Promise.all([click(page, a), click(options, b)]);
                await waitForStorage(
                    ([a, b]) =>
                        new Promise((r) =>
                            chrome.storage.local.get(
                                "ignoreSources",
                                ({ ignoreSources }) =>
                                    r(
                                        ignoreSources[a] === true &&
                                            ignoreSources[b] === true,
                                    ),
                            ),
                        ),
                    [a, b],
                );
                await sleep(300);
                expect(await storageGet("ignoreSources")).toMatchObject({
                    [a]: true,
                    [b]: true,
                });
                // each page shows the other's change without a reload
                for (const p of [page, options]) {
                    expect(await count(p)).toBe(`${n - 2} of ${n} on`);
                    for (const key of [a, b])
                        expect(
                            await p.$eval(`[data-source="${key}"]`, (el) => el.checked),
                        ).toBe(false);
                }
                // Turn all on (Settings) reaches the welcome page too
                await options.bringToFront();
                await options.click("#sources-all-on");
                await page.waitForFunction(
                    (n) =>
                        document.getElementById("sources-count").textContent ===
                        `${n} of ${n} on`,
                    { timeout: 5000 },
                    n,
                );
                expect(
                    Object.values(await storageGet("ignoreSources")).some(Boolean),
                ).toBe(false);
            } finally {
                await options.close();
                await page.bringToFront();
            }
        });
    });

    describe("Theme", function () {
        it("the step-4 switch writes prefs.theme and applies it", async function () {
            await page.click('.o-section [data-set-theme="dark"]');
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("prefs", ({ prefs }) =>
                            r(prefs?.theme === "dark"),
                        ),
                    ),
            );
            await page.waitForFunction(
                () => document.documentElement.dataset.theme === "dark",
            );
            expect(
                await page.$eval('.o-section [data-set-theme="dark"]', (b) =>
                    b.getAttribute("aria-pressed"),
                ),
            ).toBe("true");
            await page.click('.o-section [data-set-theme="light"]');
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("prefs", ({ prefs }) =>
                            r(prefs?.theme === "light"),
                        ),
                    ),
            );
        });
    });

    describe("Shortcut test", function () {
        it("shows the browser's keys, then 'It works' when the popup opens", async function () {
            expect(await keyState()).toBe("waiting");
            const caps = await page.$$eval("#w-caps .w-cap", (c) =>
                c.map((x) => x.textContent),
            );
            expect(caps.length).toBeGreaterThanOrEqual(2);
            const popup = await browser.newPage();
            try {
                await popup.goto(`${base}/popup.html`, {
                    waitUntil: "domcontentloaded",
                });
                await page.waitForFunction(
                    () => document.getElementById("w-shortcut").dataset.key === "ok",
                    { timeout: 5000 },
                );
            } finally {
                await popup.close();
            }
            expect(await page.$eval(".w-when-ok", (el) => el.offsetHeight > 0)).toBe(
                true,
            );
            expect(await page.$eval(".w-when-ok", (el) => el.textContent)).toMatch(
                /opens your\s+Memory/,
            );
        });

        it("the popup opens without errors when no welcome page listens", async function () {
            // a page that does not listen
            await page.goto(`${base}/options.html`, { waitUntil: "networkidle0" });
            const popup = await browser.newPage();
            const errors = [];
            popup.on("console", (m) => m.type() === "error" && errors.push(m.text()));
            popup.on("pageerror", (e) => errors.push(e.message));
            try {
                await popup.goto(`${base}/popup.html`, { waitUntil: "networkidle0" });
                await popup.waitForFunction(() => window.__pmPopupReady === true, {
                    timeout: 15000,
                });
                // no "Receiving end does not exist", "message port closed…", "message
                // channel closed…" or any other error
                expect(errors).toEqual([]);
            } finally {
                await popup.close();
            }
        });

        it("says so when the browser gave no shortcut", async function () {
            const p = await browser.newPage();
            try {
                await openWelcome(p, { shortcut: "" });
                expect(await keyState(p)).toBe("none");
                expect(await p.$eval("#w-caps", (el) => el.textContent)).toBe(
                    "No shortcut set",
                );
                expect(
                    await p.$eval(
                        ".w-keys [data-open-shortcuts]",
                        (b) => b.offsetHeight > 0,
                    ),
                ).toBe(true);
                expect(await p.$eval(".w-when-set", (el) => el.offsetHeight)).toBe(0);
            } finally {
                await p.close();
            }
        });

        it("shows the keys of Firefox's _execute_browser_action (MV2 build)", async function () {
            const p = await browser.newPage();
            try {
                await openWelcome(p, {
                    shortcut: "Ctrl+Shift+E", // as Firefox reports it
                    name: "_execute_browser_action",
                });
                expect(await keyState(p)).toBe("waiting");
                const caps = await p.$$eval("#w-caps .w-cap", (c) =>
                    c.map((x) => x.textContent),
                );
                expect([
                    ["Ctrl", "Shift", "E"],
                    ["⌘", "⇧", "E"],
                ]).toContainEqual(caps);
            } finally {
                await p.close();
            }
        });

        it("keeps a key name whole: one cap per key, and the count follows", async function () {
            const p = await browser.newPage();
            try {
                // [elsewhere, macOS (Chrome's symbol form)]
                await openWelcome(p, { shortcut: ["Ctrl+Shift+Space", "⇧⌘Space"] });
                const caps = await p.$$eval("#w-caps .w-cap", (c) =>
                    c.map((x) => x.textContent),
                );
                expect([
                    ["Ctrl", "Shift", "Space"],
                    ["⌘", "⇧", "Space"],
                ]).toContainEqual(caps);
                expect(await p.$eval("#w-keycount", (el) => el.textContent)).toBe(
                    "three keys",
                );
            } finally {
                await p.close();
            }
        });

        it("formatShortcut / shortcutKeys tokenize macOS symbol shortcuts by key", function () {
            const keys = (s, mac) => shortcutKeys(formatShortcut(s, mac), mac);
            expect(keys("⇧⌘Space", true)).toEqual(["⌘", "⇧", "Space"]);
            expect(keys("⌥⇧F5", true)).toEqual(["⌥", "⇧", "F5"]);
            expect(keys("⇧⌘E", true)).toEqual(["⌘", "⇧", "E"]);
            expect(keys("⌘Comma", true)).toEqual(["⌘", "Comma"]);
            expect(keys("Ctrl+Shift+E", true)).toEqual(["⌘", "⇧", "E"]); // Firefox, macOS
            expect(keys("Ctrl+Shift+Space", false)).toEqual(["Ctrl", "Shift", "Space"]);
            expect(formatShortcut("", true)).toBe("Not set");
        });
    });
});

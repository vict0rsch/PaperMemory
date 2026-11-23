// The options page (src/entrypoints/options, src/options/*): settings search, old anchors,
// prefs, sources filter / turn all on-off, auto-tag live counts, tag manager (rename, merge,
// delete: papers' tags actually change), restore (a backup is downloaded before confirming),
// token field type, no remote stylesheet or script, Agent access pairing requests (listed,
// decided, kept current).
import { expect } from "expect";
import fs from "fs";
import os from "os";
import path from "path";
import {
    findExtensionId,
    makeBrowser,
    notifyPairingChanged,
    stubPairingRequests,
} from "./browser.js";
import { loadConfig, root, readJSON, indent, sleep } from "./utilsForTests.js";

const { headless } = loadConfig();

describe("Options page", function () {
    let browser, page, optionsURL, papers;

    this.timeout(60000);
    this.slow(20000);

    const storageGet = (key) =>
        page.evaluate(
            (k) => new Promise((r) => chrome.storage.local.get(k, (d) => r(d[k]))),
            key,
        );
    const storageSet = (obj) =>
        page.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, r)), obj);
    /** Reloads the options page (optionally on a #hash) and waits until it is set up */
    const openOptions = async (hash = "") => {
        // a fresh load each time (going to options.html#x from options.html only scrolls)
        await page.goto("about:blank");
        await page.goto(`${optionsURL}${hash}`, { waitUntil: "networkidle0" });
        await page.waitForFunction(
            () => document.documentElement.dataset.optionsReady === "true",
            {
                timeout: 15000,
            },
        );
    };
    const visible = (sel) =>
        page.$eval(
            sel,
            (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
        );
    const waitForStorage = (fn, arg) =>
        page.waitForFunction(fn, { timeout: 5000, polling: 100 }, arg);
    const confirmDialog = async (value = "ok") => {
        await page.waitForSelector("#o-dialog[open]");
        await page.click(`#o-dialog-foot button[value="${value}"]`);
        await page.waitForFunction(() => !document.getElementById("o-dialog").open);
    };

    /** A popup page; stale: its storage listener is suppressed (it never refreshes) */
    const openPopup = async ({ stale = false } = {}) => {
        const popup = await browser.newPage();
        if (stale)
            await popup.evaluateOnNewDocument(() => {
                chrome.storage.onChanged.addListener = () => {};
            });
        await popup.goto(optionsURL.replace("options.html", "popup.html"), {
            waitUntil: "networkidle0",
        });
        await popup.waitForFunction(() => window.__pmPopupReady === true, {
            timeout: 15000,
        });
        return popup;
    };
    const op = (p, o) => p.evaluate((o) => PMDebug.memoryQueue.memoryOp(o), o);
    /** No page ran a Memory operation outside the background (test-only mode never used) */
    const noInContextRuns = async (...pages) => {
        for (const p of pages)
            expect(await p.evaluate(() => PMDebug.memoryQueue.getInContextRuns())).toBe(
                0,
            );
    };

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless);
        page = (await browser.pages())[0];
        const id = await findExtensionId(browser);
        if (!id) throw new Error("Extension ID not found");
        optionsURL = `chrome-extension://${id}/options.html`;
        papers = readJSON(`${root}/test/data/3-papers-memory.json`);
        await page.goto(optionsURL, { waitUntil: "networkidle0" });
    });

    beforeEach(async function () {
        const seeded = structuredClone(papers);
        seeded["Arxiv-1703.10593"].tags = ["gan", "vision"];
        seeded["JMLR-2012_bergstra12a"].tags = ["optimization", "Optimizations"];
        seeded["RSC-DigitalDiscovery_d2dd00066k"].tags = ["vision", "chemistry"];
        await storageSet({
            papers: seeded,
            autoTags: [],
            ignoreSources: {},
            prefs: { checkNoAuto: false, checkKeepMemorySearch: false, theme: "light" },
            syncPAT: "",
            syncState: false,
        });
        await openOptions();
    });

    after(async function () {
        await browser?.close();
    });

    describe("Page", function () {
        it("has the seven groups, a password token field and no remote stylesheet or script", async function () {
            const groups = await page.$$eval(".o-nav a", (as) =>
                as.map((a) => a.querySelector("span").textContent),
            );
            expect(groups).toEqual([
                "General",
                "Capture & sources",
                "Tags & matching",
                "Import & export",
                "Sync",
                "Agent access",
                "Keyboard shortcuts",
            ]);
            expect(await page.$eval("#pat-input", (el) => el.type)).toBe("password");
            expect(await page.$eval("#pat-input", (el) => el.placeholder)).toBe(
                "ghp_…",
            );
            const remote = await page.evaluate(() =>
                [...document.querySelectorAll("link[href], script[src]")]
                    .map((el) => el.href || el.src)
                    .filter((u) => !u.startsWith(location.origin)),
            );
            expect(remote).toEqual([]);
            // the popup's shortcut lists, with the browser-level keys filled in
            expect(
                await page.$$eval("#keyboard .pm-keys li", (lis) => lis.length),
            ).toBeGreaterThan(10);
            const cmd = await page.$eval(
                '#keyboard [data-cmd="_execute_action"]',
                (el) => el.textContent,
            );
            expect(cmd.length).toBeGreaterThan(0);
        });
    });

    describe("Settings search", function () {
        it("filters rows live, counts matches per group and shows an empty state", async function () {
            await page.type("#settings-search", "pdf");
            await sleep(100);
            expect(await visible("#checkPdfOnly")).toBe(true);
            expect(await visible("#checkPreferPdf")).toBe(true);
            expect(await visible("#checkFeedback")).toBe(false);
            expect(await visible("#tag-manager")).toBe(false);
            expect(
                await page.$eval("#sync", (s) => s.classList.contains("is-filtered")),
            ).toBe(true);
            const general = await page.$eval(
                '[data-nav="general"] .pm-count',
                (el) => el.textContent,
            );
            expect(Number(general)).toBeGreaterThan(0);
            expect(await visible("#search-empty")).toBe(false);

            await page.$eval("#settings-search", (el) => (el.value = ""));
            await page.type("#settings-search", "zzqx nothing");
            await sleep(100);
            expect(await visible("#search-empty")).toBe(true);

            await page.click("#search-clear");
            await sleep(100);
            expect(await visible("#checkFeedback")).toBe(true);
            expect(await visible("#search-empty")).toBe(false);
            const tagsCount = await page.$eval(
                '[data-nav="tags"] .pm-count',
                (el) => el.textContent,
            );
            expect(tagsCount).toBe("5"); // gan, vision, optimization, Optimizations, chemistry
        });

        it("focuses the search with /", async function () {
            await page.keyboard.press("/");
            expect(await page.evaluate(() => document.activeElement.id)).toBe(
                "settings-search",
            );
        });
    });

    describe("Anchors", function () {
        const cases = {
            "#online-synchronization": "#sync",
            "#paperswithcode-preferences": "#code-links",
            "#data-management": "#data",
            "#auto-tags": "#auto-tagging",
            "#select-sources": "#select-sources",
            "#preprint-matching": "#preprint-matching",
            "#tag-manager": "#tag-manager",
            "#auto-tagging": "#auto-tagging",
            "#import-papers": "#import-papers",
        };
        for (const [from, to] of Object.entries(cases)) {
            it(`${from} leads to ${to}`, async function () {
                await openOptions(from);
                expect(await page.evaluate(() => location.hash)).toBe(to);
                const top = await page.$eval(
                    to,
                    (el) => el.getBoundingClientRect().top,
                );
                expect(top).toBeGreaterThanOrEqual(0);
                expect(top).toBeLessThan(200);
            });
        }
    });

    describe("Preferences", function () {
        it("writes prefs, with checkNoAuto inverted", async function () {
            expect(await page.$eval("#checkNoAuto", (el) => el.checked)).toBe(true);
            await page.click("#checkNoAuto");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("prefs", ({ prefs }) =>
                            r(prefs.checkNoAuto === true),
                        ),
                    ),
            );
            await page.click("#checkKeepMemorySearch");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("prefs", ({ prefs }) =>
                            r(prefs.checkKeepMemorySearch === true),
                        ),
                    ),
            );
            // the other keys are kept (updatePrefs patches)
            expect((await storageGet("prefs")).checkNoAuto).toBe(true);
        });
    });

    describe("Sources", function () {
        it("filters, counts and turns all sources off and on", async function () {
            const total = await page.$$eval(
                "#select-sources-container .o-cell",
                (c) => c.length,
            );
            expect(total).toBe(15); // collapsed
            const count = await page.$eval("#sources-count", (el) => el.textContent);
            const n = Number(count.match(/of (\d+)/)[1]);
            expect(count).toBe(`${n} of ${n} on`);

            await page.type("#sources-filter", "arxiv");
            await sleep(150);
            const names = await page.$$eval("#select-sources-container .o-cell", (c) =>
                c.map((x) => x.textContent.trim()),
            );
            expect(names.some((t) => t.startsWith("ArXiv"))).toBe(true);
            expect(names.every((t) => /arxiv/i.test(t))).toBe(true);
            await page.$eval("#sources-filter", (el) => {
                el.value = "";
                el.dispatchEvent(new Event("input"));
            });

            await page.click("#sources-all-off");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("ignoreSources", ({ ignoreSources }) =>
                            r(Object.values(ignoreSources).every(Boolean)),
                        ),
                    ),
            );
            await sleep(150);
            expect(await page.$eval("#sources-count", (el) => el.textContent)).toBe(
                `0 of ${n} on`,
            );
            await page.click("#sources-all-on");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("ignoreSources", ({ ignoreSources }) =>
                            r(!Object.values(ignoreSources).some(Boolean)),
                        ),
                    ),
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
        });
    });

    describe("Auto-tagging", function () {
        const matchText = (text) =>
            page.waitForFunction(
                (t) =>
                    document.querySelector(".o-rule .o-match")?.textContent.trim() ===
                    t,
                { timeout: 5000 },
                text,
            );
        it("shows a live match count and saves rules in the same format", async function () {
            await page.click("#auto-tags-add");
            await page.type(".o-rule .o-rule-title", "hyper-parameter|cycle");
            await matchText("2 papers");
            await page.type(".o-rule .o-rule-authors", "bengio");
            await matchText("1 paper");
            await page.type(".o-rule .pm-tagin", "hpo");
            await page.keyboard.press("Enter");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("autoTags", ({ autoTags }) =>
                            r(
                                autoTags?.[0]?.tags?.[0] === "hpo" &&
                                    autoTags[0].authors === "bengio",
                            ),
                        ),
                    ),
            );
            expect(await storageGet("autoTags")).toEqual([
                {
                    id: 0,
                    title: "hyper-parameter|cycle",
                    authors: "bengio",
                    tags: ["hpo"],
                },
            ]);
            // an invalid pattern is shown, not saved
            await page.type(".o-rule .o-rule-title", "(");
            await matchText("Invalid pattern");
            await sleep(500);
            expect((await storageGet("autoTags"))[0].title).toBe(
                "hyper-parameter|cycle",
            );
        });

        it("flags a pattern that could freeze the page, without saving it", async function () {
            // a title that makes (a|aa)*c backtrack for seconds: the worker is stopped
            const slow = structuredClone(await storageGet("papers"));
            slow["Arxiv-1703.10593"].title = "a".repeat(40);
            await storageSet({
                papers: slow,
                autoTags: [{ id: 3, title: "gan", authors: "", tags: ["g"] }],
            });
            await openOptions();
            await page.$eval(".o-rule .o-rule-title", (el) => (el.value = ""));
            await page.type(".o-rule .o-rule-title", "(a|aa)*c");
            const start = Date.now();
            await matchText("Pattern too slow");
            expect(Date.now() - start).toBeLessThan(3000);
            // the page stays responsive
            expect(await page.evaluate(() => 1 + 1)).toBe(2);
            // statically risky (nested quantifiers): flagged without running it
            await page.$eval(".o-rule .o-rule-title", (el) => (el.value = ""));
            await page.type(".o-rule .o-rule-title", "(a+)+$");
            await matchText("Pattern too slow");
            await sleep(500);
            expect((await storageGet("autoTags"))[0].title).toBe("gan");
            // a normal pattern works again afterwards (a new worker)
            await page.$eval(".o-rule .o-rule-title", (el) => (el.value = ""));
            await page.type(".o-rule .o-rule-title", "random search");
            await matchText("1 paper");
        });

        it("moves rules saved with `author` to `authors`", async function () {
            await storageSet({
                autoTags: [{ id: 0, title: "", author: "bengio", tags: ["mila"] }],
            });
            await openOptions();
            await matchText("1 paper");
            expect(await page.$eval(".o-rule .o-rule-authors", (el) => el.value)).toBe(
                "bengio",
            );
            expect(await storageGet("autoTags")).toEqual([
                { id: 0, title: "", authors: "bengio", tags: ["mila"] },
            ]);
        });

        it("keeps a rule edit typed just before a tag rename", async function () {
            await page.click("#auto-tags-add");
            await page.type(".o-rule .pm-tagin", "vision");
            await page.keyboard.press("Enter");
            await page.type(".o-rule .o-rule-title", "cycle");
            // rename right away: the debounced rule save must not be lost
            await page.click('.o-tagrow[data-tag="vision"] [data-act="rename"]');
            await page.waitForSelector(".o-rename-input");
            await page.$eval(".o-rename-input", (el) => (el.value = ""));
            await page.type(".o-rename-input", "cv");
            await page.keyboard.press("Enter");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("autoTags", ({ autoTags }) =>
                            r(autoTags?.[0]?.tags?.[0] === "cv"),
                        ),
                    ),
            );
            expect(await storageGet("autoTags")).toEqual([
                { id: 0, title: "cycle", authors: "", tags: ["cv"] },
            ]);
        });
    });

    describe("Tag manager", function () {
        const tagsOf = async () =>
            Object.fromEntries(
                Object.entries(await storageGet("papers"))
                    .filter(([k]) => !k.startsWith("__"))
                    .map(([k, p]) => [k, p.tags]),
            );

        it("lists tags with counts and flags near-duplicates", async function () {
            const rows = await page.$$eval(".o-tagrow[data-tag]", (rs) =>
                rs.map((r) => [r.dataset.tag, r.querySelector(".o-num").textContent]),
            );
            expect(rows[0]).toEqual(["vision", "2"]);
            expect(rows.length).toBe(5);
            expect(await visible("#tags-similar")).toBe(true);
            const similar = await page.$$eval(".o-tagrow .pm-badge", (bs) =>
                bs.map((b) => b.closest(".o-tagrow").dataset.tag),
            );
            expect(similar.sort()).toEqual(["Optimizations", "optimization"]);
        });

        it("renames a tag on every paper", async function () {
            await page.click('.o-tagrow[data-tag="vision"] [data-act="rename"]');
            await page.waitForSelector(".o-rename-input");
            await page.$eval(".o-rename-input", (el) => (el.value = ""));
            await page.type(".o-rename-input", "computer-vision");
            await page.keyboard.press("Enter");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(
                                papers["Arxiv-1703.10593"].tags.includes(
                                    "computer-vision",
                                ),
                            ),
                        ),
                    ),
            );
            const tags = await tagsOf();
            expect(tags["Arxiv-1703.10593"]).toEqual(["computer-vision", "gan"]);
            expect(tags["RSC-DigitalDiscovery_d2dd00066k"]).toEqual([
                "chemistry",
                "computer-vision",
            ]);
            await page.waitForSelector('.o-tagrow[data-tag="computer-vision"]');
            expect(await page.$('.o-tagrow[data-tag="vision"]')).toBe(null);
        });

        it("merges selected tags into one, after a confirmation", async function () {
            await page.click(".o-similar-group"); // selects optimization + Optimizations
            await page.waitForSelector("#tags-mergebar:not([hidden])");
            expect(await page.$eval("#tags-merge-label", (el) => el.textContent)).toBe(
                "Merge 2 tags into",
            );
            await page.select("#tags-merge-target", "optimization");
            await page.click("#tags-merge");
            await confirmDialog("ok");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(
                                !papers["JMLR-2012_bergstra12a"].tags.includes(
                                    "Optimizations",
                                ),
                            ),
                        ),
                    ),
            );
            expect((await tagsOf())["JMLR-2012_bergstra12a"]).toEqual(["optimization"]);
            expect(await visible("#tags-similar")).toBe(false);
        });

        it("merges tags ticked by hand into the tag picked in the list", async function () {
            await page.click('.o-tagrow[data-tag="gan"] .pm-check');
            await page.waitForSelector("#tags-mergebar:not([hidden])");
            expect(await visible("#tags-merge")).toBe(false); // one tag: nothing to merge
            await page.click('.o-tagrow[data-tag="chemistry"] .pm-check');
            await page.waitForSelector("#tags-merge:not([hidden])");
            await page.select("#tags-merge-target", "chemistry");
            await page.click("#tags-merge");
            await confirmDialog("ok");
            await page.waitForFunction(() =>
                document.getElementById("tags-status").textContent.startsWith("Merged"),
            );
            const tags = await tagsOf();
            expect(tags["Arxiv-1703.10593"]).toEqual(["chemistry", "vision"]);
            // untouched: it had no "gan"
            expect(tags["RSC-DigitalDiscovery_d2dd00066k"]).toEqual([
                "vision",
                "chemistry",
            ]);
            expect(await page.$('.o-tagrow[data-tag="gan"]')).toBe(null);
            expect(
                await page.$eval(
                    '.o-tagrow[data-tag="chemistry"] .o-num',
                    (el) => el.textContent,
                ),
            ).toBe("2");
        });

        it("renaming a tag to an existing one merges them after a confirmation", async function () {
            await page.click('.o-tagrow[data-tag="gan"] [data-act="rename"]');
            await page.waitForSelector(".o-rename-input");
            await page.$eval(".o-rename-input", (el) => el.select());
            await page.type(".o-rename-input", "vision");
            await page.keyboard.press("Enter");
            await page.waitForSelector("#o-dialog[open]");
            expect(await page.$eval("#o-dialog-title", (el) => el.textContent)).toBe(
                "Merge “gan” into “vision”?",
            );
            await confirmDialog("ok");
            await page.waitForFunction(() =>
                document
                    .getElementById("tags-status")
                    .textContent.startsWith("Renamed"),
            );
            expect((await tagsOf())["Arxiv-1703.10593"]).toEqual(["vision"]);
            expect(await page.$('.o-tagrow[data-tag="gan"]')).toBe(null);
        });

        it("deletes a tag after a confirmation (Cancel keeps it)", async function () {
            await page.click('.o-tagrow[data-tag="gan"] [data-act="delete"]');
            await confirmDialog("");
            expect((await tagsOf())["Arxiv-1703.10593"]).toContain("gan");
            await page.click('.o-tagrow[data-tag="gan"] [data-act="delete"]');
            await confirmDialog("ok");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(!papers["Arxiv-1703.10593"].tags.includes("gan")),
                        ),
                    ),
            );
            expect((await tagsOf())["Arxiv-1703.10593"]).toEqual(["vision"]);
        });
    });

    describe("Exports", function () {
        /** Clicks a button and returns the files it downloaded: [{name, text}] */
        const downloadsOf = async (selector) => {
            await page.evaluate(() => {
                window.__files = [];
                HTMLAnchorElement.prototype.click = async function () {
                    if (this.download)
                        window.__files.push({
                            name: this.download,
                            text: await (await fetch(this.href)).text(),
                        });
                };
            });
            await page.click(selector);
            await page.waitForFunction(() => window.__files.length > 0);
            return page.evaluate(() => window.__files);
        };

        it("exports BibTeX (.bib and .json) of a Memory that was synced (__syncId), whole", async function () {
            const synced = await storageGet("papers");
            synced.__syncId = "Chrome-123"; // what a sync leaves in the Memory
            // "#", "%" and quotes: a data: URL cut the file at "#" and lost the quotes
            synced["Arxiv-1703.10593"].bibtex =
                '@article{zhu2017,\n  title = {G{\\"o}del #1 at 50\\%},\n  author = {Jun-Yan Zhu},\n  year = {2017},\n  url = {https://example.com/a%20b#x}\n}';
            await storageSet({ papers: synced });
            await openOptions("#data");
            const [bib] = await downloadsOf("#download-bibtex-plain");
            expect(bib.name).toMatch(/^PaperMemory-bibtex-.*\.bib$/);
            expect(bib.text.match(/^@/gm)).toHaveLength(3);
            expect(bib.text).toContain('G{\\"o}del #1 at 50\\%');
            expect(bib.text).toContain("https://example.com/a%20b#x");
            const [json] = await downloadsOf("#download-bibtex-json");
            expect(Object.keys(JSON.parse(json.text)).sort()).toEqual(
                Object.keys(papers)
                    .filter((k) => !k.startsWith("__"))
                    .sort(),
            );
        });

        it("export by tag: ↵ on a tag typed exactly adds it, not its near-duplicate", async function () {
            await openOptions("#export-by-tag");
            await page.click("#export-tags-field input");
            await page.keyboard.type("optimization"); // "Optimizations" exists too
            await page.keyboard.press("Enter");
            const chips = await page.$$eval("#export-tags-field .pm-chip-t", (els) =>
                els.map((e) => e.textContent),
            );
            expect(chips).toEqual(["optimization"]);
            await page.select("#export-tags-format", "json-urls");
            const [file] = await downloadsOf("#export-tags-confirm");
            expect(JSON.parse(file.text)).toEqual([
                papers["JMLR-2012_bergstra12a"].pdfLink,
            ]);
        });
    });

    describe("Preprint matching", function () {
        // the APIs answer what they answered when recorded (test-preprint-matching.js)
        const recorded = readJSON(`${root}/test/data/preprint-matching.json`).responses;
        let requests, onRequest;
        const preprintOf = (id, title, year) => {
            const p = structuredClone(papers["Arxiv-1703.10593"]);
            return {
                ...p,
                id,
                title,
                year,
                venue: "",
                note: "",
                doi: "",
                tags: [],
                bibtex: `@article{${id.toLowerCase()},\n  title = {${title}},\n  author = {${p.author}},\n  year = {${year}},\n  journal = {arXiv preprint}\n}`,
            };
        };
        const ATTENTION = "Arxiv-1706.03762";
        const BIORXIV = "BioRxiv-460147";

        beforeEach(async function () {
            await storageSet({
                papers: {
                    ...papers,
                    [ATTENTION]: preprintOf(
                        ATTENTION,
                        "Attention Is All You Need",
                        "2017",
                    ),
                    [BIORXIV]: preprintOf(
                        BIORXIV,
                        "Comprehensive integration of single cell data",
                        "2018",
                    ),
                },
            });
            requests = [];
            await page.setRequestInterception(true);
            onRequest = (r) => {
                const url = r.url();
                if (!/^https?:/.test(url)) return r.continue();
                requests.push(url);
                const answer = recorded[url];
                r.respond({
                    status: answer?.status ?? 404,
                    contentType: "application/json",
                    body: answer ? JSON.stringify(answer.body) : "",
                });
            };
            page.on("request", onRequest);
            await openOptions("#preprint-matching");
        });
        afterEach(async function () {
            page.off("request", onRequest);
            await page.setRequestInterception(false);
        });

        const runCheck = async () => {
            await page.click("#start-matching");
            await page.waitForFunction(
                () =>
                    document
                        .getElementById("matching-status")
                        .textContent.startsWith("Done"),
                { timeout: 20000 },
            );
        };
        /** The button of the proposal for this title */
        const proposalButton = (title, label) =>
            page.evaluateHandle(
                (title, label) =>
                    [...document.querySelectorAll("#updates-to-confirm .o-update")]
                        .find(
                            (u) =>
                                u.querySelector(".pm-row-label").textContent === title,
                        )
                        ?.querySelectorAll("button")[label === "Accept" ? 0 : 1],
                title,
                label,
            );

        it("saves an accepted publication (venue, note, BibTeX, DOI), leaves a skipped one", async function () {
            expect(await page.$eval("#start-matching", (b) => b.textContent)).toBe(
                "Check 2 preprints",
            );
            await runCheck();
            const titles = await page.$$eval(
                "#updates-to-confirm .o-update .pm-row-label",
                (els) => els.map((e) => e.textContent).sort(),
            );
            expect(titles).toEqual([
                "Attention Is All You Need",
                "Comprehensive integration of single cell data",
            ]);
            // Unpaywall's search is gone (410): never asked
            expect(requests.some((u) => u.includes("unpaywall"))).toBe(false);

            await (await proposalButton("Attention Is All You Need", "Accept")).click();
            await (
                await proposalButton(
                    "Comprehensive integration of single cell data",
                    "Skip",
                )
            ).click();
            await waitForStorage(
                (id) =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(papers[id].venue === "NeurIPS"),
                        ),
                    ),
                ATTENTION,
            );
            const stored = await storageGet("papers");
            expect(stored[ATTENTION].note).toBe(
                "Accepted @ NeurIPS 2017 -- [dblp.org]",
            );
            expect(stored[ATTENTION].bibtex).toMatch(
                /^@inproceedings\{arxiv-1706\.03762,/,
            );
            expect(stored[ATTENTION].bibtex).toMatch(/booktitle\s*=\s*\{NeurIPS\}/);
            expect(stored[ATTENTION].bibtex).not.toMatch(/arXiv preprint/);
            expect(stored[BIORXIV].venue).toBe(""); // skipped
            expect(await page.$$("#updates-to-confirm .o-update")).toHaveLength(0);
            await page.waitForFunction(
                () =>
                    document.getElementById("start-matching").textContent ===
                    "Check 1 preprint",
            );

            // a second check works too (its progress line is back), and saves a DOI
            await runCheck();
            await (
                await proposalButton(
                    "Comprehensive integration of single cell data",
                    "Accept",
                )
            ).click();
            await waitForStorage(
                (id) =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(papers[id].venue === "Cell"),
                        ),
                    ),
                BIORXIV,
            );
            const after = (await storageGet("papers"))[BIORXIV];
            expect(after.doi).toBe("10.1016/j.cell.2019.05.031");
            // the publication's year, in the same save; the citation key is kept
            expect(after.year).toBe("2019");
            expect(after.bibtex).toMatch(/^@article\{biorxiv-460147,/);
            expect(after.note).toBe("Accepted @ Cell (2019) -- [openalex.org]");
            expect(after.bibtex).toMatch(/journal\s*=\s*\{Cell\}/);
            await noInContextRuns(page);
        });
    });

    describe("Import papers from URLs", function () {
        let onRequest;

        beforeEach(async function () {
            // every site answers 404: a Source cannot read its paper's page
            await page.setRequestInterception(true);
            onRequest = (r) =>
                /^https?:/.test(r.url())
                    ? r.respond({ status: 404, contentType: "text/plain", body: "" })
                    : r.continue();
            page.on("request", onRequest);
        });
        afterEach(async function () {
            page.off("request", onRequest);
            await page.setRequestInterception(false);
        });

        it("reports an entry whose page could not be read, and adds nothing", async function () {
            const url = "https://pubs.acs.org/doi/10.1021/acs.jpca.9b00311";
            const before = await storageGet("papers");
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-import-"));
            const file = path.join(dir, "papers.json");
            fs.writeFileSync(file, JSON.stringify([url]));
            try {
                const [chooser] = await Promise.all([
                    page.waitForFileChooser(),
                    page.click("#import-json-choose"),
                ]);
                await chooser.accept([file]);
                await page.waitForFunction(
                    () =>
                        document
                            .getElementById("import-json-status")
                            .textContent.startsWith("Done"),
                    { timeout: 20000 },
                );
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
            const lines = await page.$$eval("#json-import-feedback li", (items) =>
                items.map((li) => [li.className, li.textContent]),
            );
            expect(lines).toEqual([["is-error", `${url} could not be read.`]]);
            expect(await storageGet("papers")).toEqual(before);
        });
    });

    describe("Restore from a backup", function () {
        it("downloads the current Memory first, asks, then replaces it", async function () {
            // record downloads (downloadTextFile clicks an <a download>) and when they happen
            await page.evaluate(() => {
                window.__downloads = [];
                HTMLAnchorElement.prototype.click = function () {
                    if (this.download)
                        window.__downloads.push({
                            name: this.download,
                            dialogOpen: document.getElementById("o-dialog").open,
                        });
                };
            });
            const backup = {
                "Arxiv-1703.10593": structuredClone(papers["Arxiv-1703.10593"]),
                __dataVersion: papers.__dataVersion,
            };
            backup["Arxiv-1703.10593"].note = "from the backup";
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-restore-"));
            const file = path.join(dir, "backup.json");
            fs.writeFileSync(file, JSON.stringify(backup));
            try {
                const [chooser] = await Promise.all([
                    page.waitForFileChooser(),
                    page.click("#overwrite-choose"),
                ]);
                await chooser.accept([file]);
                await page.waitForSelector("#o-dialog[open]");
                const downloads = await page.evaluate(() => window.__downloads);
                expect(downloads.length).toBe(1);
                expect(downloads[0].name).toMatch(/^PaperMemory-data-.*\.json$/);
                expect(downloads[0].dialogOpen).toBe(false); // before the confirmation
                // nothing replaced yet
                expect(Object.keys(await storageGet("papers")).length).toBe(
                    Object.keys(papers).length,
                );
                await confirmDialog("replace");
                await waitForStorage(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(Object.keys(papers).length === 2),
                            ),
                        ),
                );
                expect((await storageGet("papers"))["Arxiv-1703.10593"].note).toBe(
                    "from the backup",
                );
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });

        /** Chooses a file with this text as the backup; returns the downloads it caused */
        const restoreWith = async (text) => {
            await page.evaluate(() => {
                window.__downloads = [];
                HTMLAnchorElement.prototype.click = function () {
                    if (this.download) window.__downloads.push(this.download);
                };
            });
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-restore-"));
            const file = path.join(dir, "backup.json");
            fs.writeFileSync(file, text);
            try {
                const [chooser] = await Promise.all([
                    page.waitForFileChooser(),
                    page.click("#overwrite-choose"),
                ]);
                await chooser.accept([file]);
                await page.waitForFunction(
                    () =>
                        document
                            .getElementById("overwriteFeedback")
                            .classList.contains("is-error") ||
                        document.getElementById("o-dialog").open,
                    { timeout: 5000 },
                );
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
            return page.evaluate(() => window.__downloads);
        };
        const invalid = {
            "a list": () => "[]",
            "tags: 42": () => {
                const b = structuredClone(papers);
                b["Arxiv-1703.10593"].tags = 42;
                return JSON.stringify(b);
            },
            "a __proto__ key": () => {
                const b = JSON.stringify(papers);
                return b.replace(
                    '{"Arxiv-1703.10593":{',
                    '{"Arxiv-1703.10593":{"__proto__":{"polluted":true},',
                );
            },
        };
        for (const [name, make] of Object.entries(invalid)) {
            it(`refuses a backup with ${name}: no download, no question, no change`, async function () {
                const before = await storageGet("papers");
                const downloads = await restoreWith(make());
                expect(downloads).toEqual([]);
                expect(
                    await page.evaluate(() => document.getElementById("o-dialog").open),
                ).toBe(false);
                const msg = await page.$eval(
                    "#overwriteFeedback",
                    (el) => el.textContent,
                );
                expect(msg).toContain("cannot be used as a backup");
                expect(await storageGet("papers")).toEqual(before);
                expect(await page.evaluate(() => ({}).polluted)).toBe(undefined);
            });
        }
    });

    describe("Sync", function () {
        it("Sync now does not upload or report success when the download fails", async function () {
            // GitHub answers with the sync gist; the background's pull fails
            const stub = await page.evaluateOnNewDocument(() => {
                window.__messages = [];
                const gist = {
                    id: "gist-test",
                    description:
                        "Automated PaperMemory sync Gist. Do not edit manually.",
                    files: {
                        TestsPaperMemorySync: {
                            filename: "TestsPaperMemorySync",
                            raw_url: "https://example.invalid/x",
                        },
                    },
                };
                const realFetch = window.fetch;
                window.fetch = (url, opts) =>
                    String(url).startsWith("https://api.github.com/gists")
                        ? Promise.resolve(
                              new Response(JSON.stringify([gist]), {
                                  status: 200,
                                  headers: { "content-type": "application/json" },
                              }),
                          )
                        : realFetch(url, opts);
                const send = chrome.runtime.sendMessage.bind(chrome.runtime);
                chrome.runtime.sendMessage = (payload, cb) => {
                    window.__messages.push(payload);
                    if (payload?.type === "pullSync")
                        return cb(
                            payload.report
                                ? { ok: false, error: "network down" }
                                : undefined,
                        );
                    if (payload?.type === "writeSync")
                        return cb(payload.report ? { ok: true } : undefined);
                    return send(payload, cb);
                };
            });
            await storageSet({ syncPAT: "ghp_test", syncState: true, syncTest: true });
            await openOptions("#sync");
            await page.waitForFunction(
                () =>
                    document.getElementById("sync-status-label").textContent ===
                    "Sync is on",
                { timeout: 5000 },
            );
            await page.evaluate(() => (window.__messages = []));
            await page.click("#sync-now");
            await page.waitForFunction(
                () =>
                    document.getElementById("sync-status-label").textContent ===
                    "Sync failed",
                { timeout: 5000 },
            );
            const help = await page.$eval("#sync-status-help", (el) => el.textContent);
            expect(help).toContain("network down");
            const types = await page.evaluate(() =>
                window.__messages.map((m) => m.type),
            );
            expect(types).toContain("pullSync");
            expect(types).not.toContain("writeSync");
            expect(await page.$eval("#side-sync-text", (el) => el.textContent)).toBe(
                "Sync failed",
            );
            await page.removeScriptToEvaluateOnNewDocument(stub.identifier);
            await storageSet({ syncPAT: "", syncState: false, syncTest: false });
        });
    });

    describe("Sync: local save failures", function () {
        it("Sync now uploads nothing when the downloaded Memory cannot be saved here", async function () {
            const stub = await page.evaluateOnNewDocument(() => {
                window.__messages = [];
                const gist = {
                    id: "gist-test",
                    description:
                        "Automated PaperMemory sync Gist. Do not edit manually.",
                    files: {
                        TestsPaperMemorySync: {
                            filename: "TestsPaperMemorySync",
                            raw_url: "https://example.invalid/x",
                        },
                    },
                };
                const realFetch = window.fetch;
                window.fetch = (url, opts) =>
                    String(url).startsWith("https://api.github.com/gists")
                        ? Promise.resolve(
                              new Response(JSON.stringify([gist]), {
                                  status: 200,
                                  headers: { "content-type": "application/json" },
                              }),
                          )
                        : realFetch(url, opts);
                const send = chrome.runtime.sendMessage.bind(chrome.runtime);
                chrome.runtime.sendMessage = (payload, cb) => {
                    window.__messages.push(payload);
                    if (payload?.type === "pullSync")
                        return cb(
                            payload.report
                                ? { ok: true, papers: { __dataVersion: 10200 } }
                                : undefined,
                        );
                    if (payload?.type === "writeSync")
                        return cb(payload.report ? { ok: true } : undefined);
                    // the local replace fails (e.g. the disk is full)
                    if (payload?.type === "memory" && payload.op?.op === "replace")
                        return cb({ ok: false, error: "disk full" });
                    return send(payload, cb);
                };
            });
            await storageSet({ syncPAT: "ghp_test", syncState: true, syncTest: true });
            try {
                await openOptions("#sync");
                await page.waitForFunction(
                    () =>
                        document.getElementById("sync-status-label").textContent ===
                        "Sync is on",
                    { timeout: 5000 },
                );
                const before = await storageGet("papers");
                await page.evaluate(() => (window.__messages = []));
                await page.click("#sync-now");
                await page.waitForFunction(
                    () =>
                        document.getElementById("sync-status-label").textContent ===
                        "Sync failed",
                    { timeout: 5000 },
                );
                expect(
                    await page.$eval("#sync-status-help", (el) => el.textContent),
                ).toContain("disk full");
                const types = await page.evaluate(() =>
                    window.__messages.map((m) => m.type),
                );
                expect(types).not.toContain("writeSync");
                expect(await storageGet("papers")).toEqual(before);
            } finally {
                await page.removeScriptToEvaluateOnNewDocument(stub.identifier);
                await storageSet({ syncPAT: "", syncState: false, syncTest: false });
            }
        });
    });

    describe("Memory written from two pages", function () {
        it("a note saved in an open popup keeps a tag renamed in the options page", async function () {
            const popup = await browser.newPage();
            try {
                await popup.goto(optionsURL.replace("options.html", "popup.html"), {
                    waitUntil: "networkidle0",
                });
                await popup.waitForFunction(() => window.__pmPopupReady === true, {
                    timeout: 15000,
                });
                // the popup holds its copy of the Memory; options renames "vision"
                await page.bringToFront();
                await page.click('.o-tagrow[data-tag="vision"] [data-act="rename"]');
                await page.waitForSelector(".o-rename-input");
                await page.$eval(".o-rename-input", (el) => (el.value = ""));
                await page.type(".o-rename-input", "computer-vision");
                await page.keyboard.press("Enter");
                await waitForStorage(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(
                                    papers["Arxiv-1703.10593"].tags.includes(
                                        "computer-vision",
                                    ),
                                ),
                            ),
                        ),
                );
                // the popup followed the change
                await popup.waitForFunction(
                    () =>
                        PMDebug.config.state.papers["Arxiv-1703.10593"].tags.includes(
                            "computer-vision",
                        ),
                    { timeout: 5000 },
                );
                // then a note is saved from the popup
                await popup.evaluate(() =>
                    PMDebug.memory.saveNote("Arxiv-1703.10593", "from the popup"),
                );
                const stored = await storageGet("papers");
                expect(stored["Arxiv-1703.10593"].note).toBe("from the popup");
                expect(stored["Arxiv-1703.10593"].tags).toEqual([
                    "computer-vision",
                    "gan",
                ]);
                expect(stored["RSC-DigitalDiscovery_d2dd00066k"].tags).toEqual([
                    "chemistry",
                    "computer-vision",
                ]);
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("a truly stale page writing one field cannot undo another page's change", async function () {
            const popup = await openPopup({ stale: true });
            try {
                await page.bringToFront();
                await page.click('.o-tagrow[data-tag="gan"] [data-act="delete"]');
                await confirmDialog("ok");
                await waitForStorage(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(!papers["Arxiv-1703.10593"].tags.includes("gan")),
                            ),
                        ),
                );
                // the popup still believes "gan" is there
                expect(
                    await popup.evaluate(
                        () => PMDebug.config.state.papers["Arxiv-1703.10593"].tags,
                    ),
                ).toContain("gan");
                await popup.evaluate(() =>
                    PMDebug.memory.saveFavoriteItem("Arxiv-1703.10593", true),
                );
                const stored = await storageGet("papers");
                expect(stored["Arxiv-1703.10593"].tags).toEqual(["vision"]);
                expect(stored["Arxiv-1703.10593"].favorite).toBe(true);
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("two pages that read first and then write at the same moment both keep their changes", async function () {
            const popup = await openPopup({ stale: true });
            try {
                const before = (await storageGet("papers"))["JMLR-2012_bergstra12a"]
                    .count;
                // barrier: both pages hold their copy, wait, then write together
                await popup.evaluate(() => {
                    window.__go = new Promise((r) => (window.__release = r));
                    window.__done = window.__go.then(() => {
                        const id = "JMLR-2012_bergstra12a";
                        return Promise.all([
                            PMDebug.memory.saveNote(id, "note from the popup"),
                            ...Array.from({ length: 10 }, () =>
                                PMDebug.memoryQueue.memoryOp({ op: "visit", id }),
                            ),
                        ]);
                    });
                });
                await page.evaluate(() => {
                    window.__go = new Promise((r) => (window.__release = r));
                    window.__done = window.__go.then(() => {
                        const id = "JMLR-2012_bergstra12a";
                        return Promise.all([
                            PMDebug.memoryQueue.memoryOp({
                                op: "retag",
                                mapping: [["optimization", "optim"]],
                            }),
                            ...Array.from({ length: 10 }, () =>
                                PMDebug.memoryQueue.memoryOp({ op: "visit", id }),
                            ),
                        ]);
                    });
                });
                await Promise.all([
                    popup.evaluate(() => window.__release()),
                    page.evaluate(() => window.__release()),
                ]);
                await Promise.all([
                    popup.evaluate(() => window.__done.then(() => true)),
                    page.evaluate(() => window.__done.then(() => true)),
                ]);
                const paper = (await storageGet("papers"))["JMLR-2012_bergstra12a"];
                expect(paper.count).toBe(before + 20);
                expect(paper.note).toBe("note from the popup");
                expect(paper.tags).toEqual(["Optimizations", "optim"]);
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("an autosave arriving after a delete does not re-create the paper", async function () {
            const popup = await openPopup();
            try {
                await page.evaluate(() =>
                    PMDebug.data.deletePaperInStorage("Arxiv-1703.10593"),
                );
                // the popup's pending note autosave lands afterwards
                const answer = await op(popup, {
                    op: "patch",
                    id: "Arxiv-1703.10593",
                    fields: { note: "late" },
                });
                expect(answer.result.missing).toBe(true);
                await popup.evaluate(() =>
                    PMDebug.memory.saveNote("Arxiv-1703.10593", "late"),
                );
                expect((await storageGet("papers"))["Arxiv-1703.10593"]).toBe(
                    undefined,
                );
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("a visit counted while a row's note is being typed: both kept, untouched fields follow", async function () {
            const id = "JMLR-2012_bergstra12a";
            const popup = await openPopup();
            try {
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(`#memory-container--${id}`);
                await popup.evaluate((id) => PMDebug.memory.openMemoryItemEdit(id), id);
                await popup.waitForSelector(
                    `#memory-container--${id} .form-note-textarea`,
                );
                await popup.$eval(
                    `#memory-container--${id} .form-note-textarea`,
                    (el) => {
                        el.value = "";
                    },
                );
                await popup.type(
                    `#memory-container--${id} .form-note-textarea`,
                    "typing",
                );
                const before = (await storageGet("papers"))[id].count;
                // elsewhere: a visit (content script) and a tag rename (options)
                await op(page, { op: "visit", id });
                await op(page, {
                    op: "retag",
                    mapping: [["Optimizations", "optimization"]],
                });
                // the form's tags (not edited) follow the rename
                await popup.waitForFunction(
                    (id) =>
                        [
                            ...document.querySelectorAll(
                                `#memory-container--${id} .pm-chip-t`,
                            ),
                        ]
                            .map((c) => c.textContent)
                            .join() === "optimization",
                    { timeout: 5000 },
                    id,
                );
                await popup.waitForFunction(
                    (id) =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(papers[id].note === "typing"),
                            ),
                        ),
                    { timeout: 5000 },
                    id,
                );
                const paper = (await storageGet("papers"))[id];
                expect(paper.count).toBe(before + 1);
                expect(paper.note).toBe("typing");
                expect(paper.tags).toEqual(["optimization"]);
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("the paper of an open row form deleted elsewhere: papers added later still show", async function () {
            const id = "JMLR-2012_bergstra12a";
            const added = "Arxiv-9999.00001";
            const popup = await openPopup();
            try {
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(`#memory-container--${id}`);
                await popup.evaluate((id) => PMDebug.memory.openMemoryItemEdit(id), id);
                await popup.waitForSelector(`#memory-container--${id}.is-edit`);
                await op(page, { op: "delete", id });
                await popup.waitForFunction(
                    (id) => !document.getElementById(`memory-container--${id}`),
                    { timeout: 5000 },
                    id,
                );
                await op(page, {
                    op: "create",
                    paper: {
                        ...papers["Arxiv-1703.10593"],
                        id: added,
                        title: "Added after the delete",
                        lastOpenDate: new Date().toJSON(),
                    },
                });
                await popup.waitForSelector(
                    `#memory-container--${added.replace(".", "\\.")}`,
                    {
                        timeout: 5000,
                    },
                );
            } finally {
                await popup.close();
            }
        });

        it("a visit elsewhere keeps what is open in its row and the focus in it", async function () {
            const id = "Arxiv-1703.10593";
            const row = `#memory-container--${id.replace(".", "\\.")}`;
            await op(page, {
                op: "patch",
                id,
                fields: { note: "1\n2\n3\n4\n5", lastOpenDate: new Date().toJSON() },
            });
            await storageSet({ prefs: { checkAr5iv: true, theme: "light" } });
            const popup = await openPopup();
            try {
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(`${row} .pm-note-more:not([hidden])`);
                await popup.click(`${row} .pm-note-more`);
                /** A visit counted elsewhere, once the popup has it */
                const visitElsewhere = async () => {
                    const n = (await storageGet("papers"))[id].count + 1;
                    await op(page, { op: "visit", id });
                    await popup.waitForFunction(
                        (id, n) => PMDebug.config.state.papers[id].count === n,
                        { timeout: 5000 },
                        id,
                        n,
                    );
                    await sleep(100);
                };
                // the "…" menu, focused
                await popup.click(`${row} .memory-item-more`);
                await visitElsewhere();
                expect(
                    await popup.$eval(row, (r) => [
                        r.querySelector(".pm-item-note").classList.contains("is-open"),
                        r.querySelector(".pm-note-more").textContent,
                        r.classList.contains("menu-open"),
                        document.activeElement.classList.contains("memory-item-more"),
                    ]),
                ).toEqual([true, "less", true, true]);
                // the ⓘ panel, focused
                await popup.click(`${row} .memory-item-info`);
                await visitElsewhere();
                expect(
                    await popup.$eval(row, (r) => [
                        !!r.querySelector(".pm-info-pop"),
                        r.contains(document.activeElement) &&
                            document.activeElement.classList.contains(
                                "memory-item-info",
                            ),
                    ]),
                ).toEqual([true, true]);
            } finally {
                await popup.close();
            }
        });

        it("a row changed elsewhere keeps the focus on the same control, not the same position", async function () {
            const id = "Arxiv-1703.10593";
            const row = `#memory-container--${id.replace(".", "\\.")}`;
            await op(page, {
                op: "patch",
                id,
                fields: { tags: ["gan"], lastOpenDate: new Date().toJSON() },
            });
            const popup = await openPopup();
            try {
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(row);
                await popup.focus(`${row} .memory-item-copy-link`);
                // a tag added elsewhere: one more control before the action line
                await op(page, {
                    op: "patch",
                    id,
                    fields: { tags: ["gan", "new-tag"] },
                });
                await popup.waitForFunction(
                    (sel) =>
                        document.querySelectorAll(`${sel} .memory-tag`).length === 2,
                    { timeout: 5000 },
                    row,
                );
                expect(
                    await popup.evaluate(() => [...document.activeElement.classList]),
                ).toContain("memory-item-copy-link");
                // focus on a tag: the same tag after the change
                await popup.focus(`${row} .memory-tag:nth-child(3)`);
                const tag = await popup.evaluate(
                    () => document.activeElement.textContent,
                );
                await op(page, {
                    op: "patch",
                    id,
                    fields: { tags: ["a-first", "gan", "new-tag"] },
                });
                await popup.waitForFunction(
                    (sel) =>
                        document.querySelectorAll(`${sel} .memory-tag`).length === 3,
                    { timeout: 5000 },
                    row,
                );
                expect(
                    await popup.evaluate(() => document.activeElement.textContent),
                ).toBe(tag);
            } finally {
                await popup.close();
            }
        });

        it("a focused scrolling Info panel keeps the focus through a change elsewhere", async function () {
            const id = "Arxiv-1703.10593";
            const row = `#memory-container--${id.replace(".", "\\.")}`;
            await op(page, {
                op: "patch",
                id,
                fields: { lastOpenDate: new Date().toJSON() },
            });
            const popup = await openPopup();
            try {
                // a short popup: the panel scrolls, so it is focusable
                await popup.setViewport({ width: 450, height: 260 });
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(row);
                await popup.click(`${row} .memory-item-info`);
                await popup.waitForSelector(`${row} .pm-info-pop`);
                expect(
                    await popup.$eval(`${row} .pm-info-pop`, (p) => p.tabIndex),
                ).toBe(0);
                await popup.focus(`${row} .pm-info-pop`);
                const n = (await storageGet("papers"))[id].count + 1;
                await op(page, { op: "visit", id });
                await popup.waitForFunction(
                    (id, n) => PMDebug.config.state.papers[id].count === n,
                    { timeout: 5000 },
                    id,
                    n,
                );
                await sleep(100);
                expect(
                    await popup.evaluate(
                        (sel) =>
                            document.activeElement ===
                            document.querySelector(`${sel} .pm-info-pop`),
                        row,
                    ),
                ).toBe(true);
            } finally {
                await popup.close();
            }
        });

        it("a migration and an add at the same time: both land", async function () {
            // both pages are open (and initialised) before the legacy data appears
            const popup = await openPopup();
            try {
                const legacy = readJSON(`${root}/test/data/memory.json`);
                const arxiv = legacy["Arxiv-1703.10593"];
                const old = {
                    __dataVersion: 304,
                    "Arxiv-1703.10593": { ...arxiv, codeLink: false, venue: "" },
                };
                await page.evaluate((p) => PMDebug.data.setStorage("papers", p), old);
                const version = await page.evaluate(() =>
                    PMDebug.data.getManifestDataVersion(),
                );
                const added = structuredClone(papers["JMLR-2012_bergstra12a"]);
                const [migration, creation] = await Promise.all([
                    op(popup, { op: "migrate", version }),
                    op(page, { op: "create", paper: added }),
                ]);
                expect(migration.ok && creation.ok).toBe(true);
                expect(migration.result.migrated).toBe(true); // it really ran in the race
                const stored = await storageGet("papers");
                expect(stored.__dataVersion).toBe(version);
                expect(stored["JMLR-2012_bergstra12a"].title).toBe(added.title);
                expect(stored["Arxiv-1703.10593"].codeLink).toBe(""); // migrated
                // a migration asked again finds nothing to do
                const again = await op(page, { op: "migrate", version });
                expect(again.result.migrated).toBe(false);
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });

        it("a code link typed while its previous save is pending stays marked as edited", async function () {
            const id = "JMLR-2012_bergstra12a";
            // the popup's code link saves reach the background 1 s late
            const popup = await browser.newPage();
            await popup.evaluateOnNewDocument(() => {
                const send = chrome.runtime.sendMessage.bind(chrome.runtime);
                chrome.runtime.sendMessage = (payload, cb) => {
                    if (payload?.type === "memory" && payload.op?.fields?.codeLink)
                        return setTimeout(() => send(payload, cb), 1000);
                    return send(payload, cb);
                };
            });
            await popup.goto(optionsURL.replace("options.html", "popup.html"), {
                waitUntil: "networkidle0",
            });
            await popup.waitForFunction(() => window.__pmPopupReady === true, {
                timeout: 15000,
            });
            try {
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(`#memory-container--${id}`);
                await popup.evaluate((id) => PMDebug.memory.openMemoryItemEdit(id), id);
                const input = `#memory-container--${id} .form-code-input`;
                await popup.waitForSelector(input);
                await popup.type(input, "github.com/a");
                await sleep(400); // its save is sent (and pending)
                await popup.type(input, "b");
                // the first save is acknowledged; the field moved on: still edited
                await popup.waitForFunction(
                    (id) =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(papers[id].codeLink === "https://github.com/a"),
                            ),
                        ),
                    { timeout: 5000 },
                    id,
                );
                await popup.$eval(
                    `#memory-container--${id} .form-note-textarea`,
                    (el) => el.focus(),
                );
                // another page changes the code link: the edited field is not overwritten
                await op(page, {
                    op: "patch",
                    id,
                    fields: { codeLink: "https://example.org/other" },
                });
                await sleep(300);
                expect(await popup.$eval(input, (el) => el.value)).toBe(
                    "github.com/ab",
                );
                // and its own save lands last
                await popup.waitForFunction(
                    (id) =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(papers[id].codeLink === "https://github.com/ab"),
                            ),
                        ),
                    { timeout: 5000 },
                    id,
                );
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
        });
    });

    describe("Popup saves that fail", function () {
        /** A popup (optionally on a paper's tab) whose Memory writes of `failing` fail */
        const openFailingPopup = async (tabUrl) => {
            const popup = await browser.newPage();
            await popup.evaluateOnNewDocument((url) => {
                if (url) chrome.tabs.query = (q, cb) => cb([{ url, id: 1 }]);
                window.close = () => {};
                window.__fail = null; // (op) => boolean
                window.__messages = [];
                const send = chrome.runtime.sendMessage.bind(chrome.runtime);
                chrome.runtime.sendMessage = (payload, cb) => {
                    window.__messages.push(payload?.type);
                    if (payload?.type === "memory" && window.__fail?.(payload.op))
                        return cb({ ok: false, error: "disk full" });
                    return send(payload, cb);
                };
            }, tabUrl ?? null);
            await popup.goto(optionsURL.replace("options.html", "popup.html"), {
                waitUntil: "networkidle0",
            });
            await popup.waitForFunction(() => window.__pmPopupReady === true, {
                timeout: 15000,
            });
            return popup;
        };

        it("a note whose save fails stays open with its text, also through a refresh", async function () {
            const id = "Arxiv-1703.10593";
            const popup = await openFailingPopup(papers[id].pdfLink);
            const textarea = `#popup-form-note-textarea--${id.replace(".", "\\.")}`;
            try {
                await popup.waitForSelector(textarea);
                await popup.evaluate(() => {
                    window.__fail = (op) =>
                        op.op === "patch" && "note" in (op.fields ?? {});
                });
                await popup.keyboard.press("e");
                await popup.waitForSelector(`${textarea}:not([hidden])`);
                await popup.$eval(textarea, (el) => {
                    el.value = "";
                    el.focus();
                });
                await popup.type(textarea, "my text");
                await sleep(500); // the autosave fails
                // leave the note: the editor must not close on a failed save
                await popup.evaluate(() => document.activeElement.blur());
                await sleep(500);
                expect(
                    await popup.$eval(textarea, (el) => [el.hidden, el.value]),
                ).toEqual([false, "my text"]);
                expect(
                    await popup.$eval("#popup-feedback-copied", (el) => el.textContent),
                ).toContain("Couldn’t save");
                // another page changes the note: the unsaved text is kept
                await op(page, { op: "patch", id, fields: { note: "external" } });
                await sleep(500);
                expect(await popup.$eval(textarea, (el) => el.value)).toBe("my text");
                // the save works again: it is written, then the editor closes
                await popup.evaluate(() => (window.__fail = null));
                await popup.$eval(textarea, (el) => el.focus());
                await popup.evaluate(() => document.activeElement.blur());
                await popup.waitForFunction(
                    (sel) => document.querySelector(sel).hidden,
                    { timeout: 5000 },
                    textarea,
                );
                expect((await storageGet("papers"))[id].note).toBe("my text");
                await noInContextRuns(popup);
            } finally {
                await popup.close();
            }
        });

        it("a delete that fails keeps the paper and gives the focus back to its row", async function () {
            const id = "Arxiv-1703.10593";
            const row = `#memory-container--${id.replace(".", "\\.")}`;
            const popup = await openFailingPopup();
            try {
                await popup.evaluate(() => {
                    window.__fail = (op) => op.op === "delete";
                });
                await popup.waitForFunction(() => PMDebug.config.state.memoryIsOpen); // Memory (open on start: checkDirectOpen)
                await popup.waitForSelector(row);
                await popup.focus(row);
                await popup.keyboard.press("Backspace");
                await popup.waitForSelector("#delete-paper-modal", { visible: true });
                await popup.keyboard.press("Enter");
                await popup.waitForSelector("#delete-paper-modal", { hidden: true });
                expect(
                    await popup.$eval("#popup-feedback-copied", (el) => el.textContent),
                ).toContain("Couldn’t save");
                expect(await popup.evaluate(() => document.activeElement?.id)).toBe(
                    `memory-container--${id}`,
                );
                expect((await storageGet("papers"))[id]).toBeTruthy();
            } finally {
                await popup.close();
            }
        });

        it("a website page whose save fails keeps its sheet open, uploads nothing", async function () {
            const popup = await openFailingPopup();
            const url = "https://example.org/a-post";
            try {
                await popup.evaluate(async (url) => {
                    const src = PMDebug.sources.getSource("website");
                    const paper = await PMDebug.paper.initPaper({
                        ...src.fromMeta(url, "A post"),
                        source: src.name,
                    });
                    PMDebug.popup.editManualWebsite(paper, url);
                }, url);
                await popup.waitForSelector("#manual-website-author");
                await popup.$eval(
                    "#manual-website-author",
                    (el) => (el.value = "Jane Doe"),
                );
                await popup.$eval("#manual-website-year", (el) => (el.value = "2021"));
                await popup.evaluate(() => {
                    window.__fail = (op) => op.op === "merge";
                    window.__messages = [];
                });
                await popup.click('button[form="manual-website-form"]');
                await popup.waitForFunction(
                    () =>
                        document.getElementById("manual-website-validation")
                            .textContent === "Couldn’t save — try again",
                    { timeout: 5000 },
                );
                expect(
                    await popup.$eval(
                        "#modal-manual-website-content",
                        (el) => el.style.display !== "none",
                    ),
                ).toBe(true);
                expect(
                    await popup.$eval("#manual-website-author", (el) => el.value),
                ).toBe("Jane Doe");
                expect(await popup.evaluate(() => window.__messages)).not.toContain(
                    "writeSync",
                );
                const stored = await storageGet("papers");
                expect(Object.keys(stored).some((k) => k.startsWith("Website_"))).toBe(
                    false,
                );
                // it works again: same sheet, saved, closed
                await popup.evaluate(() => (window.__fail = null));
                await popup.click('button[form="manual-website-form"]');
                // polled on a timer: `page` is a background tab now (the popup is in
                // front), where the default requestAnimationFrame polling never runs again
                await waitForStorage(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.get("papers", ({ papers }) =>
                                r(
                                    Object.keys(papers).some((k) =>
                                        k.startsWith("Website_"),
                                    ),
                                ),
                            ),
                        ),
                );
                await noInContextRuns(popup);
            } finally {
                await popup.close();
            }
        });
    });

    describe("Restore: legacy files and changes during the question", function () {
        const chooseBackup = async (text) => {
            await page.evaluate(() => {
                HTMLAnchorElement.prototype.click = function () {};
            });
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-restore-"));
            const file = path.join(dir, "backup.json");
            fs.writeFileSync(file, text);
            try {
                const [chooser] = await Promise.all([
                    page.waitForFileChooser(),
                    page.click("#overwrite-choose"),
                ]);
                await chooser.accept([file]);
                await page.waitForFunction(
                    () =>
                        document
                            .getElementById("overwriteFeedback")
                            .classList.contains("is-error") ||
                        document.getElementById("o-dialog").open,
                    { timeout: 10000 },
                );
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        };

        it("accepts a v304 backup with codeLink: false (checked after migration)", async function () {
            const legacy = readJSON(`${root}/test/data/memory.json`);
            legacy["Arxiv-1703.10593"].codeLink = false;
            legacy["Arxiv-1703.10593"].venue = "";
            legacy["OR-ICLR-2022_EZNOb_uNpJk"].venue = "";
            await chooseBackup(JSON.stringify(legacy));
            expect(
                await page.evaluate(() => document.getElementById("o-dialog").open),
            ).toBe(true);
            await confirmDialog("replace");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(!!papers["OR-ICLR-2022_EZNOb_uNpJk"]),
                        ),
                    ),
            );
            expect((await storageGet("papers"))["Arxiv-1703.10593"].codeLink).toBe("");
        });

        it("asks again when the Memory changed during the question, and keeps what it replaced", async function () {
            const backup = {
                __dataVersion: papers.__dataVersion,
                "Arxiv-1703.10593": structuredClone(papers["Arxiv-1703.10593"]),
            };
            await chooseBackup(JSON.stringify(backup));
            // while the question is open, another page edits a note
            const popup = await openPopup();
            try {
                await op(popup, {
                    op: "patch",
                    id: "JMLR-2012_bergstra12a",
                    fields: { note: "edited during the question" },
                });
                await noInContextRuns(popup, page);
            } finally {
                await popup.close();
            }
            await page.bringToFront();
            await page.click('#o-dialog-foot button[value="replace"]');
            await page.waitForFunction(
                () =>
                    document.getElementById("o-dialog").open &&
                    document.getElementById("o-dialog-title").textContent ===
                        "Your Memory changed meanwhile",
                { timeout: 5000 },
            );
            expect(
                await page.$eval("#o-dialog-body", (el) => el.textContent),
            ).toContain("1 edited");
            // nothing replaced yet
            expect(Object.keys(await storageGet("papers")).length).toBe(
                Object.keys(papers).length,
            );
            await confirmDialog("replace");
            await waitForStorage(
                () =>
                    new Promise((r) =>
                        chrome.storage.local.get("papers", ({ papers }) =>
                            r(Object.keys(papers).length === 2),
                        ),
                    ),
            );
            // the exact Memory replaced, edit included, is kept in storage
            const recovery = await storageGet("memoryRecovery");
            expect(recovery.papers["JMLR-2012_bergstra12a"].note).toBe(
                "edited during the question",
            );
            expect(
                await page.$eval("#overwriteFeedback", (el) => el.textContent),
            ).toContain("Download the replaced Memory");
        });
    });

    describe("Agent access: pairing requests", function () {
        // the background's pairing requests are stubbed in the page (stubPairingRequests):
        // it keeps them only while an agent's connection is open
        const now = Date.now();
        // a client's name is its own: markup and a right-to-left override stay text
        const hostile = "<img src=x onerror=alert(1)>‮evil";
        const requests = [
            { requestId: "request-1", clientName: "Claude Code", requestedAt: now },
            { requestId: "request-2", clientName: hostile, requestedAt: now + 1000 },
        ];
        let stubbed;

        /** The options page, its pairing requests stubbed, set up */
        const openStubbed = async (listed) => {
            stubbed = await browser.newPage();
            await stubbed.evaluateOnNewDocument(stubPairingRequests, listed);
            await stubbed.goto(optionsURL, { waitUntil: "networkidle0" });
            await stubbed.waitForFunction(
                () => document.documentElement.dataset.optionsReady === "true",
                { timeout: 15000 },
            );
            return stubbed;
        };
        /** The client names listed in a card, as text */
        const names = (p, card) =>
            p.$$eval(`${card} .agent-pairing-list bdi`, (els) =>
                els.map((el) => el.textContent),
            );
        const shown = (p, selector) =>
            p.$eval(selector, (el) => !el.hidden && el.getClientRects().length > 0);
        const outcome = (p) =>
            p.$eval("#agent-pairing .agent-pairing-outcome", (el) => el.textContent);
        /** Waits until both cards list exactly these client names */
        const waitForNames = (p, expected) =>
            p.waitForFunction(
                (expected) =>
                    ["#agent-pairing", "#agent-pairing-requests"].every(
                        (card) =>
                            JSON.stringify(
                                [
                                    ...document.querySelectorAll(
                                        `${card} .agent-pairing-list bdi`,
                                    ),
                                ].map((el) => el.textContent),
                            ) === JSON.stringify(expected),
                    ),
                { timeout: 5000 },
                expected,
            );

        // pairing rows ignore clicks for 1 s after they appeared or moved
        const settle = () => new Promise((resolve) => setTimeout(resolve, 1200));

        afterEach(async function () {
            await stubbed?.close();
            stubbed = null;
        });

        it("lists every request at the top and in Agent access, with a red dot on Agent access, kept current", async function () {
            const p = await openStubbed(requests);
            const listed = ["Claude Code", hostile];
            expect(await names(p, "#agent-pairing")).toEqual(listed);
            expect(await names(p, "#agent-pairing-requests")).toEqual(listed);
            expect(await p.$$eval(".agent-pairing-list img", (els) => els.length)).toBe(
                0,
            );
            expect(await shown(p, "#agent-pairing")).toBe(true);
            expect(await shown(p, "#agent-pairing-requests")).toBe(true);
            expect(await shown(p, "#agent-nav-dot")).toBe(true);
            // Allow, in Agent access
            await settle();
            await p.click("#agent-pairing-requests .agent-pairing-list .pm-row button");
            await p.waitForFunction(() => window.__pairing.decisions.length === 1);
            expect(await p.evaluate(() => window.__pairing.decisions)).toEqual([
                { type: "agent-pair-decision", requestId: "request-1", allow: true },
            ]);
            await waitForNames(p, [hostile]);
            expect(await outcome(p)).toBe("Allowed Claude Code.");
            expect(await shown(p, "#agent-nav-dot")).toBe(true);
            // Deny, at the top: none waits, the dot goes, the cards keep the outcome
            await settle(); // request-2 moved to the top
            const deny = await p.$$("#agent-pairing .agent-pairing-list button");
            await deny[1].click();
            await waitForNames(p, []);
            expect(await p.evaluate(() => window.__pairing.decisions.at(-1))).toEqual({
                type: "agent-pair-decision",
                requestId: "request-2",
                allow: false,
            });
            expect(await outcome(p)).toBe(`Denied ${hostile}.`);
            expect(await shown(p, "#agent-nav-dot")).toBe(false);
            expect(await shown(p, "#agent-pairing")).toBe(true);
            // a new request, while the page is open: the background says the list
            // changed
            await p.evaluate(() => {
                window.__pairing.requests = [
                    { requestId: "request-3", clientName: "Codex", requestedAt: 0 },
                ];
            });
            await notifyPairingChanged(browser);
            await waitForNames(p, ["Codex"]);
            expect(await shown(p, "#agent-nav-dot")).toBe(true);
            // answered elsewhere (another options tab) before this page heard of it
            await p.evaluate(() => (window.__pairing.requests = []));
            await settle();
            await p.click("#agent-pairing .agent-pairing-list .pm-row button");
            await p.waitForFunction(
                () =>
                    document.querySelector("#agent-pairing .agent-pairing-outcome")
                        .textContent ===
                    "This pairing request has expired or was already answered.",
                { timeout: 5000 },
            );
            await waitForNames(p, []);
            expect(await shown(p, "#agent-nav-dot")).toBe(false);
        });

        it("ignores clicks on a pairing row for 1 s after it appeared or moved", async function () {
            const p = await openStubbed([]);
            const decisions = () => p.evaluate(() => window.__pairing.decisions.length);
            const first = "#agent-pairing .agent-pairing-list .pm-row button";
            await p.evaluate(
                (listed) => (window.__pairing.requests = listed),
                [requests[0]],
            );
            await notifyPairingChanged(browser);
            await waitForNames(p, ["Claude Code"]);
            // just appeared: the click does nothing
            expect(await p.$eval(first, (el) => el.disabled)).toBe(true);
            await p.click(first);
            expect(await decisions()).toBe(0);
            await settle();
            expect(await p.$eval(first, (el) => el.disabled)).toBe(false);
            // a second request below it, settled too
            await p.evaluate(
                (listed) => (window.__pairing.requests = listed),
                [requests[0], requests[1]],
            );
            await notifyPairingChanged(browser);
            await waitForNames(p, ["Claude Code", hostile]);
            await settle();
            // the first one goes away: the second slides to its position, where the
            // user's click was aimed at another agent
            await p.evaluate(
                (listed) => (window.__pairing.requests = listed),
                [requests[1]],
            );
            await notifyPairingChanged(browser);
            await waitForNames(p, [hostile]);
            await p.click(first);
            // even with the button enabled, the click handler ignores the click
            await p.$eval(first, (el) => (el.disabled = false));
            await p.click(first);
            expect(await decisions()).toBe(0);
            // after 1 s the click is taken
            await settle();
            await p.click(first);
            await p.waitForFunction(() => window.__pairing.decisions.length === 1);
            expect(await p.evaluate(() => window.__pairing.decisions)).toEqual([
                { type: "agent-pair-decision", requestId: "request-2", allow: true },
            ]);
        });

        it("shows no card and no dot when no request waits, until one does", async function () {
            const p = await openStubbed([]);
            expect(await shown(p, "#agent-pairing")).toBe(false);
            expect(await shown(p, "#agent-pairing-requests")).toBe(false);
            expect(await shown(p, "#agent-nav-dot")).toBe(false);
            await p.evaluate(
                (listed) => (window.__pairing.requests = listed),
                requests,
            );
            await notifyPairingChanged(browser);
            await waitForNames(p, ["Claude Code", hostile]);
            expect(await shown(p, "#agent-nav-dot")).toBe(true);
            // the request ended (its agent session closed): gone without a reload
            await p.evaluate(() => (window.__pairing.requests = []));
            await notifyPairingChanged(browser);
            await waitForNames(p, []);
            expect(await shown(p, "#agent-pairing")).toBe(false);
            expect(await shown(p, "#agent-nav-dot")).toBe(false);
        });

        it("says when each request was made, with the date unless today, and how many sessions wait when several do", async function () {
            const earlier = Date.now() - 2 * 24 * 3600 * 1000;
            const today = Date.now();
            const p = await openStubbed([
                { requestId: "request-1", clientName: "Codex", requestedAt: earlier },
                {
                    requestId: "request-2",
                    clientName: "Claude Code",
                    requestedAt: today,
                    sessions: 3,
                },
            ]);
            const help = await p.$$eval(
                "#agent-pairing .agent-pairing-list .pm-row",
                (rows) =>
                    rows.map((row) =>
                        [...row.querySelectorAll(".pm-row-help")].map(
                            (el) => el.textContent,
                        ),
                    ),
            );
            const [date, earlierTime, todayTime] = await p.evaluate(
                (earlier, today) => {
                    const time = (t) =>
                        new Date(t).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        });
                    return [
                        new Date(earlier).toLocaleDateString(),
                        time(earlier),
                        time(today),
                    ];
                },
                earlier,
                today,
            );
            const asked = "to search your Memory and add papers to it";
            expect(help).toEqual([
                [`Asked on ${date} at ${earlierTime} ${asked}`],
                [`Asked at ${todayTime} ${asked}`, "3 sessions waiting"],
            ]);
        });

        it("keeps long names, and names with stacked marks, inside their rows, clear of the buttons and of the lines under them", async function () {
            const long = "W".repeat(64);
            const stacked = `Z${"\u0351\u0352\u0353\u0354\u0355\u0356".repeat(8)}algo`;
            await storageSet({
                agentClients: {
                    "client-long": {
                        clientName: long,
                        secretHash: "0".repeat(64),
                        pairedAt: new Date().toISOString(),
                        lastSeenAt: new Date().toISOString(),
                    },
                },
            });
            try {
                const p = await openStubbed([
                    {
                        requestId: "request-1",
                        clientName: long,
                        requestedAt: 1,
                        sessions: 2,
                    },
                    {
                        requestId: "request-2",
                        clientName: stacked,
                        requestedAt: 2,
                        sessions: 2,
                    },
                    { requestId: "request-3", clientName: "Codex", requestedAt: 3 },
                ]);
                const rows = await p.$$eval(
                    [
                        "#agent-pairing .agent-pairing-list .pm-row",
                        "#agent-pairing-requests .agent-pairing-list .pm-row",
                        "#agent-clients-list .pm-row",
                    ].join(", "),
                    (rows) =>
                        rows.map((row) => {
                            const box = (el) => el.getBoundingClientRect().toJSON();
                            const name = row.querySelector("bdi");
                            return {
                                row: box(row),
                                name: box(name),
                                // Allow and Deny, or Revoke
                                buttons: box(
                                    row.querySelector(".o-btns") ??
                                        row.querySelector("button"),
                                ),
                                helps: [...row.querySelectorAll(".pm-row-help")].map(
                                    box,
                                ),
                                // what a mark draws beyond the name's box is not shown
                                clipped: [name, row].every(
                                    (el) => getComputedStyle(el).overflow === "hidden",
                                ),
                                card: box(row.closest(".o-card")),
                            };
                        }),
                );
                expect(rows).toHaveLength(7);
                for (const { row, name, buttons, helps, clipped, card } of rows) {
                    expect(clipped).toBe(true);
                    expect(name.right).toBeLessThanOrEqual(buttons.left);
                    expect(name.left).toBeGreaterThanOrEqual(row.left);
                    expect(name.top).toBeGreaterThanOrEqual(row.top);
                    expect(row.right).toBeLessThanOrEqual(card.right);
                    for (const help of helps) {
                        expect(help.top).toBeGreaterThanOrEqual(name.bottom);
                        expect(help.bottom).toBeLessThanOrEqual(row.bottom);
                    }
                }
                // the long name wraps instead of widening the page
                expect(rows[0].name.height).toBeGreaterThan(rows[2].name.height);
                expect(
                    await p.evaluate(
                        () =>
                            document.documentElement.scrollWidth <=
                            document.documentElement.clientWidth,
                    ),
                ).toBe(true);
            } finally {
                await page.evaluate(
                    () =>
                        new Promise((r) =>
                            chrome.storage.local.remove("agentClients", r),
                        ),
                );
            }
        });
    });
});

// The owner's "tag merge / accepted preprint doesn't work": with sync on, a change made
// right after the background service worker (re)started was never uploaded (the gist was
// not known yet), so the next pull brought the gist's older Memory back. GitHub's API is
// faked here (no real gist); the service worker is stopped like Chrome does when idle.
describe("Options page: changes made after the background restarted are synced", function () {
    let browser, page, base, cdp, papers;
    let gistContent, patches, patchDelays;
    const FILE = "DO_NO_EDIT__PaperMemorySyncV2.json";

    this.timeout(90000);
    this.slow(30000);

    const gist = () => ({
        id: "g1",
        description: "Automated PaperMemory sync Gist. Do not edit manually.",
        files: {
            [FILE]: {
                filename: FILE,
                raw_url: "https://gist.githubusercontent.com/u/g1/raw/file.json",
            },
        },
    });
    const storageGet = (key) =>
        page.evaluate(
            (k) => new Promise((r) => chrome.storage.local.get(k, (d) => r(d[k]))),
            key,
        );
    const openOptions = async (hash = "") => {
        await page.goto("about:blank");
        await page.goto(`${base}/options.html${hash}`, { waitUntil: "networkidle0" });
        await page.waitForFunction(
            () => document.documentElement.dataset.optionsReady === "true",
            { timeout: 15000 },
        );
    };
    const stopServiceWorker = async () => {
        const session = await page.createCDPSession();
        await session.send("ServiceWorker.enable");
        await session.send("ServiceWorker.stopAllWorkers");
        await session.send("ServiceWorker.disable");
        await session.detach();
        const running = async () =>
            (await cdp.send("Target.getTargets")).targetInfos.filter(
                (t) => t.type === "service_worker" && t.url.startsWith(base),
            ).length;
        for (let i = 0; i < 50 && (await running()); i++) await sleep(100);
        expect(await running()).toBe(0);
    };
    const confirm = async () => {
        await page.waitForSelector("#o-dialog[open]");
        await page.click('#o-dialog-foot button[value="ok"]');
    };
    const waitForUpload = async (check) => {
        for (let i = 0; i < 100; i++) {
            if (gistContent && check(JSON.parse(gistContent))) return;
            await sleep(100);
        }
        throw new Error("The change was not uploaded to the gist");
    };

    before(async function () {
        browser = await makeBrowser(headless, "1200,900", {
            attachServiceWorker: false,
        });
        cdp = await browser.target().createCDPSession();
        // GitHub's gist API, faked for every page and the service worker
        await cdp.send("Fetch.enable", {
            patterns: [
                { urlPattern: "https://api.github.com/*" },
                { urlPattern: "https://gist.githubusercontent.com/*" },
                // preprint matching: DBLP knows the paper; nothing else is asked
                { urlPattern: "https://sparql.dblp.org/*" },
            ],
        });
        cdp.on("Fetch.requestPaused", async (e) => {
            const { url, method, postData } = e.request;
            let body = JSON.stringify(gist());
            if (
                url.startsWith("https://api.github.com/gists/g1") &&
                method === "PATCH"
            ) {
                // a slow upload is applied late (GitHub answers it later)
                const content = JSON.parse(postData).files[FILE].content;
                const wait = patchDelays.shift();
                if (wait) await sleep(wait);
                patches.push(content);
                gistContent = content;
            } else if (url.startsWith("https://api.github.com/gists/g1")) {
                // the gist itself (body above)
            } else if (url.startsWith("https://api.github.com/gists")) {
                // the list of gists (how the background finds the gist when it starts)
                // takes a while, as GitHub's API does
                await sleep(1500);
                body = JSON.stringify([gist()]);
            } else if (url.startsWith("https://gist.githubusercontent.com"))
                body = gistContent;
            else if (url.startsWith("https://sparql.dblp.org"))
                body = JSON.stringify({
                    results: {
                        bindings: [
                            {
                                p: {
                                    value: "https://dblp.org/rec/journals/jmlr/BergstraB12",
                                },
                                title: {
                                    value: "Random Search for Hyper-Parameter Optimization.",
                                },
                                venue: { value: "J. Mach. Learn. Res." },
                                year: { value: "2012" },
                                type: { value: "https://dblp.org/rdf/schema#Article" },
                            },
                        ],
                    },
                });
            await cdp
                .send("Fetch.fulfillRequest", {
                    requestId: e.requestId,
                    responseCode: method === "OPTIONS" ? 204 : 200,
                    responseHeaders: [
                        { name: "content-type", value: "application/json" },
                        { name: "access-control-allow-origin", value: "*" },
                        { name: "access-control-allow-headers", value: "*" },
                        { name: "access-control-allow-methods", value: "GET,PATCH" },
                    ],
                    body: Buffer.from(method === "OPTIONS" ? "" : body).toString(
                        "base64",
                    ),
                })
                .catch(() => {});
        });
        page = (await browser.pages())[0];
        const id = await findExtensionId(browser);
        if (!id) throw new Error("Extension ID not found");
        base = `chrome-extension://${id}`;
        papers = readJSON(`${root}/test/data/3-papers-memory.json`);
        // the faked API only reaches extension processes started after Fetch.enable: stop
        // the worker the install started (it opened the welcome tab), so its process goes
        await stopServiceWorker();
    });

    beforeEach(async function () {
        const seeded = structuredClone(papers);
        seeded["Arxiv-1703.10593"].tags = ["gan", "GAN"];
        seeded["JMLR-2012_bergstra12a"].venue = "";
        // the gist holds this Memory, last uploaded by ANOTHER browser
        gistContent = JSON.stringify({ ...seeded, __syncId: "Firefox-other" });
        patches = [];
        patchDelays = [];
        await page.goto(`${base}/options.html`, { waitUntil: "networkidle0" });
        await page.evaluate(
            (papers) =>
                new Promise((r) =>
                    chrome.storage.local.set(
                        {
                            papers,
                            autoTags: [],
                            syncPAT: "ghp_fake",
                            syncState: true,
                            syncId: "Chrome-this",
                        },
                        r,
                    ),
                ),
            seeded,
        );
    });

    after(async function () {
        await browser?.close();
    });

    it("a tag merge is uploaded, and is still there when the page opens again", async function () {
        await openOptions("#tag-manager");
        await stopServiceWorker();
        await page.click(".o-similar-group"); // gan + GAN
        await page.waitForSelector("#tags-merge:not([hidden])");
        await page.select("#tags-merge-target", "gan");
        await page.click("#tags-merge");
        await confirm();
        await waitForUpload(
            (gistPapers) =>
                JSON.stringify(gistPapers["Arxiv-1703.10593"].tags) === '["gan"]',
        );
        // opening the page pulls the gist: the merge stays
        await openOptions("#tag-manager");
        expect((await storageGet("papers"))["Arxiv-1703.10593"].tags).toEqual(["gan"]);
        expect(await page.$('.o-tagrow[data-tag="GAN"]')).toBe(null);
    });

    it("an accepted preprint proposal is uploaded, and is still there when the page opens again", async function () {
        await openOptions("#preprint-matching");
        await stopServiceWorker();
        await page.click("#start-matching");
        await page.waitForFunction(
            () =>
                document
                    .getElementById("matching-status")
                    .textContent.startsWith("Done"),
            { timeout: 20000 },
        );
        await page.click("#updates-to-confirm .o-update .pm-btn-primary");
        await waitForUpload(
            (gistPapers) => !!gistPapers["JMLR-2012_bergstra12a"].venue,
        );
        await openOptions("#preprint-matching");
        expect((await storageGet("papers"))["JMLR-2012_bergstra12a"].venue).not.toBe(
            "",
        );
    });

    it("two quick changes: uploads run one at a time, the gist ends with the last Memory", async function () {
        await openOptions("#tag-manager");
        await stopServiceWorker();
        patchDelays = [1500]; // the first upload is slow
        for (const tag of ["gan", "GAN"]) {
            await page.click(`.o-tagrow[data-tag="${tag}"] [data-act="delete"]`);
            await confirm();
            await page.waitForFunction(
                (tag) =>
                    document.getElementById("tags-status").textContent ===
                    `Deleted “${tag}” from 1 paper.`,
                {},
                tag,
            );
        }
        await waitForUpload(() => patches.length >= 2 && !patchDelays.length);
        await sleep(500); // nothing else arrives
        expect(JSON.parse(gistContent)["Arxiv-1703.10593"].tags).toEqual([]);
        expect((await storageGet("papers"))["Arxiv-1703.10593"].tags).toEqual([]);
    });

    it("a pull of this browser's own upload writes nothing back; Sync now only uploads", async function () {
        // the gist holds this browser's last upload, older than its Memory now (a copy
        // written back would undo what changed since, e.g. a paper an agent added)
        const local = await storageGet("papers");
        const older = structuredClone(local);
        delete older["JMLR-2012_bergstra12a"];
        gistContent = JSON.stringify({ ...older, __syncId: "Chrome-this" });
        const revision = await storageGet("papersRevision");
        await openOptions("#sync"); // pulls the gist
        expect(await storageGet("papersRevision")).toBe(revision);
        expect(await storageGet("papers")).toEqual(local);
        const answer = await page.evaluate(
            () =>
                new Promise((r) =>
                    chrome.runtime.sendMessage({ type: "pullSync", report: true }, r),
                ),
        );
        expect(answer).toEqual({ ok: true, sameDevice: true });
        await page.click("#sync-now");
        await waitForUpload((gistPapers) => !!gistPapers["JMLR-2012_bergstra12a"]);
        expect(await storageGet("papersRevision")).toBe(revision);
    });
});

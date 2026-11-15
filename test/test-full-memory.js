// fullMemory (the Memory in a tab): the table and its sort headers, tag clicks, bulk select
// and bulk actions through the background queue, the details drawer (900 to 1200px), the
// popup's rows below 900px, and the live refresh (selection kept, held while editing).

import { expect } from "expect";
import { basename } from "node:path";
import { findExtensionId, makeBrowser, getPMURLs } from "./browser.js";
import { loadConfig, sleep, root, readJSON, indent } from "./utilsForTests.js";

const { keepOpen, headless } = loadConfig();
console.log(`\n${basename(import.meta.url)} args:`);
console.log("  keepOpen :", keepOpen);
console.log("  headless :", headless);

const CG = "Arxiv-1703.10593"; // 2017
const JMLR = "JMLR-2012_bergstra12a"; // 2012
const RSC = "RSC-DigitalDiscovery_d2dd00066k"; // 2022

describe("Test PaperMemory fullMemory page", function () {
    let browser, pmURLs, testData, page;
    this.timeout(60000);
    this.slow(20000);

    before(async function () {
        browser = await makeBrowser(headless);
        const extensionId = await findExtensionId(browser);
        if (!extensionId) throw new Error("Extension ID not found");
        pmURLs = getPMURLs(extensionId);
        testData = readJSON(`${root}/test/data/3-papers-memory.json`);
        testData[CG].tags = ["gan", "vision"];
        testData[JMLR].tags = ["optimization"];
    });

    after(async function () {
        if (browser && !keepOpen) await browser.close();
    });

    afterEach(async function () {
        await page?.close();
        page = null;
    });

    /** fullMemory at this width, with the test Memory */
    const open = async (width) => {
        page = await browser.newPage();
        await page.setViewport({ width, height: 900 });
        await page.goto(pmURLs.popupURL, { waitUntil: "networkidle0" });
        await page.evaluate(async (data) => {
            await PMDebug.data.setStorage("papers", data);
            await PMDebug.data.setStorage("papersRevision", 0);
        }, testData);
        await page.goto(pmURLs.fullMemoryURL, { waitUntil: "networkidle0" });
        await page.waitForFunction(() => window.__pmFullMemoryReady === true);
        console.log(indent(2) + `fullMemory open at ${width}px`);
    };
    const row = (id) => `tr[data-id="${id}"]`;
    const rowIds = () =>
        page.$$eval("#m-tbody tr", (trs) => trs.map((tr) => tr.dataset.id));
    const stored = () =>
        page.evaluate(
            () =>
                new Promise((resolve) =>
                    chrome.storage.local.get(["papers", "papersRevision"], resolve),
                ),
        );
    /** A write made elsewhere (another page): a paper's field, straight to storage */
    const writeElsewhere = (id, fields) =>
        page.evaluate(
            ([id, fields]) =>
                new Promise((resolve) =>
                    chrome.storage.local.get("papers", ({ papers }) => {
                        Object.assign(papers[id], fields);
                        chrome.storage.local.set({ papers }, resolve);
                    }),
                ),
            [id, fields],
        );

    it("should render the table and sort it from the headers", async function () {
        await open(1440);
        expect((await rowIds()).length).toBe(3);
        expect(await page.$eval("#memory-table", (el) => el.children.length)).toBe(0);
        // Year: newest first, then oldest first
        await page.click('.m-sort[data-sort="year"]');
        expect(await rowIds()).toEqual([RSC, CG, JMLR]);
        expect(
            await page.$eval('.m-sort[data-sort="year"]', (b) =>
                b.closest("th").getAttribute("aria-sort"),
            ),
        ).toBe("descending");
        await page.click('.m-sort[data-sort="year"]');
        expect(await rowIds()).toEqual([JMLR, CG, RSC]);
        // Title: A to Z
        await page.click('.m-sort[data-sort="title"]');
        expect(await rowIds()).toEqual([JMLR, RSC, CG]);
        expect(
            await page.$eval('.m-sort[data-sort="title"]', (b) =>
                b.closest("th").getAttribute("aria-sort"),
            ),
        ).toBe("ascending");
        // the detail pane shows the current paper
        await page.click(`${row(CG)} .m-t`);
        expect(
            await page.$eval("#m-detail .m-d-title", (el) => el.textContent),
        ).toMatch(/^Unpaired Image-to-Image/);
    });

    it("should replace the search with a single tag pill when a table tag is clicked", async function () {
        await open(1440);
        await page.type("#memory-search", "random");
        await sleep(300);
        await page.click(`${row(JMLR)} .pm-tg`);
        const after = await page.evaluate(() => ({
            filters: PMDebug.config.state.memoryFilters,
            text: document.getElementById("memory-search").value,
            pills: document.querySelectorAll("#memory-pills .pm-chip").length,
        }));
        expect(after).toEqual({
            filters: [{ type: "tag", value: "optimization" }],
            text: "",
            pills: 1,
        });
        expect(await rowIds()).toEqual([JMLR]);
    });

    it("should select papers and add a tag to them in one queued operation", async function () {
        await open(1440);
        await page.click(`${row(CG)} .m-select`);
        await page.click(`${row(RSC)} .m-select`);
        expect(await page.$eval("#m-bulk", (el) => el.hidden)).toBe(false);
        expect(await page.$eval("#m-bulk-count", (el) => el.textContent)).toBe(
            "2 selected",
        );
        expect(await page.$eval("#m-select-all", (el) => el.indeterminate)).toBe(true);
        const before = (await stored()).papersRevision;
        await page.click('[data-bulk="tag"]');
        await page.waitForSelector("#o-dialog[open] .pm-tagin");
        await sleep(100);
        await page.keyboard.type("to-read");
        await page.keyboard.press("Enter"); // the chip
        await page.keyboard.press("Enter"); // empty field: Add tags
        await page.waitForFunction(() => !document.getElementById("o-dialog").open);
        await page.waitForFunction(
            (id) =>
                document
                    .querySelector(`tr[data-id="${id}"] .m-tags`)
                    .textContent.includes("to-read"),
            {},
            RSC,
        );
        const { papers, papersRevision } = await stored();
        expect(papers[CG].tags).toEqual(["gan", "to-read", "vision"]);
        expect(papers[RSC].tags).toEqual(["to-read"]);
        expect(papers[JMLR].tags).toEqual(["optimization"]);
        expect(papersRevision).toBe(before + 1); // one write: a single batch
        // the selection survives the redraw
        expect(await page.$$eval("#m-tbody tr.is-selected", (trs) => trs.length)).toBe(
            2,
        );
    });

    it("should delete the selected papers after a confirmation, in one queued operation", async function () {
        await open(1440);
        await page.click(`${row(CG)} .m-select`);
        await page.click(`${row(JMLR)} .m-select`);
        const before = (await stored()).papersRevision;
        await page.click('[data-bulk="delete"]');
        await page.waitForSelector("#o-dialog[open]");
        expect(await page.$eval("#o-dialog-title", (el) => el.textContent)).toBe(
            "Delete 2 papers?",
        );
        // Cancel keeps them
        await page.click('#o-dialog-foot button[value=""]');
        expect(Object.keys((await stored()).papers)).toContain(CG);
        await page.click('[data-bulk="delete"]');
        await page.waitForSelector("#o-dialog[open]");
        await page.click('#o-dialog-foot button[value="ok"]');
        await page.waitForFunction(
            () => document.querySelectorAll("#m-tbody tr").length === 1,
        );
        const { papers, papersRevision } = await stored();
        expect(papers[CG]).toBeUndefined();
        expect(papers[JMLR]).toBeUndefined();
        expect(papers[RSC]).toBeDefined();
        expect(papersRevision).toBe(before + 1);
        expect(await page.$eval("#m-bulk", (el) => el.hidden)).toBe(true);
    });

    it("should open and close the details drawer at 1024px", async function () {
        await open(1024);
        const paneShown = () =>
            page.$eval("#m-detail", (el) => getComputedStyle(el).display !== "none");
        expect(await paneShown()).toBe(false);
        expect(
            await page.$eval(
                ".m-table th.c-visits",
                (el) => getComputedStyle(el).display,
            ),
        ).toBe("none");
        await page.focus(row(CG));
        await page.keyboard.press("d");
        expect(await paneShown()).toBe(true);
        expect(
            await page.$eval("#m-detail .m-d-title", (el) => el.textContent),
        ).toMatch(/^Unpaired/);
        await page.click("#m-detail .m-d-close");
        expect(await paneShown()).toBe(false);
        // the row's ⓘ, then d closes it again
        await page.click(`${row(JMLR)} .m-details`);
        expect(await paneShown()).toBe(true);
        expect(
            await page.$eval("#m-detail .m-d-title", (el) => el.textContent),
        ).toMatch(/^Random Search/);
        await page.focus(row(JMLR));
        await page.keyboard.press("d");
        expect(await paneShown()).toBe(false);
    });

    it("should show the popup's rows below 900px, without table or bulk select", async function () {
        await open(800);
        expect(
            await page.$$eval("#memory-table .memory-container", (els) => els.length),
        ).toBe(3);
        expect(await page.$eval("#m-tbody", (el) => el.children.length)).toBe(0);
        const hidden = await page.evaluate(() =>
            ["m-tablecard", "m-bulk", "m-detail"].map(
                (id) => getComputedStyle(document.getElementById(id)).display,
            ),
        );
        expect(hidden).toEqual(["none", "none", "none"]);
        // the popup's keys on the focused row
        await page.focus(`#memory-container--${CG.replace(".", "\\.")}`);
        await page.keyboard.press("d");
        expect(
            await page.$$eval("#memory-table .pm-info-pop", (els) => els.length),
        ).toBe(1);
    });

    it("should follow a change made elsewhere and keep the selection and the focused row", async function () {
        await open(1440);
        await page.click(`${row(RSC)} .m-select`);
        await page.focus(row(JMLR));
        await writeElsewhere(CG, { title: "A title changed elsewhere" });
        await page.waitForFunction(
            (sel) =>
                document.querySelector(sel).textContent.includes("changed elsewhere"),
            {},
            `${row(CG)} .m-t`,
        );
        expect(
            await page.$$eval("#m-tbody tr.is-selected", (trs) =>
                trs.map((t) => t.dataset.id),
            ),
        ).toEqual([RSC]);
        expect(await page.evaluate(() => document.activeElement.dataset.id)).toBe(JMLR);
    });

    it("should hold a redraw while the pane's edit form is open, then apply it", async function () {
        await open(1440);
        await page.focus(row(CG));
        await page.keyboard.press("e");
        await page.waitForSelector("#m-detail .pm-edit");
        await writeElsewhere(JMLR, { title: "Held until the form closes" });
        await sleep(500);
        expect(await page.$eval(`${row(JMLR)} .m-t`, (el) => el.textContent)).toBe(
            "Random Search for Hyper-Parameter Optimization",
        );
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
        await page.waitForFunction(() => !document.querySelector("#m-detail .pm-edit"));
        await page.waitForFunction(
            (sel) =>
                document.querySelector(sel).textContent ===
                "Held until the form closes",
            {},
            `${row(JMLR)} .m-t`,
        );
    });

    for (const width of [1440, 1024]) {
        it(`should move from row to row with Tab at ${width}px (row controls skipped)`, async function () {
            await open(width);
            const ids = await rowIds();
            await page.focus(row(ids[0]));
            for (const id of ids.slice(1)) {
                await page.keyboard.press("Tab");
                expect(
                    await page.evaluate(() => ({
                        tag: document.activeElement.tagName,
                        id: document.activeElement.dataset.id,
                    })),
                ).toEqual({ tag: "TR", id });
            }
        });
    }

    it("should hold a redraw while a row's edit form is open below 900px, then apply it", async function () {
        await open(800);
        const cg = `#memory-container--${CG.replace(".", "\\.")}`;
        await page.focus(cg);
        await page.keyboard.press("e");
        await page.waitForSelector(`${cg}.is-edit`);
        await writeElsewhere(JMLR, { title: "Held by the row form" });
        await sleep(500);
        expect(
            await page.$eval(
                `#memory-container--${JMLR} .pm-item-title`,
                (el) => el.textContent,
            ),
        ).toBe("Random Search for Hyper-Parameter Optimization");
        expect(await page.$eval(cg, (el) => el.classList.contains("is-edit"))).toBe(
            true,
        );
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
        await page.waitForFunction(
            (sel) =>
                document.querySelector(sel)?.textContent === "Held by the row form",
            { timeout: 3000 },
            `#memory-container--${JMLR} .pm-item-title`,
        );
    });

    it("should delete the selected papers when one of them was deleted elsewhere meanwhile", async function () {
        await open(1440);
        await page.evaluate(() => {
            window.__errs = [];
            addEventListener("error", (e) => window.__errs.push(e.message));
            addEventListener("unhandledrejection", (e) =>
                window.__errs.push(String(e.reason)),
            );
        });
        await page.click(`${row(CG)} .m-select`);
        await page.click(`${row(JMLR)} .m-select`);
        await page.click('[data-bulk="delete"]');
        await page.waitForSelector("#o-dialog[open]");
        await page.evaluate(
            (id) =>
                new Promise((resolve) =>
                    chrome.storage.local.get("papers", ({ papers }) => {
                        delete papers[id];
                        chrome.storage.local.set({ papers }, resolve);
                    }),
                ),
            JMLR,
        );
        await sleep(200);
        await page.click('#o-dialog-foot button[value="ok"]');
        await page.waitForFunction(
            () => document.querySelectorAll("#m-tbody tr").length === 1,
        );
        const { papers } = await stored();
        expect(Object.keys(papers).filter((k) => !k.startsWith("__"))).toEqual([RSC]);
        expect(await page.evaluate(() => window.__errs)).toEqual([]);
        expect(
            await page.$eval("#popup-feedback-copied span", (el) => el.textContent),
        ).toBe("1 paper deleted");
    });

    it("should sort again when a change made elsewhere moves a paper", async function () {
        await open(1440);
        await page.click('.m-sort[data-sort="title"]'); // A to Z
        expect(await rowIds()).toEqual([JMLR, RSC, CG]);
        await writeElsewhere(CG, { title: "Aaa: now the first title" });
        await page.waitForFunction(
            (id) => document.querySelector("#m-tbody tr")?.dataset.id === id,
            { timeout: 3000 },
            CG,
        );
        expect(await rowIds()).toEqual([CG, JMLR, RSC]);
    });

    it("should change the layout only once the pane's edit form is saved", async function () {
        await open(1440);
        const layout = () => page.evaluate(() => document.body.dataset.layout);
        await page.focus(row(CG));
        await page.keyboard.press("e");
        await page.waitForSelector("#m-detail .pm-edit");
        // the background refuses every Memory write
        await page.evaluate(() => {
            const send = chrome.runtime.sendMessage.bind(chrome.runtime);
            chrome.runtime.sendMessage = (msg, cb) =>
                msg?.type === "memory" && window.__refuse
                    ? cb({ ok: false, error: "refused by the test" })
                    : send(msg, cb);
            window.__refuse = true;
        });
        await page.$eval("#m-detail .form-note-textarea", (el) => (el.value = ""));
        await page.type("#m-detail .form-note-textarea", "Not lost");
        await page.setViewport({ width: 800, height: 900 });
        await sleep(600);
        // not saved: the form and its text stay, in view, in the wide layout
        expect(await layout()).toBe("wide");
        expect(
            await page.$eval("#m-detail .form-note-textarea", (el) => [
                el.value,
                el.offsetParent !== null,
            ]),
        ).toEqual(["Not lost", true]);
        // the next save works: the form closes, then the layout changes
        await page.evaluate(() => (window.__refuse = false));
        await page.click("#m-detail .memory-edit-done");
        await page.waitForFunction(() => document.body.dataset.layout === "narrow", {
            timeout: 3000,
        });
        expect((await stored()).papers[CG].note).toBe("Not lost");
        expect(
            await page.$$eval("#memory-table .memory-container", (els) => els.length),
        ).toBe(3);
    });

    it("should say how many papers Copy BibTeX left out (no readable BibTeX)", async function () {
        testData[RSC].bibtex = "";
        try {
            await open(1440);
        } finally {
            testData[RSC].bibtex = readJSON(`${root}/test/data/3-papers-memory.json`)[
                RSC
            ].bibtex;
        }
        await page.click(`${row(CG)} .m-select`);
        await page.click(`${row(RSC)} .m-select`);
        await page.click('[data-bulk="copy"]');
        expect(
            await page.$eval("#popup-feedback-copied span", (el) => el.textContent),
        ).toBe("BibTeX of 1 paper copied · 1 paper left out (no readable BibTeX)");
    });
});

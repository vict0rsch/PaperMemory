// The content script on a live arXiv abstract page (src/content_scripts/content_script.js):
// the PaperMemory block in arXiv's column (no forced column widths, rows gated by the prefs,
// Code link checked and opened in a new tab), the notices (Saved + Undo through the
// background, BibTeX copied), "Add to Memory" when automatic recording is off, and the
// "Couldn’t save this paper" notice with Try again. Needs the network (arxiv.org).
import { expect } from "expect";
import {
    findExtensionId,
    makeBrowser,
    seedClipboard,
    getClipboardText,
} from "./browser.js";
import { loadConfig, indent } from "./utilsForTests.js";
import fs from "fs";
import os from "os";
import path from "path";

const { headless } = loadConfig();
const ABS = "https://arxiv.org/abs/1706.03762";
const ID = "Arxiv-1706.03762";

describe("Content script on arXiv", function () {
    let browser, ext, page, worker;
    let requests = [];
    let downloads = null; // this run's download folder

    this.timeout(120000);
    this.slow(30000);

    const storageGet = (key) =>
        ext.evaluate(
            (k) => new Promise((r) => chrome.storage.local.get(k, (d) => r(d[k]))),
            key,
        );
    const storageSet = (obj) =>
        ext.evaluate((o) => new Promise((r) => chrome.storage.local.set(o, r)), obj);
    const setPrefs = async (patch) =>
        storageSet({ prefs: { ...((await storageGet("prefs")) ?? {}), ...patch } });
    const reset = async (prefs = {}) => {
        await storageSet({ papers: {}, urlHashToId: {} });
        await setPrefs({
            checkNoAuto: false,
            checkMd: true,
            checkBib: true,
            checkDownload: true,
            checkFeedback: true,
            ...prefs,
        });
    };

    /** innerText of a selector in a shadow host ("" when absent) */
    const shadowText = (host, selector) =>
        page.evaluate(
            (host, selector) =>
                document.querySelector(host)?.shadowRoot?.querySelector(selector)
                    ?.innerText ?? "",
            host,
            selector,
        );
    const blockText = () => shadowText("papermemory-block", ".pmx");
    const noticeText = () => shadowText("papermemory-notices", ".pm-toast");
    const waitShadowText = (host, selector, text, timeout = 30000) =>
        page.waitForFunction(
            (host, selector, text) =>
                document
                    .querySelector(host)
                    ?.shadowRoot?.querySelector(selector)
                    ?.innerText.includes(text),
            { timeout, polling: 50 },
            host,
            selector,
            text,
        );
    const waitBlock = (text) => waitShadowText("papermemory-block", ".pmx", text);
    const waitNotice = (text, timeout) =>
        waitShadowText("papermemory-notices", ".pm-toast", text, timeout);
    /** Clicks the button (or link) whose text includes `label` in a shadow host */
    const click = (host, label) =>
        page.evaluate(
            (host, label) => {
                const el = [
                    ...document
                        .querySelector(host)
                        .shadowRoot.querySelectorAll("button"),
                ].find((b) => b.textContent.includes(label));
                el.click();
            },
            host,
            label,
        );
    /** Clicks a block control by its data-act */
    const clickAct = (act) =>
        page.evaluate(
            (act) =>
                document
                    .querySelector("papermemory-block")
                    .shadowRoot.querySelector(`[data-act="${act}"]`)
                    .click(),
            act,
        );
    /** A real (trusted) mouse click on a block control: the clipboard needs one */
    const mouseClickAct = async (act) => {
        const el = await page.evaluateHandle(
            (act) =>
                document
                    .querySelector("papermemory-block")
                    .shadowRoot.querySelector(`[data-act="${act}"]`),
            act,
        );
        await el.click();
    };
    const visit = async () => {
        requests = [];
        await page.goto(ABS, { waitUntil: "domcontentloaded" });
        await page.waitForSelector("papermemory-block", { timeout: 30000 });
    };
    const waitStored = (stored) =>
        ext.waitForFunction(
            (id, stored) =>
                new Promise((r) =>
                    chrome.storage.local.get("papers", ({ papers }) =>
                        r(!!papers?.[id] === stored),
                    ),
                ),
            { timeout: 30000, polling: 200 },
            ID,
            stored,
        );

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless, "1200,900");
        const id = await findExtensionId(browser);
        if (!id) throw new Error("Extension ID not found");
        ext = await browser.newPage();
        await ext.goto(`chrome-extension://${id}/fullMemory.html`, {
            waitUntil: "domcontentloaded",
        });
        worker = await (
            await browser.waitForTarget((t) => t.type() === "service_worker", {
                timeout: 15000,
            })
        ).createCDPSession();
        await browser
            .defaultBrowserContext()
            .overridePermissions("https://arxiv.org", [
                "clipboard-read",
                "clipboard-write",
                "clipboard-sanitized-write",
            ]);
        page = await browser.newPage();
        page.on("request", (r) => requests.push(r.url()));
    });

    after(async function () {
        await browser?.close();
        if (downloads) fs.rmSync(downloads, { recursive: true, force: true });
    });

    it("draws the block in arXiv's column, saves with an Undo notice that removes the paper", async function () {
        await reset();
        await visit();
        await waitNotice("Saved to your Memory");
        await waitBlock("In your Memory");
        await waitStored(true);

        const text = await blockText();
        for (const label of [
            "PaperMemory",
            "PDF",
            "Download",
            "Markdown link",
            "BibTeX",
            "Show",
        ])
            expect(text).toContain(label);
        expect(text).not.toContain("Add to Memory");
        // the header has the name only; the status is the first row
        expect(await shadowText("papermemory-block", ".pmx-head")).toBe("PaperMemory");
        expect(await shadowText("papermemory-block", ".pmx-row")).toBe(
            "In your Memory",
        );
        // arXiv's columns keep their own widths, the block sits in the right column
        const layout = await page.evaluate(() => ({
            left: document.querySelector(".leftcolumn")?.getAttribute("style"),
            right: document.querySelector(".extra-services")?.getAttribute("style"),
            inColumn: !!document.querySelector(".extra-services papermemory-block"),
            bibHidden: document
                .querySelector("papermemory-block")
                .shadowRoot.querySelector("#pm-bibtex").hidden,
        }));
        expect(layout).toEqual({
            left: null,
            right: null,
            inColumn: true,
            bibHidden: true,
        });
        expect(
            requests.filter((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)),
        ).toEqual([]);

        // Undo: the paper is removed by the background, the block says "Not saved"
        await click("papermemory-notices", "Undo");
        await waitNotice("Removed from your Memory");
        await waitStored(false);
        await waitBlock("Not saved");
        expect(await blockText()).toContain("Add to Memory");
    });

    it("BibTeX: Show / Hide, Copy copies it and turns to Copied with a notice", async function () {
        await reset();
        await visit();
        await waitBlock("In your Memory");
        // processing done: the BibTeX will not be replaced by a later enrichment
        await page.waitForSelector("meta[name='pm-complete-secret-html']", {
            timeout: 30000,
        });
        await clickAct("bib-show");
        const shown = await page.evaluate(() => {
            const root = document.querySelector("papermemory-block").shadowRoot;
            return {
                hidden: root.querySelector("#pm-bibtex").hidden,
                expanded: root
                    .querySelector('[data-act="bib-show"]')
                    .getAttribute("aria-expanded"),
                bib: root.querySelector("#pm-bibtex").textContent,
            };
        });
        expect(shown.hidden).toBe(false);
        expect(shown.expanded).toBe("true");
        expect(shown.bib).toContain("Attention Is All You Need");
        await page.bringToFront();
        await seedClipboard(page);
        await mouseClickAct("bib-copy");
        await page.waitForFunction(
            () =>
                document
                    .querySelector("papermemory-block")
                    .shadowRoot.querySelector('[data-act="bib-copy"]')
                    .textContent.includes("Copied"),
            { timeout: 2000, polling: 50 },
        );
        await waitNotice("BibTeX copied", 2000);
        expect((await getClipboardText(page))?.trim()).toBe(shown.bib.trim());
        await clickAct("bib-show");
        expect(
            await page.evaluate(
                () =>
                    document
                        .querySelector("papermemory-block")
                        .shadowRoot.querySelector("#pm-bibtex").hidden,
            ),
        ).toBe(true);
    });

    it("hides the rows whose preference is off", async function () {
        await reset({ checkMd: false, checkBib: false, checkDownload: false });
        await visit();
        await waitBlock("In your Memory");
        const text = await blockText();
        expect(text).not.toContain("Markdown link");
        expect(text).not.toContain("BibTeX");
        expect(text).not.toContain("PDF");
    });

    it("automatic recording off: Not saved, Add to Memory saves through the background", async function () {
        await reset({ checkNoAuto: true });
        await visit();
        await waitBlock("Not saved");
        expect((await storageGet("papers"))?.[ID]).toBeUndefined();
        // one status row: "Not saved" with its Add to Memory button
        expect(
            await page.evaluate(() => {
                const row = document
                    .querySelector("papermemory-block")
                    .shadowRoot.querySelector(".pmx-row");
                return [
                    row.querySelector(".pmx-label").textContent,
                    !!row.querySelector('[data-act="add"]'),
                ];
            }),
        ).toEqual(["Not saved", true]);
        await clickAct("add");
        await waitStored(true);
        await waitBlock("In your Memory");
        expect(await blockText()).not.toContain("Add to Memory");
    });

    it("Code link: http(s) only, new tab, full URL in our tooltip", async function () {
        await reset();
        await visit();
        await waitStored(true);
        const papers = await storageGet("papers");
        const setCode = (codeLink) =>
            storageSet({ papers: { ...papers, [ID]: { ...papers[ID], codeLink } } });

        await setCode("https://github.com/tensorflow/tensor2tensor");
        await visit();
        await waitBlock("Code");
        const link = await page.evaluate(() => {
            const a = document
                .querySelector("papermemory-block")
                .shadowRoot.querySelector('a[data-act="code"]');
            return {
                href: a.href,
                target: a.target,
                rel: a.rel,
                tip: a.dataset.tip,
                title: a.getAttribute("title"),
                text: a.textContent,
            };
        });
        expect(link).toEqual({
            href: "https://github.com/tensorflow/tensor2tensor",
            target: "_blank",
            rel: "noopener",
            tip: "https://github.com/tensorflow/tensor2tensor",
            title: null,
            text: "github.com/tensorflow/tensor2tensor (opens in new tab)",
        });

        await setCode("javascript:alert(1)");
        await visit();
        await waitBlock("In your Memory");
        expect(await blockText()).not.toContain("Code");
    });

    it("a failed metadata-only read (recording off) ends the loading notice", async function () {
        await reset({ checkNoAuto: true });
        await worker.send("Fetch.enable", {
            patterns: [{ urlPattern: "*export.arxiv.org*" }],
        });
        const fail = ({ requestId }) =>
            worker
                .send("Fetch.failRequest", { requestId, errorReason: "Failed" })
                .catch(() => {});
        worker.on("Fetch.requestPaused", fail);
        try {
            await visit();
            await waitBlock("Not saved");
            await page.waitForFunction(
                () =>
                    !document
                        .querySelector("papermemory-notices")
                        ?.shadowRoot?.querySelector(".pm-toast"),
                { timeout: 10000, polling: 100 },
            );
        } finally {
            worker.off("Fetch.requestPaused", fail);
            await worker.send("Fetch.disable");
        }
    });

    it("a failed read shows Couldn’t save this paper; Try again reads it again", async function () {
        await reset();
        // the background's arXiv API requests fail
        await worker.send("Fetch.enable", {
            patterns: [{ urlPattern: "*export.arxiv.org*" }],
        });
        const fail = ({ requestId }) =>
            worker
                .send("Fetch.failRequest", { requestId, errorReason: "Failed" })
                .catch(() => {});
        worker.on("Fetch.requestPaused", fail);
        try {
            await visit();
            await waitNotice("Couldn’t save this paper");
            expect(await noticeText()).toContain("The page could not be read");
            expect(
                await page.evaluate(() =>
                    document
                        .querySelector("papermemory-notices")
                        .shadowRoot.querySelector(".pm-toast")
                        .getAttribute("role"),
                ),
            ).toBe("alert");
            await waitBlock("Not saved");
        } finally {
            worker.off("Fetch.requestPaused", fail);
            await worker.send("Fetch.disable");
        }
        // Try again: the loading notice replaces the error, then the paper is saved
        const afterClick = await page.evaluate(() => {
            const root = document.querySelector("papermemory-notices").shadowRoot;
            [...root.querySelectorAll("button")]
                .find((b) => b.textContent === "Try again")
                .click();
            return root.querySelector(".pm-toast").innerText;
        });
        expect(afterClick).toContain("Reading this paper…");
        await waitStored(true);
        await waitNotice("Saved to your Memory");
        await waitBlock("In your Memory");
    });

    it("Download into PaperMemoryStore (first download), then Show in folder", async function () {
        downloads = fs.mkdtempSync(path.join(os.tmpdir(), "pm-downloads-"));
        const cdp = await browser.target().createCDPSession();
        await cdp.send("Browser.setDownloadBehavior", {
            behavior: "allow",
            downloadPath: downloads,
        });
        await reset({ checkStore: true });
        await visit();
        await waitBlock("In your Memory");
        expect(await blockText()).toContain("Download");
        // in flight: the button is disabled until the background reports the end
        expect(
            await page.evaluate(() => {
                const root = document.querySelector("papermemory-block").shadowRoot;
                root.querySelector('[data-act="download"]').click();
                return root.querySelector('[data-act="download"]').disabled;
            }),
        ).toBe(true);
        await page.waitForFunction(
            () =>
                document
                    .querySelector("papermemory-block")
                    .shadowRoot.querySelector('[data-act="show-file"]')
                    ?.textContent.includes("Show in folder"),
            { timeout: 60000, polling: 200 },
        );
        // both files of a first download are complete: the README (a data: URL in the
        // service worker) and the PDF. The test browser's download folder ignores the
        // extension's file names (PaperMemoryStore/…), so they are checked by url and type.
        const done = await ext.evaluate(
            () =>
                new Promise((r) =>
                    chrome.downloads.search({ state: "complete" }, (items) =>
                        r(
                            items.map((i) => ({
                                url: i.url,
                                mime: i.mime,
                                path: i.filename,
                            })),
                        ),
                    ),
                ),
        );
        expect(done.some((d) => d.url.startsWith("data:text/plain"))).toBe(true);
        expect(done.some((d) => d.url.startsWith("https://arxiv.org/pdf/"))).toBe(true);
        expect(done.every((d) => d.path.includes(path.basename(downloads)))).toBe(true);
    });
});

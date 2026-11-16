// The BibMatcher page (src/entrypoints/bibMatcher, src/bibMatcher/bibMatcher.js) with mocked
// answers (no live network): every web request (the page's and the background's: Google
// Scholar) gets the test's answer, else the recorded one (test/data/preprint-matching.json),
// else an empty 200 answer for its source.
// Checks: preprint detection (arXiv, bioRxiv, medRxiv, ChemRxiv; others Unchanged), a preprint
// never matched to itself, accept / reject / undo and Accept all / Reject all changing the
// output, "Updated entries only", the warning dialog on Copy / Download with changes not
// reviewed, Stop → Not checked, the parse error message, file upload and drop, ⌘↵ / Ctrl+↵.
import { expect } from "expect";
import fs from "fs";
import os from "os";
import path from "path";
import { findExtensionId, makeBrowser } from "./browser.js";
import { loadConfig, root, readJSON, indent } from "./utilsForTests.js";

const { headless } = loadConfig();
const recorded = readJSON(`${root}/test/data/preprint-matching.json`).responses;

/** An empty answer per source: no match, status 200 */
const EMPTY = {
    "sparql.dblp.org": { results: { bindings: [] } },
    "api.semanticscholar.org": { data: [] },
    "api.crossref.org": { status: "ok", message: { items: [] } },
    "api.openalex.org": { results: [] },
    "scholar.google.com": "",
};

/** OpenAlex's search for a title: the title searched */
const openAlexTitle = (url) =>
    decodeURIComponent(new URL(url).searchParams.get("filter") ?? "").replace(
        /^title\.search:/,
        "",
    );

/** An OpenAlex answer: a journal article with this title */
const journalWork = (title, journal = "Journal of Tests") => ({
    results: [
        {
            id: "https://openalex.org/W1",
            doi: "https://doi.org/10.1234/tests.1",
            display_name: title,
            publication_year: 2020,
            type: "article",
            primary_location: { source: { display_name: journal, type: "journal" } },
        },
    ],
});

const HOLD = Symbol("hold");
const held = [];

/** Google Scholar's three pages (search, cite, BibTeX) for a title, its BibTeX given */
const scholar = (title, bibtex) => (u) => {
    if (u.includes("scholar.googleusercontent.com"))
        return { status: 200, body: bibtex };
    if (u.includes("output=cite"))
        return {
            status: 200,
            body: '<a class="gs_citi" href="https://scholar.googleusercontent.com/x.bib">BibTex</a>',
        };
    if (u.includes("scholar.google.com"))
        return {
            status: 200,
            body: `<div id="gs_res_ccl_mid"><h3><a id="GSID42" href="https://x.org">${title}</a></h3></div>`,
        };
    return null;
};

const arxiv = (key, title) =>
    `@article{${key},\n  title = {${title}},\n  author = {Doe, Jane},\n  journal = {arXiv preprint arXiv:1901.00001},\n  year = {2019}\n}`;

describe("BibMatcher", function () {
    let browser, page, cdp, workerCdp, url, handler, requests;

    this.timeout(60000);
    this.slow(15000);

    /** Opens the page, the 3 s wait off, the text pasted (not run) */
    const open = async (text, { wait = false } = {}) => {
        await page.goto("about:blank");
        await page.goto(url, { waitUntil: "networkidle0" });
        await page.waitForFunction(
            () => document.documentElement.dataset.bibmatcherReady === "true",
        );
        await page.$eval("#api-timeout", (el, w) => (el.checked = w), wait);
        if (text !== undefined) await paste(text);
    };
    const paste = (text) =>
        page.$eval(
            "#bib-text",
            (el, t) => {
                el.value = t;
                el.dispatchEvent(new Event("input", { bubbles: true }));
            },
            text,
        );
    const state = () => page.$eval("body", (b) => b.dataset.state);
    const waitState = (...states) =>
        page
            .waitForFunction(
                (s) => s.includes(document.body.dataset.state),
                { timeout: 30000 },
                states,
            )
            .catch(async (e) => {
                console.log(await page.$eval("body", (b) => b.innerText));
                throw e;
            });
    /** [key, status badge, decision] per row */
    const rows = () =>
        page.$$eval("#b-rows .b-item", (items) =>
            items.map((it) => ({
                key: it.querySelector(".b-key").textContent,
                status: it.querySelector(".b-status").textContent.trim(),
                why: it.querySelector(".b-why")?.textContent ?? "",
                state: it.querySelector(".b-state")?.textContent.trim() ?? "",
                hidden: it.hidden,
            })),
        );
    const output = () => page.$eval("#match-results", (el) => el.textContent);
    const act = (key, action) =>
        page.evaluate(
            (k, a) =>
                [...document.querySelectorAll("#b-rows .b-item")]
                    .find((it) => it.querySelector(".b-key").textContent === k)
                    .querySelector(`.b-row [data-act="${a}"]`)
                    .click(),
            key,
            action,
        );
    const count = (filter) =>
        page.$eval(`#b-filters [data-count="${filter}"]`, (el) =>
            Number(el.textContent),
        );

    before(async function () {
        console.log(indent(1) + "Creating browser with PaperMemory extension");
        browser = await makeBrowser(headless);
        page = (await browser.pages())[0];
        const id = await findExtensionId(browser);
        if (!id) throw new Error("Extension ID not found");
        url = `chrome-extension://${id}/bibMatcher.html`;
        // the page's requests, and the background's (Google Scholar)
        const worker = await browser.waitForTarget(
            (t) => t.type() === "service_worker",
        );
        workerCdp = await worker.createCDPSession();
        cdp = await browser.target().createCDPSession();
        for (const session of [cdp, workerCdp]) await intercept(session);
    });
    /** Every https request of this session gets the mocked answer */
    const intercept = async (session) => {
        await session.send("Fetch.enable", { patterns: [{ urlPattern: "https://*" }] });
        session.on("Fetch.requestPaused", (e) => {
            const reqUrl = e.request.url;
            requests.push(reqUrl);
            const host = new URL(reqUrl).host;
            const answer = handler?.(reqUrl) ??
                recorded[reqUrl] ?? { status: 200, body: EMPTY[host] ?? "" };
            // HOLD: no answer until the test releases it (a stalled request)
            if (answer === HOLD) {
                held.push(() =>
                    session
                        .send("Fetch.fulfillRequest", {
                            requestId: e.requestId,
                            responseCode: 404,
                            body: "",
                        })
                        .catch(() => {}),
                );
                return;
            }
            const body =
                typeof answer.body === "string"
                    ? answer.body
                    : JSON.stringify(answer.body);
            session
                .send("Fetch.fulfillRequest", {
                    requestId: e.requestId,
                    responseCode: answer.status ?? 200,
                    responseHeaders: [
                        { name: "content-type", value: "application/json" },
                        { name: "access-control-allow-origin", value: "*" },
                    ],
                    body: Buffer.from(body).toString("base64"),
                })
                .catch(() => {});
        });
    };
    beforeEach(() => {
        handler = null;
        requests = [];
    });
    afterEach(() => held.splice(0).forEach((release) => release()));
    after(async function () {
        for (const session of [cdp, workerCdp])
            await session?.send("Fetch.disable").catch(() => {});
        await browser?.close();
    });

    it("has the shared top bar and no remote stylesheet or script", async function () {
        await open();
        expect(
            await page.$eval(
                '#pm-topbar [data-page="bibMatcher"]',
                (a) => a.ariaCurrent,
            ),
        ).toBe("page");
        const remote = await page.$$eval("link[href], script[src]", (els) =>
            els
                .map((e) => e.href || e.src)
                .filter((u) => !u.startsWith("chrome-extension://")),
        );
        expect(remote).toEqual([]);
        expect(await page.$eval("#match-bib", (b) => b.disabled)).toBe(true);
    });

    it("uses the OpenAlex match's BibTeX (Cell 2019), key kept, once accepted", async function () {
        await open(
            "@article{stuart2018, title={Comprehensive integration of single cell data}, author={Stuart, Tim}, journal={arXiv preprint}, year={2018}}",
        );
        await page.click("#match-bib");
        await waitState("done");
        expect((await rows())[0]).toMatchObject({
            key: "stuart2018",
            status: "Matched",
        });
        // not accepted yet: the entry stays as in the file
        expect(await output()).toMatch(/arXiv preprint/);
        await act("stuart2018", "accept");
        const bib = await output();
        expect(bib).toMatch(/@article\{stuart2018,/);
        expect(bib).toMatch(/journal\s*=\s*\{Cell\}/);
        expect(bib).toMatch(/year\s*=\s*\{2019\}/);
        expect(bib).toMatch(/doi\s*=\s*\{10\.1016\/j\.cell\.2019\.05\.031\}/);
        expect(bib).not.toMatch(/arXiv/);
        // the diff: real line counts, key kept
        await act("stuart2018", "toggle");
        const foot = await page.$eval(".b-difffoot span", (s) => s.textContent);
        const del = await page.$$eval(".b-diff .is-del", (d) => d.length);
        const add = await page.$$eval(".b-diff .is-add", (d) => d.length);
        expect(del).toBeGreaterThan(0);
        expect(foot).toBe(
            `Citation key kept. ${del} line${del === 1 ? "" : "s"} removed, ${add} added.`,
        );
    });

    it("looks up arXiv, bioRxiv, medRxiv and ChemRxiv entries; others stay Unchanged", async function () {
        await open(
            [
                arxiv("a2019", "An arXiv paper"),
                "@article{b2020, title={A bioRxiv paper}, journal={bioRxiv}, year={2020}}",
                "@article{m2020, title={A medRxiv paper}, publisher={Cold Spring Harbor}, journal={medRxiv}, year={2020}}",
                "@article{c2021, title={A ChemRxiv paper}, journal={ChemRxiv}, year={2021}}",
                "@article{n2021, title={A Nature paper}, journal={Nature}, year={2021}}",
            ].join("\n\n"),
        );
        await page.waitForFunction(() =>
            document
                .getElementById("b-filecount")
                .textContent.includes("5 entries, 4 preprints"),
        );
        // ⌘↵ / Ctrl+↵ from outside any field
        await page.evaluate(() => document.activeElement.blur());
        await page.keyboard.down("Control");
        await page.keyboard.press("Enter");
        await page.keyboard.up("Control");
        await waitState("done");
        expect((await rows()).map((r) => [r.key, r.status])).toEqual([
            ["a2019", "Not found"],
            ["b2020", "Not found"],
            ["m2020", "Not found"],
            ["c2021", "Not found"],
            ["n2021", "Unchanged"],
        ]);
        expect((await rows())[4].why).toBe("Not a preprint: already Nature 2021.");
        // every preprint was looked up (Semantic Scholar, Google Scholar, CrossRef and
        // OpenAlex search the title), the Nature paper never
        const hosts = [
            "api.semanticscholar.org",
            "scholar.google.com",
            "api.crossref.org",
            "api.openalex.org",
        ];
        for (const title of [
            "An arXiv paper",
            "A bioRxiv paper",
            "A medRxiv paper",
            "A ChemRxiv paper",
        ]) {
            const searched = requests
                .filter((u) => decodeURIComponent(u).includes(title))
                .map((u) => new URL(u).host);
            for (const host of hosts) expect(searched).toContain(host);
        }
        expect(requests.filter((u) => u.includes("sparql.dblp.org"))).toHaveLength(4);
        expect(
            requests.some((u) => decodeURIComponent(u).includes("A Nature paper")),
        ).toBe(false);
        expect(await page.$eval("#b-done-text", (e) => e.textContent)).toBe(
            "0 of 4 preprints have a published version.",
        );
    });

    it("never takes a preprint's own record as its published version", async function () {
        const title = "Language models of protein sequences at the scale of evolution";
        const doi = "10.1101/2022.07.20.500902";
        handler = (u) => {
            if (u.includes("api.crossref.org"))
                return {
                    status: 200,
                    body: {
                        status: "ok",
                        message: {
                            items: [
                                {
                                    title: [title],
                                    type: "posted-content",
                                    DOI: doi,
                                    event: {
                                        name: "Some Event",
                                        start: { "date-parts": [[2022]] },
                                    },
                                    issued: { "date-parts": [[2022]] },
                                },
                            ],
                        },
                    },
                };
            if (u.includes("api.openalex.org"))
                return {
                    status: 200,
                    body: {
                        results: [
                            {
                                id: "https://openalex.org/W2",
                                doi: `https://doi.org/${doi}`,
                                display_name: title,
                                publication_year: 2022,
                                type: "article",
                                primary_location: {
                                    source: {
                                        display_name: "A Journal",
                                        type: "journal",
                                    },
                                },
                            },
                        ],
                    },
                };
            if (u.includes("api.semanticscholar.org"))
                return {
                    status: 200,
                    body: {
                        data: [{ title, venue: "bioRxiv", year: 2022, authors: [] }],
                    },
                };
        };
        await open(
            `@article{lin2022language, title={${title}}, journal={bioRxiv}, year={2022}, doi={${doi}}}`,
        );
        await page.click("#match-bib");
        await waitState("done");
        expect((await rows())[0]).toMatchObject({
            key: "lin2022language",
            status: "Not found",
            why: "No published version found.",
        });
    });

    describe("Review and output", function () {
        const keys = ["alpha2019", "beta2019", "gamma2019"];
        const titles = ["Alpha results", "Beta results", "Gamma results"];
        beforeEach(async function () {
            handler = (u) =>
                u.includes("api.openalex.org")
                    ? { status: 200, body: journalWork(openAlexTitle(u)) }
                    : null;
            await open(
                keys.map((k, i) => arxiv(k, titles[i])).join("\n\n") +
                    "\n\n@article{n2021, title={A Nature paper}, journal={Nature}, year={2021}}",
            );
            await page.click("#match-bib");
            await waitState("done");
        });

        it("applies only accepted changes; reject, undo, Accept all / Reject all", async function () {
            expect(await count("review")).toBe(3);
            expect((await output()).match(/Journal of Tests/g)).toBeNull();
            await act("alpha2019", "accept");
            await act("beta2019", "reject");
            expect((await rows()).map((r) => r.state)).toEqual([
                "Accepted",
                "Rejected",
                "",
                "",
            ]);
            let out = await output();
            expect(out.match(/Journal of Tests/g)).toHaveLength(1);
            expect(out).toMatch(/@article\{alpha2019,\s*title\s*=\s*\{Alpha results\}/);
            // Undo: back to pending, out of the output
            await act("alpha2019", "undo");
            expect(await count("review")).toBe(2);
            expect((await output()).match(/Journal of Tests/g)).toBeNull();
            // Accept all pending: alpha and gamma, beta stays rejected
            await page.click("#b-accept-all");
            expect((await rows()).map((r) => r.state)).toEqual([
                "Accepted",
                "Rejected",
                "Accepted",
                "",
            ]);
            expect(await page.$eval("#b-reject-all", (b) => b.disabled)).toBe(true);
            out = await output();
            expect(out.match(/Journal of Tests/g)).toHaveLength(2);
            expect(out).toMatch(/@article\{beta2019,[\s\S]*arXiv preprint/);
            expect(await page.$eval("#b-foot-title", (e) => e.textContent)).toBe(
                "Your new bibliography: 4 entries, 2 updated",
            );
            // Reject all pending, after an undo
            await act("gamma2019", "undo");
            await page.click("#b-reject-all");
            expect((await rows()).map((r) => r.state)).toEqual([
                "Accepted",
                "Rejected",
                "Rejected",
                "",
            ]);
            // Updated entries only
            await page.click('#b-scope [data-scope="updated"]');
            out = await output();
            expect(out.match(/^@/gm)).toHaveLength(1);
            expect(out).toMatch(/^@article\{alpha2019,/);
            // filters
            await page.click('#b-filters [data-filter="matched"]');
            expect((await rows()).filter((r) => !r.hidden).map((r) => r.key)).toEqual(
                keys,
            );
        });

        it("asks before Copy / Download with changes not reviewed yet", async function () {
            await page.evaluate(() => {
                window.__copied = [];
                window.__downloads = [];
                navigator.clipboard.writeText = async (t) => window.__copied.push(t);
                HTMLAnchorElement.prototype.click = function () {
                    if (this.download)
                        window.__downloads.push({
                            name: this.download,
                            href: this.href,
                        });
                };
            });
            await act("alpha2019", "accept");
            // Copy → dialog → Review them: nothing copied, the To review filter is on
            await page.click("#copy-results");
            await page.waitForSelector("#o-dialog[open]");
            expect(await page.$eval("#o-dialog-title", (e) => e.textContent)).toBe(
                "2 changes are not reviewed yet",
            );
            expect(await page.$eval("#o-dialog-body", (e) => e.textContent)).toBe(
                "They will stay as in your file.",
            );
            const labels = await page.$$eval("#o-dialog-foot button", (bs) =>
                bs.map((b) => b.textContent),
            );
            expect(labels).toEqual(["Review them", "Copy anyway"]);
            await page.click('#o-dialog-foot button[value=""]');
            // (the dialog's close event comes after it closes)
            await page.waitForFunction(
                () =>
                    document
                        .querySelector('#b-filters [data-filter="review"]')
                        .getAttribute("aria-pressed") === "true",
            );
            expect(await page.evaluate(() => window.__copied.length)).toBe(0);
            expect((await rows()).filter((r) => !r.hidden).map((r) => r.key)).toEqual([
                "beta2019",
                "gamma2019",
            ]);
            // Copy anyway
            await page.click("#copy-results");
            await page.waitForSelector("#o-dialog[open]");
            await page.click('#o-dialog-foot button[value="ok"]');
            await page.waitForFunction(() => window.__copied.length === 1);
            const copied = await page.evaluate(() => window.__copied[0]);
            expect(copied.match(/Journal of Tests/g)).toHaveLength(1);
            // Download anyway: the same text, as a .bib
            await page.click("#download-results");
            await page.waitForSelector("#o-dialog[open]");
            expect(
                await page.$eval(
                    '#o-dialog-foot button[value="ok"]',
                    (b) => b.textContent,
                ),
            ).toBe("Download anyway");
            await page.click('#o-dialog-foot button[value="ok"]');
            await page.waitForFunction(() => window.__downloads.length === 1);
            const { name, text } = await page.evaluate(async () => ({
                name: window.__downloads[0].name,
                text: await (await fetch(window.__downloads[0].href)).text(),
            }));
            expect(name).toBe("bibliography-matched.bib");
            expect(text).toBe(copied);
            // everything reviewed: no dialog
            await page.click('#b-filters [data-filter="all"]');
            await page.click("#b-reject-all");
            await page.click("#copy-results");
            await page.waitForFunction(() => window.__copied.length === 2);
            expect(await page.$eval("#o-dialog", (d) => d.open)).toBe(false);
        });
    });

    it("Stop: the preprints left get Not checked", async function () {
        await open(
            [1, 2, 3].map((i) => arxiv(`p${i}`, `Paper number ${i}`)).join("\n\n"),
            {
                wait: true,
            },
        );
        await page.click("#match-bib");
        // during the 3 s wait after the first entry
        await page.waitForFunction(
            () =>
                document.getElementById("b-now-source").textContent ===
                "Waiting 3 seconds…",
            { timeout: 30000 },
        );
        expect(await page.$eval("#b-progress-count", (e) => e.textContent)).toBe(
            "1 / 3 preprints",
        );
        await page.click("#match-bib-stop");
        await waitState("stopped");
        expect((await rows()).map((r) => r.status)).toEqual([
            "Not found",
            "Not checked",
            "Not checked",
        ]);
        expect(await page.$eval("#b-done-more", (e) => e.textContent)).toBe(
            "2 preprints were not checked.",
        );
        expect(await page.$eval("#match-bib-label", (e) => e.textContent)).toBe(
            "Match again",
        );
    });

    it("a file with no preprint: Nothing to match", async function () {
        await open(
            "@article{n2021, title={A Nature paper}, journal={Nature}, year={2021}}",
        );
        await page.click("#match-bib");
        await waitState("none");
        expect(await page.$eval("#b-done-text", (e) => e.textContent)).toBe(
            "No preprints found in 1 entry.",
        );
        expect(await page.$eval(".b-when-results", (e) => e.offsetHeight)).toBe(0);
    });

    it("explains a parse error under the field", async function () {
        await open(
            "@article{a2017, title={Attention}, year={2017\n\n@article{b2018, title={B}}",
        );
        await page.click("#match-bib");
        await page.waitForSelector("#b-error:not([hidden])");
        const message = await page.$eval("#b-error-text", (e) => e.textContent);
        expect(message).toMatch(
            /^This BibTeX could not be read: .+\. Fix the entry and try again\.$/,
        );
        expect(message).not.toMatch(/value_braces|match ->/);
        expect(
            await page.$eval("#bib-text", (t) => t.classList.contains("is-invalid")),
        ).toBe(true);
        expect(await state()).toBe("input");
    });

    it("reads a chosen or dropped .bib file", async function () {
        await open();
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-bib-"));
        const file = path.join(dir, "thesis-refs.bib");
        const bib = `${arxiv("a2019", "An arXiv paper")}\n\n@article{n2021, title={A Nature paper}, journal={Nature}, year={2021}}\n`;
        fs.writeFileSync(file, bib);
        try {
            const [chooser] = await Promise.all([
                page.waitForFileChooser(),
                page.click("#b-choose"),
            ]);
            await chooser.accept([file]);
            await page.waitForFunction(
                () => document.getElementById("b-filecount").textContent !== "",
            );
            expect(await page.$eval("#bib-text", (t) => t.value)).toBe(bib);
            expect(await page.$eval("#b-filechip", (e) => e.textContent)).toBe(
                "thesis-refs.bib · 2 entries, 1 preprint",
            );
            expect(await page.$eval("#match-bib", (b) => b.disabled)).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        // dropped anywhere on the page
        await page.evaluate(() => {
            const dt = new DataTransfer();
            dt.items.add(new File(["@misc{x, title={Dropped}}"], "dropped.bib"));
            document.body.dispatchEvent(
                new DragEvent("drop", {
                    dataTransfer: dt,
                    bubbles: true,
                    cancelable: true,
                }),
            );
        });
        await page.waitForFunction(() =>
            document
                .getElementById("b-filechip")
                .textContent.startsWith("dropped.bib · 1 entry"),
        );
        expect(await page.$eval("#bib-text", (t) => t.value)).toBe(
            "@misc{x, title={Dropped}}",
        );
        // Clear
        await page.click("#b-clear");
        expect(await page.$eval("#bib-text", (t) => t.value)).toBe("");
        expect(await page.$eval("#b-filechip", (e) => e.hidden)).toBe(true);
    });

    describe("Fix round", function () {
        it("leaves the text byte for byte, comments and @string included, until a change is accepted", async function () {
            handler = (u) =>
                u.includes("api.openalex.org")
                    ? { status: 200, body: journalWork(openAlexTitle(u)) }
                    : null;
            const head =
                '@preamble{"\\newcommand{\\noop}[1]{}"}\n% my comment\n@string{jmlr = {Journal of Machine Learning Research}}\n\n';
            const nasa =
                "@article{nasa2019,\n    title={{NASA results}},\n    journal=jmlr, pages={1--9},\n    year={2019}\n}\n";
            const alpha = arxiv("alpha2019", "Alpha results");
            const tail = "\n@comment{kept}\n% last line, no newline";
            const text = head + nasa + "\n" + alpha + tail;
            await open(text);
            await page.click("#match-bib");
            await waitState("done");
            expect((await rows()).map((r) => [r.key, r.status])).toEqual([
                ["nasa2019", "Unchanged"],
                ["alpha2019", "Matched"],
            ]);
            expect(await output()).toBe(text);
            await act("alpha2019", "accept");
            const out = await output();
            expect(out.startsWith(head + nasa + "\n@article{alpha2019,")).toBe(true);
            expect(out.endsWith("}" + tail)).toBe(true);
            expect(out).toMatch(/Journal of Tests/);
            expect(out).not.toMatch(/arXiv preprint/);
            // Updated entries only: the accepted entry's new text
            await page.click('#b-scope [data-scope="updated"]');
            expect((await output()).trim()).toMatch(/^@article\{alpha2019,[^@]*\}$/);
            expect(await page.$eval("#b-foot-title", (e) => e.textContent)).toBe(
                "Your new bibliography: 1 entry, 1 updated",
            );
        });

        it("finds DOI-only bioRxiv entries; a real venue wins; the key and field names are not read", async function () {
            await open(
                [
                    "@article{doionly, title={Only a DOI}, doi={10.1101/2022.07.20.500902}}",
                    "@inproceedings{venue2017, title={A NeurIPS paper}, booktitle={NeurIPS}, eprint={1706.03762}, archivePrefix={arXiv}, url={https://arxiv.org/abs/1706.03762}}",
                    "@misc{rxivfan2020, title={Nothing preprint here}}",
                    "@article{corr2017, title={A CoRR paper}, journal={CoRR}, volume={abs/1706.03762}}",
                ].join("\n"),
            );
            await page.click("#match-bib");
            await waitState("done");
            expect((await rows()).map((r) => [r.key, r.status])).toEqual([
                ["doionly", "Not found"],
                ["venue2017", "Unchanged"],
                ["rxivfan2020", "Unchanged"],
                ["corr2017", "Not found"],
            ]);
        });

        it("Google Scholar: never a preprint record, and left out after an error status", async function () {
            const title =
                "Language models of protein sequences at the scale of evolution";
            handler = scholar(
                title,
                `@article{lin2022, title={${title}}, journal={bioRxiv (Cold Spring Harbor Laboratory)}, year={2022}, doi={10.1101/2022.07.20.500902}}`,
            );
            await open(
                `@article{lin2022, title={${title}}, journal={bioRxiv}, year={2022}}`,
            );
            await page.click("#match-bib");
            await waitState("done");
            expect(
                requests.some((u) => u.includes("scholar.googleusercontent.com")),
            ).toBe(true);
            expect((await rows())[0].status).toBe("Not found");

            // a 429: Scholar is left out, the next entries never ask it
            handler = (u) =>
                u.includes("scholar.google.com") ? { status: 429, body: "" } : null;
            requests = [];
            await open(
                [1, 2, 3].map((i) => arxiv(`s${i}`, `Scholar paper ${i}`)).join("\n"),
            );
            await page.click("#match-bib");
            await waitState("done");
            expect(
                requests.filter((u) => u.includes("scholar.google.com")),
            ).toHaveLength(1);
            expect(await page.$eval("#b-warnings", (e) => e.textContent)).toMatch(
                /^Google Scholar was left out after the 1st entry: it answered with status 429 \(too many requests\)\./,
            );
        });

        it("Stop does not wait for a stalled request", async function () {
            handler = (u) => (u.includes("scholar.google.com") ? HOLD : null);
            await open([1, 2].map((i) => arxiv(`h${i}`, `Held paper ${i}`)).join("\n"));
            await page.click("#match-bib");
            await page.waitForFunction(
                () =>
                    document.getElementById("b-now-source").textContent ===
                    "Looking on Google Scholar…",
            );
            await page.click("#match-bib-stop");
            await waitState("stopped");
            expect((await rows()).map((r) => r.status)).toEqual([
                "Not checked",
                "Not checked",
            ]);
            // the late answer changes nothing
            held.splice(0).forEach((release) => release());
            await new Promise((r) => setTimeout(r, 500));
            expect(await state()).toBe("stopped");
        });

        it("a % comment on the last line (no newline) neither hangs nor breaks the count", async function () {
            await open("@article{x, title={X}, journal={arXiv}}% comment");
            await page.waitForFunction(
                () =>
                    document.getElementById("b-filecount").textContent ===
                    " · 1 entry, 1 preprint",
                { timeout: 5000 },
            );
            await page.click("#match-bib");
            await waitState("done");
            expect(await output()).toBe(
                "@article{x, title={X}, journal={arXiv}}% comment",
            );
        });

        it("files: over 5 MB refused, a stale read never overwrites Clear", async function () {
            await open();
            await page.evaluate(() => {
                const dt = new DataTransfer();
                dt.items.add(
                    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.bib"),
                );
                document.body.dispatchEvent(
                    new DragEvent("drop", {
                        dataTransfer: dt,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            await page.waitForSelector("#b-error:not([hidden])");
            expect(await page.$eval("#b-error-text", (e) => e.textContent)).toBe(
                "big.bib is too large: BibMatcher reads files up to 5 MB.",
            );
            expect(await page.$eval("#bib-text", (t) => t.value)).toBe("");
            // a slow read, then Clear: the file never lands
            await paste("@misc{typed, title={Typed}}");
            await page.evaluate(() => {
                File.prototype.text = () =>
                    new Promise((r) =>
                        setTimeout(() => r("@misc{late, title={Late}}"), 500),
                    );
                const dt = new DataTransfer();
                dt.items.add(new File(["x"], "slow.bib"));
                document.body.dispatchEvent(
                    new DragEvent("drop", {
                        dataTransfer: dt,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            });
            await page.click("#b-clear");
            await new Promise((r) => setTimeout(r, 800));
            expect(await page.$eval("#bib-text", (t) => t.value)).toBe("");
        });

        it("To review: deciding moves the focus to the next row, then to the filter tabs; the copy button says what it copies", async function () {
            handler = (u) =>
                u.includes("api.openalex.org")
                    ? { status: 200, body: journalWork(openAlexTitle(u)) }
                    : null;
            await open(["r1", "r2"].map((k) => arxiv(k, `Review ${k}`)).join("\n"));
            await page.click("#match-bib");
            await waitState("done");
            await act("r1", "toggle");
            expect(
                await page.$eval('#b-rows [data-act="copy"]', (b) =>
                    b.textContent.trim(),
                ),
            ).toBe("Copy published entry");
            await page.click('#b-filters [data-filter="review"]');
            await act("r1", "accept");
            const focused = () =>
                page.evaluate(() => ({
                    act: document.activeElement.dataset.act ?? null,
                    key:
                        document.activeElement
                            .closest(".b-item")
                            ?.querySelector(".b-key").textContent ?? null,
                    filter: document.activeElement.dataset.filter ?? null,
                }));
            expect(await focused()).toEqual({ act: "accept", key: "r2", filter: null });
            await act("r2", "reject");
            expect(await focused()).toEqual({ act: null, key: null, filter: "review" });
        });

        it("@string macros: expanded for matching and kept in an accepted entry", async function () {
            handler = (u) =>
                u.includes("api.openalex.org")
                    ? { status: 200, body: journalWork(openAlexTitle(u)) }
                    : null;
            const strings = "@string{team = {Jane Doe and John Doe}}\n";
            await open(
                strings +
                    "@article{t2019, title={Team results}, author=team, journal={arXiv preprint}, year={2019}}\n",
            );
            await page.click("#match-bib");
            await waitState("done");
            await act("t2019", "accept");
            const out = await output();
            expect(out.startsWith(strings)).toBe(true);
            expect(out).toMatch(/author\s*=\s*\{Jane Doe and John Doe\}/);
            expect(out).not.toMatch(/\{team\}/);
        });

        it("braces in % comments between fields do not count", async function () {
            handler = (u) =>
                u.includes("api.openalex.org")
                    ? { status: 200, body: journalWork(openAlexTitle(u)) }
                    : null;
            const other =
                "@article{d2019,\n  title={Other}, % { comment\n  journal={Nature}\n}\n";
            await open(
                "@article{c2019,\n  title={Comment results}, % } comment\n  journal={arXiv preprint},\n  year={2019}\n}\n" +
                    other,
            );
            await page.click("#match-bib");
            await waitState("done");
            expect((await rows()).map((r) => [r.key, r.status])).toEqual([
                ["c2019", "Matched"],
                ["d2019", "Unchanged"],
            ]);
            await act("c2019", "accept");
            const out = await output();
            expect(out).toMatch(
                /^@article\{c2019,[^@]*Journal of Tests[^@]*\}\n@article\{d2019/,
            );
            expect(out.endsWith(other)).toBe(true);
        });

        it("a CRLF file comes out byte for byte (Download), until the field is edited", async function () {
            const crlf =
                "@article{crlf2019,\r\n  title = {CRLF results},\r\n  journal = {arXiv preprint},\r\n  year = {2019}\r\n}\r\n\r\n% note\r\n";
            await open();
            await page.evaluate((text) => {
                window.__downloads = [];
                HTMLAnchorElement.prototype.click = function () {
                    if (this.download) window.__downloads.push(this.href);
                };
                const dt = new DataTransfer();
                dt.items.add(new File([text], "crlf.bib"));
                document.body.dispatchEvent(
                    new DragEvent("drop", {
                        dataTransfer: dt,
                        bubbles: true,
                        cancelable: true,
                    }),
                );
            }, crlf);
            await page.waitForFunction(
                () => document.getElementById("b-filecount").textContent !== "",
            );
            await page.click("#match-bib");
            await waitState("done");
            await page.click("#download-results");
            await page.waitForFunction(() => window.__downloads.length === 1);
            const downloaded = await page.evaluate(
                async () => await (await fetch(window.__downloads[0])).text(),
            );
            expect(downloaded).toBe(crlf);
            // edited: the field's text is matched now
            await page.$eval("#bib-text", (el) => {
                el.value += " ";
                el.dispatchEvent(new Event("input", { bubbles: true }));
            });
            await page.click("#match-bib");
            await waitState("done");
            expect(await output()).not.toMatch(/\r/);
        });
    });
});

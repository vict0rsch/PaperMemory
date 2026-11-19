import { expect } from "expect";
import { JSDOM } from "jsdom";
import { getSource, unwrapUrl } from "@pmu/sources/index.js";
import { ingest } from "@pm/background/agentIngest.js";

import { loadPaperMemoryUtils, range, readJSON } from "./utilsForTests.js";

await loadPaperMemoryUtils();
// create fake `document`, parseUrl() will need it for instance
global.document = new JSDOM(`<!DOCTYPE html>`).window.document;
// initState() (which loads the Cell journal data) does not run in unit tests,
// so populate it directly from the same source the extension fetches at runtime.
PMUtils.config.state.cellJournalData = readJSON("./public/data/cell.json");

describe("Bibtex parser", function () {
    var bdata = readJSON("./test/data/bibtexs.json");

    it("Test data is balanced", function () {
        expect(bdata.strings.length).toEqual(bdata.objects.length);
    });

    describe("#bibtexToObject", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(PMUtils.bibtexParser.bibtexToObject(bdata.strings[i])).toEqual(
                    bdata.objects[i],
                );
            });
        }
    });

    describe("#bibtexToString(object)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(PMUtils.bibtexParser.bibtexToString(bdata.objects[i])).toEqual(
                    bdata.strings[i],
                );
            });
        }
    });
    describe("#bibtexToString(string)", function () {
        for (const i of range(bdata.strings.length)) {
            it(`Pair ${i}`, function () {
                expect(
                    PMUtils.bibtexParser.bibtexToString(
                        PMUtils.bibtexParser.bibtexToString(bdata.objects[i]),
                    ),
                ).toEqual(bdata.strings[i]);
            });
        }
    });

    describe("String -> Object -> String", function () {
        for (const [b, bstring] of bdata["strings"].entries()) {
            const bobj = PMUtils.bibtexParser.bibtexToObject(bstring);
            it(`String ${b}`, function () {
                expect(PMUtils.bibtexParser.bibtexToString(bobj)).toEqual(bstring);
            });
        }
    });

    describe("Object -> String -> Object", function () {
        for (const [b, bobj] of bdata.objects.entries()) {
            const bstring = PMUtils.bibtexParser.bibtexToString(bobj);
            it(`Object ${b}`, function () {
                expect(PMUtils.bibtexParser.bibtexToObject(bstring)).toEqual(bobj);
            });
        }
    });

    describe("#extractBibtexValue", function () {
        for (const i of range(bdata.strings.length)) {
            const bobj = bdata.objects[i];
            const bstring = bdata.strings[i];
            describe(`String ${i}`, function () {
                for (const attribute in bobj) {
                    it(`Attribute ${attribute}`, function () {
                        expect(
                            PMUtils.bibtexParser.extractBibtexValue(bstring, attribute),
                        ).toEqual(bobj[attribute]);
                    });
                }
            });
        }
    });
});

/**
 * Replace fetch with the DOI Handle API's answer, without network: `answer` is the URL the
 * DOI is registered to, null for a DOI that is not registered (404), an Error to throw (e.g.
 * offline), or a Response. Returns the calls ({url, options}) and a function restoring fetch.
 */
const stubHandleApi = (answer) => {
    const { fetch } = global;
    const calls = [];
    global.fetch = async (url, options) => {
        calls.push({ url: String(url), options });
        if (answer instanceof Error) throw answer;
        if (answer instanceof Response) return answer;
        if (answer === null) {
            const notFound = { responseCode: 100, handle: "10.1000/x" };
            return new Response(JSON.stringify(notFound), { status: 404 });
        }
        const registered = {
            responseCode: 1,
            handle: "10.1000/x",
            values: [
                { index: 1, type: "URL", data: { format: "string", value: answer } },
            ],
        };
        return new Response(JSON.stringify(registered), { status: 200 });
    };
    return { calls, restore: () => (global.fetch = fetch) };
};

describe("paper.js", () => {
    var allUrls = readJSON("./test/data/urls.json");

    describe("#paperToAbs", () => {
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, async function () {
                let paper = {
                    source,
                    pdfLink: urls[1],
                };
                let target = urls[0];
                if (source === "arxiv") {
                    paper.id = "Arxiv-1703.10593";
                }
                if (source === "springer") {
                    paper.extra = {
                        url: urls[0],
                    };
                }
                if (source === "ieee") {
                    paper.key = "9090146";
                }
                if (source === "ihep") {
                    paper.id = "IHEP-2095720";
                }
                if (source === "aip") {
                    paper.doi = "10.1063/5.0134317";
                    target = `https://doi.org/${paper.doi}`;
                }
                if (source === "oup") {
                    paper.doi = "10.1093/brain/awae043";
                    target = `https://doi.org/${paper.doi}`;
                }
                if (source === "cell") {
                    this.skip();
                }
                expect(PMUtils.paper.paperToAbs(paper)).toEqual(target);
            });
        }
    });
    describe("#paperToPDF", () => {
        for (const [i, [source, urls]] of Object.entries(allUrls).entries()) {
            it(source, () => {
                const paper = {
                    source,
                    pdfLink: urls[1],
                };
                expect(PMUtils.paper.paperToPDF(paper)).toEqual(urls[1]);
            });
        }
    });

    describe("#isPaper", () => {
        const names = ["from abstract", "from pdf"];
        for (const [source, urls] of Object.entries(allUrls)) {
            for (const [i, url] of urls.slice(0, 2).entries()) {
                it(`${source} - ${names[i]}`, async function () {
                    if (i > 0 && urls[2]?.noPdf) {
                        this.skip();
                    }
                    const isp = await PMUtils.paper.isPaper(url);
                    let target = Object.fromEntries(
                        Object.keys(isp).map((k) => [k, false]),
                    );
                    target.stored = false;
                    target[source] = true;
                    expect(isp).toEqual(target);
                });
            }
        }
        for (const [u, url] of [
            "arxiv.org",
            "https://google.com",
            "https://notarxiv.org/abs/1703.10593",
        ].entries()) {
            it(`Negative ${u} (${url})`, async () => {
                const isp = await PMUtils.paper.isPaper(url);
                let target = Object.fromEntries(
                    Object.keys(isp).map((k) => [k, false]),
                );
                target.stored = false;
                expect(isp).toEqual(target);
            });
        }
        // Another site's URL that only contains a paper URL (in its query,
        // fragment or path, or as a host prefix) is not that paper's page.
        for (const [source, urls] of Object.entries(allUrls)) {
            it(`Negative cross-host ${source}`, async () => {
                const offenders = [];
                for (const url of urls.slice(0, 2)) {
                    const { hostname } = new URL(url);
                    const bare = url.replace(/^https?:\/\//, "");
                    for (const crafted of [
                        `https://evil.example/?x=${bare}`,
                        `https://evil.example/#${url}`,
                        `https://evil.example/${bare}`,
                        url.replace(hostname, `${hostname}.evil.example`),
                    ]) {
                        const isp = await PMUtils.paper.isPaper(crafted);
                        const detected = Object.keys(isp).filter((k) => isp[k]);
                        if (detected.length) offenders.push({ crafted, detected });
                    }
                }
                expect(offenders).toEqual([]);
            });
        }
        // A URL that wraps a full (scheme included) paper URL in its path or
        // query (proxies, PDF viewers) is detected as the inner paper's source.
        for (const [source, urls] of Object.entries(allUrls)) {
            it(`Positive wrapped ${source}`, async () => {
                const offenders = [];
                for (const url of urls.slice(0, 2)) {
                    const crafted = [
                        `https://proxy.univ.edu/${url}`,
                        `chrome-extension://abcdefghijklmnop/viewer.html?file=${encodeURIComponent(url)}`,
                        `chrome-extension://abcdefghijklmnop/${url}`,
                    ];
                    // a raw url holding `&` would be split by URLSearchParams
                    if (!url.includes("&")) {
                        crafted.push(`https://login.ezproxy.univ.edu/login?url=${url}`);
                    }
                    for (const c of crafted) {
                        const isp = await PMUtils.paper.isPaper(c);
                        if (isp[source] !== true) offenders.push({ crafted: c, isp });
                    }
                }
                expect(offenders).toEqual([]);
            });
        }
    });

    describe("#sciencedirect signed PDF redirect", () => {
        // Sanitised stand-in for the pdf.sciencedirectassets.com redirect: the
        // real one carries an AWS X-Amz-Security-Token and expires in minutes, so
        // we only keep the PII-bearing parts and drop every credential param.
        const signedUrl =
            "https://pdf.sciencedirectassets.com/271664/1-s2.0-S0001457526X20048/1-s2.0-S0001457526002083/main.pdf?pii=S0001457526002083&type=client";

        it("is recognised as a sciencedirect page", async () => {
            const isp = await PMUtils.paper.isPaper(signedUrl);
            expect(isp.sciencedirect).toBe(true);
        });

        it("is not recognised inside another site's URL", async () => {
            const isp = await PMUtils.paper.isPaper(
                `https://evil.example/?x=${signedUrl.replace("https://", "")}`,
            );
            expect(isp.sciencedirect).toBe(false);
        });

        it("resolves to the abstract page from its PII", () => {
            const paper = { source: "sciencedirect", pdfLink: signedUrl };
            expect(PMUtils.paper.paperToAbs(paper)).toEqual(
                "https://www.sciencedirect.com/science/article/pii/S0001457526002083",
            );
        });
    });

    describe("#oup urlToId", () => {
        it("gives an http:// URL the same id as its https:// URL", async () => {
            // id of the paper stored from the urls.json abstract URL (path numbers)
            const id = "OUP-2024_14737437617466";
            const ctx = {
                papers: [{ source: "oup", id }],
                findPaperForProperty: PMUtils.urls.findPaperForProperty,
            };
            const url = allUrls.oup[0];
            const oup = getSource("oup");
            expect(await oup.urlToId(url, ctx)).toEqual(id);
            expect(await oup.urlToId(url.replace("https://", "http://"), ctx)).toEqual(
                id,
            );
        });
    });

    describe("#addOrUpdatePaper", () => {
        // ACS Silverchair article url: AcsSource.urlToId reads no DOI from it
        const url = "https://pubs.acs.org/jpca/article/123/12/2345/123456/Some-Title";
        const id = "ACS_101021acsjpca9b00311";
        const acs = getSource("acs");
        const parse = acs.parse;
        // PaperMemory logs through these (mocha keeps its own console.log)
        const { log, groupCollapsed, groupEnd } = console;
        // in-memory chrome.storage.local
        let storage = {};
        // runs before each storage read: lets a test write as another page would
        let beforeGet = () => {};
        // the paper stored by an earlier capture, with user fields: its title hashes
        // differently from the re-parsed one (see acs.parse below)
        const stored = {
            id,
            source: "acs",
            title: "CO<sub>2</sub> reduction",
            author: "Jane Doe",
            year: "2019",
            venue: "The Journal of Physical Chemistry A",
            key: "doe2019co",
            note: "my note",
            tags: ["mytag"],
            favorite: true,
            addDate: "2020-01-01T00:00:00.000Z",
            lastOpenDate: "2020-01-02T00:00:00.000Z",
            count: 5,
        };

        // the Agent access fields of an agent's add_paper in a Project
        const agentFields = {
            tags: ["review", "proj-demo"],
            provenance: {
                clientId: "client-1",
                clientName: "Claude Code",
                sessionHash: "11".repeat(32),
                projectHash: "ab".repeat(32),
                projectLabel: "Demo",
                addedAt: "2026-01-01T00:00:00.000Z",
                reason: "Cited in the introduction",
            },
            projectHash: "ab".repeat(32),
        };

        // run addOrUpdatePaper on `url`, for `agent` if given, and wait until it is
        // done processing
        const capture = async (agent) => {
            let done;
            const processed = new Promise((resolve) => (done = resolve));
            const returned = await PMUtils.paper.addOrUpdatePaper({
                url,
                is: await PMUtils.paper.isPaper(url, true),
                contentScriptCallbacks: { update: () => {}, preprints: () => {}, done },
                agent,
            });
            await processed;
            return returned;
        };

        before(() => {
            console.log = console.groupCollapsed = console.groupEnd = () => {};
            // no background here: Memory operations run in this context (test-only flag)
            globalThis.__PM_MEMORY_IN_CONTEXT__ = true;
            global.chrome = {
                storage: {
                    local: {
                        get: (key, cb) => {
                            beforeGet(key);
                            cb({ [key]: structuredClone(storage[key]) });
                        },
                        set: (items, cb) => {
                            Object.assign(storage, structuredClone(items));
                            cb && cb();
                        },
                    },
                },
                runtime: { sendMessage: (payload, cb) => cb() },
            };
            // parse without network
            acs.parse = async () => ({
                author: "Jane Doe",
                bibtex: "@article{doe2019,\n  title = {CO2 reduction},\n  year = {2019}\n}",
                id,
                key: "doe2019",
                note: "Published @ The Journal of Physical Chemistry A (2019)",
                pdfLink: "https://pubs.acs.org/doi/pdf/10.1021/acs.jpca.9b00311",
                title: "CO2 reduction",
                venue: "The Journal of Physical Chemistry A",
                year: "2019",
            });
        });

        beforeEach(() => {
            storage = {};
            beforeGet = () => {};
            PMUtils.config.state.urlHashToId = {};
        });

        after(() => {
            Object.assign(console, { log, groupCollapsed, groupEnd });
            acs.parse = parse;
            delete global.chrome;
            delete globalThis.__PM_MEMORY_IN_CONTEXT__;
        });

        it("first capture from a url urlToId cannot resolve maps it to the stored id", async () => {
            const state = PMUtils.config.state;
            // another page mapped a url after this one read the map
            storage.urlHashToId = { otherpageurl: "Other-id" };
            expect(await PMUtils.urls.parseIdFromUrl(url)).toBeFalsy();

            await capture();
            expect(storage.papers[id]).toBeDefined();

            // resolve the url from the stored map, as another page would
            state.urlHashToId = await PMUtils.data.getStorage("urlHashToId");
            expect(await PMUtils.urls.parseIdFromUrl(url)).toEqual(id);
            expect(state.urlHashToId.otherpageurl).toEqual("Other-id");
        });

        it("first capture from a url urlToId cannot resolve returns the paper's id", async () => {
            const { paper, id: returnedId } = await capture();
            expect(returnedId).toEqual(id);
            expect(returnedId).toEqual(paper.id);
        });

        it("re-parse of a stored paper keeps its user fields and counts the visit", async () => {
            storage.papers = { [id]: stored };
            await capture();
            const paper = storage.papers[id];
            expect(paper).toMatchObject({
                tags: ["mytag"],
                note: "my note",
                count: 6,
                addDate: stored.addDate,
                key: stored.key,
                favorite: true,
            });
            expect(Date.parse(paper.lastOpenDate)).toBeGreaterThan(
                Date.parse(stored.lastOpenDate),
            );
        });

        it("re-parse of an anonymous stored paper refreshes its author and venue, keeps its note", async () => {
            storage.papers = {
                [id]: { ...stored, author: "Anonymous", venue: "Under review" },
            };
            await capture();
            expect(storage.papers[id]).toMatchObject({
                author: "Jane Doe",
                venue: "The Journal of Physical Chemistry A",
                note: "my note",
                tags: ["mytag"],
                count: 6,
            });
        });

        it("fuzzy-match promotion keeps a paper another page stored meanwhile", async () => {
            // a stored preprint which the parsed publication matches by title
            const preprint = {
                ...stored,
                id: "Arxiv-1234.56789",
                source: "arxiv",
                title: "CO2 reduction",
                venue: "",
                pdfLink: "https://arxiv.org/pdf/1234.56789.pdf",
            };
            const other = { ...stored, id: "Other-paper", title: "Another paper" };
            storage.papers = { [preprint.id]: preprint };
            // another page stores a paper while the preprint's urls are remapped
            beforeGet = (key) => {
                if (key !== "urlHashToId") return;
                storage.papers = { ...storage.papers, [other.id]: other };
                beforeGet = () => {};
            };
            await capture();
            // the preprint is promoted to the publication's id, the other paper kept
            expect(Object.keys(storage.papers).sort()).toEqual([id, other.id].sort());
        });

        it("agent capture of a new paper keeps Provenance, review and membership through the second write", async () => {
            // a parse without note and venue, so that preprint matching runs and the
            // paper is written a second time
            const parseWithNote = acs.parse;
            const { note, venue, ...parsed } = await parseWithNote();
            acs.parse = async () => ({ ...parsed });
            // offline preprint matching: the runtime stub answers nothing (e.g. no
            // Google Scholar match) and fetches to the other databases fail
            const { fetch } = global;
            global.fetch = async () => {
                throw new Error("offline");
            };
            const { set } = chrome.storage.local;
            let paperWrites = 0;
            chrome.storage.local.set = (items, cb) => {
                if (items.papers) paperWrites += 1;
                set(items, cb);
            };
            try {
                const returned = await capture(agentFields);
                await returned.done;
                expect(returned.isNew).toBe(true);
                expect(paperWrites).toBe(2);
                const paper = storage.papers[id];
                expect(paper.provenance).toEqual(agentFields.provenance);
                expect(paper.tags).toEqual(["review", "proj-demo"]);
                expect(paper.projectHashes).toEqual([agentFields.projectHash]);
            } finally {
                acs.parse = parseWithNote;
                global.fetch = fetch;
                chrome.storage.local.set = set;
            }
        });

        it("agent capture of a paper another page stored meanwhile adds tags and membership, no Provenance", async () => {
            // parsed as new, but stored by another page before this capture's write
            beforeGet = (key) => {
                if (key !== "urlHashToId") return;
                storage.papers = { [id]: stored };
                beforeGet = () => {};
            };
            const returned = await capture(agentFields);
            await returned.done;
            expect(returned.isNew).toBe(false);
            const paper = storage.papers[id];
            expect(paper.tags).toEqual(["mytag", "review", "proj-demo"]);
            expect(paper.projectHashes).toEqual([agentFields.projectHash]);
            expect(paper).not.toHaveProperty("provenance");
            expect(paper.note).toBe("my note");
        });

        it("agent add of a stored preprint's published page only attaches the preprint: no promotion", async () => {
            // a stored preprint which the parsed publication matches by title
            const preprint = {
                ...stored,
                id: "Arxiv-1234.56789",
                source: "arxiv",
                title: "CO2 reduction",
                author: "J. Doe and A. Smith",
                venue: "",
                bibtex: "@article{doe2021preprint,\n  title = {CO2 reduction}\n}",
                pdfLink: "https://arxiv.org/pdf/1234.56789.pdf",
            };
            storage.papers = { [preprint.id]: preprint };
            const outcome = await ingest({ url, ...agentFields });
            expect(outcome).toEqual({ status: "already-present", id: preprint.id });
            expect(Object.keys(storage.papers)).toEqual([preprint.id]);
            const paper = storage.papers[preprint.id];
            expect(paper).toMatchObject({
                source: "arxiv",
                author: preprint.author,
                bibtex: preprint.bibtex,
                venue: "",
                note: "my note",
                count: 6,
                tags: ["mytag", "review", "proj-demo"],
                projectHashes: [agentFields.projectHash],
            });
            expect(paper).not.toHaveProperty("provenance");
            // its urls are not remapped to the publication
            expect(storage.urlHashToId).toBeUndefined();
        });

        it("agent add of a stored anonymous paper keeps the user's note: attach only, no re-parse", async () => {
            const openreview = getSource("openreview");
            const orParse = openreview.parse;
            openreview.parse = async () => {
                throw new Error("the stored paper is not parsed again");
            };
            const orId = "OR-ICLR-2022_xQUe1pOKPam";
            storage.papers = {
                [orId]: {
                    ...stored,
                    id: orId,
                    source: "openreview",
                    author: "Anonymous",
                    venue: "ICLR 2022",
                    note: "my reading notes",
                    pdfLink: "https://openreview.net/pdf?id=xQUe1pOKPam",
                },
            };
            try {
                const outcome = await ingest({
                    url: "https://openreview.net/forum?id=xQUe1pOKPam",
                    ...agentFields,
                });
                expect(outcome).toEqual({ status: "already-present", id: orId });
                const paper = storage.papers[orId];
                expect(paper).toMatchObject({
                    author: "Anonymous",
                    note: "my reading notes",
                    count: 6,
                    tags: ["mytag", "review", "proj-demo"],
                    projectHashes: [agentFields.projectHash],
                });
                expect(paper).not.toHaveProperty("provenance");
            } finally {
                openreview.parse = orParse;
            }
        });

        it("agent add of a stored paper deleted before its write fails and does not re-create it", async () => {
            storage.papers = { [id]: stored };
            // deleted (e.g. in another tab) while the agent's add parses the page
            beforeGet = (key) => {
                if (key === "autoTags") delete storage.papers[id];
            };
            expect(await ingest({ url, ...agentFields })).toEqual({ status: "failed" });
            expect(storage.papers).toEqual({});
        });

        // an agent's add in a Project: its fields, with a Provenance hashed from its keys
        const agentInProject = async () => {
            const { makeProvenance, sha256Hex } = PMUtils.agentOps;
            const auth = {
                clientId: "client-1",
                sessionId: "22".repeat(32),
                projectKey: "33".repeat(32),
            };
            const projectHash = await sha256Hex(auth.projectKey);
            const provenance = await makeProvenance(auth, {
                clientName: "Claude Code",
                projectLabel: "Demo",
                reason: "Cited in the introduction",
            });
            const fields = { tags: ["review", "proj-demo"], projectHash, provenance };
            // what the user's visit or edit keeps of it: no ids or hashes
            const released = {
                clientName: "Claude Code",
                projectLabel: "Demo",
                addedAt: provenance.addedAt,
                reason: "Cited in the introduction",
                releasedAt: expect.any(String),
            };
            return { auth, projectHash, fields, released };
        };
        // the arXiv preprint of the publication at `url`, parsed without network (no
        // publication found); returns the function that restores the parser and fetch
        const preprintUrl = "https://arxiv.org/abs/2101.00001";
        const preprintId = "Arxiv-2101.00001";
        const parsePreprintOffline = () => {
            const arxiv = getSource("arxiv");
            const arxivParse = arxiv.parse;
            const { fetch } = global;
            arxiv.parse = async () => ({
                author: "Jane Doe",
                bibtex: "@article{doe2021co,\n  title = {CO2 reduction},\n  year = {2021}\n}",
                id: preprintId,
                key: "doe2021co",
                pdfLink: "https://arxiv.org/pdf/2101.00001.pdf",
                title: "CO2 reduction",
                venue: "",
                year: "2021",
            });
            global.fetch = async () => {
                throw new Error("offline");
            };
            return () => {
                arxiv.parse = arxivParse;
                global.fetch = fetch;
            };
        };

        it("the user's visit of the published version of an agent's preprint makes it the user's: its Provenance released", async () => {
            const { isOwnAddition } = PMUtils.agentOps;
            const { auth, projectHash, fields, released } = await agentInProject();
            const restore = parsePreprintOffline();
            try {
                const added = await ingest({ url: preprintUrl, ...fields });
                expect(added).toEqual({ status: "stored", id: preprintId });
                expect(await isOwnAddition(storage.papers[preprintId], auth)).toBe(true);
                // the user opens the published version: it replaces the preprint
                await capture();
                expect(Object.keys(storage.papers)).toEqual([id]);
                const paper = storage.papers[id];
                expect(paper.provenance).toEqual(released);
                expect(paper.projectHashes).toEqual([projectHash]);
                // so its client's delete_paper answers not-own-addition (flag it instead)
                expect(await isOwnAddition(paper, auth)).toBe(false);
            } finally {
                restore();
            }
        });

        it("an agent's paper keeps its Provenance through its own add; the user's visit releases it", async () => {
            const { isOwnAddition } = PMUtils.agentOps;
            const { auth, fields, released } = await agentInProject();
            const restore = parsePreprintOffline();
            const { set } = chrome.storage.local;
            let paperWrites = 0;
            chrome.storage.local.set = (items, cb) => {
                if (items.papers) paperWrites += 1;
                set(items, cb);
            };
            try {
                const added = await ingest({ url: preprintUrl, ...fields });
                expect(added).toEqual({ status: "stored", id: preprintId });
                // its first write and its enrichment patch (no venue yet)
                expect(paperWrites).toBe(2);
                expect(await isOwnAddition(storage.papers[preprintId], auth)).toBe(true);
                // the user opens it: a plain visit
                const visit = await PMUtils.paper.addOrUpdatePaper({
                    url: preprintUrl,
                    is: await PMUtils.paper.isPaper(preprintUrl, true),
                });
                await visit.done;
                const paper = storage.papers[preprintId];
                expect(paper.count).toBe(2);
                expect(paper.provenance).toEqual(released);
                expect(await isOwnAddition(paper, auth)).toBe(false);
            } finally {
                restore();
                chrome.storage.local.set = set;
            }
        });

        it("a failure while processing still ends it: done resolves", async () => {
            const returned = await PMUtils.paper.addOrUpdatePaper({
                url,
                is: await PMUtils.paper.isPaper(url, true),
                contentScriptCallbacks: {
                    update: () => {
                        throw new Error("the page went away");
                    },
                    preprints: () => {},
                    done: () => {},
                },
            });
            let timer;
            const timeout = new Promise((r) => (timer = setTimeout(r, 2000, "timeout")));
            const ended = await Promise.race([returned.done.then(() => "done"), timeout]);
            clearTimeout(timer);
            expect(ended).toBe("done");
            expect(storage.papers[id]).toBeDefined();
        });

        describe("an agent's add of a DOI: the page it is registered to", () => {
            const doi = "10.1021/acs.jpca.9b00311";
            const page = `https://pubs.acs.org/doi/${doi}`;

            it("is parsed and stored, with the DOI its page does not give", async () => {
                const api = stubHandleApi(page);
                try {
                    const outcome = await ingest({
                        url: `https://doi.org/${doi}`,
                        ...agentFields,
                    });
                    expect(outcome).toEqual({ status: "stored", id });
                    // one request: the DOI Handle API
                    expect(api.calls.map((c) => c.url)).toEqual([
                        `https://doi.org/api/handles/${encodeURIComponent(doi)}?type=URL`,
                    ]);
                    expect(storage.papers[id]).toMatchObject({
                        doi,
                        title: "CO2 reduction",
                        tags: ["review", "proj-demo"],
                        provenance: agentFields.provenance,
                    });
                } finally {
                    api.restore();
                }
            });

            it("keeps the DOI its page gives", async () => {
                const parseWithoutDoi = acs.parse;
                acs.parse = async () => ({ ...(await parseWithoutDoi()), doi });
                const api = stubHandleApi(page);
                try {
                    // a DOI in another case (DOIs ignore case): the page's is kept
                    const outcome = await ingest({
                        url: `doi:${doi.toUpperCase()}`,
                        ...agentFields,
                    });
                    expect(outcome).toEqual({ status: "stored", id });
                    expect(storage.papers[id].doi).toBe(doi);
                } finally {
                    acs.parse = parseWithoutDoi;
                    api.restore();
                }
            });

            it("is only attached when it is stored: its DOI is unchanged", async () => {
                storage.papers = { [id]: stored };
                const api = stubHandleApi(page);
                try {
                    const outcome = await ingest({
                        url: `http://dx.doi.org/${doi}`,
                        ...agentFields,
                    });
                    expect(outcome).toEqual({ status: "already-present", id });
                    const paper = storage.papers[id];
                    expect(paper.tags).toEqual(["mytag", "review", "proj-demo"]);
                    expect(paper).not.toHaveProperty("doi");
                    expect(paper).not.toHaveProperty("provenance");
                } finally {
                    api.restore();
                }
            });

            it("answers unsupported-url with that page when no Source supports it", async () => {
                const other =
                    "https://www.tandfonline.com/doi/full/10.1080/00000000.2020.1234567";
                const api = stubHandleApi(other);
                try {
                    const outcome = await ingest({
                        url: "10.1080/00000000.2020.1234567",
                        ...agentFields,
                    });
                    expect(outcome).toStrictEqual({
                        status: "unsupported-url",
                        resolvedUrl: other,
                    });
                    expect(storage.papers).toBeUndefined();
                } finally {
                    api.restore();
                }
            });

            for (const [why, answer] of [
                ["it is not registered", null],
                ["doi.org cannot be reached", new Error("offline")],
            ]) {
                it(`answers unsupported-url with a message when ${why}`, async () => {
                    const api = stubHandleApi(answer);
                    try {
                        const outcome = await ingest({
                            url: `doi:${doi}`,
                            ...agentFields,
                        });
                        expect(outcome).toStrictEqual({
                            status: "unsupported-url",
                            message: "DOI could not be resolved",
                        });
                        expect(storage.papers).toBeUndefined();
                    } finally {
                        api.restore();
                    }
                });
            }

            it("is not looked up for a URL that is not a DOI", async () => {
                const api = stubHandleApi(page);
                try {
                    const outcome = await ingest({
                        url: "https://example.com/paper.pdf",
                        ...agentFields,
                    });
                    expect(outcome).toStrictEqual({ status: "unsupported-url" });
                    expect(api.calls).toEqual([]);
                } finally {
                    api.restore();
                }
            });
        });
    });
});

describe("unwrapUrl", () => {
    const arxiv = "https://arxiv.org/pdf/1703.10593";
    const acs = "https://pubs.acs.org/doi/10.1021/acs.jctc.2c00001";
    const nature = "https://www.nature.com/articles/s41467-018-07210-0";

    for (const [wrapped, inner] of [
        [`chrome-extension://oemmndcbldboiebfnladdacbdfmadadm/${arxiv}`, arxiv],
        [
            "chrome-extension://abc/viewer.html?file=https%3A%2F%2Farxiv.org%2Fpdf%2F1703.10593",
            arxiv,
        ],
        [`https://login.ezproxy.univ.edu/login?url=${acs}`, acs],
        [`https://proxy.univ.edu/${nature}`, nature],
        [
            "https://login.example/login?return=https://univ.edu/home&url=https://arxiv.org/abs/1703.10593",
            "https://arxiv.org/abs/1703.10593",
        ],
        // an encoded url in the path keeps the outer query as its own
        [
            "https://proxy.x/https%3A%2F%2Fopenreview.net%2Fforum?id=abc123",
            "https://openreview.net/forum?id=abc123",
        ],
        [
            "https://proxy.x/https://openreview.net/forum%3Fid%3Dabc123",
            "https://openreview.net/forum?id=abc123",
        ],
        // a raw url in the path keeps its own query's escapes
        [
            "https://proxy.x/https://arxiv.org/abs/1703.10593?q=a%26b",
            "https://arxiv.org/abs/1703.10593?q=a%26b",
        ],
        // an encoded url with its own query ignores the outer one
        [
            "https://proxy.x/https%3A%2F%2Fopenreview.net%2Fforum%3Fid%3Dabc?foo=bar",
            "https://openreview.net/forum?id=abc",
        ],
        [`https://login.ezproxy.univ.edu/login/?qurl=${acs}`, acs],
        [
            "chrome-extension://abc/viewer.html?file=HTTPS://ARXIV.ORG/abs/1703.10593",
            "https://arxiv.org/abs/1703.10593",
        ],
        // an encoded delimiter decodes the whole embedded part
        ["https://proxy.x/https://arxiv.org/pdf%2F1703.10593", arxiv],
        [
            "moz-extension://abc/viewer.html?file=https%3A%2F%2Farxiv.org%2Fpdf%2F1703.10593",
            arxiv,
        ],
        // a url in the path is unwrapped on any host (archive snapshots)
        [
            "https://web.archive.org/web/2020/https://arxiv.org/abs/1703.10593",
            "https://arxiv.org/abs/1703.10593",
        ],
    ]) {
        it(`unwraps ${wrapped}`, () => {
            expect(unwrapUrl(wrapped)).toEqual(inner);
        });
    }

    for (const url of [
        "https://arxiv.org/abs/1703.10593",
        "https://google.com",
        "https://evil.example/#https://arxiv.org/abs/1703.10593",
        "https://evil.example/?x=arxiv.org/abs/1703.10593",
        // host-rewrite proxies are out of scope
        "https://pubs-acs-org.ezproxy.univ.edu/doi/10.1021/acs.jctc.2c00001",
        "https://redirect.example/?next=https://google.com",
        // query parameters are only unwrapped on extension and /login pages
        "https://www.google.com/search?q=https://arxiv.org/abs/1703.10593",
        "https://twitter.com/intent/tweet?url=https%3A%2F%2Farxiv.org%2Fabs%2F1703.10593",
        "https://www.linkedin.com/sharing/share-offsite/?url=https://arxiv.org/abs/1703.10593",
        "https://news.ycombinator.com/submitlink?u=https://arxiv.org/abs/1703.10593&t=x",
        "https://www.reddit.com/submit?url=https://arxiv.org/abs/1703.10593",
        "https://example.com/redirect?next=https://arxiv.org/abs/1703.10593",
        "https://example.com/page?url=https://arxiv.org/abs/1703.10593",
        "https://login.ezproxy.univ.edu/login?next=https://arxiv.org/abs/1703.10593",
        "https://login.ezproxy.univ.edu/connect?url=https://arxiv.org/abs/1703.10593",
        // the paper url is two levels deep: only one level is unwrapped
        "https://a.example/?u=https%3A%2F%2Fb.example%2F%3Fu%3Dhttps%253A%252F%252Farxiv.org%252Fabs%252F1703.10593",
        // "https" is the host here, not an embedded url's scheme
        "https://https://arxiv.org/abs/1703.10593",
        "not a url",
        "",
    ]) {
        it(`leaves "${url}" unchanged`, () => {
            expect(unwrapUrl(url)).toEqual(url);
        });
    }

    it("parseIdFromUrl resolves a wrapped url like the inner one", async () => {
        const wrapped = "https://proxy.univ.edu/https://arxiv.org/abs/1703.10593";
        expect(await PMUtils.urls.parseIdFromUrl(wrapped)).toEqual("Arxiv-1703.10593");
    });

    it("parseIdFromUrl resolves an encoded viewer url like the inner one", async () => {
        const wrapped =
            "chrome-extension://abc/viewer.html?file=https%3A%2F%2Farxiv.org%2Fabs%2F1703.10593";
        expect(await PMUtils.urls.parseIdFromUrl(wrapped)).toEqual("Arxiv-1703.10593");
    });

    it("acs urlToId resolves an unwrapped url", async () => {
        // the raw wrapped url used to throw in acs.urlToId
        const ctx = {
            papers: [],
            titleHashToIds: {},
            findPaperForProperty: () => null,
        };
        const wrapped = `https://login.ezproxy.univ.edu/login?url=${acs}`;
        expect(await getSource("acs").urlToId(unwrapUrl(wrapped), ctx)).toEqual(
            "ACS_101021acsjctc2c00001",
        );
    });
});

describe("urlToDoi", () => {
    const doi = "10.1109/TMTT.2018.2840982";
    const sici = "10.1002/(SICI)1097-4636(199706)35:4<487::AID-JBM8>3.0.CO;2-L";

    for (const [given, expected] of [
        [`https://doi.org/${doi}`, doi],
        [`http://doi.org/${doi}`, doi],
        [`http://dx.doi.org/${doi}`, doi],
        [`https://dx.doi.org/${doi}`, doi],
        [`https://www.doi.org/${doi}`, doi],
        [`HTTPS://DOI.ORG/${doi}`, doi],
        // its query is not part of the DOI
        [`https://doi.org/${doi}?locatt=mode:legacy`, doi],
        [`doi:${doi}`, doi],
        [`DOI:${doi}`, doi],
        [doi, doi],
        [`  ${doi}\n`, doi],
        // URLs and doi: URIs are percent-decoded, a bare DOI is taken as is
        ["https://doi.org/10.1109%2FTMTT.2018.2840982", doi],
        [`https://doi.org/${encodeURIComponent(sici)}`, sici],
        [`https://doi.org/${sici}`, sici],
        ["doi:10.1000/a%3Fb", "10.1000/a?b"],
        ["10.1000/100%25", "10.1000/100%25"],
    ]) {
        it(`reads ${JSON.stringify(given)}`, () => {
            expect(PMUtils.urls.urlToDoi(given)).toEqual(expected);
        });
    }

    for (const given of [
        "https://arxiv.org/abs/1706.03762",
        `https://example.com/${doi}`,
        `https://doi.org.example.com/${doi}`,
        `ftp://doi.org/${doi}`,
        "https://doi.org/",
        `https://doi.org/api/handles/${doi}`,
        "javascript:alert(1)",
        "doi:javascript:alert(1)",
        "file:///etc/hosts",
        `doi.org/${doi}`,
        "doi:",
        "10.1109",
        "10.12/abc",
        "11.1109/TMTT.2018.2840982",
        "10.1109/with space",
        "doi:10.1109/{brace}",
        // decoded, a line break is not part of a DOI
        "https://doi.org/10.1109/a%0Ab",
        // a malformed percent-encoding
        "doi:10.1000/a%zz",
        "",
        undefined,
        null,
        42,
    ]) {
        it(`rejects ${JSON.stringify(given)}`, () => {
            expect(PMUtils.urls.urlToDoi(given)).toBeUndefined();
        });
    }
});

describe("resolveDoi", () => {
    const doi = "10.1109/TMTT.2018.2840982";
    const page = "https://ieeexplore.ieee.org/document/8384009/";
    // fetchJSON logs its failures (e.g. offline)
    const { log } = console;
    before(() => (console.log = () => {}));
    after(() => (console.log = log));

    it("answers the URL the DOI Handle API has for the DOI, within a deadline", async () => {
        const api = stubHandleApi(page);
        try {
            expect(await PMUtils.urls.resolveDoi(doi)).toBe(page);
            expect(api.calls.map((c) => c.url)).toEqual([
                "https://doi.org/api/handles/10.1109%2FTMTT.2018.2840982?type=URL",
            ]);
            expect(api.calls[0].options.signal).toBeInstanceOf(AbortSignal);
        } finally {
            api.restore();
        }
    });

    const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
    for (const [why, answer] of [
        ["the DOI is not registered", null],
        ["doi.org cannot be reached", new Error("offline")],
        ["the request timed out", new DOMException("timed out", "TimeoutError")],
        ["it has no URL for the DOI", json({ responseCode: 200, values: [] })],
        ["its answer is not JSON", new Response("<html></html>", { status: 200 })],
        ["it answers an error code", json({ responseCode: 2, values: [] }, 500)],
        ["the URL is not http or https", "ftp://example.org/paper.pdf"],
        ["the URL is javascript:", "javascript:alert(1)"],
        ["the URL is not a URL", "not a url"],
    ]) {
        it(`answers undefined when ${why}`, async () => {
            const api = stubHandleApi(answer);
            try {
                expect(await PMUtils.urls.resolveDoi(doi)).toBeUndefined();
            } finally {
                api.restore();
            }
        });
    }
});

describe("functions.js", () => {
    describe("#normalizeCodeLink", () => {
        const norm = (v) => PMUtils.functions.normalizeCodeLink(v);
        const accepted = {
            "": "",
            "github.com/org/repo": "https://github.com/org/repo",
            "  github.com/org/repo  ": "https://github.com/org/repo",
            "http://github.com/org/repo": "http://github.com/org/repo",
            "HTTPS://GitHub.com/Org/Repo": "https://github.com/Org/Repo",
            "localhost:3000/demo": "https://localhost:3000/demo",
            "localhost": "https://localhost/",
            "192.168.1.10:8080/x": "https://192.168.1.10:8080/x",
            "https://[::1]:8000/": "https://[::1]:8000/",
            "bücher.example/repo": "https://xn--bcher-kva.example/repo",
            "例え.テスト/x": "https://xn--r8jz45g.xn--zckzah/x",
            "gitlab.com:8443/group/project": "https://gitlab.com:8443/group/project",
            // markup is URL-encoded (and escaped wherever the link is shown)
            "github.com/<img>": "https://github.com/%3Cimg%3E",
        };
        for (const [input, url] of Object.entries(accepted)) {
            it(`accepts ${JSON.stringify(input)}`, () => {
                expect(norm(input)).toEqual({ url });
            });
        }
        for (const input of [
            "mailto:foo@example.com",
            "javascript:alert(1)",
            "ftp://example.com/file",
            "file:///etc/passwd",
            "data:text/html,hi",
            "tensor2tensor repo",
            "https://user:pass@example.com/",
            "https://",
            "github.com/my repo",
            "github.com/<img src=x>",
        ]) {
            it(`refuses ${JSON.stringify(input)}`, () => {
                expect(norm(input).error).toBeTruthy();
                expect(norm(input).url).toBeUndefined();
            });
        }
    });
});

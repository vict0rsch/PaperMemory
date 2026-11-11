import { expect } from "expect";
import { JSDOM } from "jsdom";
import { getSource, unwrapUrl } from "@pmu/sources/index.js";

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

        // run addOrUpdatePaper on `url` and wait until it is done processing
        const capture = async () => {
            let done;
            const processed = new Promise((resolve) => (done = resolve));
            const returned = await PMUtils.paper.addOrUpdatePaper({
                url,
                is: await PMUtils.paper.isPaper(url, true),
                contentScriptCallbacks: { update: () => {}, preprints: () => {}, done },
            });
            await processed;
            return returned;
        };

        before(() => {
            console.log = console.groupCollapsed = console.groupEnd = () => {};
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

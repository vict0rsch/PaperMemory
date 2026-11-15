// Preprint matching sources (src/shared/js/utils/preprintMatching.js) against answers
// recorded from the live APIs on 2026-11-15 (test/data/preprint-matching.json, keyed by
// request URL: a change in how a request is built fails here, re-record then).
// Live checks done when recording: DBLP's SPARQL endpoint (dblp.org's search API answers a
// bot challenge page), CrossRef, OpenAlex (Unpaywall's title search answers 410 since
// 2026-09-18) and Semantic Scholar.
import { expect } from "expect";
import { loadPaperMemoryUtils, readJSON, root } from "./utilsForTests.js";

await loadPaperMemoryUtils();

const {
    tryDBLP,
    tryCrossRef,
    trySemanticScholar,
    tryOpenAlex,
    titleKey,
    dblpVenueName,
    publishedBibtex,
    validDoi,
    bibSourceText,
    isPreprintRecord,
} = PMUtils.preprintMatching;
const { bibtexToObject } = PMUtils.bibtexParser;
const recorded = readJSON(`${root}/test/data/preprint-matching.json`).responses;

/** A preprint as stored (arXiv BibTeX) */
const preprint = (title, year) => ({
    title,
    year,
    author: "A B",
    bibtex: `@article{key${year},\n  title = {${title}},\n  author = {A B},\n  year = {${year}},\n  journal = {arXiv preprint}\n}`,
});

/** A DBLP SPARQL answer with these bindings */
const sparql = (...bindings) => ({ status: 200, body: { results: { bindings } } });
const dblpRecord = ({
    title,
    venue,
    year,
    type = "Inproceedings",
    rec = "conf/x/Y",
}) => ({
    p: { value: `https://dblp.org/rec/${rec}` },
    title: { value: title },
    venue: { value: venue },
    year: { value: year },
    type: { value: `https://dblp.org/rdf/schema#${type}` },
});
const openAlexWork = ({
    title,
    year,
    type = "article",
    source,
    sourceType = "journal",
}) => ({
    id: "https://openalex.org/W1",
    doi: "https://doi.org/10.1/x",
    display_name: title,
    publication_year: year,
    type,
    primary_location: { source: { display_name: source, type: sourceType } },
});

describe("Preprint matching sources (recorded answers)", function () {
    const realFetch = globalThis.fetch;
    let requests, unrecorded, signals;
    /** fetch answers `handler`'s response, else the recorded one; any other URL is noted */
    const stubFetch = (handler) => {
        globalThis.fetch = async (url, options) => {
            requests.push(url);
            signals.push(options?.signal);
            const answer = handler?.(url) ?? recorded[url];
            if (!answer) {
                unrecorded.push(url);
                throw new Error(`No recorded answer for ${url}`);
            }
            const body =
                typeof answer.body === "string"
                    ? answer.body
                    : JSON.stringify(answer.body);
            return new Response(body, { status: answer.status });
        };
    };
    beforeEach(() => {
        requests = [];
        unrecorded = [];
        signals = [];
        stubFetch();
    });
    afterEach(() => {
        // a request built differently than when recorded fails here, not silently
        expect(unrecorded).toEqual([]);
        // every request has a deadline
        expect(signals.every((s) => s instanceof AbortSignal)).toBe(true);
    });
    after(() => {
        globalThis.fetch = realFetch;
    });

    describe("DBLP (SPARQL endpoint)", function () {
        it("finds the NeurIPS version of arXiv 1706.03762, keeping the citation key", async function () {
            const match = await tryDBLP(preprint("Attention Is All You Need", "2017"));
            expect(requests).toHaveLength(1);
            expect(requests[0]).toMatch(/^https:\/\/sparql\.dblp\.org\/sparql\?query=/);
            expect(match.status).toBe(200);
            expect(match.venue).toBe("NeurIPS");
            expect(match.year).toBe("2017");
            expect(match.note).toBe("Accepted @ NeurIPS 2017 -- [dblp.org]");
            expect(match.citationKey).toBe("DBLP:conf/nips/VaswaniSPUJGKP17");
            const bib = bibtexToObject(match.bibtex);
            expect(bib.entryType).toBe("inproceedings");
            expect(bib.booktitle).toBe("NeurIPS");
            expect(bib.year).toBe("2017");
            expect(bib.journal).toBeUndefined();
            expect(bib.citationKey).toBe("key2017");
        });

        it("drops the volume / track and the arXiv DOI (Adam, ICLR 2015)", async function () {
            const match = await tryDBLP(
                preprint("Adam: A Method for Stochastic Optimization", "2014"),
            );
            expect(match.status).toBe(200);
            expect(match.venue).toBe("ICLR");
            expect(match.doi).toBeUndefined();
            expect(match.bibtex).not.toMatch(/10\.48550/i);
        });

        it("finds nothing for a paper DBLP does not have", async function () {
            const match = await tryDBLP(
                preprint("Comprehensive integration of single cell data", "2018"),
            );
            expect(match).toEqual({ status: 200 });
        });

        it("strips only track qualifiers; a workshop stays a workshop", function () {
            expect(dblpVenueName("NAACL-HLT (1)")).toBe("NAACL-HLT");
            expect(dblpVenueName("ICLR (Poster)")).toBe("ICLR");
            expect(dblpVenueName("ICLR (Oral)")).toBe("ICLR");
            expect(dblpVenueName("NeurIPS (Spotlight)")).toBe("NeurIPS");
            expect(dblpVenueName("ICLR (Workshop)")).toBe("ICLR Workshop");
            expect(dblpVenueName("EMNLP (Findings)")).toBe("EMNLP (Findings)");
        });

        it("a workshop record is matched as a workshop", async function () {
            const title = "A Workshop Paper on Things";
            stubFetch(() =>
                sparql(
                    dblpRecord({
                        title: `${title}.`,
                        venue: "ICLR (Workshop)",
                        year: "2020",
                    }),
                ),
            );
            const match = await tryDBLP(preprint(title, "2020"));
            expect(match.venue).toBe("ICLR Workshop");
        });

        it("skips a malformed record, not the whole answer", async function () {
            const title = "Robust Things";
            stubFetch(() =>
                sparql(
                    null,
                    { p: 3, title: { value: 7 } },
                    dblpRecord({ title: `${title}.`, venue: "ICML", year: "2021" }),
                ),
            );
            expect((await tryDBLP(preprint(title, "2021"))).venue).toBe("ICML");
        });

        it("refuses CoRR, another title and a far year, even when everything else matches", async function () {
            const title = "Robust Things";
            stubFetch(() =>
                sparql(
                    dblpRecord({ title: `${title}.`, venue: "CoRR", year: "2021" }),
                    dblpRecord({
                        title: "Robust Things II.",
                        venue: "ICML",
                        year: "2021",
                    }),
                    dblpRecord({ title: `${title}.`, venue: "ICML", year: "2031" }),
                ),
            );
            expect((await tryDBLP(preprint(title, "2021"))).venue).toBeUndefined();
        });

        it("tries once more after a 429, then reports it", async function () {
            this.timeout(6000);
            stubFetch(() => ({ status: 429, body: "" }));
            const match = await tryDBLP(preprint("Attention Is All You Need", "2017"));
            expect(requests.length).toBe(2);
            expect(match).toEqual({ status: 429 });
        });
    });

    describe("CrossRef", function () {
        it("finds the NAACL 2019 event of arXiv 1810.04805, BibTeX key kept", async function () {
            const match = await tryCrossRef(
                preprint(
                    "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding",
                    "2018",
                ),
            );
            expect(match.status).toBe(200);
            expect(match.venue).toMatch(/North American Chapter/);
            expect(match.year).toBe("2019");
            expect(match.note).toMatch(/^Accepted @ .* -- \[crossref\.org\]$/);
            const bib = bibtexToObject(match.bibtex);
            expect(bib.citationKey).toBe("key2018");
            expect(bib.year).toBe("2019");
        });

        it("ignores a record without an event", async function () {
            const match = await tryCrossRef(
                preprint("Attention Is All You Need", "2017"),
            );
            expect(match).toEqual({ status: 200 });
        });

        it("refuses an event years away from the preprint", async function () {
            const title = "Robust Things";
            const item = (year) => ({
                title: [title],
                event: {
                    name: "Some Conference",
                    start: { "date-parts": [[year, 6]] },
                },
            });
            stubFetch(() => ({
                status: 200,
                body: { status: "ok", message: { items: [null, item(2031)] } },
            }));
            expect((await tryCrossRef(preprint(title, "2021"))).venue).toBeUndefined();
            stubFetch(() => ({
                status: 200,
                body: { status: "ok", message: { items: [null, item(2022)] } },
            }));
            expect((await tryCrossRef(preprint(title, "2021"))).venue).toBe(
                "Some Conference",
            );
        });
    });

    describe("Semantic Scholar", function () {
        it("finds NeurIPS for arXiv 1706.03762, without the arXiv DOI, key kept", async function () {
            const match = await trySemanticScholar(
                preprint("Attention Is All You Need", "2017"),
            );
            expect(match.status).toBe(200);
            expect(match.venue).toBe("NeurIPS");
            expect(match.venueFull).toBe("Neural Information Processing Systems");
            expect(match.doi).toBeUndefined();
            const bib = bibtexToObject(match.bibtex);
            expect(bib.journal).toBe("NeurIPS");
            expect(bib.citationKey).toBe("key2017");
            // its own key stays available (BibMatcher's "new key" option)
            expect(match.citationKey).toBe("vaswani2017attention");
        });

        it("refuses an arXiv / bioRxiv venue and skips malformed results", async function () {
            const title = "Robust Things";
            const s2 = (venue) => ({
                title,
                year: 2021,
                venue,
                authors: [{ name: "A B" }],
                externalIds: {},
                url: "u",
            });
            stubFetch(() => ({
                status: 200,
                body: { data: [null, s2("ArXiv"), s2("bioRxiv"), s2(42)] },
            }));
            expect(
                (await trySemanticScholar(preprint(title, "2021"))).venue,
            ).toBeUndefined();
            stubFetch(() => ({ status: 200, body: { data: [null, s2("ICML")] } }));
            expect((await trySemanticScholar(preprint(title, "2021"))).venue).toBe(
                "ICML",
            );
        });
    });

    describe("OpenAlex (replaces Unpaywall)", function () {
        it("finds the ICLR 2021 version of arXiv 2010.11929", async function () {
            const match = await tryOpenAlex(
                preprint(
                    "An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale",
                    "2020",
                ),
            );
            expect(requests[0]).toMatch(/^https:\/\/api\.openalex\.org\/works\?/);
            expect(match.status).toBe(200);
            expect(match.venue).toBe("ICLR");
            expect(match.year).toBe("2021");
            expect(match.venueFull).toBe(
                "International Conference on Learning Representations",
            );
            expect(bibtexToObject(match.bibtex).booktitle).toBe("ICLR");
        });

        it("finds the journal version of a bioRxiv preprint (Cell 2019)", async function () {
            const match = await tryOpenAlex(
                preprint("Comprehensive integration of single cell data", "2018"),
            );
            expect(match.venue).toBe("Cell");
            expect(match.doi).toBe("10.1016/j.cell.2019.05.031");
            expect(match.note).toBe("Accepted @ Cell (2019) -- [openalex.org]");
            const bib = bibtexToObject(match.bibtex);
            expect(bib.journal).toBe("Cell");
            expect(bib.year).toBe("2019");
            expect(bib.citationKey).toBe("key2018");
        });

        it("works on a BibMatcher entry (a parsed .bib entry, its key kept)", async function () {
            const match = await tryOpenAlex({
                entryType: "article",
                citationKey: "stuart2018",
                title: "Comprehensive integration of single cell data",
                author: "Stuart, Tim",
                journal: "bioRxiv",
                year: "2018",
            });
            const bib = bibtexToObject(match.bibtex);
            expect(bib.citationKey).toBe("stuart2018");
            expect(bib.journal).toBe("Cell");
            expect(bib.doi).toBe("10.1016/j.cell.2019.05.031");
        });

        it("refuses a same-title work that is not a journal or conference paper", async function () {
            // the arXiv preprint and a 2025 book chapter share the title
            const match = await tryOpenAlex(
                preprint("Attention Is All You Need", "2017"),
            );
            expect(match).toEqual({ status: 200 });
        });

        it("refuses preprints, repositories and *rxiv, same title and year; skips malformed works", async function () {
            const title = "Robust Things";
            stubFetch(() => ({
                status: 200,
                body: {
                    results: [
                        null,
                        openAlexWork({
                            title,
                            year: 2021,
                            type: "preprint",
                            source: "J",
                        }),
                        openAlexWork({
                            title,
                            year: 2021,
                            source: "Zenodo",
                            sourceType: "repository",
                        }),
                        openAlexWork({ title, year: 2021, source: "bioRxiv" }),
                        {
                            display_name: title,
                            primary_location: { source: { display_name: 5 } },
                        },
                    ],
                },
            }));
            expect((await tryOpenAlex(preprint(title, "2021"))).venue).toBeUndefined();
            stubFetch(() => ({
                status: 200,
                body: {
                    results: [
                        null,
                        openAlexWork({ title, year: 2022, source: "Nature" }),
                    ],
                },
            }));
            expect((await tryOpenAlex(preprint(title, "2021"))).venue).toBe("Nature");
        });
    });

    describe("A preprint is never its own published version", function () {
        it("recognises preprint records: *rxiv venue, preprint DOI, preprint type", function () {
            for (const record of [
                { venue: "arXiv.org" },
                { venue: "bioRxiv" },
                { venue: "medRxiv (Cold Spring Harbor)" },
                { venue: "ChemRxiv" },
                { doi: "10.48550/arXiv.1706.03762" },
                { doi: "https://doi.org/10.1101/2022.07.20.500902" },
                { doi: "10.1101/460147" },
                { doi: "10.26434/chemrxiv-2021-abcde" },
                { type: "posted-content" },
                { type: "preprint" },
            ])
                expect([record, isPreprintRecord(record)]).toEqual([record, true]);
            for (const record of [
                {
                    venue: "Nature",
                    doi: "10.1038/nature14539",
                    type: "journal-article",
                },
                // Cold Spring Harbor's journals are publications
                { venue: "Genome Research", doi: "10.1101/gr.275777.121" },
                { venue: "NeurIPS", type: "proceedings-article" },
                {},
            ])
                expect([record, isPreprintRecord(record)]).toEqual([record, false]);
        });

        const title = "Language models of protein sequences at the scale of evolution";
        const doi = "10.1101/2022.07.20.500902";
        /** The bioRxiv entry of a preprint (BibMatcher: a parsed BibTeX entry) */
        const entry = {
            entryType: "article",
            citationKey: "lin2022language",
            title,
            journal: "bioRxiv",
            year: "2022",
            doi,
        };

        it("CrossRef: refuses posted-content and preprint DOIs, even with an event", async function () {
            const item = (extra) => ({
                title: [title],
                event: { name: "Some Event", start: { "date-parts": [[2022]] } },
                ...extra,
            });
            for (const extra of [{ type: "posted-content" }, { DOI: doi }]) {
                stubFetch(() => ({
                    status: 200,
                    body: { status: "ok", message: { items: [item(extra)] } },
                }));
                expect(await tryCrossRef(entry)).toEqual({ status: 200 });
            }
            stubFetch(() => ({
                status: 200,
                body: {
                    status: "ok",
                    message: {
                        items: [item({ type: "proceedings-article", DOI: "10.1/x.1" })],
                    },
                },
            }));
            expect((await tryCrossRef(entry)).venue).toBe("Some Event");
        });

        it("OpenAlex, Semantic Scholar, DBLP: refuse the preprint's own record", async function () {
            stubFetch(() => ({
                status: 200,
                body: {
                    results: [
                        {
                            ...openAlexWork({ title, year: 2022, source: "A Journal" }),
                            doi: `https://doi.org/${doi}`,
                        },
                    ],
                },
            }));
            expect(await tryOpenAlex(entry)).toEqual({ status: 200 });
            stubFetch(() => ({
                status: 200,
                body: { data: [{ title, venue: "medRxiv", year: 2022, authors: [] }] },
            }));
            expect((await trySemanticScholar(entry)).venue).toBeUndefined();
            stubFetch(() =>
                sparql(dblpRecord({ title, venue: "ChemRxiv", year: "2022" })),
            );
            expect(await tryDBLP(entry)).toEqual({ status: 200 });
        });

        it("Semantic Scholar: a preprint DOI needs a known journal or conference", async function () {
            const record = (extra) => ({
                title,
                year: 2022,
                authors: [],
                venue: "Cold Spring Harbor Laboratory",
                externalIds: { DOI: doi },
                ...extra,
            });
            stubFetch(() => ({ status: 200, body: { data: [record()] } }));
            expect(await trySemanticScholar(entry)).toEqual({ status: 200 });
            // a journal Semantic Scholar knows: the publication (its DOI not kept)
            stubFetch(() => ({
                status: 200,
                body: {
                    data: [
                        record({
                            venue: "Science",
                            publicationVenue: { name: "Science", type: "journal" },
                        }),
                    ],
                },
            }));
            const match = await trySemanticScholar(entry);
            expect(match.venue).toMatch(/^science$/i);
            expect(match.doi).toBeUndefined();
        });

        it("the published BibTeX drops the preprint's journal and DOI", function () {
            const bib = bibtexToObject(
                publishedBibtex(entry, {
                    venue: "Science",
                    year: 2023,
                    doi: "10.1126/x.1",
                }),
            );
            expect(bib.journal).toBe("Science");
            expect(bib.doi).toBe("10.1126/x.1");
            const noDoi = bibtexToObject(publishedBibtex(entry, { venue: "Science" }));
            expect(noDoi.doi).toBeUndefined();
            expect(noDoi.citationKey).toBe("lin2022language");
        });
    });

    describe("Titles and BibTeX", function () {
        it("compares titles across scripts and accents, never on an empty key", async function () {
            expect(titleKey("Gödel, Escher: Bach!")).toBe(
                titleKey("godel escher bach"),
            );
            expect(titleKey("深度学习 综述")).toBe("深度学习综述");
            expect(titleKey("Обзор")).toBe("обзор");
            // a punctuation-only title matches nothing
            stubFetch(() => ({
                status: 200,
                body: {
                    results: [
                        openAlexWork({ title: "?!", year: 2021, source: "Nature" }),
                    ],
                },
            }));
            expect((await tryOpenAlex(preprint("?!", "2021"))).venue).toBeUndefined();
            expect(await tryDBLP(preprint("?!", "2021"))).toEqual({});
        });

        it("escapes the inserted venue, keeps the entry's own escapes", function () {
            const paper = preprint("T\\&C {GAN}", "2020");
            for (const [venue, expected] of [
                ["AI & Society", "AI \\& Society"],
                ["Foo {Bar", "Foo \\{Bar"],
                ["Already \\& escaped", "Already \\& escaped"],
                ["50% #1 a_b", "50\\% \\#1 a\\_b"],
            ]) {
                const bib = bibtexToObject(
                    publishedBibtex(paper, { venue, year: 2021 }),
                );
                expect(bib.journal).toBe(expected);
                expect(bib.title).toBe("T\\&C {GAN}");
            }
        });

        it("keeps only real DOIs and a bibSource without { } \\ or line breaks", function () {
            expect(validDoi("10.1038/nature14539")).toBe("10.1038/nature14539");
            expect(validDoi(" https://doi.org/10.1145/3292500.3330701 ")).toBe(
                "10.1145/3292500.3330701",
            );
            for (const bad of [
                "10.1/x}, note = {pwned",
                "10.1234/a\nnote = {x}",
                "10.1234/a\\b",
                "10.12/short-registrant",
                "doi:10.1234/x",
                "",
                42,
                undefined,
            ])
                expect(validDoi(bad)).toBeUndefined();
            expect(bibSourceText("DBLP https://dblp.org/rec/x}\n@misc{evil,")).toBe(
                "DBLP https://dblp.org/rec/x @misc evil,",
            );
            const bibtex = publishedBibtex(preprint("A title", "2020"), {
                venue: "ICML",
                year: 2021,
                doi: "10.1/x}, note = {pwned",
                source: "OpenAlex W1},\n  note = {pwned\\",
            });
            const bib = bibtexToObject(bibtex);
            expect(bib.doi).toBeUndefined();
            expect(bib.note).toBeUndefined();
            expect(bib.bibSource).toBe("OpenAlex W1 , note = pwned");
        });

        it("drops a malformed DOI from every source's answer and BibTeX", async function () {
            const title = "Robust Things";
            const evil = "10.5555/x}, note = {pwned";
            // OpenAlex
            stubFetch(() => ({
                status: 200,
                body: {
                    results: [
                        {
                            ...openAlexWork({ title, year: 2021, source: "Nature" }),
                            doi: `https://doi.org/${evil}`,
                        },
                    ],
                },
            }));
            let match = await tryOpenAlex(preprint(title, "2021"));
            expect(match.venue).toBe("Nature");
            expect(match.doi).toBeUndefined();
            expect(match.bibtex).not.toMatch(/pwned/);
            // Semantic Scholar (also its URL in bibSource)
            stubFetch(() => ({
                status: 200,
                body: {
                    data: [
                        {
                            title,
                            year: 2021,
                            venue: "ICML",
                            authors: [{ name: "A B" }],
                            externalIds: { DOI: evil },
                            url: "https://s2/x}\n@misc{y,",
                        },
                    ],
                },
            }));
            match = await trySemanticScholar(preprint(title, "2021"));
            expect(match.venue).toBe("ICML");
            expect(match.doi).toBeUndefined();
            expect(match.bibtex).not.toMatch(/pwned|@misc\{y/);
            // DBLP (also its record URL, the source of a citation key)
            stubFetch(() =>
                sparql({
                    ...dblpRecord({
                        title,
                        venue: "ICML",
                        year: "2021",
                        rec: "conf/icml/X21},evil",
                    }),
                    doi: { value: `https://doi.org/${evil}` },
                }),
            );
            match = await tryDBLP(preprint(title, "2021"));
            expect(match.venue).toBe("ICML");
            expect(match.doi).toBeUndefined();
            expect(match.citationKey).toBeUndefined();
            expect(match.bibtex).not.toMatch(/pwned|\},evil/);
            // a valid DOI is kept
            stubFetch(() =>
                sparql({
                    ...dblpRecord({ title, venue: "ICML", year: "2021" }),
                    doi: { value: "https://doi.org/10.5555/3045390.3045467" },
                }),
            );
            match = await tryDBLP(preprint(title, "2021"));
            expect(match.doi).toBe("10.5555/3045390.3045467");
            expect(bibtexToObject(match.bibtex).doi).toBe("10.5555/3045390.3045467");
        });
    });

    it("encodes titles with & ? # in every request", async function () {
        const title = "Q&A: what? #1 results";
        stubFetch(() => ({ status: 200, body: {} }));
        const paper = preprint(title, "2020");
        await tryCrossRef(paper);
        await trySemanticScholar(paper);
        await tryOpenAlex(paper);
        await tryDBLP(paper);
        const params = requests.map((url) => [...new URL(url).searchParams.entries()]);
        expect(params[0]).toContainEqual(["query.title", title]);
        expect(params[1]).toContainEqual(["query", title]);
        expect(params[2]).toContainEqual(["filter", `title.search:${title}`]);
        expect(params[3][0][1]).toContain('"qawhat1results"');
    });
});

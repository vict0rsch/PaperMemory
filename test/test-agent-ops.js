import { expect } from "expect";
import { bibtexToString } from "@pmu/bibtexParser.js";
import {
    validateArgs,
    normalizeTags,
    projectTag,
    paperSummary,
    searchPapers,
    projectPapers,
    exportBibtex,
    listTags,
    countPapers,
    mergeTags,
    appendNote,
    appendAddedBy,
    flagForDeletion,
    makeProvenance,
    isOwnAddition,
    checkRate,
} from "@pmu/agentOps.js";

const projectHash = "ab".repeat(32);
const otherProjectHash = "cd".repeat(32);

const makePaper = (n, fields = {}) => ({
    id: `Arxiv-2101.0000${n}`,
    source: "arxiv",
    title: `Paper ${n}`,
    author: "Jane Doe and John Smith",
    year: "2021",
    venue: "",
    tags: [],
    note: "",
    pdfLink: `https://arxiv.org/pdf/2101.0000${n}.pdf`,
    codeLink: "",
    bibtex: `@article{doe2021paper${n},\n  title = {Paper ${n}},\n  author = {Doe, Jane},\n  year = {2021}\n}`,
    addDate: `2021-01-0${n}T00:00:00.000Z`,
    lastOpenDate: `2021-02-0${n}T00:00:00.000Z`,
    ...fields,
});

// 4 papers: 3 in the Project (added 3rd, 1st and 2nd), 1 in another Project
const makePapers = () => ({
    __dataVersion: 10000,
    "Arxiv-2101.00001": makePaper(1, {
        title: "Attention Is All You Need",
        tags: ["nlp", "review"],
        note: "seminal",
        addDate: "2021-01-03T00:00:00.000Z",
        projectHashes: [projectHash],
    }),
    "Arxiv-2101.00002": makePaper(2, {
        title: "Graph Attention Networks",
        tags: ["gnn"],
        addDate: "2021-01-01T00:00:00.000Z",
        projectHashes: [otherProjectHash, projectHash],
    }),
    "Arxiv-2101.00003": makePaper(3, {
        title: "Deep Residual Learning",
        tags: ["nlp", "vision"],
        bibtex: "",
        addDate: "2021-01-02T00:00:00.000Z",
        projectHashes: [projectHash],
    }),
    "Arxiv-2101.00004": makePaper(4, {
        title: "Unrelated Work",
        tags: ["nlp"],
        projectHashes: [otherProjectHash],
    }),
});

const ids = (result) => result.papers.map((p) => p.id);

describe("agentOps.js", () => {
    describe("#validateArgs", () => {
        const id = "Arxiv-2101.00001";
        const longNoteId = "Arxiv-2101.00009";
        const papers = {
            __dataVersion: 10000,
            [id]: makePaper(1),
            [longNoteId]: makePaper(9, { note: "x".repeat(19600) }),
        };
        const valid = {
            hello: {},
            pair: { clientName: "Claude Code" },
            search_papers: { query: "attention", limit: 20, offset: 0 },
            get_paper: { id },
            list_tags: {},
            add_paper: {
                url: "https://arxiv.org/abs/1706.03762",
                tags: ["nlp"],
                reason: "Cited in the related work",
                note: "Read section 3",
            },
            get_project_info: {},
            attach_paper: { id },
            list_project_papers: { limit: 50, offset: 10 },
            export_bibtex: {},
            add_tags: { id, tags: ["to-read"] },
            append_note: { id, text: "Key result in Table 2" },
            flag_for_deletion: { id, reason: "Duplicate of the published version" },
            delete_paper: { id },
        };
        const add = (fields) => ({ ...valid.add_paper, ...fields });
        // "https://example.org/" is 20 characters long
        const longUrl = (n) => "https://example.org/" + "x".repeat(n - 20);
        const manyTags = (n) => Array.from({ length: n }, (_, i) => `tag-${i}`);

        for (const [op, args] of Object.entries(valid)) {
            it(`accepts valid ${op} arguments`, () => {
                expect(validateArgs(op, args, papers)).toBeNull();
            });
        }

        it("accepts missing arguments for operations without arguments", () => {
            expect(validateArgs("list_tags", undefined, papers)).toBeNull();
        });

        it("returns errors as {code, message}", () => {
            expect(validateArgs("add_paper", add({ projectKey: "x" }), papers)).toEqual(
                {
                    code: "bad-args",
                    message: expect.any(String),
                },
            );
        });

        // [case, op, args, expected error code (null: valid)]
        const cases = [
            ["an unknown operation", "drop_library", {}, "unknown-op"],
            ["an inherited property as operation", "constructor", {}, "unknown-op"],
            ["an unknown argument", "add_paper", add({ projectKey: "x" }), "bad-args"],
            ["an argument it does not take", "hello", { libraryId: "x" }, "bad-args"],
            [
                "a missing argument",
                "add_paper",
                { url: longUrl(30), tags: [] },
                "bad-args",
            ],
            ["arguments that are not an object", "get_paper", [id], "bad-args"],
            // url
            ["an http url", "add_paper", add({ url: "http://arxiv.org/abs/1" }), null],
            [
                "a javascript: url",
                "add_paper",
                add({ url: "javascript:alert(1)" }),
                "bad-args",
            ],
            ["a file: url", "add_paper", add({ url: "file:///etc/hosts" }), "bad-args"],
            [
                "a url without scheme",
                "add_paper",
                add({ url: "arxiv.org/abs/1" }),
                "bad-args",
            ],
            ["a 2048-character url", "add_paper", add({ url: longUrl(2048) }), null],
            [
                "a 2049-character url",
                "add_paper",
                add({ url: longUrl(2049) }),
                "bad-args",
            ],
            // a DOI instead of a url
            [
                "a doi.org url",
                "add_paper",
                add({ url: "https://doi.org/10.1109/TMTT.2018.2840982" }),
                null,
            ],
            [
                "a doi: DOI",
                "add_paper",
                add({ url: "doi:10.1109/TMTT.2018.2840982" }),
                null,
            ],
            [
                "a bare DOI",
                "add_paper",
                add({ url: "10.1109/TMTT.2018.2840982" }),
                null,
            ],
            [
                "a doi: that is not a DOI",
                "add_paper",
                add({ url: "doi:javascript:alert(1)" }),
                "bad-args",
            ],
            ["a bare DOI prefix", "add_paper", add({ url: "10.1109" }), "bad-args"],
            [
                "a DOI longer than 2048 characters",
                "add_paper",
                add({ url: `10.1109/${"x".repeat(2041)}` }),
                "bad-args",
            ],
            // query, limit, offset
            [
                "a 256-character query",
                "search_papers",
                { query: "a".repeat(256) },
                null,
            ],
            [
                "a 257-character query",
                "search_papers",
                { query: "a".repeat(257) },
                "bad-args",
            ],
            ["limit 1", "search_papers", { query: "", limit: 1 }, null],
            ["limit 50", "list_project_papers", { limit: 50 }, null],
            ["limit 0", "search_papers", { query: "", limit: 0 }, "bad-args"],
            ["limit 51", "list_project_papers", { limit: 51 }, "bad-args"],
            [
                "a non-integer limit",
                "search_papers",
                { query: "", limit: 2.5 },
                "bad-args",
            ],
            ["offset 0", "list_project_papers", { offset: 0 }, null],
            ["offset -1", "search_papers", { query: "", offset: -1 }, "bad-args"],
            // reason
            ["a 1-character reason", "add_paper", add({ reason: "x" }), null],
            [
                "a 500-character reason",
                "add_paper",
                add({ reason: "x".repeat(500) }),
                null,
            ],
            ["an empty reason", "add_paper", add({ reason: "" }), "bad-args"],
            [
                "a 501-character reason",
                "add_paper",
                add({ reason: "x".repeat(501) }),
                "bad-args",
            ],
            // note, text and the note total
            [
                "a 2000-character note",
                "add_paper",
                add({ note: "x".repeat(2000) }),
                null,
            ],
            [
                "a 2001-character note",
                "add_paper",
                add({ note: "x".repeat(2001) }),
                "bad-args",
            ],
            [
                "a 2000-character text",
                "append_note",
                { id, text: "x".repeat(2000) },
                null,
            ],
            [
                "a 2001-character text",
                "append_note",
                { id, text: "x".repeat(2001) },
                "bad-args",
            ],
            [
                "a note reaching 20000 characters",
                "append_note",
                { id: longNoteId, text: "x".repeat(399) },
                null,
            ],
            [
                "a note exceeding 20000 characters",
                "append_note",
                { id: longNoteId, text: "x".repeat(400) },
                "bad-args",
            ],
            [
                "a deletion flag reaching 20000 note characters",
                "flag_for_deletion",
                { id: longNoteId, reason: "x".repeat(387) },
                null,
            ],
            [
                "a deletion flag exceeding 20000 note characters",
                "flag_for_deletion",
                { id: longNoteId, reason: "x".repeat(388) },
                "bad-args",
            ],
            // clientName
            [
                "a 64-character client name",
                "pair",
                { clientName: "x".repeat(64) },
                null,
            ],
            [
                "a 64-character client name and control characters",
                "pair",
                { clientName: "x".repeat(64) + "\n\u0007" },
                null,
            ],
            [
                "a 65-character client name",
                "pair",
                { clientName: "x".repeat(65) },
                "bad-args",
            ],
            ["an empty client name", "pair", { clientName: "" }, "bad-args"],
            [
                "a client name of control characters only",
                "pair",
                { clientName: "\u0000\u001b" },
                "bad-args",
            ],
            ["a client name of spaces only", "pair", { clientName: "   " }, "bad-args"],
            [
                "a client name of invisible characters and spaces only",
                "pair",
                { clientName: "​ ⁣ ‮" },
                "bad-args",
            ],
            // id
            ["a 256-character id", "get_paper", { id: "x".repeat(256) }, "not-found"],
            ["a 257-character id", "get_paper", { id: "x".repeat(257) }, "bad-args"],
            ["an unknown id", "delete_paper", { id: "Arxiv-0000.00000" }, "not-found"],
            ["the __dataVersion id", "get_paper", { id: "__dataVersion" }, "not-found"],
            [
                "an inherited property as id",
                "attach_paper",
                { id: "constructor" },
                "not-found",
            ],
            // tags
            ["20 tags", "add_tags", { id, tags: manyTags(20) }, null],
            ["21 tags", "add_tags", { id, tags: manyTags(21) }, "bad-args"],
            [
                "21 tags, 2 of them empty",
                "add_tags",
                { id, tags: [...manyTags(19), "", " "] },
                null,
            ],
            ["a 64-character tag", "add_paper", add({ tags: ["x".repeat(64)] }), null],
            [
                "a 64-character tag and spaces",
                "add_paper",
                add({ tags: [` ${"x".repeat(64)} `] }),
                null,
            ],
            [
                "a 65-character tag",
                "add_paper",
                add({ tags: ["x".repeat(65)] }),
                "bad-args",
            ],
            ["a proj-x tag", "add_paper", add({ tags: ["proj-x"] }), "bad-args"],
            [
                "a proj-x tag and spaces",
                "add_tags",
                { id, tags: [" proj-x"] },
                "bad-args",
            ],
            ["a my-proj-x tag", "add_tags", { id, tags: ["my-proj-x"] }, "bad-args"],
            ["a PROJ-X tag", "add_paper", add({ tags: ["PROJ-X"] }), "bad-args"],
            ["a project tag", "add_tags", { id, tags: ["project"] }, null],
            ["a projx tag", "add_tags", { id, tags: ["projx"] }, null],
            // look-alikes of proj-, the Project tags' prefix
            ...[
                ["U+2010 hyphen", "proj‐x"],
                ["U+2011 non-breaking hyphen", "proj‑x"],
                ["U+2212 minus", "proj−x"],
                ["en dash", "proj–x"],
                ["fullwidth hyphen-minus", "proj－x"],
                ["fullwidth letters", "ｐｒｏｊ-x"],
                ["underscore", "proj_x"],
                ["space", "proj x"],
                ["no-break space", "proj x"],
                ["Cyrillic je", "proј-x"],
                ["Greek rho", "ρroj-x"],
                ["Cyrillic er", "рroj-x"],
                ["Cyrillic o", "prоj-x"],
                ["Greek omicron", "prοj-x"],
                ["Greek yot", "proϳ-x"],
                ["dotless j", "proȷ-x"],
                ["small capitals", "ᴘʀᴏᴊ-x"],
                ["capital Cyrillic er", "РROJ-X"],
            ].map(([name, tag]) => [
                `a proj- look-alike (${name})`,
                "add_tags",
                { id, tags: [tag] },
                "bad-args",
            ]),
            // Greek or Cyrillic letters elsewhere
            ["a β-VAE tag", "add_tags", { id, tags: ["β-VAE"] }, null],
            ["a µP tag (micro sign)", "add_tags", { id, tags: ["µP"] }, null],
            [
                "an α-divergence tag",
                "add_tags",
                { id, tags: ["α-divergence"] },
                null,
            ],
            ["a ρroj tag (no separator)", "add_tags", { id, tags: ["ρroj"] }, null],
            ["a Greek tag", "add_tags", { id, tags: ["αβγ"] }, null],
            [
                "a Cyrillic tag",
                "add_tags",
                { id, tags: ["обзор"] },
                null,
            ],
            [
                "a tag with spaces and accents",
                "add_tags",
                { id, tags: ["deep learning été"] },
                null,
            ],
            [
                'a "><style>x</style> tag',
                "add_paper",
                add({ tags: ['"><style>x</style>'] }),
                "bad-args",
            ],
            ...[..."<>\"'`&,"].map((char) => [
                `a tag with ${char}`,
                "add_tags",
                { id, tags: [`a${char}b`] },
                "bad-args",
            ]),
            [
                "a tag with a control character",
                "add_tags",
                { id, tags: ["a\u0007b"] },
                "bad-args",
            ],
            [
                "a tag with a right-to-left override",
                "add_tags",
                { id, tags: ["a‮b"] },
                "bad-args",
            ],
            [
                "a tag blank once invisible characters are removed",
                "add_tags",
                { id, tags: ["​⁠"] },
                "bad-args",
            ],
            ["a tag that is not a string", "add_tags", { id, tags: [1] }, "bad-args"],
            ["tags that are not a list", "add_paper", add({ tags: "nlp" }), "bad-args"],
        ];
        for (const [name, op, args, code] of cases) {
            it(`${op} with ${name} → ${code ?? "valid"}`, () => {
                expect(validateArgs(op, args, papers)?.code ?? null).toBe(code);
            });
        }
    });

    describe("#normalizeTags, #mergeTags", () => {
        it("trims tags and drops empty ones", () => {
            expect(normalizeTags([" nlp ", "", "  ", "gnn"])).toEqual(["nlp", "gnn"]);
        });

        it("appends only new tags", () => {
            expect(mergeTags(["nlp", "review"], ["review", "gnn"])).toEqual([
                "nlp",
                "review",
                "gnn",
            ]);
        });
    });

    describe("#projectTag", () => {
        const hash = "0123456789abcdef".repeat(4);

        it("slugs the label", () => {
            expect(projectTag("Graph Neural Nets: Survey (2024)", hash, [])).toBe(
                "proj-graph-neural-nets-survey-2024",
            );
        });

        it("keeps at most 40 slug characters, without a trailing -", () => {
            expect(projectTag("x".repeat(39) + " yz", hash, [])).toBe(
                "proj-" + "x".repeat(39),
            );
        });

        it("uses the first 8 hex of the hash for an empty slug", () => {
            expect(projectTag("日本語 !", hash, [])).toBe("proj-01234567");
        });

        it("appends 4 hex of the hash when another Project uses the tag", () => {
            expect(projectTag("Demo", hash, ["proj-demo"])).toBe("proj-demo-0123");
        });

        it("grows the suffix past one collision", () => {
            expect(projectTag("Demo", hash, ["proj-demo", "proj-demo-0123"])).toBe(
                "proj-demo-012345",
            );
        });
    });

    describe("#paperSummary", () => {
        it("has no ids or hashes from Provenance", async () => {
            const auth = {
                clientId: "client-id-1",
                sessionId: "session-id-1",
                projectKey: "project-key-1",
            };
            const paper = makePaper(1, {
                projectHashes: [projectHash],
                provenance: await makeProvenance(auth, {
                    clientName: "Claude Code",
                    projectLabel: "Demo",
                    reason: "Cited in the intro",
                }),
            });
            const summary = paperSummary(paper);
            expect(Object.keys(summary).sort()).toEqual(
                [
                    "id",
                    "title",
                    "author",
                    "year",
                    "venue",
                    "tags",
                    "url",
                    "pdfLink",
                    "addDate",
                    "codeLink",
                    "provenance",
                ].sort(),
            );
            expect(summary.provenance).toEqual({
                clientName: "Claude Code",
                addedAt: paper.provenance.addedAt,
                reason: "Cited in the intro",
                projectLabel: "Demo",
            });
            const json = JSON.stringify(summary);
            for (const value of [
                paper.provenance.clientId,
                paper.provenance.sessionHash,
                paper.provenance.projectHash,
                projectHash,
            ]) {
                expect(json).not.toContain(value);
            }
        });

        it("gives when a released Provenance was released, still without ids or hashes", () => {
            const released = {
                clientName: "Claude Code",
                addedAt: "2026-01-01T00:00:00.000Z",
                reason: "Cited in the intro",
                releasedAt: "2026-01-02T00:00:00.000Z",
            };
            const summary = paperSummary(makePaper(1, { provenance: released }));
            expect(summary.provenance).toEqual(released);
        });

        it("links the abstract page and omits a missing Provenance", () => {
            const summary = paperSummary(makePaper(1));
            expect(summary.url).toBe("https://arxiv.org/abs/2101.00001");
            expect(summary).not.toHaveProperty("provenance");
        });
    });

    describe("reads", () => {
        it("never return or count __dataVersion", () => {
            const papers = makePapers();
            const all = searchPapers(papers, { query: "", limit: 50 });
            expect(all.total).toBe(4);
            expect(ids(all).some((id) => id.startsWith("__"))).toBe(false);
            expect(searchPapers(papers, { query: "__dataversion" }).total).toBe(0);
            expect(countPapers(papers)).toBe(4);
            expect(listTags(papers).tags.map((t) => t.tag)).not.toContain(
                "__dataVersion",
            );
        });

        it("search matches every word, most recently opened first, paginated", () => {
            const papers = makePapers();
            expect(ids(searchPapers(papers, { query: "Attention" }))).toEqual([
                "Arxiv-2101.00002",
                "Arxiv-2101.00001",
            ]);
            expect(ids(searchPapers(papers, { query: "nlp seminal" }))).toEqual([
                "Arxiv-2101.00001",
            ]);
            const page = searchPapers(papers, { query: "", limit: 2, offset: 1 });
            expect(page.total).toBe(4);
            expect(ids(page)).toEqual(["Arxiv-2101.00003", "Arxiv-2101.00002"]);
        });

        it("lists tags by name with their paper counts", () => {
            expect(listTags(makePapers())).toEqual({
                tags: [
                    { tag: "gnn", count: 1 },
                    { tag: "nlp", count: 3 },
                    { tag: "review", count: 1 },
                    { tag: "vision", count: 1 },
                ],
            });
        });

        it("lists and counts a Project's papers, oldest addition first", () => {
            const papers = makePapers();
            const listed = projectPapers(papers, projectHash);
            expect(listed.total).toBe(3);
            expect(ids(listed)).toEqual([
                "Arxiv-2101.00002",
                "Arxiv-2101.00003",
                "Arxiv-2101.00001",
            ]);
            expect(
                ids(projectPapers(papers, projectHash, { limit: 1, offset: 1 })),
            ).toEqual(["Arxiv-2101.00003"]);
            expect(countPapers(papers, projectHash)).toBe(3);
            expect(countPapers(papers, otherProjectHash)).toBe(2);
        });
    });

    describe("#exportBibtex", () => {
        it("exports like the export by tag and lists the papers it skips", () => {
            const papers = makePapers();
            papers["Arxiv-2101.00001"].bibtex = "not bibtex";
            papers["Arxiv-2101.00005"] = makePaper(5, { projectHashes: [projectHash] });
            expect(exportBibtex(papers, projectHash)).toEqual({
                count: 2,
                bibtex: [papers["Arxiv-2101.00002"], papers["Arxiv-2101.00005"]]
                    .map((p) => bibtexToString(p.bibtex))
                    .join("\n"),
                skipped: ["Arxiv-2101.00003", "Arxiv-2101.00001"],
            });
        });

        it("answers too-large above 900,000 bytes", () => {
            const papers = makePapers();
            const title = "x".repeat(900000);
            papers["Arxiv-2101.00002"].bibtex =
                `@article{big,\n  title = {${title}}\n}`;
            expect(exportBibtex(papers, projectHash)).toEqual({
                code: "too-large",
                message: expect.any(String),
            });
        });
    });

    describe("#appendNote, #appendAddedBy, #flagForDeletion", () => {
        it("appends to the note without replacing it", () => {
            const paper = appendNote(makePaper(1, { note: "mine" }), "agent text");
            expect(paper.note).toBe("mine\nagent text");
            // an empty note: the text alone, no blank first line
            expect(appendNote(makePaper(2), "agent text").note).toBe("agent text");
        });

        it("appends who added the paper and why, while the note stays within 20,000 characters", () => {
            const provenance = {
                clientName: "Claude Code",
                reason: "Cited in the intro",
            };
            const line = "Added by Claude Code: Cited in the intro";
            const paper = makePaper(1, { note: "Published @ NeurIPS (2021)" });
            expect(appendAddedBy(paper, provenance)).toBe(true);
            expect(paper.note).toBe(`Published @ NeurIPS (2021)\n${line}`);
            // an empty note: the line alone, no blank line before it
            const empty = makePaper(4);
            expect(appendAddedBy(empty, provenance)).toBe(true);
            expect(empty.note).toBe(line);
            // exactly full, then one character too many: left out
            const full = makePaper(2, { note: "x".repeat(20000 - 1 - line.length) });
            expect(appendAddedBy(full, provenance)).toBe(true);
            expect(full.note.length).toBe(20000);
            const over = makePaper(3, { note: "x".repeat(20000 - line.length) });
            expect(appendAddedBy(over, provenance)).toBe(false);
            expect(over.note).toBe("x".repeat(20000 - line.length));
        });

        it("adds to-delete once and appends the reason to the note", () => {
            const paper = makePaper(1, { tags: ["nlp", "to-delete"], note: "mine" });
            flagForDeletion(paper, "Duplicate");
            expect(paper.tags).toEqual(["nlp", "to-delete"]);
            expect(paper.note).toBe("mine\n[to-delete] Duplicate");
            expect(flagForDeletion(makePaper(2), "Duplicate").note).toBe(
                "[to-delete] Duplicate",
            );
        });
    });

    describe("#makeProvenance, #isOwnAddition", () => {
        const fields = {
            clientName: "Claude Code",
            projectLabel: "Demo",
            reason: "Why",
        };
        const auth = (clientId, sessionId, projectKey) => ({
            clientId,
            sessionId,
            ...(projectKey && { projectKey }),
        });
        const addedBy = async (by) => ({
            provenance: await makeProvenance(by, fields),
        });

        it("stores SHA-256 hashes, never the session id or Project key", async () => {
            const provenance = await makeProvenance(auth("c1", "abc", "key-1"), fields);
            expect(provenance).toEqual({
                clientId: "c1",
                clientName: "Claude Code",
                // SHA-256("abc")
                sessionHash:
                    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                projectHash: expect.stringMatching(/^[0-9a-f]{64}$/),
                projectLabel: "Demo",
                addedAt: expect.any(String),
                reason: "Why",
            });
            expect(new Date(provenance.addedAt).toISOString()).toBe(provenance.addedAt);
            expect(JSON.stringify(provenance)).not.toContain("key-1");
        });

        it("has no Project fields without a Project", async () => {
            const provenance = await makeProvenance(auth("c1", "s1"), fields);
            expect(provenance).not.toHaveProperty("projectHash");
            expect(provenance).not.toHaveProperty("projectLabel");
        });

        it("is true for the same client and Project in another session", async () => {
            const paper = await addedBy(auth("c1", "s1", "p1"));
            expect(await isOwnAddition(paper, auth("c1", "s2", "p1"))).toBe(true);
        });

        it("is false for another client in the same Project", async () => {
            const paper = await addedBy(auth("c1", "s1", "p1"));
            expect(await isOwnAddition(paper, auth("c2", "s1", "p1"))).toBe(false);
        });

        it("is false for the same client in another Project", async () => {
            const paper = await addedBy(auth("c1", "s1", "p1"));
            expect(await isOwnAddition(paper, auth("c1", "s1", "p2"))).toBe(false);
            expect(await isOwnAddition(paper, auth("c1", "s1"))).toBe(false);
        });

        it("without a Project, is true only in the same session", async () => {
            const paper = await addedBy(auth("c1", "s1"));
            expect(await isOwnAddition(paper, auth("c1", "s2"))).toBe(false);
            expect(await isOwnAddition(paper, auth("c1", "s1"))).toBe(true);
        });

        it("is false once the user released it, also for its client in its Project", async () => {
            const paper = await addedBy(auth("c1", "s1", "p1"));
            const by = auth("c1", "s1", "p1");
            expect(await isOwnAddition(paper, by)).toBe(true);
            // with or without the hashes a release drops (memoryQueue.js)
            const releasedAt = "2026-01-02T00:00:00.000Z";
            paper.provenance = { ...paper.provenance, releasedAt };
            expect(await isOwnAddition(paper, by)).toBe(false);
            const { clientName, addedAt, reason, projectLabel } = paper.provenance;
            paper.provenance = {
                clientName,
                addedAt,
                reason,
                projectLabel,
                releasedAt,
            };
            expect(await isOwnAddition(paper, by)).toBe(false);
        });

        it("is false for a paper without Provenance", async () => {
            expect(await isOwnAddition(makePaper(1), auth("c1", "s1", "p1"))).toBe(
                false,
            );
        });
    });

    describe("#checkRate", () => {
        it("refuses a 31st change within a minute", () => {
            const timestamps = [];
            const start = 1e6;
            for (let i = 0; i < 30; i++) {
                expect(checkRate(timestamps, start + i)).toBeNull();
            }
            expect(checkRate(timestamps, start + 30)).toEqual({
                code: "rate-limited",
                message: expect.any(String),
            });
            // the first change is now a minute old
            expect(checkRate(timestamps, start + 60000)).toBeNull();
            expect(checkRate(timestamps, start + 60000)?.code).toBe("rate-limited");
        });
    });
});

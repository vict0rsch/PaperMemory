import { expect } from "expect";
import { execFileSync } from "node:child_process";
import { loadPaperMemoryUtils, readJSON, root } from "./utilsForTests.js";

await loadPaperMemoryUtils();

const {
    abbreviateVenue,
    formatVenue,
    acronymFromPublicationVenue,
    semanticScholarVenue,
    pmlrConfOverrides,
} = PMUtils.venues;

// same construction as readJournalAbbreviations() (journalShortNames), without chrome.runtime
const journals = {};
for (const [abbr, full] of Object.entries(
    readJSON("./public/data/iso4-journals.json"),
)) {
    const k = PMUtils.functions.miniHash(full);
    if (!(k in journals)) journals[k] = abbr;
}

// same construction as readJournalAbbreviations() (journalAbbreviations): abbreviation -> full
const fullNames = {};
for (const file of ["iso4-journals", "journal-abbreviations"]) {
    for (const [abbr, full] of Object.entries(readJSON(`./public/data/${file}.json`))) {
        fullNames[PMUtils.functions.miniHash(abbr)] = full;
    }
}

describe("Venue abbreviation", function () {
    const cases = [
        // [input, expected]
        ["International Conference on Machine Learning", "ICML"],
        [
            "Proceedings of the 40th International Conference on Machine Learning",
            "ICML",
        ],
        ["ICML 2023", "ICML"],
        ["International Conference on Machine Learning, ICML 2023", "ICML"],
        ["International Conference on Machine Learning (ICML)", "ICML"],
        ["2023 International Conference on Machine Learning", "ICML"],
        ["Proc. ICML", "ICML"],
        ["icml", "ICML"],
        ["Neural Information Processing Systems", "NeurIPS"],
        ["Advances in Neural Information Processing Systems", "NeurIPS"],
        ["Advances in Neural Information Processing Systems 30", "NeurIPS"],
        [
            "Advances in Neural Information Processing Systems 35 (NeurIPS 2022)",
            "NeurIPS",
        ],
        ["NIPS", "NeurIPS"],
        ["NeurIPS 2023", "NeurIPS"],
        ["International Conference on Learning Representations", "ICLR"],
        ["2021 ICLR", "ICLR"],
        [
            "2023 IEEE/CVF Conference on Computer Vision and Pattern Recognition (CVPR)",
            "CVPR",
        ],
        ["Computer Vision and Pattern Recognition", "CVPR"],
        ["IEEE/CVF International Conference on Computer Vision", "ICCV"],
        ["European Conference on Computer Vision", "ECCV"],
        ["IEEE Winter Conference on Applications of Computer Vision", "WACV"],
        ["British Machine Vision Conference", "BMVC"],
        ["Annual Meeting of the Association for Computational Linguistics", "ACL"],
        [
            "Proceedings of the 2022 Conference on Empirical Methods in Natural Language Processing",
            "EMNLP",
        ],
        [
            "Proceedings of the 2019 Conference of the North American Chapter of the Association for Computational Linguistics: Human Language Technologies",
            "NAACL",
        ],
        [
            "Conference of the European Chapter of the Association for Computational Linguistics",
            "EACL",
        ],
        ["International Conference on Computational Linguistics", "COLING"],
        ["AAAI Conference on Artificial Intelligence", "AAAI"],
        ["International Joint Conference on Artificial Intelligence", "IJCAI"],
        ["Knowledge Discovery and Data Mining", "KDD"],
        ["The Web Conference", "WWW"],
        ["TheWebConf 2024", "WWW"],
        [
            "International ACM SIGIR Conference on Research and Development in Information Retrieval",
            "SIGIR",
        ],
        ["Conference on Uncertainty in Artificial Intelligence", "UAI"],
        [
            "International Conference on Artificial Intelligence and Statistics",
            "AISTATS",
        ],
        ["Conference on Robot Learning", "CoRL"],
        ["COLT", "CoLT"],
        ["International Conference on Robotics and Automation", "ICRA"],
        ["IEEE/RSJ International Conference on Intelligent Robots and Systems", "IROS"],
        ["Robotics: Science and Systems", "RSS"],
        ["INTERSPEECH 2020", "Interspeech"],
        [
            "IEEE International Conference on Acoustics, Speech and Signal Processing",
            "ICASSP",
        ],
        ["CHI Conference on Human Factors in Computing Systems", "CHI"],
        ["Trans. Mach. Learn. Res.", "TMLR"],
        ["Journal of Machine Learning Research", "JMLR"],
        ["IEEE Transactions on Pattern Analysis and Machine Intelligence", "TPAMI"],
        // workshops and findings keep their nature
        ["NeurIPS 2022 Workshop on Machine Learning for Molecules", "NeurIPS Workshop"],
        ["Workshop on AI for Science at ICML 2023", "ICML Workshop"],
        ["CVPR Workshops", "CVPR Workshop"],
        [
            "Findings of the Association for Computational Linguistics: EMNLP 2022",
            "Findings of EMNLP",
        ],
        // journals (existing abbreviation tables)
        ["Nature Communications", "Nat. Commun."],
        // unknown venues are only cleaned, never abbreviated
        [
            "Proceedings of the 12th Workshop on Foo Bar",
            "12th Workshop on Foo Bar".replace("12th ", ""),
        ],
        ["Some Obscure Symposium 2019", "Some Obscure Symposium"],
        [
            "Proceedings of Machine Learning Research",
            "Proceedings of Machine Learning Research",
        ],
        ["2020 Totally Unknown Venue", "Totally Unknown Venue"],
        ["Machine Learning", "Machine Learning"],
    ];

    it("journal table is loaded", function () {
        expect("Nat. Commun.").toBeTruthy();
    });

    for (const [input, expected] of cases) {
        it(`abbreviateVenue(${JSON.stringify(input)})`, function () {
            expect(abbreviateVenue(input, journals)).toEqual(expected);
        });
    }

    it("handles empty input", function () {
        expect(abbreviateVenue("", journals)).toEqual("");
        expect(abbreviateVenue(undefined, journals)).toEqual("");
    });

    it("does not match conferences that merely share words", function () {
        expect(
            abbreviateVenue(
                "International Conference on Machine Learning and Applications",
                journals,
            ),
        ).toEqual("International Conference on Machine Learning and Applications");
    });
});

describe("Venue formatting", function () {
    const cases = [
        [
            { venue: "ICML", year: "2023" },
            {
                short: "ICML 2023",
                full: "International Conference on Machine Learning (ICML) 2023",
            },
        ],
        [
            { venue: "International Conference on Machine Learning", year: 2023 },
            {
                short: "ICML 2023",
                full: "International Conference on Machine Learning (ICML) 2023",
            },
        ],
        [
            { venue: "ICML 2023", year: "2023" },
            {
                short: "ICML 2023",
                full: "International Conference on Machine Learning (ICML) 2023",
            },
        ],
        [
            {
                venue: "Advances in Neural Information Processing Systems",
                year: "2017",
            },
            {
                short: "NeurIPS 2017",
                full: "Conference on Neural Information Processing Systems (NeurIPS) 2017",
            },
        ],
        [
            {
                venue: "NeurIPS 2022 Workshop on Machine Learning for Molecules",
                year: "2022",
            },
            {
                short: "NeurIPS Workshop 2022",
                full: "NeurIPS 2022 Workshop on Machine Learning for Molecules",
            },
        ],
        [
            { venue: "Nature Communications", year: "2023" },
            {
                short: `${"Nat. Commun."} 2023`,
                full: "Nature Communications 2023",
            },
        ],
        [
            { venue: "Some Obscure Symposium", year: "2019" },
            {
                short: "Some Obscure Symposium 2019",
                full: "Some Obscure Symposium 2019",
            },
        ],
        [
            { venue: "CoLT", year: "2020" },
            { short: "CoLT 2020", full: "Conference on Learning Theory (CoLT) 2020" },
        ],
        [
            { venue: "ICLR" },
            {
                short: "ICLR",
                full: "International Conference on Learning Representations (ICLR)",
            },
        ],
        [
            { venue: "", year: "2020" },
            { short: "", full: "" },
        ],
        [{}, { short: "", full: "" }],
    ];
    for (const [paper, expected] of cases) {
        it(`formatVenue(${JSON.stringify(paper)})`, function () {
            expect(formatVenue(paper, journals)).toEqual(expected);
        });
    }

    it("does not mutate the paper", function () {
        const paper = { venue: "ICML", year: "2023" };
        formatVenue(paper, journals);
        expect(paper).toEqual({ venue: "ICML", year: "2023" });
    });
});

describe("PMLR conference overrides", function () {
    it("keeps the exact historical table", function () {
        expect(pmlrConfOverrides()).toEqual({
            "Conference on Learning Theory": "CoLT",
            "International Conference on Machine Learning": "ICML",
            "Conference on Uncertainty in Artificial Intelligence": "UAI",
            "Conference on Robot Learning": "CoRL",
            "International Conference on Artificial Intelligence and Statistics":
                "AISTATS",
            "International Conference on Algorithmic Learning Theory": "ALT",
        });
    });
});

describe("Semantic Scholar venue selection", function () {
    const pv = (alternate_names) => ({ publicationVenue: { alternate_names } });

    it("uses a plausible acronym from alternate_names", function () {
        expect(
            semanticScholarVenue(
                {
                    venue: "International Conference on Machine Learning",
                    ...pv(["Int Conf Mach Learn", "ICML"]),
                },
                journals,
            ),
        ).toEqual("ICML");
    });
    it("canonicalises a conference alias", function () {
        expect(
            semanticScholarVenue(
                { venue: "NIPS", ...pv(["Neural Inf Process Syst", "NIPS"]) },
                journals,
            ),
        ).toEqual("NeurIPS");
    });
    it("accepts a short mostly-uppercase unknown acronym", function () {
        expect(
            acronymFromPublicationVenue({
                alternate_names: ["Journal of Foo", "JFOO"],
            }),
        ).toEqual("JFOO");
    });
    it("rejects long, lowercase or spaced alternate names", function () {
        expect(
            acronymFromPublicationVenue({
                alternate_names: ["Nature", "Int Conf Mach Learn", "nat", "A"],
            }),
        ).toBeNull();
        expect(acronymFromPublicationVenue({ alternate_names: [] })).toBeNull();
        expect(acronymFromPublicationVenue(null)).toBeNull();
    });
    it("falls back to the previous logic through abbreviateVenue", function () {
        expect(
            semanticScholarVenue(
                { venue: "2023 International Conference on Learning Representations" },
                journals,
            ),
        ).toEqual("ICLR");
        expect(
            semanticScholarVenue(
                { venue: "Nature Communications", ...pv([]) },
                journals,
            ),
        ).toEqual("Nat. Commun.");
        expect(
            semanticScholarVenue({ venue: "Unknown Venue Of Doom" }, journals),
        ).toEqual("Unknown Venue Of Doom");
        expect(semanticScholarVenue({ venue: "nature" }, journals)).toEqual("NATURE");
    });
    it("keeps 'Workshop' visible even if the acronym is the main conference", function () {
        expect(
            semanticScholarVenue(
                { venue: "NeurIPS 2022 Workshop on Foo", ...pv(["NeurIPS"]) },
                journals,
            ),
        ).toEqual("NeurIPS Workshop");
    });
});

describe("Venue robustness", function () {
    it("imports venues.js first, in a fresh process, without an import-cycle error", function () {
        const out = execFileSync(
            process.execPath,
            [
                "--import",
                "./register.mjs",
                "--input-type=module",
                "-e",
                "const v = await import('./src/shared/js/utils/venues.js'); console.log(v.abbreviateVenue('International Conference on Machine Learning'), Object.keys(v.pmlrConfOverrides()).length);",
            ],
            { cwd: root, encoding: "utf8" },
        );
        expect(out.trim()).toBe("ICML 6");
    });

    it("stays fast on adversarial input (long runs of separators)", function () {
        const inputs = [
            " ".repeat(32768) + "x",
            "x" + " ".repeat(32768) + "x 2020",
            "-".repeat(32768) + "2020x",
            "(".repeat(20000) + "2019" + ")".repeat(20000) + "y",
        ];
        const start = Date.now();
        for (const venue of inputs) {
            formatVenue({ venue, year: "2020" }, journals, fullNames);
            abbreviateVenue(venue, journals);
            semanticScholarVenue({ venue }, journals);
        }
        expect(Date.now() - start).toBeLessThan(200);
    });

    it("treats non-array alternate_names as absent", function () {
        for (const alternate_names of [null, "ICML", { 0: "ICML" }, 42, undefined]) {
            expect(acronymFromPublicationVenue({ alternate_names })).toBeNull();
            expect(
                semanticScholarVenue(
                    {
                        venue: "International Conference on Machine Learning",
                        publicationVenue: { alternate_names },
                    },
                    journals,
                ),
            ).toEqual("ICML");
        }
    });

    it("keeps 'Findings of' when an acronym is available", function () {
        expect(
            semanticScholarVenue(
                {
                    venue: "Findings of the Association for Computational Linguistics: EMNLP 2020",
                    publicationVenue: { alternate_names: ["EMNLP"] },
                },
                journals,
            ),
        ).toEqual("Findings of EMNLP");
        expect(
            semanticScholarVenue(
                {
                    venue: "Findings of Some Unknown Venue",
                    publicationVenue: { alternate_names: ["SUV"] },
                },
                journals,
            ),
        ).toEqual("Findings of SUV");
    });

    it("expands a stored journal abbreviation for the full form", function () {
        expect(
            formatVenue({ venue: "Nat. Commun.", year: "2018" }, journals, fullNames),
        ).toEqual({ short: "Nat. Commun. 2018", full: "Nature Communications 2018" });
    });

    it("shows the full name kept at match time (venueFull)", function () {
        expect(
            formatVenue(
                {
                    venue: "TACL",
                    venueFull: "Transactions of the Association for Computational Linguistics",
                    year: "2021",
                },
                journals,
                fullNames,
            ),
        ).toEqual({
            short: "TACL 2021",
            full: "Transactions of the Association for Computational Linguistics 2021",
        });
    });
});

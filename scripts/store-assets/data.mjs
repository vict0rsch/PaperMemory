// Seeded Memory and the BibMatcher sample for the store assets: real papers only, no personal data.
// The BibMatcher source answers are mocked (deterministic, no rate limits), as in the step-7 mockups.
import fs from "node:fs";

const ago = (h) => new Date(Date.now() - h * 3600e3).toJSON();
/** The papers of seed.json with the tags, notes and dates the frames show */
export const seedPapers = () => {
    const seed = JSON.parse(fs.readFileSync(new URL("seed.json", import.meta.url), "utf8"));
    const set = (id, patch) => (seed[id] = { ...seed[id], ...patch });
    set("Arxiv-1706.03762", { tags: ["transformers", "nlp", "reading-group"], favorite: true, note: "Key idea: attention only, no recurrence.", lastOpenDate: ago(2), count: 3 });
    set("Arxiv-1703.10593", { tags: ["gan", "vision", "image-translation"], favorite: true, note: "Re-read §3 (cycle consistency) before the reading group.\n\nWhy does the identity loss help on paintings?", codeLink: "https://github.com/junyanz/pytorch-CycleGAN-and-pix2pix", lastOpenDate: ago(5), count: 12 });
    set("Arxiv-2010.11929", { tags: ["transformers", "vision"], note: "Patch size 16, no conv stem", lastOpenDate: ago(26) });
    set("Arxiv-1412.6980", { tags: ["optimization", "reading-group"], lastOpenDate: ago(30) });
    set("Arxiv-1810.04805", { tags: ["transformers", "pretraining", "nlp"], lastOpenDate: ago(70) });
    set("Nature-2018_s41467-018-07210-0", { tags: ["time-series"], lastOpenDate: ago(75) });
    set("JMLR-2012_bergstra12a", { tags: ["optimization", "hyperparameters"], lastOpenDate: ago(100) });
    set("OR-ICLR-2022_xQUe1pOKPam", { tags: ["chemistry", "pretraining"], lastOpenDate: ago(120) });
    set("PMLR-2021-husain21a", { tags: ["reinforcement-learning", "theory"], lastOpenDate: ago(170) });
    return seed;
};
export const BIB = String.raw`@article{vaswani2017attention,
  title   = {Attention Is All You Need},
  author  = {Vaswani, Ashish and Shazeer, Noam and Parmar, Niki and Uszkoreit, Jakob and Jones, Llion and Gomez, Aidan N. and Kaiser, Lukasz and Polosukhin, Illia},
  journal = {arXiv preprint arXiv:1706.03762},
  year    = {2017}
}

@article{devlin2018bert,
  title   = {{BERT}: Pre-training of Deep Bidirectional Transformers for Language Understanding},
  author  = {Devlin, Jacob and Chang, Ming-Wei and Lee, Kenton and Toutanova, Kristina},
  journal = {arXiv preprint arXiv:1810.04805},
  year    = {2018}
}

@article{kingma2014adam,
  title   = {Adam: A Method for Stochastic Optimization},
  author  = {Kingma, Diederik P. and Ba, Jimmy},
  journal = {arXiv preprint arXiv:1412.6980},
  year    = {2014}
}

@article{hafner2023mastering,
  title   = {Mastering Diverse Domains through World Models},
  author  = {Hafner, Danijar and Pasukonis, Jurgis and Ba, Jimmy and Lillicrap, Timothy},
  journal = {arXiv preprint arXiv:2301.04104},
  year    = {2023}
}

@article{dosovitskiy2020image,
  title   = {An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale},
  author  = {Dosovitskiy, Alexey and Beyer, Lucas and Kolesnikov, Alexander},
  journal = {arXiv preprint arXiv:2010.11929},
  year    = {2020}
}

@article{hoffmann2022training,
  title   = {Training Compute-Optimal Large Language Models},
  author  = {Hoffmann, Jordan and Borgeaud, Sebastian and Mensch, Arthur},
  journal = {arXiv preprint arXiv:2203.15556},
  year    = {2022}
}

@inproceedings{he2016deep,
  title     = {Deep Residual Learning for Image Recognition},
  author    = {He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
  booktitle = {CVPR},
  year      = {2016}
}

@article{jumper2021highly,
  title   = {Highly accurate protein structure prediction with {AlphaFold}},
  author  = {Jumper, John and Evans, Richard and Pritzel, Alexander},
  journal = {Nature},
  year    = {2021}
}

@article{lin2022language,
  title   = {Language models of protein sequences at the scale of evolution enable accurate structure prediction},
  author  = {Lin, Zeming and Akin, Halil and Rao, Roshan},
  journal = {bioRxiv},
  year    = {2022},
  doi     = {10.1101/2022.07.20.500902}
}
`;

const key = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, "");
// DBLP (SPARQL): title key -> [venue, year, type, rec]
const DBLP = {
    [key("Attention Is All You Need")]: ["NeurIPS", "2017", "Inproceedings", "conf/nips/VaswaniSPUJGKP17"],
    [key("Adam: A Method for Stochastic Optimization")]: ["ICLR (Poster)", "2015", "Inproceedings", "journals/corr/KingmaB14"],
    [key("An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale")]: ["ICLR", "2021", "Inproceedings", "conf/iclr/DosovitskiyB0WZ21"],
};
const S2 = {
    [key("BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding")]: {
        venue: "North American Chapter of the Association for Computational Linguistics",
        year: 2019,
        doi: "10.18653/v1/N19-1423",
    },
};
// OpenAlex: title key -> [venue, year, source type]
const OA = {
    [key("Training Compute-Optimal Large Language Models")]: ["Neural Information Processing Systems", 2022, "conference"],
    [key("Language models of protein sequences at the scale of evolution enable accurate structure prediction")]: ["Science", 2023, "journal"],
};
let s2Calls = 0;
/** Before each BibMatcher run: Semantic Scholar answers once, then rate-limits (as in the mockups) */
export const resetMocks = () => (s2Calls = 0);

const answer = (url) => {
    const u = new URL(url);
    if (u.host === "sparql.dblp.org") {
        const k = decodeURIComponent(url).match(/"\) = "([a-z0-9]+)"/)?.[1];
        const hit = DBLP[k];
        const title = Object.keys(DBLP).includes(k) ? k : "";
        return {
            results: {
                bindings: hit
                    ? [{
                          p: { value: `https://dblp.org/rec/${hit[3]}` },
                          title: { value: BIB.match(new RegExp(`title\\s*=\\s*\\{(.*)\\},`, "g")).map((l) => l.replace(/^title\s*=\s*\{|\},$/g, "").replace(/[{}]/g, "")).find((t) => key(t) === title) },
                          venue: { value: hit[0] },
                          year: { value: hit[1] },
                          type: { value: `https://dblp.org/rdf/schema#${hit[2]}` },
                      }]
                    : [],
            },
        };
    }
    if (u.host === "api.semanticscholar.org") {
        const q = u.searchParams.get("query");
        const hit = S2[key(q)];
        s2Calls++;
        if (!hit && s2Calls > 1) return { __status: 429, message: "Too Many Requests" };
        return {
            data: hit
                ? [{ title: q.replace(/[{}]/g, ""), venue: hit.venue, year: hit.year, authors: [{ name: "Jacob Devlin" }], externalIds: { DOI: hit.doi }, url: "https://www.semanticscholar.org/paper/df2b0e26d0599ce3e70df8a9da02e51594e0e992", publicationVenue: { name: hit.venue, alternate_names: ["NAACL"] } }]
                : [],
        };
    }
    if (u.host === "api.crossref.org") return { status: "ok", message: { items: [] } };
    if (u.host === "api.openalex.org") {
        const q = decodeURIComponent(u.searchParams.get("filter")).replace(/^title\.search:/, "");
        const hit = OA[key(q)];
        return {
            results: hit
                ? [{ id: "https://openalex.org/W1", doi: hit[0] === "Science" ? "https://doi.org/10.1126/science.ade2574" : null, display_name: q, publication_year: hit[1], type: "article", primary_location: { source: { display_name: hit[0], type: hit[2] } } }]
                : [],
        };
    }
    return "";
};

const HOSTS = ["sparql.dblp.org", "api.semanticscholar.org", "api.crossref.org", "api.openalex.org"];
/** Answer the BibMatcher sources from the tables above, on a browser or service-worker CDP session */
export const intercept = async (session) => {
    await session.send("Fetch.enable", { patterns: HOSTS.map((h) => ({ urlPattern: `https://${h}/*` })) });
    session.on("Fetch.requestPaused", (e) => {
        const a = answer(e.request.url);
        const body = typeof a === "string" ? a : JSON.stringify(a);
        session
            .send("Fetch.fulfillRequest", {
                requestId: e.requestId,
                responseCode: a?.__status ?? 200,
                responseHeaders: [
                    { name: "content-type", value: "application/json" },
                    { name: "access-control-allow-origin", value: "*" },
                ],
                body: Buffer.from(body).toString("base64"),
            })
            .catch(() => {});
    });
};

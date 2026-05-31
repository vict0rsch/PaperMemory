// ============================================================================
// MANUAL TEST (cloakbrowser): Reset memory, open every urls.json source so
// PaperMemory can parse it inside a launched cloakbrowser instance, then
// verify what was actually parsed.
//
// This is the cloakbrowser-driven sibling of `manual-open-urls.js`: instead of
// being pasted into the extension's service-worker console (chrome.* APIs), it
// drives a real browser via the helpers in `browser.js` (puppeteer/cloakbrowser).
//
// HOW TO USE:
//   1. Build the extension: `npm run build:chrome`
//   2. Run: `node test/manual-open-urls-browser.js`
//
// WHAT IT DOES:
//   Phase 0 (reset):
//     - Launches a cloakbrowser instance with PaperMemory loaded
//     - Opens the extension popup page and wipes storage `papers`
//       (safe: this is a fresh, isolated browser profile, not your real memory)
//   Phase 1 (open):
//     - For each source, opens the URL in a new page and waits (via
//       `visitPaperPage`) for PaperMemory to store the paper
//     - On success: closes the page
//     - On timeout: LEAVES THE PAGE OPEN so you can inspect the failure
//   Phase 2 (verify):
//     - Reads `papers` from the extension popup page
//     - Logs found/missing tables
//     - Does NOT reopen missing URLs — their pages from phase 1 are still open
// ============================================================================

import {
    makeBrowser,
    visitPaperPage,
    getMemoryPapers,
    setStorage,
    findExtensionId,
    getPMURLs,
} from "./browser.js";
import { sleep } from "./utilsForTests.js";

// Restrict the run to specific sources (e.g. `new Set(["iop", "acm"])`).
// Leave empty to test every source in the `urls` list below.
const testOnly = new Set([]);

const headless = process.env.HEADLESS === "0" ? false : true; // default to true
console.log("headless :", headless);

const urls = [
    { source: "acl", url: "https://aclanthology.org/2020.acl-main.405" },
    {
        source: "aip",
        url: "https://pubs.aip.org/aip/aml/article/1/1/010901/2878738/Deep-language-models-for-interpretative-and?searchresult=1",
    },
    { source: "acm", url: "https://dl.acm.org/doi/10.5555/3491440.3491756" },
    { source: "acs", url: "https://pubs.acs.org/doi/10.1021/acs.jpca.9b00311" },
    {
        source: "aps",
        url: "https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.111.111101",
    },
    { source: "arxiv", url: "https://arxiv.org/abs/1703.10593" },
    {
        source: "biorxiv",
        url: "https://www.biorxiv.org/content/10.1101/2021.11.08.467690v2",
    },
    {
        source: "cell",
        url: "https://www.cell.com/cell/fulltext/S0092-8674(25)01089-X",
    },
    {
        source: "chemrxiv",
        url: "https://chemrxiv.org/engage/chemrxiv/article-details/65957d349138d231611ad8f7",
    },
    {
        source: "cvf",
        url: "https://openaccess.thecvf.com/content_CVPR_2020/html/Bhattacharjee_DUNIT_Detection-Based_Unsupervised_Image-to-Image_Translation_CVPR_2020_paper.html",
        idPrefix: "cvpr",
    },
    {
        source: "frontiers",
        url: "https://www.frontiersin.org/articles/10.3389/fpace.2022.892330/full",
    },
    { source: "hal", url: "https://hal.science/hal-03171076" },
    { source: "ijcai", url: "https://www.ijcai.org/proceedings/2020/1" },
    { source: "ieee", url: "https://ieeexplore.ieee.org/document/9090146" },
    { source: "ihep", url: "https://inspirehep.net/literature/2095720" },
    {
        source: "iop",
        url: "https://iopscience.iop.org/article/10.1149/2.1051908jes",
        idPrefix: "IOPscience",
    },
    { source: "jmlr", url: "https://www.jmlr.org/papers/v13/bergstra12a.html" },
    { source: "mdpi", url: "https://www.mdpi.com/2076-328X/13/12/961" },
    { source: "nature", url: "https://www.nature.com/articles/s41467-018-07210-0" },
    {
        source: "neurips",
        url: "https://proceedings.neurips.cc/paper/2019/hash/0118a063b4aae95277f0bc1752c75abf-Abstract.html",
    },
    {
        source: "openreview",
        url: "https://openreview.net/forum?id=xQUe1pOKPam",
        idPrefix: "or",
    },
    {
        source: "oup",
        url: "https://academic.oup.com/brain/article/147/3/743/7617466",
    },
    { source: "pmc", url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7249434" },
    { source: "pmlr", url: "https://proceedings.mlr.press/v130/husain21a.html" },
    {
        source: "wiley",
        url: "https://onlinelibrary.wiley.com/doi/abs/10.1002/acr2.11440",
    },
    {
        source: "pnas",
        url: "https://www.pnas.org/doi/full/10.1073/pnas.2114679118",
    },
    {
        source: "science",
        url: "https://science.org/doi/full/10.1126/scirobotics.abm6597",
    },
    {
        source: "sciencedirect",
        url: "https://www.sciencedirect.com/science/article/pii/S2589721721000349",
    },
    {
        source: "springer",
        url: "https://link.springer.com/article/10.1007/s41095-022-0271-y",
    },
    {
        source: "plos",
        url: "https://journals.plos.org/climate/article?id=10.1371/journal.pclm.0000068",
    },
    {
        source: "rsc",
        url: "https://pubs.rsc.org/en/content/articlelanding/2022/dd/d2dd00066k",
    },
].filter(({ source }) => testOnly.size === 0 || testOnly.has(source));

// Extra delay (ms) after `visitPaperPage` reports the page settled, before we
// re-read storage to decide success/failure.
const SETTLE_MS = 1000;

// Some sources tag papers with an id prefix that differs from the source
// name (e.g. openreview → `OR-...`). Everything else uses the source tag
// itself as the id prefix, case-insensitively.
const idPrefixFor = (target) => (target.idPrefix || target.source).toLowerCase();

const browser = await makeBrowser(true);
const extensionId = await findExtensionId(browser);
const { popupURL } = getPMURLs(extensionId);

// A dedicated PaperMemory extension page used to reset and read storage.
const pmPage = await browser.newPage();
await pmPage.goto(popupURL);

const getPaperCount = async () => {
    const papers = await getMemoryPapers(pmPage);
    return Object.keys(papers || {}).length;
};

const openOne = async (target, index, total) => {
    const { source, url } = target;
    const prevCount = await getPaperCount();
    console.log(`[${index + 1}/${total}] Opening ${source} (papers: ${prevCount})`);
    const page = await browser.newPage();

    const started = Date.now();
    await visitPaperPage(browser, url, { page, keepOpen: true, timeout: SETTLE_MS });
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const newCount = await getPaperCount();
    if (newCount > prevCount) {
        console.log(`  ✓ ${source} parsed in ${elapsed}s`);
        await page.close();
    } else {
        console.log(`  ✗ ${source} timed out after ${elapsed}s — leaving page open`);
    }
};

const openAll = async () => {
    console.log(`\n===== Phase 1: Opening ${urls.length} URLs =====`);
    for (let i = 0; i < urls.length; i++) {
        await openOne(urls[i], i, urls.length);
    }
    console.log("Open phase complete.\n");
};

const verify = async () => {
    const papers = await getMemoryPapers(pmPage);
    const papersList = Object.values(papers || {}).filter(
        (p) => p && typeof p === "object",
    );
    const found = [];
    const missing = [];

    for (const target of urls) {
        const { source, url } = target;
        const prefix = idPrefixFor(target);
        const match = papersList.find((p) => {
            const pid = (p.id || "").toLowerCase();
            return pid.startsWith(`${prefix}-`) || pid.startsWith(`${prefix}_`);
        });
        if (match) {
            found.push({ source, title: match.title.slice(0, 30), id: match.id });
        } else {
            missing.push({ source, url });
        }
    }

    console.log(`===== Phase 2: Verification =====`);
    console.log(`Total papers in storage: ${papersList.length}`);
    console.log(`Expected sources: ${urls.length}`);
    console.log(`Found: ${found.length}`);
    console.log(`Missing: ${missing.length}\n`);

    if (found.length > 0) {
        console.log(`✓ Found papers (${found.length}):`);
        console.table(found);
    }

    if (missing.length > 0) {
        console.log(`✗ Missing papers (${missing.length}):`);
        console.table(missing);
        console.log(
            "Pages for missing sources were left open in phase 1 — inspect them directly.",
        );
    } else {
        console.log(`✓ All sources were successfully parsed!`);
    }
};

await setStorage(pmPage, "papers", { __dataVersion: 1 });
console.log("Memory reset: extension storage `papers` cleared.");
await openAll();
await sleep(1000);
await verify();

// ============================================================================
// MANUAL TEST: Reset memory, open every urls.json source so PaperMemory can
// parse it, then verify what was actually parsed.
//
// HOW TO USE:
//   1. Run `npm run dev:watch` to start the dev browser with PaperMemory loaded
//   2. Open the extension's service worker DevTools (chrome://extensions →
//      PaperMemory → "Inspect views: service worker"). The options page
//      console also works.
//   3. Set `deleteMemory = true` at the top of this script (safety gate)
//   4. Copy-paste this entire script into the console and press Enter
//
// WHAT IT DOES:
//   Phase 1 (open):
//     - Wipes chrome.storage.local.papers (guarded by `deleteMemory` flag)
//     - For each source, opens the URL in a background tab and polls
//       chrome.storage.local until a new paper appears (or times out)
//     - On success: closes the tab
//     - On timeout: LEAVES THE TAB OPEN so you can inspect the failure
//   Phase 2 (verify):
//     - Reads chrome.storage.local.papers
//     - Logs found/missing tables
//     - Does NOT reopen missing URLs — their tabs from phase 1 are still open
//
// Safe in a service-worker console: no window-only APIs (no confirm/alert).
// ============================================================================

// Safety gate: set to true manually before pasting to confirm you really
// want to wipe chrome.storage.local.papers. Left false by default so an
// accidental paste never destroys your memory.
const deleteMemory = false;

// Test only specific sources
const testOnly = new Set(["iop"]);

if (!deleteMemory) {
    console.warn(
        "Aborted: `deleteMemory` is false. This script will reset ALL papers in chrome.storage.local. Set `const deleteMemory = true;` at the top of the script to proceed.",
    );
    throw new Error("Aborted: `deleteMemory` is false.");
}

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

const POLL_INTERVAL = 100;
const MAX_WAIT = 10_000;

// Some sources tag papers with an id prefix that differs from the source
// name (e.g. openreview → `OR-...`). Everything else uses the source tag
// itself as the id prefix, case-insensitively.
const idPrefixFor = (target) => (target.idPrefix || target.source).toLowerCase();

const getPaperCount = async () => {
    const data = await chrome.storage.local.get("papers");
    return Object.keys(data.papers || {}).length;
};

const waitForNewPaper = (prevCount, elapsed) =>
    new Promise((resolve) => {
        if (elapsed >= MAX_WAIT) {
            resolve(false);
            return;
        }
        setTimeout(() => {
            getPaperCount().then((count) => {
                if (count > prevCount) {
                    resolve(true);
                } else {
                    resolve(waitForNewPaper(prevCount, elapsed + POLL_INTERVAL));
                }
            });
        }, POLL_INTERVAL);
    });

const openOne = async (source, url, index, total) => {
    const prevCount = await getPaperCount();
    console.log(`[${index + 1}/${total}] Opening ${source} (papers: ${prevCount})`);
    const tab = await chrome.tabs.create({ url, active: false });

    const started = Date.now();
    const found = await waitForNewPaper(prevCount, 0);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    if (found) {
        console.log(`  ✓ ${source} parsed in ${elapsed}s`);
        await chrome.tabs.remove(tab.id);
        return;
    } else {
        console.log(
            `  ✗ ${source} timed out after ${elapsed}s — leaving tab ${tab.id} open`,
        );
        resolve();
    }
};

const openAll = async () => {
    console.log(`\n===== Phase 1: Opening ${urls.length} URLs =====`);
    for (let i = 0; i < urls.length; i++) {
        const target = urls[i];
        const { source, url } = target;
        await openOne(source, url, i, urls.length);
    }
    console.log("Open phase complete.\n");
};

const verify = async () => {
    const data = await chrome.storage.local.get("papers");
    const papersList = Object.values(data.papers || {});
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
            found.push({ source, title: match.title, id: match.id });
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
        console.log(
            `%c✓ Found papers (${found.length}):`,
            "color: green; font-weight: bold",
        );
        console.table(found);
    }

    if (missing.length > 0) {
        console.log(
            `%c✗ Missing papers (${missing.length}):`,
            "color: red; font-weight: bold",
        );
        console.table(missing);
        console.log(
            "Tabs for missing sources were left open in phase 1 — inspect them directly.",
        );
    } else {
        console.log(
            `%c✓ All sources were successfully parsed!`,
            "color: green; font-weight: bold; font-size: 14px",
        );
    }
};

const main = async () => {
    await chrome.storage.local.set({ papers: { __dataVersion: 1 } });
    console.log("Memory reset: chrome.storage.local.papers cleared.");
    await openAll();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await verify();
};

main();

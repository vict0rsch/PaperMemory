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
(() => {
    // Safety gate: set to true manually before pasting to confirm you really
    // want to wipe chrome.storage.local.papers. Left false by default so an
    // accidental paste never destroys your memory.
    const deleteMemory = false;
    if (!deleteMemory) {
        console.warn(
            "Aborted: `deleteMemory` is false. This script will reset ALL papers in chrome.storage.local. Set `const deleteMemory = true;` at the top of the script to proceed.",
        );
        return;
    }

    const urls = [
        ["acl", "https://aclanthology.org/2020.acl-main.405"],
        [
            "aip",
            "https://pubs.aip.org/aip/aml/article/1/1/010901/2878738/Deep-language-models-for-interpretative-and?searchresult=1",
        ],
        ["acm", "https://dl.acm.org/doi/10.5555/3491440.3491756"],
        ["acs", "https://pubs.acs.org/doi/10.1021/acs.jpca.9b00311"],
        ["aps", "https://journals.aps.org/prl/abstract/10.1103/PhysRevLett.128.171101"],
        ["arxiv", "https://arxiv.org/abs/1703.10593"],
        ["biorxiv", "https://www.biorxiv.org/content/10.1101/2021.11.08.467690v2"],
        ["cell", "https://www.cell.com/cell/fulltext/S0092-8674(25)01089-X"],
        [
            "chemrxiv",
            "https://chemrxiv.org/engage/chemrxiv/article-details/65957d349138d231611ad8f7",
        ],
        [
            "cvf",
            "https://openaccess.thecvf.com/content_CVPR_2020/html/Bhattacharjee_DUNIT_Detection-Based_Unsupervised_Image-to-Image_Translation_CVPR_2020_paper.html",
        ],
        [
            "frontiers",
            "https://www.frontiersin.org/articles/10.3389/fpace.2022.892330/full",
        ],
        ["hal", "https://hal.science/hal-03171076"],
        ["ijcai", "https://www.ijcai.org/proceedings/2020/1"],
        ["ieee", "https://ieeexplore.ieee.org/document/9090146"],
        ["ihep", "https://inspirehep.net/literature/2095720"],
        ["iop", "https://iopscience.iop.org/article/10.1149/2.1051908jes"],
        ["jmlr", "https://www.jmlr.org/papers/v13/bergstra12a.html"],
        ["mdpi", "https://www.mdpi.com/2076-328X/13/12/961"],
        ["nature", "https://www.nature.com/articles/s41467-018-07210-0"],
        [
            "neurips",
            "https://proceedings.neurips.cc/paper/2019/hash/0118a063b4aae95277f0bc1752c75abf-Abstract.html",
        ],
        ["openreview", "https://openreview.net/forum?id=xQUe1pOKPam"],
        ["oup", "https://academic.oup.com/brain/article/147/3/743/7617466"],
        ["pmc", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7249434"],
        ["pmlr", "https://proceedings.mlr.press/v130/husain21a.html"],
        ["wiley", "https://onlinelibrary.wiley.com/doi/abs/10.1002/acr2.11440"],
        ["pnas", "https://www.pnas.org/doi/full/10.1073/pnas.2114679118"],
        ["science", "https://science.org/doi/full/10.1126/scirobotics.abm6597"],
        [
            "sciencedirect",
            "https://www.sciencedirect.com/science/article/pii/S2589721721000349",
        ],
        ["springer", "https://link.springer.com/article/10.1007/s41095-022-0271-y"],
        [
            "plos",
            "https://journals.plos.org/climate/article?id=10.1371/journal.pclm.0000068",
        ],
        ["rsc", "https://pubs.rsc.org/en/content/articlelanding/2022/dd/d2dd00066k"],
    ];

    const POLL_INTERVAL = 100;
    const MAX_WAIT = 10_000;

    // Some sources tag papers with an id prefix that differs from the source
    // name (e.g. openreview → `OR-...`). Everything else uses the source tag
    // itself as the id prefix, case-insensitively.
    const idPrefixOverrides = { openreview: "or" };
    const idPrefixFor = (source) =>
        (idPrefixOverrides[source] || source).toLowerCase();

    const getPaperCount = () =>
        new Promise((resolve) => {
            chrome.storage.local.get("papers", (data) => {
                resolve(Object.keys(data.papers || {}).length);
            });
        });

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

    const openOne = (source, url, index, total) =>
        new Promise((resolve) => {
            getPaperCount().then((prevCount) => {
                console.log(
                    `[${index + 1}/${total}] Opening ${source} (papers: ${prevCount})`,
                );
                chrome.tabs.create({ url, active: false }, (tab) => {
                    const started = Date.now();
                    waitForNewPaper(prevCount, 0).then((found) => {
                        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
                        if (found) {
                            console.log(`  ✓ ${source} parsed in ${elapsed}s`);
                            chrome.tabs.remove(tab.id, () => resolve());
                        } else {
                            console.log(
                                `  ✗ ${source} timed out after ${elapsed}s — leaving tab ${tab.id} open`,
                            );
                            resolve();
                        }
                    });
                });
            });
        });

    const openAll = async () => {
        console.log(`\n===== Phase 1: Opening ${urls.length} URLs =====`);
        for (let i = 0; i < urls.length; i++) {
            const [source, url] = urls[i];
            await openOne(source, url, i, urls.length);
        }
        console.log("Open phase complete.\n");
    };

    const verify = () => {
        chrome.storage.local.get("papers", (data) => {
            const papersList = Object.values(data.papers || {});
            const found = [];
            const missing = [];

            for (const [source, url] of urls) {
                const prefix = idPrefixFor(source);
                const match = papersList.find((p) => {
                    const pid = (p.id || "").toLowerCase();
                    return (
                        pid.startsWith(`${prefix}-`) || pid.startsWith(`${prefix}_`)
                    );
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
        });
    };

    chrome.storage.local.remove("papers", () => {
        console.log("Memory reset: chrome.storage.local.papers cleared.");
        openAll().then(verify);
    });
})();

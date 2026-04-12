// ============================================================================
// MANUAL TEST: Open all urls.json abstract pages for PaperMemory to parse.
//
// HOW TO USE:
//   1. Run `npm run dev:watch` to start the dev browser with PaperMemory loaded
//   2. Open the PaperMemory options page (right-click extension icon > Options)
//   3. Open the browser DevTools console on that options page
//   4. Copy-paste this entire script into the console and press Enter
//
// WHAT IT DOES:
//   - Creates a single tab and navigates it to each abstract URL sequentially
//   - After each navigation, polls chrome.storage.local until a new paper
//     appears (or 3s timeout), then moves to the next URL
//   - Logs success/timeout for each source
//
// NOTE: Run manual-verify-urls.js afterwards to check results.
// ============================================================================
(() => {
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
    const MAX_WAIT = 5000;

    function getPaperCount() {
        return new Promise((resolve) => {
            chrome.storage.local.get("papers", (data) => {
                resolve(Object.keys(data.papers || {}).length);
            });
        });
    }

    function waitForNewPaper(prevCount, elapsed) {
        return new Promise((resolve) => {
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
    }

    let i = 0;
    let tabId = null;

    function openNext() {
        if (i >= urls.length) {
            console.log("Done! All pages visited.");
            return;
        }
        const [source, url] = urls[i];

        getPaperCount().then((prevCount) => {
            console.log(
                `[${i + 1}/${urls.length}] Opening ${source} (papers: ${prevCount})`,
            );

            const onNavigated = () => {
                const start = Date.now();
                waitForNewPaper(prevCount, 0).then((found) => {
                    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
                    if (found) {
                        console.log(`  ✓ ${source} parsed in ${elapsed}s`);
                    } else {
                        console.log(`  ✗ ${source} timed out after ${elapsed}s`);
                    }
                    i++;
                    openNext();
                });
            };

            if (tabId === null) {
                chrome.tabs.create({ url, active: false }, (tab) => {
                    tabId = tab.id;
                    onNavigated();
                });
            } else {
                chrome.tabs.update(tabId, { url }, () => {
                    onNavigated();
                });
            }
        });
    }

    openNext();
})();

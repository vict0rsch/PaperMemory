var STOPMATCH = false;

const setListeners = () => {
    const stopMatch = document.getElementById("match-bib-stop");
    stopMatch.addEventListener("click", () => {
        STOPMATCH = true;
        setHTML("match-bib-stop", '<span class="loader"></span>');
    });
    document.getElementById("copy-results").addEventListener("click", () => {
        copyTextToClipboard(document.getElementById("match-results").innerText);
        setHTML("copy-results", "Copied!");
        setTimeout(() => {
            setHTML("copy-results", "Copy to clipboard");
        }, 1500);
    });
    const bibMatcher = document.getElementById("match-bib");
    bibMatcher.addEventListener("click", async () => {
        const text = document.getElementById("bib-text").value;
        let parsed = parseBibText(text);
        resetMatchResults();
        console.log("parsed: ", parsed);
        let arxivIndices = [];
        let arxivs = [];
        for (const [idx, entry] of parsed.entries()) {
            if (JSON.stringify(entry).toLowerCase().includes("arxiv")) {
                arxivIndices.push(idx);
                arxivs.push(entry);
            }
        }
        parsed = parsed.map((entry) => {
            return {
                ...entry.entryTags,
                entryType: entry.entryType,
                citationKey: entry.citationKey,
            };
        });
        arxivs = arxivs.map((entry) => {
            return {
                ...entry.entryTags,
                entryType: entry.entryType,
                citationKey: entry.citationKey,
            };
        });

        console.log("arxivs: ", arxivs);
        setHTML(
            "n-arxivs",
            `Matching ${arxivs.length} arXiv entries, out of ${parsed.length} total entries:`
        );
        const matched = arxivs.length ? await matchItems(arxivs) : [];
        showPapers(parsed, matched, arxivIndices);
        addListener("show-only-matches", "change", () => {
            showPapers(parsed, matched, arxivIndices);
        });
    });
};

const resetMatchResults = () => {
    setHTML("match-results-title", "");
    hideId("result-controls");
    hideId("match-results");
    setHTML("match-results", "");
    hideId("bib-header");
    setHTML("bib-desc", "");
};

const showPapers = (parsed, matched, arxivIndices) => {
    const nMatched = matched.filter((e) => e).length;
    const found =
        nMatched > 1 ? `Found ${nMatched} matches` : `Found ${nMatched} match`;
    if (!nMatched) {
        showId("match-results");
        setHTML("match-results", "");
        return;
    }
    const showOnlyMatches = val("show-only-matches");
    const desc = showOnlyMatches
        ? `<p>Showing only ${nMatched} new matched entries</p>`
        : `<p>Showing all ${parsed.length} entries (with ${nMatched} updated match${
              nMatched > 1 ? "s" : ""
          })</p>`;
    if (showOnlyMatches && nMatched) {
        const html = matched
            .filter((e) => e)
            .map(bibtexToString)
            .join("<br/>");
        setHTML("match-results-title", found + " (showing only matches)");
        showId("match-results");
        setHTML("match-results", html);
        showId("result-controls", "flex");
    } else if (nMatched) {
        let htmls = [];
        for (const [idx, entry] of parsed.entries()) {
            if (arxivIndices.includes(idx)) {
                if (matched[arxivIndices.indexOf(idx)]) {
                    htmls.push(bibtexToString(matched[arxivIndices.indexOf(idx)]));
                } else {
                    htmls.push(bibtexToString(entry));
                }
            } else {
                htmls.push(bibtexToString(entry));
            }
        }
        const html = htmls.join("<br/>");
        setHTML(
            "match-results-title",
            found + ` (showing all ${parsed.length} entries)`
        );
        showId("match-results");
        setHTML("match-results", html);
        showId("result-controls", "flex");
    }
    showId("bib-header");
    setHTML("match-results-title", found);
    setHTML("bib-desc", desc);
};

const parseBibText = (text) => {
    var b = new BibtexParser();
    b.setInput(text);
    b.bibtex();
    return b.getEntries();
};

const setKey = (bibtex, key) => {
    const obj = bibtexToObject(bibtex);
    obj.citationKey = key;
    return bibtexToString(obj);
};

const matchItems = async (papersToMatch) => {
    showId("matching-progress-container", "flex");
    setHTML("matching-status-total", papersToMatch.length);
    showId("match-bib-stop", "flex");

    const progressbar = document.querySelector("#matching-progress-bar");
    const changeProgress = (progress) => {
        progressbar.style.width = `${progress}%`;
    };
    changeProgress(0);

    const keepKeys = val("keep-keys");

    let matchedBibtexStrs = [];

    for (const [idx, paper] of papersToMatch.entries()) {
        setHTML("matching-status-index", idx + 1);
        setHTML(
            "matching-status-title",
            paper.title.replaceAll("{", "").replaceAll("}", "")
        );
        changeProgress(parseInt((idx / papersToMatch.length) * 100));

        let bibtex, match;

        if (!bibtex) {
            setHTML("matching-status-provider", "dblp.org ...");
            match = await tryDBLP(paper);
            match?.bibtex && console.log("dblpMatch: ", match);
            bibtex = match?.bibtex;
        }

        if (!bibtex) {
            setHTML("matching-status-provider", "crossref.org ...");
            match = await tryCrossRef(paper);
            match?.bibtex && console.log("crossRefMatch: ", match);
            bibtex = match?.bibtex;
        }

        if (!bibtex) {
            setHTML("matching-status-provider", "semanticscholar.org ...");
            match = await trySemanticScholar(paper);
            match?.bibtex && console.log("semanticScholarMatch: ", match);
            bibtex = match?.bibtex;
        }

        if (!bibtex) {
            setHTML("matching-status-provider", "scholar.google.com ...");
            match = await tryCrossRef(paper);
            match?.bibtex && console.log("googleScholarMatch: ", match);
            bibtex = match?.bibtex;
        }
        if (bibtex) {
            if (keepKeys) {
                bibtex = setKey(bibtex, paper.citationKey);
            }
            matchedBibtexStrs.push(bibtex);
            updateMatchedTitles(matchedBibtexStrs);
        } else {
            matchedBibtexStrs.push(null);
        }
        if (STOPMATCH) {
            STOPMATCH = false;
            setHTML("matching-status", "Interrupted<br/><br/>");
            hideId("match-bib-stop");
            setHTML("match-bib-stop", "Stop");
            return matchedBibtexStrs;
        }
    }
    hideId("match-bib-stop");
    changeProgress(100);
    setHTML("matching-status", "All done!<br/><br/>");
    return matchedBibtexStrs;
};

const updateMatchedTitles = (matchedBibtexStrs) => {
    const entries = matchedBibtexStrs.filter((e) => e).map(bibtexToObject);
    const keys = entries.map((e) => e.citationKey);
    const titles = entries.map((e) => e.title.replaceAll("{", "").replaceAll("}", ""));
    const htmls = ["<table id='result-titles-table'>"];
    for (const [idx, title] of titles.entries()) {
        htmls.push(
            `<tr><th class="match-citation-key">${keys[idx]}</th><th class='match-title'>${title}</th></tr>`
        );
    }
    htmls.push("</table>");
    setHTML(
        "matched-list",
        `<h2>Papers matched: ${entries.length}</h2>` + htmls.join("")
    );
};

(async () => {
    setListeners();
})();

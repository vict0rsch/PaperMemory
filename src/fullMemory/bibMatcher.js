var STOPMATCH = false;

const setListeners = () => {
    addListener("match-bib-stop", "click", () => {
        STOPMATCH = true;
        setHTML("match-bib-stop", '<span class="loader"></span>');
    });
    addListener("copy-results", "click", () => {
        copyTextToClipboard(findEl("match-results").innerText);
        setHTML("copy-results", "Copied!");
        setTimeout(() => {
            setHTML("copy-results", "Copy to clipboard");
        }, 1500);
    });
    addListener("bib-text", "keydown", (e) => {
        if (document.activeElement === findEl("bib-text")) {
            if ((e.metaKey || e.ctrlKey) && e.keyCode == 13) {
                dispatch("match-bib", "click");
                findEl("match-bib").focus();
            }
        }
    });
    addListener("match-bib", "click", async () => {
        resetMatchResults();
        const text = findEl("bib-text").value;
        let parsed, stop;

        try {
            parsed = parseBibText(text);
        } catch (error) {
            showError(error);
            stop = true;
        }
        if (stop) return;

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
        showId("matching-feedback-container");
        arxivs.length
            ? setHTML(
                  "n-arxivs",
                  `Matching ${arxivs.length} arXiv entries, out of ${parsed.length} total entries:`
              )
            : setHTML(
                  "n-arxivs",
                  `No arXiv entries found in ${parsed.length} total entries.`
              );
        const matched = arxivs.length ? await matchItems(arxivs) : [];
        showPapers(parsed, matched, arxivIndices);
        addListener("show-only-matches", "change", () => {
            showPapers(parsed, matched, arxivIndices);
        });
    });
};

const resetMatchResults = () => {
    hideId("result-controls");
    hideId("match-results");
    setHTML("match-results", "");
    hideId("bib-header");
    setHTML("bib-desc", "");
    hideId("errors-container");
    setHTML("bibmatch-errors", "");
    hideId("matching-feedback-container");
};

const showPapers = (parsed, matched, arxivIndices) => {
    const nMatched = matched.filter((e) => e).length;
    if (!nMatched) return;
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
        showId("match-results");
        setHTML("match-results", html);
        showId("result-controls", "flex");
    }
    showId("bib-header");
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

const showError = (msg) => {
    showId("errors-container");
    setHTML("bibmatch-errors", msg);
};

const matchItems = async (papersToMatch) => {
    showId("matching-progress-container", "flex");
    setHTML("matching-status-total", papersToMatch.length);
    showId("match-bib-stop", "flex");
    setHTML(
        "matching-status",
        `<div id="matching-status-title"></div>
            <div>
                Looking for publications on <span id="matching-status-provider"></span>
            </div>
        </div>`
    );

    const progressbar = document.querySelector("#matching-progress-bar");
    const changeProgress = (progress) => {
        progressbar.style.width = `${progress}%`;
    };
    changeProgress(0);

    const keepKeys = val("keep-keys");

    let matchedBibtexStrs = [];
    let sources = [];
    let venues = [];

    for (const [idx, paper] of papersToMatch.entries()) {
        setHTML("matching-status-index", idx + 1);
        setHTML(
            "matching-status-title",
            paper.title.replaceAll("{", "").replaceAll("}", "")
        );
        changeProgress(parseInt((idx / papersToMatch.length) * 100));

        let bibtex, match, source, venue;

        if (!bibtex) {
            setHTML("matching-status-provider", "dblp.org ...");
            match = await tryDBLP(paper);
            match?.bibtex && console.log("dblpMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "DBLP";
        }
        if (!bibtex) {
            setHTML("matching-status-provider", "semanticscholar.org ...");
            match = await trySemanticScholar(paper);
            match?.bibtex && console.log("semanticScholarMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "Semantic Scholar";
        }
        if (!bibtex) {
            setHTML("matching-status-provider", "scholar.google.com ...");
            match = await tryGoogleScholar(paper);
            match?.bibtex && console.log("googleScholarMatch: ", match);
            bibtex = match?.bibtex;
            venue = match?.venue;
            source = "Google Scholar";
        }
        if (!bibtex) {
            setHTML("matching-status-provider", "crossref.org ...");
            match = await tryCrossRef(paper);
            venue = match.venue;
            if (venue) {
                paper.journal = venue;
                for (const [key, value] of paper.entries()) {
                    if ((value + "").toLowerCase().includes("arxiv")) {
                        delete paper[key];
                    }
                }
                bibtex = bibtexToString(paper);
                source = "CrossRef";
            }
            match?.venue && console.log("crossRefMatch: ", match);
        }

        if (bibtex) {
            if (keepKeys) {
                bibtex = setKey(bibtex, paper.citationKey);
            }
            sources.push(source);
            venues.push(venue);
            matchedBibtexStrs.push(bibtex);
            updateMatchedTitles(matchedBibtexStrs, sources, venues);
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
    updateMatchedTitles(matchedBibtexStrs, sources, venues);
    hideId("match-bib-stop");
    changeProgress(100);
    setHTML("matching-status", "All done!<br/><br/>");
    return matchedBibtexStrs;
};

const updateMatchedTitles = (matchedBibtexStrs, sources, venues) => {
    const htmls = [];
    const entries = matchedBibtexStrs.filter((e) => e).map(bibtexToObject);
    if (entries.length) {
        const keys = entries.map((e) => e.citationKey);
        const titles = entries.map((e) =>
            e.title.replaceAll("{", "").replaceAll("}", "")
        );
        htmls.push("<table id='result-titles-table'>");
        for (const [idx, title] of titles.entries()) {
            htmls.push(
                `<tr>
                    <th class="match-citation-key">${keys[idx]}</th>
                    <th class='match-title'>${title}</th>
                    <th class="match-venue">${venues[idx]}</th>
                    <th class="match-source">${sources[idx]}</th>
                </tr>`
            );
        }
        htmls.push("</table>");
    }
    setHTML(
        "matched-list",
        `<h2>Papers successfully matched: ${entries.length}</h2>` + htmls.join("")
    );
};

(async () => {
    setListeners();
})();
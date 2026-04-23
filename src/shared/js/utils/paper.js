// ES Module imports
import {
    log,
    info,
    warn,
    logError,
    eventId,
    miniHash,
    cleanStr,
    sendMessageToBackground,
    getStoredFiles,
    noParamUrl,
    urlToWebsiteId,
    consoleHeader,
    logOk,
    silentPromiseTimeout,
    cleanPapers,
    isPdfUrl,
} from "@pmu/functions.js";
import { state } from "@pmu/config.js";
import {
    getStorage,
    setStorage,
    getTheme,
    validatePaper,
    makeVenue,
    makeTitleHashToIdList,
    deletePaperInStorage,
    updateDuplicatedUrls,
} from "@pmu/data.js";
import {
    bibtexToObject,
    bibtexToString,
    sanitizeBibtexObject,
} from "@pmu/bibtexParser.js";
import { pushToRemote } from "@pmu/sync.js";
import { tryPWCMatch, tryPreprintMatch } from "@pmu/preprintMatching.js";
import {
    getSource,
    knownPaperPages,
    preprintSources,
    sourceFromIs,
} from "@pmu/sources/index.js";
import { parseIdFromUrl, findPaperForProperty } from "@pmu/urls.js";
import { findLocalFile, isKnownLocalFile } from "@pmu/files.js";

/**
 * Is this url associated with a known paper source?
 * For each known paper source in config.js/knownPaperPages, this function
 * checks whether the url includes one of the listed paths.
 * Also checks for local files in the PaperMemoryStore
 *
 * @param {string} url the url to check
 * @param {boolean} noStored if true, don't check for local files
 * @returns {object} boolean map from sources.
 */
export const isPaper = async (url, noStored = false) => {
    let is = {};
    if (!url) return is;
    for (const source in knownPaperPages) {
        const patterns = knownPaperPages[source].patterns;
        // default source status: false
        is[source] = false;
        for (const pattern of patterns) {
            if (typeof pattern === "string") {
                if (url.includes(pattern)) {
                    // known pattern: store as true
                    is[source] = true;
                }
            } else if (typeof pattern === "function") {
                is[source] = pattern(url) ?? false;
            }
            if (is[source]) break;
        }
    }
    // is the url a local file in the memory?
    is.localFile = isKnownLocalFile(url) ?? false;
    is.stored = noStored ? false : ((await findLocalFile(url)) ?? false);
    is.parsedWebsite = state.papers[`Website_${urlToWebsiteId(url)}`] ?? false;
    return is;
};

export const findFuzzyPaperMatch = (hashes, paper) => {
    const paperHash = miniHash(paper.title);
    if (hashes.hasOwnProperty(paperHash)) {
        const matches = hashes[paperHash];
        const nonPreprint = matches.find(
            (m) => !preprintSources.some((s) => m.toLowerCase().startsWith(s)),
        );
        if (nonPreprint) {
            return nonPreprint;
        }
        return matches[0];
    }
    return null;
};

/**
 * Get the url to the paper's abstract / display page.
 * In other words: not not the pdf's.
 * eg: https://arxiv.org/abs/1901.01234 (not https://arxiv.org/pdf/1901.01234.pdf)
 *
 * @param {object} paper the paper whose abstract url we're looking for
 * @returns {string} the url to the paper's abstract
 */
export const paperToAbs = (paper) => {
    const src = getSource(paper.source);
    const abs = src ? src.toAbs(paper) : paper.pdfLink;
    return abs.replace("http://", "https://");
};

/**
 * Get the url to the paper's online pdf.
 *
 * @param {object} paper the paper whose pdf url we're looking for
 * @returns {string} the url to the paper's pdf
 */
export const paperToPDF = (paper) => {
    const src = getSource(paper.source);
    const pdf = src ? src.toPDF(paper) : paper.pdfLink;
    return pdf.replace("http://", "https://");
};

export const autoTagPaper = async (paper) => {
    try {
        const autoTags = await getStorage("autoTags");
        if (!autoTags || !autoTags.length) return paper;
        let tags = new Set();
        for (const at of autoTags) {
            if (!at.tags?.length) continue;
            if (!at.title && !at.author) continue;

            let titleMatch = true;
            let authorMatch = true;
            try {
                if (at.title) {
                    titleMatch = new RegExp(at.title, "i").test(paper.title);
                }
                if (at.author) {
                    authorMatch = new RegExp(at.author, "i").test(paper.author);
                }
            } catch (e) {
                continue;
            }

            if (titleMatch && authorMatch) {
                at.tags.forEach((t) => tags.add(t));
            }
        }
        paper.tags = [...tags].sort();
        if (paper.tags.length) {
            log("Automatically adding tags:", paper.tags);
        }
        return paper;
    } catch (error) {
        log("Error auto-tagging:", error);
        log("Paper:", paper);
        return paper;
    }
};

export const initPaper = async (paper) => {
    if (!paper.note) {
        paper.note = "";
    }

    paper.md = `[${paper.title}](${paper.pdfLink})`;
    paper.tags = [];
    paper.codeLink = paper.codeLink ?? "";
    paper.favorite = false;
    paper.favoriteDate = "";
    paper.addDate = new Date().toJSON();
    paper.lastOpenDate = paper.addDate;
    paper.count = 1;
    paper.code = {};
    if (paper.bibtex) {
        const bibObj = sanitizeBibtexObject(bibtexToObject(paper.bibtex));
        paper.bibtex = bibtexToString(bibObj);
        paper.doi = paper.doi ?? bibObj.doi ?? "";
    } else {
        paper.doi = paper.doi ?? "";
    }
    for (const k in paper) {
        if (paper.hasOwnProperty(k) && typeof paper[k] === "string") {
            paper[k] = paper[k].trim();
        }
    }

    paper = await autoTagPaper(paper);
    validatePaper(paper);

    return paper;
};

export const makePaper = async (is, url, tab = false) => {
    let paper;
    let start = performance.now();
    info("Making paper...");
    try {
        const src = tab ? getSource("website") : sourceFromIs(is);
        if (!src) {
            console.error({ is, url });
            throw new Error(
                "Could not parse paper (in `makePaper`). Unknown paper source, see above.",
            );
        }
        const ctx = {
            papers: Object.values(cleanPapers(state.papers)),
            titleHashToIds: state.titleHashToIds,
            findPaperForProperty,
        };
        paper = await src.parse(url, tab, ctx);
        if (paper) paper.source = src.name;
    } catch (e) {
        logError("Error in makePaper:", e);
        if (e.message?.includes("Unknown paper source")) {
            throw e;
        }
        return;
    }

    if (typeof paper === "undefined") {
        return;
    }
    const elapsed = (performance.now() - start) / 1000;
    info(`Paper parsed in ${elapsed.toFixed(2)}s`);

    return await initPaper(paper);
};

export const mergePapers = (options = { newPaper: {}, oldPaper: {} }) => {
    const { oldPaper, newPaper, ...extra } = options;
    let mergedPaper = { ...oldPaper };

    const defaults = {
        overwrites: ["lastOpenDate"],
        incrementCount: false,
        syncMerge: false,
    };

    const opts = { ...defaults, ...extra };

    for (const attribute in newPaper) {
        if (!oldPaper.hasOwnProperty(attribute)) {
            mergedPaper[attribute] = newPaper[attribute];
        } else if (newPaper[attribute] && !oldPaper[attribute]) {
            mergedPaper[attribute] = newPaper[attribute];
        }
    }
    if (opts.incrementCount && mergedPaper.count === 1) {
        mergedPaper.count += 1;
    }
    if (opts.syncMerge) {
        // add counts
        mergedPaper.count = oldPaper.count + newPaper.count;

        // combine notes
        mergedPaper.note = oldPaper.note ?? "";
        if (newPaper.note && newPaper.note !== oldPaper.note) {
            mergedPaper.note += "\n\n--[Sync Merge]--\n";
            mergedPaper.note += newPaper.note;
        }

        // combine tags
        mergedPaper.tags = [...oldPaper.tags, ...newPaper.tags];

        mergedPaper.lastOpenDate = newPaper.lastOpenDate;
        // keep most recent open date
        if (newPaper.lastOpenDate > oldPaper.lastOpenDate) {
            mergedPaper.lastOpenDate = newPaper.lastOpenDate;
        }
        // keep oldest add date
        mergedPaper.addDate =
            newPaper.addDate < oldPaper.addDate ? newPaper.addDate : oldPaper.addDate;
    }
    for (const attribute of opts.overwrites) {
        if (newPaper.hasOwnProperty(attribute)) {
            mergedPaper[attribute] = newPaper[attribute];
        }
    }

    return mergedPaper;
};

export const updatePaperVisits = (paper) => {
    paper.count += 1;
    paper.lastOpenDate = new Date().toJSON();
    log("Updating paper to:", paper);
    return paper;
};

/**
 *  Adds a new paper to the memory or updates the counts and open dates of an existing paper.
 *
 * @param {string} url The url from which to parse a paper
 * @param {object} is The paper's source info
 * @param {object} checks The user's preferences
 * @returns
 */
export const addOrUpdatePaper = async ({
    url,
    is,
    prefs,
    tab,
    store = true,
    contentScriptCallbacks = {
        update: () => {},
        preprints: () => {},
        done: () => {},
        feedback: null,
    },
}) => {
    // start time
    const aouStart = Date.now();

    let paper, isNew;
    let pwc = {};

    consoleHeader(`PaperMemory Parsing ${String.fromCodePoint("0x1F4DD")}`);

    // Extract id from url
    state.papers = (await getStorage("papers")) ?? {};
    const id = await parseIdFromUrl(url, tab);
    const paperExists = state.papers.hasOwnProperty(id);
    prefs &&
        prefs.checkFeedback &&
        contentScriptCallbacks.feedback &&
        contentScriptCallbacks.feedback({ loading: true });

    if (id && paperExists && state.papers[id].author.toLowerCase() !== "anonymous") {
        // Update paper if it exists
        paper = updatePaperVisits(state.papers[id]);
        isNew = false;
    } else {
        // Or create a new one if it does not
        let newPaper = await makePaper(is, url, tab);
        if (!newPaper) {
            return;
        }
        state.titleHashToIds = makeTitleHashToIdList(state.papers);
        const existingId = findFuzzyPaperMatch(state.titleHashToIds, newPaper);
        if (existingId && store) {
            // Update paper as already it exists
            let existingPaper = state.papers[existingId];
            log("New paper", newPaper, "already exists as", existingPaper);
            addPaperToTitleHashToId(newPaper);

            if (existingPaper.venue) {
                let overwrites = ["lastOpenDate"];
                if (existingPaper.author.toLowerCase() === "anonymous") {
                    overwrites.push("author");
                    overwrites.push("year");
                    overwrites.push("venue");
                    overwrites.push("bibtex");
                    overwrites.push("note");
                }
                console.log("overwrites: ", overwrites);
                existingPaper = mergePapers({
                    newPaper,
                    overwrites,
                    oldPaper: existingPaper,
                    incrementCount: false,
                });
                updateDuplicatedUrls(url, existingId);
            } else if (newPaper.venue) {
                updateDuplicatedUrls(paperToAbs(existingPaper), newPaper.id);
                updateDuplicatedUrls(paperToPDF(existingPaper), newPaper.id);
                await deletePaperInStorage(existingPaper.id, state.papers);
                existingPaper = mergePapers({
                    newPaper: newPaper,
                    oldPaper: existingPaper,
                    incrementCount: false,
                    overwrites: [
                        "lastOpenDate",
                        "venue",
                        "bibtex",
                        "id",
                        "key",
                        "pdfLink",
                        "source",
                        "year",
                        "author",
                    ],
                });
            } else if (existingPaper.author.toLowerCase() === "anonymous") {
                existingPaper = mergePapers({
                    newPaper,
                    oldPaper: existingPaper,
                    incrementCount: true, // ?
                    overwrites: [
                        "lastOpenDate",
                        "author",
                        "year",
                        "venue",
                        "bibtex",
                        "note",
                    ],
                });
            }
            newPaper = updatePaperVisits(existingPaper);
            isNew = false;
        } else {
            // set isNew to True for the storage setter
            isNew = true;
        }
        paper = newPaper;
    }

    if (!paper.codeLink || !paper.venue) {
        try {
            const pwcMatch = await silentPromiseTimeout(tryPWCMatch(paper));

            const pwcCodeLink = !paper.codeLink && pwcMatch?.codeLink;
            const pwcNote = pwcMatch?.note;
            const pwcBibtex = pwcMatch?.bibtex;
            const pwcVenue = !paper.venue && pwcMatch?.venue;

            pwc = {
                codeLink: pwcCodeLink,
                note: pwcNote,
                venue: pwcVenue,
                bibtex: pwcBibtex,
            };

            if (pwc.codeLink) {
                paper.codeLink = pwc.codeLink;
                if (pwcMatch.hasOwnProperty("note")) delete pwcMatch.note;
                paper.code = pwcMatch;
            }
        } catch (error) {
            log("Error trying to discover a code repository:");
            log(error);
        }
    }

    state.papers = (await getStorage("papers")) ?? {};

    // minimize risk of concurrent writes to the same paper
    if (isNew && state.papers.hasOwnProperty(paper.id)) {
        warn("Paper has been created by another page: merging papers.");
        paper = mergePapers({
            newPaper: state.papers[paper.id],
            oldPaper: paper,
            incrementCount: true,
        });
        isNew = false;
    }

    // Store may be false if the user has disabled:
    //   * paper storage from Abstract URLs
    //   * automatic parsing altogether
    // but we still want to display paper metadata on arxiv.org
    if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;

    chrome.storage.local.set({ papers: state.papers }, async () => {
        // tell the content script the paper has been parsed/updated
        contentScriptCallbacks["update"](paper);
        pushToRemote();

        let notifText;
        if (isNew || pwc.codeLink) {
            if (isNew) {
                // new paper
                if (store) {
                    logOk("Added '" + paper.title + "' to your Memory!");
                } else {
                    warn(
                        "Discovered '" +
                            paper.title +
                            "' but did not store it (`store` is false).",
                    );
                }
                log("paper: ", paper);

                notifText = "Saved ✓";
                if (pwc.codeLink) {
                    notifText +=
                        "<br/><div id='feedback-pwc'>(+ repo from PapersWithCode) </div>";
                }

                prefs &&
                    prefs.checkFeedback &&
                    store &&
                    contentScriptCallbacks.feedback &&
                    contentScriptCallbacks.feedback({ text: notifText, paper });
            } else {
                // existing paper but new code repo
                notifText = "Found a code repository on PapersWithCode!";
                prefs &&
                    prefs.checkFeedback &&
                    store &&
                    contentScriptCallbacks.feedback &&
                    contentScriptCallbacks.feedback({ text: notifText });
            }
        } else {
            store && logOk("Updated '" + paper.title + "' in your Memory");
        }

        // anyway: try and update note with actual publication
        if (!paper.note || !paper.venue || paper.author.toLowerCase() === "anonymous") {
            const preprintMatch = await tryPreprintMatch(paper);
            for (const key of ["note", "venue", "bibtex", "doi"]) {
                if (!paper[key] || key === "bibtex") {
                    const value = preprintMatch[key] ?? pwc[key];
                    if (value) {
                        log(`Updating preprint ${key} to`, value);
                        paper[key] = value;
                    }
                }
                if (key === "bibtex" && preprintMatch[key]) {
                    const bibObj = bibtexToObject(preprintMatch[key]);
                    if (bibObj.year !== paper.year) {
                        paper.year = bibObj.year;
                    }
                }
            }

            state.papers = (await getStorage("papers")) ?? {};

            // minimize risk of concurrent writes to the same paper
            if (
                isNew &&
                state.papers.hasOwnProperty(paper.id) &&
                state.papers[paper.id].count > 1
            ) {
                warn("Paper has been created by another page: merging papers.");
                paper = mergePapers({
                    newPaper: state.papers[paper.id],
                    oldPaper: paper,
                    incrementCount: false,
                });
            }

            // record updated paper if store is true
            if (store && !state.deleted[paper.id]) state.papers[paper.id] = paper;
            await new Promise((resolve) =>
                chrome.storage.local.set({ papers: state.papers }, resolve),
            );
        }
        // tell the content script the pre-print matching procedure has finished
        contentScriptCallbacks["preprints"](paper);
        pushToRemote();

        info(`Done processing paper (${(Date.now() - aouStart) / 1e3}s).`);
        console.groupEnd();
        contentScriptCallbacks["done"](paper);
    });

    return { paper, id };
};

/**
 * Make a markdown link to the paper's abstract or pdf.
 * @param {object} paper The paper to make a link for
 * @param {object} prefs The user's preferences to determine whether to link to the pdf or the abstract
 * @returns {string} The markdown link
 */
export const makeMdLink = (paper, prefs = {}) => {
    const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
    let yearAndVenue = "";
    if (prefs.checkMdYearVenue) {
        yearAndVenue = paper.note.match(/(.+)\s*@\s*([\w\s]+\(?\d{4}\)?)/i);
        if (yearAndVenue) {
            yearAndVenue = yearAndVenue[2]?.replace(/\s+/g, " ").replace(/[\(\)]/g, "");
        }
        if (!yearAndVenue) {
            yearAndVenue = "";
            if (paper.venue) {
                yearAndVenue += paper.venue + " ";
            }
            yearAndVenue += paper.year;
        }
    }
    let title = paper.title;
    if (yearAndVenue) {
        title = `${title} (${yearAndVenue.replace(/\s+/g, " ")})`;
    }
    const md = `[${title}](${link})`;
    return md;
};

/**
 * Add a paper to the title hash to id list.
 * @param {object} paper The paper to add
 */
export const addPaperToTitleHashToId = (paper) => {
    const id = paper.id;
    const hashedTitle = miniHash(paper.title);
    if (!state.titleHashToIds.hasOwnProperty(hashedTitle)) {
        state.titleHashToIds[hashedTitle] = [];
    }
    if (!state.titleHashToIds[hashedTitle].includes(id)) {
        state.titleHashToIds[hashedTitle].push(id);
    }
};

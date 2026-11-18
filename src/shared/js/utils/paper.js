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
    updateDuplicatedUrls,
} from "@pmu/data.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import {
    bibtexToObject,
    bibtexToString,
    sanitizeBibtexObject,
} from "@pmu/bibtexParser.js";
import { pushToRemote } from "@pmu/sync.js";
import { tryPreprintMatch } from "@pmu/preprintMatching.js";
import {
    getSource,
    knownPaperPages,
    preprintSources,
    sourceFromIs,
    unwrapUrl,
} from "@pmu/sources/index.js";
import { parseIdFromUrl, findPaperForProperty } from "@pmu/urls.js";
import { findLocalFile, isKnownLocalFile } from "@pmu/files.js";

/**
 * Is this url associated with a known paper source?
 * For each known paper source in config.js/knownPaperPages, this function
 * checks whether the url matches one of its patterns (BasePaperSource.matches).
 * Also checks for local files in the PaperMemoryStore
 *
 * @param {string} url the url to check
 * @param {boolean} noStored if true, don't check for local files
 * @returns {object} boolean map from sources.
 */
export const isPaper = async (url, noStored = false) => {
    let is = {};
    if (!url) return is;
    url = unwrapUrl(url);
    for (const source in knownPaperPages) {
        is[source] = getSource(source).matches(url);
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

/**
 * Whether a regular expression could backtrack for a very long time (a quantified group
 * that itself contains a quantifier, e.g. "(a+)+", "(\\w+\\s?)*"), or is too long to check.
 * Such auto-tagging patterns are skipped: matching runs on the page's thread.
 * @param {string} pattern
 * @returns {boolean}
 */
export const isRiskyPattern = (pattern) =>
    pattern.length > 300 || /\((?:[^()\\]|\\.)*[+*}](?:[^()\\]|\\.)*\)[+*{]/.test(pattern);

export const autoTagPaper = async (paper) => {
    try {
        const autoTags = await getStorage("autoTags");
        if (!autoTags || !autoTags.length) return paper;
        let tags = new Set();
        for (const at of autoTags) {
            if (!at.tags?.length) continue;
            // the options page stores the authors pattern as `authors`
            const authors = at.authors ?? at.author;
            if (!at.title && !authors) continue;

            let titleMatch = true;
            let authorMatch = true;
            if ([at.title, authors].some((p) => p && isRiskyPattern(p))) {
                warn("Skipping an auto-tagging rule whose pattern could be too slow:", at);
                continue;
            }
            try {
                // bounded texts: even an unforeseen slow pattern stays short
                if (at.title) {
                    titleMatch = new RegExp(at.title, "i").test(
                        String(paper.title ?? "").slice(0, 500),
                    );
                }
                if (authors) {
                    authorMatch = new RegExp(authors, "i").test(
                        String(paper.author ?? "").slice(0, 2000),
                    );
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
        // Unwrap here too: makePaper is also called directly (e.g. options.js
        // manual add), bypassing the unwrap in addOrUpdatePaper.
        paper = await src.parse(tab ? url : unwrapUrl(url), tab, ctx);
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
 * @param {object} agent Agent access fields `{tags, provenance, projectHash}`, carried by
 * the first write's operation: the queue adds the tags and Project membership to the paper
 * as stored, and the Provenance only to a paper this operation creates (memoryQueue.js).
 * A paper already stored (its id, a url resolving to it, or a fuzzy match) is only
 * attached: a visit carrying these fields, without merge, promotion, url remapping or
 * publication lookup
 * @returns {Promise<{paper: object, id: string, saving: Promise, isNew: boolean, done:
 * Promise}|undefined>} The paper and its id (`paper.id`, not the id resolved from `url`;
 * once `saving` has answered, the id written), or undefined if parsing failed; `saving`:
 * the background's answer to the write ({ok}),
 * which lands after this returns; `isNew`: whether this call created the paper (final once
 * `saving` has answered); `done`: resolved once processing has finished, after the last
 * write
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
    agent = null,
}) => {
    // start time
    const aouStart = Date.now();

    let paper, isNew;
    // what gets written: an operation for the background's queue, applied there to the paper
    // as stored at that moment (memoryQueue.js), never this function's earlier snapshot
    let saveOp;

    consoleHeader(`PaperMemory Parsing ${String.fromCodePoint("0x1F4DD")}`);

    // parse and store the paper URL a proxy / PDF-viewer URL embeds
    if (!tab) url = unwrapUrl(url);

    // Extract id from url
    state.papers = (await getStorage("papers")) ?? {};
    const id = await parseIdFromUrl(url, tab);
    const paperExists = state.papers.hasOwnProperty(id);
    prefs &&
        prefs.checkFeedback &&
        contentScriptCallbacks.feedback &&
        contentScriptCallbacks.feedback({ loading: true });

    if (
        id &&
        paperExists &&
        // an agent's add of a stored paper only attaches it (Agent access), even if
        // anonymous: no re-parse
        (agent || state.papers[id].author.toLowerCase() !== "anonymous")
    ) {
        // Update paper if it exists
        paper = updatePaperVisits(state.papers[id]);
        isNew = false;
        saveOp = { op: "visit", id };
    } else {
        // Or create a new one if it does not
        let newPaper = await makePaper(is, url, tab);
        if (!newPaper) {
            return;
        }
        state.titleHashToIds = makeTitleHashToIdList(state.papers);
        const existingId = findFuzzyPaperMatch(state.titleHashToIds, newPaper);
        // an agent's add of a stored paper (the parsed id, else a fuzzy match) only
        // attaches it: no merge, promotion or url remapping
        const storedId = state.papers.hasOwnProperty(newPaper.id)
            ? newPaper.id
            : existingId;
        if (agent && storedId && store) {
            newPaper = updatePaperVisits(state.papers[storedId]);
            isNew = false;
            saveOp = { op: "visit", id: storedId };
        } else if (existingId && store) {
            // Update paper as already it exists
            let existingPaper = state.papers[existingId];
            const parsed = { ...newPaper };
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
                saveOp = {
                    op: "merge",
                    id: existingId,
                    paper: parsed,
                    overwrites,
                    visit: true,
                };
                await updateDuplicatedUrls(url, existingId);
            } else if (newPaper.venue) {
                await updateDuplicatedUrls(paperToAbs(existingPaper), newPaper.id);
                await updateDuplicatedUrls(paperToPDF(existingPaper), newPaper.id);
                const overwrites = [
                    "lastOpenDate",
                    "venue",
                    "bibtex",
                    "id",
                    "key",
                    "pdfLink",
                    "source",
                    "year",
                    "author",
                ];
                existingPaper = mergePapers({
                    newPaper: newPaper,
                    oldPaper: existingPaper,
                    incrementCount: false,
                    overwrites,
                });
                // the published version replaces the stored preprint (deleted in the
                // same queue step as the merged paper is written)
                saveOp = {
                    op: "merge",
                    fromId: existingId,
                    paper: parsed,
                    overwrites,
                    visit: true,
                };
            } else if (existingPaper.author.toLowerCase() === "anonymous") {
                const overwrites = ["lastOpenDate", "author", "year", "venue", "bibtex", "note"];
                existingPaper = mergePapers({
                    newPaper,
                    oldPaper: existingPaper,
                    incrementCount: true, // ?
                    overwrites,
                });
                saveOp = {
                    op: "merge",
                    id: existingId,
                    paper: parsed,
                    overwrites,
                    incrementCount: true,
                    visit: true,
                };
            }
            newPaper = updatePaperVisits(existingPaper);
            isNew = false;
        } else {
            // set isNew to True for the storage setter
            isNew = true;
        }
        paper = newPaper;
        // a new paper, or one stored meanwhile by another page / a re-parse: then merged
        // into the stored one (its user fields kept) with a visit
        saveOp ??= {
            op: "merge",
            paper,
            overwrites: ["lastOpenDate"],
            anonymousOverwrites: ["author", "year", "venue", "bibtex"],
            visit: true,
        };
        // a paper found stored (a fuzzy match), deleted meanwhile: not re-created
        if (!isNew && saveOp.op === "merge") saveOp.ifMissing = "skip";
    }

    // Map the visited url to the paper if it does not resolve to it yet (e.g. its
    // source reads no id from this url), ahead of the papers write so it is stored
    // by the time the paper is. Not for an agent's add of a stored paper (attach only)
    if (store && !state.deleted[paper.id] && paper.id !== id && (isNew || !agent)) {
        await updateDuplicatedUrls(url, paper.id);
    }

    // Agent access: the agent's fields go with the first write, the queue applies them
    if (agent) saveOp.agent = agent;

    // Store may be false if the user has disabled:
    //   * paper storage from Abstract URLs
    //   * automatic parsing altogether
    // but we still want to display paper metadata on arxiv.org
    const saving =
        store && !state.deleted[paper.id]
            ? memoryOp(saveOp)
            : Promise.resolve({ ok: true, result: { paper } });
    let resolveDone;
    const done = new Promise((resolve) => (resolveDone = resolve));
    const result = { paper, id: paper.id, saving, isNew, done };
    const processing = saving.then(async (answer) => {
        if (!answer.ok) {
            // not saved: say so (never "Saved ✓"), and stop here
            logError("Could not save the paper:", answer.error);
            // shown even when save notices are off: the user expects the paper saved
            contentScriptCallbacks.feedback &&
                contentScriptCallbacks.feedback({ error: "write" });
            console.groupEnd();
            contentScriptCallbacks["done"](paper);
            resolveDone();
            return;
        }
        if (answer.result?.paper) {
            paper = answer.result.paper;
            if (saveOp.op === "merge") isNew = !!answer.result.created;
            result.isNew = isNew;
            // the id written: e.g. a fuzzy match deleted meanwhile, the parsed id's paper
            result.id = paper.id;
        }
        // tell the content script the paper has been parsed/updated
        contentScriptCallbacks["update"](paper);
        pushToRemote();

        let notifText;
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
            prefs &&
                prefs.checkFeedback &&
                store &&
                contentScriptCallbacks.feedback &&
                contentScriptCallbacks.feedback({ text: notifText, paper });
        } else {
            store && logOk("Updated '" + paper.title + "' in your Memory");
        }

        // anyway: try and update note with actual publication (not for an agent's add of a
        // stored paper: it only attaches it)
        if (
            (isNew || !agent) &&
            (!paper.note || !paper.venue || paper.author.toLowerCase() === "anonymous")
        ) {
            const preprintMatch = await tryPreprintMatch(paper);
            for (const key of ["note", "venue", "bibtex", "doi"]) {
                if (!paper[key] || key === "bibtex") {
                    const value = preprintMatch[key];
                    if (value) {
                        log(`Updating preprint ${key} to`, value);
                        paper[key] = value;
                        // an abbreviated venue keeps its full name (optional field)
                        if (key === "venue" && value === preprintMatch.venue && preprintMatch.venueFull)
                            paper.venueFull = preprintMatch.venueFull;
                    }
                }
                if (key === "bibtex" && preprintMatch[key]) {
                    const bibObj = bibtexToObject(preprintMatch[key]);
                    if (bibObj.year !== paper.year) {
                        paper.year = bibObj.year;
                    }
                }
            }

            // record the publication fields only, on the paper as stored now (a note typed
            // meanwhile wins; a paper deleted meanwhile, anywhere, is not re-created)
            if (store && !state.deleted[paper.id]) {
                const fields = {};
                for (const key of ["note", "venue", "venueFull", "bibtex", "doi", "year"])
                    if (paper[key] !== undefined) fields[key] = paper[key];
                const answer = await memoryOp({
                    op: "patch",
                    id: paper.id,
                    fields,
                    ifEmpty: ["note", "venue", "venueFull", "doi"],
                });
                if (answer.ok && answer.result?.paper) paper = answer.result.paper;
            }
        }
        // tell the content script the pre-print matching procedure has finished
        contentScriptCallbacks["preprints"](paper);
        pushToRemote();

        info(`Done processing paper (${(Date.now() - aouStart) / 1e3}s).`);
        console.groupEnd();
        contentScriptCallbacks["done"](paper);
        resolveDone();
    });
    // whatever fails while processing, the caller (e.g. an agent's add) stops waiting
    processing
        .catch((e) => logError("Could not finish processing the paper:", e))
        .finally(resolveDone);

    return result;
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

// ES Module imports
import { state } from "@pmu/config.js";
import {
    copyTextToClipboard,
    copyHyperLinkToClipboard,
    cleanPapers,
    normalizeCodeLink,
    delay,
    info,
    log,
    warn,
} from "@pmu/functions.js";
import { isPaper, addOrUpdatePaper } from "@pmu/paper.js";
import { sortMemory } from "@pmu/state.js";
import { onPapersChange } from "@pmu/data.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import {
    findEl,
    setHTML,
    showId,
    hideId,
    fadeIn,
    fadeOut,
} from "@pmu/miniquery.js";
import {
    getMemoryItemHTML,
    getMemoryEditHTML,
    getMemoryEmptyHTML,
    getNoMemoryHTML,
} from "@pm/popup/js/templates.js";
import {
    closeMenu,
    fitTextarea,
    popupMain,
    refreshPaperViewFields,
    setActiveTab,
    showToast,
} from "@pm/popup/js/popup.js";
import { icon, paintIcons } from "@pm/popup/js/icons.js";
import { createTagField, markMatch, tagCounts } from "@pm/popup/js/tagfield.js";
import {
    addEventsToMemoryItems,
    addEventsToMemoryControls,
    expandRowAuthors,
} from "@pm/popup/js/handlers.js";
import { infoPanelIsOpen, openInfoPanel } from "@pm/popup/js/infopanel.js";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);

/**
 * Paper page whose paper is not in the Memory: "Add it now" (parses and stores it), and the
 * reasons it may be missing
 * @param {string} url The active tab's url
 */
export const updatePopupPaperNoMemory = async (url) => {
    hideId("notArxiv");
    setHTML("isArxiv", getNoMemoryHTML(url));
    showId("isArxiv", "flex");
    paintIcons(findEl({ element: "isArxiv" }));

    findEl({ element: "manual-trigger-btn" })?.addEventListener("click", async () => {
        const btn = findEl({ element: "manual-trigger-btn" });
        btn.disabled = true;
        btn.innerHTML = `<span class="pm-spinner"></span>Adding…`;
        setHTML("manual-parsing-error", "");
        try {
            const is = await isPaper(url);
            const update = await addOrUpdatePaper({ url, is });
            if (!update?.paper) throw new Error("No paper could be parsed");
            // popupMain reads the Memory again: only once the background wrote the paper
            const answer = await update.saving;
            if (!answer.ok) throw new Error(answer.error);
            popupMain(url, is, true);
        } catch (error) {
            warn("Manual Parsing Error:", error);
            btn.disabled = false;
            btn.textContent = "Try again";
            setHTML(
                "manual-parsing-error",
                `<div class="pm-banner pm-banner-err">${icon("alert")}<div><b>Couldn’t add this paper</b>The page could not be read. If it should work, please report it.</div></div>`,
            );
        }
    });
};

/**
 * Copy a text to the clipboard and confirm it: the popup's toast, or (fullMemory, which has
 * no toast) a short text in the paper's row
 * @param {object} opts
 * @param {string} opts.id Id of the paper
 * @param {string} opts.textToCopy Text to copy to the clipboard
 * @param {string} opts.feedbackText Text to display as feedback
 * @param {string} opts.hyperLinkTitle The title of the hyperlink to copy, if any
 */
export const copyAndConfirmMemoryItem = async ({
    id,
    textToCopy,
    feedbackText,
    hyperLinkTitle = null,
}) => {
    if (!hyperLinkTitle) {
        copyTextToClipboard(textToCopy);
    } else {
        await copyHyperLinkToClipboard(textToCopy, hyperLinkTitle);
    }
    if (findEl({ element: "popup-feedback-copied" })) return showToast(feedbackText);
    const element = findEl({ element: `memory-container--${id}` })?.querySelector(
        ".memory-item-feedback",
    );
    if (!element) return;
    element.textContent = feedbackText;
    element.hidden = false;
    fadeIn(element);
    setTimeout(() => fadeOut(element), 2000);
};

/**
 * Looks for an open tab with the code of the paper. Matches are not exact:
 * a tab url needs only to include the targetURL to be valid. If no existing
 * tab matches the targetURL, a new tab is created
 * @param {string} targetURL URL of the page to open
 */
export const focusExistingOrCreateNewURLTab = (targetURL) =>
    new Promise((resolve) => {
        targetURL = targetURL.replace("http://", "https://");
        if (!targetURL.startsWith("https://")) {
            targetURL = "https://" + targetURL;
        }
        if (!chrome.tabs) {
            if (window?.location?.href) {
                window.location.href = targetURL;
            }
            return resolve();
        }
        const { origin } = new URL(targetURL);
        chrome.tabs.query({ url: `${origin}/*` }, (tabs) => {
            for (const tab of tabs) {
                if (tab.url.includes(targetURL)) {
                    const tabUpdateProperties = { active: true };
                    const windowUpdateProperties = { focused: true };
                    chrome.windows.getCurrent((w) => {
                        if (w.id !== tab.windowId) {
                            chrome.windows.update(
                                tab.windowId,
                                windowUpdateProperties,
                                () => {
                                    chrome.tabs.update(tab.id, tabUpdateProperties);
                                    resolve();
                                },
                            );
                        } else {
                            chrome.tabs.update(tab.id, tabUpdateProperties);
                            resolve();
                        }
                    });
                    resolve();
                    return;
                }
            }
            chrome.tabs.create({ url: targetURL });
            resolve();
        });
        resolve();
    });

// -------------------------------
// -----  Saving paper edits -----
// -------------------------------

/**
 * Re-renders what shows a paper after it changed: its Memory row (unless it is being edited)
 * and, when it is the current paper, the fields of the paper view
 * @param {string} id
 * @param {object} opts {paperView: also refresh the paper view (default true)}
 */
/**
 * Where the focus is in a row, as a way to find the same control in the row rendered again
 * (its content may have changed: tags added, a note…): the ⓘ panel, a tag by its name, or
 * a control by its class. null when the focus is not in the row.
 * @param {HTMLElement} row
 * @param {Element} el The focused element
 * @returns {null | ((next: HTMLElement) => HTMLElement | null)}
 */
const rowFocusTarget = (row, el) => {
    if (!el || !row.contains(el)) return null;
    if (el === row) return (next) => next;
    if (el.closest(".pm-info-pop"))
        return (next) => {
            const panel = next.querySelector(".pm-info-pop");
            return panel?.tabIndex >= 0 ? panel : next.querySelector(".memory-item-info");
        };
    if (el.classList.contains("memory-tag"))
        return (next) =>
            [...next.querySelectorAll(".memory-tag")].find(
                (t) => t.textContent === el.textContent,
            );
    const cls = [...el.classList].find((c) =>
        /^(memory-|pm-note-more$|pm-item-authors-more$)/.test(c),
    );
    return (next) => (cls ? next.querySelector(`.${cls}`) : null);
};

export const refreshPaperDisplays = (id, { paperView = true } = {}) => {
    const row = findEl({ element: `memory-container--${id}` });
    if (row && !row.classList.contains("is-edit") && state.papers[id]) {
        // what the user opened in the row stays open (a visit, here or elsewhere, re-renders
        // it): note "more…", all authors, "…" menu, ⓘ panel; and the focus stays in it
        const focusTarget = rowFocusTarget(row, document.activeElement);
        const noteOpen = !!row.querySelector(".pm-item-note.is-open");
        const authorsOpen = !!row.querySelector(".memory-authors.is-open");
        const menuOpen = row.classList.contains("menu-open");
        const infoOpen = infoPanelIsOpen() && !!row.querySelector(".pm-info-pop");
        const tpl = document.createElement("template");
        tpl.innerHTML = getMemoryItemHTML(state.papers[id]).trim();
        const next = tpl.content.firstElementChild;
        row.replaceWith(next);
        if (noteOpen) {
            const more = next.querySelector(".pm-note-more");
            next.querySelector(".pm-item-note")?.classList.add("is-open");
            if (more) {
                more.hidden = false;
                more.textContent = "less";
            }
        }
        authorsOpen && expandRowAuthors(next);
        if (menuOpen) {
            next.classList.add("menu-open");
            next.querySelector(".memory-item-more")?.setAttribute("aria-expanded", "true");
        }
        markNotes(next);
        // the panel first: it may be what had the focus
        infoOpen && openInfoPanel(next, next.querySelector(".memory-item-info"), id);
        focusTarget && (focusTarget(next) ?? next).focus({ preventScroll: true });
    }
    paperView && state.currentId === id && refreshPaperViewFields(id);
};

/**
 * Follows Memory writes made anywhere (options page tag manager, another popup, a paper
 * saved by the content script): state is refreshed by onPapersChange. Open edit forms take
 * the new values of the fields they did not edit. When the search results change (a paper
 * added, removed, or no longer matching), the list is rendered again at the same place,
 * unless a form is open (then when it closes); otherwise only the changed rows are.
 * @param {object} opts {paperView: () => boolean, whether the paper view may be refreshed}
 */
export const followMemoryChanges = ({ paperView = () => true } = {}) =>
    onPapersChange((ids) => applyMemoryChanges(ids, { paperView }));

/**
 * What followMemoryChanges does for the papers `ids` (fullMemory calls it itself, to hold
 * it while a dialog is open)
 * @param {string[]} ids
 * @param {object} opts {paperView: () => boolean, whether the paper view may be refreshed}
 */
export const applyMemoryChanges = (ids, { paperView = () => true } = {}) => {
    for (const id of ids) {
        if (state.papers[id]) openEditors.get(id)?.(state.papers[id]);
        else openEditors.delete(id); // deleted elsewhere: its row and form go below
    }
    const results = searchResults();
    const same =
        results.length === state.papersList.length &&
        results.every((p, i) => p.id === state.papersList[i].id);
    if (!same && openEditors.size === 0) {
        state.papersList = results;
        renderListInPlace();
    } else {
        for (const id of ids) {
            if (state.papers[id]) refreshPaperDisplays(id, { paperView: paperView() });
            else findEl({ element: `memory-container--${id}` })?.remove();
        }
    }
    if (state.currentId && ids.includes(state.currentId) && !state.papers[state.currentId])
        log("The paper shown was deleted elsewhere");
    updateMemoryCount();
};

/** displayMemoryTable, keeping as many rows, the scroll position and the focused row */
const renderListInPlace = () => {
    const table = findEl({ element: "memory-table" });
    if (!table) return;
    const shown = table.querySelectorAll(".memory-container").length;
    const focused = document.activeElement?.closest?.(".memory-container")?.id;
    const scroller = findEl({ element: "memory-scroll" });
    const top = scroller ? scroller.scrollTop : window.scrollY;
    displayMemoryTable();
    while (table.querySelectorAll(".memory-container").length < shown && loadMoreMemoryItems());
    if (scroller) scroller.scrollTop = top;
    else window.scrollTo({ top });
    if (focused) findEl({ element: focused })?.focus({ preventScroll: true });
};

export const SAVE_ERROR = "Couldn’t save — try again";
/**
 * Whether a Memory write worked; if not, a quiet message (the popup's toast) and the edit
 * stays as it is so it can be tried again
 * @param {{ok: boolean, error?: string}} answer From memoryOp
 * @returns {boolean}
 */
export const saved = (answer) => {
    if (answer.ok) return true;
    warn("Could not save:", answer.error);
    showToast(SAVE_ERROR);
    return false;
};

/**
 * Saves a paper's note
 * @param {string} id The id of the paper whose note is being saved
 * @param {string} note The content of the note
 */
export const saveNote = async (id, note) => {
    if (!saved(await memoryOp({ op: "patch", id, fields: { note } }))) return false;
    refreshPaperDisplays(id, { paperView: false });
    return true;
};

/**
 * Saves a paper's code link (already checked with normalizeCodeLink)
 * @param {string} id The id of the paper whose code is being saved
 * @param {string} codeLink The link to the paper's code
 */
export const saveCodeLink = async (id, codeLink) => {
    const answer = await memoryOp({ op: "patch", id, fields: { codeLink: codeLink.trim() } });
    if (!saved(answer)) return false;
    refreshPaperDisplays(id, { paperView: false });
    return true;
};

/**
 * Saves a paper's tags and updates the global tag list
 * @param {string} id The paper's id
 * @param {string[]} tags
 * @param {object} opts {paperView: refresh the paper view's fields too}
 */
export const savePaperTags = async (id, tags, { paperView = false } = {}) => {
    const answer = await memoryOp({
        op: "patch",
        id,
        fields: { tags: [...new Set(tags.map((t) => t.trim()).filter(Boolean))].sort() },
    });
    if (!saved(answer)) return false;
    refreshPaperDisplays(id, { paperView });
    return true;
};

export const saveFavoriteItem = async (id, favorite) => {
    const answer = await memoryOp({
        op: "patch",
        id,
        fields: { favorite, favoriteDate: new Date().toJSON() },
    });
    if (!saved(answer)) return false;
    refreshPaperDisplays(id, { paperView: false });
    // the popup's paper view star
    findEl({ element: `checkFavorite--${id}` })?.setAttribute(
        "aria-pressed",
        String(favorite),
    );
    if (state.showFavorites || state.sortKey === "favoriteDate") applyMemorySearch();
    return true;
};

// ---------------------------------
// -----  Search, filters, sort -----
// ---------------------------------

/**
 * "y:>2019", "y: 2017, 2012", "y:17" -> {cmp: "<" | ">" | "=", years: [2019]}.
 * strict: only well-formed queries (what can become a filter pill); otherwise every number
 * found is used, as the search always did.
 * @param {string} text With or without the "y:" prefix
 * @param {boolean} strict
 * @returns {{cmp: string, years: number[]} | null}
 */
export const parseYears = (text, strict = false) => {
    const rest = text.replace(/^y:/i, "").trim();
    if (strict && !/^[<>]?\s*\d{2}(\d{2})?([\s,]+\d{2}(\d{2})?)*$/.test(rest))
        return null;
    const cmp = rest.includes("<") ? "<" : rest.includes(">") ? ">" : "=";
    const years = rest
        .replace(/[<>]/g, "")
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((y) => parseInt(y.length === 4 ? y : "20" + y, 10));
    return { cmp, years };
};

const yearTest =
    ({ cmp, years }) =>
    (paper) => {
        const py = parseInt(paper.year, 10);
        if (cmp === "<") return years.some((y) => py < y);
        if (cmp === ">") return years.some((y) => py > y);
        return years.includes(py);
    };

const wordsOf = (text) => text.toLowerCase().split(/\s+/).filter(Boolean);

const codeTest = (text) => {
    const words = wordsOf(text);
    return (paper) => {
        const code = (paper.codeLink || "").toLowerCase();
        return words.every((w) => code.includes(w));
    };
};

const SEARCH_KEYS = ["title", "author", "note", "tags", "id", "venue"];
/** Free text: every word is in the title, authors, note, tags, id or venue */
const textTest = (text) => {
    const words = wordsOf(text);
    if (!words.length) return null;
    return (paper) => {
        const contents = SEARCH_KEYS.map((key) =>
            Array.isArray(paper[key])
                ? paper[key].join(" ").toLowerCase()
                : String(paper[key] ?? "").toLowerCase(),
        );
        return words.every((w) => contents.some((c) => c.includes(w)));
    };
};

/**
 * The search field's text, before it is committed as a pill. A query starting with t: / c: /
 * y: filters on that field only (as it always did: t: matches parts of tags while typing).
 * @param {string} text
 * @returns {function | null}
 */
const fieldTest = (text) => {
    const prefix = text.slice(0, 2).toLowerCase();
    const rest = text.slice(2);
    if (prefix === "t:") {
        const words = wordsOf(rest);
        if (!words.length) return null;
        return (paper) => {
            const tags = (paper.tags ?? []).map((t) => t.toLowerCase());
            return words.every((w) => tags.some((t) => t.includes(w)));
        };
    }
    if (prefix === "c:") return wordsOf(rest).length ? codeTest(rest) : null;
    if (prefix === "y:") return rest.trim() ? yearTest(parseYears(rest)) : null;
    return textTest(text);
};

/** A committed filter (pill): tags match exactly */
const filterTest = (filter) => {
    if (filter.type === "tag")
        return (paper) => (paper.tags ?? []).includes(filter.value);
    if (filter.type === "code") return codeTest(filter.value);
    if (filter.type === "year") return yearTest(parseYears(filter.value));
    if (filter.type === "fav") return (paper) => !!paper.favorite;
    return () => true;
};

/**
 * The filter a complete t: / c: / y: query would commit, or null. One existing tag per t:
 * ("t: a b" is not a filter); the tag is matched without case and stored as it exists.
 * @param {string} text
 * @returns {{type: string, value: string} | null}
 */
export const parseFilter = (text) => {
    text = text.trim();
    const prefix = text.slice(0, 2).toLowerCase();
    const rest = text.slice(2).trim();
    if (!rest) return null;
    if (prefix === "t:") {
        if (/\s/.test(rest)) return null;
        const tag = [...state.paperTags].find(
            (t) => t.toLowerCase() === rest.toLowerCase(),
        );
        return tag ? { type: "tag", value: tag } : null;
    }
    if (prefix === "c:") return { type: "code", value: rest.replace(/\s+/g, " ") };
    if (prefix === "y:") {
        // "2019 2021" -> "2019, 2021"; "<15" -> "<2015"
        const years = parseYears(rest, true);
        if (!years) return null;
        const op = years.cmp === "=" ? "" : years.cmp;
        return { type: "year", value: op + years.years.join(", ") };
    }
    return null;
};

let searchTimer = null; // a search scheduled by typing (scheduleMemorySearch)
const searchText = () => findEl({ element: "memory-search" })?.value.trim() ?? "";

/**
 * Filters state.sortedPapers into state.papersList: every pill, favourites only and the
 * search field's text must all match. Then re-renders the list and the count.
 */
export const applyMemorySearch = () => {
    clearTimeout(searchTimer);
    searchTimer = null;
    state.showFavorites = state.memoryFilters.some((f) => f.type === "fav");
    state.papersList = searchResults();
    displayMemoryTable();
    updateMemoryCount();
};

/** state.sortedPapers that pass every pill, favourites only and the search text */
const searchResults = () => {
    const tests = [
        ...state.memoryFilters.map(filterTest),
        fieldTest(searchText()),
    ].filter(Boolean);
    return tests.length
        ? state.sortedPapers.filter((p) => tests.every((test) => test(p)))
        : [...state.sortedPapers];
};

/** sortMemory() + the Newest / Oldest direction */
const resortMemory = () => {
    sortMemory();
    if (state.sortReversed) state.sortedPapers.reverse();
};

export const SORT_KEYS = [
    ["lastOpenDate", "Last opened"],
    ["addDate", "Last added"],
    ["year", "Year"],
    ["title", "Title"],
    ["count", "Visits"],
    ["id", "ID"],
];
const FAVOURITE_SORT = ["favoriteDate", "Last favourited"];

/** ["Newest first", "Oldest first"] or the words that fit the sort key */
export const sortDirections = (key) =>
    ["title", "id"].includes(key)
        ? ["A to Z", "Z to A"]
        : key === "count"
          ? ["Most first", "Fewest first"]
          : ["Newest first", "Oldest first"];

const sortName = () =>
    [...SORT_KEYS, FAVOURITE_SORT].find(([k]) => k === state.sortKey)?.[1] ??
    "Last opened";

/**
 * Sorts the Memory by a key and direction, then re-applies the search
 * @param {string} key A paper attribute (lastOpenDate, addDate, year, title, count, id…)
 * @param {boolean} reversed Oldest first (or Z to A, fewest first)
 */
export const setMemorySort = (key, reversed = false) => {
    state.sortKey = key;
    state.sortReversed = reversed;
    resortMemory();
    applyMemorySearch();
    const btn = findEl({ element: "memory-sort-button" });
    if (btn) {
        const label = `Sort: ${sortName().toLowerCase()}, ${sortDirections(key)[reversed ? 1 : 0].toLowerCase()}`;
        btn.setAttribute("aria-label", label);
        btn.dataset.tip = label;
    }
    renderSortMenu();
};

// ----- pills

const FILTER_NAMES = { tag: "tag", code: "code", year: "year" };
const filterText = (f) =>
    f.type === "fav" ? "favourites" : `${FILTER_NAMES[f.type]} ${f.value}`;

/** Filter pills under the field, the "N filters" chip and the favourites star */
export const renderFilters = () => {
    const n = state.memoryFilters.length;
    const row = findEl({ element: "memory-pills" });
    if (row) {
        row.textContent = "";
        state.memoryFilters.forEach((filter, i) => {
            const chip = document.createElement("span");
            chip.className = "pm-chip pm-chip-filter";
            chip.title =
                filter.type === "fav"
                    ? "Favourites only"
                    : `${filter.type}: ${filter.value}`;
            if (filter.type !== "fav") {
                const b = document.createElement("b");
                b.textContent = FILTER_NAMES[filter.type];
                chip.append(b);
            }
            const text = document.createElement("span");
            text.textContent = filter.type === "fav" ? "★ Favourites" : filter.value;
            const x = document.createElement("button");
            x.type = "button";
            x.className = "pm-chip-x";
            x.tabIndex = -1;
            x.setAttribute("aria-label", `Remove the filter: ${filterText(filter)}`);
            x.dataset.tip = "Remove the filter";
            x.innerHTML = icon("x");
            x.addEventListener("click", () => {
                removeFilter(i);
                findEl({ element: "memory-search" })?.focus({ preventScroll: true });
            });
            chip.append(text, x);
            row.append(chip);
        });
        row.hidden = n === 0;
    }
    const chip = findEl({ element: "memory-filter-chip" });
    if (chip) {
        chip.hidden = n === 0;
        chip.innerHTML = `${n} filter${n === 1 ? "" : "s"} ${icon("down")}`;
        chip.setAttribute(
            "aria-label",
            `${n} filter${n === 1 ? "" : "s"}: ${state.memoryFilters.map(filterText).join(", ")}. Click to show the filters`,
        );
    }
    const fav = findEl({ element: "filter-favorites" });
    if (fav) {
        const on = state.memoryFilters.some((f) => f.type === "fav");
        fav.setAttribute("aria-pressed", String(on));
    }
};

const scrollListTop = () => {
    const scroller = findEl({ element: "memory-scroll" });
    if (scroller) scroller.scrollTop = 0;
};

/** Adds a filter pill (no duplicates) and re-applies the search */
export const addFilter = (filter) => {
    if (
        !state.memoryFilters.some(
            (f) => f.type === filter.type && f.value === filter.value,
        )
    )
        state.memoryFilters.push(filter);
    renderFilters();
    applyMemorySearch();
    renderTagPanel();
    scrollListTop();
};

export const removeFilter = (index) => {
    const [removed] = state.memoryFilters.splice(index, 1);
    if (removed?.type === "fav" && state.sortKey === "favoriteDate") {
        state.sortKey = "lastOpenDate";
        state.sortReversed = false;
        resortMemory();
    }
    renderFilters();
    applyMemorySearch();
    renderTagPanel();
};

/** A tag pill on / off (tag list panel) */
export const toggleTagFilter = (tag) => {
    const i = state.memoryFilters.findIndex((f) => f.type === "tag" && f.value === tag);
    i >= 0 ? removeFilter(i) : addFilter({ type: "tag", value: tag });
};

/** Favourites only: the star in the field, shown as a "★ Favourites" pill */
export const toggleFavouritesFilter = () => {
    const i = state.memoryFilters.findIndex((f) => f.type === "fav");
    i >= 0 ? removeFilter(i) : addFilter({ type: "fav", value: "" });
    renderSortMenu();
};

/**
 * Clicking a tag in a row: the search becomes that tag alone, as a pill (no other pill, no
 * favourites-only, no text)
 * @param {string} tag
 */
export const showOnlyTag = (tag) => {
    const input = findEl({ element: "memory-search" });
    if (input) input.value = "";
    state.memoryFilters = [{ type: "tag", value: tag }];
    if (state.sortKey === "favoriteDate") {
        state.sortKey = "lastOpenDate";
        state.sortReversed = false;
        resortMemory();
    }
    hideSearchSuggestions();
    renderFilters();
    applyMemorySearch();
    renderTagPanel();
    renderSortMenu();
    scrollListTop();
};

/** Empties the search field and removes every filter */
export const clearMemorySearch = () => {
    const input = findEl({ element: "memory-search" });
    if (input) input.value = "";
    state.memoryFilters = [];
    if (state.sortKey === "favoriteDate") {
        state.sortKey = "lastOpenDate";
        state.sortReversed = false;
        resortMemory();
    }
    hideSearchSuggestions();
    renderFilters();
    applyMemorySearch();
    renderTagPanel();
};

/** The × in the search field: shown when there is text or a pill */
export const updateSearchClear = () => {
    const x = findEl({ element: "memory-search-x" });
    if (x) x.hidden = !(state.memoryFilters.length > 0 || searchText().length > 0);
};

/** "214" or "12 of 214" in the field and the tab count */
export const updateMemoryCount = () => {
    const total = Object.keys(cleanPapers(state.papers)).length;
    setHTML("memory-count", total);
    updateSearchClear();
    const filtered = state.memoryFilters.length > 0 || searchText().length > 0;
    const el = findEl({ element: "memory-result-count" });
    if (el) el.textContent = filtered ? `${state.papersList.length} of ${total}` : `${total}`;
};

// ----- tag suggestions under the search field (typing t:)

let searchSugg = { tags: [], active: -1 };

export const hideSearchSuggestions = () => {
    clearTimeout(suggTimer);
    suggTimer = null;
    const box = findEl({ element: "memory-tag-suggestions" });
    if (box) box.hidden = true;
    searchSugg = { tags: [], active: -1 };
};

/** Existing tags with their paper counts, filtered by what follows t:; first one preselected */
/** Ranks tags for a query: exact match, then prefix, then more papers, then A to Z */
export const rankTags = (tags, q, counts) =>
    tags.sort(
        (a, b) =>
            (b.toLowerCase() === q) - (a.toLowerCase() === q) ||
            b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q) ||
            counts.get(b) - counts.get(a) ||
            a.localeCompare(b),
    );

const MAX_SUGGESTIONS = 50;
let suggTimer = null;
/** Typing: suggestions are rendered a moment later (large tag lists) */
export const scheduleSearchSuggestions = () => {
    clearTimeout(suggTimer);
    suggTimer = setTimeout(renderSearchSuggestions, 60);
};
/** Renders scheduled suggestions now (before a key acts on them) */
export const flushSearchSuggestions = () => {
    if (suggTimer === null) return;
    renderSearchSuggestions();
};

export const renderSearchSuggestions = () => {
    clearTimeout(suggTimer);
    suggTimer = null;
    const box = findEl({ element: "memory-tag-suggestions" });
    const input = findEl({ element: "memory-search" });
    if (!box || !input) return;
    const m = input.value.match(/^t:\s*(\S*)$/i);
    if (!m) return hideSearchSuggestions();
    const q = m[1].toLowerCase();
    const counts = tagCounts();
    const used = new Set(
        state.memoryFilters.filter((f) => f.type === "tag").map((f) => f.value),
    );
    const matches = rankTags(
        [...counts.keys()].filter((t) => !used.has(t) && t.toLowerCase().includes(q)),
        q,
        counts,
    );
    if (!matches.length) return hideSearchSuggestions();
    // at most 50 rows: keep typing to narrow the list
    const tags = matches.slice(0, MAX_SUGGESTIONS);
    const more = matches.length - tags.length;
    searchSugg = { tags, active: 0 };
    box.innerHTML =
        `<div class="pm-sugg-list">${tags
            .map(
                (t, i) =>
                    `<div class="pm-sugg-row" role="option" data-i="${i}"><span>${markMatch(t, q)}</span><span class="pm-count">${counts.get(t)}</span></div>`,
            )
            .join(
                "",
            )}${more ? `<p class="pm-sugg-note pm-sugg-more">${more} more: keep typing to narrow the list</p>` : ""}</div>` +
        `<div class="pm-sugg-foot"><span><span class="pm-kbd">↑</span><span class="pm-kbd">↓</span> Choose</span><span><span class="pm-kbd">tab</span> or <span class="pm-kbd">↵</span> Add filter</span><span class="pm-spacer"></span><span>${matches.length} of ${counts.size} tags</span></div>`;
    box.hidden = false;
    paintSearchSuggestion();
};

const paintSearchSuggestion = () => {
    const box = findEl({ element: "memory-tag-suggestions" });
    box?.querySelectorAll(".pm-sugg-row").forEach((el) => {
        const on = Number(el.dataset.i) === searchSugg.active;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-selected", String(on));
        on && el.scrollIntoView({ block: "nearest" });
    });
};

export const moveSearchSuggestion = (step) => {
    const n = searchSugg.tags.length;
    if (!n) return false;
    searchSugg.active = (searchSugg.active + step + n) % n;
    paintSearchSuggestion();
    return true;
};

/** The highlighted tag suggestion becomes a pill; the field is emptied */
export const pickSearchSuggestion = (index = searchSugg.active) => {
    const tag = searchSugg.tags[index];
    if (!tag) return false;
    const input = findEl({ element: "memory-search" });
    input.value = "";
    hideSearchSuggestions();
    addFilter({ type: "tag", value: tag });
    return true;
};

/** A complete t: / c: / y: query in the field becomes a pill */
export const commitSearchFilter = () => {
    if (searchSugg.tags.length && pickSearchSuggestion()) return true;
    const input = findEl({ element: "memory-search" });
    const filter = parseFilter(input.value);
    if (!filter) return false;
    input.value = "";
    hideSearchSuggestions();
    addFilter(filter);
    return true;
};

// ----- tag list panel and sort menu

let tagPanelSort = "count"; // "count" | "name"
let tagPanelTags = [];

/** Opens / closes the tag list (the tag icon in the search field) */
export const toggleTagPanel = (open) => {
    const panel = findEl({ element: "memory-tag-panel" });
    if (!panel) return;
    open = open ?? panel.hidden;
    if (open) toggleSortMenu(false);
    panel.hidden = !open;
    findEl({ element: "memory-tags-button" })?.setAttribute(
        "aria-expanded",
        String(open),
    );
    if (open) {
        hideSearchSuggestions();
        renderTagPanel();
    }
};

export const renderTagPanel = () => {
    const panel = findEl({ element: "memory-tag-panel" });
    if (!panel || panel.hidden) return;
    const counts = tagCounts();
    const on = new Set(
        state.memoryFilters.filter((f) => f.type === "tag").map((f) => f.value),
    );
    tagPanelTags = [...counts.keys()].sort((a, b) =>
        tagPanelSort === "name"
            ? a.localeCompare(b)
            : counts.get(b) - counts.get(a) || a.localeCompare(b),
    );
    const rows = tagPanelTags
        .map(
            (t, i) =>
                `<div class="pm-sugg-row${on.has(t) ? " is-on" : ""}" role="option" aria-selected="${on.has(t)}" data-i="${i}"><span>${on.has(t) ? icon("check") + " " : ""}${markMatch(t, "")}</span><span class="pm-count">${counts.get(t)}</span></div>`,
        )
        .join("");
    panel.innerHTML = /*html*/ `
        <div class="pm-tagpanel-head">
            <span class="pm-section-title">Tags</span><span class="pm-count">${counts.size}</span>
            <span class="pm-spacer"></span>
            <button type="button" class="pm-quiet" id="memory-tag-panel-sort" aria-label="Sort the tags: ${tagPanelSort === "name" ? "A to Z" : "Most used"}">${tagPanelSort === "name" ? "A to Z" : "Most used"} ${icon("down")}</button>
            <button type="button" class="pm-quiet pm-ic" id="memory-tag-panel-close" aria-label="Close the tag list" data-tip="Close the tag list">${icon("x")}</button>
        </div>
        <div class="pm-tagpanel-list" role="listbox" aria-label="Tags">${rows || '<p class="pm-sugg-note">No tags yet. Add some with Edit (e).</p>'}</div>
        <div class="pm-sugg-foot">
            <span>Typing <span class="pm-kbd">t:</span> in the search field shows the same list</span>
            <span class="pm-spacer"></span>
            <a href="#" id="memory-manage-tags" class="pm-out" data-tip="Open the tag manager in a new tab">Manage tags</a>
        </div>`;
    // sits over the list, right under the field / pills
    const box = findEl({ element: "memory-container" });
    const scroller = findEl({ element: "memory-scroll" });
    if (box && scroller) {
        const top =
            scroller.getBoundingClientRect().top - box.getBoundingClientRect().top + 4;
        panel.style.top = `${top}px`;
        panel.style.maxHeight = `${box.clientHeight - top - 12}px`;
    }
};

export const handleTagPanelClick = (e) => {
    if (e.target.closest("#memory-tag-panel-close")) return toggleTagPanel(false);
    if (e.target.closest("#memory-tag-panel-sort")) {
        tagPanelSort = tagPanelSort === "count" ? "name" : "count";
        return renderTagPanel();
    }
    if (e.target.closest("#memory-manage-tags")) {
        e.preventDefault();
        return chrome.tabs.create({
            url: chrome.runtime.getURL("options.html#tag-manager"),
        });
    }
    const row = e.target.closest(".pm-sugg-row");
    if (row) toggleTagFilter(tagPanelTags[Number(row.dataset.i)]);
};

/** Opens / closes the sort menu (the sort icon in the search field) */
export const toggleSortMenu = (open) => {
    const menu = findEl({ element: "memory-sort-menu" });
    if (!menu) return;
    open = open ?? menu.hidden;
    if (open) toggleTagPanel(false);
    menu.hidden = !open;
    findEl({ element: "memory-sort-button" })?.setAttribute(
        "aria-expanded",
        String(open),
    );
    renderSortMenu();
};

export const renderSortMenu = () => {
    const menu = findEl({ element: "memory-sort-menu" });
    if (!menu || menu.hidden) return;
    const keys = state.showFavorites ? [...SORT_KEYS, FAVOURITE_SORT] : SORT_KEYS;
    const [first, second] = sortDirections(state.sortKey);
    menu.innerHTML =
        `<p class="pm-sugg-note">Sort by</p>` +
        keys
            .map(
                ([key, name]) =>
                    `<button type="button" role="menuitemradio" aria-checked="${key === state.sortKey}" class="pm-sugg-row${key === state.sortKey ? " is-on" : ""}" data-key="${key}"><span>${key === state.sortKey ? icon("check") + " " : ""}${name}</span></button>`,
            )
            .join("") +
        `<div class="pm-seg" role="group" aria-label="Direction"><button type="button" data-dir="0" aria-pressed="${!state.sortReversed}">${first}</button><button type="button" data-dir="1" aria-pressed="${state.sortReversed}">${second}</button></div>`;
};

export const handleSortMenuClick = (e) => {
    const key = e.target.closest("[data-key]")?.dataset.key;
    if (key) {
        setMemorySort(key, false);
        return toggleSortMenu(false);
    }
    const dir = e.target.closest("[data-dir]")?.dataset.dir;
    if (dir) setMemorySort(state.sortKey, dir === "1");
};

// ------------------------
// -----  List display -----
// ------------------------

/** Shows "more…" under the notes taller than their 3 lines (needs the list to be visible) */
export const markNotes = (root) =>
    requestAnimationFrame(() => {
        root?.querySelectorAll?.(".pm-item-note").forEach((el) => {
            const p = el.querySelector("p");
            const btn = el.querySelector(".pm-note-more");
            if (!p || !btn || el.classList.contains("is-open")) return;
            btn.hidden = !(p.scrollHeight > p.clientHeight + 1);
        });
    });

/**
 * Renders a page of state.papersList (state.memoryItemsPerPage rows) into #memory-table;
 * page 0 replaces the list. With nothing to show: the "no result" / empty Memory state.
 * @param {number} pagination The page to render
 */
export const displayMemoryTable = (pagination = 0) => {
    const start = Date.now();
    if (pagination === 0) state.currentMemoryPagination = 0;
    if (listRenderer?.(pagination)) return; // fullMemory's table
    const memoryTable = findEl({ element: "memory-table" });
    if (!memoryTable) return;

    const n = state.memoryItemsPerPage;
    const rows = [];
    for (const paper of state.papersList.slice(pagination * n, (pagination + 1) * n)) {
        try {
            rows.push(getMemoryItemHTML(paper));
        } catch (error) {
            log("displayMemoryTable error:", error, paper);
        }
    }
    if (pagination === 0) {
        memoryTable.innerHTML = state.papersList.length
            ? rows.join("")
            : getMemoryEmptyHTML(
                  searchText(),
                  Object.keys(cleanPapers(state.papers)).length === 0,
              );
        paintIcons(memoryTable);
    } else {
        memoryTable.insertAdjacentHTML("beforeend", rows.join(""));
    }
    markNotes(memoryTable);
    addEventsToMemoryItems();
    info("Display duration (s): " + (Date.now() - start) / 1e3);
};

let listRenderer = null;
/**
 * Another way to show state.papersList (fullMemory's table): called with the page to render
 * instead of the rows; returns false to let the rows be rendered
 * @param {(pagination: number) => boolean} fn
 */
export const setListRenderer = (fn) => (listRenderer = fn);

/** Renders the next page of rows, if any */
export const loadMoreMemoryItems = () => {
    const shown = (state.currentMemoryPagination + 1) * state.memoryItemsPerPage;
    if (shown >= state.papersList.length) return false;
    state.currentMemoryPagination += 1;
    displayMemoryTable(state.currentMemoryPagination);
    return true;
};

/**
 * Called when the Memory is built (popup start, after a sync or a manual parse, fullMemory)
 */
export const makeMemoryHTML = async () => {
    renderFilters();
    applyMemorySearch();
    addEventsToMemoryControls();
};

// -------------------------
// -----  Row edit form -----
// -------------------------

/**
 * Opens the edit form in a paper's row (e, or ↵ when it is the default action): tags with
 * suggestions, code link (same checks as the paper view), note. Cancel / Save (⌘↵).
 * @param {string} id
 */
/** paper id -> reconcile(storedPaper) of its open row edit form */
export const openEditors = new Map();

export const openMemoryItemEdit = (id) => {
    if (!state.papers[id]) return;
    if (findEl({ element: `memory-container--${id}` })?.classList.contains("is-edit")) {
        findEl({ element: `memory-container--${id}` }).querySelector(".pm-tagin")?.focus();
        return;
    }
    // one form at a time
    document
        .querySelectorAll("#memory-table .memory-container.is-edit")
        .forEach((other) =>
            closeMemoryItemEdit(other.id.split("--")[1], { focus: false, reapply: false }),
        );
    const row = findEl({ element: `memory-container--${id}` });
    if (!row) return;

    row.classList.add("is-edit");
    row.classList.remove("menu-open");
    mountMemoryEditForm(row, id, { onClose: () => closeMemoryItemEdit(id) });
};

/**
 * The edit form of a paper, appended to `host` (a Memory row, fullMemory's detail pane):
 * tags with suggestions, code link (same checks as the paper view), note; saved as you type.
 * Done / ⌘↵ saves and calls onClose (not on an invalid code link, unless forced by Esc).
 * @param {HTMLElement} host
 * @param {string} id
 * @param {object} opts {onClose: called once the form is saved and should go}
 * @returns {HTMLFormElement}
 */
export const mountMemoryEditForm = (host, id, { onClose }) => {
    const paper = state.papers[id];
    host.insertAdjacentHTML("beforeend", getMemoryEditHTML(paper));
    const form = host.querySelector(".pm-edit");
    const key = form.querySelector("[data-mod-enter]");
    if (key) key.textContent = isMac ? "⌘↵" : "Ctrl ↵";
    const code = form.querySelector(".form-code-input");
    const msg = form.querySelector(".pm-code-msg");
    const note = form.querySelector(".form-note-textarea");
    note.value = paper.note || ""; // not in the markup: a leading line break would be lost

    const checkCode = (showError) => {
        const result = normalizeCodeLink(code.value);
        const error = showError && result.error;
        code.closest(".pm-field").classList.toggle("is-invalid", !!error);
        msg.classList.toggle("is-error", !!error);
        if (error) {
            msg.innerHTML = `${icon("info", "pm-i-sm")}${result.error}`;
            msg.hidden = false;
        } else if (result.url && result.url !== code.value.trim()) {
            msg.textContent = `Will be saved as ${result.url}`;
            msg.hidden = false;
        } else {
            msg.hidden = true;
        }
        return result;
    };
    // fields edited here and not saved yet: only those are written, the others follow
    // changes made elsewhere (reconcile)
    const dirty = { tags: false, note: false, codeLink: false };
    const hint = form.querySelector(".pm-edit-hint");
    const hintText = hint?.textContent ?? "";
    /** The form's hint says when the last save failed (quietly) */
    const showFormError = (failed) => {
        if (!hint) return;
        hint.textContent = failed ? SAVE_ERROR : hintText;
        hint.classList.toggle("is-error", failed);
    };
    /**
     * Saves the edited fields. Returns "ok", "invalid" (a code link that is not a URL: not
     * saved) or "failed" (the write failed: the edits stay, the form stays open).
     */
    const persist = async (showError = false) => {
        const result = checkCode(showError);
        const fields = {};
        if (dirty.tags) fields.tags = [...new Set(tags.getTags())].sort();
        if (dirty.note) fields.note = note.value;
        if (dirty.codeLink && !result.error) fields.codeLink = result.url;
        if (Object.keys(fields).length) {
            const answer = await memoryOp({ op: "patch", id, fields });
            showFormError(!answer.ok);
            if (!answer.ok) {
                warn("Could not save:", answer.error);
                return "failed"; // the edits stay, marked as not saved
            }
            // what was written is clean again, unless edited meanwhile
            if (
                "tags" in fields &&
                fields.tags.join() === [...new Set(tags.getTags())].sort().join()
            )
                dirty.tags = false;
            if ("note" in fields && fields.note === note.value) dirty.note = false;
            if ("codeLink" in fields && normalizeCodeLink(code.value).url === fields.codeLink)
                dirty.codeLink = false;
            state.currentId === id && refreshPaperViewFields(id);
        }
        return result.error ? "invalid" : "ok";
    };
    /** A change made elsewhere to this paper: fields not edited here take its values */
    const reconcile = (stored) => {
        if (!dirty.tags) tags.setTags(stored.tags ?? []);
        if (!dirty.note && document.activeElement !== note) {
            note.value = stored.note ?? "";
            fitTextarea(note);
        }
        if (!dirty.codeLink && document.activeElement !== code) {
            code.value = stored.codeLink ?? "";
            checkCode(false);
        }
    };
    openEditors.set(id, reconcile);
    const persistSoon = delay(persist, 300);
    const tags = createTagField({
        root: form.querySelector(".pm-edit-tags"),
        tags: paper.tags,
        onChange: () => {
            dirty.tags = true;
            persist();
        },
    });
    /**
     * Done / ⌘↵: save and close (stays open on an invalid code link). Esc: close anyway.
     * Resolves with whether the form closed.
     */
    const done = async (force = false) => {
        tags.commitPending();
        const result = await persist(true);
        if (result === "failed") return false; // not saved: the form stays open with its edits
        if (result === "invalid" && !force) return code.focus(), false;
        onClose();
        return true;
    };
    // fullMemory awaits it (layout change, drawer close): true once saved and closed
    form.finish = done;
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        done();
    });
    // Esc from outside the form (the row, a button…): handlers.js handleEditKeys
    form.addEventListener("pm-edit-close", () => done(true));
    form.addEventListener("keydown", (e) => {
        if (e.isComposing || e.keyCode === 229) return; // IME composing: not a shortcut
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            done();
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done(true);
        } else if (e.key === "Enter" && e.target === code) {
            e.preventDefault(); // Enter in the code input does not submit
        }
    });
    form.querySelector(".pm-code-open").addEventListener("click", () => {
        const result = checkCode(true);
        result.url && focusExistingOrCreateNewURLTab(result.url);
    });
    code.addEventListener("input", () => {
        dirty.codeLink = true;
        checkCode(false);
        persistSoon();
    });
    code.addEventListener("blur", () => checkCode(true));
    note.addEventListener("input", () => {
        dirty.note = true;
        fitTextarea(note);
        persistSoon();
    });
    fitTextarea(note);
    tags.focus();
    return form;
};

/**
 * Closes a row's edit form (everything is already saved). The search is applied again, since
 * the edit may have taken the paper out of the filters; the focus goes back to the row, or to
 * the row now in its place, or to the search field.
 * @param {string} id
 * @param {object} opts {focus: give the focus back, reapply: re-apply the search}
 */
export const closeMemoryItemEdit = (id, { focus = true, reapply = true } = {}) => {
    openEditors.delete(id);
    // fullMemory applies the Memory changes it held while the form was open
    document.dispatchEvent(new CustomEvent("pm-memory-edit-closed"));
    const row = findEl({ element: `memory-container--${id}` });
    if (!row) return;
    row.classList.remove("is-edit");
    row.querySelector(".pm-edit")?.remove();
    if (!reapply) return refreshPaperDisplays(id, { paperView: false });
    const rows = () => [...document.querySelectorAll("#memory-table .memory-container")];
    const index = rows().indexOf(row);
    const scroller = findEl({ element: "memory-scroll" });
    const top = scroller?.scrollTop ?? 0;
    applyMemorySearch();
    while (rows().length <= index && loadMoreMemoryItems());
    if (scroller) scroller.scrollTop = top;
    if (!focus) return;
    const left = rows();
    const target =
        findEl({ element: `memory-container--${id}` }) ??
        left[Math.min(index, left.length - 1)] ??
        findEl({ element: "memory-search" });
    target?.focus({ preventScroll: false });
};

// -----------------------------------
// -----  Opening / closing the tab -----
// -----------------------------------

/** The tab header scrolls away with the list; returns on a wheel / touch scroll-up */
export const setMemoryScrolled = (scrolled) =>
    findEl({ element: "pm-shell" })?.classList.toggle("pm-mv-scrolled", scrolled);

/**
 * Opens the Memory tab (from the tab, `a`, or "Open Memory"); the search field gets the focus
 */
export const openMemory = () => {
    state.prefsIsOpen && closeMenu();
    state.memoryIsOpen = true;
    setActiveTab();
    findEl({ element: "pm-shell" })?.classList.add("pm-mem-open");
    setMemoryScrolled(false);
    showId("memory-container", "flex");
    findEl({ element: "memory-search" })?.focus();
    markNotes(findEl({ element: "memory-table" }));
};

/**
 * Closes the Memory tab, back to the Paper tab; the search, filters and sort are reset
 * (unless the "Keep search and filters" pref is on)
 */
export const closeMemory = () => {
    hideId("memory-container");
    state.memoryIsOpen = false;
    findEl({ element: "pm-shell" })?.classList.remove("pm-mem-open");
    setMemoryScrolled(false);
    toggleTagPanel(false);
    toggleSortMenu(false);
    hideSearchSuggestions();
    setActiveTab();
    // "Keep search and filters when leaving the Memory": kept until the popup closes
    if (state.prefs.checkKeepMemorySearch) return;
    const input = findEl({ element: "memory-search" });
    if (input) input.value = "";
    state.memoryFilters = [];
    renderFilters();
    if (state.sortKey !== "lastOpenDate" || state.sortReversed) {
        setMemorySort("lastOpenDate", false);
    } else {
        applyMemorySearch();
    }
};

/** Typing in the search field: the list is filtered a little later (large Memories) */
export const scheduleMemorySearch = () => {
    clearTimeout(searchTimer);
    const n = state.sortedPapers.length;
    searchTimer = setTimeout(applyMemorySearch, n < 20 ? 0 : n < 100 ? 100 : 200);
};
/** Runs a scheduled search now (before Tab moves the focus into the list it re-renders) */
export const flushMemorySearch = () => {
    if (searchTimer === null) return;
    clearTimeout(searchTimer);
    searchTimer = null;
    applyMemorySearch();
};

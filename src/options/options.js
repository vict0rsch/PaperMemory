// Options page (design-review/v2/options.html): one page, six groups, a sticky side nav with
// a settings search. Every pref is written with updatePrefs (same keys as the popup menu);
// sections live in tags.js, io.js and syncSettings.js.
import {
    getStorage,
    setStorage,
    getPrefs,
    updatePrefs,
    onPrefsChange,
    getDefaultKeyboardAction,
    setDefaultKeyboardAction,
    onPapersChange,
} from "@pmu/data.js";
import { state, prefsCheckDefaultFalse } from "@pmu/config.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import { allSources } from "@pmu/sources/index.js";
import { log, logError, escapeHtml } from "@pmu/functions.js";
import {
    tryDBLP,
    tryCrossRef,
    trySemanticScholar,
    tryOpenAlex,
    validDoi,
} from "@pmu/preprintMatching.js";
import { initSyncAndState, pushToRemote } from "@pmu/sync.js";
import { paintIcons } from "@pm/popup/js/icons.js";
import { setupTooltips } from "@pm/popup/js/tooltip.js";
import { loadShortcuts, openShortcutSettings } from "@pm/popup/js/shortcuts.js";
import { setupTopbar } from "@pm/shared/js/topbar.js";
import { setupTags, refreshTags, tagsAreBusy } from "@pm/options/tags.js";
import { setupIO, refreshIO } from "@pm/options/io.js";
import { setupSync } from "@pm/options/syncSettings.js";

const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// ------------------------------
// -----  Anchors (old ids)  -----
// ------------------------------

/**
 * Anchors of the previous options page (links in the popup, bibMatcher, docs, bookmarks)
 * -> where that content is now. Ids that still exist (auto-tagging, preprint-matching,
 * select-sources, import-papers, tag-manager…) need no entry.
 */
export const ANCHOR_ALIASES = {
    "paperswithcode-preferences": "code-links",
    pwc: "code-links",
    "pwc-about-title": "code-links",
    "auto-tags": "auto-tagging",
    preprints: "preprint-matching",
    sources: "select-sources",
    "data-management": "data",
    "memory-exports-title": "export-everything",
    "memory-export-tags-title": "export-by-tag",
    "overwrite-container": "restore",
    "online-synchronization": "sync",
    "sync-how-it-works": "sync",
    "sync-syncing-state-title": "sync",
    shortcuts: "keyboard",
    "keyboard-shortcuts": "keyboard",
};

/** Follows #hash (an old one is replaced by its new id) and briefly marks the target */
const goToHash = () => {
    const hash = decodeURIComponent(location.hash.slice(1));
    if (!hash) return;
    const id = ANCHOR_ALIASES[hash] ?? hash;
    const target = $(id);
    if (!target) return;
    if (id !== hash) history.replaceState(null, "", `#${id}`);
    target.scrollIntoView({ block: "start" });
    const card = target.closest(".o-card") ?? target;
    if (!target.classList.contains("o-section")) {
        card.classList.add("is-target");
        setTimeout(() => card.classList.remove("is-target"), 1600);
    }
};

// -----------------------------
// -----  Nav and search  -----
// -----------------------------

const sections = () => [...document.querySelectorAll(".o-section")];

/** aria-current on the nav item of the section at the top of the window */
const markCurrentSection = () => {
    const visible = sections().filter((s) => !s.classList.contains("is-filtered"));
    let current = visible[0];
    // a section the nav scrolled to stops at scroll-padding + scroll-margin from the top
    const landing = (s) =>
        (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) +
        (parseFloat(getComputedStyle(s).scrollMarginTop) || 0) +
        8;
    for (const s of visible)
        if (s.getBoundingClientRect().top < landing(s)) current = s;
    // at the very bottom the last section is current even if it never reaches the top
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 2)
        current = visible.at(-1) ?? current;
    document.querySelectorAll(".o-nav a").forEach((a) => {
        if (a.dataset.nav === current?.id) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
    });
};

/** Base count of a nav item (sources on / total; tags), shown while not searching */
const setNavCount = (id, text) => {
    const link = document.querySelector(`[data-nav="${id}"]`);
    link.dataset.count = text;
    if (!$("settings-search").value.trim())
        link.querySelector(".pm-count").textContent = text;
};

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Filters the settings: a [data-s] item is shown when every word of the query is in its text
 * (label, help, options) or its data-k keywords; cards and sections without a match hide.
 * The nav shows how many settings match in each group.
 * @param {string} query
 */
export const filterSettings = (query) => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const searching = words.length > 0;
    let total = 0;
    for (const section of sections()) {
        let inSection = 0;
        for (const item of section.querySelectorAll("[data-s]")) {
            const text = normalize(`${item.textContent} ${item.dataset.k ?? ""}`);
            const match = !searching || words.every((w) => text.includes(w));
            item.classList.toggle("is-filtered", !match);
            if (match) inSection++;
        }
        for (const card of section.querySelectorAll(".o-card")) {
            const own = card.matches("[data-s]");
            const shown = own
                ? !card.classList.contains("is-filtered")
                : [...card.querySelectorAll("[data-s]")].some(
                      (i) => !i.classList.contains("is-filtered"),
                  );
            card.classList.toggle("is-filtered", !shown);
            // the first row left in a card has no top border
            card.querySelectorAll(".o-row").forEach((r) =>
                r.classList.remove("is-first"),
            );
            const first = [...card.querySelectorAll(":scope > .o-row")].find(
                (r) => !r.classList.contains("is-filtered"),
            );
            if (
                searching &&
                first &&
                !first.previousElementSibling?.matches(".o-card-head")
            )
                first.classList.add("is-first");
        }
        section.classList.toggle("is-filtered", searching && inSection === 0);
        total += inSection;
        const link = document.querySelector(`[data-nav="${section.id}"]`);
        link.classList.toggle("is-empty", searching && inSection === 0);
        link.querySelector(".pm-count").textContent = searching
            ? inSection || ""
            : (link.dataset.count ?? "");
    }
    $("search-empty").hidden = !searching || total > 0;
    $("search-empty-text").textContent = `No setting matches “${query.trim()}”.`;
    markCurrentSection();
};

const setupNavAndSearch = () => {
    const search = $("settings-search");
    search.addEventListener("input", () => {
        filterSettings(search.value);
        if (search.value.trim()) window.scrollTo({ top: 0 });
    });
    search.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && search.value) {
            e.preventDefault();
            search.value = "";
            filterSettings("");
        }
    });
    $("search-clear").addEventListener("click", () => {
        search.value = "";
        filterSettings("");
        search.focus();
    });
    // "/" focuses the search, unless typing somewhere
    document.addEventListener("keydown", (e) => {
        if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
        const t = e.target;
        if (t.closest?.("input, textarea, select, [contenteditable], dialog")) return;
        e.preventDefault();
        search.focus();
        search.select();
    });
    window.addEventListener("scroll", markCurrentSection, { passive: true });
    window.addEventListener("hashchange", goToHash);
    markCurrentSection();
};

// -------------------
// -----  Prefs  -----
// -------------------

/** checkNoAuto is shown inverted ("Record papers automatically") */
const showPref = (el, value) => {
    el.checked = el.hasAttribute("data-invert") ? !value : !!value;
};

const prefValue = (prefs, key) =>
    prefs.hasOwnProperty(key) ? prefs[key] : !prefsCheckDefaultFalse.includes(key);

const setupPrefs = async () => {
    const prefs = await getPrefs(); // also stores the defaults of a new user
    const inputs = [...document.querySelectorAll("input[data-pref]")];
    for (const el of inputs) {
        showPref(el, prefValue(prefs, el.id));
        el.addEventListener("change", () => {
            const value = el.hasAttribute("data-invert") ? !el.checked : el.checked;
            updatePrefs({ [el.id]: value }).then(() =>
                log(`Settings saved for ${el.id} (${value})`),
            );
        });
    }
    // changed elsewhere (popup menu, another options tab)
    onPrefsChange((stored) => {
        for (const el of inputs)
            if (stored.hasOwnProperty(el.id)) showPref(el, stored[el.id]);
    });

    const action = $("memory-item-default-action");
    action.value = await getDefaultKeyboardAction();
    action.addEventListener("change", () => setDefaultKeyboardAction(action.value));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.defaultKeyboardAction?.newValue)
            action.value = changes.defaultKeyboardAction.newValue;
    });
};

// ---------------------
// -----  Sources  -----
// ---------------------

const COLLAPSED_SOURCES = 15;
let sourcesExpanded = false;

/** Sources the user can turn off: [{key, name, domain}], by name */
const sourceList = () =>
    allSources()
        .filter((S) => S.name !== "website")
        .map((S) => ({
            key: S.name,
            name: S.displayName.split("(")[0].trim(),
            domain: S.patterns.find((p) => typeof p === "string")?.split("/")[0] ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

const renderSources = async () => {
    const ignore = (await getStorage("ignoreSources")) ?? {};
    const all = sourceList();
    const q = normalize($("sources-filter").value.trim());
    const matching = q
        ? all.filter((s) => normalize(`${s.name} ${s.domain} ${s.key}`).includes(q))
        : all;
    const shown =
        q || sourcesExpanded ? matching : matching.slice(0, COLLAPSED_SOURCES);
    const box = $("select-sources-container");
    box.innerHTML = shown
        .map(
            (s) => /*html*/ `
        <label class="o-cell${ignore[s.key] ? " is-off" : ""}">
            <input type="checkbox" class="pm-check" id="source-${escapeHtml(s.key)}" data-source="${escapeHtml(s.key)}"${ignore[s.key] ? "" : " checked"} />${escapeHtml(s.name)}
            <small>${escapeHtml(s.domain)}</small>
        </label>`,
        )
        .join("");
    $("sources-none").hidden = matching.length > 0;
    const on = all.filter((s) => !ignore[s.key]).length;
    $("sources-count").textContent = q
        ? `${matching.length} of ${all.length} sources · ${on} on`
        : `${on} of ${all.length} on`;
    $("sources-filter").placeholder = `Filter ${all.length} sources`;
    const more = $("sources-show-all");
    more.hidden = !!q || all.length <= COLLAPSED_SOURCES;
    more.setAttribute("aria-expanded", String(sourcesExpanded));
    more.querySelector("span").textContent = sourcesExpanded
        ? "Show fewer"
        : `Show all ${all.length}`;
    more.classList.toggle("is-open", sourcesExpanded);
    setNavCount("capture", `${on}/${all.length}`);
};

const setupSources = async () => {
    // as before: every known source gets an explicit value in storage
    const ignore = (await getStorage("ignoreSources")) ?? {};
    for (const { key } of sourceList()) ignore[key] = ignore[key] ?? false;
    await setStorage("ignoreSources", ignore);

    $("select-sources-container").addEventListener("change", async (e) => {
        const key = e.target.dataset.source;
        if (!key) return;
        const stored = (await getStorage("ignoreSources")) ?? {};
        stored[key] = !e.target.checked;
        log("Updating source", key, "to", stored[key]);
        await setStorage("ignoreSources", stored);
        e.target.closest(".o-cell").classList.toggle("is-off", !e.target.checked);
        renderSources();
    });
    const setAll = async (on) => {
        const stored = (await getStorage("ignoreSources")) ?? {};
        for (const { key } of sourceList()) stored[key] = !on;
        await setStorage("ignoreSources", stored);
        renderSources();
    };
    $("sources-all-on").addEventListener("click", () => setAll(true));
    $("sources-all-off").addEventListener("click", () => setAll(false));
    $("sources-filter").addEventListener("input", renderSources);
    $("sources-show-all").addEventListener("click", () => {
        sourcesExpanded = !sourcesExpanded;
        renderSources();
    });
    await renderSources();
};

// -------------------------------
// -----  Preprint matching  -----
// -------------------------------

let preprints = [];

const findPreprints = () =>
    state.sortedPapers
        .filter((paper) => !paper.venue && paper.source !== "website")
        .map((value) => ({ value, sort: Math.random() })) // randomize
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);

let matching = false; // a check is running: its button stays disabled

const showPreprintCount = () => {
    preprints = findPreprints();
    const n = preprints.length;
    $("start-matching").textContent = `Check ${plural(n, "preprint")}`;
    $("preprints-help").textContent = n
        ? `${plural(n, "paper")} ${n === 1 ? "has" : "have"} no publication venue yet.`
        : "Every paper has a publication venue.";
    $("start-matching").disabled = n === 0 || matching;
};

/** Writes the accepted changes on the paper as stored now (not a stale copy) */
const registerUpdate = async (update) => {
    const id = update.paper.id;
    const fields = Object.fromEntries(
        Object.entries(update).filter(([k, v]) => k !== "paper" && v),
    );
    // a paper deleted meanwhile is not re-created (patch of an unknown id: no-op)
    const answer = await memoryOp({ op: "patch", id, fields });
    if (!answer.ok) return false;
    pushToRemote(); // the gist follows; the proposal is done once saved here
    return true;
};

const UPDATE_LABELS = {
    venue: "Venue",
    venueFull: "Full venue",
    year: "Year",
    note: "Note",
    doi: "DOI",
    codeLink: "Code",
};

const addPreprintUpdate = (update) => {
    const item = document.createElement("div");
    item.className = "o-update";
    const title = document.createElement("div");
    title.className = "pm-row-label";
    title.textContent = update.paper.title;
    const dl = document.createElement("dl");
    for (const [k, v] of Object.entries(update)) {
        if (k === "paper" || !v) continue;
        const dt = document.createElement("dt");
        dt.textContent = UPDATE_LABELS[k] ?? (k === "bibtex" ? "BibTeX" : k);
        const dd = document.createElement("dd");
        dd.textContent = k === "bibtex" ? "Updated with the publication" : v;
        if (k === "bibtex") dd.title = v;
        dl.append(dt, dd);
    }
    const btns = document.createElement("div");
    btns.className = "o-btns";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "pm-btn pm-btn-primary pm-btn-sm";
    ok.textContent = "Accept";
    ok.addEventListener("click", async () => {
        ok.disabled = true;
        if (await registerUpdate(update)) return item.remove();
        ok.disabled = false;
        ok.textContent = "Couldn’t save — try again"; // the proposal stays
    });
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "pm-btn pm-btn-ghost pm-btn-sm";
    skip.textContent = "Skip";
    skip.addEventListener("click", () => item.remove());
    btns.append(ok, skip);
    const text = document.createElement("div");
    text.className = "pm-row-text";
    text.append(title, dl);
    item.append(text, btns);
    $("updates-to-confirm").append(item);
};

// in order; the first one that finds a publication wins
const MATCHERS = [
    ["dblp.org", tryDBLP],
    ["crossref.org", tryCrossRef],
    ["semanticscholar.org", trySemanticScholar],
    ["openalex.org", tryOpenAlex],
];

let progressHTML = null; // the progress line, replaced by the result when done

const startMatching = async () => {
    const papers = preprints;
    matching = true;
    // a second check: the progress line again (the first one ended with its result)
    progressHTML ??= $("matching-status").innerHTML;
    $("matching-status").innerHTML = progressHTML;
    $("start-matching").disabled = true;
    $("updates-to-confirm").textContent = "";
    $("matching-progress-container").hidden = false;
    $("matching-status-total").textContent = papers.length;
    const bar = $("manual-parsing-progress-bar");
    const provider = (name) => ($("matching-status-provider").textContent = name);
    let failed = null;
    try {
        for (const [idx, paper] of papers.entries()) {
            $("matching-status-index").textContent = idx + 1;
            $("matching-status-title").textContent = paper.title;
            bar.style.width = `${(idx / papers.length) * 100}%`;
            for (const [name, tryMatch] of MATCHERS) {
                provider(name);
                const match = await tryMatch(paper);
                if (!match?.venue) continue;
                const { venue, venueFull, bibtex, doi } = match;
                addPreprintUpdate({
                    venue,
                    venueFull,
                    // the publication's year (saved with the rest, in one operation)
                    year:
                        match.year &&
                        String(match.year) !== String(paper.year) &&
                        String(match.year),
                    note: !paper.note && match.note,
                    bibtex,
                    doi: !paper.doi && validDoi(doi),
                    paper,
                });
                break;
            }
        }
    } catch (error) {
        failed = error;
        logError("[preprints]", error);
    } finally {
        // whatever happened, the check is over: the button and the status follow
        bar.style.width = "100%";
        matching = false;
        showPreprintCount();
        const found = $("updates-to-confirm").children.length;
        $("matching-status").textContent = failed
            ? `Stopped: ${failed.message ?? failed}. ${plural(found, "paper")} to review below.`
            : found
              ? `Done. ${plural(found, "paper")} to review below.`
              : "Done. No published version found.";
    }
};

// --------------------------
// -----  Memory changes -----
// --------------------------

/** Re-renders everything that shows the Memory (counts, tags, rules, exports) */
/**
 * Re-renders what shows the Memory. `fields`: the paper fields that changed ("+" / "-": a
 * paper added / removed); null: everything. A visit (count, lastOpenDate) changes nothing
 * shown here; tags and auto-tag counts are only rebuilt when tags, titles or authors change.
 * @param {Set<string> | null} fields
 */
const refreshMemoryViews = (fields = null) => {
    const any = (...keys) => !fields || keys.some((k) => fields.has(k));
    if (any("+", "-")) {
        const n = state.sortedPapers.length;
        $("memory-size").textContent = `${plural(n, "paper")} in your Memory. `;
    }
    if (any("+", "-", "venue", "source")) showPreprintCount();
    if (any("+", "-", "tags")) refreshIO();
    const tags = any("+", "-", "tags");
    const rules = any("+", "-", "title", "author");
    if (!tags && !rules) return;
    // a rename or a rule being typed: try again in a moment
    if (tagsAreBusy()) return setTimeout(() => refreshMemoryViews(fields), 1000);
    refreshTags({ tags, rules });
};

/** Papers changed in another page (popup, import running here): reload the state */
const followMemoryChanges = () => {
    let timer;
    let fields = new Set();
    // onPapersChange keeps state.papers and its lists on the stored Memory
    onPapersChange((ids, changed) => {
        for (const f of changed) fields.add(f);
        clearTimeout(timer);
        timer = setTimeout(() => {
            const all = fields;
            fields = new Set();
            refreshMemoryViews(all);
        }, 150);
    });
};

// ------------------
// -----  Start -----
// ------------------

(async () => {
    paintIcons();
    setupTooltips();
    setupTopbar("options");
    setupNavAndSearch();
    await initSyncAndState();
    await setupPrefs();
    await setupSources();
    await setupTags(() => refreshMemoryViews());
    setupIO();
    refreshMemoryViews();
    followMemoryChanges();
    $("start-matching").addEventListener("click", startMatching);
    $("open-browser-shortcuts").addEventListener("click", openShortcutSettings);
    await loadShortcuts();
    filterSettings($("settings-search").value);
    goToHash();
    document.documentElement.dataset.optionsReady = "true";
    await setupSync(() => refreshMemoryViews());
})();

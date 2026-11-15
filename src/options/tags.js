// Options page, "Tags & matching": auto-tagging rules (storage "autoTags", same format as
// before: [{id, title, authors, tags}]) with a live "N papers" count, and the tag manager
// (rename, merge, delete, near-duplicate notice).
import { state } from "@pmu/config.js";
import { getStorage, setStorage } from "@pmu/data.js";
import { memoryOp } from "@pmu/memoryQueue.js";
import { isRiskyPattern } from "@pmu/paper.js";
import { pushToRemote } from "@pmu/sync.js";
import { createTagField, similarTagGroups } from "@pm/popup/js/tagfield.js";
import { icon } from "@pm/popup/js/icons.js";
import { confirmDialog } from "@pm/options/dialog.js";

const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
let onMemoryChange = () => {}; // set by setupTags: refreshes the rest of the page

// ------------------------------
// -----  Saving tag changes -----
// ------------------------------

/** Tags after a mapping: each tag in `mapping` becomes its value (null: removed), unique */
const retag = (tags, mapping) =>
    [...new Set(tags.map((t) => (mapping.has(t) ? mapping.get(t) : t)))].filter(
        Boolean,
    );

let tagOps = Promise.resolve();
/**
 * Saves a tag rename / merge / delete, one at a time: pending rule edits are saved first,
 * then the papers that have one of the tags are retagged as stored now (memoryOp: a
 * paper saved meanwhile elsewhere is kept), then the rules (so they stop adding the old
 * tag); then the page is refreshed and the gist updated (not awaited).
 * @param {Map<string, string | null>} mapping
 * @returns {Promise<number>} How many papers changed
 */
const applyTagMapping = (mapping) => {
    const run = tagOps.then(async () => {
        await flushRules();
        // applied by the background's queue to the papers as stored then
        const answer = await memoryOp({ op: "retag", mapping: [...mapping] });
        if (!answer.ok) {
            setStatus("Couldn’t save — try again", true);
            return null; // nothing changed: the rules keep their tags too
        }
        const changed = answer.result.changed;
        if (rules.some((r) => r.tags?.some((t) => mapping.has(t)))) {
            for (const rule of rules)
                if (rule.tags) rule.tags = retag(rule.tags, mapping);
            await writeRules();
            renderRules();
        }
        pushToRemote(); // the gist follows; the page does not wait for the upload
        onMemoryChange();
        return changed;
    });
    tagOps = run.catch(() => {});
    return run;
};

// ------------------------------
// -----  Auto-tagging rules -----
// ------------------------------

// Each rule: {id, title, authors, tags} as edited, and `good`: the last patterns checked
// valid and fast enough, which is what gets stored (an invalid or too slow pattern is
// shown, never saved).
let rules = [];
let saveTimer = null;
let lastWrite = Promise.resolve();

const writeRules = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    const stored = rules.map((r) => ({
        id: r.id,
        title: r.good.title,
        authors: r.good.authors,
        tags: r.tags ?? [],
    }));
    lastWrite = lastWrite.then(() => setStorage("autoTags", stored));
    return lastWrite;
};
const saveRules = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(writeRules, 300);
};
// rule -> its debounced check, run at once by flushRules
const pendingChecks = new Map();

/** Writes pending edits now: debounced checks run, checks in progress end first */
const flushRules = async () => {
    await Promise.all([...pendingChecks.values()].map((check) => check()));
    await countQueue;
    if (saveTimer) await writeRules();
    await lastWrite;
};

// Counting happens in a worker (public/autotag-worker.js) with a time budget: a pattern
// that backtracks for seconds never freezes the page.
const COUNT_BUDGET = 200; // ms
let worker = null;
let countQueue = Promise.resolve();
let requestId = 0;
let workerStale = false; // the Memory changed: the next count restarts the worker

const startWorker = () => {
    worker = new Worker("/autotag-worker.js");
    worker.postMessage({
        type: "papers",
        papers: state.sortedPapers.map((p) => ({ title: p.title, author: p.author })),
    });
};
/** Stops the worker (a runaway pattern); the next count starts a new one */
const resetWorker = () => {
    worker?.terminate();
    worker = null;
};

/**
 * How many papers of the Memory a rule matches (title AND authors, case-insensitive)
 * @param {{title: string, authors: string}} patterns
 * @returns {Promise<{count?: number, empty?: boolean, slow?: boolean,
 *   invalid?: ("title" | "authors")[]}>}
 */
const countRuleMatches = (patterns) => {
    if ([patterns.title, patterns.authors].some((p) => p && isRiskyPattern(p)))
        return Promise.resolve({ slow: true });
    const run = countQueue.then(
        () =>
            new Promise((resolve) => {
                if (workerStale) resetWorker();
                workerStale = false;
                if (!worker) {
                    try {
                        startWorker();
                    } catch (e) {
                        // no Worker here: count on the page (risky patterns were refused
                        // above; texts are capped like in autoTagPaper)
                        return resolve(countHere(patterns));
                    }
                }
                const id = ++requestId;
                const done = (result) => {
                    clearTimeout(timer);
                    worker?.removeEventListener("message", onMessage);
                    resolve(result);
                };
                const onMessage = (e) => e.data.reqId === id && done(e.data);
                const timer = setTimeout(() => {
                    resetWorker(); // stops the runaway pattern
                    done({ slow: true });
                }, COUNT_BUDGET);
                worker.addEventListener("message", onMessage);
                worker.postMessage({ type: "count", reqId: id, ...patterns });
            }),
    );
    countQueue = run.catch(() => {});
    return run;
};

/** Fallback when a Worker cannot start: same matching as public/autotag-worker.js */
const countHere = ({ title, authors }) => {
    const invalid = [];
    const make = (key, p) => {
        if (!p) return null;
        try {
            return new RegExp(p, "i");
        } catch (e) {
            invalid.push(key);
        }
    };
    const t = make("title", title);
    const a = make("authors", authors);
    if (invalid.length) return { invalid };
    if (!t && !a) return { empty: true };
    return {
        count: state.sortedPapers.filter(
            (p) =>
                (!t || t.test(String(p.title ?? "").slice(0, 500))) &&
                (!a || a.test(String(p.author ?? "").slice(0, 2000))),
        ).length,
    };
};

const showRuleResult = (row, { count, empty, invalid, slow }) => {
    const out = row.querySelector(".o-match");
    row.querySelector(".o-rule-title").classList.toggle(
        "is-invalid",
        !!invalid?.includes("title"),
    );
    row.querySelector(".o-rule-authors").classList.toggle(
        "is-invalid",
        !!invalid?.includes("authors"),
    );
    out.className = "o-match";
    out.removeAttribute("data-tip");
    if (slow) {
        out.classList.add("is-error");
        out.textContent = "Pattern too slow";
        out.dataset.tip = "Not saved: it could freeze PaperMemory. Simplify it.";
    } else if (invalid) {
        out.classList.add("is-error");
        out.textContent = "Invalid pattern";
        out.dataset.tip = "Not saved: this is not a valid regular expression.";
    } else if (empty) {
        out.classList.add("is-none");
        out.textContent = "Add a pattern";
    } else if (count === 0) {
        out.classList.add("is-none");
        out.textContent = "No match yet";
    } else {
        out.innerHTML = `${icon("check", "pm-i-sm")}<span></span>`;
        out.querySelector("span").textContent = plural(count, "paper");
    }
};

/**
 * Counts a rule's matches and shows them; valid patterns become the stored ones
 * @param {boolean} save Whether to save the rule when its patterns are valid
 */
const checkRule = async (row, rule, save) => {
    const patterns = { title: rule.title, authors: rule.authors };
    const result = await countRuleMatches(patterns);
    // a newer edit is on its way: its own check will show and save
    if (rule.title !== patterns.title || rule.authors !== patterns.authors) return;
    showRuleResult(row, result);
    if (!result.slow && !result.invalid) {
        rule.good = patterns;
        if (save) saveRules();
    }
};

const ruleRow = (rule) => {
    const row = document.createElement("div");
    row.className = "o-rule";
    row.setAttribute("role", "row");
    row.dataset.id = rule.id;
    row.innerHTML = /*html*/ `
        <input class="pm-input o-rule-title" type="text" placeholder="Any title" spellcheck="false" aria-label="Title pattern" />
        <input class="pm-input o-rule-authors" type="text" placeholder="Any author" spellcheck="false" aria-label="Authors pattern" />
        <div class="o-rule-tags"></div>
        <span class="o-match" aria-live="polite"></span>
        <button type="button" class="pm-iconbtn o-rule-delete" aria-label="Delete rule" data-tip="Delete rule">${icon("x")}</button>`;
    const title = row.querySelector(".o-rule-title");
    const authors = row.querySelector(".o-rule-authors");
    title.value = rule.title ?? "";
    authors.value = rule.authors ?? "";
    let checkTimer = null;
    const checkNow = () => {
        clearTimeout(checkTimer);
        pendingChecks.delete(rule);
        return checkRule(row, rule, true);
    };
    for (const [input, key] of [
        [title, "title"],
        [authors, "authors"],
    ]) {
        input.addEventListener("input", () => {
            rule[key] = input.value.trim();
            clearTimeout(checkTimer);
            checkTimer = setTimeout(checkNow, 300);
            pendingChecks.set(rule, checkNow);
        });
    }
    createTagField({
        root: row.querySelector(".o-rule-tags"),
        tags: rule.tags ?? [],
        onChange: (tags) => {
            rule.tags = tags;
            saveRules();
        },
    }).input.setAttribute("aria-label", "Tags to add");
    row.querySelector(".o-rule-delete").addEventListener("click", async () => {
        const used = rule.title || rule.authors || rule.tags?.length;
        if (
            used &&
            !(await confirmDialog({
                title: "Delete this rule?",
                body: ["Papers it already tagged keep their tags."],
                confirm: "Delete rule",
                danger: true,
            }))
        )
            return;
        rules = rules.filter((r) => r !== rule);
        await writeRules();
        renderRules();
    });
    checkRule(row, rule, false);
    return row;
};

const renderRules = () => {
    const list = $("auto-tags-list");
    list.querySelectorAll(".o-rule").forEach((r) => r.remove());
    for (const rule of rules) list.append(ruleRow(rule));
    $("auto-tags-none").hidden = rules.length > 0;
    list.querySelector(".o-rules-head").hidden = rules.length === 0;
};

/** Live counts after the Memory changed */
const refreshRuleCounts = () => {
    workerStale = true;
    document.querySelectorAll(".o-rule").forEach((row) => {
        const rule = rules.find((r) => String(r.id) === row.dataset.id);
        if (rule) checkRule(row, rule, false);
    });
};

const setupRules = async () => {
    const stored = (await getStorage("autoTags")) ?? [];
    // rules saved before the options page used `authors` have `author`
    const legacy = stored.some(
        (r) => r.authors === undefined && r.author !== undefined,
    );
    rules = stored.map((r) => {
        const authors = r.authors ?? r.author ?? "";
        const title = r.title ?? "";
        return {
            id: r.id,
            title,
            authors,
            tags: r.tags ?? [],
            good: { title, authors },
        };
    });
    if (legacy) await writeRules();
    renderRules();
    $("auto-tags-add").addEventListener("click", () => {
        const id = rules.length
            ? Math.max(...rules.map((r) => Number(r.id) || 0)) + 1
            : 0;
        rules.push({
            id,
            title: "",
            authors: "",
            tags: [],
            good: { title: "", authors: "" },
        });
        renderRules();
        saveRules();
        document.querySelector(`.o-rule[data-id="${id}"] .o-rule-title`)?.focus();
    });
};

// -------------------------
// -----  Tag manager  -----
// -------------------------

const tm = {
    filter: "",
    sort: "count",
    selected: new Set(),
    renaming: null, // the tag whose name is being edited
    focusRename: false, // its input gets the focus on the next render
};

/** tag -> number of papers, for the whole Memory */
const allTagCounts = () => {
    const counts = new Map();
    for (const p of state.sortedPapers)
        for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    return counts;
};

const sortedTags = (counts) =>
    [...counts.keys()].sort((a, b) =>
        tm.sort === "az"
            ? a.localeCompare(b, undefined, { sensitivity: "base" })
            : counts.get(b) - counts.get(a) || a.localeCompare(b),
    );

const setStatus = (text, error = false) => {
    $("tags-status").textContent = text;
    $("tags-status").classList.toggle("is-error", error);
};

const tagRow = (tag, count, similar) => {
    const row = document.createElement("div");
    row.className = "o-tagrow";
    row.setAttribute("role", "row");
    row.dataset.tag = tag;
    row.classList.toggle("is-selected", tm.selected.has(tag));
    row.innerHTML = /*html*/ `
        <span role="cell"><input type="checkbox" class="pm-check" /></span>
        <span role="cell" class="o-tagname"><span class="o-tagname-t"></span></span>
        <span role="cell" class="o-num"></span>
        <span role="cell" class="o-acts">
            <button type="button" class="pm-iconbtn" data-act="rename" data-tip="Rename">${icon("edit")}</button>
            <button type="button" class="pm-iconbtn" data-act="delete" data-tip="Delete tag">${icon("trash")}</button>
        </span>`;
    const check = row.querySelector(".pm-check");
    check.checked = tm.selected.has(tag);
    check.setAttribute("aria-label", `Select ${tag}`);
    row.querySelector(".o-tagname-t").textContent = tag;
    if (similar) {
        const badge = document.createElement("span");
        badge.className = "pm-badge pm-badge-warn";
        badge.textContent = "Similar";
        row.querySelector(".o-tagname").append(badge);
    }
    row.querySelector(".o-num").textContent = count;
    row.querySelector('[data-act="rename"]').setAttribute(
        "aria-label",
        `Rename ${tag}`,
    );
    row.querySelector('[data-act="delete"]').setAttribute(
        "aria-label",
        `Delete ${tag}`,
    );
    if (tm.renaming === tag) showRenameForm(row, tag);
    return row;
};

/** The name cell becomes an input with Rename / Cancel */
const showRenameForm = (row, tag) => {
    const cell = row.querySelector(".o-tagname");
    cell.innerHTML = /*html*/ `
        <span class="o-rename">
            <input class="pm-input o-rename-input" type="text" spellcheck="false" aria-label="New name" />
            <button type="button" class="pm-btn pm-btn-primary pm-btn-sm" data-act="rename-save">Rename</button>
            <button type="button" class="pm-btn pm-btn-ghost pm-btn-sm" data-act="rename-cancel">Cancel</button>
        </span>
        <span class="pm-field-msg is-error o-rename-msg" hidden></span>`;
    const input = cell.querySelector("input");
    input.value = tag;
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            commitRename(tag, input.value);
        } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            tm.renaming = null;
            renderTags();
        }
    });
};

const commitRename = async (tag, value) => {
    const name = value.trim();
    const msg = document.querySelector(
        `.o-tagrow[data-tag="${CSS.escape(tag)}"] .o-rename-msg`,
    );
    const fail = (text) => {
        msg.textContent = text;
        msg.hidden = false;
    };
    if (!name) return fail("A tag needs a name.");
    if (name.includes(",")) return fail("Tags cannot contain a comma.");
    if (name === tag) {
        tm.renaming = null;
        return renderTags();
    }
    const counts = allTagCounts();
    if (counts.has(name)) {
        const ok = await confirmDialog({
            title: `Merge “${tag}” into “${name}”?`,
            body: [
                `“${name}” already exists (${plural(counts.get(name), "paper")}). The ${plural(counts.get(tag), "paper")} tagged “${tag}” will have “${name}” instead.`,
            ],
            confirm: "Merge tags",
        });
        if (!ok) return;
    }
    tm.renaming = null;
    tm.selected.delete(tag);
    const changed = await applyTagMapping(new Map([[tag, name]]));
    if (changed === null) return; // not saved: the status says so
    setStatus(`Renamed “${tag}” to “${name}” on ${plural(changed, "paper")}.`);
};

const deleteTag = async (tag) => {
    const n = allTagCounts().get(tag) ?? 0;
    const ok = await confirmDialog({
        title: `Delete the tag “${tag}”?`,
        body: [
            `It is removed from ${plural(n, "paper")}. The papers stay in your Memory.`,
        ],
        confirm: "Delete tag",
        danger: true,
    });
    if (!ok) return;
    tm.selected.delete(tag);
    const changed = await applyTagMapping(new Map([[tag, null]]));
    if (changed === null) return;
    setStatus(`Deleted “${tag}” from ${plural(changed, "paper")}.`);
};

/** Papers that have at least one of `tags` */
const papersWithAny = (tags) =>
    state.sortedPapers.filter((p) => p.tags?.some((t) => tags.includes(t))).length;

const renderMergeBar = (counts) => {
    const bar = $("tags-mergebar");
    const selected = [...tm.selected].filter((t) => counts.has(t));
    tm.selected = new Set(selected);
    bar.hidden = selected.length === 0;
    if (!selected.length) return;
    const select = $("tags-merge-target");
    const merging = selected.length > 1;
    select.hidden = !merging;
    $("tags-merge").hidden = !merging;
    $("tags-merge-papers").hidden = !merging;
    if (!merging) {
        $("tags-merge-label").textContent =
            "1 tag selected. Select another one to merge them.";
        return;
    }
    $("tags-merge-label").textContent = `Merge ${selected.length} tags into`;
    const previous = select.value;
    // default target: the most used of the selected tags
    const ordered = [...selected].sort(
        (a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b),
    );
    select.textContent = "";
    for (const t of ordered) select.append(new Option(t, t));
    select.value = selected.includes(previous) ? previous : ordered[0];
    $("tags-merge-papers").textContent = plural(papersWithAny(selected), "paper");
};

const renderSimilar = (tags) => {
    const box = $("tags-similar");
    const groups = similarTagGroups(tags);
    box.hidden = groups.length === 0;
    if (!groups.length) return;
    const text = box.querySelector("div");
    text.textContent = "";
    const n = groups.reduce((s, g) => s + g.length, 0);
    const b = document.createElement("b");
    b.textContent =
        groups.length === 1
            ? `${n} tags look like the same tag.`
            : `${groups.length} groups of tags look alike.`;
    text.append(b, " They differ only by capitals, a hyphen, a space or an “s”. ");
    for (const group of groups) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "o-linkbtn o-similar-group";
        btn.textContent = group.join(" · ");
        btn.setAttribute("aria-label", `Select ${group.join(", ")} to merge them`);
        btn.dataset.tip = "Select them to merge";
        btn.addEventListener("click", () => {
            tm.selected = new Set(group);
            tm.filter = "";
            $("tags-filter").value = "";
            renderTags();
            $("tags-mergebar").scrollIntoView({ block: "nearest" });
        });
        text.append(btn, " ");
    }
};

export const renderTags = () => {
    const counts = allTagCounts();
    const tags = sortedTags(counts);
    const similar = new Set(similarTagGroups(tags).flat());
    const q = tm.filter.toLowerCase();
    const shown = q ? tags.filter((t) => t.toLowerCase().includes(q)) : tags;
    $("tags-total").textContent = tags.length || "";
    $("tags-count").textContent = q
        ? `${shown.length} of ${plural(tags.length, "tag")}`
        : plural(tags.length, "tag");
    const rows = $("tags-rows");
    rows.textContent = "";
    for (const t of shown) rows.append(tagRow(t, counts.get(t), similar.has(t)));
    const renameInput = rows.querySelector(".o-rename-input");
    if (renameInput && tm.focusRename) {
        tm.focusRename = false;
        renameInput.focus();
        renameInput.select();
    }
    $("tags-table").hidden = shown.length === 0;
    const none = $("tags-none");
    none.hidden = shown.length > 0;
    none.textContent = tags.length
        ? "No tag matches this filter."
        : "No tags yet. Add tags to a paper in the popup (e) and they show up here.";
    renderSimilar(tags);
    renderMergeBar(counts);
    // side nav count (replaced by the match count while the settings search is used)
    const nav = document.querySelector('[data-nav="tags"]');
    nav.dataset.count = tags.length || "";
    if (!document.getElementById("settings-search").value.trim())
        nav.querySelector(".pm-count").textContent = nav.dataset.count;
};

const setupTagManager = () => {
    $("tags-filter").addEventListener("input", (e) => {
        tm.filter = e.target.value.trim();
        renderTags();
    });
    $("tags-sort").addEventListener("change", (e) => {
        tm.sort = e.target.value;
        renderTags();
    });
    $("tags-rows").addEventListener("change", (e) => {
        const row = e.target.closest(".o-tagrow");
        if (!row || !e.target.matches(".pm-check")) return;
        if (e.target.checked) tm.selected.add(row.dataset.tag);
        else tm.selected.delete(row.dataset.tag);
        row.classList.toggle("is-selected", e.target.checked);
        renderMergeBar(allTagCounts());
    });
    $("tags-rows").addEventListener("click", (e) => {
        const btn = e.target.closest("[data-act]");
        const row = e.target.closest(".o-tagrow");
        if (!btn || !row) return;
        const tag = row.dataset.tag;
        if (btn.dataset.act === "rename") {
            tm.renaming = tag;
            tm.focusRename = true;
            renderTags();
        } else if (btn.dataset.act === "delete") deleteTag(tag);
        else if (btn.dataset.act === "rename-save")
            commitRename(tag, row.querySelector(".o-rename-input").value);
        else if (btn.dataset.act === "rename-cancel") {
            tm.renaming = null;
            renderTags();
        }
    });
    $("tags-merge-cancel").addEventListener("click", () => {
        tm.selected.clear();
        renderTags();
    });
    $("tags-merge").addEventListener("click", async () => {
        const counts = allTagCounts();
        const selected = [...tm.selected].filter((t) => counts.has(t));
        const target = $("tags-merge-target").value;
        const others = selected.filter((t) => t !== target);
        if (!others.length) return;
        const n = papersWithAny(selected);
        const ok = await confirmDialog({
            title: `Merge ${selected.length} tags into “${target}”?`,
            body: [
                `${others.map((t) => `“${t}”`).join(", ")} will be replaced by “${target}” on every paper. ${plural(n, "paper")} will have “${target}”.`,
            ],
            confirm: "Merge tags",
        });
        if (!ok) return;
        tm.selected.clear();
        if ((await applyTagMapping(new Map(others.map((t) => [t, target])))) === null)
            return;
        setStatus(
            `Merged ${selected.length} tags into “${target}” (${plural(n, "paper")}).`,
        );
    });
};

/** Whether an edit is in progress that a re-render would lose */
export const tagsAreBusy = () =>
    tm.renaming !== null || !!document.activeElement?.closest?.(".o-rule");

/** After the Memory changed (here or in another page) */
/**
 * After the Memory changed
 * @param {{tags: boolean, rules: boolean}} what The tag manager / the auto-tag counts
 */
export const refreshTags = ({ tags = true, rules = true } = {}) => {
    if (tags) renderTags();
    if (rules) refreshRuleCounts();
};

/**
 * @param {function} onChange Called after this module changed the Memory
 */
export const setupTags = async (onChange) => {
    onMemoryChange = onChange;
    await setupRules();
    setupTagManager();
    renderTags();
};

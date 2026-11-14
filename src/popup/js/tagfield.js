// Tag input shared by the paper view and the Memory row edit form (design-review/v2/popup.html
// frame 10): chips with ×, "Add tag…", existing tags with their paper counts, and a hint when the
// new tag is almost an existing one (ignores case, - _ space, plurals).
import { state } from "@pmu/config.js";
import { escapeHtml } from "@pmu/functions.js";
import { icon } from "@pm/popup/js/icons.js";

/** tag -> number of papers carrying it */
export const tagCounts = () => {
    const counts = new Map();
    for (const paper of state.sortedPapers) {
        for (const tag of paper.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return counts;
};

/** "Reinforcement learnings" -> {"reinforcementlearnings", "reinforcementlearning", …} */
const variants = (tag) => {
    const n = tag.toLowerCase().replace(/[-_\s]+/g, "");
    return new Set([n, n.replace(/s$/, ""), n.replace(/es$/, "")]);
};

/**
 * Existing tags that differ from `text` only by case, - _ space or a plural
 * @param {string} text
 * @param {string[]} tags
 * @returns {string[]}
 */
export const nearDuplicates = (text, tags) => {
    const v = variants(text);
    return tags.filter((t) => t !== text && [...variants(t)].some((x) => v.has(x)));
};

/** Escaped tag with the matched part in <mark> */
export const markMatch = (tag, query) => {
    const i = query ? tag.toLowerCase().indexOf(query.toLowerCase()) : -1;
    if (i < 0) return escapeHtml(tag);
    return (
        escapeHtml(tag.slice(0, i)) +
        `<mark>${escapeHtml(tag.slice(i, i + query.length))}</mark>` +
        escapeHtml(tag.slice(i + query.length))
    );
};

/**
 * Builds a tag field in `root`
 * @param {object} opts
 * @param {HTMLElement} opts.root Emptied and filled with the field
 * @param {string[]} opts.tags Initial tags
 * @param {(tags: string[]) => void} opts.onChange Called after each add / remove
 * @param {string} opts.inputId Optional id for the text input (labels)
 * @returns {{getTags: () => string[], focus: () => void, commitPending: () => void, input: HTMLInputElement}}
 */
export const createTagField = ({ root, tags = [], onChange = () => {}, inputId }) => {
    let current = [...tags];
    let entries = []; // [{kind: "near" | "tag" | "create", tag}]
    let active = -1;

    root.innerHTML = /*html*/ `
        <div class="pm-field pm-tagfield">
            <span class="pm-tagchips"></span>
            <input class="pm-tagin" type="text" placeholder="Add tag…" autocomplete="off" spellcheck="false" aria-label="Add a tag" />
            <div class="pm-sugg pm-tagsugg" role="listbox" hidden></div>
        </div>`;
    const field = root.querySelector(".pm-tagfield");
    const chips = root.querySelector(".pm-tagchips");
    const input = root.querySelector(".pm-tagin");
    const sugg = root.querySelector(".pm-tagsugg");
    if (inputId) input.id = inputId;

    const renderChips = () => {
        chips.textContent = "";
        for (const tag of current) {
            const chip = document.createElement("span");
            chip.className = "pm-chip";
            chip.title = tag;
            const text = document.createElement("span");
            text.className = "pm-chip-t";
            text.textContent = tag;
            const x = document.createElement("button");
            x.type = "button";
            x.className = "pm-chip-x";
            x.tabIndex = -1;
            x.setAttribute("aria-label", `Remove the tag ${tag}`);
            x.dataset.tip = "Remove the tag";
            x.innerHTML = icon("x");
            x.addEventListener("click", (e) => {
                e.stopPropagation();
                remove(tag);
                input.focus();
            });
            chip.append(text, x);
            chips.append(chip);
        }
    };

    const close = () => {
        sugg.hidden = true;
        entries = [];
        active = -1;
    };

    const renderSugg = () => {
        const text = input.value.trim();
        if (!text) return close();
        const counts = tagCounts();
        const all = [...counts.keys()].filter((t) => !current.includes(t));
        const near = nearDuplicates(text, all);
        const q = text.toLowerCase();
        const others = all
            .filter((t) => !near.includes(t) && t.toLowerCase().includes(q))
            .sort(
                (a, b) =>
                    (b.toLowerCase() === q) - (a.toLowerCase() === q) ||
                    b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q) ||
                    counts.get(b) - counts.get(a) ||
                    a.localeCompare(b),
            )
            .slice(0, near.length ? 3 : 6);
        const exists = all.includes(text) || current.includes(text);
        entries = [
            ...near.map((tag) => ({ kind: "near", tag })),
            ...others.map((tag) => ({ kind: "tag", tag })),
            ...(near.length && !exists ? [{ kind: "create", tag: text }] : []),
        ];
        if (!entries.length) return close();
        // a near-duplicate is preselected: ↵ uses the existing tag
        active = near.length ? 0 : -1;
        const row = (e, i) =>
            e.kind === "create"
                ? `<div class="pm-sugg-row pm-sugg-create" role="option" data-i="${i}"><span>${icon("plus", "pm-i-sm")} Create “${escapeHtml(e.tag)}” anyway</span></div>`
                : `<div class="pm-sugg-row" role="option" data-i="${i}"><span>${markMatch(e.tag, e.kind === "near" ? "" : text)}</span><span class="pm-count">${counts.get(e.tag)}</span><span class="pm-kbd pm-sugg-enter">↵</span></div>`;
        let html = "";
        entries.forEach((e, i) => {
            if (i === 0 && e.kind === "near")
                html += `<p class="pm-sugg-note">Almost the same as an existing tag</p>`;
            if (e.kind === "tag" && near.length && entries[i - 1]?.kind === "near")
                html += `<p class="pm-sugg-note">Other tags</p>`;
            html += row(e, i);
        });
        html += `<div class="pm-sugg-foot"><span><span class="pm-kbd">↑</span><span class="pm-kbd">↓</span> Choose</span><span><span class="pm-kbd">↵</span> Add</span>${near.length ? '<span class="pm-spacer"></span><span>Ignores case, - _ space, plurals</span>' : ""}</div>`;
        sugg.innerHTML = html;
        sugg.hidden = false;
        paintActive();
    };

    const paintActive = () =>
        sugg.querySelectorAll(".pm-sugg-row").forEach((el) => {
            const on = Number(el.dataset.i) === active;
            el.classList.toggle("is-active", on);
            el.setAttribute("aria-selected", String(on));
        });

    /**
     * Adds tags: an existing tag picked in the list as it is; typed text split on commas
     * ("a,b" pasted is two tags)
     * @param {string[]} tags
     */
    const add = (tags) => {
        input.value = "";
        close();
        const added = tags.map((t) => t.trim()).filter((t) => t && !current.includes(t));
        if (!added.length) return;
        current.push(...new Set(added));
        renderChips();
        onChange([...current]);
    };
    const addTyped = (text) => add(text.split(","));
    const remove = (tag) => {
        current = current.filter((t) => t !== tag);
        renderChips();
        onChange([...current]);
    };
    /** ↵ / tab: the highlighted suggestion, or the typed text */
    const commit = () => {
        const e = entries[active];
        e && e.kind !== "create" ? add([e.tag]) : addTyped(input.value);
    };

    input.addEventListener("input", () => {
        // a comma (typed or pasted) ends a tag: what comes before it is added
        if (input.value.includes(",")) {
            const parts = input.value.split(",");
            const rest = parts.pop();
            addTyped(parts.join(","));
            input.value = rest;
        }
        renderSugg();
    });
    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!entries.length) return;
            e.preventDefault();
            const n = entries.length;
            active = e.key === "ArrowDown" ? (active + 1) % n : (active - 1 + n) % n;
            paintActive();
        } else if (e.key === "Enter" && !(e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            input.value.trim() && commit();
        } else if (e.key === "Tab" && !e.shiftKey && input.value.trim()) {
            commit(); // then the focus moves on to the next field
        } else if (e.key === "Backspace" && !input.value && current.length) {
            e.preventDefault();
            remove(current[current.length - 1]);
        } else if (e.key === "Escape" && !sugg.hidden) {
            e.preventDefault();
            e.stopPropagation();
            close();
        }
    });
    input.addEventListener("blur", () => setTimeout(close, 150));
    sugg.addEventListener("mousedown", (e) => e.preventDefault()); // keep the focus
    sugg.addEventListener("click", (e) => {
        const row = e.target.closest(".pm-sugg-row");
        if (!row) return;
        active = Number(row.dataset.i);
        commit();
        input.focus();
    });
    field.addEventListener("click", (e) => {
        if (e.target === field || e.target === chips) input.focus();
    });

    renderChips();
    return {
        getTags: () => [...current],
        focus: () => input.focus(),
        /** Adds the text still in the input (Done) */
        commitPending: () => input.value.trim() && addTyped(input.value),
        input,
    };
};

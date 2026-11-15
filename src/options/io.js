// Options page, "Import & export": full exports (same formats and file names as before),
// export by tag, import from a list of URLs, and the danger zone (replace the Memory from a
// backup: a copy of the current Memory is downloaded first, then the user confirms).
import { state } from "@pmu/config.js";
import { memoryOp, replaceMemory } from "@pmu/memoryQueue.js";
import {
    getStorage,
    validatePaper,
    prepareOverwriteData,
    getManifestDataVersion,
} from "@pmu/data.js";
import { bibtexToString } from "@pmu/bibtexParser.js";
import {
    log,
    info,
    warn,
    logOk,
    logError,
    downloadTextFile,
    stringifyError,
    cleanPapers,
} from "@pmu/functions.js";
import { tryPreprintMatch } from "@pmu/preprintMatching.js";
import { makePaper, isPaper } from "@pmu/paper.js";
import { shouldSync, pushToRemote } from "@pmu/sync.js";
import { createTagField } from "@pm/popup/js/tagfield.js";
import { askDialog } from "@pm/options/dialog.js";

const $ = (id) => document.getElementById(id);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "14.11.2026-09.30.12"-like stamp used in every export file name */
const stamp = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    return `${date}-${time}`;
};

/** Messages built as HTML by data.js (<br/>, <h5>) as plain text */
const htmlToText = (html) =>
    new DOMParser()
        .parseFromString(String(html).replace(/<br\s*\/?>|<\/h5>/g, "\n"), "text/html")
        .body.textContent.trim();

// -----------------
// -----  Export -----
// -----------------

/**
 * Downloads the whole Memory (.json, the format a restore reads)
 * @returns {Promise<string>} The file name
 */
export const downloadMemory = async () => {
    const papers = (await getStorage("papers")) ?? {};
    const name = `PaperMemory-data-${stamp()}.json`;
    downloadTextFile(JSON.stringify(papers), name, "text/json");
    return name;
};

const downloadBibtexJson = async () => {
    // papers only: not __dataVersion, nor __syncId (any Memory that was ever synced)
    const papers = cleanPapers((await getStorage("papers")) ?? {});
    const bibtex = Object.keys(papers).reduce((obj, k) => {
        obj[k] = papers[k].bibtex ? bibtexToString(papers[k].bibtex) : "";
        return obj;
    }, {});
    downloadTextFile(
        JSON.stringify(bibtex),
        `PaperMemory-bibtex-${stamp()}.json`,
        "text/json",
    );
};

const downloadBibtexPlain = async () => {
    const papers = cleanPapers((await getStorage("papers")) ?? {});
    const bibtex = Object.values(papers)
        .filter((p) => p.bibtex)
        .map((p) => bibtexToString(p.bibtex))
        .join("\n");
    downloadTextFile(bibtex, `PaperMemory-bibtex-${stamp()}.bib`, "text/plain");
};

let exportField = null; // tag field of "Export by tag"

const exportOperator = () => $("export-tags-operator").dataset.op; // "OR" | "AND"

/** Papers matching the chosen tags (any / all) */
const papersToExport = () => {
    const tags = exportField?.getTags() ?? [];
    if (!tags.length) return [];
    return state.sortedPapers.filter((p) =>
        exportOperator() === "AND"
            ? p.tags && tags.every((t) => p.tags.includes(t))
            : p.tags && tags.some((t) => p.tags.includes(t)),
    );
};

const showExportCount = () => {
    const n = papersToExport().length;
    const button = $("export-tags-confirm");
    button.textContent = `Export ${n}`;
    button.disabled = n === 0;
};

const exportByTag = () => {
    const tags = exportField.getTags();
    const format = $("export-tags-format").value;
    let papers = papersToExport();
    if (format === "bib") {
        papers = papers.map((p) => bibtexToString(p.bibtex)).join("\n");
    } else {
        papers = JSON.stringify(
            papers.map((p) => {
                if (format.includes("url")) return p.pdfLink;
                let e = { url: p.pdfLink, title: p.title };
                if (p.tags && p.tags.length > 0) e.tags = p.tags;
                if (p.codeLink) e.codeLink = p.codeLink;
                return e;
            }),
            null,
            2,
        );
    }
    const fname = `PMExport-${stamp()}-${tags.join("-")}${format.includes("url") ? "-urls" : ""}`;
    if (format.includes("json")) downloadTextFile(papers, fname + ".json", "text/json");
    else downloadTextFile(papers, fname + ".bib", "text/plain");
};

// -------------------------------
// -----  Import from URLs  -----
// -------------------------------

const isValidHttpUrl = (string) => {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
};

/** @returns {string} An error message, or "" when the entry is valid */
const importEntryError = (p, i) => {
    if (typeof p === "string")
        return isValidHttpUrl(p) ? "" : `Entry ${i + 1}: ${p} is not a valid URL.`;
    if (!p || typeof p.url !== "string")
        return `Entry ${i + 1} needs a "url" text field.`;
    if (!isValidHttpUrl(p.url)) return `Entry ${i + 1}: ${p.url} is not a valid URL.`;
    if (p.codeLink && !isValidHttpUrl(p.codeLink))
        return `Entry ${i + 1}: ${p.codeLink} is not a valid URL.`;
    return "";
};

/** Adds the paper unless the Memory (as stored now) already has it; true if it had it */
const storeImportedPaper = async (paper) => {
    const answer = await memoryOp({ op: "create", paper });
    if (!answer.ok) throw new Error(answer.error);
    const exists = !!answer.result.exists;
    if (!exists) logOk("New imported paper!", paper);
    return exists;
};

const parsePaper = async (url, is) => {
    let match;
    let paper = await makePaper(is, url);
    if (paper) match = await tryPreprintMatch(paper, true);
    if (match) {
        for (const k in match) {
            if (match[k] && !paper[k]) paper[k] = match[k];
            if (k === "bibtex" && match[k]) paper[k] = match[k];
        }
    }
    return paper;
};

const importFromFile = async (file) => {
    const status = $("import-json-status");
    const feedback = $("json-import-feedback");
    const bar = $("import-json-progress-bar");
    $("import-json-status-container").hidden = false;
    feedback.textContent = "";
    bar.style.width = "0%";
    const line = (text, ok) => {
        const li = document.createElement("li");
        li.className = ok ? "is-ok" : "is-error";
        li.textContent = text;
        feedback.append(li);
    };

    let entries;
    try {
        entries = JSON.parse(await file.text());
        info("Entries loaded from user file: ", entries);
        if (!Array.isArray(entries))
            throw new Error("The file must contain a list of papers.");
        const errors = entries.map(importEntryError).filter(Boolean);
        if (errors.length) throw new Error(errors.join("\n"));
    } catch (error) {
        logError(error);
        status.textContent = `Could not read ${file.name}: ${error.message ?? error}`;
        return;
    }

    for (const [i, p] of entries.entries()) {
        const url = p.url ?? p;
        bar.style.width = `${((i + 1) / entries.length) * 100}%`;
        status.textContent = `Fetching paper ${i + 1} of ${entries.length}: ${url}`;
        try {
            const is = await isPaper(url);
            if (!Object.values(is).some((x) => x)) {
                line(`${url} is not from a supported source.`, false);
                continue;
            }
            const paper = await parsePaper(url, is);
            if (p.codeLink) paper.codeLink = p.codeLink;
            if (Array.isArray(p.tags) && p.tags.length > 0)
                paper.tags = p.tags.filter(
                    (t) => typeof t === "string" && t.length > 0,
                );
            if (await storeImportedPaper(paper))
                line(`${url} is already in your Memory.`, false);
            else line(`${url} added.`, true);
        } catch (error) {
            logError(`Entry ${i} (${url})`, error);
            warn("Aborting.");
            line(`${url} could not be added (details in the browser console).`, false);
        }
    }
    await pushToRemote();
    status.textContent = `Done: ${entries.length} ${entries.length === 1 ? "entry" : "entries"} read.`;
};

// ---------------------------------------
// -----  Replace the Memory (restore) -----
// ---------------------------------------

/**
 * The restore status under the danger zone; `action` adds a button (e.g. a download)
 * @param {string} text
 * @param {boolean} error
 * @param {{label: string, onClick: function} | null} action
 */
const restoreMessage = (text, error = false, action = null) => {
    const box = $("overwriteFeedback");
    box.hidden = !text;
    box.textContent = text;
    box.classList.toggle("is-error", error);
    if (action) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "pm-btn pm-btn-sm o-restore-action";
        btn.textContent = action.label;
        btn.addEventListener("click", action.onClick);
        box.append(document.createElement("br"), btn);
    }
};

const RESERVED = new Set(["__proto__", "constructor", "prototype"]);
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const PAPER_STRINGS = ["title", "author", "pdfLink"]; // required, not empty
const PAPER_OPTIONAL_STRINGS = [
    "source", // missing in very old backups
    "bibtex",
    "note",
    "codeLink",
    "venue",
    "venueFull",
    "doi",
    "key",
    "md",
    "addDate",
    "lastOpenDate",
    "favoriteDate",
    "conf",
];

/**
 * First check of parsed JSON, before migrating it: the shape of a Memory backup and no
 * reserved key anywhere
 * @param {any} data
 * @returns {string[]} Problems found (empty: go on)
 */
export const checkBackupStructure = (data) => {
    const problems = [];
    if (!isPlainObject(data))
        return [
            `The file must contain an object of papers (by id), not ${Array.isArray(data) ? "a list" : typeof data}.`,
        ];
    const walk = (value, path, depth) => {
        if (depth > 20 || value === null || typeof value !== "object") return;
        for (const key of Object.keys(value)) {
            if (RESERVED.has(key))
                problems.push(`Forbidden key “${key}” in ${path || "the file"}.`);
            else walk(value[key], path ? `${path}.${key}` : key, depth + 1);
        }
    };
    walk(data, "", 0);
    if (problems.length) return problems;
    for (const key of Object.keys(data).filter((k) => k.startsWith("__"))) {
        if (key === "__dataVersion") {
            const v = data.__dataVersion;
            if (!Number.isInteger(v) || v < 1)
                problems.push("__dataVersion must be a positive whole number.");
            else if (v > getManifestDataVersion())
                problems.push(
                    "This backup comes from a newer version of PaperMemory: update the extension first.",
                );
        } else if (key !== "__syncId") problems.push(`Unknown entry “${key}”.`);
    }
    const ids = Object.keys(data).filter((k) => !k.startsWith("__"));
    if (!ids.length) problems.push("The file has no papers.");
    for (const id of ids)
        if (!isPlainObject(data[id])) problems.push(`paper “${id}” is not an object.`);
    return problems;
};

/**
 * Second check, on the papers once migrated and given their defaults (an old backup is
 * judged as it will be stored)
 * @param {object} papers id -> paper
 * @returns {string[]} Problems found
 */
export const checkBackupPapers = (papers) => {
    const problems = [];
    for (const [id, p] of Object.entries(papers)) {
        if (id.startsWith("__")) continue;
        const where = `paper “${id}”`;
        if (p.id !== id) problems.push(`${where}: its id field must be “${id}”.`);
        for (const k of PAPER_STRINGS)
            if (typeof p[k] !== "string" || !p[k].trim())
                problems.push(`${where}: “${k}” must be a non-empty text.`);
        for (const k of PAPER_OPTIONAL_STRINGS)
            if (p[k] !== undefined && typeof p[k] !== "string")
                problems.push(`${where}: “${k}” must be a text.`);
        if (p.year !== undefined && !["string", "number"].includes(typeof p.year))
            problems.push(`${where}: “year” must be a text or a number.`);
        if (p.count !== undefined && !(Number.isFinite(p.count) && p.count >= 0))
            problems.push(`${where}: “count” must be a number.`);
        if (p.favorite !== undefined && typeof p.favorite !== "boolean")
            problems.push(`${where}: “favorite” must be true or false.`);
        if (
            p.tags !== undefined &&
            !(Array.isArray(p.tags) && p.tags.every((t) => typeof t === "string"))
        )
            problems.push(`${where}: “tags” must be a list of texts.`);
        for (const k of ["code", "extras"])
            if (p[k] !== undefined && !isPlainObject(p[k]))
                problems.push(`${where}: “${k}” must be an object.`);
    }
    return problems;
};

const showProblems = (fileName, problems) => {
    const shown = problems.slice(0, 5);
    const more = problems.length - shown.length;
    restoreMessage(
        [
            `${fileName} cannot be used as a backup:`,
            ...shown.map((p) => `• ${p}`),
            ...(more > 0 ? [`(and ${more} more)`] : []),
        ].join("\n"),
        true,
    );
};

/** "2 added, 1 edited, 0 removed" between two Memories */
const describeChanges = (before, after) => {
    const ids = (m) => Object.keys(m).filter((k) => !k.startsWith("__"));
    const added = ids(after).filter((id) => !before[id]).length;
    const removed = ids(before).filter((id) => !after[id]).length;
    const edited = ids(after).filter(
        (id) => before[id] && JSON.stringify(before[id]) !== JSON.stringify(after[id]),
    ).length;
    return `${plural(added, "paper")} added, ${edited} edited, ${removed} removed`;
};

/**
 * 1. check the file's shape; 2. migrate it, then check its papers; 3. download the current
 * Memory; 4. confirm; 5. replace it in the background's queue, only if the Memory is still
 * the one the question was about (otherwise say what changed and ask again). The queue keeps
 * the exact Memory it replaced (memoryRecovery in storage), offered as a download too.
 * @param {File} file
 */
const restoreFromFile = async (file) => {
    restoreMessage("Checking the backup…");
    let data;
    try {
        data = JSON.parse(await file.text());
    } catch (error) {
        return restoreMessage(
            `${file.name} is not a valid backup: ${stringifyError(error)}`,
            true,
        );
    }
    // nothing happens (no download, no question) unless the file is a Memory backup
    const structure = checkBackupStructure(data);
    if (structure.length) return showProblems(file.name, structure);
    const { success, message, warning, papersToWrite } =
        await prepareOverwriteData(data);
    if (!success)
        return restoreMessage(
            htmlToText(message) || "This backup cannot be read.",
            true,
        );
    const normalized = {};
    const problems = [];
    for (const [id, p] of Object.entries(papersToWrite)) {
        if (id.startsWith("__")) normalized[id] = p;
        else
            try {
                normalized[id] = validatePaper(p, false).paper;
            } catch (error) {
                problems.push(
                    `paper “${id}”: ${String(error?.message ?? error).split("\n")[0]}`,
                );
            }
    }
    problems.push(...checkBackupPapers(normalized));
    if (problems.length) return showProblems(file.name, problems);

    // the Memory the question is about
    const asked = await getStorage(["papers", "papersRevision"]);
    let current = asked.papers ?? {};
    let revision = asked.papersRevision ?? 0;
    const backup = await downloadMemory();
    restoreMessage(`A copy of your current Memory was downloaded: ${backup}`);

    const count = (m) => Object.keys(m).filter((k) => !k.startsWith("__")).length;
    const incoming = count(normalized);
    const body = [
        `Your ${plural(count(current), "paper")} will be replaced by the ${plural(incoming, "paper")} of “${file.name}”.`,
        `A copy of your current Memory was downloaded first: ${backup}`,
    ];
    if (warning) {
        const pre = document.createElement("pre");
        pre.className = "o-dialog-pre";
        pre.textContent = htmlToText(warning);
        body.push("Some papers had problems; they are fixed where possible:", pre);
    }
    let choice = await askDialog({
        title: "Replace your Memory?",
        body,
        actions: [
            { label: "Replace my Memory", value: "replace", kind: "danger-solid" },
        ],
    });
    while (true) {
        if (choice !== "replace")
            return restoreMessage(
                `Not replaced. A copy of your Memory was downloaded: ${backup}`,
            );
        // written to a staging key, then committed by the background's queue (a small
        // message); the Memory it replaces is kept under answer.result.recoveryKey
        const answer = await replaceMemory(normalized, {
            ifRevision: revision,
            recovery: true,
        });
        if (!answer.ok) return restoreMessage(`Not replaced: ${answer.error}`, true);
        if (!answer.result.conflict) {
            const recoveryKey = answer.result.recoveryKey ?? "memoryRecovery";
            const pushed = (await shouldSync()) ? " and pushed to your sync gist" : "";
            await pushToRemote();
            log("Memory replaced from", file.name);
            return restoreMessage(
                `Memory replaced with ${plural(incoming, "paper")}${pushed}. The Memory it replaced is kept in this browser and can be downloaded.`,
                false,
                {
                    label: "Download the replaced Memory",
                    onClick: async () =>
                        downloadTextFile(
                            JSON.stringify(
                                (await getStorage(recoveryKey))?.papers ?? {},
                            ),
                            `PaperMemory-replaced-${stamp()}.json`,
                            "text/json",
                        ),
                },
            );
        }
        // the Memory changed while the question was open: say how, and ask again
        const now = await getStorage(["papers", "papersRevision"]);
        const changes = describeChanges(current, now.papers ?? {});
        current = now.papers ?? {};
        revision = now.papersRevision ?? 0;
        choice = await askDialog({
            title: "Your Memory changed meanwhile",
            body: [
                `Since the question: ${changes}. Replace it anyway? The Memory replaced is kept and can be downloaded afterwards.`,
            ],
            actions: [
                { label: "Replace anyway", value: "replace", kind: "danger-solid" },
            ],
        });
    }
};

// ----------------
// -----  Setup -----
// ----------------

/** Counts and tag suggestions after the Memory changed */
export const refreshIO = () => {
    const n = state.sortedPapers.length;
    $("export-count").textContent = plural(n, "paper");
    document.querySelectorAll(".o-paper-count").forEach((el) => (el.textContent = n));
    showExportCount();
};

export const setupIO = () => {
    $("download-arxivmemory").addEventListener("click", downloadMemory);
    $("download-bibtex-json").addEventListener("click", downloadBibtexJson);
    $("download-bibtex-plain").addEventListener("click", downloadBibtexPlain);

    exportField = createTagField({
        root: $("export-tags-field"),
        onChange: showExportCount,
    });
    exportField.input.setAttribute("aria-label", "Tags to export");
    $("export-tags-operator").addEventListener("click", (e) => {
        const b = e.currentTarget;
        const all = b.dataset.op === "OR";
        b.dataset.op = all ? "AND" : "OR";
        b.textContent = all ? "all" : "any";
        b.setAttribute(
            "aria-label",
            `Papers that have ${all ? "all" : "any"} of these tags (click for ${all ? "any" : "all"})`,
        );
        showExportCount();
    });
    $("export-tags-confirm").addEventListener("click", exportByTag);

    $("import-json-choose").addEventListener("click", () =>
        $("import-json-papers-input").click(),
    );
    $("import-json-papers-input").addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) importFromFile(file);
    });

    $("overwrite-choose").addEventListener("click", () =>
        $("overwrite-arxivmemory-input").click(),
    );
    $("overwrite-arxivmemory-input").addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) restoreFromFile(file);
    });
    refreshIO();
};

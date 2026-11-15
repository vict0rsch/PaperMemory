// BibMatcher (design-review/v2-addenda/step5-bibmatcher.html): finds the published version of the
// preprints (arXiv, bioRxiv, medRxiv, ChemRxiv: isPreprintEntry) of a .bib file on DBLP,
// Semantic Scholar, Google Scholar, CrossRef and OpenAlex, in that order (preprintMatching.js,
// which never returns a preprint record as a match), shows each proposed change as a BibTeX
// diff to accept or reject, and copies / downloads the bibliography: the text as given, with
// the accepted entries replaced and nothing else touched. It never writes the Memory or the
// prefs.
// Remote and user text goes through escapeHtml (rows) or textContent (everything else).
import { copyTextToClipboard, downloadTextFile, escapeHtml } from "@pmu/functions.js";
import { BibtexParser, bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import {
    isPreprintRecord,
    tryDBLP,
    trySemanticScholar,
    tryCrossRef,
    tryOpenAlex,
    tryGoogleScholar,
} from "@pmu/preprintMatching.js";
import { icon, paintIcons } from "@pm/popup/js/icons.js";
import { setupTooltips } from "@pm/popup/js/tooltip.js";
import { isMac } from "@pm/popup/js/shortcuts.js";
import { setupTopbar } from "@pm/shared/js/topbar.js";
import { askDialog } from "@pm/options/dialog.js";

/** The sources, in the order they are tried; venueOnly: a venue without BibTeX is a match */
const SOURCES = [
    { id: "dblp", name: "DBLP", find: (p) => tryDBLP(p) },
    {
        id: "semanticscholar",
        name: "Semantic Scholar",
        find: (p) => trySemanticScholar(p),
    },
    { id: "googleScholar", name: "Google Scholar", find: (p) => tryGoogleScholar(p) },
    { id: "crossref", name: "CrossRef", find: (p) => tryCrossRef(p), venueOnly: true },
    { id: "openalex", name: "OpenAlex", find: (p) => tryOpenAlex(p), venueOnly: true },
];
const STATUS_TEXT = {
    400: "bad request",
    401: "not authorised",
    403: "access refused",
    404: "not found",
    429: "too many requests",
    500: "server error",
    502: "bad gateway",
    503: "service unavailable",
    504: "gateway timeout",
};
const HTTP_STATUS_URL = "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status";
/** A value mentioning arXiv, bioRxiv, medRxiv, ChemRxiv… */
const PREPRINT = /rxiv/i;
const STOPPED = Symbol("stopped");
const MAX_FILE = 5 * 1024 * 1024; // bytes
/** Blocks that are not entries: kept in the output as they are, never matched */
const SPECIAL = ["string", "preamble", "comment"];

const run = {
    id: 0, // a new run, or Clear, makes the previous run's loop leave quietly
    text: "", // the text matched (the output is this text with accepted entries replaced)
    entries: [], // makeEntry()
    cancel: null, // resolves (STOPPED) on Stop or Clear: a pending request is not waited for
    onCancel: () => {},
    fileName: "", // the chosen / dropped file, "" for pasted text
    running: false,
    stop: false,
    disabled: {}, // source id -> {status, after: the preprint it was left out on (1-based)}
    filter: "all", // all | review | matched | notfound
    scope: "all", // all | updated
};

const $ = (id) => document.getElementById(id);
const setText = (id, text) => ($(id).textContent = text);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ordinal = (n) =>
    `${n}${[11, 12, 13].includes(n % 100) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th")}`;
/** A BibTeX value as text: braces and repeated spaces removed */
const plain = (value) =>
    String(value ?? "")
        .replace(/[{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();

// ----------------------------
// -----  Parsing, output  -----
// ----------------------------

/** The first line of the text at i, cut: "@article{a2017, title={Attention}…" */
const preview = (text, i) => {
    const line = text.slice(i).split("\n")[0];
    return line.length > 40 ? `${line.slice(0, 40)}…` : line;
};

/**
 * The top-level @ blocks of a .bib text and where they are ({type, start, end}). Text between
 * them (% lines, notes) is not read; braces are counted as BibTeX does
 */
const scanBib = (text) => {
    const blocks = [];
    let i = 0;
    while (i < text.length) {
        if (text[i] === "%") {
            const nl = text.indexOf("\n", i);
            i = nl < 0 ? text.length : nl + 1;
            continue;
        }
        const head =
            text[i] === "@" && /^@\s*([A-Za-z]+)\s*([{(])/.exec(text.slice(i, i + 80));
        if (!head) {
            i++;
            continue;
        }
        const close = head[2] === "{" ? "}" : ")";
        let depth = 0;
        let j = i + head[0].length;
        for (; j < text.length; j++) {
            const c = text[j];
            if (c === "\\") j++;
            else if (c === "{") depth++;
            else if (c === "}" && depth > 0) depth--;
            else if (c === close && depth === 0) break;
        }
        if (j >= text.length)
            throw new Error(`${preview(text, i)} is not closed: a ${close} is missing`);
        blocks.push({ type: head[1].toLowerCase(), start: i, end: j + 1 });
        i = j + 1;
    }
    return blocks;
};

/** One entry's fields ({...fields, entryType, citationKey}) */
const parseEntry = (raw) => {
    const parser = new BibtexParser();
    parser.setInput(raw);
    parser.bibtex();
    const e = parser.getEntries().find((x) => x.entryTags);
    if (!e) throw new Error("no field found");
    return { ...e.entryTags, entryType: e.entryType, citationKey: e.citationKey };
};

/**
 * The entries of a .bib text with their place in it ({start, end, raw, fields}); @string,
 * @preamble and @comment are left out (and stay in the output as they are)
 */
const parseBib = (text) =>
    scanBib(text)
        .filter((b) => !SPECIAL.includes(b.type))
        .map((b) => {
            const raw = text.slice(b.start, b.end);
            try {
                return { ...b, raw, fields: parseEntry(raw) };
            } catch (error) {
                throw new Error(`${parseMessage(error)} in ${preview(text, b.start)}`);
            }
        });

/** A field's value, whatever the case of its name (DOI, doi) */
const field = (fields, name) =>
    Object.entries(fields).find(([k]) => k.toLowerCase() === name)?.[1];

/** A journal / booktitle that is a preprint server's ("arXiv preprint …", bioRxiv, CoRR) */
const isPreprintVenue = (venue) =>
    isPreprintRecord({ venue }) || /preprint|^corr$/i.test(venue);

/**
 * A preprint entry: its DOI is a preprint server's; else its journal / booktitle decides
 * when it has one (a real venue wins over an eprint or arXiv URL); else one of its values
 * (not the key nor the field names) mentions arXiv, bioRxiv, medRxiv, ChemRxiv…
 */
const isPreprintEntry = (fields) => {
    if (isPreprintRecord({ doi: field(fields, "doi") })) return true;
    const venue = plain(field(fields, "journal") || field(fields, "booktitle"));
    if (venue) return isPreprintVenue(venue);
    return Object.entries(fields).some(
        ([k, v]) =>
            k !== "citationKey" && k !== "entryType" && PREPRINT.test(String(v)),
    );
};

/** The parser's error, readable: "Token mismatch, expected }, found @article{…" */
const parseMessage = (error) =>
    String(error?.message ?? error ?? "unknown error")
        .replace(
            /^Value expected: single_value[\s\S]* for key: ([\s\S]*)$/,
            "value expected for $1",
        )
        .replace(/: match ->/, ",")
        .replace(
            /: (value_braces|value_quotes|value_comment|key_equals_value|key)\b/,
            "",
        )
        .replace(/(found )([\s\S]*)$/, (m, found, rest) => {
            const token = rest.trim().split(/\s+/)[0] ?? "";
            if (!token) return `${found}the end of the text`;
            return found + (token.length > 24 ? `${token.slice(0, 24)}…` : token);
        })
        .replace(/[.\s]+$/, "");

const makeEntry = ({ fields, start, end, raw }, index) => {
    const preprint = isPreprintEntry(fields);
    return {
        index,
        fields,
        start, // where the entry is in run.text
        end,
        original: raw, // as written
        preprint,
        status: preprint ? "queued" : "unchanged", // queued looking matched notfound notchecked
        match: null, // {bibtex, key, venue, year, source}
        decision: "pending", // pending accepted rejected
        open: false,
    };
};

const isAccepted = (e) => e.status === "matched" && e.decision === "accepted";
const toReview = (e) => e.status === "matched" && e.decision === "pending";

/**
 * The bibliography to copy / download: the text as given, accepted entries replaced and
 * everything else (other entries, comments, @string…) byte for byte; "Updated entries only":
 * the accepted entries' new text
 */
const outputText = () => {
    const accepted = run.entries.filter(isAccepted);
    if (run.scope === "updated")
        return accepted.length
            ? accepted.map((e) => e.match.bibtex).join("\n\n") + "\n"
            : "";
    let out = "";
    let last = 0;
    for (const e of accepted) {
        out += run.text.slice(last, e.start) + e.match.bibtex;
        last = e.end;
    }
    return out + run.text.slice(last);
};

// ---------------------------
// -----  Matching (run)  -----
// ---------------------------

/** A source's venue without its BibTeX: the entry with the venue, preprint fields removed */
const asPublished = (paper, venue) => {
    const bib = { ...paper };
    for (const [key, value] of Object.entries(bib)) {
        if (/^(entryType|citationKey|title)$/.test(key)) continue;
        if (PREPRINT.test(String(value))) delete bib[key];
    }
    bib.journal = venue;
    return bibtexToString(bib);
};

/** Waits ms; false when the run was stopped meanwhile */
const pause = async (ms, id) => {
    for (let t = 0; t < ms; t += 100) {
        if (run.stop || id !== run.id) return false;
        await new Promise((r) => setTimeout(r, 100));
    }
    return !run.stop && id === run.id;
};

/** A source answered an error status: it is left out for the rest of the run */
const leaveOut = (source, status, n) => {
    if (run.disabled[source.id]) return;
    run.disabled[source.id] = { status, after: n };
    renderWarnings();
};

/**
 * Looks for an entry's published version, source after source
 * @returns {Promise<object | null | typeof STOPPED>} the match, null, or STOPPED (not checked)
 */
const matchEntry = async (entry, n, keepKeys, id) => {
    for (const source of SOURCES) {
        if (run.stop || id !== run.id) return STOPPED;
        if (run.disabled[source.id]) continue;
        setText("b-now-source", `Looking on ${source.name}…`);
        // Stop does not wait for a request (a late answer is ignored)
        const answer =
            (await Promise.race([source.find({ ...entry.fields }), run.cancel])) ?? {};
        if (answer === STOPPED || run.stop || id !== run.id) return STOPPED;
        if (answer.status && !String(answer.status).startsWith("2"))
            leaveOut(source, answer.status, n);
        let bibtex = answer.bibtex;
        if (!bibtex && source.venueOnly && answer.venue)
            bibtex = asPublished(entry.fields, answer.venue);
        if (!bibtex) continue;
        let bib;
        try {
            bib = bibtexToObject(bibtex);
        } catch (error) {
            continue; // a source's BibTeX that cannot be read is no match
        }
        if (keepKeys) bib.citationKey = entry.fields.citationKey;
        // the source's own key (DBLP:conf/…, Semantic Scholar's), as before
        else if (answer.citationKey) bib.citationKey = answer.citationKey;
        return {
            bibtex: bibtexToString(bib),
            key: bib.citationKey,
            venue: plain(answer.venue || bib.journal || bib.booktitle),
            year: plain(answer.year || bib.year),
            source: source.name,
        };
    }
    return null;
};

const startRun = async () => {
    if (run.running) return;
    loadGen++; // a file still being read does not replace this text
    const text = $("bib-text").value;
    let parsed;
    try {
        parsed = parseBib(text);
        if (!parsed.length) throw new Error("no BibTeX entry found");
    } catch (error) {
        resetResults();
        showError(
            `This BibTeX could not be read: ${parseMessage(error)}. Fix the entry and try again.`,
        );
        return;
    }
    showError("");
    const id = ++run.id;
    run.onCancel();
    Object.assign(run, {
        text,
        entries: parsed.map(makeEntry),
        cancel: new Promise((resolve) => (run.onCancel = () => resolve(STOPPED))),
        running: true,
        stop: false,
        disabled: {},
        filter: "all",
        scope: "all",
    });
    showFileLine(run.entries.length, run.entries.filter((e) => e.preprint).length);
    renderRows();
    renderScope();
    const preprints = run.entries.filter((e) => e.preprint);
    if (!preprints.length) {
        run.running = false;
        setState("none");
        return;
    }
    setState("matching");
    const keepKeys = $("keep-keys").checked;
    const wait = $("api-timeout").checked;
    const total = preprints.length;
    for (const [i, entry] of preprints.entries()) {
        if (wait && i > 0) {
            setText("b-now-title", plain(entry.fields.title));
            setText("b-now-source", "Waiting 3 seconds…");
            if (!(await pause(3000, id))) break;
        }
        if (run.stop || id !== run.id) break;
        entry.status = "looking";
        updateRow(entry);
        setProgress(i + 1, total, i + 1);
        setText("b-now-title", plain(entry.fields.title));
        const found = await matchEntry(entry, i + 1, keepKeys, id);
        if (id !== run.id) return;
        if (found === STOPPED) {
            entry.status = "queued";
            updateRow(entry);
            break;
        }
        entry.status = found ? "matched" : "notfound";
        entry.match = found;
        updateRow(entry);
        renderFilters();
    }
    if (id !== run.id) return;
    run.running = false;
    const notChecked = preprints.filter((e) => e.status === "queued");
    for (const entry of notChecked) {
        entry.status = "notchecked";
        updateRow(entry);
    }
    setState(notChecked.length ? "stopped" : "done");
};

// ----------------------
// -----  Rendering  -----
// ----------------------

/** body[data-state] and what goes with it: buttons, progress, summary, footer */
const setState = (state) => {
    document.body.dataset.state = state;
    const running = state === "matching";
    const again = state !== "input";
    $("match-bib").hidden = running;
    $("match-bib").classList.toggle("is-again", again);
    $("match-bib").classList.toggle("pm-btn-primary", !again);
    setText("match-bib-label", again ? "Match again" : "Find published versions");
    $("match-bib-stop").hidden = !running;
    $("match-bib-stop").disabled = false;
    setText("match-bib-stop", "Stop");
    $("b-progress-top").hidden = !["matching", "stopped"].includes(state);
    $("b-now").hidden = !running;
    $("b-done").hidden = running;
    renderWarnings();
    renderSummary();
    renderFilters();
    renderOutput();
    updateInputUI();
};

const setProgress = (shown, total, done) => {
    setText("b-progress-count", `${shown} / ${plural(total, "preprint", "preprints")}`);
    $("b-bar").style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
};

const renderSummary = () => {
    const state = document.body.dataset.state;
    const preprints = run.entries.filter((e) => e.preprint);
    const matched = preprints.filter((e) => e.status === "matched").length;
    const checked = preprints.filter((e) => ["matched", "notfound"].includes(e.status));
    const badge = $("b-done-badge");
    const others = run.entries.length - preprints.length;
    if (state === "done") {
        badge.className = "pm-badge pm-badge-ok";
        badge.innerHTML = `${icon("check")}Done`;
        setText(
            "b-done-text",
            `${matched} of ${plural(preprints.length, "preprint", "preprints")} ${
                matched === 1 ? "has" : "have"
            } a published version.`,
        );
        setText(
            "b-done-more",
            others
                ? `${plural(others, "other entry is not a preprint", "other entries are not preprints")}.`
                : "",
        );
        setProgress(preprints.length, preprints.length, preprints.length);
    } else if (state === "stopped") {
        badge.className = "pm-badge pm-badge-neutral";
        badge.textContent = "Stopped";
        setText(
            "b-done-text",
            `${matched} of the ${plural(checked.length, "preprint", "preprints")} checked ${
                matched === 1 ? "has" : "have"
            } a published version.`,
        );
        const left = preprints.length - checked.length;
        setText(
            "b-done-more",
            `${plural(left, "preprint was", "preprints were")} not checked.`,
        );
        setProgress(checked.length, preprints.length, checked.length);
    } else if (state === "none") {
        badge.className = "pm-badge pm-badge-neutral";
        badge.textContent = "Nothing to match";
        setText(
            "b-done-text",
            `No preprints found in ${plural(run.entries.length, "entry", "entries")}.`,
        );
        setText(
            "b-done-more",
            "BibMatcher looks up arXiv, bioRxiv, medRxiv and ChemRxiv preprints.",
        );
    }
};

/** One note per source left out (an error status), with a link about status codes */
const renderWarnings = () => {
    const box = $("b-warnings");
    box.textContent = "";
    for (const [id, { status, after }] of Object.entries(run.disabled)) {
        const name = SOURCES.find((s) => s.id === id)?.name ?? id;
        const why = STATUS_TEXT[status] ? ` (${STATUS_TEXT[status]})` : "";
        const note = document.createElement("div");
        note.className = "o-note b-warn";
        note.innerHTML = icon("alert");
        const span = document.createElement("span");
        span.textContent = run.running
            ? `${name} is left out for the rest of this run: it answered with status ${status}${why}. `
            : `${name} was left out after the ${ordinal(after)} entry: it answered with status ${status}${why}. `;
        const link = document.createElement("a");
        link.className = "pm-out";
        link.href = HTTP_STATUS_URL;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.dataset.tip = "Open MDN's page about HTTP status codes";
        link.textContent = "About HTTP status codes";
        span.append(link);
        note.append(span);
        box.append(note);
    }
};

const BADGE = {
    matched: () => `<span class="pm-badge pm-badge-ok">${icon("check")}Matched</span>`,
    notfound: () => '<span class="pm-badge pm-badge-warn">Not found</span>',
    unchanged: () => '<span class="pm-badge pm-badge-neutral">Unchanged</span>',
    queued: () => '<span class="pm-badge pm-badge-outline">Queued</span>',
    notchecked: () => '<span class="pm-badge pm-badge-outline">Not checked</span>',
    looking: () =>
        '<span class="pm-badge pm-badge-neutral"><i class="b-spin b-spin-sm"></i>Looking</span>',
};

/** The reason line under the title */
const reason = (entry) => {
    if (entry.status === "notfound") return "No published version found.";
    if (entry.status !== "unchanged") return "";
    const venue = plain(
        field(entry.fields, "journal") || field(entry.fields, "booktitle"),
    );
    const year = plain(field(entry.fields, "year"));
    return venue
        ? `Not a preprint: already ${venue}${year ? ` ${year}` : ""}.`
        : "Not a preprint.";
};

const venueText = (m) =>
    m.year && !m.venue.includes(m.year) ? `${m.venue} ${m.year}` : m.venue;

/** The lines of two BibTeX entries, keys padded to the same width (aligned diff) */
const alignedLines = (a, b) => {
    const field = /^ {2}([^\s=]+)\s*= /;
    const lines = [a.split("\n"), b.split("\n")];
    const width = Math.max(
        0,
        ...lines.flat().map((l) => l.match(field)?.[1].length ?? 0),
    );
    return lines.map((ls) =>
        ls.map((l) => l.replace(field, (m, k) => `  ${k.padEnd(width)} = `)),
    );
};

/**
 * Line diff (longest common subsequence) of the entry as written and the new one; lines
 * compared without any spaces and without their trailing comma
 * @returns {[("same"|"del"|"add"), string][]}
 */
const diffLines = (before, after) => {
    const [a, b] = alignedLines(before, after);
    const canon = (l) => l.replace(/\s+/g, "").replace(/,$/, "");
    const ca = a.map(canon);
    const cb = b.map(canon);
    const L = Array.from({ length: a.length + 1 }, () =>
        new Array(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--)
        for (let j = b.length - 1; j >= 0; j--)
            L[i][j] =
                ca[i] === cb[j]
                    ? L[i + 1][j + 1] + 1
                    : Math.max(L[i + 1][j], L[i][j + 1]);
    const out = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (ca[i] === cb[j]) {
            out.push(["same", b[j]]);
            i++;
            j++;
        } else if (L[i + 1][j] >= L[i][j + 1]) out.push(["del", a[i++]]);
        else out.push(["add", b[j++]]);
    }
    while (i < a.length) out.push(["del", a[i++]]);
    while (j < b.length) out.push(["add", b[j++]]);
    return out;
};

const decisionButtons = (key) =>
    `<button type="button" class="pm-btn pm-btn-sm" data-act="reject" aria-label="Reject the change to ${key}">Reject</button>` +
    `<button type="button" class="pm-btn pm-btn-sm pm-btn-primary" data-act="accept" aria-label="Accept the change to ${key}">Accept</button>`;

const diffHTML = (entry) => {
    const m = entry.match;
    const lines = diffLines(entry.original, m.bibtex);
    const removed = lines.filter(([k]) => k === "del").length;
    const added = lines.filter(([k]) => k === "add").length;
    const sign = { same: " ", del: "−", add: "+" };
    const cls = { same: "", del: ' class="is-del"', add: ' class="is-add"' };
    const keyLine =
        m.key === entry.fields.citationKey
            ? "Citation key kept."
            : `Citation key changed to ${escapeHtml(m.key)}.`;
    const key = escapeHtml(entry.fields.citationKey);
    return `<div class="b-diffwrap">
        <div class="b-diffcard">
            <div class="b-diffhead">
                <span><b>${key}</b> · proposed by ${escapeHtml(m.source)}</span>
                <span class="pm-spacer"></span>
                <span class="b-legend"><i class="is-del"></i>removed</span>
                <span class="b-legend"><i class="is-add"></i>added</span>
            </div>
            <pre class="b-diff">${lines
                .map(
                    ([k, l]) =>
                        `<div data-s="${sign[k]}"${cls[k]}>${escapeHtml(l)}</div>`,
                )
                .join("")}</pre>
            <div class="b-difffoot">
                <span>${keyLine} ${plural(removed, "line", "lines")} removed, ${added} added.</span>
                <span class="pm-spacer"></span>
                <button type="button" class="pm-quiet" data-act="copy" data-tip="Copy the version proposed by ${escapeHtml(m.source)}, accepted or not">${icon("bib")}<span>Copy published entry</span></button>
                ${entry.decision === "pending" ? decisionButtons(key) : ""}
            </div>
        </div>
    </div>`;
};

const decisionHTML = (entry) => {
    if (entry.status !== "matched") return '<span class="b-dec"></span>';
    const key = escapeHtml(entry.fields.citationKey);
    const tip = entry.open ? "Hide the change" : "Show the change";
    const chev = `<button type="button" class="pm-iconbtn b-chev" data-act="toggle" aria-expanded="${entry.open}" aria-label="${tip}" data-tip="${tip}">${icon("down", "pm-i-sm")}</button>`;
    if (entry.decision === "pending")
        return `<span class="b-dec is-pending">${decisionButtons(key)}${chev}</span>`;
    const accepted = entry.decision === "accepted";
    const word = accepted ? "Accepted" : "Rejected";
    return `<span class="b-dec"><span class="b-state${accepted ? " is-ok" : ""}">${icon(
        accepted ? "check" : "x",
    )}${word}</span><button type="button" class="pm-quiet" data-act="undo" aria-label="Undo: ${word.toLowerCase()} change to ${key}">Undo</button>${chev}</span>`;
};

const itemHTML = (entry) => {
    const m = entry.status === "matched" ? entry.match : null;
    const key = escapeHtml(entry.fields.citationKey);
    const why = reason(entry);
    const venue = m ? escapeHtml(venueText(m)) : "";
    const source = m ? escapeHtml(m.source) : "";
    const title = escapeHtml(plain(entry.fields.title) || "(no title)");
    return `<div class="b-item${entry.open && m ? " is-open" : ""}" data-index="${entry.index}">
        <div class="b-row">
            <span class="b-status">${BADGE[entry.status]()}</span>
            <span class="b-key" title="${key}">${key}</span>
            <span class="b-main"><span class="b-title">${title}</span>${
                why ? `<div class="b-why">${escapeHtml(why)}</div>` : ""
            }${m ? `<div class="b-meta-narrow">${venue} · found on ${source}</div>` : ""}</span>
            <span class="b-venue">${
                m ? `${venue}<div class="b-why">found on ${source}</div>` : ""
            }</span>
            ${decisionHTML(entry)}
        </div>${entry.open && m ? diffHTML(entry) : ""}
    </div>`;
};

const visible = (entry) =>
    ({
        all: true,
        review: toReview(entry),
        matched: entry.status === "matched",
        notfound: entry.status === "notfound",
    })[run.filter];

const renderRows = () => {
    $("b-rows").innerHTML = run.entries.map(itemHTML).join("");
    applyFilter();
};

/** Redraws one entry's row (and diff); the focus stays on the same control when it can */
const updateRow = (entry, focusAct) => {
    const old = $("b-rows").querySelector(`.b-item[data-index="${entry.index}"]`);
    if (!old) return;
    const had = old.contains(document.activeElement)
        ? document.activeElement.dataset.act
        : null;
    const act = focusAct ?? had;
    const tpl = document.createElement("template");
    tpl.innerHTML = itemHTML(entry).trim();
    const item = tpl.content.firstElementChild;
    item.hidden = !visible(entry);
    old.replaceWith(item);
    if (!act) return;
    if (!item.hidden)
        return (
            item.querySelector(`[data-act="${act}"]`) ??
            item.querySelector("[data-act]")
        )?.focus();
    // the row left the filter (To review): the next row to review, else the filter tabs
    const rows = [...$("b-rows").children].filter((it) => !it.hidden);
    const next =
        rows.find(
            (it) =>
                it.compareDocumentPosition(item) & Node.DOCUMENT_POSITION_PRECEDING &&
                it.querySelector('[data-act="accept"]'),
        ) ?? rows.find((it) => it.querySelector('[data-act="accept"]'));
    (
        next?.querySelector('[data-act="accept"]') ??
        $("b-filters").querySelector('[aria-pressed="true"]')
    ).focus();
};

const applyFilter = () => {
    let shown = 0;
    for (const item of $("b-rows").children) {
        const v = visible(run.entries[item.dataset.index]);
        item.hidden = !v;
        shown += v ? 1 : 0;
    }
    $("b-empty-filter").hidden = shown > 0 || !run.entries.length;
};

const renderFilters = () => {
    const counts = {
        all: run.entries.length,
        review: run.entries.filter(toReview).length,
        matched: run.entries.filter((e) => e.status === "matched").length,
        notfound: run.entries.filter((e) => e.status === "notfound").length,
    };
    for (const [k, n] of Object.entries(counts))
        $("b-filters").querySelector(`[data-count="${k}"]`).textContent = n;
    for (const b of $("b-filters").querySelectorAll("[data-filter]"))
        b.setAttribute("aria-pressed", String(b.dataset.filter === run.filter));
    $("b-accept-all").disabled = !counts.review;
    $("b-reject-all").disabled = !counts.review;
    applyFilter();
};

const renderScope = () => {
    for (const b of $("b-scope").querySelectorAll("[data-scope]"))
        b.setAttribute("aria-pressed", String(b.dataset.scope === run.scope));
};

/** Footer: what the new bibliography holds, and the resulting BibTeX */
const renderOutput = () => {
    const updated = run.entries.filter(isAccepted).length;
    const pending = run.entries.filter(toReview).length;
    // the same entries as outputText()
    const shown = run.scope === "updated" ? updated : run.entries.length;
    setText(
        "b-foot-title",
        `Your new bibliography: ${plural(shown, "entry", "entries")}, ${updated} updated`,
    );
    setText(
        "b-foot-help",
        (pending === 1
            ? "1 change still to review; it stays as in your file until you accept it. "
            : pending
              ? `${pending} changes still to review; they stay as in your file until you accept them. `
              : "") + "Everything else stays exactly as in your file.",
    );
    const text = outputText();
    setText("match-results", text);
    $("copy-results").disabled = !text;
    $("download-results").disabled = !text;
};

/** A decision changed: the row, counts and output follow */
const decided = (entry, focusAct) => {
    updateRow(entry, focusAct);
    renderFilters();
    renderOutput();
};

// ------------------
// -----  Input  -----
// ------------------

const showError = (message) => {
    setText("b-error-text", message);
    $("b-error").hidden = !message;
    $("bib-text").classList.toggle("is-invalid", !!message);
    $("bib-text").setAttribute("aria-invalid", String(!!message));
};

/** "thesis.bib · 9 entries, 6 preprints" (the counts when the text can be read) */
const showFileLine = (total, preprints) => {
    const has = !!$("bib-text").value.trim();
    $("b-hint").hidden = has;
    $("b-filechip").hidden = !has;
    setText("b-filename", run.fileName || "Your BibTeX");
    if (total === undefined) return setText("b-filecount", "");
    setText(
        "b-filecount",
        ` · ${plural(total, "entry", "entries")}, ${
            preprints ? plural(preprints, "preprint", "preprints") : "no preprint"
        }`,
    );
};

let countTimer;
/** Counts entries and preprints of the text as it is typed (quietly: errors show on run) */
const countLater = () => {
    clearTimeout(countTimer);
    countTimer = setTimeout(() => {
        try {
            const entries = parseBib($("bib-text").value);
            showFileLine(
                entries.length,
                entries.filter((e) => isPreprintEntry(e.fields)).length,
            );
        } catch (error) {
            showFileLine();
        }
    }, 250);
};

/** The field grows with its content (up to its max-height) */
const grow = () => {
    const t = $("bib-text");
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
};

const updateInputUI = () => {
    const has = !!$("bib-text").value.trim();
    $("match-bib").disabled = !has;
    $("b-clear").hidden = !has;
};

/** Back to the input state: results and progress cleared (a running match stops quietly) */
const resetResults = () => {
    run.id++;
    run.onCancel();
    Object.assign(run, {
        text: "",
        entries: [],
        running: false,
        stop: false,
        disabled: {},
    });
    renderRows();
    setState("input");
};

let loadGen = 0; // a newer load, Clear or a run makes a file still being read be dropped

const loadFile = async (file) => {
    if (!file || run.running) return;
    if (!/\.(bib|bibtex|txt)$/i.test(file.name) && !file.type.startsWith("text/")) {
        showError(`${file.name} is not a .bib file.`);
        return;
    }
    if (file.size > MAX_FILE) {
        showError(`${file.name} is too large: BibMatcher reads files up to 5 MB.`);
        return;
    }
    const gen = ++loadGen;
    const text = await file.text();
    if (gen !== loadGen) return;
    resetResults();
    showError("");
    run.fileName = file.name;
    $("bib-text").value = text;
    grow();
    updateInputUI();
    countLater();
};

const clearAll = () => {
    loadGen++;
    resetResults();
    showError("");
    run.fileName = "";
    $("bib-text").value = "";
    grow();
    updateInputUI();
    showFileLine();
    $("bib-text").focus();
};

// --------------------------------
// -----  Copy, Download, UI  -----
// --------------------------------

/**
 * Copy / Download with changes not reviewed yet: they stay as in the file; asks first
 * @returns {Promise<boolean>} go on
 */
const confirmPending = async (verb) => {
    const n = run.entries.filter(toReview).length;
    if (!n) return true;
    const answer = await askDialog({
        title: `${plural(n, "change is", "changes are")} not reviewed yet`,
        body: [`${n === 1 ? "It" : "They"} will stay as in your file.`],
        actions: [{ label: `${verb} anyway`, value: "ok", kind: "primary" }],
        cancel: "Review them",
    });
    if (answer === "ok") return true;
    run.filter = "review";
    renderFilters();
    document.querySelector(".b-results").scrollIntoView({ block: "start" });
    $("b-rows")
        .querySelector('.b-item:not([hidden]) [data-act="accept"]')
        ?.focus({ preventScroll: true });
    return false;
};

/** "Copied" on a button for a moment */
const flash = (button, text) => {
    const label = button.querySelector("span");
    if (label.dataset.label === undefined) label.dataset.label = label.textContent;
    label.textContent = text;
    clearTimeout(label.timer);
    label.timer = setTimeout(() => (label.textContent = label.dataset.label), 1500);
};

const downloadName = () =>
    `${run.fileName ? run.fileName.replace(/\.(bib|bibtex|txt)$/i, "") : "bibliography"}-matched.bib`;

const setListeners = () => {
    const text = $("bib-text");
    text.addEventListener("input", () => {
        grow();
        updateInputUI();
        countLater();
    });
    $("b-choose").addEventListener("click", () => $("b-file").click());
    $("b-file").addEventListener("change", (e) => {
        loadFile(e.target.files[0]);
        e.target.value = "";
    });
    $("b-clear").addEventListener("click", clearAll);

    // a file dropped anywhere on the page (never opened by the browser instead)
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes("Files");
    let depth = 0;
    document.addEventListener("dragenter", (e) => {
        if (!hasFiles(e)) return;
        depth++;
        $("b-drop").classList.add("is-drop");
    });
    document.addEventListener("dragleave", (e) => {
        if (!hasFiles(e) || --depth > 0) return;
        depth = 0;
        $("b-drop").classList.remove("is-drop");
    });
    document.addEventListener("dragover", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = run.running ? "none" : "copy";
    });
    document.addEventListener("drop", (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        $("b-drop").classList.remove("is-drop");
        loadFile(e.dataTransfer.files[0]);
    });

    $("match-bib").addEventListener("click", startRun);
    $("match-bib-stop").addEventListener("click", () => {
        run.stop = true;
        run.onCancel();
        $("match-bib-stop").disabled = true;
        setText("match-bib-stop", "Stopping…");
    });
    // ⌘↵ / Ctrl+↵ from anywhere but another text field
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || !(e.metaKey || e.ctrlKey) || e.isComposing) return;
        if ($("o-dialog").open || run.running || $("match-bib").disabled) return;
        const t = document.activeElement;
        const field =
            "textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button])";
        if (t !== text && t?.matches?.(field)) return;
        e.preventDefault();
        startRun();
    });

    $("b-rows").addEventListener("click", (e) => {
        const button = e.target.closest("[data-act]");
        const item = e.target.closest(".b-item");
        if (!button || !item) return;
        const entry = run.entries[item.dataset.index];
        const act = button.dataset.act;
        if (act === "accept" || act === "reject") {
            entry.decision = act === "accept" ? "accepted" : "rejected";
            decided(entry, "undo");
        } else if (act === "undo") {
            entry.decision = "pending";
            decided(entry, "accept");
        } else if (act === "toggle") {
            entry.open = !entry.open;
            updateRow(entry, "toggle");
        } else if (act === "copy") {
            copyTextToClipboard(entry.match.bibtex);
            flash(button, "Copied");
        }
    });
    $("b-filters").addEventListener("click", (e) => {
        const b = e.target.closest("[data-filter]");
        if (!b) return;
        run.filter = b.dataset.filter;
        renderFilters();
    });
    const decideAll = (decision) => {
        for (const entry of run.entries.filter(toReview)) {
            entry.decision = decision;
            updateRow(entry);
        }
        renderFilters();
        renderOutput();
    };
    $("b-accept-all").addEventListener("click", () => decideAll("accepted"));
    $("b-reject-all").addEventListener("click", () => decideAll("rejected"));
    $("b-scope").addEventListener("click", (e) => {
        const b = e.target.closest("[data-scope]");
        if (!b) return;
        run.scope = b.dataset.scope;
        renderScope();
        renderOutput();
    });
    $("copy-results").addEventListener("click", async () => {
        if (!(await confirmPending("Copy"))) return;
        copyTextToClipboard(outputText());
        flash($("copy-results"), "Copied");
    });
    $("download-results").addEventListener("click", async () => {
        if (!(await confirmPending("Download"))) return;
        downloadTextFile(outputText(), downloadName(), "text/x-bibtex");
    });
};

(async () => {
    document
        .querySelectorAll("[data-mod-enter]")
        .forEach((el) => (el.textContent = isMac ? "⌘↵" : "Ctrl ↵"));
    paintIcons();
    setupTooltips();
    setListeners();
    setState("input");
    grow();
    await setupTopbar("bibMatcher");
    document.documentElement.dataset.bibmatcherReady = "true";
})();

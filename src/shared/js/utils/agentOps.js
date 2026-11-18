// ES Module imports
import { cleanPapers } from "@pmu/functions.js";
import { paperToAbs } from "@pmu/paper.js";
import { bibtexToString } from "@pmu/bibtexParser.js";

// Pure operations behind Agent access (see CONTEXT.md § Agent access): argument
// bounds, Summaries, searches, Project tags, tag and note edits, Provenance and
// Own additions. No chrome.* calls: callers read and write storage.

const MAX_NOTE_LENGTH = 20000;
const MAX_EXPORT_BYTES = 900000;
const MAX_MUTATIONS_PER_MINUTE = 30;

// the arguments each operation accepts, mapped to whether they are required
const OP_ARGS = {
    hello: {},
    pair: { clientName: true },
    search_papers: { query: true, limit: false, offset: false },
    get_paper: { id: true },
    list_tags: {},
    add_paper: { url: true, tags: true, reason: true, note: false },
    get_project_info: {},
    attach_paper: { id: true },
    list_project_papers: { limit: false, offset: false },
    export_bibtex: {},
    add_tags: { id: true, tags: true },
    append_note: { id: true, text: true },
    flag_for_deletion: { id: true, reason: true },
    delete_paper: { id: true },
};

const agentError = (code, message) => ({ code, message });

const isString = (value, min, max) =>
    typeof value === "string" && value.length >= min && value.length <= max;

const isInteger = (value, min, max = Infinity) =>
    Number.isInteger(value) && value >= min && value <= max;

const isHttpUrl = (url) => {
    try {
        return ["http:", "https:"].includes(new URL(url).protocol);
    } catch (error) {
        return false;
    }
};

const removeControlChars = (str) => str.replace(/\p{Cc}/gu, "");

// sort comparator on a string key, e.g. an ISO date
const compareBy = (key) => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);

const sha256Hex = async (str) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
};

/**
 * Trim tags and drop empty ones.
 * @param {string[]} tags The tags to normalize
 * @returns {string[]} The trimmed, non-empty tags
 */
export const normalizeTags = (tags) => tags.map((t) => t.trim()).filter((t) => t);

// each argument's bound, and the rule reported when it is not met
const ARG_BOUNDS = {
    clientName: {
        check: (v) => typeof v === "string" && isString(removeControlChars(v), 1, 64),
        rule: "a string of 1 to 64 characters, control characters excluded",
    },
    query: {
        check: (v) => isString(v, 0, 256),
        rule: "a string of at most 256 characters",
    },
    limit: { check: (v) => isInteger(v, 1, 50), rule: "an integer from 1 to 50" },
    offset: { check: (v) => isInteger(v, 0), rule: "an integer from 0" },
    id: {
        check: (v) => isString(v, 0, 256),
        rule: "a string of at most 256 characters",
    },
    url: {
        check: (v) => isString(v, 0, 2048) && isHttpUrl(v),
        rule: "an http or https URL of at most 2048 characters",
    },
    tags: {
        check: (v) => {
            if (!Array.isArray(v) || !v.every((t) => typeof t === "string")) {
                return false;
            }
            const tags = normalizeTags(v);
            return (
                tags.length <= 20 &&
                tags.every((t) => t.length <= 64 && !t.startsWith("proj-"))
            );
        },
        rule: "at most 20 tags of at most 64 characters, none starting with proj- (reserved for Project tags)",
    },
    reason: {
        check: (v) => isString(v, 1, 500),
        rule: "a string of 1 to 500 characters",
    },
    note: {
        check: (v) => isString(v, 0, 2000),
        rule: "a string of at most 2000 characters",
    },
    text: {
        check: (v) => isString(v, 0, 2000),
        rule: "a string of at most 2000 characters",
    },
};

/**
 * Check an operation's arguments against the Agent access bounds, before any work.
 * @param {string} op The operation's name
 * @param {object} args The operation's arguments
 * @param {object} papers The stored papers, to look up an `id` argument
 * @returns {object|null} null if the arguments are valid, else an error {code, message}
 * whose code is `unknown-op`, `bad-args` or `not-found`
 */
export const validateArgs = (op, args, papers) => {
    if (!OP_ARGS.hasOwnProperty(op)) {
        return agentError("unknown-op", "Unknown operation");
    }
    args = args ?? {};
    if (typeof args !== "object" || Array.isArray(args)) {
        return agentError("bad-args", "Arguments must be an object");
    }
    const accepted = OP_ARGS[op];
    if (Object.keys(args).some((key) => !accepted.hasOwnProperty(key))) {
        const names = Object.keys(accepted).join(", ") || "none";
        return agentError("bad-args", `Unknown argument (accepted: ${names})`);
    }
    for (const [key, required] of Object.entries(accepted)) {
        if (args[key] === undefined) {
            if (required) return agentError("bad-args", `Missing argument ${key}`);
        } else if (!ARG_BOUNDS[key].check(args[key])) {
            return agentError(
                "bad-args",
                `Invalid argument ${key}: ${ARG_BOUNDS[key].rule}`,
            );
        }
    }
    if (accepted.hasOwnProperty("id")) {
        const cleaned = cleanPapers(papers);
        if (args.id.startsWith("__") || !cleaned.hasOwnProperty(args.id)) {
            return agentError("not-found", "No paper has this id");
        }
        const appended =
            op === "append_note"
                ? args.text
                : op === "flag_for_deletion"
                  ? `[to-delete] ${args.reason}`
                  : null;
        const note = cleaned[args.id].note ?? "";
        if (appended !== null && note.length + 1 + appended.length > MAX_NOTE_LENGTH) {
            return agentError(
                "bad-args",
                `The note would exceed ${MAX_NOTE_LENGTH} characters`,
            );
        }
    }
    return null;
};

/**
 * Make the Project tag of a new Project: `proj-<slug>` from its label, with a
 * suffix from its hash while another Project uses that tag.
 * @param {string} label The Project label
 * @param {string} hash The Project's hash (hex SHA-256 of its Project key)
 * @param {string[]} existingTags The tags of the other Projects
 * @returns {string} The Project tag
 */
export const projectTag = (label, hash, existingTags) => {
    const slug =
        label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 40)
            .replace(/-$/, "") || hash.slice(0, 8);
    const used = new Set(existingTags);
    let tag = `proj-${slug}`;
    for (let n = 4; used.has(tag) && n <= hash.length; n += 2) {
        tag = `proj-${slug}-${hash.slice(0, n)}`;
    }
    return tag;
};

/**
 * Describe a paper to an agent. Of its Provenance, only the client's name, the date,
 * the reason and the Project label are given, never ids or hashes.
 * @param {object} paper The paper to describe
 * @returns {object} The paper's Summary
 */
export const paperSummary = (paper) => {
    const summary = {
        id: paper.id,
        title: paper.title,
        author: paper.author,
        year: paper.year,
        venue: paper.venue,
        tags: paper.tags,
        url: paperToAbs(paper),
        pdfLink: paper.pdfLink,
        addDate: paper.addDate,
        codeLink: paper.codeLink,
    };
    if (paper.provenance) {
        const { clientName, addedAt, reason, projectLabel } = paper.provenance;
        summary.provenance = { clientName, addedAt, reason };
        if (projectLabel) summary.provenance.projectLabel = projectLabel;
    }
    return summary;
};

/**
 * Search papers like the Memory's search box (`searchMemory`): a paper matches if
 * each word of the query is in its title, authors, note, tags, id or venue. Most
 * recently opened papers come first, as in the Memory's default order.
 * @param {object} papers The stored papers
 * @param {object} args {query, limit, offset}
 * @returns {object} {total, papers: [Summary]}
 */
export const searchPapers = (papers, { query, limit = 20, offset = 0 }) => {
    const words = query.toLowerCase().split(" ");
    const keys = ["title", "author", "note", "tags", "id", "venue"];
    const matches = Object.values(cleanPapers(papers))
        .filter((paper) => {
            const contents = keys.map((key) => {
                const value = paper[key];
                if (Array.isArray(value)) return value.join(" ").toLowerCase();
                return typeof value === "string" ? value.toLowerCase() : "";
            });
            return words.every((w) => contents.some((c) => c.includes(w)));
        })
        .sort((a, b) => compareBy("lastOpenDate")(b, a));
    return {
        total: matches.length,
        papers: matches.slice(offset, offset + limit).map(paperSummary),
    };
};

// the papers of a Project, oldest addition first
const projectMembers = (papers, projectHash) =>
    Object.values(cleanPapers(papers))
        .filter((paper) => paper.projectHashes?.includes(projectHash))
        .sort(compareBy("addDate"));

/**
 * List a Project's papers, oldest addition first.
 * @param {object} papers The stored papers
 * @param {string} projectHash The Project's hash
 * @param {object} args {limit, offset}
 * @returns {object} {total, papers: [Summary]}
 */
export const projectPapers = (papers, projectHash, { limit = 20, offset = 0 } = {}) => {
    const members = projectMembers(papers, projectHash);
    return {
        total: members.length,
        papers: members.slice(offset, offset + limit).map(paperSummary),
    };
};

/**
 * Export a Project's BibTeX like the options page's export by tag, oldest addition
 * first. A paper without BibTeX, or whose BibTeX cannot be formatted, is skipped.
 * @param {object} papers The stored papers
 * @param {string} projectHash The Project's hash
 * @returns {object} {count, bibtex, skipped: [id]}, or a `too-large` error
 * {code, message} if that result exceeds 900,000 bytes
 */
export const exportBibtex = (papers, projectHash) => {
    const entries = [];
    const skipped = [];
    for (const paper of projectMembers(papers, projectHash)) {
        let entry = null;
        try {
            entry = paper.bibtex ? bibtexToString(paper.bibtex) : null;
        } catch (error) {
            entry = null;
        }
        if (entry) entries.push(entry);
        else skipped.push(paper.id);
    }
    const result = { count: entries.length, bibtex: entries.join("\n"), skipped };
    if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_EXPORT_BYTES) {
        return agentError(
            "too-large",
            `The BibTeX export exceeds ${MAX_EXPORT_BYTES} bytes`,
        );
    }
    return result;
};

/**
 * List the stored papers' tags, by name, with their number of papers.
 * @param {object} papers The stored papers
 * @returns {object} {tags: [{tag, count}]}
 */
export const listTags = (papers) => {
    const counts = new Map();
    for (const paper of Object.values(cleanPapers(papers))) {
        for (const tag of paper.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const tags = [...counts.keys()].sort();
    return { tags: tags.map((tag) => ({ tag, count: counts.get(tag) })) };
};

/**
 * Count the stored papers, or a Project's papers.
 * @param {object} papers The stored papers
 * @param {string} [projectHash] The Project's hash
 * @returns {number} The number of papers
 */
export const countPapers = (papers, projectHash) =>
    projectHash
        ? projectMembers(papers, projectHash).length
        : Object.keys(cleanPapers(papers)).length;

/**
 * Add tags to a list of tags, skipping those already present.
 * @param {string[]} tags The current tags
 * @param {string[]} newTags The tags to add
 * @returns {string[]} The current tags followed by the new ones
 */
export const mergeTags = (tags, newTags) => [...new Set([...tags, ...newTags])];

/**
 * Append a line to a paper's note: a note is never replaced.
 * @param {object} paper The paper, updated in place
 * @param {string} text The text to append
 * @returns {object} The paper
 */
export const appendNote = (paper, text) => {
    paper.note = `${paper.note ?? ""}\n${text}`;
    return paper;
};

/**
 * Put a Deletion flag on a paper: the `to-delete` tag and the reason in its note.
 * @param {object} paper The paper, updated in place
 * @param {string} reason Why the paper should be deleted
 * @returns {object} The paper
 */
export const flagForDeletion = (paper, reason) => {
    paper.tags = mergeTags(paper.tags, ["to-delete"]);
    return appendNote(paper, `[to-delete] ${reason}`);
};

/**
 * Make the Provenance of a paper an agent adds. It keeps hashes of the Agent session
 * id and of the Project key, never the ids or keys themselves.
 * @param {object} auth The request's auth ({clientId, sessionId, projectKey?})
 * @param {object} fields {clientName, projectLabel, reason}: the Paired client's name,
 * the Project label (used with a Project only) and the agent's reason
 * @returns {Promise<object>} {clientId, clientName, sessionHash, projectHash?,
 * projectLabel?, addedAt, reason}
 */
export const makeProvenance = async (auth, { clientName, projectLabel, reason }) => ({
    clientId: auth.clientId,
    clientName,
    sessionHash: await sha256Hex(auth.sessionId),
    ...(auth.projectKey && {
        projectHash: await sha256Hex(auth.projectKey),
        projectLabel,
    }),
    addedAt: new Date().toISOString(),
    reason,
});

/**
 * Is a paper an Own addition of the requesting Paired client: added by that client
 * in the same Project (in any Agent session) or, when added without a Project, in
 * the same Agent session?
 * @param {object} paper The paper
 * @param {object} auth The request's auth ({clientId, sessionId, projectKey?})
 * @returns {Promise<boolean>} Whether the paper is an Own addition
 */
export const isOwnAddition = async (paper, auth) => {
    const provenance = paper.provenance;
    if (!provenance || provenance.clientId !== auth.clientId) return false;
    if (provenance.projectHash) {
        return (
            Boolean(auth.projectKey) &&
            provenance.projectHash === (await sha256Hex(auth.projectKey))
        );
    }
    return provenance.sessionHash === (await sha256Hex(auth.sessionId));
};

/**
 * Count a mutating operation against its Paired client's limit of 30 per minute.
 * @param {number[]} timestamps The client's recent mutating operation times (ms),
 * updated in place
 * @param {number} now The current time (ms)
 * @returns {object|null} null if the operation may run, else a `rate-limited` error
 * {code, message}
 */
export const checkRate = (timestamps, now = Date.now()) => {
    while (timestamps.length && timestamps[0] <= now - 60000) timestamps.shift();
    if (timestamps.length >= MAX_MUTATIONS_PER_MINUTE) {
        return agentError(
            "rate-limited",
            `At most ${MAX_MUTATIONS_PER_MINUTE} changes per minute`,
        );
    }
    timestamps.push(now);
    return null;
};

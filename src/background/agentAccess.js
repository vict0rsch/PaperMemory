// ES Module imports
import { getStorage, setStorage, updateDuplicatedUrls } from "@pmu/data.js";
import { runMemoryOp } from "@pmu/memoryQueue.js";
import {
    logError,
    cleanPapers,
    getBrowserName,
    setLocalBackgroundHandler,
} from "@pmu/functions.js";
import { initState } from "@pmu/state.js";
import {
    validateArgs,
    normalizeTags,
    projectTag,
    paperSummary,
    searchPapers,
    projectPapers,
    exportBibtex,
    listTags,
    countPapers,
    mergeTags,
    appendNote,
    flagForDeletion,
    makeProvenance,
    isOwnAddition,
    checkRate,
    removeControlChars,
    sha256Hex,
} from "@pmu/agentOps.js";
import { ingest, filterStorageRequest } from "@pm/background/agentIngest.js";

// Agent access in the background (see CONTEXT.md § Agent access and ADR 0002): the
// connection to the Native host, pairing, authorization and the operations. Changes
// run one at a time in a queue, each within deadlines.

// the operation protocol versions PaperMemory accepts
export const PROTOCOL_MIN = 1;
export const PROTOCOL_MAX = 1;

const HOST_NAME = "org.papermemory.agent";
const KEEPALIVE_ALARM = "pm-agent-keepalive";
// the Native host exits on a larger message
const MAX_MESSAGE_BYTES = 1024 * 1024;
const PAIRING_TIMEOUT_MS = 120000;
// the OS notification of the pending pairing request (one at a time)
const PAIRING_NOTIFICATION = "pm-agent-pairing";
const DENY_COOLDOWN_MS = 60000;
const MAX_QUEUED_JOBS = 50;
const JOB_START_DEADLINE_MS = 30000;
const JOB_RUN_DEADLINE_MS = 90000;
const INGEST_READY_TIMEOUT_MS = 10000;
// Agent session ids and Project keys: 32 bytes, in hex
const HEX_64 = /^[0-9a-f]{64}$/;
const FAILED_MESSAGE = "PaperMemory could not add this paper";
const PROJECT_OPS = [
    "get_project_info",
    "attach_paper",
    "list_project_papers",
    "export_bibtex",
];
// the changes that create their Project's entry and tag
const PROJECT_CREATING_OPS = ["add_paper", "attach_paper"];

const failure = (code, message) => ({ error: { code, message } });
const UNAUTHORIZED = failure(
    "unauthorized",
    "This client is not paired with PaperMemory, or was revoked",
);
const AGENT_ACCESS_OFF = failure("unauthorized", "Agent access is off in PaperMemory");
const INTERNAL = failure("internal", "PaperMemory could not complete this operation");
// a change whose job is past its deadline: its agent was answered, it is not made
const EXPIRED = failure("timeout", "PaperMemory did not finish this change in time");

let pushSync = async () => {}; // the background's pushSyncPapers
let port = null; // the Native host connection
let connecting = null; // the connection attempt in progress
let connectedAt = 0;
let reconnectDelay = 1000;
let reconnectTimer = null;
let library = null; // {libraryId, label, browser}
// the Native host's version and protocol range, for the options page
let status = { connected: false };
let pendingPairing = null; // the one pairing request waiting for the user
let deniedAt = -Infinity; // when the user last denied a pairing request
const revokedClients = new Set(); // client ids revoked since the worker started
let disables = 0; // times Agent access was turned off since the worker started
const rateWindows = new Map(); // client id => times of its recent changes
const queue = []; // changes waiting to run
let queueRunning = false;
let clientsWrite = Promise.resolve(); // serializes the writes to agentClients
let ingestDocumentOpen = false; // Chrome: the offscreen document exists
let resolveIngestReady = null;

/**
 * Is a pairing prompt message from the options tab PaperMemory opened for this
 * pairing request? Content scripts share the extension's id: the tab and the page
 * are checked.
 * @param {object} sender The message's sender (runtime.MessageSender)
 * @param {object|null} pending The pending pairing request with the message's
 * requestId ({tabId, optionsUrl, ...}), null if there is none (e.g. already decided)
 * @returns {boolean} Whether to accept the message
 */
export const isValidPairSender = (sender, pending) =>
    Boolean(pending) &&
    Number.isInteger(sender?.tab?.id) &&
    sender.tab.id === pending.tabId &&
    typeof sender.url === "string" &&
    sender.url.startsWith(pending.optionsUrl);

// answer a request on the Native host connection it came from: an answer never
// reaches the connections of another (restarted) host
const post = ({ port: hostPort, id }, { result, error }) => {
    let message = error ? { id, ok: false, error } : { id, ok: true, result };
    if (new TextEncoder().encode(JSON.stringify(message)).length > MAX_MESSAGE_BYTES) {
        const tooLarge = { code: "too-large", message: "The answer exceeds 1 MiB" };
        message = { id, ok: false, error: tooLarge };
    }
    try {
        hostPort.postMessage(message);
    } catch (e) {
        // disconnected: nobody waits for this answer anymore
    }
};

const isEnabled = async () => (await getStorage("agentAccess"))?.enabled === true;

const hasNativeMessaging = () =>
    new Promise((resolve) =>
        chrome.permissions.contains({ permissions: ["nativeMessaging"] }, resolve),
    );

// optional, requested with nativeMessaging: users who turned Agent access on before
// may not have it
const hasNotifications = () =>
    new Promise((resolve) =>
        chrome.permissions.contains({ permissions: ["notifications"] }, resolve),
    );

// ----------------------------
// -----  Paired clients  -----
// ----------------------------

// read, change and write agentClients, one change at a time
const updateClients = (change) => {
    const write = clientsWrite.then(async () => {
        const clients = (await getStorage("agentClients")) ?? {};
        change(clients);
        await setStorage("agentClients", clients);
    });
    clientsWrite = write.catch(() => {});
    return write;
};

// the Paired client whose secret the auth carries, or null
const authorize = async (auth) => {
    if (typeof auth?.clientId !== "string" || typeof auth.secret !== "string") {
        return null;
    }
    if (revokedClients.has(auth.clientId)) return null;
    const clients = (await getStorage("agentClients")) ?? {};
    if (!clients.hasOwnProperty(auth.clientId)) return null;
    const client = clients[auth.clientId];
    return client.secretHash === (await sha256Hex(auth.secret)) ? client : null;
};

// pair a client the user allowed: only the hash of its secret is stored
const addClient = async (clientName) => {
    const clientId = crypto.randomUUID();
    const secret = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    const secretHash = await sha256Hex(secret);
    const now = new Date().toISOString();
    await updateClients((clients) => {
        clients[clientId] = { clientName, secretHash, pairedAt: now, lastSeenAt: now };
    });
    return { clientId, secret };
};

// the user revoked a client (options page): its queued changes are refused
const revokeClient = async (clientId) => {
    revokedClients.add(clientId);
    failQueued((job) => job.auth.clientId === clientId, UNAUTHORIZED);
    await updateClients((clients) => {
        delete clients[clientId];
    });
};

// check the auth fields the MCP server sets, like arguments (bad-args), and remove
// control characters from the Project label and folder name, which are stored
const cleanAuth = (auth) => {
    const invalid = (field) => failure("bad-args", `Invalid auth.${field}`);
    if (typeof auth.sessionId !== "string" || !HEX_64.test(auth.sessionId)) {
        return invalid("sessionId");
    }
    const clean = {
        clientId: auth.clientId,
        secret: auth.secret,
        sessionId: auth.sessionId,
    };
    if (auth.projectKey !== undefined) {
        if (typeof auth.projectKey !== "string" || !HEX_64.test(auth.projectKey)) {
            return invalid("projectKey");
        }
        const folderName =
            typeof auth.projectFolderName === "string"
                ? removeControlChars(auth.projectFolderName)
                : "";
        // in code points: the MCP server cuts the folder name to 64 of them
        const length = [...folderName].length;
        if (length < 1 || length > 64) return invalid("projectFolderName");
        clean.projectKey = auth.projectKey;
        clean.projectFolderName = folderName;
    }
    if (auth.projectLabel !== undefined) {
        const label =
            typeof auth.projectLabel === "string"
                ? removeControlChars(auth.projectLabel)
                : "";
        if (label.length < 1 || label.length > 64) return invalid("projectLabel");
        clean.projectLabel = label;
    }
    return { auth: clean };
};

// the Project's agentProjects entry, created (with its fixed Project tag) only if
// `create`, which the job then records; a change with auth.projectLabel updates its
// label
const syncProject = async (job, create) => {
    const { auth, projectHash } = job;
    const projects = (await getStorage("agentProjects")) ?? {};
    let project = projects.hasOwnProperty(projectHash) ? projects[projectHash] : null;
    if (project) {
        if (auth.projectLabel === undefined || auth.projectLabel === project.label) {
            return project;
        }
        project.label = auth.projectLabel;
    } else if (create) {
        const label = auth.projectLabel ?? auth.projectFolderName;
        const tags = Object.values(projects).map((p) => p.tag);
        project = {
            label,
            tag: projectTag(label, projectHash, tags),
            createdAt: new Date().toISOString(),
        };
        projects[projectHash] = project;
        job.projectCreated = true;
    } else {
        return null;
    }
    await setStorage("agentProjects", projects);
    return project;
};

// -------------------
// -----  Reads  -----
// -------------------

// operations that only read: they never write storage
const READS = {
    search_papers: ({ papers, args }) => ({ result: searchPapers(papers, args) }),
    get_paper: ({ papers, args }) => {
        const paper = papers[args.id];
        return {
            result: { ...paperSummary(paper), bibtex: paper.bibtex, note: paper.note },
        };
    },
    list_tags: ({ papers }) => ({ result: listTags(papers) }),
    get_project_info: async ({ papers, projectHash }) => {
        const projects = (await getStorage("agentProjects")) ?? {};
        if (!projects.hasOwnProperty(projectHash)) return { result: { label: null } };
        const { label, tag } = projects[projectHash];
        return { result: { label, tag, paperCount: countPapers(papers, projectHash) } };
    },
    list_project_papers: ({ papers, args, projectHash }) => ({
        result: projectPapers(papers, projectHash, args),
    }),
    export_bibtex: ({ papers, projectHash }) => {
        const exported = exportBibtex(papers, projectHash);
        return exported.code ? { error: exported } : { result: exported };
    },
};

// --------------------
// -----  Ingest  -----
// --------------------

// Chrome: the offscreen document's storage calls, filtered; listened to only while
// the document exists
const onStorageRequest = (message, sender, sendResponse) => {
    if (
        message?.type !== "agent-storage" ||
        sender.tab ||
        sender.url !== chrome.runtime.getURL("agentIngest.html")
    ) {
        return;
    }
    if (message.op === "get") {
        chrome.storage.local.get(
            filterStorageRequest("get", message.keys),
            sendResponse,
        );
    } else if (message.op === "set") {
        // a dropped write still completes: initState's backup and prefs writes wait
        chrome.storage.local.set(filterStorageRequest("set", message.items), () =>
            sendResponse(),
        );
    } else {
        return;
    }
    return true;
};

const settlesWithin = (promise, ms) => {
    let timer;
    const timeout = new Promise((resolve) => (timer = setTimeout(resolve, ms, false)));
    return Promise.race([promise.then(() => true), timeout]).finally(() =>
        clearTimeout(timer),
    );
};

// Chrome: the offscreen document; its storage proxy is registered before it is
// created (its initState reads storage)
const openIngestDocument = async () => {
    if (ingestDocumentOpen) return;
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
    });
    // left by a worker that stopped while it was open: it has no storage proxy
    if (contexts.length) await chrome.offscreen.closeDocument();
    const ready = new Promise((resolve) => (resolveIngestReady = resolve));
    ingestDocumentOpen = true;
    chrome.runtime.onMessage.addListener(onStorageRequest);
    try {
        await chrome.offscreen.createDocument({
            url: "agentIngest.html",
            reasons: ["DOM_PARSER"],
            justification:
                "Parse paper pages that paired local agents ask PaperMemory to add",
        });
        if (!(await settlesWithin(ready, INGEST_READY_TIMEOUT_MS))) {
            throw new Error("The offscreen document was not ready in time");
        }
    } catch (e) {
        await closeIngestDocument();
        throw e;
    }
};

const closeIngestDocument = async () => {
    if (!ingestDocumentOpen) return;
    ingestDocumentOpen = false;
    resolveIngestReady = null;
    try {
        await chrome.offscreen.closeDocument();
    } catch (e) {
        // not created, or already closed
    }
    chrome.runtime.onMessage.removeListener(onStorageRequest);
};

// ingest in the background page on Firefox (it has a DOM), in the offscreen document
// on Chrome; any failure is `failed`
const runIngest = async (job) => {
    try {
        if (import.meta.env.FIREFOX) {
            await initState({ isContentScript: true, print: false });
            return await ingest(job);
        }
        await openIngestDocument();
        const jobId = crypto.randomUUID();
        const response = await chrome.runtime.sendMessage({
            type: "agent-ingest-job",
            jobId,
            job,
        });
        if (response?.type === "agent-ingest-result" && response.jobId === jobId) {
            return response.outcome;
        }
    } catch (e) {
        logError("[agentAccess] ingest:", e);
    }
    return { status: "failed" };
};

// ---------------------
// -----  Changes  -----
// ---------------------

// a change checked and made in one step of the Memory's queue (memoryQueue.js), on the
// papers as stored then: no other write comes between the check and the change.
// `change(papers)` answers the outcome ({result} or {error}), with `write: true` when
// it changed the papers
const changeMemory = async (change) => {
    const answer = await runMemoryOp({ op: "agent", change });
    return answer.ok ? answer.result : INTERNAL;
};

// a job's change at its commit point (its Memory step), refused if the job is past its
// deadline (its agent was answered), or if its client was revoked or Agent access turned
// off since the job started (that does not stop a running job); null if it may be made
const refusal = (job) => {
    if (job.expired) return EXPIRED;
    if (revokedClients.has(job.auth.clientId)) return UNAUTHORIZED;
    if (job.disables !== disables) return AGENT_ACCESS_OFF;
    return null;
};

// add_paper: ingest, then append the note, whose total is known only then
const addPaper = async (job) => {
    const { args, auth, client, project, projectHash } = job;
    const tags = mergeTags(
        mergeTags(["review"], normalizeTags(args.tags)),
        project ? [project.tag] : [],
    );
    const provenance = await makeProvenance(auth, {
        clientName: client.clientName,
        projectLabel: project?.label,
        reason: args.reason,
    });
    const { status, id } =
        (await runIngest({ url: args.url, tags, provenance, projectHash })) ?? {};
    // past its deadline, the job was answered timeout-may-complete
    if (job.expired) return;
    if (status === "unsupported-url") return { result: { status } };
    if (status !== "stored" && status !== "already-present") {
        return { result: { status: "failed", message: FAILED_MESSAGE } };
    }
    const outcome = await changeMemory((papers) => {
        if (typeof id !== "string" || !cleanPapers(papers).hasOwnProperty(id)) {
            return { result: { status, id } };
        }
        if (!args.note)
            return { result: { status, id, paper: paperSummary(papers[id]) } };
        const invalid = validateArgs("append_note", { id, text: args.note }, papers);
        if (invalid) {
            const message = `${invalid.message}: the paper was added (${id}) without your note`;
            return failure(invalid.code, message);
        }
        const refused = refusal(job);
        if (refused) return refused;
        appendNote(papers[id], args.note);
        return { write: true, result: { status, id, paper: paperSummary(papers[id]) } };
    });
    pushSync().catch(() => {});
    return outcome;
};

// a change to one paper, checked and made on the paper as stored (changeMemory)
const editPaper = async (job, change) => {
    const outcome = await changeMemory((papers) => {
        const invalid = validateArgs(job.op, job.args, papers);
        if (invalid) return { error: invalid };
        const refused = refusal(job);
        if (refused) return refused;
        change(papers[job.args.id]);
        return { write: true, result: paperSummary(papers[job.args.id]) };
    });
    if (outcome.result) pushSync().catch(() => {});
    return outcome;
};

// delete_paper: only an Own addition, checked on the paper as stored (changeMemory)
const deletePaper = async (job) => {
    const outcome = await changeMemory(async (papers) => {
        const invalid = validateArgs(job.op, job.args, papers);
        if (invalid) return { error: invalid };
        if (!(await isOwnAddition(papers[job.args.id], job.auth))) {
            return failure(
                "not-own-addition",
                "You did not add this paper in this project: use flag_for_deletion",
            );
        }
        const refused = refusal(job);
        if (refused) return refused;
        delete papers[job.args.id];
        return { write: true, result: { deleted: true } };
    });
    if (!outcome.result) return outcome;
    // as deletePaperInStorage does: its urls no longer lead to it
    await updateDuplicatedUrls(null, job.args.id, true);
    pushSync().catch(() => {});
    return outcome;
};

// operations that change the Library, run by the queue
const MUTATIONS = {
    add_paper: addPaper,
    attach_paper: (job) =>
        editPaper(job, (paper) => {
            paper.tags = mergeTags(paper.tags, [job.project.tag]);
            if (!paper.projectHashes?.includes(job.projectHash)) {
                paper.projectHashes = [...(paper.projectHashes ?? []), job.projectHash];
            }
        }),
    add_tags: (job) =>
        editPaper(job, (paper) => {
            paper.tags = mergeTags(paper.tags, normalizeTags(job.args.tags));
        }),
    append_note: (job) => editPaper(job, (paper) => appendNote(paper, job.args.text)),
    flag_for_deletion: (job) =>
        editPaper(job, (paper) => flagForDeletion(paper, job.args.reason)),
    delete_paper: deletePaper,
};

// -------------------
// -----  Queue  -----
// -------------------

// remove the matching queued changes; answer them, unless nobody waits for them
const failQueued = (matches, outcome) => {
    for (const job of queue.filter(matches)) {
        queue.splice(queue.indexOf(job), 1);
        if (outcome) post(job, outcome);
    }
};

const enqueue = (job) => {
    if (queue.length >= MAX_QUEUED_JOBS) {
        return failure(
            "busy",
            "PaperMemory has too many changes waiting: try again later",
        );
    }
    queue.push({ ...job, enqueuedAt: Date.now() });
    runQueue();
};

// right before a change: Agent access is still on and the client still authorized
// (checked again when the change is made: refusal)
const runMutation = async (job) => {
    job.disables = disables;
    if (!(await isEnabled())) return AGENT_ACCESS_OFF;
    job.client = await authorize(job.auth);
    if (!job.client) return UNAUTHORIZED;
    await updateClients((clients) => {
        if (clients.hasOwnProperty(job.auth.clientId)) {
            clients[job.auth.clientId].lastSeenAt = new Date().toISOString();
        }
    });
    if (job.projectHash) {
        job.project = await syncProject(job, PROJECT_CREATING_OPS.includes(job.op));
    }
    const outcome = await MUTATIONS[job.op](job);
    // a first add or attach that put no paper in the Project does not fix it: the next
    // one creates its entry, label and tag again. Not past the deadline, when later
    // changes may already use the entry
    if (job.projectCreated && !job.expired) {
        const papers = (await getStorage("papers")) ?? {};
        if (!countPapers(papers, job.projectHash)) {
            const projects = (await getStorage("agentProjects")) ?? {};
            delete projects[job.projectHash];
            await setStorage("agentProjects", projects);
        }
    }
    return outcome;
};

// one change, raced against its deadline: a throw or a pipeline that never finishes
// cannot stall the queue
const runJob = async (job) => {
    if (Date.now() - job.enqueuedAt > JOB_START_DEADLINE_MS) {
        post(
            job,
            failure("busy", "PaperMemory was busy with other changes: try again later"),
        );
        return;
    }
    let timer;
    const deadline = new Promise(
        (resolve) => (timer = setTimeout(resolve, JOB_RUN_DEADLINE_MS, "deadline")),
    );
    let outcome;
    try {
        outcome = await Promise.race([runMutation(job), deadline]);
    } catch (e) {
        logError("[agentAccess]", e);
        outcome =
            job.op === "add_paper"
                ? { result: { status: "failed", message: FAILED_MESSAGE } }
                : INTERNAL;
    } finally {
        clearTimeout(timer);
    }
    if (outcome === "deadline") {
        job.expired = true;
        if (job.op === "add_paper") {
            // its pipeline may still store the paper (Firefox), or may have stored it
            // before the offscreen document is closed (Chrome)
            await closeIngestDocument();
            outcome = { result: { status: "timeout-may-complete" } };
        } else {
            outcome = failure(
                "timeout",
                "PaperMemory did not finish this change in time",
            );
        }
    }
    post(job, outcome);
};

// run the queued changes one at a time, then close the offscreen document (Chrome)
const runQueue = async () => {
    if (queueRunning) return;
    queueRunning = true;
    try {
        while (queue.length) {
            await runJob(queue.shift()).catch((e) => logError("[agentAccess]", e));
        }
        await closeIngestDocument();
    } finally {
        queueRunning = false;
    }
    // changes queued while the offscreen document was closing
    if (queue.length) runQueue();
};

// ---------------------
// -----  Pairing  -----
// ---------------------

// end the pending pairing request if it matches; answer it, unless nobody waits
const cancelPairing = (matches, outcome) => {
    const pending = pendingPairing;
    if (!pending || !matches(pending)) return;
    pendingPairing = null;
    clearTimeout(pending.timer);
    chrome.notifications?.clear(PAIRING_NOTIFICATION);
    if (outcome) post(pending, outcome);
};

// bring a window to the front, also out of another application. The window may be
// gone: reading lastError keeps that quiet
const focusWindow = (windowId) =>
    chrome.windows.update(
        windowId,
        { focused: true, drawAttention: true },
        () => void chrome.runtime.lastError,
    );

// the pairing prompt in a new active tab, brought to the front; in a new window when
// no window can take the tab (a browser on macOS runs on without any). `callback` gets
// the prompt's tab, none if it could not open
const openPairingTab = (url, callback) => {
    const opened = (tab) => {
        if (tab) focusWindow(tab.windowId);
        callback(tab);
    };
    chrome.tabs.create({ url, active: true }, (tab) => {
        if (tab) return opened(tab);
        chrome.windows.create({ url }, (win) => opened(win?.tabs?.[0]));
    });
};

// a click on the pairing request's notification: show its prompt
const onNotificationClicked = (notificationId) => {
    if (notificationId !== PAIRING_NOTIFICATION) return;
    chrome.notifications.clear(PAIRING_NOTIFICATION);
    const tabId = pendingPairing?.tabId;
    if (!Number.isInteger(tabId)) return;
    // the user may have closed the prompt: reading lastError keeps that quiet
    chrome.tabs.update(tabId, { active: true }, (tab) =>
        tab ? focusWindow(tab.windowId) : void chrome.runtime.lastError,
    );
};

// an OS notification of the pairing request, for a user in another application, only
// if they granted the permission. The client chose its name: shown as plain text,
// without control or format characters (e.g. bidi overrides), cut to 64 characters
const notifyPairing = async (pending) => {
    // Chrome may lack the API in a worker that started before the permission was granted
    if (!chrome.notifications || !(await hasNotifications())) return;
    if (pending !== pendingPairing) return; // decided meanwhile
    if (!chrome.notifications.onClicked.hasListener(onNotificationClicked)) {
        chrome.notifications.onClicked.addListener(onNotificationClicked);
    }
    const name = [...removeControlChars(pending.clientName).replace(/\p{Cf}/gu, "")]
        .slice(0, 64)
        .join("");
    chrome.notifications.create(PAIRING_NOTIFICATION, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: `${name} wants to use PaperMemory`,
        message: "Click Allow on the PaperMemory tab to let it read and add papers.",
    });
};

// ask the user to allow a client, in an options tab; answered on the user's decision
const pair = async (request, clientName) => {
    if (pendingPairing) {
        return failure(
            "busy",
            "Another pairing request is waiting for the user: try again later",
        );
    }
    if (Date.now() - deniedAt < DENY_COOLDOWN_MS) {
        return failure(
            "rate-limited",
            "The user denied a pairing request less than a minute ago",
        );
    }
    if (import.meta.env.WXT_PM_AGENT_TEST === "1") {
        // test builds only: automated tests cannot click Allow
        console.info("pm-agent-test-auto-allow");
        return { result: await addClient(clientName) };
    }
    const requestId = crypto.randomUUID();
    const optionsUrl = chrome.runtime.getURL("options.html");
    const pending = {
        port: request.port,
        id: request.id,
        conn: request.conn,
        requestId,
        clientName,
        optionsUrl,
    };
    pending.timer = setTimeout(
        () =>
            cancelPairing(
                (p) => p === pending,
                failure(
                    "timeout",
                    "The user did not answer the pairing request in time",
                ),
            ),
        PAIRING_TIMEOUT_MS,
    );
    pending.tabCreated = new Promise((resolve) =>
        openPairingTab(`${optionsUrl}#agent-pairing=${requestId}`, (tab) => {
            pending.tabId = tab?.id;
            // no prompt for the user to answer: end the request now
            if (!Number.isInteger(pending.tabId)) {
                cancelPairing(
                    (p) => p === pending,
                    failure(
                        "internal",
                        "PaperMemory could not open its pairing prompt",
                    ),
                );
            } else {
                notifyPairing(pending).catch((e) =>
                    logError("[agentAccess] notification:", e),
                );
            }
            resolve();
        }),
    );
    pendingPairing = pending;
};

// the options tab's pairing prompt: the client's name, then the user's decision,
// accepted once
const answerPairingPage = async (message, sender) => {
    const pending =
        pendingPairing?.requestId === message.requestId ? pendingPairing : null;
    // the tab's id is known once it is created
    await pending?.tabCreated;
    if (pending !== pendingPairing || !isValidPairSender(sender, pending)) return false;
    if (message.type === "agent-pair-info") return { clientName: pending.clientName };
    cancelPairing((p) => p === pending, null);
    if (message.allow !== true) deniedAt = Date.now();
    // the MCP server that asked has closed its connection: the request has expired,
    // and no client is created that nobody would receive
    if (pending.closed) return false;
    if (message.allow === true) {
        try {
            post(pending, { result: await addClient(pending.clientName) });
        } catch (e) {
            logError("[agentAccess] pairing:", e);
            post(pending, INTERNAL);
        }
    } else {
        post(pending, failure("denied", "The user denied this client access"));
    }
    return true;
};

// ----------------------
// -----  Requests  -----
// ----------------------

const hello = async () => ({
    protocolMin: PROTOCOL_MIN,
    protocolMax: PROTOCOL_MAX,
    libraryId: library.libraryId,
    label: library.label,
    browser: library.browser,
    paperCount: countPapers((await getStorage("papers")) ?? {}),
});

// the outcome of a request ({result} or {error}), or nothing if it is answered later
// (a queued change, a pairing request)
const answer = async (request, protocol) => {
    const { op, args } = request;
    if (
        op !== "hello" &&
        !(
            Number.isInteger(protocol) &&
            protocol >= PROTOCOL_MIN &&
            protocol <= PROTOCOL_MAX
        )
    ) {
        return failure(
            "protocol-mismatch",
            protocol > PROTOCOL_MAX
                ? "Update the PaperMemory extension"
                : "Run `npx -y papermemory-mcp@latest install`",
        );
    }
    if (op === "hello" || op === "pair") {
        const invalid = validateArgs(op, args, {});
        if (invalid) return { error: invalid };
        if (op === "hello") return { result: await hello() };
        return pair(request, removeControlChars(args.clientName));
    }
    const isRead = READS.hasOwnProperty(op);
    if (!isRead && !MUTATIONS.hasOwnProperty(op)) {
        return failure("unknown-op", "Unknown operation");
    }
    if (!(await authorize(request.auth))) return UNAUTHORIZED;
    const papers = (await getStorage("papers")) ?? {};
    const invalid = validateArgs(op, args, papers);
    if (invalid) return { error: invalid };
    const { auth, error } = cleanAuth(request.auth);
    if (error) return { error };
    const projectHash = auth.projectKey ? await sha256Hex(auth.projectKey) : null;
    if (PROJECT_OPS.includes(op) && !projectHash) {
        return failure("no-project", "This session has no Project: see get_project");
    }
    if (isRead) return READS[op]({ papers, args, projectHash });
    if (!rateWindows.has(auth.clientId)) rateWindows.set(auth.clientId, []);
    const limited = checkRate(rateWindows.get(auth.clientId));
    if (limited) return { error: limited };
    return enqueue({ ...request, auth, projectHash });
};

const handleRequest = async (hostPort, message) => {
    // the Native host prefixes request ids with their connection: "<conn>:<id>"
    const request = {
        port: hostPort,
        id: message.id,
        conn: message.id.split(":")[0],
        op: message.op,
        args: message.args ?? {},
        auth: message.auth,
    };
    let outcome;
    try {
        outcome = await answer(request, message.protocol);
    } catch (e) {
        logError("[agentAccess]", e);
        outcome = INTERNAL;
    }
    if (outcome) post(request, outcome);
};

// -------------------------
// -----  Native host  -----
// -------------------------

const connect = async () => {
    if (port || !(await isEnabled())) return;
    let { libraryId } = (await getStorage("agentLibrary")) ?? {};
    if (!libraryId) {
        libraryId = crypto.randomUUID();
        await setStorage("agentLibrary", { libraryId });
    }
    const browser = await getBrowserName();
    // checked last: Agent access may have been turned off meanwhile
    if (port || !(await hasNativeMessaging()) || !(await isEnabled())) return;
    // Chrome: missing in a worker that started before the permission was granted
    if (typeof chrome.runtime.connectNative !== "function") return;
    library = { libraryId, label: `${browser} · ${libraryId.slice(0, 6)}`, browser };
    const hostPort = chrome.runtime.connectNative(HOST_NAME);
    port = hostPort;
    connectedAt = Date.now();
    hostPort.onMessage.addListener((message) => onHostMessage(hostPort, message));
    hostPort.onDisconnect.addListener(() => onHostDisconnect(hostPort));
    hostPort.postMessage({ type: "hello", libraryId, label: library.label });
};

// idempotent: one connection attempt at a time, none while connected
const ensureConnected = () => {
    connecting ??= connect()
        .catch((e) => logError("[agentAccess] connect:", e))
        .finally(() => (connecting = null));
    return connecting;
};

const onHostMessage = (hostPort, message) => {
    if (hostPort !== port || !message || typeof message !== "object") return;
    // the Native host forwards a socket client's message only with a string id, and
    // sends its own without one: a client cannot pass for the host
    if (typeof message.id === "string") {
        handleRequest(hostPort, message);
    } else if (message.id === undefined && message.type === "host-ready") {
        status = {
            connected: true,
            hostVersion: message.version,
            protocolMin: message.protocolMin,
            protocolMax: message.protocolMax,
        };
        reconnectDelay = 1000;
    } else if (message.id === undefined && message.type === "client-closed") {
        // that connection's queued changes: nobody waits for them. Its pairing request
        // stays until decided or timed out: one at a time, so that prompts are
        // throttled; its decision is then answered as expired
        const conn = String(message.conn);
        failQueued((job) => job.port === hostPort && job.conn === conn, null);
        if (pendingPairing?.port === hostPort && pendingPairing.conn === conn) {
            pendingPairing.closed = true;
        }
    }
};

// the Native host is gone: drop its queued changes and pairing request, and
// reconnect after 1 s, then up to 60 s
const onHostDisconnect = (hostPort) => {
    if (hostPort !== port) return;
    port = null;
    // Chrome reports the error in runtime.lastError, Firefox in the port
    status = {
        connected: false,
        error: chrome.runtime.lastError?.message ?? hostPort.error?.message ?? null,
    };
    failQueued((job) => job.port === hostPort, null);
    cancelPairing((p) => p.port === hostPort, null);
    if (Date.now() - connectedAt > 10000) reconnectDelay = 1000;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(ensureConnected, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 60000);
};

// Agent access turned off, or its permission removed: refuse the queued changes and
// the pairing request, then disconnect (a running job finishes, its change is refused)
const disable = () => {
    disables++;
    clearTimeout(reconnectTimer);
    chrome.alarms.clear(KEEPALIVE_ALARM);
    const hostPort = port;
    if (!hostPort) return;
    port = null;
    status = { connected: false };
    failQueued((job) => job.port === hostPort, AGENT_ACCESS_OFF);
    cancelPairing((p) => p.port === hostPort, AGENT_ACCESS_OFF);
    hostPort.disconnect();
};

// Chrome: a worker running when nativeMessaging is granted cannot use it; save the
// intent, reload, and reopen the options page from the fresh worker
const onPermissionAdded = async ({ permissions = [] }) => {
    if (!permissions.includes("nativeMessaging")) return;
    await setStorage("agentAccess", { enabled: true });
    if (typeof chrome.runtime.connectNative !== "function") {
        await setStorage("agentReopenOptions", true);
        chrome.runtime.reload();
        return;
    }
    ensureConnected();
};

const start = async () => {
    if (await getStorage("agentReopenOptions")) {
        await setStorage("agentReopenOptions", false);
        chrome.runtime.openOptionsPage();
    }
    if (await isEnabled()) {
        chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
    }
    await ensureConnected();
};

// --------------------------------
// -----  Extension messages  -----
// --------------------------------

const isOptionsPage = (sender) =>
    typeof sender.url === "string" &&
    sender.url.startsWith(chrome.runtime.getURL("options.html"));

const onExtensionMessage = (message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || !message) return;
    if (message.type === "agent-ingest-ready") {
        if (!sender.tab && sender.url === chrome.runtime.getURL("agentIngest.html")) {
            resolveIngestReady?.();
        }
    } else if (
        message.type === "agent-pair-info" ||
        message.type === "agent-pair-decision"
    ) {
        answerPairingPage(message, sender).then(sendResponse, () =>
            sendResponse(false),
        );
        return true;
    } else if (message.type === "agent-status" && isOptionsPage(sender)) {
        sendResponse(status);
    } else if (
        message.type === "agent-revoke" &&
        isOptionsPage(sender) &&
        typeof message.clientId === "string"
    ) {
        revokeClient(message.clientId).then(
            () => sendResponse(true),
            () => sendResponse(false),
        );
        return true;
    }
};

/**
 * Start Agent access in the background: connect to the Native host while Agent
 * access is on, answer its requests and the options page's messages.
 * @param {object} background The background's `pushSyncPapers` (Gist push after each
 * change) and `handleBackgroundMessage` (its runtime message handler)
 */
export const initAgentAccess = ({ pushSyncPapers, handleBackgroundMessage }) => {
    pushSync = pushSyncPapers;
    if (import.meta.env.FIREFOX) {
        // ingest runs in this background page, and Sources fetch through
        // sendMessageToBackground: a context never receives its own runtime messages
        setLocalBackgroundHandler(handleBackgroundMessage);
    }
    // registered synchronously, so that these events wake the worker
    chrome.runtime.onMessage.addListener(onExtensionMessage);
    chrome.runtime.onStartup.addListener(ensureConnected);
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === KEEPALIVE_ALARM) ensureConnected();
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.agentAccess) return;
        if (changes.agentAccess.newValue?.enabled === true) {
            chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 1 });
            ensureConnected();
        } else {
            disable();
        }
    });
    chrome.permissions.onAdded.addListener(onPermissionAdded);
    chrome.permissions.onRemoved.addListener(({ permissions = [] }) => {
        if (permissions.includes("nativeMessaging")) disable();
    });
    start().catch((e) => logError("[agentAccess] start:", e));
};

// ES Module imports
import { getStorage, setStorage } from "@pmu/data.js";
import { sendMessageToBackground } from "@pmu/functions.js";
import { PROTOCOL_MIN, PROTOCOL_MAX } from "@pm/background/agentAccess.js";

// Agent access in the options page (see CONTEXT.md § Agent access and ADR 0002): the
// toggle, the Native host status, the Paired clients and the pairing requests. The
// background writes agentClients and keeps the pairing requests; client names are only
// ever shown as text.

const NATIVE_MESSAGING = { permissions: ["nativeMessaging"] };
// notifications: the OS notification of a pairing request (agentAccess.js), requested
// in the same prompt
const AGENT_PERMISSIONS = { permissions: ["nativeMessaging", "notifications"] };
const STATUS_POLL_MS = 2000;
// a pairing row's buttons ignore clicks this long after the row appeared or moved: a
// row that slides under the cursor cannot take a click meant for another agent
const SETTLE_MS = 1000;

const $ = (id) => document.getElementById(id);

const hasNativeMessaging = () =>
    new Promise((resolve) => chrome.permissions.contains(NATIVE_MESSAGING, resolve));

// an element with children elements or text: strings are never parsed as HTML
const element = (tag, className, ...children) => {
    const el = document.createElement(tag);
    el.className = className;
    el.append(...children);
    return el;
};

// -------------------------------
// -----  Toggle and status  -----
// -------------------------------

// show the status message `agent-status-<name>`, or no status
const showStatus = (name) => {
    document.querySelectorAll(".agent-status").forEach((el) => (el.hidden = true));
    $("agent-access-status").hidden = !name;
    if (!name) return;
    $(`agent-status-${name}`).hidden = false;
    $("agent-status-dot").classList.toggle("is-error", name !== "connected");
};

// the background's connection to the Native host, while Agent access is on
const refreshStatus = async () => {
    const toggle = $("agent-access-toggle");
    if (!toggle.checked) return;
    const status = await sendMessageToBackground({ type: "agent-status" });
    if (!toggle.checked) return; // turned off meanwhile
    if (status?.connected) {
        showStatus(
            status.protocolMax < PROTOCOL_MIN
                ? "outdated"
                : status.protocolMin > PROTOCOL_MAX
                  ? "outdated-extension"
                  : "connected",
        );
    } else {
        // no message until the first connection attempt has failed
        showStatus(status?.error ? "not-installed" : null);
    }
};

// Firefox honours the permission request only within the user's click, so this
// handler stays synchronous until it requests. Once the permission is granted, Chrome
// reloads PaperMemory: this page closes and reopens by itself (ADR 0002)
const onToggleClick = (event) => {
    const toggle = event.target;
    if (!toggle.checked) {
        setStorage("agentAccess", { enabled: false });
        showStatus(null);
        return;
    }
    setStorage("agentAccess", { enabled: true });
    chrome.permissions.request(AGENT_PERMISSIONS, async (granted) => {
        // refusing notifications alone, when nativeMessaging was granted before, keeps
        // Agent access on
        if (granted || (await hasNativeMessaging())) {
            refreshStatus();
            return;
        }
        setStorage("agentAccess", { enabled: false });
        toggle.checked = false;
        showStatus("refused");
    });
};

// ----------------------------
// -----  Paired clients  -----
// ----------------------------

// a Paired client and its Revoke button: the list is shown again when the background
// has written the change
const makeClientRow = ([clientId, { clientName, pairedAt }]) => {
    const revoke = element("button", "pm-btn pm-btn-sm", "Revoke");
    revoke.type = "button";
    revoke.addEventListener("click", async () => {
        revoke.disabled = true;
        const revoked = await sendMessageToBackground({
            type: "agent-revoke",
            clientId,
        });
        if (!revoked) revoke.disabled = false;
    });
    return element(
        "div",
        "pm-row o-row",
        element(
            "div",
            "pm-row-text",
            // bdi: the name's text direction cannot change the text around it
            element("div", "pm-row-label", element("bdi", "", clientName)),
            element(
                "div",
                "pm-row-help",
                `Paired on ${new Date(pairedAt).toLocaleDateString()}`,
            ),
        ),
        revoke,
    );
};

// in pairing order: the background adds each new client last
const showClients = (clients) => {
    const rows = Object.entries(clients ?? {}).map(makeClientRow);
    $("agent-clients-list").replaceChildren(...rows);
    $("agent-clients-empty").hidden = rows.length > 0;
};

// ------------------------------
// -----  Pairing requests  -----
// ------------------------------

let requests = []; // the pairing requests waiting for the user, as last listed
const deciding = new Set(); // the requests this page sent the user's decision for
let outcome = null; // the last decision made in this page: {allow, clientName} or {expired}

// the last decision's outcome, under the requests
const showOutcome = () => {
    for (const status of document.querySelectorAll(".agent-pairing-outcome")) {
        status.classList.toggle("is-error", outcome?.expired === true);
        if (!outcome) status.replaceChildren();
        else if (outcome.expired) {
            status.replaceChildren(
                "This pairing request has expired or was already answered.",
            );
        } else {
            const decided = outcome.allow ? "Allowed" : "Denied";
            status.replaceChildren(
                `${decided} `,
                element("bdi", "", outcome.clientName),
                ".",
            );
        }
    }
};

// the user's decision on a pairing request, sent once; the client is allowed only if
// the user clicks Allow
const decide = async ({ requestId, clientName }, allow) => {
    if (deciding.has(requestId)) return;
    deciding.add(requestId);
    showPairingRequests(); // its buttons disabled
    const decided = await sendMessageToBackground({
        type: "agent-pair-decision",
        requestId,
        allow,
    });
    outcome = decided === true ? { allow, clientName } : { expired: true };
    refreshPairingRequests();
};

// when a client asked: the time, and the date unless it is today
const askedWhen = (requestedAt) => {
    const date = new Date(requestedAt);
    const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (date.toDateString() === new Date().toDateString()) return `at ${time}`;
    return `on ${date.toLocaleDateString()} at ${time}`;
};

// a pairing request: the client's name and when it asked, with Allow and Deny, and how
// many sessions wait for it when several do (sessions of the same name join one
// request: the user sees when something else joined)
const makeRequestRow = (request) => {
    const buttons = ["Allow", "Deny"].map((label) => {
        const button = element("button", "pm-btn", label);
        button.type = "button";
        return button;
    });
    const help = [
        element(
            "div",
            "pm-row-help",
            `Asked ${askedWhen(request.requestedAt)} to search your Memory and add papers to it`,
        ),
    ];
    if (request.sessions > 1) {
        help.push(
            element("div", "pm-row-help", `${request.sessions} sessions waiting`),
        );
    }
    const row = {
        since: Date.now(),
        buttons,
        el: element(
            "div",
            "pm-row o-row",
            element(
                "div",
                "pm-row-text",
                // bdi: the name's text direction cannot change the text around it
                element("div", "pm-row-label", element("bdi", "", request.clientName)),
                ...help,
            ),
            element("div", "o-btns", ...buttons),
        ),
    };
    buttons.forEach((button, i) =>
        button.addEventListener("click", () => {
            if (Date.now() - row.since < SETTLE_MS) return;
            decide(request, i === 0);
        }),
    );
    setTimeout(() => syncButtons(request, row), SETTLE_MS);
    return row;
};

// the buttons of a row: disabled while it settles and once its decision was sent
const syncButtons = ({ requestId }, row) => {
    const disabled = Date.now() - row.since < SETTLE_MS || deciding.has(requestId);
    row.buttons.forEach((button) => (button.disabled = disabled));
};

// the rows shown in each list, by request: a row whose request, and position, did not
// change stays as it is, with the time it appeared at that position
const shownRows = new Map(); // list element -> Map(requestId -> {request, index, row})

const showRequestRows = (list) => {
    const before = shownRows.get(list) ?? new Map();
    const after = new Map();
    requests.forEach((request, index) => {
        const kept = before.get(request.requestId);
        const same =
            kept &&
            kept.index === index &&
            JSON.stringify(kept.request) === JSON.stringify(request);
        const row = same ? kept.row : makeRequestRow(request);
        syncButtons(request, row);
        after.set(request.requestId, { request, index, row });
    });
    shownRows.set(list, after);
    list.replaceChildren(...[...after.values()].map(({ row }) => row.el));
};

// the requests at the top of the page and in Agent access, and the red dot of Agent
// access in the nav while one waits
const showPairingRequests = () => {
    for (const list of document.querySelectorAll(".agent-pairing-list")) {
        showRequestRows(list);
    }
    showOutcome();
    const shown = requests.length > 0 || outcome !== null;
    $("agent-pairing").hidden = !shown;
    $("agent-pairing-requests").hidden = !shown;
    $("agent-nav-dot").hidden = requests.length === 0;
};

// the pairing requests waiting for the user, from the background
const refreshPairingRequests = async () => {
    const listed = await sendMessageToBackground({ type: "agent-pairing-requests" });
    requests = Array.isArray(listed) ? listed : [];
    showPairingRequests();
};

// the background's messages (it has no tab, unlike a content script): the pairing
// requests changed, or the user clicked the pairing notification, so this page shows
// Agent access and answers with its tab, which the background brings to the front
const onBackgroundMessage = (message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || sender.tab) return;
    if (message?.type === "agent-pairing-changed") {
        refreshPairingRequests();
    } else if (message?.type === "agent-pairing-show") {
        $("agent-access").scrollIntoView({ block: "start" });
        chrome.tabs.getCurrent((tab) => sendResponse(tab?.id));
        return true;
    }
};

/**
 * Set up the Agent access section, and the pairing requests waiting for the user,
 * kept current while the page is open.
 */
export const setupAgentAccess = async () => {
    chrome.runtime.onMessage.addListener(onBackgroundMessage);
    refreshPairingRequests();
    const { enabled } = (await getStorage("agentAccess")) ?? {};
    // the background connects only once the permission is granted too
    $("agent-access-toggle").checked = enabled === true && (await hasNativeMessaging());
    $("agent-access-toggle").addEventListener("click", onToggleClick);
    refreshStatus();
    setInterval(refreshStatus, STATUS_POLL_MS);
    showClients(await getStorage("agentClients"));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.agentClients) {
            showClients(changes.agentClients.newValue);
        }
    });
};

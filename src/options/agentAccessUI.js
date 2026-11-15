// ES Module imports
import { findEl, showId, hideId, addListener, queryAll } from "@pmu/miniquery.js";
import { getStorage, setStorage } from "@pmu/data.js";
import { sendMessageToBackground } from "@pmu/functions.js";
import { PROTOCOL_MIN, PROTOCOL_MAX } from "@pm/background/agentAccess.js";

// Agent access in the options page (see CONTEXT.md § Agent access and ADR 0002): the
// toggle, the Native host status, the Paired clients and the pairing prompt. The
// background writes agentClients; client names are only ever shown as text.

const NATIVE_MESSAGING = { permissions: ["nativeMessaging"] };
const STATUS_POLL_MS = 2000;

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
    queryAll(".agent-status").forEach(hideId);
    if (!name) {
        hideId("agent-access-status");
        return;
    }
    showId(`agent-status-${name}`, "inline");
    showId("agent-access-status", "flex");
};

// the background's connection to the Native host, while Agent access is on
const refreshStatus = async () => {
    const toggle = findEl({ element: "agent-access-toggle" });
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
    chrome.permissions.request(NATIVE_MESSAGING, (granted) => {
        if (granted) {
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
    const revoke = element("button", "", "Revoke");
    addListener(revoke, "click", async () => {
        revoke.disabled = true;
        const revoked = await sendMessageToBackground({
            type: "agent-revoke",
            clientId,
        });
        if (!revoked) revoke.disabled = false;
    });
    return element(
        "div",
        "row align-items-center mb-2",
        // bdi: the name's text direction cannot change the text around it
        element("div", "col-5", element("strong", "", element("bdi", "", clientName))),
        element("div", "col-4", `paired on ${new Date(pairedAt).toLocaleDateString()}`),
        element("div", "col-3", revoke),
    );
};

// in pairing order: the background adds each new client last
const showClients = (clients) => {
    const rows = Object.entries(clients ?? {}).map(makeClientRow);
    findEl({ element: "agent-clients-list" }).replaceChildren(...rows);
    rows.length ? hideId("agent-clients-empty") : showId("agent-clients-empty");
};

// ----------------------------
// -----  Pairing prompt  -----
// ----------------------------

// the prompt PaperMemory opens for an agent client's first request: the client is
// allowed only if the user clicks Allow
const setupPairingPrompt = async () => {
    const requestId = window.location.hash.match(/^#agent-pairing=(.+)$/)?.[1];
    if (!requestId) return;
    const info = await sendMessageToBackground({ type: "agent-pair-info", requestId });
    showId("agent-pairing");
    if (typeof info?.clientName !== "string") {
        showId("agent-pairing-expired");
        return;
    }
    findEl({ element: "agent-pairing-client" }).textContent = info.clientName;
    showId("agent-pairing-request");
    const decide = async (allow) => {
        hideId("agent-pairing-buttons");
        const decided = await sendMessageToBackground({
            type: "agent-pair-decision",
            requestId,
            allow,
        });
        if (decided !== true) showId("agent-pairing-expired");
        else showId(allow ? "agent-pairing-allowed" : "agent-pairing-denied");
    };
    addListener("agent-pairing-allow", "click", () => decide(true));
    addListener("agent-pairing-deny", "click", () => decide(false));
};

/**
 * Set up the Agent access section, and the pairing prompt when PaperMemory opened
 * this page for a pairing request (`#agent-pairing=<requestId>`).
 */
export const setupAgentAccess = async () => {
    setupPairingPrompt();
    const { enabled } = (await getStorage("agentAccess")) ?? {};
    // the background connects only once the permission is granted too
    findEl({ element: "agent-access-toggle" }).checked =
        enabled === true && (await hasNativeMessaging());
    addListener("agent-access-toggle", "click", onToggleClick);
    refreshStatus();
    setInterval(refreshStatus, STATUS_POLL_MS);
    showClients(await getStorage("agentClients"));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.agentClients) {
            showClients(changes.agentClients.newValue);
        }
    });
};

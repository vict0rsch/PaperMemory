// ES Module imports
import { getStorage, setStorage } from "@pmu/data.js";
import { sendMessageToBackground } from "@pmu/functions.js";
import { PROTOCOL_MIN, PROTOCOL_MAX } from "@pm/background/agentAccess.js";

// Agent access in the options page (see CONTEXT.md § Agent access and ADR 0002): the
// toggle, the Native host status, the Paired clients and the pairing prompt. The
// background writes agentClients; client names are only ever shown as text.

const NATIVE_MESSAGING = { permissions: ["nativeMessaging"] };
const STATUS_POLL_MS = 2000;

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

// ----------------------------
// -----  Pairing prompt  -----
// ----------------------------

// the prompt PaperMemory opens for an agent client's first request: the client is
// allowed only if the user clicks Allow
const setupPairingPrompt = async () => {
    const requestId = window.location.hash.match(/^#agent-pairing=(.+)$/)?.[1];
    if (!requestId) return;
    const info = await sendMessageToBackground({ type: "agent-pair-info", requestId });
    $("agent-pairing").hidden = false;
    if (typeof info?.clientName !== "string") {
        $("agent-pairing-expired").hidden = false;
        return;
    }
    $("agent-pairing-client").textContent = info.clientName;
    $("agent-pairing-request").hidden = false;
    const decide = async (allow) => {
        $("agent-pairing-buttons").hidden = true;
        const decided = await sendMessageToBackground({
            type: "agent-pair-decision",
            requestId,
            allow,
        });
        if (decided !== true) $("agent-pairing-expired").hidden = false;
        else $(allow ? "agent-pairing-allowed" : "agent-pairing-denied").hidden = false;
    };
    $("agent-pairing-allow").addEventListener("click", () => decide(true));
    $("agent-pairing-deny").addEventListener("click", () => decide(false));
};

/**
 * Set up the Agent access section, and the pairing prompt when PaperMemory opened
 * this page for a pairing request (`#agent-pairing=<requestId>`).
 */
export const setupAgentAccess = async () => {
    setupPairingPrompt();
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

// First-run welcome page, opened by the background
// on install (src/background/welcome.js) and from Settings > General > Welcome page.
// 1 what gets recorded (static), 2 shortcut test, 3 sources (shared picker), 4 theme (the
// [data-set-theme] buttons are wired by the top bar, as on the options page).
import { escapeHtml } from "@pmu/functions.js";
import { paintIcons } from "@pm/popup/js/icons.js";
import { setupTooltips } from "@pm/popup/js/tooltip.js";
import {
    shortcuts,
    shortcutKeys,
    loadShortcuts,
    openShortcutSettings,
} from "@pm/popup/js/shortcuts.js";
import { setupTopbar } from "@pm/shared/js/topbar.js";
import { setupSources } from "@pm/shared/js/sourcePicker.js";

const $ = (id) => document.getElementById(id);
const COUNTS = ["", "one key", "two keys", "three keys", "four keys"];

/** waiting | ok | none: what the shortcut card shows */
const showKeyState = (keyState) => {
    $("w-shortcut").dataset.key = keyState;
    $("w-caps").classList.toggle("is-pressed", keyState === "ok");
};

/** Key caps of the popup's shortcut (chrome.commands: the user's current keys) */
const renderShortcut = async () => {
    await loadShortcuts();
    const shortcut = shortcuts._execute_action;
    if (!shortcut || shortcut === "Not set") {
        $("w-caps").innerHTML = `<span class="w-cap">No shortcut set</span>`;
        $("w-caps").classList.add("is-none");
        return showKeyState("none");
    }
    const keys = shortcutKeys(shortcut);
    $("w-caps").classList.remove("is-none");
    $("w-caps").innerHTML = keys
        .map(
            (k) =>
                `<span class="w-cap${k.length > 1 ? " is-word" : ""}">${escapeHtml(k)}</span>`,
        )
        .join("+");
    $("w-keycount").textContent = COUNTS[keys.length] ?? `${keys.length} keys`;
    if ($("w-shortcut").dataset.key !== "ok") showKeyState("waiting");
};

(async () => {
    paintIcons();
    setupTooltips();
    setupTopbar("welcome"); // no page of the top bar is the current one
    // the popup announces itself when it opens (src/popup/js/popup.js)
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (sender.id === chrome.runtime.id && message?.type === "popupOpened")
            showKeyState("ok");
    });
    document
        .querySelectorAll("[data-open-shortcuts]")
        .forEach((b) => b.addEventListener("click", openShortcutSettings));
    // back from the browser's shortcut settings: show the keys chosen there
    window.addEventListener("focus", renderShortcut);
    await renderShortcut();
    await setupSources();
    document.documentElement.dataset.welcomeReady = "true";
})();

// Keyboard shortcuts shown in the popup's "?" sheet and on the options page: the browser-level
// keys (chrome.commands, which the user can change) and the platform's modifier.
import { queryAll } from "@pmu/miniquery.js";

export const isMac = /Mac/.test(navigator.userAgent);
export const shortcuts = {}; // browser-level command name -> display string

/** Opens the browser's keyboard shortcut settings */
export const openShortcutSettings = () => {
    if (globalThis.browser?.commands?.openShortcutSettings)
        return browser.commands.openShortcutSettings();
    if (navigator.userAgent.includes("Firefox"))
        return chrome.tabs.create({
            url: "https://support.mozilla.org/kb/manage-extension-shortcuts-firefox",
        });
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
};

/**
 * "⇧⌘E" (Chrome, macOS) or "Ctrl+Shift+E" -> display string for a key cap
 * @param {string} shortcut From chrome.commands
 */
export const formatShortcut = (shortcut) => {
    if (!shortcut) return "Not set";
    if (!isMac) return shortcut;
    const names = { Command: "⌘", Ctrl: "⌘", MacCtrl: "⌃", Alt: "⌥", Shift: "⇧" };
    const parts = shortcut.includes("+")
        ? shortcut.split("+").map((p) => names[p] ?? p)
        : [...shortcut];
    const order = ["⌘", "⌥", "⇧", "⌃"];
    const mods = parts.filter((p) => order.includes(p));
    const keys = parts.filter((p) => !order.includes(p));
    mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return [...mods, ...keys].join(" ");
};

/**
 * Reads the browser-level shortcuts (they can be changed by the user) and writes them in
 * every [data-cmd] key cap; also the platform's modifier in [data-mod] caps.
 */
export const loadShortcuts = async () => {
    // callback (Chrome) or promise (Firefox); never block the page on it
    const commands = await new Promise((resolve) => {
        setTimeout(() => resolve([]), 500);
        try {
            chrome.commands.getAll(resolve)?.then?.(resolve, () => resolve([]));
        } catch (e) {
            resolve([]);
        }
    });
    for (const { name, shortcut } of commands ?? []) {
        shortcuts[name] = formatShortcut(shortcut);
    }
    queryAll("[data-cmd]").forEach((el) => {
        el.textContent = shortcuts[el.dataset.cmd] ?? "Not set";
    });
    queryAll("[data-mod]").forEach((el) => (el.textContent = isMac ? "⌘" : "Ctrl"));
    queryAll("[data-mod-enter]").forEach(
        (el) => (el.textContent = isMac ? "⌘↵" : "Ctrl ↵"),
    );
};

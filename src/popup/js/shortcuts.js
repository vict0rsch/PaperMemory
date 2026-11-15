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
 * @param {boolean} mac Format for macOS (for tests)
 */
export const formatShortcut = (shortcut, mac = isMac) => {
    if (!shortcut) return "Not set";
    if (!mac) return shortcut;
    const names = { Command: "⌘", Ctrl: "⌘", MacCtrl: "⌃", Alt: "⌥", Shift: "⇧" };
    const order = ["⌘", "⌥", "⇧", "⌃"];
    // symbol form ("⇧⌘Space"): one part per modifier glyph, the key name stays whole
    const [, glyphs, key] = shortcut.match(/^([⌘⌥⇧⌃]*)(.*)$/su);
    const parts = shortcut.includes("+")
        ? shortcut.split("+").map((p) => names[p] ?? p)
        : [...glyphs, key].filter(Boolean);
    const mods = parts.filter((p) => order.includes(p));
    const keys = parts.filter((p) => !order.includes(p));
    mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return [...mods, ...keys].join(" ");
};

/**
 * One key cap per key of a formatShortcut() string: ["⌘", "⇧", "Space"], ["Ctrl", "Shift", "E"]
 * @param {string} formatted From formatShortcut
 * @param {boolean} mac As formatted for macOS
 */
export const shortcutKeys = (formatted, mac = isMac) =>
    mac ? formatted.split(" ") : formatted.split("+");

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
        // the popup's command is _execute_browser_action in the Firefox (MV2) build
        const key = name === "_execute_browser_action" ? "_execute_action" : name;
        shortcuts[key] = formatShortcut(shortcut);
    }
    queryAll("[data-cmd]").forEach((el) => {
        el.textContent = shortcuts[el.dataset.cmd] ?? "Not set";
    });
    queryAll("[data-mod]").forEach((el) => (el.textContent = isMac ? "⌘" : "Ctrl"));
    queryAll("[data-mod-enter]").forEach(
        (el) => (el.textContent = isMac ? "⌘↵" : "Ctrl ↵"),
    );
};

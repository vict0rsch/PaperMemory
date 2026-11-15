// Top bar of the extension pages (src/shared/html/topbar.html): marks the current page and
// keeps every [data-set-theme] button of the page (top bar, settings rows) on prefs.theme.
import { getStorage, themeFromPrefs, saveThemePref, onPrefsChange } from "@pmu/data.js";
import { queryAll } from "@pmu/miniquery.js";
import { paintIcons } from "@pm/popup/js/icons.js";

/** aria-pressed on every theme button of the page */
const showTheme = (theme) =>
    queryAll("[data-set-theme]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.setTheme === theme)),
    );

/**
 * @param {string} page "options" | "fullMemory" | "bibMatcher"
 */
export const setupTopbar = async (page) => {
    const bar = document.getElementById("pm-topbar");
    if (!bar) return;
    bar.querySelector(`[data-page="${page}"]`)?.setAttribute("aria-current", "page");
    paintIcons(bar);
    showTheme(themeFromPrefs(await getStorage("prefs")));
    document.addEventListener("click", (e) => {
        const b = e.target.closest?.("[data-set-theme]");
        if (!b) return;
        showTheme(b.dataset.setTheme);
        saveThemePref(b.dataset.setTheme);
    });
    // changed elsewhere (popup, another tab)
    onPrefsChange((prefs) => showTheme(themeFromPrefs(prefs)));
};

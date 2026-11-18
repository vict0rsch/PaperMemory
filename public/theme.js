// Theme for extension pages: System / Light / Dark (prefs.theme, legacy prefs.checkDarkMode).
// Classic, parser-blocking script: keep it at the END of <head>, after every stylesheet, so
// that it runs before first paint and dark.css lands last in the cascade.
// 1. synchronously: read the last choice mirrored in localStorage, set <html data-theme>
//    and, when dark, write the legacy dark stylesheets into the document (parser-inserted
//    links block rendering, so there is no light flash). With no mirror yet, the page stays
//    hidden until step 2 has applied the stored choice (300 ms at most);
// 2. then: reconcile with chrome.storage (the source of truth), follow prefs changes made
//    on any page and, for "system", follow prefers-color-scheme live.
(() => {
    const KEY = "pm-theme";
    const CHOICES = ["system", "light", "dark"];
    const media = matchMedia("(prefers-color-scheme: dark)");
    // stylesheets of the pages that still use the legacy dark.css: every page except the options page
    const legacy = location.pathname.endsWith("options.html") ? [] : ["dark.css"];

    // same mapping as themeFromPrefs() in src/shared/js/utils/data.js
    const fromPrefs = (prefs) =>
        CHOICES.includes(prefs?.theme)
            ? prefs.theme
            : prefs && "checkDarkMode" in prefs
              ? prefs.checkDarkMode
                  ? "dark"
                  : "light"
              : "system";

    let choice;
    try {
        choice = localStorage.getItem(KEY);
    } catch {}
    // Nothing mirrored yet (first page load after the update, or cleared site data): hide
    // the page until chrome.storage answers and the stylesheet is applied, so there is no
    // wrong-theme frame. Safety timeout: a failure never leaves a blank page.
    let hidden = false;
    const reveal = () => {
        if (!hidden) return;
        hidden = false;
        document.documentElement.style.removeProperty("visibility");
    };
    if (!CHOICES.includes(choice)) {
        choice = "light";
        hidden = true;
        document.documentElement.style.visibility = "hidden";
        setTimeout(reveal, 300);
    }

    let parsing = true; // document.write is only safe while this script itself runs
    // returns the <link>s it had to create after parsing (not loaded yet)
    const apply = () => {
        const created = [];
        const dark = choice === "dark" || (choice === "system" && media.matches);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        for (const href of legacy) {
            const id = `pm-legacy-${href.replace(".css", "")}`;
            const el = document.getElementById(id);
            if (dark && !el && parsing) {
                // constant markup; written (not appended) so the parser inserts it and it
                // blocks rendering: a script-created <link> would not
                document.write(`<link id="${id}" rel="stylesheet" href="/${href}" />`);
            } else if (dark && !el) {
                const link = document.createElement("link");
                link.id = id;
                link.rel = "stylesheet";
                link.href = `/${href}`;
                document.head.appendChild(link);
                created.push(link);
            } else if (!dark && el) {
                el.remove();
            }
        }
        return created;
    };
    const update = (next) => {
        try {
            localStorage.setItem(KEY, next);
        } catch {}
        if (next === choice) return [];
        choice = next;
        return apply();
    };

    apply();
    parsing = false;

    media.addEventListener("change", apply);
    chrome.storage.local.get("prefs", ({ prefs }) => {
        const pending = update(fromPrefs(prefs));
        if (pending.length === 0) return reveal();
        let left = pending.length;
        for (const link of pending) {
            const done = () => --left === 0 && reveal();
            link.addEventListener("load", done);
            link.addEventListener("error", done);
        }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && changes.prefs)
            update(fromPrefs(changes.prefs.newValue));
    });
})();

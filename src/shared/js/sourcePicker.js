// Sources picker of the options page and the welcome page (src/shared/html/source-picker.html):
// filter, "N of M on", Turn all on / off, a cell per source, Show all. What is off is stored in
// ignoreSources (source name -> true when off), as before.
import { getStorage, setStorage } from "@pmu/data.js";
import { allSources } from "@pmu/sources/index.js";
import { log, escapeHtml } from "@pmu/functions.js";

const $ = (id) => document.getElementById(id);
const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const COLLAPSED_SOURCES = 15;
let sourcesExpanded = false;
let onRender = () => {};

/** Sources the user can turn off: [{key, name, domain}], by name */
const sourceList = () =>
    allSources()
        .filter((S) => S.name !== "website")
        .map((S) => ({
            key: S.name,
            name: S.displayName.split("(")[0].trim(),
            domain: S.patterns.find((p) => typeof p === "string")?.split("/")[0] ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

const renderSources = async () => {
    const ignore = (await getStorage("ignoreSources")) ?? {};
    const all = sourceList();
    const q = normalize($("sources-filter").value.trim());
    const matching = q
        ? all.filter((s) => normalize(`${s.name} ${s.domain} ${s.key}`).includes(q))
        : all;
    const shown =
        q || sourcesExpanded ? matching : matching.slice(0, COLLAPSED_SOURCES);
    const box = $("select-sources-container");
    box.innerHTML = shown
        .map(
            (s) => /*html*/ `
        <label class="o-cell${ignore[s.key] ? " is-off" : ""}">
            <input type="checkbox" class="pm-check" id="source-${escapeHtml(s.key)}" data-source="${escapeHtml(s.key)}"${ignore[s.key] ? "" : " checked"} />${escapeHtml(s.name)}
            <small>${escapeHtml(s.domain)}</small>
        </label>`,
        )
        .join("");
    $("sources-none").hidden = matching.length > 0;
    const on = all.filter((s) => !ignore[s.key]).length;
    $("sources-count").textContent = q
        ? `${matching.length} of ${all.length} sources · ${on} on`
        : `${on} of ${all.length} on`;
    $("sources-filter").placeholder = `Filter ${all.length} sources`;
    const more = $("sources-show-all");
    more.hidden = !!q || all.length <= COLLAPSED_SOURCES;
    more.setAttribute("aria-expanded", String(sourcesExpanded));
    more.querySelector("span").textContent = sourcesExpanded
        ? "Show fewer"
        : `Show all ${all.length}`;
    more.classList.toggle("is-open", sourcesExpanded);
    onRender(on, all.length);
};

/**
 * @param {(on: number, total: number) => void} [render] Called after each render (options: nav count)
 */
export const setupSources = async (render = onRender) => {
    onRender = render;
    // as before: every known source gets an explicit value in storage
    const ignore = (await getStorage("ignoreSources")) ?? {};
    for (const { key } of sourceList()) ignore[key] = ignore[key] ?? false;
    await setStorage("ignoreSources", ignore);

    $("select-sources-container").addEventListener("change", async (e) => {
        const key = e.target.dataset.source;
        if (!key) return;
        const stored = (await getStorage("ignoreSources")) ?? {};
        stored[key] = !e.target.checked;
        log("Updating source", key, "to", stored[key]);
        await setStorage("ignoreSources", stored);
        e.target.closest(".o-cell").classList.toggle("is-off", !e.target.checked);
        renderSources();
    });
    const setAll = async (on) => {
        const stored = (await getStorage("ignoreSources")) ?? {};
        for (const { key } of sourceList()) stored[key] = !on;
        await setStorage("ignoreSources", stored);
        renderSources();
    };
    $("sources-all-on").addEventListener("click", () => setAll(true));
    $("sources-all-off").addEventListener("click", () => setAll(false));
    $("sources-filter").addEventListener("input", renderSources);
    $("sources-show-all").addEventListener("click", () => {
        sourcesExpanded = !sourcesExpanded;
        renderSources();
    });
    await renderSources();
};

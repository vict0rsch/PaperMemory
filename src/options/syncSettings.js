// Options page, "Sync": status row (Not connected / token saved / on / failed), Sync now,
// Disconnect, the token field (password) and the first-sync flow (warning, then what to do
// when the gist already holds a Memory). Same storage as before: syncPAT, syncState.
import { state } from "@pmu/config.js";
import {
    getStorage,
    setStorage,
    prepareOverwriteData,
    replacePapers,
} from "@pmu/data.js";
import { initState } from "@pmu/state.js";
import {
    log,
    logError,
    downloadTextFile,
    sendMessageToBackground,
} from "@pmu/functions.js";
import { mergePapers } from "@pmu/paper.js";
import {
    shouldSync,
    getGist,
    getDataForGistFile,
    updateGistFile,
    syncBothWays,
} from "@pmu/sync.js";
import { askDialog, confirmDialog } from "@pm/options/dialog.js";
import { downloadMemory } from "@pm/options/io.js";

const $ = (id) => document.getElementById(id);
let gistId = null;
let lastSync = null; // Date of the last "Sync now" / first sync from this page
let onMemoryChange = () => {};

const stamp = () => {
    const now = new Date();
    return `${now.toLocaleDateString().replaceAll("/", ".")}-${now.toLocaleTimeString().replaceAll(":", ".")}`;
};
const time = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const feedback = (text, error = false) => {
    const el = $("pat-feedback");
    el.textContent = text;
    el.classList.toggle("is-error", error);
};

/**
 * Shows the sync state in the status row and the side nav
 * @param {"none" | "token" | "on" | "syncing" | "error"} status
 * @param {string} [detail] Error message
 */
const showStatus = (status, detail = "") => {
    const label = $("sync-status-label");
    const help = $("sync-status-help");
    const dot = $("sync-status-dot");
    help.textContent = "";
    dot.className = "pm-dot";
    $("start-gh-sync").hidden = status !== "token";
    $("sync-now").hidden = !["on", "syncing", "error"].includes(status);
    $("sync-now").disabled = status === "syncing";
    $("stop-gh-sync").hidden = status === "none";
    if (status === "none") {
        dot.classList.add("is-off");
        label.textContent = "Not connected";
        help.textContent = "Save a GitHub token below to start syncing.";
    } else if (status === "token") {
        dot.classList.add("is-off");
        label.textContent = "Token saved · sync is off";
        help.textContent =
            "Start syncing to keep the gist and this browser up to date.";
    } else if (status === "syncing") {
        dot.classList.add("is-busy");
        label.textContent = "Syncing…";
    } else if (status === "error") {
        dot.classList.add("is-error");
        label.textContent = "Sync failed";
        help.textContent =
            detail || "Check your token and your connection, then try again.";
    } else {
        label.textContent = lastSync ? `Synced at ${time(lastSync)}` : "Sync is on";
        if (gistId) {
            const a = document.createElement("a");
            a.className = "pm-out";
            a.href = `https://gist.github.com/${encodeURIComponent(gistId)}`;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.dataset.tip = "Open your sync gist on GitHub";
            a.textContent = "Your gist";
            help.append(a, ` · ${state.sortedPapers.length} papers`);
        } else help.textContent = `${state.sortedPapers.length} papers`;
    }
    const side = $("side-sync-status");
    side.hidden = !["on", "syncing", "error"].includes(status);
    side.classList.toggle("is-error", status === "error");
    $("side-sync-text").textContent =
        status === "error"
            ? "Sync failed"
            : status === "syncing"
              ? "Syncing…"
              : label.textContent;
};

const refreshStatus = async () => {
    const pat = await getStorage("syncPAT");
    if (!pat) return showStatus("none");
    showStatus((await shouldSync()) ? "on" : "token");
};

/** Pull (another computer's changes) then push this browser's Memory */
const syncNow = async () => {
    showStatus("syncing");
    let result;
    try {
        // the upload only happens after a successful download
        result = await syncBothWays();
    } catch (e) {
        result = { ok: false, error: String(e?.message ?? e) };
    }
    onMemoryChange();
    if (!result.ok) {
        logError("Sync now:", result.error);
        return showStatus("error", result.error);
    }
    lastSync = new Date();
    await refreshStatus();
};

/** Before the first sync: what will happen (the old warning modal, condensed) */
const showSyncWarning = async () =>
    (await askDialog({
        title: "Start syncing with GitHub?",
        body: [
            "Your Memory is written to a private gist on your GitHub account. Do not edit that file by hand.",
            "When you open the popup, PaperMemory downloads the gist; when you close it or save a paper, it uploads your Memory. Each takes 2–3 seconds: wait for “Synced” before closing the popup, and leave a few seconds between two computers.",
            "Edits made at the same moment on two computers are not merged: the last upload wins.",
        ],
        actions: [{ label: "Start syncing", value: "ok", kind: "primary" }],
    })) === "ok";

/** The gist already holds a Memory: which one to keep */
const getSyncStrategy = async () =>
    (await askDialog({
        title: "Your gist already holds a Memory",
        body: [
            "What should PaperMemory do? Any data that gets overwritten is downloaded to your Downloads folder first.",
        ],
        actions: [
            { label: "Use the gist's Memory here", value: "local-remote" },
            { label: "Replace the gist with this Memory", value: "remote-local" },
            { label: "Merge both", value: "merge", kind: "primary" },
        ],
    })) ?? "";

/** Writes the prepared papers locally (warnings are logged, not blocking) */
const writeLocal = async (papers) => {
    const { success, message, warning, papersToWrite } =
        await prepareOverwriteData(papers);
    if (!success) throw new Error(message);
    if (warning) log("Sync: non-breaking warnings while overwriting", warning);
    const saved = await replacePapers(papersToWrite);
    // nothing is uploaded and sync is not turned on unless this worked
    if (!saved.ok) throw new Error(`Could not save the Memory here: ${saved.error}`);
    return papersToWrite;
};

const startSync = async () => {
    if (!(await showSyncWarning())) return;
    showStatus("syncing");
    try {
        const { ok, payload, error } = await getGist();
        if (!ok) throw new Error(`Your token is not valid. ${error ?? ""}`);
        const { file } = payload;
        gistId = payload.gistId;
        const data = await getDataForGistFile({ file, gistId });
        let choice = "no-remote";
        if (data) {
            choice = await getSyncStrategy();
            if (!choice) return refreshStatus();
        }
        if (choice === "remote-local" || choice === "no-remote") {
            if (choice === "remote-local")
                downloadTextFile(
                    JSON.stringify(data),
                    `PaperMemory-remote-data-backup-${stamp()}.json`,
                    "text/json",
                );
            await updateGistFile({ file, content: state.papers, gistId });
        } else if (choice === "local-remote") {
            await downloadMemory();
            await writeLocal(data);
        } else if (choice === "merge") {
            downloadTextFile(
                JSON.stringify(data),
                `PaperMemory-merge--remote-data-backup-${stamp()}.json`,
                "text/json",
            );
            const localPapers = (await getStorage("papers")) ?? {};
            downloadTextFile(
                JSON.stringify(localPapers),
                `PaperMemory-merge--local-data-backup-${stamp()}.json`,
                "text/json",
            );
            const merged = {
                __dataVersion: Math.min(data.__dataVersion, localPapers.__dataVersion),
            };
            for (const key of Object.keys(localPapers)) {
                if (key === "__dataVersion") continue;
                merged[key] = data[key]
                    ? mergePapers({
                          newPaper: data[key],
                          oldPaper: localPapers[key],
                          overwrites: [],
                          syncMerge: true,
                      })
                    : localPapers[key];
            }
            for (const key of Object.keys(data)) {
                if (key !== "__dataVersion" && !merged[key]) merged[key] = data[key];
            }
            const written = await writeLocal(merged);
            await updateGistFile({ file, content: written, gistId });
        }
        await setStorage("syncState", true);
        const restarted = await sendMessageToBackground({ type: "restartGist" });
        if (!restarted?.ok) {
            await setStorage("syncState", false);
            throw new Error(`Sync could not start: ${restarted?.error ?? "no answer"}`);
        }
        await initState({ papers: (await getStorage("papers")) ?? {}, print: false });
        lastSync = new Date();
        onMemoryChange();
        await refreshStatus();
    } catch (e) {
        logError(e);
        showStatus("error", String(e?.message ?? e));
    }
};

const savePat = async () => {
    const pat = $("pat-input").value.trim();
    feedback("");
    if (!pat) {
        await setStorage("syncPAT", "");
        await setStorage("syncState", false);
        gistId = null;
        feedback("Token removed. Sync is off.");
        return refreshStatus();
    }
    $("save-pat").disabled = true;
    feedback("Checking the token…");
    const { ok, payload, error } = await getGist({ pat });
    $("save-pat").disabled = false;
    if (!ok) {
        logError(error);
        feedback(
            String(
                error?.response?.data?.message ?? error ?? "This token does not work.",
            ),
            true,
        );
        return;
    }
    gistId = payload.gistId;
    log("Gist ID", gistId);
    feedback("Token saved. It is valid.");
    await refreshStatus();
};

const disconnect = async () => {
    const ok = await confirmDialog({
        title: "Stop syncing with GitHub?",
        body: [
            "Your token is removed from this browser. The gist is not deleted, but changes to your Memory are not uploaded anymore.",
        ],
        confirm: "Disconnect",
    });
    if (!ok) return;
    await setStorage("syncPAT", "");
    await setStorage("syncState", false);
    $("pat-input").value = "";
    gistId = null;
    lastSync = null;
    feedback("");
    await refreshStatus();
};

/**
 * @param {function} onChange Called after a sync changed the Memory
 */
export const setupSync = async (onChange) => {
    onMemoryChange = onChange;
    $("save-pat").addEventListener("click", savePat);
    $("pat-input").addEventListener("keydown", (e) => e.key === "Enter" && savePat());
    $("stop-gh-sync").addEventListener("click", disconnect);
    $("start-gh-sync").addEventListener("click", startSync);
    $("sync-now").addEventListener("click", syncNow);

    const pat = (await getStorage("syncPAT")) ?? "";
    $("pat-input").value = pat;
    await refreshStatus();
    if (await shouldSync()) {
        // the gist's link, and a check that the token still works
        const { ok, payload, error } = await getGist({ patError: false });
        if (ok) {
            gistId = payload.gistId;
            await refreshStatus();
        } else showStatus("error", error ? `GitHub refused the token: ${error}` : "");
    }
};

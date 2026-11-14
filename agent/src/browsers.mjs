import fs from "node:fs";
import path from "node:path";

import { addUnique, mkdirRecorded, writeFileAtomic } from "./fsutil.mjs";

export const HOST_NAME = "org.papermemory.agent";
export const DEFAULT_EXTENSION_ID = "hmebhknlgddhfbbdhgplnillngljgmdi";
export const FIREFOX_EXTENSION_ID = "{ff9cbac9-82ff-4e2b-96ae-ae0845aa85f5}";

// Roots under ~/Library/Application Support. Only Chrome and Firefox are tested.
const ROOTS = [
    { root: "Google/Chrome", firefox: false },
    { root: "Google/Chrome for Testing", firefox: false },
    { root: "Chromium", firefox: false },
    { root: "BraveSoftware/Brave-Browser", firefox: false },
    { root: "Microsoft Edge", firefox: false },
    { root: "Mozilla", firefox: true },
];

/** Manifest directories to write: one per existing browser root, plus each --user-data-dir. */
export function manifestTargets(home, userDataDirs = []) {
    const support = path.join(home, "Library", "Application Support");
    const targets = ROOTS.filter((r) => fs.existsSync(path.join(support, r.root))).map((r) => ({
        dir: path.join(support, r.root, "NativeMessagingHosts"),
        firefox: r.firefox,
    }));
    for (const d of userDataDirs) {
        targets.push({ dir: path.join(path.resolve(d), "NativeMessagingHosts"), firefox: false });
    }
    return targets;
}

export function buildManifest({ wrapperPath, extensionIds, firefox }) {
    const manifest = {
        name: HOST_NAME,
        description: "PaperMemory native host",
        path: wrapperPath,
        type: "stdio",
    };
    if (firefox) {
        manifest.allowed_extensions = [FIREFOX_EXTENSION_ID];
    } else {
        const ids = [DEFAULT_EXTENSION_ID, ...extensionIds];
        manifest.allowed_origins = [...new Set(ids)].map((id) => `chrome-extension://${id}/`);
    }
    return manifest;
}

/** Write one manifest per target; record created dirs, files and (for selfheal) the targets. */
export function writeManifests(targets, { wrapperPath, extensionIds }, state) {
    for (const t of targets) {
        mkdirRecorded(t.dir, state);
        const file = path.join(t.dir, `${HOST_NAME}.json`);
        const manifest = buildManifest({ wrapperPath, extensionIds, firefox: t.firefox });
        writeFileAtomic(file, JSON.stringify(manifest, null, 2) + "\n", 0o644);
        addUnique(state.files, file);
        if (!state.manifests.some((m) => m.file === file)) {
            state.manifests.push({ file, firefox: t.firefox });
        }
    }
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Create `dir` (and missing parents), recording each directory this call created in state.dirs. */
export function mkdirRecorded(dir, state, mode = 0o755) {
    const missing = [];
    for (let d = dir; !fs.existsSync(d); d = path.dirname(d)) missing.unshift(d);
    for (const m of missing) {
        fs.mkdirSync(m, { mode });
        if (!state.dirs.includes(m)) state.dirs.push(m);
    }
}

/** Write to a temp file in the same directory, then rename over `file`. */
export function writeFileAtomic(file, data, mode = 0o600) {
    const tmp = `${file}.tmp-${crypto.randomBytes(6).toString("hex")}`;
    try {
        fs.writeFileSync(tmp, data, { mode });
        fs.chmodSync(tmp, mode);
        fs.renameSync(tmp, file);
    } catch (err) {
        fs.rmSync(tmp, { force: true });
        throw err;
    }
}

/** Remove directories (deepest first) only if they are empty. */
export function rmdirsIfEmpty(dirs) {
    for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
        try {
            fs.rmdirSync(d);
        } catch {
            // not empty or already gone: leave it
        }
    }
}

export function addUnique(list, item) {
    if (!list.includes(item)) list.push(item);
}

/** Absolute path of an executable named `name` on PATH, or null. */
export function which(name) {
    for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
        if (!dir) continue;
        const candidate = path.join(dir, name);
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            if (fs.statSync(candidate).isFile()) return candidate;
        } catch {
            // keep looking
        }
    }
    return null;
}

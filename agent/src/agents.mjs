import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { applyEdits, modify, parse } from "jsonc-parser";

import { addUnique, mkdirRecorded, which, writeFileAtomic } from "./fsutil.mjs";

const FORMAT = { insertSpaces: true, tabSize: 2 };

function exists(p) {
    return fs.existsSync(p);
}

function run(cmd, args, { ignoreFailure = false } = {}) {
    try {
        execFileSync(cmd, args, { stdio: "pipe" });
    } catch (err) {
        if (!ignoreFailure) throw new Error(`\`${cmd} ${args.join(" ")}\` failed: ${err.message}`);
    }
}

// `<cmd> mcp remove` on uninstall: a missing CLI or a failed removal throws, except when the CLI
// says the server is not registered (already gone).
const NOT_REGISTERED_RE = /no mcp server|not found|not registered|does not exist|no such server/i;
function removeMcp(cmd, args) {
    if (!which(cmd)) throw new Error(`\`${cmd}\` is not on PATH, so its PaperMemory registration was not removed`);
    try {
        execFileSync(cmd, args, { stdio: "pipe" });
    } catch (err) {
        const out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
        if (NOT_REGISTERED_RE.test(out)) return;
        throw new Error(`\`${cmd} ${args.join(" ")}\` failed: ${err.message}`);
    }
}

/** Atomic edit of a JSON config file, preserving its mode when it exists. */
function writeConfig(file, text) {
    const mode = exists(file) ? fs.statSync(file).mode & 0o777 : 0o600;
    writeFileAtomic(file, text, mode);
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
        throw new Error(`Cannot parse ${file}: ${err.message}`);
    }
}

// Cursor and Oh-My-Pi: { mcpServers: { papermemory: { command, args } } }.
function mcpServersJson(key, file) {
    return {
        register({ abs, state }) {
            const created = !exists(file);
            const json = created ? {} : readJson(file);
            if (created) mkdirRecorded(path.dirname(file), state);
            json.mcpServers = {
                ...json.mcpServers,
                papermemory: { command: `${abs}/papermemory-mcp`, args: ["serve"] },
            };
            writeConfig(file, JSON.stringify(json, null, 2) + "\n");
            return { file, created: created || (state.agents[key]?.created ?? false) };
        },
        unregister(record) {
            if (!exists(record.file)) return;
            const json = readJson(record.file);
            if (json.mcpServers) delete json.mcpServers.papermemory;
            const keys = Object.keys(json).filter((k) => k !== "mcpServers");
            const empty = Object.keys(json.mcpServers ?? {}).length === 0;
            if (record.created && keys.length === 0 && empty) {
                fs.rmSync(record.file);
            } else {
                writeConfig(record.file, JSON.stringify(json, null, 2) + "\n");
            }
        },
    };
}

function openCodeFile(home) {
    const dir = path.join(home, ".config", "opencode");
    const jsonc = path.join(dir, "opencode.jsonc");
    const json = path.join(dir, "opencode.json");
    return exists(jsonc) || !exists(json) ? jsonc : json;
}

export function agentDefs(home) {
    const cursor = mcpServersJson("cursor", path.join(home, ".cursor", "mcp.json"));
    const omp = mcpServersJson("omp", path.join(home, ".omp", "agent", "mcp.json"));
    return [
        {
            key: "claude",
            name: "Claude Code",
            detect: () => which("claude") !== null,
            register({ abs }) {
                run("claude", ["mcp", "remove", "--scope", "user", "papermemory"], { ignoreFailure: true });
                run("claude", ["mcp", "add", "--scope", "user", "papermemory", "--", `${abs}/papermemory-mcp`, "serve"]);
                return true;
            },
            unregister() {
                removeMcp("claude", ["mcp", "remove", "--scope", "user", "papermemory"]);
            },
        },
        {
            key: "codex",
            name: "Codex",
            detect: () => which("codex") !== null,
            register({ abs }) {
                run("codex", ["mcp", "remove", "papermemory"], { ignoreFailure: true });
                run("codex", ["mcp", "add", "papermemory", "--", `${abs}/papermemory-mcp`, "serve"]);
                return true;
            },
            unregister() {
                removeMcp("codex", ["mcp", "remove", "papermemory"]);
            },
        },
        {
            key: "opencode",
            name: "OpenCode",
            detect: () => which("opencode") !== null || exists(path.join(home, ".config", "opencode")),
            register({ abs, state }) {
                const file = openCodeFile(home);
                const created = !exists(file);
                if (created) mkdirRecorded(path.dirname(file), state);
                let text = created ? "{}\n" : fs.readFileSync(file, "utf8");
                const errors = [];
                parse(text, errors, { allowTrailingComma: true });
                if (errors.length) throw new Error(`Cannot parse ${file}`);
                const value = { type: "local", command: [`${abs}/papermemory-mcp`, "serve"] };
                text = applyEdits(text, modify(text, ["mcp", "papermemory"], value, { formattingOptions: FORMAT }));
                writeConfig(file, text);
                return { file, created: created || (state.agents.opencode?.created ?? false) };
            },
            unregister(record) {
                if (!exists(record.file)) return;
                let text = fs.readFileSync(record.file, "utf8");
                text = applyEdits(text, modify(text, ["mcp", "papermemory"], undefined, { formattingOptions: FORMAT }));
                const json = parse(text, [], { allowTrailingComma: true }) ?? {};
                const others = Object.keys(json).filter((k) => k !== "mcp");
                if (record.created && others.length === 0 && Object.keys(json.mcp ?? {}).length === 0) {
                    fs.rmSync(record.file);
                } else {
                    writeConfig(record.file, text);
                }
            },
        },
        {
            key: "cursor",
            name: "Cursor",
            detect: () => exists(path.join(home, ".cursor")),
            ...cursor,
        },
        {
            key: "omp",
            name: "Oh-My-Pi",
            detect: () => exists(path.join(home, ".omp")) || which("omp") !== null,
            ...omp,
        },
    ];
}


export function skillDirs(home) {
    return [
        path.join(home, ".agents", "skills", "papermemory"),
        path.join(home, ".claude", "skills", "papermemory"),
    ];
}

export function copySkill({ home, skillSource, state }) {
    for (const dir of skillDirs(home)) {
        const dest = path.join(dir, "SKILL.md");
        const dirLink = lstat(dir)?.isSymbolicLink();
        // state.files holds only what an earlier install recorded as ours (the new copy is added below).
        if (dirLink || (lstat(dest) && !state.files.includes(dest))) {
            console.log(
                `Left ${dirLink ? dir : dest} alone: ${dirLink ? "it is a symlink" : "a file we did not create is already there"}. ` +
                    `The PaperMemory skill would go in ${dest}; copy ${skillSource} there yourself if you want it.`,
            );
            continue;
        }
        mkdirRecorded(dir, state);
        writeFileAtomic(dest, fs.readFileSync(skillSource), 0o644);
        addUnique(state.files, dest);
    }
}

function lstat(p) {
    try {
        return fs.lstatSync(p);
    } catch {
        return null;
    }
}

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { SKILLS, agentDefs, copySkill } from "./agents.mjs";
import { manifestTargets, writeManifests } from "./browsers.mjs";
import { rmdirsIfEmpty, writeFileAtomic } from "./fsutil.mjs";

const EXTENSION_ID_RE = /^[a-p]{32}$/;

function assertMac() {
    if (process.platform !== "darwin") {
        throw new Error("Windows/Linux are not supported yet");
    }
}

function parseFlags(args, options) {
    return parseArgs({ args, options, allowPositionals: false, strict: true }).values;
}

function homePaths() {
    const home = fs.realpathSync(os.homedir());
    const root = path.join(home, ".papermemory");
    return { home, root, bin: path.join(root, "bin"), stateFile: path.join(root, "install.json") };
}

function loadState(stateFile) {
    if (!fs.existsSync(stateFile)) return null;
    return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function saveState(stateFile, state) {
    writeFileAtomic(stateFile, JSON.stringify(state, null, 2) + "\n", 0o600);
}

const shq = (s) => `'${s.replaceAll("'", "'\\''")}'`;

// Node discovery follows research/spike-findings.md (recorded node, Homebrew, nvm, Volta, fnm,
// PATH); the spike's test-only overrides are not shipped.
function wrapperScript(entry, recordedNode) {
    return `#!/bin/sh
# PaperMemory wrapper: finds a usable node (>= 18) and runs ${entry}.
bin="$(cd "$(dirname "$0")" && pwd)"
usable() {
  [ -x "$1" ] && "$1" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1
}
NODE=
try() { [ -z "$NODE" ] && [ -n "$1" ] && usable "$1" && NODE="$1"; return 0; }
try ${shq(recordedNode)}
try /opt/homebrew/bin/node
try /usr/local/bin/node
try "$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)"
try "\${VOLTA_HOME:-$HOME/.volta}/bin/node"
try "$(ls -d "$HOME/Library/Application Support"/fnm/node-versions/v*/installation/bin/node 2>/dev/null | sort -V | tail -1)"
try "$(ls -d "$HOME"/.local/share/fnm/node-versions/v*/installation/bin/node 2>/dev/null | sort -V | tail -1)"
try "$(ls -d "$HOME"/.fnm/node-versions/v*/installation/bin/node 2>/dev/null | sort -V | tail -1)"
try "$(command -v node)"
mkdir -p "$HOME/.papermemory/logs"
if [ -z "$NODE" ]; then
  echo "$(date -u +%FT%TZ) no usable node (>= 18) found" >> "$HOME/.papermemory/logs/wrapper.log"
  exit 1
fi
echo "$(date -u +%FT%TZ) $NODE ${entry}" >> "$HOME/.papermemory/logs/wrapper.log"
exec "$NODE" "$bin/${entry}" "$@"
`;
}

function writeWrappers(bin, node) {
    writeFileAtomic(path.join(bin, "papermemory-host"), wrapperScript("host.mjs", node), 0o755);
    writeFileAtomic(path.join(bin, "papermemory-mcp"), wrapperScript("cli.mjs", node), 0o755);
}

// Build bin.new-<random>, then swap it in: bin -> bin.old-<random>, new -> bin, delete old.
function installBin({ bin, srcCli, srcHost, node }) {
    const suffix = crypto.randomBytes(6).toString("hex");
    const fresh = `${bin}.new-${suffix}`;
    fs.mkdirSync(fresh, { mode: 0o755 });
    try {
        fs.copyFileSync(srcCli, path.join(fresh, "cli.mjs"));
        fs.copyFileSync(srcHost, path.join(fresh, "host.mjs"));
        writeWrappers(fresh, node);
        if (fs.existsSync(bin)) {
            const old = `${bin}.old-${suffix}`;
            fs.renameSync(bin, old);
            fs.renameSync(fresh, bin);
            fs.rmSync(old, { recursive: true, force: true });
        } else {
            fs.renameSync(fresh, bin);
        }
    } catch (err) {
        fs.rmSync(fresh, { recursive: true, force: true });
        throw err;
    }
}

function createSalt(root) {
    try {
        fs.writeFileSync(path.join(root, "salt"), crypto.randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (err) {
        if (err.code !== "EEXIST") throw err;
    }
}

// One shared readline; EOF (no TTY) answers every later question with "" (= No).
function makePrompter() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const lines = [];
    const waiting = [];
    let closed = false;
    rl.on("line", (line) => (waiting.length ? waiting.shift()(line) : lines.push(line)));
    rl.on("close", () => {
        closed = true;
        waiting.splice(0).forEach((w) => w(""));
    });
    return {
        ask(question) {
            process.stdout.write(question);
            if (lines.length) return Promise.resolve(lines.shift());
            if (closed) return Promise.resolve("");
            return new Promise((resolve) => waiting.push(resolve));
        },
        close: () => rl.close(),
    };
}

export async function install(args) {
    assertMac();
    const flags = parseFlags(args, {
        yes: { type: "boolean" },
        "dry-run": { type: "boolean" },
        "extension-id": { type: "string", multiple: true },
        "user-data-dir": { type: "string", multiple: true },
    });
    const extensionIds = flags["extension-id"] ?? [];
    for (const id of extensionIds) {
        if (!EXTENSION_ID_RE.test(id)) throw new Error(`Invalid --extension-id: ${id}`);
    }
    const userDataDirs = (flags["user-data-dir"] ?? []).map((d) => path.resolve(d));

    const { home, root, bin, stateFile } = homePaths();
    const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const srcCli = path.join(pkgRoot, "dist", "cli.mjs");
    const srcHost = path.join(pkgRoot, "dist", "host.mjs");
    const skillSource = (name) => path.join(pkgRoot, "skills", name, "SKILL.md");
    for (const f of [srcCli, srcHost, ...SKILLS.map(skillSource)]) {
        if (!fs.existsSync(f)) throw new Error(`Missing ${f}; run \`npx -y papermemory-mcp install\``);
    }
    const version = JSON.parse(fs.readFileSync(path.join(pkgRoot, "package.json"), "utf8")).version;

    const targets = manifestTargets(home, userDataDirs);
    const detected = agentDefs(home).filter((a) => a.detect());

    if (flags["dry-run"]) {
        console.log(`Would copy the host and CLI to ${bin}`);
        for (const t of targets) console.log(`Would write a host manifest in ${t.dir}`);
        for (const a of detected) console.log(`Would offer to register PaperMemory with ${a.name}`);
        console.log(`Would copy the ${SKILLS.join(" and ")} skills to ~/.agents/skills and ~/.claude/skills`);
        return;
    }

    const prev = loadState(stateFile);
    const state = {
        version,
        node: process.execPath,
        extensionIds: [...new Set([...(prev?.extensionIds ?? []), ...extensionIds])],
        userDataDirs: [...new Set([...(prev?.userDataDirs ?? []), ...userDataDirs])],
        files: prev?.files ?? [],
        dirs: prev?.dirs ?? [],
        manifests: prev?.manifests ?? [],
        agents: prev?.agents ?? {},
    };

    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    installBin({ bin, srcCli, srcHost, node: state.node });
    createSalt(root);
    writeManifests(targets, { wrapperPath: path.join(bin, "papermemory-host"), extensionIds: state.extensionIds }, state);
    saveState(stateFile, state);
    console.log(`Installed the PaperMemory host in ${bin}`);

    const prompter = flags.yes ? null : makePrompter();
    try {
        for (const agent of detected) {
            const yes = flags.yes || /^y(es)?$/i.test((await prompter.ask(`Register PaperMemory with ${agent.name}? [y/N] `)).trim());
            if (!yes) continue;
            try {
                state.agents[agent.key] = agent.register({ abs: bin, state });
                saveState(stateFile, state);
                console.log(`Registered PaperMemory with ${agent.name}`);
            } catch (err) {
                console.error(`Could not register with ${agent.name}: ${err.message}`);
                process.exitCode = 1;
            }
        }
    } finally {
        prompter?.close();
    }

    for (const name of SKILLS) copySkill({ home, name, skillSource: skillSource(name), state });
    saveState(stateFile, state);
}

export function uninstall(args) {
    assertMac();
    parseFlags(args, {});
    const { home, root, stateFile } = homePaths();
    const state = loadState(stateFile);
    if (!state) {
        console.log("No install record found; removing only ~/.papermemory");
        fs.rmSync(root, { recursive: true, force: true });
        console.log("Uninstalled PaperMemory agent access");
        return;
    }
    const left = [];
    const agents = {};
    for (const agent of agentDefs(home)) {
        if (!state.agents[agent.key]) continue;
        try {
            agent.unregister(state.agents[agent.key]);
        } catch (err) {
            console.error(`Could not unregister ${agent.name}: ${err.message}`);
            agents[agent.key] = state.agents[agent.key];
            left.push(`${agent.name} registration`);
        }
    }
    const files = [];
    for (const f of state.files) {
        try {
            fs.rmSync(f, { force: true });
        } catch (err) {
            console.error(`Could not remove ${f}: ${err.message}`);
            files.push(f);
            left.push(f);
        }
    }
    rmdirsIfEmpty(state.dirs);
    if (left.length === 0) {
        fs.rmSync(root, { recursive: true, force: true });
        console.log("Uninstalled PaperMemory agent access");
        return;
    }
    // Keep only what remains, so a rerun finishes the cleanup; everything else under root goes.
    saveState(stateFile, { ...state, agents, files, dirs: state.dirs.filter((d) => fs.existsSync(d)) });
    for (const name of fs.readdirSync(root)) {
        if (name !== "install.json") fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    console.error(`Not removed: ${left.join(", ")}. Fix the problem and run uninstall again.`);
    process.exitCode = 1;
}

export function selfheal(args, { quiet = false } = {}) {
    assertMac();
    parseFlags(args, {});
    const { root, bin, stateFile } = homePaths();
    const state = loadState(stateFile);
    if (!state) throw new Error("PaperMemory agent access is not installed; run `npx -y papermemory-mcp install`");
    for (const f of ["cli.mjs", "host.mjs"]) {
        if (!fs.existsSync(path.join(bin, f))) {
            throw new Error(`Missing ${path.join(bin, f)}; run \`npx -y papermemory-mcp@latest install\``);
        }
    }
    if (!fs.existsSync(state.node)) state.node = process.execPath;
    writeWrappers(bin, state.node);
    const targets = state.manifests.map((m) => ({ dir: path.dirname(m.file), firefox: m.firefox }));
    writeManifests(targets, { wrapperPath: path.join(bin, "papermemory-host"), extensionIds: state.extensionIds }, state);
    saveState(stateFile, state);
    if (!quiet) console.log(`Rewrote wrappers and host manifests from ${root}`);
}

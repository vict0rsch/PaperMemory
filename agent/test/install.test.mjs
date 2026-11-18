import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { parse } from "jsonc-parser";

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(PKG, "dist", "cli.mjs");
const SKILLS = ["papermemory", "papermemory-setup"];
const skillSource = (name) => fs.readFileSync(path.join(PKG, "skills", name, "SKILL.md"));
const CHROME_ID = "hmebhknlgddhfbbdhgplnillngljgmdi";
const FIREFOX_ID = "{ff9cbac9-82ff-4e2b-96ae-ae0845aa85f5}";
const tmpRoot = fs.realpathSync(os.tmpdir());
const dirs = [];
after(() => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }))); // temp dirs made by these tests

function tempDir(prefix) {
    const d = fs.realpathSync(fs.mkdtempSync(path.join(tmpRoot, prefix)));
    assert.ok(d.startsWith(tmpRoot));
    dirs.push(d);
    return d;
}

// Every run uses a temp HOME and a PATH that holds only fakes plus /usr/bin:/bin.
function runCli(home, args, { fakes = [], input = "", failing = [] } = {}) {
    assert.ok(home.startsWith(tmpRoot));
    const fakeBin = tempDir("pmi-fakebin-");
    const log = path.join(tempDir("pmi-log-"), "calls.log");
    for (const name of fakes) {
        const fail = failing.includes(name) ? `[ "$2" = remove ] && { echo boom >&2; exit 1; }\n` : "";
        fs.writeFileSync(
            path.join(fakeBin, name),
            `#!/bin/sh\n{ echo ${name}; for a in "$@"; do echo "$a"; done; echo --; } >> "${log}"\n${fail}`,
            { mode: 0o755 },
        );
    }
    const res = spawnSync(process.execPath, [CLI, ...args], {
        env: { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin` },
        input,
        encoding: "utf8",
    });
    const calls = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
    return { ...res, calls };
}

function walk(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        out.push(p.slice(dir.length));
        if (e.isDirectory()) walk(p, out);
    }
    return out.sort();
}

const support = (home, ...rest) => path.join(home, "Library", "Application Support", ...rest);
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const bins = (home) => path.join(home, ".papermemory", "bin");

test("manifests, wrappers, salt, reinstall and uninstall in a temp HOME", () => {
    const home = tempDir("pmi-home-");
    fs.mkdirSync(support(home, "Google", "Chrome"), { recursive: true });
    fs.mkdirSync(support(home, "Mozilla"), { recursive: true });
    const extra = "a".repeat(32);
    const before = walk(home);

    const res = runCli(home, ["install", "--extension-id", extra]);
    assert.equal(res.status, 0, res.stderr);

    const chrome = read(support(home, "Google", "Chrome", "NativeMessagingHosts", "org.papermemory.agent.json"));
    assert.deepEqual(chrome.allowed_origins, [`chrome-extension://${CHROME_ID}/`, `chrome-extension://${extra}/`]);
    assert.equal(chrome.path, path.join(bins(home), "papermemory-host"));
    assert.equal(chrome.name, "org.papermemory.agent");
    assert.equal(chrome.type, "stdio");
    const ff = read(support(home, "Mozilla", "NativeMessagingHosts", "org.papermemory.agent.json"));
    assert.deepEqual(ff.allowed_extensions, [FIREFOX_ID]);
    assert.equal(ff.allowed_origins, undefined);
    assert.ok(!fs.existsSync(support(home, "Chromium")));

    for (const n of ["papermemory-host", "papermemory-mcp"]) {
        assert.equal(fs.statSync(path.join(bins(home), n)).mode & 0o777, 0o755);
    }
    // The wrapper finds node with a minimal PATH and runs cli.mjs (no command -> usage, exit 2).
    const run = spawnSync(path.join(bins(home), "papermemory-mcp"), [], {
        env: { HOME: home, PATH: "/usr/bin:/bin" },
        encoding: "utf8",
    });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stderr, /Usage: papermemory-mcp/);

    const saltFile = path.join(home, ".papermemory", "salt");
    const salt = fs.readFileSync(saltFile);
    assert.equal(salt.length, 32);
    assert.equal(fs.statSync(saltFile).mode & 0o777, 0o600);

    assert.equal(runCli(home, ["install"]).status, 0);
    assert.ok(salt.equals(fs.readFileSync(saltFile)));
    assert.deepEqual(fs.readdirSync(path.join(home, ".papermemory")).filter((n) => n.startsWith("bin.")), []);
    assert.equal(read(path.join(home, ".papermemory", "install.json")).extensionIds[0], extra);
    for (const d of [".agents", ".claude"]) {
        for (const name of SKILLS) {
            const f = path.join(home, d, "skills", name, "SKILL.md");
            assert.ok(fs.readFileSync(f).equals(skillSource(name)), f);
        }
    }

    // Removes both skills, like everything else install created.
    assert.equal(runCli(home, ["uninstall"]).status, 0);
    assert.deepEqual(walk(home), before);
});

test("--user-data-dir writes <dir>/NativeMessagingHosts and --dry-run writes nothing", () => {
    const home = tempDir("pmi-home-");
    const udd = path.join(tempDir("pmi-udd-"), "profile");
    const dry = runCli(home, ["install", "--dry-run", "--user-data-dir", udd]);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /Would copy the papermemory and papermemory-setup skills/);
    assert.deepEqual(walk(home), []);
    assert.ok(!fs.existsSync(udd));

    assert.equal(runCli(home, ["install", "--user-data-dir", udd]).status, 0);
    const m = read(path.join(udd, "NativeMessagingHosts", "org.papermemory.agent.json"));
    assert.deepEqual(m.allowed_origins, [`chrome-extension://${CHROME_ID}/`]);
    assert.equal(runCli(home, ["uninstall"]).status, 0);
    assert.ok(!fs.existsSync(udd));
    assert.deepEqual(walk(home), []);
});

test("rejects a malformed --extension-id", () => {
    const home = tempDir("pmi-home-");
    const res = runCli(home, ["install", "--extension-id", "x/../y"]);
    assert.equal(res.status, 1);
    assert.deepEqual(walk(home), []);
});

test("selfheal rewrites a deleted wrapper and a changed manifest from the local copy", () => {
    const home = tempDir("pmi-home-");
    fs.mkdirSync(support(home, "Google", "Chrome"), { recursive: true });
    assert.equal(runCli(home, ["install"]).status, 0);
    const wrapper = path.join(bins(home), "papermemory-host");
    const manifest = support(home, "Google", "Chrome", "NativeMessagingHosts", "org.papermemory.agent.json");
    const good = fs.readFileSync(manifest, "utf8");
    fs.rmSync(wrapper);
    fs.writeFileSync(manifest, "{}");
    const res = runCli(home, ["selfheal"]);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(fs.statSync(wrapper).mode & 0o777, 0o755);
    assert.equal(fs.readFileSync(manifest, "utf8"), good);
});

test("wrapper falls back to nvm node when the recorded node is gone", () => {
    const home = tempDir("pmi-home-");
    assert.equal(runCli(home, ["install"]).status, 0);
    const w = path.join(bins(home), "papermemory-mcp");
    fs.writeFileSync(w, fs.readFileSync(w, "utf8").replace(process.execPath, "/nonexistent/node"), { mode: 0o755 });
    const nvm = path.join(home, ".nvm", "versions", "node", "v99.0.0", "bin");
    fs.mkdirSync(nvm, { recursive: true });
    fs.writeFileSync(path.join(nvm, "node"), `#!/bin/sh\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
    const run = spawnSync(w, [], { env: { HOME: home, PATH: "/usr/bin:/bin" }, encoding: "utf8" });
    assert.equal(run.status, 2, run.stderr);
    assert.match(fs.readFileSync(path.join(home, ".papermemory", "logs", "wrapper.log"), "utf8"), /cli\.mjs/);
});

test("agent registration: argv of claude/codex, OpenCode, Cursor and OMP merges", () => {
    const home = tempDir("pmi-home-");
    const abs = bins(home);
    fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
    const oc = path.join(home, ".config", "opencode", "opencode.jsonc");
    fs.writeFileSync(oc, `{\n  // keep me\n  "mcp": {\n    "other": { "type": "local", "command": ["x"] }\n  }\n}\n`);
    const cursor = path.join(home, ".cursor", "mcp.json");
    const omp = path.join(home, ".omp", "agent", "mcp.json");
    const old = { mcpServers: { other: { command: "y" }, papermemory: { command: "npx", args: ["-y", "papermemory-mcp"] } } };
    for (const f of [cursor, omp]) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, JSON.stringify(old, null, 2) + "\n");
    }
    const before = walk(home);

    const res = runCli(home, ["install", "--yes"], { fakes: ["claude", "codex"] });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(
        res.calls,
        [
            "claude", "mcp", "remove", "--scope", "user", "papermemory", "--",
            "claude", "mcp", "add", "--scope", "user", "papermemory", "--", `${abs}/papermemory-mcp`, "serve", "--",
            "codex", "mcp", "remove", "papermemory", "--",
            "codex", "mcp", "add", "papermemory", "--", `${abs}/papermemory-mcp`, "serve", "--",
        ].join("\n") + "\n",
    );

    const text = fs.readFileSync(oc, "utf8");
    assert.match(text, /\/\/ keep me/);
    const cfg = parse(text);
    assert.deepEqual(cfg.mcp.papermemory, { type: "local", command: [`${abs}/papermemory-mcp`, "serve"] });
    assert.deepEqual(cfg.mcp.other, { type: "local", command: ["x"] });
    assert.equal(cfg.servers, undefined);
    assert.equal(cfg.mcp.servers, undefined);
    for (const f of [cursor, omp]) {
        const c = read(f);
        assert.deepEqual(c.mcpServers.papermemory, { command: `${abs}/papermemory-mcp`, args: ["serve"] });
        assert.deepEqual(c.mcpServers.other, { command: "y" });
    }

    assert.equal(runCli(home, ["install", "--yes"], { fakes: ["claude", "codex"] }).status, 0);

    const un = runCli(home, ["uninstall"], { fakes: ["claude", "codex"] });
    assert.equal(un.status, 0, un.stderr);
    assert.equal(
        un.calls,
        "claude\nmcp\nremove\n--scope\nuser\npapermemory\n--\ncodex\nmcp\nremove\npapermemory\n--\n",
    );
    assert.deepEqual(parse(fs.readFileSync(oc, "utf8")), { mcp: { other: { type: "local", command: ["x"] } } });
    assert.match(fs.readFileSync(oc, "utf8"), /\/\/ keep me/);
    assert.notEqual(fs.readFileSync(oc, "utf8"), "");
    for (const f of [cursor, omp]) {
        const c = read(f);
        assert.equal(c.mcpServers.papermemory, undefined);
        assert.deepEqual(c.mcpServers.other, { command: "y" });
    }
    assert.deepEqual(walk(home), before);
});

test("agents are skipped without --yes when stdin answers no", () => {
    const home = tempDir("pmi-home-");
    const res = runCli(home, ["install"], { fakes: ["claude"], input: "n\n" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Register PaperMemory with Claude Code\? \[y\/N\]/);
    assert.equal(res.calls, "");
    const yes = runCli(home, ["install"], { fakes: ["claude"], input: "y\n" });
    assert.match(yes.calls, /claude\nmcp\nadd\n/);
});

test("created config files are removed on uninstall", () => {
    const home = tempDir("pmi-home-");
    fs.mkdirSync(path.join(home, ".omp"));
    fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
    const before = walk(home);
    assert.equal(runCli(home, ["install", "--yes"]).status, 0);
    assert.ok(fs.existsSync(path.join(home, ".omp", "agent", "mcp.json")));
    assert.ok(fs.existsSync(path.join(home, ".config", "opencode", "opencode.jsonc")));
    assert.equal(runCli(home, ["uninstall"]).status, 0);
    assert.deepEqual(walk(home), before);
});

test("pre-existing skill files are left alone, not recorded, and survive uninstall", () => {
    const home = tempDir("pmi-home-");
    const mine = SKILLS.map((name) => path.join(home, ".agents", "skills", name, "SKILL.md"));
    const ours = SKILLS.map((name) => path.join(home, ".claude", "skills", name, "SKILL.md"));
    for (const f of mine) {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        fs.writeFileSync(f, "user skill\n");
    }
    const res = runCli(home, ["install"]);
    assert.equal(res.status, 0, res.stderr);
    const state = read(path.join(home, ".papermemory", "install.json"));
    SKILLS.forEach((name, i) => {
        assert.match(res.stdout, new RegExp(`Left .*\\.agents/skills/${name}/SKILL\\.md alone`));
        assert.equal(fs.readFileSync(mine[i], "utf8"), "user skill\n");
        assert.ok(!state.files.includes(mine[i]));
        assert.ok(state.files.includes(ours[i]));
        assert.ok(fs.readFileSync(ours[i]).equals(skillSource(name)));
    });

    // A reinstall still leaves them alone; our own recorded copies are updated normally.
    for (const f of ours) fs.writeFileSync(f, "stale\n");
    assert.equal(runCli(home, ["install"]).status, 0);
    SKILLS.forEach((name, i) => {
        assert.equal(fs.readFileSync(mine[i], "utf8"), "user skill\n");
        assert.ok(fs.readFileSync(ours[i]).equals(skillSource(name)));
    });

    assert.equal(runCli(home, ["uninstall"]).status, 0);
    for (const f of mine) assert.equal(fs.readFileSync(f, "utf8"), "user skill\n");
    for (const f of ours) assert.ok(!fs.existsSync(f));
});

test("symlinked skill dirs are not written through", () => {
    const home = tempDir("pmi-home-");
    fs.mkdirSync(path.join(home, ".agents", "skills"), { recursive: true });
    const links = SKILLS.map((name) => {
        const target = tempDir("pmi-target-");
        const link = path.join(home, ".agents", "skills", name);
        fs.symlinkSync(target, link);
        return { name, target, link };
    });
    const res = runCli(home, ["install"]);
    assert.equal(res.status, 0, res.stderr);
    const files = read(path.join(home, ".papermemory", "install.json")).files;
    for (const { name, target, link } of links) {
        assert.match(res.stdout, new RegExp(`Left .*/${name} alone: it is a symlink`));
        assert.deepEqual(fs.readdirSync(target), []);
        assert.ok(!files.some((f) => f.startsWith(link + path.sep)));
    }
    assert.equal(runCli(home, ["uninstall"]).status, 0);
    for (const { target, link } of links) {
        assert.ok(fs.lstatSync(link).isSymbolicLink());
        assert.deepEqual(fs.readdirSync(target), []);
    }
});

test("uninstall keeps failed registrations in the record, exits 1, and a rerun finishes", () => {
    const home = tempDir("pmi-home-");
    const before = walk(home);
    assert.equal(runCli(home, ["install", "--yes"], { fakes: ["claude", "codex"] }).status, 0);
    const stateFile = path.join(home, ".papermemory", "install.json");
    assert.deepEqual(Object.keys(read(stateFile).agents).sort(), ["claude", "codex"]);

    // claude's `mcp remove` fails, codex is not on PATH: both stay recorded.
    const bad = runCli(home, ["uninstall"], { fakes: ["claude"], failing: ["claude"] });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /Not removed: .*Claude Code registration.*Codex registration/);
    const state = read(stateFile);
    assert.deepEqual(Object.keys(state.agents).sort(), ["claude", "codex"]);
    assert.deepEqual(state.files, []);
    assert.deepEqual(fs.readdirSync(path.join(home, ".papermemory")), ["install.json"]);
    for (const name of SKILLS) assert.ok(!fs.existsSync(path.join(home, ".agents", "skills", name, "SKILL.md")));

    // Only codex is fixed: claude stays recorded.
    const half = runCli(home, ["uninstall"], { fakes: ["claude", "codex"], failing: ["claude"] });
    assert.equal(half.status, 1);
    assert.deepEqual(Object.keys(read(stateFile).agents), ["claude"]);

    const good = runCli(home, ["uninstall"], { fakes: ["claude"] });
    assert.equal(good.status, 0, good.stderr);
    assert.ok(!fs.existsSync(path.join(home, ".papermemory")));
    assert.deepEqual(walk(home), before);
});

test("uninstall treats a 'not registered' answer from the CLI as success", () => {
    const home = tempDir("pmi-home-");
    assert.equal(runCli(home, ["install", "--yes"], { fakes: ["codex"] }).status, 0);
    const fakeBin = tempDir("pmi-fakebin-");
    fs.writeFileSync(path.join(fakeBin, "codex"), `#!/bin/sh\necho "No MCP server named 'papermemory' found." >&2\nexit 1\n`, { mode: 0o755 });
    const res = spawnSync(process.execPath, [CLI, "uninstall"], { env: { HOME: home, PATH: `${fakeBin}:/usr/bin:/bin` }, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
    assert.ok(!fs.existsSync(path.join(home, ".papermemory")));
});

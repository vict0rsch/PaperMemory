import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { safeName, socketPathFor } from "../host/host.mjs";

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(PKG, "dist", "cli.mjs");
const SKILL = fs.readFileSync(path.join(PKG, "skills", "papermemory", "SKILL.md"), "utf8");
const LIB_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CLIENT = "serve-test";
const TOOLS = [
    "add_paper", "add_tags", "append_note", "attach_paper", "connect", "delete_paper", "export_bibtex",
    "flag_for_deletion", "get_paper", "get_project", "list_libraries", "list_project_papers",
    "list_tags", "search_papers", "set_project",
];

const dirs = [];
const children = [];
const servers = [];
after(() => {
    children.forEach((c) => c.kill("SIGKILL"));
    servers.forEach((s) => s.close());
    dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); // temp dirs made by these tests
});

// Short temp HOME: macOS socket paths are limited to 104 bytes.
function tempHome() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pms-"));
    dirs.push(home);
    return home;
}

// Project folders under agent/test/.tmp/<random>/, outside every excluded folder.
function projectDirs(...names) {
    fs.mkdirSync(path.join(PKG, "test", ".tmp"), { recursive: true });
    const base = fs.mkdtempSync(path.join(PKG, "test", ".tmp", "serve-"));
    dirs.push(base);
    return names.map((n) => {
        fs.mkdirSync(path.join(base, n));
        return fs.realpathSync(path.join(base, n));
    });
}

// Minimal MCP client on the server's stdio. `roots`: undefined (no capability), an array, or "silent".
// `oneChunk`: write initialize, initialized and tools/list in a single write instead of waiting.
async function startServe({ home, cwd, roots, oneChunk = false, nodeArgs = [] }) {
    const child = spawn(process.execPath, [...nodeArgs, CLI, "serve"], { cwd, env: { ...process.env, HOME: home } });
    children.push(child);
    const pending = new Map();
    const stray = [];
    let rootsRequests = 0;
    let stderr = "";
    let buf = "";
    let nextId = 1;
    const frame = (msg) => JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n";
    const send = (msg) => child.stdin.write(frame(msg));
    child.stderr.on("data", (d) => (stderr += d));
    child.stdout.on("data", (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            let msg;
            try {
                msg = JSON.parse(line);
            } catch {
                stray.push(line);
                continue;
            }
            if (msg.jsonrpc !== "2.0") {
                stray.push(line);
            } else if (msg.method === "roots/list") {
                rootsRequests++;
                if (Array.isArray(roots)) send({ id: msg.id, result: { roots } });
            } else if (pending.has(msg.id)) {
                pending.get(msg.id)(msg);
                pending.delete(msg.id);
            }
        }
    });
    const reply = (id) => new Promise((resolve) => pending.set(id, resolve));
    const rpc = (method, params) => {
        const id = nextId++;
        send({ id, method, params });
        return reply(id);
    };
    const initialize = {
        id: nextId++,
        method: "initialize",
        params: {
            protocolVersion: "2025-06-18",
            capabilities: roots === undefined ? {} : { roots: {} },
            clientInfo: { name: CLIENT, version: "0" },
        },
    };
    const initialized = { method: "notifications/initialized" };
    const toolsList = { id: nextId++, method: "tools/list", params: {} };
    const replies = [reply(initialize.id), reply(toolsList.id)];
    if (oneChunk) {
        child.stdin.write([initialize, initialized, toolsList].map(frame).join(""));
    } else {
        // Like MCP clients, send `initialized` only after the `initialize` result.
        send(initialize);
        await replies[0];
        send(initialized);
        send(toolsList);
    }
    const [init, list] = await Promise.all(replies);
    assert.equal(init.result.serverInfo.name, "papermemory");
    const tools = list.result.tools;
    return {
        tools,
        call: async (name, args = {}) => (await rpc("tools/call", { name, arguments: args })).result,
        rootsRequests: () => rootsRequests,
        // Ends the session; asserts stdout carried JSON-RPC only and nothing went to stderr.
        close: async () => {
            const exited = new Promise((resolve) => child.on("exit", resolve));
            child.stdin.end();
            assert.equal(await exited, 0);
            assert.deepEqual(stray, []);
            assert.equal(stderr, "");
        },
    };
}

const json = (result) => {
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
};

// Fake Library socket: records each request; `replies[op](req)` gives `{ok, result|error}`, or a promise of it.
// A request gets `closed: true` once its connection closes. `libraryId` and `label`: another Library.
async function fakeLibrary(home, replies, { libraryId = LIB_ID, label = "Chrome · aaaaaa" } = {}) {
    const seen = [];
    const server = net.createServer((socket) => {
        let buf = "";
        let req;
        socket.on("error", () => {}); // the MCP server closed it first
        socket.on("close", () => req && (req.closed = true));
        socket.on("data", async (d) => {
            buf += d;
            const nl = buf.indexOf("\n");
            if (nl < 0) return;
            req = JSON.parse(buf.slice(0, nl));
            seen.push(req);
            const reply =
                req.op === "hello"
                    ? {
                          ok: true,
                          result: {
                              protocolMin: 1, protocolMax: 1, libraryId,
                              label, browser: "Chrome", paperCount: 0,
                          },
                      }
                    : await replies[req.op](req);
            socket.write(JSON.stringify({ id: req.id, ...reply }) + "\n");
        });
    });
    servers.push(server);
    fs.mkdirSync(path.join(home, ".papermemory", "sock"), { recursive: true });
    await new Promise((resolve) => server.listen(socketPathFor(home, libraryId), resolve));
    return seen;
}

const mode = (p) => fs.statSync(p).mode & 0o777;

// A reply the fake Library holds until `answer(reply)`: the user deciding in the browser.
function held() {
    let answer;
    const promise = new Promise((resolve) => (answer = resolve));
    return { promise, answer };
}

async function until(condition, ms = 5_000) {
    for (const start = Date.now(); !condition(); await new Promise((r) => setTimeout(r, 10))) {
        assert.ok(Date.now() - start < ms, `not met after ${ms} ms: ${condition}`);
    }
}

// A temp HOME with a salt: the MCP server needs it for its Project key.
function installedHome() {
    const home = tempHome();
    fs.mkdirSync(path.join(home, ".papermemory"), { recursive: true });
    fs.writeFileSync(path.join(home, ".papermemory", "salt"), crypto.randomBytes(32));
    return home;
}

const credentialPath = (home) =>
    path.join(
        home, ".papermemory", "clients", safeName(LIB_ID),
        `${crypto.createHash("sha256").update(CLIENT).digest("hex").slice(0, 16)}.json`,
    );

// The way to the Allow button, as the popup and the options page show it (the popup's banner opens Agent access).
const WAY = `click the PaperMemory toolbar icon in Chrome (red badge) and then the banner '${CLIENT} is waiting for your OK', or the notification, or open PaperMemory's settings → Agent access, then click **Allow** next to ${CLIENT}`;
const PAIRING_REQUIRED = `pairing-required: Stop and ask the user before doing anything else with PaperMemory. Tell them: "${CLIENT} is asking to use your PaperMemory library. To allow it, ${WAY}." When they say they have allowed it, call connect (or this tool) again.`;

test("tools, cwd Project with no Library, no pairing, silent selfheal", async () => {
    const home = tempHome();
    // Installed temp HOME (PATH without agent CLIs: nothing registered) so selfheal really runs.
    const install = spawnSync(process.execPath, [CLI, "install", "--yes"], {
        env: { HOME: home, PATH: "/usr/bin:/bin" },
        encoding: "utf8",
    });
    assert.equal(install.status, 0, install.stderr);
    const wrapper = path.join(home, ".papermemory", "bin", "papermemory-host");
    fs.rmSync(wrapper);
    const [demo] = projectDirs("demo-project");

    const s = await startServe({ home, cwd: demo });
    assert.deepEqual(s.tools.map((t) => t.name).sort(), TOOLS);
    const info = json(await s.call("get_project"));
    assert.deepEqual(Object.keys(info), ["project", "folder", "source", "hint"]);
    assert.equal(info.project, "demo-project");
    assert.equal(info.folder, demo);
    assert.equal(info.source, "cwd");
    assert.ok(SKILL.includes(info.hint), "hint is the Tag rename hint of SKILL.md");
    const search = await s.call("search_papers", { query: "x" });
    assert.equal(search.isError, true);
    assert.match(search.content[0].text, /no PaperMemory library is connected/);
    assert.ok(!fs.existsSync(path.join(home, ".papermemory", "clients")), "no pairing");
    assert.equal(mode(wrapper), 0o755, "selfheal rewrote the wrapper at start");
    await s.close();
});

test("get_project uses the first file:// MCP root", async () => {
    const home = tempHome();
    const [demo, rooted] = projectDirs("demo-project", "rooted");
    const s = await startServe({ home, cwd: demo, roots: [{ uri: pathToFileURL(rooted).href, name: "rooted" }] });
    const info = json(await s.call("get_project"));
    assert.equal(info.project, "rooted");
    assert.equal(info.folder, rooted);
    assert.equal(info.source, "roots");
    await s.close();
});

test("roots are used when initialize, initialized and tools/list arrive in one chunk", async () => {
    const home = tempHome();
    const [demo, rooted] = projectDirs("demo-project", "rooted");
    const roots = [{ uri: pathToFileURL(rooted).href, name: "rooted" }];
    const s = await startServe({ home, cwd: demo, roots, oneChunk: true });
    assert.deepEqual(s.tools.map((t) => t.name).sort(), TOOLS);
    const info = json(await s.call("get_project"));
    assert.equal(s.rootsRequests(), 1);
    assert.equal(info.source, "roots");
    assert.equal(info.project, "rooted");
    await s.close();
});

test("roots/list unanswered: the working directory is used after 2 s", async () => {
    const home = tempHome();
    const [demo] = projectDirs("demo-project");
    const start = Date.now();
    const s = await startServe({ home, cwd: demo, roots: "silent" });
    const info = json(await s.call("get_project"));
    assert.ok(Date.now() - start >= 1900, `answered after ${Date.now() - start} ms`);
    assert.equal(s.rootsRequests(), 1);
    assert.equal(info.project, "demo-project");
    assert.equal(info.source, "cwd");
    await s.close();
});

test("no Project when the working directory is HOME", async () => {
    const home = tempHome();
    const s = await startServe({ home, cwd: home });
    const info = json(await s.call("get_project"));
    assert.equal(info.project, null);
    assert.equal(info.source, "none");
    assert.equal(info.folder, fs.realpathSync(home));
    assert.match(info.reason, /home folder/);
    assert.match(info.hint, /per-project MCP configuration/);
    assert.equal(info.tag, undefined);
    await s.close();
});

test("a missing salt asks the user to reinstall; serve never creates it", async () => {
    const home = tempHome();
    await fakeLibrary(home, { pair: () => ({ ok: true, result: { clientId: "client-1", secret: "test-secret-1" } }) });
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    const search = await s.call("search_papers", { query: "x" });
    assert.equal(search.isError, true);
    assert.match(search.content[0].text, /salt is missing\): the user must run `npx -y papermemory-mcp@latest install`/);
    assert.ok(!fs.existsSync(path.join(home, ".papermemory", "salt")));
    await s.close();
});

test("pairs on first use, saves the credential, sends auth; unauthorized deletes it", async () => {
    const home = tempHome();
    const salt = crypto.randomBytes(32);
    fs.mkdirSync(path.join(home, ".papermemory"), { recursive: true });
    fs.writeFileSync(path.join(home, ".papermemory", "salt"), salt);
    let secret = "test-secret-1";
    let stored = { label: null };
    const ok = (result) => ({ ok: true, result });
    const seen = await fakeLibrary(home, {
        pair: () => ok({ clientId: "client-1", secret }),
        get_project_info: () => ok(stored),
        search_papers: (req) =>
            req.auth.secret === secret
                ? ok({ total: 0, papers: [] })
                : { ok: false, error: { code: "unauthorized", message: "unknown client" } },
        add_paper: () => ok({ status: "timeout-may-complete" }),
    });
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });

    // No credential yet: get_project pairs (the fake Library allows at once), then reads the Project info.
    assert.equal(json(await s.call("get_project")).tag, "tag created on first add");
    assert.deepEqual(seen.map((r) => r.op), ["hello", "pair", "get_project_info"]);

    // First authenticated call pairs, then forwards args (minus `library`, unknown keys included).
    json(await s.call("search_papers", { query: "x", library: "auto", projectKey: "from-the-model" }));
    const pair = seen.find((r) => r.op === "pair");
    assert.deepEqual(pair.args, { clientName: CLIENT });
    assert.equal(pair.auth, undefined);
    assert.equal(pair.protocol, 1);
    const search = seen.at(-1);
    assert.equal(search.op, "search_papers");
    assert.deepEqual(search.args, { query: "x", projectKey: "from-the-model" });
    assert.equal(search.protocol, 1);
    assert.deepEqual(Object.keys(search.auth).sort(), ["clientId", "projectFolderName", "projectKey", "secret", "sessionId"]);
    assert.equal(search.auth.clientId, "client-1");
    assert.equal(search.auth.secret, secret);
    assert.match(search.auth.sessionId, /^[0-9a-f]{64}$/);
    assert.equal(search.auth.projectKey, crypto.createHmac("sha256", salt).update(demo).digest("hex"));
    assert.equal(search.auth.projectFolderName, "demo-project");

    const credDir = path.join(home, ".papermemory", "clients", safeName(LIB_ID));
    const clientKey = crypto.createHash("sha256").update(CLIENT).digest("hex").slice(0, 16);
    const credFile = path.join(credDir, `${clientKey}.json`);
    assert.deepEqual(JSON.parse(fs.readFileSync(credFile, "utf8")), { clientName: CLIENT, clientId: "client-1", secret });
    assert.equal(mode(credFile), 0o600);
    assert.equal(mode(credDir), 0o700);
    assert.equal(mode(path.dirname(credDir)), 0o700);

    // With a credential, get_project reads the Project info (before and after its first add).
    let info = json(await s.call("get_project"));
    assert.equal(info.project, "demo-project");
    assert.equal(info.tag, "tag created on first add");
    stored = { label: "Stored label", tag: "proj-stored-label", paperCount: 1 };
    info = json(await s.call("get_project"));
    assert.equal(info.project, "Stored label");
    assert.equal(info.tag, "proj-stored-label");

    // set_project({label}) is sent as auth.projectLabel from then on.
    json(await s.call("set_project", { label: "My survey" }));
    json(await s.call("search_papers", { query: "y" }));
    assert.equal(seen.at(-1).auth.projectLabel, "My survey");
    assert.equal((await s.call("set_project", { label: "" })).isError, true);

    // timeout-may-complete tells the agent to check with search_papers.
    const add = await s.call("add_paper", { url: "https://arxiv.org/abs/1706.03762", tags: [], reason: "test" });
    assert.equal(json(add).status, "timeout-may-complete");
    assert.match(add.content[1].text, /search_papers/);

    // unauthorized: the credential file is deleted and the agent is told to pair again.
    secret = "test-secret-2";
    const denied = await s.call("search_papers", { query: "z" });
    assert.equal(denied.isError, true);
    assert.equal(
        denied.content[0].text,
        `unauthorized: PaperMemory no longer accepts ${CLIENT}: the user must pair it again. The next PaperMemory call asks them again, and they ${WAY}.`,
    );
    assert.ok(!fs.existsSync(credFile));

    // set_project({none: true}) drops the Project for this process.
    info = json(await s.call("set_project", { none: true }));
    assert.equal(info.project, null);
    assert.equal(info.source, "none");
    assert.match(info.reason, /none: true/);
    json(await s.call("search_papers", { query: "w" }));
    assert.equal(seen.filter((r) => r.op === "pair").length, 2);
    assert.deepEqual(Object.keys(seen.at(-1).auth).sort(), ["clientId", "secret", "sessionId"]);
    assert.equal(seen.at(-1).auth.sessionId, search.auth.sessionId);
    await s.close();
});

test("concurrent first calls pair once and all succeed", async () => {
    const home = tempHome();
    fs.mkdirSync(path.join(home, ".papermemory"), { recursive: true });
    fs.writeFileSync(path.join(home, ".papermemory", "salt"), crypto.randomBytes(32));
    const ok = (result) => ({ ok: true, result });
    // Hold the pair reply until all three calls have probed the Library, so they overlap for sure.
    const hellos = () => seen.filter((r) => r.op === "hello").length;
    const seen = await fakeLibrary(home, {
        pair: async () => {
            for (let i = 0; i < 500 && hellos() < 3; i++) await new Promise((r) => setTimeout(r, 10));
            return ok({ clientId: "client-1", secret: "test-secret-1" });
        },
        search_papers: (req) =>
            req.auth.secret === "test-secret-1"
                ? ok({ total: 0, papers: [] })
                : { ok: false, error: { code: "unauthorized", message: "unknown client" } },
    });
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    const results = await Promise.all([1, 2, 3].map((n) => s.call("search_papers", { query: `q${n}` })));
    results.forEach((r) => json(r));
    assert.ok(hellos() >= 3);
    assert.equal(seen.filter((r) => r.op === "pair").length, 1);
    assert.equal(seen.filter((r) => r.op === "search_papers").length, 3);
    await s.close();
});

test("a pairing waiting for the user: pairing-required in ~2 s, the request stays open, Allow pairs in the background", async () => {
    const home = installedHome();
    const decision = held();
    const seen = await fakeLibrary(home, {
        pair: () => decision.promise,
        search_papers: () => ({ ok: true, result: { total: 0, papers: [] } }),
    });
    const pairs = () => seen.filter((r) => r.op === "pair");
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });

    const start = Date.now();
    const first = await s.call("search_papers", { query: "x" });
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 1900 && elapsed < 3000, `answered after ${elapsed} ms`);
    assert.equal(first.isError, true);
    assert.equal(first.content[0].text, PAIRING_REQUIRED);
    assert.equal(pairs().length, 1);
    assert.ok(!pairs()[0].closed, "the pairing request stays open after the tool call answered");

    // A later call waits for the same request again: no second `pair`.
    assert.equal((await s.call("search_papers", { query: "y" })).content[0].text, PAIRING_REQUIRED);
    assert.equal(pairs().length, 1);

    // The user clicks Allow while no call waits: the credential is saved anyway, and the next call uses it.
    decision.answer({ ok: true, result: { clientId: "client-1", secret: "test-secret-1" } });
    await until(() => fs.existsSync(credentialPath(home)));
    json(await s.call("search_papers", { query: "z" }));
    assert.equal(pairs().length, 1);
    assert.equal(seen.at(-1).op, "search_papers");
    assert.equal(seen.at(-1).auth.secret, "test-secret-1");
    await s.close();
});

test("after a Deny the next call pairs again; PaperMemory's cooldown is relayed as rate-limited", async () => {
    const home = installedHome();
    const decisions = [held(), null, held()];
    const seen = await fakeLibrary(home, {
        // the first request waits for the user, the second comes within PaperMemory's Deny cooldown
        pair: () => {
            const n = seen.filter((r) => r.op === "pair").length - 1;
            if (decisions[n]) return decisions[n].promise;
            return {
                ok: false,
                error: { code: "rate-limited", message: "The user denied a pairing request less than a minute ago" },
            };
        },
    });
    const pairs = () => seen.filter((r) => r.op === "pair");
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });

    assert.equal((await s.call("search_papers", { query: "x" })).content[0].text, PAIRING_REQUIRED);
    decisions[0].answer({ ok: false, error: { code: "denied", message: "The user denied this client access" } });
    await until(() => pairs()[0].closed);

    const start = Date.now();
    const refused = await s.call("search_papers", { query: "x" });
    assert.ok(Date.now() - start < 1500, "PaperMemory's refusal is relayed at once");
    assert.equal(refused.isError, true);
    assert.equal(
        refused.content[0].text,
        `rate-limited: The user denied a PaperMemory pairing request less than a minute ago, so PaperMemory refuses new ones for now. Ask the user whether ${CLIENT} may use PaperMemory. If they agree, call this tool again in a minute: PaperMemory then asks them again, and they ${WAY}.`,
    );
    assert.equal(pairs().length, 2);

    // The cooldown over, the next call opens a new pairing request.
    assert.equal((await s.call("search_papers", { query: "x" })).content[0].text, PAIRING_REQUIRED);
    assert.equal(pairs().length, 3);
    decisions[2].answer({
        ok: false,
        error: { code: "timeout", message: "The user did not answer the pairing request in time" },
    });
    await until(() => pairs()[2].closed);
    assert.ok(!fs.existsSync(credentialPath(home)));
    await s.close();
});

test("connect: pairing-required, paired once the user allows, then already paired; a revoked client is told", async () => {
    const home = installedHome();
    const decision = held();
    let secret = "test-secret-1";
    const ok = (result) => ({ ok: true, result });
    const seen = await fakeLibrary(home, {
        pair: () => decision.promise,
        list_tags: (req) =>
            req.auth.secret === secret ? ok([]) : { ok: false, error: { code: "unauthorized", message: "unknown client" } },
    });
    const pairs = () => seen.filter((r) => r.op === "pair");
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    const connect = s.tools.find((t) => t.name === "connect");
    assert.deepEqual(Object.keys(connect.inputSchema.properties), ["library"]);
    assert.match(connect.description, /right after confirming the project with the user/);
    assert.match(connect.description, /stop, tell the user what the answer says/);
    assert.match(connect.description, /click \*\*Allow\*\* next to your name under Agent access in PaperMemory's settings/);
    assert.match(connect.description, /once they say they have allowed it/);
    assert.doesNotMatch(connect.description, /tab/);

    assert.equal((await s.call("connect")).content[0].text, PAIRING_REQUIRED);

    // The user clicks Allow while the next connect waits for the same request.
    const second = s.call("connect");
    setTimeout(() => decision.answer(ok({ clientId: "client-1", secret })), 500);
    const library = "Chrome · aaaaaa";
    assert.deepEqual(json(await second), { paired: true, alreadyPaired: false, clientName: CLIENT, library });
    assert.deepEqual(json(await s.call("connect")), { paired: true, alreadyPaired: true, clientName: CLIENT, library });
    assert.equal(pairs().length, 1);
    assert.equal(seen.at(-1).op, "list_tags");
    assert.equal(seen.at(-1).auth.secret, secret);

    // Revoked in the browser: connect says so, and that the next call asks the user again.
    secret = "test-secret-2";
    const revoked = await s.call("connect");
    assert.equal(revoked.isError, true);
    assert.match(revoked.content[0].text, /^unauthorized: .*must pair it again\. The next PaperMemory call asks them again, and they click the PaperMemory toolbar icon in Chrome/);
    assert.ok(!fs.existsSync(credentialPath(home)));
    await s.close();
});

test("Agent access turned off (`disabled`) keeps the credential; only `unauthorized` deletes it", async () => {
    const home = installedHome();
    const listed = { ok: true, result: { total: 0, papers: [] } };
    let reply = listed;
    const seen = await fakeLibrary(home, {
        pair: () => ({ ok: true, result: { clientId: "client-1", secret: "test-secret-1" } }),
        search_papers: () => reply,
    });
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    json(await s.call("search_papers", { query: "x" })); // pairs
    assert.ok(fs.existsSync(credentialPath(home)));

    // a change in flight when the user turned Agent access off
    reply = { ok: false, error: { code: "disabled", message: "Agent access is off in PaperMemory's options" } };
    const off = await s.call("search_papers", { query: "y" });
    assert.equal(off.isError, true);
    assert.equal(off.content[0].text, "disabled: Agent access is off in PaperMemory's options");
    assert.ok(fs.existsSync(credentialPath(home)), "still paired");

    // turned back on: the same credential, no new pairing request
    reply = listed;
    json(await s.call("search_papers", { query: "z" }));
    assert.equal(seen.filter((r) => r.op === "pair").length, 1);
    assert.equal(seen.at(-1).auth.secret, "test-secret-1");

    reply = { ok: false, error: { code: "unauthorized", message: "unknown client" } };
    assert.match((await s.call("search_papers", { query: "w" })).content[0].text, /^unauthorized: .*must pair it again/);
    assert.ok(!fs.existsSync(credentialPath(home)));
    await s.close();
});

test("get_project and list_libraries ask for pairing when unpaired, and still answer", async () => {
    for (const first of ["get_project", "list_libraries"]) {
        const home = installedHome();
        const decision = held();
        const seen = await fakeLibrary(home, {
            pair: () => decision.promise,
            get_project_info: () => ({ ok: true, result: { label: null } }),
        });
        const pairs = () => seen.filter((r) => r.op === "pair");
        const [demo] = projectDirs("demo-project");
        const s = await startServe({ home, cwd: demo });

        // The answer carries the data, then the instruction, as an error.
        const r = await s.call(first);
        assert.equal(r.isError, true);
        assert.equal(r.content.length, 2);
        assert.equal(r.content[1].text, PAIRING_REQUIRED);
        const data = JSON.parse(r.content[0].text);
        if (first === "get_project") {
            assert.equal(data.project, "demo-project");
            assert.equal(data.tag, undefined);
        } else {
            assert.deepEqual(data.map((l) => l.libraryId), [LIB_ID]);
        }
        assert.equal(pairs().length, 1);

        // Any other call, or the other tool, joins the same pending request.
        const other = first === "get_project" ? "list_libraries" : "get_project";
        assert.equal((await s.call(other)).content[1].text, PAIRING_REQUIRED);
        assert.equal((await s.call("search_papers", { query: "x" })).content[0].text, PAIRING_REQUIRED);
        assert.equal(pairs().length, 1);

        // Allowed: the next calls succeed without a second `pair`.
        decision.answer({ ok: true, result: { clientId: "client-1", secret: "test-secret-1" } });
        await until(() => fs.existsSync(credentialPath(home)));
        const again = await s.call(first);
        assert.ok(!again.isError, again.content[0].text);
        assert.equal(again.content.length, 1);
        if (first === "get_project") assert.equal(JSON.parse(again.content[0].text).tag, "tag created on first add");
        json(await s.call(other));
        assert.equal(pairs().length, 1);
        await s.close();
    }
});

test("list_libraries asks for no pairing when several libraries are connected; a call naming one pairs with it only", async () => {
    const home = installedHome();
    const second = "bbbbbbbb-0000-4000-8000-000000000002";
    const ok = (result) => ({ ok: true, result });
    const replies = {
        pair: () => ok({ clientId: "client-1", secret: "test-secret-1" }),
        search_papers: () => ok({ total: 0, papers: [] }),
    };
    const seenFirst = await fakeLibrary(home, replies);
    const seenSecond = await fakeLibrary(home, replies, { libraryId: second, label: "Chrome · bbbbbb" });
    const pairs = (seen) => seen.filter((r) => r.op === "pair").length;
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    const tool = s.tools.find((t) => t.name === "list_libraries");
    assert.match(tool.description, /When several are listed, ask the user which one to use and pass it as `library`/);

    // The list only: no pairing request in a library the user may not want this agent in.
    const listed = json(await s.call("list_libraries"));
    assert.deepEqual(listed.map((l) => l.libraryId).sort(), [LIB_ID, second]);
    assert.equal(json(await s.call("get_project")).tag, undefined);
    assert.equal(pairs(seenFirst) + pairs(seenSecond), 0);

    // The user names one: only that one asks them.
    json(await s.call("search_papers", { query: "x", library: second }));
    assert.equal(pairs(seenSecond), 1);
    assert.equal(pairs(seenFirst), 0);
    await s.close();
});

test("get_project without a Project still asks for pairing", async () => {
    const home = installedHome();
    const seen = await fakeLibrary(home, { pair: () => held().promise });
    const s = await startServe({ home, cwd: home });
    const r = await s.call("get_project");
    assert.equal(r.isError, true);
    assert.equal(JSON.parse(r.content[0].text).project, null);
    assert.equal(r.content[1].text, PAIRING_REQUIRED);
    assert.equal(seen.filter((x) => x.op === "pair").length, 1);
    await s.close();
});

test("busy and denied are relayed with the way to the Allow button", async () => {
    const home = installedHome();
    let reply = { ok: false, error: { code: "busy", message: "another request is pending" } };
    await fakeLibrary(home, { pair: () => reply });
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo });
    assert.equal(
        (await s.call("search_papers", { query: "x" })).content[0].text,
        `busy: Too many PaperMemory pairing requests are waiting for the user. Ask the user to answer them: click the PaperMemory toolbar icon in Chrome (red badge) and then its banner, or open PaperMemory's settings → Agent access. Then call this tool again.`,
    );
    reply = { ok: false, error: { code: "denied", message: "The user denied this client access" } };
    assert.equal(
        (await s.call("search_papers", { query: "x" })).content[0].text,
        `denied: The user denied ${CLIENT} access to PaperMemory. Do not ask again unless the user says otherwise. If they change their mind, call this tool again in a minute: they then ${WAY}.`,
    );
    await s.close();
});

test("the pending pair outlives the old 130 s limit while the process lives", async () => {
    const home = installedHome();
    // Preload: timers of 120 s or more run 1000 times faster, so a 130 s limit would fire after 130 ms.
    const preload = path.join(home, "fast-timers.mjs");
    fs.writeFileSync(
        preload,
        "const t = globalThis.setTimeout;\nglobalThis.setTimeout = (fn, ms, ...a) => t(fn, ms >= 120000 ? ms / 1000 : ms, ...a);\n",
    );
    const decision = held();
    const seen = await fakeLibrary(home, {
        pair: () => decision.promise,
        search_papers: () => ({ ok: true, result: { total: 0, papers: [] } }),
    });
    const pairs = () => seen.filter((r) => r.op === "pair");
    const [demo] = projectDirs("demo-project");
    const s = await startServe({ home, cwd: demo, nodeArgs: ["--import", pathToFileURL(preload).href] });

    assert.equal((await s.call("search_papers", { query: "x" })).content[0].text, PAIRING_REQUIRED);
    await new Promise((r) => setTimeout(r, 1500)); // 1.5 s here is 25 minutes there
    assert.ok(!pairs()[0].closed, "the pair request is still open");
    assert.equal((await s.call("search_papers", { query: "y" })).content[0].text, PAIRING_REQUIRED);
    assert.equal(pairs().length, 1);

    decision.answer({ ok: true, result: { clientId: "client-1", secret: "test-secret-1" } });
    await until(() => fs.existsSync(credentialPath(home)));
    json(await s.call("search_papers", { query: "z" }));
    assert.equal(pairs().length, 1);
    await s.close();
});

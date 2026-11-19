// Shared harness of the Agent access end-to-end tests (e2e.chrome.mjs, e2e.firefox.mjs; not in `npm test`).
// Every browser, install and MCP server process gets a temp HOME outside the real home, so no file lands
// there, and the browser launches the Native host from <temp HOME>/.papermemory/bin (a host under
// ~/Documents would wait on a macOS privacy prompt).
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { safeName, socketPathFor } from "../host/host.mjs";

const PKG = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = path.join(PKG, "..");
const CLI = path.join(PKG, "dist", "cli.mjs");

const ARXIV = "https://arxiv.org/abs/1706.03762"; // Attention Is All You Need
const OPENREVIEW = "https://openreview.net/forum?id=xQUe1pOKPam"; // Pre-training Molecular Graph Representation with 3D Geometry
const OPENREVIEW_APIS = ["api", "api2"].map((a) => `https://${a}.openreview.net/notes?id=xQUe1pOKPam`);
const USER_PAPER = "https://arxiv.org/abs/1512.03385"; // Deep Residual Learning for Image Recognition
// ViT, BERT, GPT-3: new papers to add ahead of queued changes
const SLOW_PAPERS = ["2010.11929", "1810.04805", "2005.14165"].map((id) => `https://arxiv.org/abs/${id}`);
const CLIENT = "e2e-agent";

// ------------------------------
// -----  Setup and report  -----
// ------------------------------

/** Build the package and an Agent access test build (WXT_PM_AGENT_TEST=1: nativeMessaging granted, pairing auto-allowed). */
export function build(browser) {
    execFileSync("npm", ["run", "build"], { cwd: PKG, stdio: "pipe" });
    execFileSync("npx", ["wxt", "build", "--browser", browser], {
        cwd: REPO,
        env: { ...process.env, WXT_PM_AGENT_TEST: "1" },
        stdio: "pipe",
    });
    const dir = path.join(REPO, "dist", browser === "firefox" ? "firefox-mv2" : "chrome-mv3");
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.ok(manifest.permissions.includes("nativeMessaging"), "not an Agent access test build");
    return { dir, manifest };
}

/** Leave a production build in dist/: a test build allows every pairing request. */
export function rebuildProduction(browser) {
    const { WXT_PM_AGENT_TEST, ...env } = process.env;
    execFileSync("npx", ["wxt", "build", "--browser", browser], { cwd: REPO, env, stdio: "pipe" });
}

/** A temp dir under os.tmpdir(), never in the real home. */
export function tempDir(prefix) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    assert.ok(!fs.realpathSync(dir).startsWith(fs.realpathSync(os.homedir()) + path.sep), `${dir} is in the real home`);
    return dir;
}

/** Temp HOME: short, as macOS socket paths are limited to 103 bytes (the host cuts the name to 12 characters). */
export function tempHome() {
    const home = tempDir("pme-");
    assert.ok(
        Buffer.byteLength(socketPathFor(home, crypto.randomUUID())) <= 103,
        `${home} is too long for a socket path`,
    );
    return home;
}

/** What a GUI-launched browser or agent gets: a minimal PATH (no agent CLI), here with the temp HOME. */
export const minimalEnv = (home) => ({ HOME: home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin", TMPDIR: os.tmpdir() });

/** `papermemory-mcp install --yes` in the temp HOME; everything it records stays in temp dirs. */
export function install(home, args = []) {
    const res = spawnSync(process.execPath, [CLI, "install", "--yes", ...args], {
        env: minimalEnv(home),
        encoding: "utf8",
    });
    assert.equal(res.status, 0, res.stderr);
    const state = JSON.parse(fs.readFileSync(path.join(home, ".papermemory", "install.json"), "utf8"));
    assert.deepEqual(state.agents, {}, "no agent client is registered");
    const tmp = [os.tmpdir(), fs.realpathSync(os.tmpdir())].map((t) => t + path.sep);
    for (const p of [...state.files, ...state.dirs])
        assert.ok(
            tmp.some((t) => p.startsWith(t)),
            `install wrote ${p}`,
        );
    return state;
}

const results = [];

/** Thrown by a check that cannot run in this environment; its message is the evidence. */
class EnvironmentSkip extends Error {}

/** Run one assertion and print PASS, FAIL or SKIP; a check may return a note. */
export async function check(name, fn) {
    const start = Date.now();
    try {
        const note = await fn();
        const secs = ((Date.now() - start) / 1000).toFixed(1);
        results.push({ name, status: "PASS" });
        console.log(`PASS ${name} [${secs} s]${note ? ` — ${note}` : ""}`);
    } catch (err) {
        const status = err instanceof EnvironmentSkip ? "SKIP" : "FAIL";
        results.push({ name, status });
        console.log(`${status} ${name}: ${status === "SKIP" ? err.message : err.stack}`);
    }
}

/** Print the totals and OVERALL PASS or FAIL; temp dirs are removed on PASS, kept for inspection on FAIL. */
export function finish(dirs) {
    const count = (s) => results.filter((r) => r.status === s).length;
    console.log(`\n${count("PASS")} passed, ${count("FAIL")} failed, ${count("SKIP")} skipped (environment)`);
    if (count("FAIL") === 0 && count("PASS") > 0) {
        // temp dirs made by this test. Firefox makes Documents and Downloads in the temp HOME with a
        // "deny delete" ACL: remove the ACLs first
        for (const d of dirs) {
            execFileSync("chmod", ["-R", "-N", d]);
            fs.rmSync(d, { recursive: true, force: true });
        }
        console.log("OVERALL PASS");
    } else {
        console.log(`Temp dirs kept: ${dirs.join(" ")}`);
        console.log("OVERALL FAIL");
        process.exitCode = 1;
    }
}

async function waitFor(what, fn, timeoutMs, intervalMs = 200) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await fn().catch(() => undefined);
        if (value) return value;
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
        await sleep(intervalMs);
    }
}

// --------------------------
// -----  MCP sessions  -----
// --------------------------

/** One Agent session: the installed `papermemory-mcp serve`, launched in `cwd` by client `clientName` (no MCP roots). */
async function startServe(home, cwd, clientName) {
    const child = spawn(path.join(home, ".papermemory", "bin", "papermemory-mcp"), ["serve"], {
        cwd,
        env: minimalEnv(home),
    });
    const pending = new Map();
    let stderr = "";
    let buf = "";
    let nextId = 1;
    child.stderr.on("data", (d) => (stderr += d));
    child.stdin.on("error", () => {}); // the server exited: its pending calls are answered below
    child.stdout.on("data", (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
            const msg = JSON.parse(buf.slice(0, nl));
            buf = buf.slice(nl + 1);
            pending.get(msg.id)?.(msg);
        }
    });
    const exited = new Promise((resolve) => child.on("exit", resolve));
    exited.then(() => pending.forEach((settle) => settle({ error: { message: `serve exited: ${stderr}` } })));
    const send = (msg) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");
    const rpc = (method, params) =>
        new Promise((resolve, reject) => {
            const id = nextId++;
            // longer than the MCP server's own 130 s timeout for queued changes
            const timer = setTimeout(() => pending.get(id)({ error: { message: `${method} timed out` } }), 150_000);
            pending.set(id, (msg) => {
                pending.delete(id);
                clearTimeout(timer);
                msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
            });
            send({ id, method, params });
        });
    await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: clientName, version: "0" },
    });
    send({ method: "notifications/initialized" });
    return {
        /** A tool call: `{isError, text, json}`; an error's text is `<code>: <message>`. */
        async call(name, args = {}) {
            const result = await rpc("tools/call", { name, arguments: args });
            const text = result.content.map((c) => c.text).join("\n");
            return {
                isError: result.isError === true,
                text,
                json: result.isError ? undefined : JSON.parse(result.content[0].text),
            };
        },
        async close() {
            child.stdin.end();
            await Promise.race([exited, sleep(5_000, undefined, { ref: false })]);
            child.kill("SIGKILL");
        },
    };
}

const ok = (r) => {
    assert.ok(!r.isError, r.text);
    return r.json;
};
const errorCode = (r) => {
    assert.ok(r.isError, `expected an error, got ${r.text}`);
    return r.text.split(":")[0];
};

/** `papermemory-mcp`'s credential file for a client name (see serve.mjs). */
function credentialFile(home, libraryId, clientName) {
    const clientKey = crypto.createHash("sha256").update(clientName).digest("hex").slice(0, 16);
    return path.join(home, ".papermemory", "clients", safeName(libraryId), `${clientKey}.json`);
}

// --------------------------
// -----  Socket level  -----
// --------------------------

/** One NDJSON request on a Library socket, straight to the Native host (no MCP server, no stale-socket cleanup). */
function socketRequest(sockPath, request, timeoutMs = 3_000) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(sockPath);
        let buf = "";
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error("no reply"));
        }, timeoutMs);
        socket.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
        socket.on("connect", () => socket.write(JSON.stringify(request) + "\n"));
        socket.on("data", (d) => {
            buf += d;
            const nl = buf.indexOf("\n");
            if (nl < 0) return;
            clearTimeout(timer);
            socket.destroy();
            resolve(JSON.parse(buf.slice(0, nl)));
        });
    });
}

/** The Libraries answering `hello` on their socket now. */
async function liveLibraries(home) {
    const dir = path.join(home, ".papermemory", "sock");
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".sock")) : [];
    const hello = { id: "e2e", op: "hello", args: {} };
    const replies = await Promise.all(names.map((n) => socketRequest(path.join(dir, n), hello).catch(() => null)));
    return replies.filter((r) => r?.ok).map((r) => r.result);
}

/** Writes one 2 MiB line on a new connection; resolves with the reply bytes received once the host closes it. */
function sendOversizedLine(sockPath) {
    return new Promise((resolve, reject) => {
        const socket = net.connect(sockPath);
        let received = 0;
        const timer = setTimeout(() => {
            socket.destroy();
            reject(new Error("the connection is still open after 5 s"));
        }, 5_000);
        socket.on("data", (d) => (received += d.length));
        socket.on("error", () => {}); // EPIPE or ECONNRESET: the host closed it
        socket.on("close", () => {
            clearTimeout(timer);
            resolve(received);
        });
        socket.on("connect", () => {
            const pad = "x".repeat(2 * 1024 * 1024);
            socket.write(JSON.stringify({ id: "big", op: "hello", args: { pad } }) + "\n");
        });
    });
}

/** Pids of the Native hosts started from this temp HOME's copy (never another host). */
function hostPids(home) {
    const marks = [home, fs.realpathSync(home)].map((h) => path.join(h, ".papermemory", "bin", "host.mjs"));
    return execFileSync("ps", ["-axwwo", "pid=,command="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
        .split("\n")
        .filter((line) => marks.some((m) => line.includes(m)))
        .map((line) => Number(line.trim().split(/\s+/)[0]));
}

// ------------------------
// -----  Browser UI  -----
// ------------------------

/** A user visit: PaperMemory's content script stores the paper and marks the page when done. */
async function visit(browser, url) {
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        const done = () => page.evaluate(() => Boolean(document.querySelector("meta[name='pm-complete-secret-html']")));
        await waitFor(`PaperMemory to store ${url}`, done, 30_000, 250);
    } finally {
        await page.close();
    }
}

/** PaperMemory's options page, scripts loaded. */
export async function openOptions(browser, url) {
    const page = await browser.newPage();
    // Firefox: puppeteer never sees a navigation to an extension page complete, but the page loads
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3_000 }).catch(() => {});
    const ready = () =>
        page.evaluate(
            () => typeof window.PMDebug === "object" && Boolean(document.getElementById("agent-clients-list")),
        );
    await waitFor("the options page", ready, 15_000);
    return page;
}

/** Click Revoke on a Paired client's row in the options page. */
async function clickRevoke(page, clientName) {
    const clicked = await page.evaluate((name) => {
        const rows = [...document.querySelectorAll("#agent-clients-list > div")];
        const row = rows.find((r) => r.querySelector("bdi")?.textContent === name);
        row?.querySelector("button").click();
        return Boolean(row);
    }, clientName);
    assert.ok(clicked, `no Paired client row for ${clientName}`);
}

/** Evidence that OpenReview's API challenges this browser: its answers, fetched from an extension page. */
async function openReviewEvidence(driver) {
    const page = await openOptions(driver.browser, driver.optionsUrl);
    try {
        const answers = await page.evaluate(
            (urls) =>
                Promise.all(
                    urls.map((u) =>
                        fetch(u).then(
                            async (r) => ({ url: u, status: r.status, body: (await r.text()).slice(0, 160) }),
                            (e) => ({ url: u, status: 0, body: String(e) }),
                        ),
                    ),
                ),
            OPENREVIEW_APIS,
        );
        const challenged = answers.some((a) => a.status === 403 && /ChallengeRequired/.test(a.body));
        return { challenged, text: answers.map((a) => `${a.url} → ${a.status} ${a.body}`).join(" | ") };
    } finally {
        await page.close();
    }
}

// --------------------
// -----  Checks  -----
// --------------------

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A paper an agent just added: metadata, tags and Provenance, which never gives ids or hashes. */
function assertAdded(paper, { title, author, reason, projectTag }) {
    assert.match(paper.title, title);
    assert.match(paper.author, author);
    for (const tag of ["review", "e2e", projectTag]) assert.ok(paper.tags.includes(tag), `tag ${tag} in ${paper.tags}`);
    assert.deepEqual(Object.keys(paper.provenance).sort(), ["addedAt", "clientName", "projectLabel", "reason"]);
    assert.equal(paper.provenance.clientName, CLIENT);
    assert.equal(paper.provenance.reason, reason);
    assert.equal(paper.provenance.projectLabel, "alpha");
}

/**
 * Step 14's assertions, through MCP server → socket → Native host → extension. `driver`: {home, browser, optionsUrl,
 * storage (Chrome only: reads extension storage), close(), relaunch()}, with Agent access on.
 */
export async function runSuite(driver) {
    const { home } = driver;
    fs.mkdirSync(path.join(PKG, "test", ".tmp"), { recursive: true });
    // Project folders under agent/test/.tmp/<random>/: a temp folder is no Project
    const base = fs.mkdtempSync(path.join(PKG, "test", ".tmp", "e2e-"));
    const [alpha, beta] = ["alpha", "beta"].map((n) => {
        fs.mkdirSync(path.join(base, n));
        return fs.realpathSync(path.join(base, n));
    });
    const sessions = [];
    const serve = async (cwd, name) => {
        const s = await startServe(home, cwd, name);
        sessions.push(s);
        return s;
    };

    try {
        const live = () => liveLibraries(home).then((libs) => libs.length === 1 && libs[0]);
        const lib = await waitFor("PaperMemory to connect to its Native host", live, 30_000);
        const sockPath = socketPathFor(home, lib.libraryId);
        const s1 = await serve(alpha, CLIENT);
        let projectTag, arxiv, openreview, openreviewSkipped, userPaper;

        await check("list_libraries lists the browser's Library", async () => {
            const libs = ok(await s1.call("list_libraries"));
            assert.deepEqual(
                libs.map((l) => l.libraryId),
                [lib.libraryId],
            );
            return libs[0].label;
        });

        await check("search_papers before any add creates no agentProjects entry", async () => {
            ok(await s1.call("search_papers", { query: "attention" })); // pairs e2e-agent (auto-allowed)
            assert.equal(ok(await s1.call("get_project")).tag, "tag created on first add");
            if (!driver.storage) return "get_project only (no storage inspection)";
            assert.equal(await driver.storage("agentProjects"), undefined);
            return "storage and get_project";
        });

        await check("add_paper (arXiv) → stored, with title, authors, review, Project tag and Provenance", async () => {
            const reason = "Baseline Transformer paper for the e2e test";
            const r = ok(await s1.call("add_paper", { url: ARXIV, tags: ["e2e"], reason }));
            assert.equal(r.status, "stored");
            projectTag = ok(await s1.call("get_project")).tag;
            assert.equal(projectTag, "proj-alpha");
            assertAdded(r.paper, { title: /attention is all you need/i, author: /vaswani/i, reason, projectTag });
            const { note } = ok(await s1.call("get_paper", { id: r.paper.id }));
            assert.ok(note.endsWith(`\nAdded by ${CLIENT}: ${reason}`), `the note says who added it: ${note}`);
            arxiv = r.paper;
            return arxiv.id;
        });

        await check(
            "add_paper (OpenReview) → stored, with title, authors, review, Project tag and Provenance",
            async () => {
                const reason = "Molecular pre-training paper for the e2e test";
                const r = ok(await s1.call("add_paper", { url: OPENREVIEW, tags: ["e2e"], reason }));
                if (r.status !== "stored") {
                    const evidence = await openReviewEvidence(driver);
                    openreviewSkipped = evidence.challenged;
                    if (evidence.challenged)
                        throw new EnvironmentSkip(`add_paper answered ${r.status}; ${evidence.text}`);
                    assert.fail(`add_paper answered ${JSON.stringify(r)}; ${evidence.text}`);
                }
                assertAdded(r.paper, {
                    title: /molecular graph representation/i,
                    author: /shengchao liu/i,
                    reason,
                    projectTag,
                });
                openreview = r.paper;
                return openreview.id;
            },
        );

        await check("add_paper again → already-present", async () => {
            const added = openreviewSkipped
                ? [[ARXIV, arxiv]]
                : [
                      [ARXIV, arxiv],
                      [OPENREVIEW, openreview],
                  ];
            for (const [url, paper] of added) {
                assert.ok(paper, `${url} was not added`);
                const r = ok(await s1.call("add_paper", { url, tags: [], reason: "Adding it again" }));
                assert.equal(r.status, "already-present");
                assert.equal(r.id, paper.id);
            }
        });

        await check("add_paper with an extra projectKey argument → bad-args", async () => {
            const args = { url: ARXIV, tags: [], reason: "Claiming a project", projectKey: "0".repeat(64) };
            assert.equal(errorCode(await s1.call("add_paper", args)), "bad-args");
        });

        await check(
            "attach_paper on a user paper adds the Project tag; delete_paper on it → not-own-addition",
            async () => {
                await visit(driver.browser, USER_PAPER);
                const found = ok(await s1.call("search_papers", { query: "deep residual learning" }));
                const paper = found.papers.find((p) => /deep residual learning/i.test(p.title));
                assert.ok(paper, `the visited paper is not in ${JSON.stringify(found)}`);
                assert.equal(paper.provenance, undefined, "a user paper has no Provenance");
                userPaper = ok(await s1.call("attach_paper", { id: paper.id }));
                assert.ok(userPaper.tags.includes(projectTag), `${projectTag} in ${userPaper.tags}`);
                assert.equal(userPaper.provenance, undefined);
                assert.equal(errorCode(await s1.call("delete_paper", { id: paper.id })), "not-own-addition");
                return userPaper.id;
            },
        );

        await check("export_bibtex returns the project's papers", async () => {
            const listed = ok(await s1.call("list_project_papers", {}));
            const ids = listed.papers.map((p) => p.id);
            const members = openreviewSkipped ? [arxiv, userPaper] : [arxiv, openreview, userPaper];
            for (const p of members) assert.ok(p && ids.includes(p.id), `${p?.id} in ${ids}`);
            const exported = ok(await s1.call("export_bibtex"));
            assert.equal(exported.count + exported.skipped.length, listed.total);
            assert.ok(!exported.skipped.includes(arxiv.id), "the arXiv paper has BibTeX");
            for (const p of listed.papers) {
                if (!exported.skipped.includes(p.id)) assert.ok(norm(exported.bibtex).includes(norm(p.title)), p.title);
            }
            return `${exported.count} entries, ${exported.skipped.length} skipped`;
        });

        await check("same cwd, other client name: delete_paper → not-own-addition", async () => {
            const other = await serve(alpha, "e2e-other");
            assert.equal(errorCode(await other.call("delete_paper", { id: arxiv.id })), "not-own-addition");
        });

        await check("other cwd, same client: delete_paper → not-own-addition", async () => {
            const elsewhere = await serve(beta, CLIENT);
            assert.equal(errorCode(await elsewhere.call("delete_paper", { id: arxiv.id })), "not-own-addition");
        });

        await check("a second process with the same client name and cwd deletes it (cross-session)", async () => {
            const again = await serve(alpha, CLIENT);
            assert.deepEqual(ok(await again.call("delete_paper", { id: arxiv.id })), { deleted: true });
            assert.equal(errorCode(await s1.call("get_paper", { id: arxiv.id })), "not-found");
        });

        await check("wrong secret → unauthorized", async () => {
            const s = await serve(alpha, "e2e-wrong-secret");
            ok(await s.call("search_papers", { query: "x" })); // pairs
            const file = credentialFile(home, lib.libraryId, "e2e-wrong-secret");
            const cred = JSON.parse(fs.readFileSync(file, "utf8"));
            fs.writeFileSync(file, JSON.stringify({ ...cred, secret: crypto.randomBytes(32).toString("hex") }));
            const r = await s.call("search_papers", { query: "x" });
            assert.equal(errorCode(r), "unauthorized");
            assert.match(r.text, /pair it again/);
            assert.ok(!fs.existsSync(file), "the MCP server deleted the rejected credential");
        });

        await check("25 concurrent append_note keep all 25 lines", async () => {
            const s = await serve(alpha, "e2e-notes");
            ok(await s.call("search_papers", { query: "x" })); // pairs once, before the burst
            const lines = Array.from({ length: 25 }, (_, i) => `e2e-note-${String(i + 1).padStart(2, "0")}`);
            const replies = await Promise.all(lines.map((text) => s.call("append_note", { id: userPaper.id, text })));
            replies.forEach(ok);
            const note = ok(await s1.call("get_paper", { id: userPaper.id })).note.split("\n");
            for (const line of lines) assert.equal(note.filter((l) => l === line).length, 1, line);
        });

        await check("a 2 MiB line closes that connection", async () => {
            assert.equal(await sendOversizedLine(sockPath), 0, "no reply on that connection");
            const reply = await socketRequest(sockPath, { id: "after", op: "hello", args: {} });
            assert.equal(reply.result.libraryId, lib.libraryId, "the host still serves new connections");
        });

        await check("revoke during 10 queued add_tags → the rest unauthorized", async () => {
            const s = await serve(alpha, "e2e-revoke");
            ok(await s.call("search_papers", { query: "x" })); // pairs once, before the burst
            const page = await openOptions(driver.browser, driver.optionsUrl);
            try {
                const listed = () =>
                    page.evaluate(() =>
                        [...document.querySelectorAll("#agent-clients-list bdi")].some(
                            (b) => b.textContent === "e2e-revoke",
                        ),
                    );
                await waitFor("e2e-revoke in the Paired clients", listed, 10_000);
                // adding new papers takes a while each (fetch, parse, publication lookups): the add_tags queue
                // behind them, and the revoke comes while they wait
                const start = Date.now();
                const reason = "Long changes ahead of the add_tags";
                const ahead = SLOW_PAPERS.map((url) => s1.call("add_paper", { url, tags: [], reason }));
                await sleep(200);
                const tags = Array.from({ length: 10 }, (_, i) => `queued-${i}`);
                const replies = Promise.all(tags.map((t) => s.call("add_tags", { id: userPaper.id, tags: [t] })));
                await sleep(200);
                await clickRevoke(page, "e2e-revoke");
                const revokedAt = Date.now() - start;
                const outcomes = await replies;
                await Promise.all(ahead);
                const aheadMs = Date.now() - start;
                const refused = outcomes.filter((r) => r.isError);
                refused.forEach((r) => assert.equal(errorCode(r), "unauthorized"));
                assert.ok(refused.length > 0, "every add_tags ran before the revoke");
                const paperTags = ok(await s1.call("get_paper", { id: userPaper.id })).tags;
                tags.forEach((t, i) => assert.equal(paperTags.includes(t), !outcomes[i].isError, t));
                return `${refused.length}/10 unauthorized; revoked at ${revokedAt} ms, the adds ahead ended at ${aheadMs} ms`;
            } finally {
                await page.close();
            }
        });

        await check("host SIGKILL → reconnect < 10 s", async () => {
            const pids = hostPids(home);
            assert.equal(pids.length, 1, `host pids ${pids}`);
            process.kill(pids[0], "SIGKILL");
            const start = Date.now();
            const back = async () => {
                const [now] = hostPids(home);
                return now && now !== pids[0] && (await live());
            };
            const relib = await waitFor("the Native host to come back", back, 15_000, 100);
            const elapsed = Date.now() - start;
            assert.equal(relib.libraryId, lib.libraryId);
            assert.ok(elapsed < 10_000, `${elapsed} ms`);
            return `${elapsed} ms`;
        });

        await check("browser restart with no UI → same libraryId", async () => {
            await driver.close();
            const gone = async () => (await liveLibraries(home)).length === 0 && hostPids(home).length === 0;
            await waitFor("the Native host to exit with the browser", gone, 15_000);
            const start = Date.now();
            await driver.relaunch(); // no PaperMemory page opened
            const relib = await waitFor("the Library after the restart", live, 30_000, 100);
            const elapsed = Date.now() - start;
            assert.equal(relib.libraryId, lib.libraryId);
            const listed = ok(await s1.call("list_libraries"));
            assert.deepEqual(
                listed.map((l) => l.libraryId),
                [lib.libraryId],
            );
            ok(await s1.call("search_papers", { query: "attention" })); // still paired
            return `back ${elapsed} ms after the launch`;
        });
    } catch (err) {
        await check("setup", () => Promise.reject(err));
    } finally {
        await Promise.all(sessions.map((s) => s.close()));
    }
    return base;
}

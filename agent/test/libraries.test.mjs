import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { socketPathFor } from "../host/host.mjs";
import { isOlderVersion, listLibraries, negotiate, request, resolveLibrary } from "../src/libraries.mjs";

const REAL_HOME = process.env.HOME;
const servers = [];
const homes = [];
after(() => {
    process.env.HOME = REAL_HOME;
    servers.forEach((s) => s.close());
    homes.forEach((h) => fs.rmSync(h, { recursive: true, force: true })); // temp dirs made by these tests
});

function tempHome() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "pml-"));
    homes.push(home);
    fs.mkdirSync(path.join(home, ".papermemory", "sock"), { recursive: true });
    process.env.HOME = home;
    return home;
}

function fakeLibrary(home, libraryId, label, extra = {}) {
    const server = net.createServer((socket) => {
        socket.on("data", (d) => {
            const req = JSON.parse(d.toString().split("\n")[0]);
            const result =
                req.op === "hello"
                    ? { protocolMin: 1, protocolMax: 1, libraryId, label, browser: "Chrome", paperCount: 3, ...extra }
                    : { echoedOp: req.op, auth: req.auth, protocol: req.protocol };
            socket.write(JSON.stringify({ id: req.id, ok: true, result }) + "\n");
        });
    });
    servers.push(server);
    return new Promise((resolve) => server.listen(socketPathFor(home, libraryId), resolve));
}

const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "bbbbbbbb-0000-4000-8000-000000000002";

test("auto with 0 libraries errors", async () => {
    tempHome();
    await assert.rejects(resolveLibrary("auto"), /no PaperMemory library is connected/);
    assert.deepEqual(await listLibraries(), []);
});

test("auto with 1 library resolves it; request round-trips auth and protocol", async () => {
    const home = tempHome();
    await fakeLibrary(home, ID_A, "Chrome · aaaaaa", { recommendedToolsVersion: "0.2.0" });
    const lib = await resolveLibrary("auto");
    assert.equal(lib.libraryId, ID_A);
    assert.deepEqual(Object.keys(lib).sort(), [
        "browser", "label", "libraryId", "paperCount", "protocolMax", "protocolMin", "recommendedToolsVersion",
    ]);
    assert.equal(lib.recommendedToolsVersion, "0.2.0");
    const r = await request(ID_A, "search_papers", { query: "x" }, { clientId: "c" }, { protocol: 1 });
    assert.deepEqual(r, { echoedOp: "search_papers", auth: { clientId: "c" }, protocol: 1 });
});

test("auto with 2 libraries errors listing labels; explicit id or prefix works", async () => {
    const home = tempHome();
    await fakeLibrary(home, ID_A, "Chrome · aaaaaa");
    await fakeLibrary(home, ID_B, "Firefox · bbbbbb");
    await assert.rejects(resolveLibrary("auto"), /Chrome · aaaaaa[\s\S]*Firefox · bbbbbb/);
    assert.equal((await resolveLibrary(ID_B)).label, "Firefox · bbbbbb");
    assert.equal((await resolveLibrary("aaaaaaaa")).libraryId, ID_A);
    await assert.rejects(resolveLibrary("zzzz"), /no connected PaperMemory library matches/);
});

test("a stale socket is unlinked when listing", async () => {
    const home = tempHome();
    const sockPath = socketPathFor(home, ID_A);
    const child = spawn(process.execPath, [
        "-e",
        `require("net").createServer().listen(${JSON.stringify(sockPath)}, () => console.log("up"))`,
    ], { stdio: ["ignore", "pipe", "ignore"] });
    await new Promise((resolve) => child.stdout.once("data", resolve));
    child.kill("SIGKILL");
    await new Promise((resolve) => child.on("exit", resolve));
    assert.ok(fs.existsSync(sockPath));
    assert.deepEqual(await listLibraries(), []);
    assert.ok(!fs.existsSync(sockPath));
});

test("a socket replaced between probe and unlink survives", async () => {
    const home = tempHome();
    const sockPath = socketPathFor(home, ID_A);
    const child = spawn(process.execPath, [
        "-e",
        `require("net").createServer().listen(${JSON.stringify(sockPath)}, () => console.log("up"))`,
    ], { stdio: ["ignore", "pipe", "ignore"] });
    await new Promise((resolve) => child.stdout.once("data", resolve));
    child.kill("SIGKILL");
    await new Promise((resolve) => child.on("exit", resolve));
    // A new host takes over the path after the probe was refused.
    const libs = await listLibraries({
        beforeUnlink: async () => {
            fs.renameSync(sockPath, sockPath + ".old"); // keeps the old inode alive, so the new one differs
            const replacement = net.createServer();
            servers.push(replacement);
            await new Promise((resolve) => replacement.listen(sockPath, resolve));
        },
    });
    assert.deepEqual(libs, []);
    assert.ok(fs.lstatSync(sockPath).isSocket(), "the new socket must not be unlinked");
});

test("negotiation picks the common version or names the side to update", () => {
    assert.equal(negotiate({ protocolMin: 1, protocolMax: 1 }), 1);
    assert.equal(negotiate({ protocolMin: 1, protocolMax: 3 }), 1);
    assert.throws(() => negotiate({ protocolMin: 2, protocolMax: 3 }), (e) =>
        e.code === "protocol-mismatch" && /papermemory-mcp@latest install/.test(e.message));
    assert.throws(() => negotiate({ protocolMin: 0, protocolMax: 0 }), (e) =>
        e.code === "protocol-mismatch" && /Update the PaperMemory extension/.test(e.message));
});

test("isOlderVersion compares major.minor.patch, ignores prereleases, and is false unless sure", () => {
    for (const [version, than] of [
        ["0.1.0", "0.1.1"],
        ["0.1.9", "0.2.0"],
        ["0.9.9", "1.0.0"],
        ["1.2.3", "1.10.0"], // numbers, not strings
        ["0.1.0-beta.1", "0.2.0"],
        ["0.1.0", "0.2.0-beta.1"],
    ]) {
        assert.equal(isOlderVersion(version, than), true, `${version} < ${than}`);
    }
    for (const [version, than] of [
        ["0.1.0", "0.1.0"],
        ["0.2.0", "0.1.9"],
        ["1.10.0", "1.2.3"],
        ["0.2.0-beta.1", "0.2.0"], // a prerelease counts as its release
        ["0.2.0", "0.2.0+build.5"],
        [undefined, "0.2.0"],
        ["0.1.0", undefined], // an extension too old to recommend a version
        ["0.1", "0.2.0"],
        ["v0.1.0", "0.2.0"],
        ["0.1.0", "latest"],
        [null, null],
        [1, "0.2.0"],
    ]) {
        assert.equal(isOlderVersion(version, than), false, `not ${version} < ${than}`);
    }
});

test("`libraries` command prints [] with no sockets", async () => {
    const dist = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
    const home = tempHome();
    const out = await new Promise((resolve) => {
        const c = spawn(process.execPath, [dist, "libraries"], { env: { ...process.env, HOME: home } });
        let s = "";
        c.stdout.on("data", (d) => (s += d));
        c.on("close", (code) => resolve({ s, code }));
    });
    assert.equal(out.code, 0);
    assert.deepEqual(JSON.parse(out.s), []);
});

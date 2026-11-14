import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import { socketPathFor } from "../host/host.mjs";
import { listLibraries, negotiate, request, resolveLibrary } from "../src/libraries.mjs";

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
    await fakeLibrary(home, ID_A, "Chrome · aaaaaa");
    const lib = await resolveLibrary("auto");
    assert.equal(lib.libraryId, ID_A);
    assert.deepEqual(Object.keys(lib).sort(), [
        "browser", "label", "libraryId", "paperCount", "protocolMax", "protocolMin",
    ]);
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

test("negotiation picks the common version or names the side to update", () => {
    assert.equal(negotiate({ protocolMin: 1, protocolMax: 1 }), 1);
    assert.equal(negotiate({ protocolMin: 1, protocolMax: 3 }), 1);
    assert.throws(() => negotiate({ protocolMin: 2, protocolMax: 3 }), (e) =>
        e.code === "protocol-mismatch" && /papermemory-mcp@latest install/.test(e.message));
    assert.throws(() => negotiate({ protocolMin: 0, protocolMax: 0 }), (e) =>
        e.code === "protocol-mismatch" && /Update the PaperMemory extension/.test(e.message));
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

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    FrameDecoder,
    HOST_VERSION,
    MAX_MESSAGE_BYTES,
    encodeFrame,
    remapId,
    socketPathFor,
    unmapId,
} from "../host/host.mjs";

const HOST = fileURLToPath(new URL("../host/host.mjs", import.meta.url));
const LIBRARY_ID = "123e4567-e89b-12d3-a456-426614174000";
const SECRET = "test-secret-do-not-log-0123456789";

// Short temp dir: macOS socket paths are limited to 104 bytes.
function tempHome() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "pmh-"));
}

const children = [];
after(() => children.forEach((c) => c.kill("SIGKILL")));

function startHost(home) {
    const child = spawn(process.execPath, [HOST], {
        env: { ...process.env, HOME: home },
        stdio: ["pipe", "pipe", "ignore"],
    });
    children.push(child);
    const decoder = new FrameDecoder();
    const inbox = [];
    const waiters = [];
    child.stdout.on("data", (chunk) => {
        for (const m of decoder.push(chunk)) {
            const w = waiters.shift();
            if (w) w(m);
            else inbox.push(m);
        }
    });
    const exited = new Promise((resolve) => child.on("exit", (code) => resolve(code)));
    return {
        child,
        exited,
        send: (m) => child.stdin.write(encodeFrame(m)),
        next: () =>
            new Promise((resolve, reject) => {
                if (inbox.length) return resolve(inbox.shift());
                const t = setTimeout(() => reject(new Error("timeout waiting for native message")), 5000);
                waiters.push((m) => {
                    clearTimeout(t);
                    resolve(m);
                });
            }),
    };
}

async function readyHost(home) {
    const host = startHost(home);
    host.send({ type: "hello", libraryId: LIBRARY_ID, label: "test" });
    const ready = await host.next();
    assert.equal(ready.type, "host-ready");
    return { host, ready };
}

function connect(home) {
    return new Promise((resolve, reject) => {
        const s = net.connect(socketPathFor(home, LIBRARY_ID), () => resolve(s));
        s.on("error", reject);
    });
}

function nextLine(socket) {
    return new Promise((resolve, reject) => {
        let buf = "";
        const t = setTimeout(() => reject(new Error("timeout waiting for socket line")), 5000);
        socket.on("data", function onData(d) {
            buf += d.toString("utf8");
            const i = buf.indexOf("\n");
            if (i >= 0) {
                clearTimeout(t);
                socket.off("data", onData);
                resolve(JSON.parse(buf.slice(0, i)));
            }
        });
    });
}

function cleanup(home, host) {
    host.child.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true }); // temp dir created by this test
}

test("HOST_VERSION is the package version: bump both at every release", () => {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(HOST_VERSION, pkg.version);
});

test("frames decode across split chunks at every byte boundary", () => {
    const a = { type: "x", text: "héllo ✓" };
    const b = { type: "y" };
    const bytes = Buffer.concat([encodeFrame(a), encodeFrame(b)]);
    for (let cut = 1; cut < bytes.length; cut++) {
        const d = new FrameDecoder();
        const out = [...d.push(bytes.subarray(0, cut)), ...d.push(bytes.subarray(cut))];
        assert.deepEqual(out, [a, b]);
    }
    const d = new FrameDecoder();
    const all = [];
    for (const byte of bytes) all.push(...d.push(Buffer.from([byte])));
    assert.deepEqual(all, [a, b]);
});

test("native 1 MiB limit applies when encoding and decoding", () => {
    assert.throws(() => encodeFrame({ pad: "a".repeat(MAX_MESSAGE_BYTES) }));
    const header = Buffer.alloc(4);
    header.writeUInt32LE(MAX_MESSAGE_BYTES + 1, 0);
    assert.throws(() => new FrameDecoder().push(header));
    encodeFrame({ pad: "a".repeat(MAX_MESSAGE_BYTES - 20) }); // just under: ok
});

test("remapId round-trips and socketPathFor stays within 103 bytes", () => {
    assert.equal(remapId(3, "a:b"), "3:a:b");
    assert.deepEqual(unmapId("3:a:b"), { conn: 3, id: "a:b" });
    const long = socketPathFor("/" + "h".repeat(60), LIBRARY_ID);
    assert.ok(path.basename(long).startsWith(LIBRARY_ID.slice(0, 12)));
    assert.equal(path.basename(long).length, 12 + ".sock".length);
    const short = socketPathFor("/h", LIBRARY_ID);
    assert.equal(path.basename(short), `${LIBRARY_ID}.sock`);
});

test("a bad libraryId makes the host exit 1", async () => {
    const home = tempHome();
    const host = startHost(home);
    host.send({ type: "hello", libraryId: "not-a-uuid", label: "x" });
    assert.equal(await host.exited, 1);
    fs.rmSync(home, { recursive: true, force: true });
});

test("args and auth are forwarded unchanged, ids are remapped both ways", async () => {
    const home = tempHome();
    const { host, ready } = await readyHost(home);
    assert.deepEqual(
        { min: ready.protocolMin, max: ready.protocolMax, pid: typeof ready.hostPid },
        { min: 1, max: 1, pid: "number" },
    );
    const sock = await connect(home);
    const args = { z: 1, a: { nested: [1, "two", null, { k: "ü" }] }, unknown: "kept" };
    const auth = { clientId: "c", secret: SECRET, sessionId: "s", projectKey: "pk" };
    sock.write(JSON.stringify({ id: "r1", op: "search_papers", args, auth, protocol: 1 }) + "\n");
    const fwd = await host.next();
    assert.equal(fwd.id, "1:r1");
    assert.equal(fwd.op, "search_papers");
    assert.equal(fwd.protocol, 1);
    assert.deepEqual(fwd.args, args);
    assert.deepEqual(fwd.auth, auth);
    host.send({ id: "1:r1", ok: true, result: { total: 0, papers: [] } });
    const reply = await nextLine(sock);
    assert.deepEqual(reply, { id: "r1", ok: true, result: { total: 0, papers: [] } });
    sock.destroy();
    cleanup(home, host);
});

test("client-closed is sent when a socket connection closes", async () => {
    const home = tempHome();
    const { host } = await readyHost(home);
    const sock = await connect(home);
    sock.write(JSON.stringify({ id: "a", op: "hello" }) + "\n");
    await host.next();
    sock.end();
    const closed = await host.next();
    assert.deepEqual(closed, { type: "client-closed", conn: 1 });
    cleanup(home, host);
});

test("a socket line over 1 MiB closes that connection only", async () => {
    const home = tempHome();
    const { host } = await readyHost(home);
    const bad = await connect(home);
    const closed = new Promise((resolve) => bad.on("close", resolve));
    bad.on("error", () => {});
    bad.write("x".repeat(MAX_MESSAGE_BYTES + 10));
    await closed;
    assert.deepEqual(await host.next(), { type: "client-closed", conn: 1 });
    const good = await connect(home);
    good.write(JSON.stringify({ id: "ok", op: "hello" }) + "\n");
    const fwd = await host.next();
    assert.equal(fwd.op, "hello");
    good.destroy();
    cleanup(home, host);
});

test("the log never contains the secret or args", async () => {
    const home = tempHome();
    const { host } = await readyHost(home);
    const sock = await connect(home);
    sock.write(
        JSON.stringify({
            id: "r1",
            op: "add_paper",
            args: { reason: "marker-args-text" },
            auth: { clientId: "c", secret: SECRET },
        }) + "\n",
    );
    await host.next();
    host.send({ id: "1:r1", ok: false, error: { code: "denied", message: SECRET } });
    await nextLine(sock);
    sock.destroy();
    host.child.stdin.end();
    await host.exited;
    const logPath = path.join(home, ".papermemory", "logs", `host-${LIBRARY_ID}.log`);
    const log = fs.readFileSync(logPath, "utf8");
    assert.ok(log.includes('"op":"add_paper"') && log.includes('"code":"denied"'));
    assert.ok(!log.includes(SECRET));
    assert.ok(!log.includes("marker-args-text"));
    assert.ok(!fs.existsSync(socketPathFor(home, LIBRARY_ID)), "socket unlinked on exit");
    fs.rmSync(home, { recursive: true, force: true });
});

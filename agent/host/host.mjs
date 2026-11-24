// PaperMemory native host. Browser-launched hub for one Library (see CONTEXT.md, Agent access).
// Node built-ins only. It only forwards: it never inspects, validates or logs `args` or `auth`.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const HOST_VERSION = "0.1.0";
export const PROTOCOL_MIN = 1;
export const PROTOCOL_MAX = 1;
export const MAX_MESSAGE_BYTES = 1024 * 1024;
const LIBRARY_ID_RE = /^[0-9a-f-]{36}$/;
const MAX_SOCKET_PATH_BYTES = 103; // macOS sun_path is 104 including the NUL

/** 4-byte little-endian length + UTF-8 JSON. Throws when the payload exceeds 1 MiB. */
export function encodeFrame(message) {
    const payload = Buffer.from(JSON.stringify(message), "utf8");
    if (payload.length > MAX_MESSAGE_BYTES) {
        throw new Error("message too large");
    }
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    return Buffer.concat([header, payload]);
}

/** Stateful decoder: push chunks, get complete messages. Throws on a frame over 1 MiB. */
export class FrameDecoder {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    push(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        const messages = [];
        while (this.buffer.length >= 4) {
            const length = this.buffer.readUInt32LE(0);
            if (length > MAX_MESSAGE_BYTES) {
                throw new Error("frame too large");
            }
            if (this.buffer.length < 4 + length) break;
            const payload = this.buffer.subarray(4, 4 + length);
            this.buffer = this.buffer.subarray(4 + length);
            messages.push(JSON.parse(payload.toString("utf8")));
        }
        return messages;
    }
}

export function safeName(libraryId) {
    return String(libraryId).replace(/[^A-Za-z0-9_-]/g, "_");
}

/** `<home>/.papermemory/sock/<safeName>.sock`; the name is cut to 12 chars when the path is too long. */
export function socketPathFor(home, libraryId) {
    const dir = path.join(home, ".papermemory", "sock");
    let name = safeName(libraryId);
    if (Buffer.byteLength(path.join(dir, `${name}.sock`)) > MAX_SOCKET_PATH_BYTES) {
        name = name.slice(0, 12);
    }
    return path.join(dir, `${name}.sock`);
}

export function remapId(conn, id) {
    return `${conn}:${id}`;
}

/** Inverse of `remapId`; `conn` is numeric so the first colon separates it. */
export function unmapId(remapped) {
    const s = String(remapped);
    const i = s.indexOf(":");
    if (i < 0) return null;
    return { conn: Number(s.slice(0, i)), id: s.slice(i + 1) };
}

function main() {
    const home = os.homedir();
    const root = path.join(home, ".papermemory");
    const sockDir = path.join(root, "sock");
    const logDir = path.join(root, "logs");
    for (const dir of [root, sockDir, logDir]) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        fs.chmodSync(dir, 0o700);
    }

    let libraryId = null;
    let sockPath = null;
    let sockIno = null;
    let server = null;
    let logFd = null;
    let nextConn = 0;
    const conns = new Map(); // conn -> socket

    function log(entry) {
        if (logFd === null) return;
        try {
            const { conn, id, op, ok, code } = entry;
            const line = { time: new Date().toISOString(), conn, id, op, ok, code };
            fs.writeSync(logFd, JSON.stringify(line) + "\n");
        } catch {
            // logging must never break forwarding
        }
    }

    function shutdown(code) {
        try {
            if (sockPath && sockIno !== null && fs.statSync(sockPath).ino === sockIno) {
                fs.unlinkSync(sockPath);
            }
        } catch {
            // already gone
        }
        process.exit(code);
    }

    function sendNative(message) {
        process.stdout.write(encodeFrame(message));
    }

    function onHello(msg) {
        if (typeof msg.libraryId !== "string" || !LIBRARY_ID_RE.test(msg.libraryId)) {
            shutdown(1);
            return;
        }
        libraryId = msg.libraryId;
        logFd = fs.openSync(path.join(logDir, `host-${libraryId}.log`), "a", 0o600);
        sockPath = socketPathFor(home, libraryId);
        try {
            fs.unlinkSync(sockPath); // newest host wins
        } catch {
            // nothing to replace
        }
        server = net.createServer(onConnection);
        server.on("error", () => shutdown(1));
        server.listen(sockPath, () => {
            fs.chmodSync(sockPath, 0o600);
            sockIno = fs.statSync(sockPath).ino;
            sendNative({
                type: "host-ready",
                version: HOST_VERSION,
                protocolMin: PROTOCOL_MIN,
                protocolMax: PROTOCOL_MAX,
                hostPid: process.pid,
            });
        });
    }

    function onConnection(socket) {
        const conn = ++nextConn;
        conns.set(conn, socket);
        let pending = Buffer.alloc(0);
        socket.on("data", (chunk) => {
            pending = Buffer.concat([pending, chunk]);
            let nl;
            while ((nl = pending.indexOf(0x0a)) >= 0) {
                const line = pending.subarray(0, nl);
                pending = pending.subarray(nl + 1);
                if (line.length > MAX_MESSAGE_BYTES) return socket.destroy();
                if (!forward(conn, socket, line)) return socket.destroy();
            }
            if (pending.length > MAX_MESSAGE_BYTES) socket.destroy();
        });
        socket.on("error", () => {});
        socket.on("close", () => {
            conns.delete(conn);
            try {
                sendNative({ type: "client-closed", conn });
            } catch {
                // stdout closed: we are exiting anyway
            }
        });
    }

    function forward(conn, socket, line) {
        let req;
        try {
            req = JSON.parse(line.toString("utf8"));
        } catch {
            return false;
        }
        if (!req || typeof req !== "object" || typeof req.id !== "string") return false;
        const clientId = req.id;
        const out = { ...req, id: remapId(conn, clientId) };
        try {
            sendNative(out);
        } catch {
            return false;
        }
        log({ conn, id: clientId.slice(0, 64), op: String(req.op).slice(0, 64) });
        return true;
    }

    function onReply(msg) {
        const parsed = unmapId(msg.id);
        if (!parsed) return;
        const socket = conns.get(parsed.conn);
        log({
            conn: parsed.conn,
            id: parsed.id.slice(0, 64),
            ok: msg.ok,
            code: msg.error && msg.error.code,
        });
        if (!socket) return; // connection closed meanwhile
        socket.write(JSON.stringify({ ...msg, id: parsed.id }) + "\n");
    }

    const decoder = new FrameDecoder();
    process.stdin.on("data", (chunk) => {
        let messages;
        try {
            messages = decoder.push(chunk);
        } catch {
            shutdown(1);
            return;
        }
        for (const msg of messages) {
            if (libraryId === null) {
                if (!msg || msg.type !== "hello") return shutdown(1);
                onHello(msg);
            } else if (msg && msg.type === "hello") {
                // duplicate hello: ignored
            } else if (msg && typeof msg.id === "string") {
                onReply(msg);
            }
        }
    });
    process.stdin.on("end", () => shutdown(0));
    process.on("SIGTERM", () => shutdown(0));
    process.on("SIGINT", () => shutdown(0));
}

// Run only as the host program itself, not when imported (tests) or bundled into the CLI.
const isEntry = (() => {
    try {
        return path.basename(fs.realpathSync(process.argv[1])) === "host.mjs";
    } catch {
        return false;
    }
})();
if (isEntry) main();

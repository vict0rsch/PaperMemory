import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { MAX_MESSAGE_BYTES, socketPathFor } from "../host/host.mjs";

export const PROTOCOL_MIN = 1;
export const PROTOCOL_MAX = 1;

const DEFAULT_TIMEOUT_MS = 15_000;
const LONG_TIMEOUT_MS = 130_000;
const PROBE_TIMEOUT_MS = 3_000;
const LONG_OPS = new Set([
    "pair",
    "add_paper",
    "attach_paper",
    "add_tags",
    "append_note",
    "flag_for_deletion",
    "delete_paper",
]);

function sockDir() {
    return path.join(os.homedir(), ".papermemory", "sock");
}

export function opError(code, message) {
    return Object.assign(new Error(message), { code });
}

// One request per connection: connect, write one NDJSON line, read one line.
function requestOnSocket(sockPath, op, args, auth, { protocol, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const socket = net.connect(sockPath);
        let buf = Buffer.alloc(0);
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            fn(value);
        };
        const timer = setTimeout(
            () => finish(reject, opError("timeout", `PaperMemory did not answer ${op} in time`)),
            timeoutMs,
        );
        socket.on("connect", () => {
            const req = { id, op, args: args ?? {} };
            if (auth) req.auth = auth;
            if (protocol !== undefined) req.protocol = protocol;
            socket.write(JSON.stringify(req) + "\n");
        });
        socket.on("data", (chunk) => {
            buf = Buffer.concat([buf, chunk]);
            const nl = buf.indexOf(0x0a);
            if (nl < 0) {
                if (buf.length > MAX_MESSAGE_BYTES) finish(reject, opError("internal", "reply too large"));
                return;
            }
            let reply;
            try {
                reply = JSON.parse(buf.subarray(0, nl).toString("utf8"));
            } catch {
                return finish(reject, opError("internal", "invalid reply from PaperMemory"));
            }
            if (reply.ok) return finish(resolve, reply.result);
            const e = reply.error || {};
            finish(reject, opError(e.code || "internal", e.message || "PaperMemory returned an error"));
        });
        socket.on("error", (err) => finish(reject, err));
        socket.on("close", () => finish(reject, opError("internal", "connection closed before a reply")));
    });
}

/** Send one op to a Library. `opts.protocol` is the negotiated version; `opts.timeoutMs` overrides the default. */
export function request(libraryId, op, args, auth, opts = {}) {
    const timeoutMs =
        opts.timeoutMs ?? (LONG_OPS.has(op) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
    const sockPath = socketPathFor(os.homedir(), libraryId);
    return requestOnSocket(sockPath, op, args, auth, { protocol: opts.protocol, timeoutMs });
}

/** Live Libraries, probed with `hello` (never polled); stale sockets are unlinked (only if still the probed file).
 * `hooks.beforeUnlink(sockPath)` is a test seam between the probe and the unlink. */
export async function listLibraries(hooks = {}) {
    let names;
    try {
        names = fs.readdirSync(sockDir()).filter((n) => n.endsWith(".sock"));
    } catch {
        return [];
    }
    const probes = names.map(async (name) => {
        const sockPath = path.join(sockDir(), name);
        let probed = null;
        try {
            probed = fs.lstatSync(sockPath);
        } catch {
            return null; // gone
        }
        try {
            const h = await requestOnSocket(sockPath, "hello", {}, null, {
                timeoutMs: PROBE_TIMEOUT_MS,
            });
            return {
                libraryId: h.libraryId,
                label: h.label,
                browser: h.browser,
                paperCount: h.paperCount,
                protocolMin: h.protocolMin,
                protocolMax: h.protocolMax,
            };
        } catch (err) {
            if (err.code === "ECONNREFUSED" || err.code === "ENOENT") {
                try {
                    await hooks.beforeUnlink?.(sockPath);
                    const now = fs.lstatSync(sockPath);
                    if (now.isSocket() && now.dev === probed.dev && now.ino === probed.ino) {
                        fs.unlinkSync(sockPath);
                    }
                } catch {
                    // already gone
                }
            }
            return null;
        }
    });
    return (await Promise.all(probes)).filter(Boolean);
}

/** `auto` needs exactly one live Library; otherwise `arg` is a libraryId or a unique prefix of one. */
export async function resolveLibrary(arg = "auto") {
    const libs = await listLibraries();
    const labels = libs.map((l) => `${l.label} (${l.libraryId})`).join(", ");
    if (arg === "auto") {
        if (libs.length === 0) throw new Error("no PaperMemory library is connected");
        if (libs.length > 1) {
            throw new Error(`several PaperMemory libraries are connected, name one: ${labels}`);
        }
        return libs[0];
    }
    const matches = libs.filter((l) => l.libraryId.startsWith(arg));
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
        throw new Error(`no connected PaperMemory library matches "${arg}"; connected: ${labels || "none"}`);
    }
    throw new Error(`"${arg}" matches several PaperMemory libraries: ${labels}`);
}

/** Highest protocol version both sides support, or a `protocol-mismatch` error naming the side to update. */
export function negotiate(hello) {
    if (hello.protocolMax < PROTOCOL_MIN) {
        throw opError("protocol-mismatch", "Update the PaperMemory extension");
    }
    if (hello.protocolMin > PROTOCOL_MAX) {
        throw opError(
            "protocol-mismatch",
            "Run `npx -y papermemory-mcp@latest install`",
        );
    }
    return Math.min(hello.protocolMax, PROTOCOL_MAX);
}

export async function libraries() {
    process.stdout.write(JSON.stringify(await listLibraries(), null, 2) + "\n");
}

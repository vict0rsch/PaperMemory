# Native-messaging spike findings (issue #357)

Throwaway spike validating design M2 of `research/agentic-integrations.md` (native messaging + local MCP companion). Run 2026-11-12 on one Mac. The prototype lived in `spike/` and will be deleted; this file keeps what the design doc needs.

## TL;DR

- Verdict: native messaging as the hub between local agents and the PM extension is viable on macOS for Chrome and Firefox. Every automated check passed (23 of 23), plus a manual run in real Google Chrome.
- The extension holds one `runtime.connectNative` port. It survived 65-minute idles (and a real-Chrome idle of more than 8 h) with no service-worker restart and no disconnect.
- Recovery works: host SIGKILL reconnects in about 2 s, browser quit removes the socket, and relaunch with no UI brings the host back in 0.5 to 1.1 s with the same libraryId.
- One Chrome-only caveat: after the user grants optional `nativeMessaging`, `chrome.runtime.connectNative` is undefined in the already-running service worker. The design must force a SW restart after the grant. Firefox is unaffected.
- Still open: pairing/auth (the spike had none), Brave, Windows/Linux, Snap/Flatpak.

## Environment

- macOS (Darwin 25.5), Apple Silicon Homebrew layout (`/opt/homebrew`).
- Chromium: Chrome for Testing 142 (`--load-extension`, temp `--user-data-dir`). Real Google Chrome for the manual run (version not recorded).
- Firefox Developer Edition 146, unsigned XPI in a temp profile. Release Firefox would need a signed build, and `web-ext run` temporary add-ons do not survive a restart, so it was not used.
- Note: the spike extension was MV3 on Firefox too, so "event page" below refers to it. PaperMemory's real Firefox build is MV2 with a persistent background page (see ADR 0002).
- Host ran on node v26.8.2, then v25.2.1 after a re-install recorded a different node. Both fine. Minimum enforced by the wrapper: node 18.
- Harness: puppeteer-core (CDP for Chrome, WebDriver BiDi for Firefox).

## Results

| Check | Browser | Result | Evidence |
|---|---|---|---|
| install-durability (5 cases) | n/a (wrapper run with GUI `PATH=/usr/bin:/bin:/usr/sbin:/sbin`) | PASS 5/5 | minimal PATH works; recorded node missing falls back to `/opt/homebrew/bin/node`; homebrew hidden falls back to newest nvm node; `selfheal` rewrites a deleted wrapper |
| Connect after enabling Agent access | CfT, Firefox | PASS | `idle-chromium-rerun.txt`, `idle-firefox.txt` |
| ping, add_paper + search | CfT, Firefox | PASS | same logs |
| 65-min idle, same host pid | CfT | PASS | `swStartedAt` unchanged, same host pid, 0 disconnects during idle (rerun) |
| 65-min idle | Firefox | PASS | event page not restarted, no disconnect |
| Host SIGKILL, extension reconnects | CfT | PASS | 2.1 s (both runs) |
| Host SIGKILL, extension reconnects | Firefox | PASS | 1.6 s |
| Browser quit, socket removed | CfT, Firefox | PASS | library not live after quit |
| Relaunch with no UI, host returns | CfT | PASS | 0.5 s (rerun; 0.7 s first run), same libraryId |
| Relaunch with no UI, host returns | Firefox | PASS | 1.1 s |
| Real optional-permission grant connects without reload | Firefox | PASS | `permission-added` then `connect`, no reload (`webextOptionalPermissionPrompts=false` auto-grants the real `permissions.request`) |
| Routing (4 checks) | 2 CfT profiles + Firefox | PASS 4/4 | 3 distinct libraries; `auto` refuses with more than 1; targeted `add_paper` lands only in the chosen library |
| Load unpacked, optional-permission prompt | real Chrome (manual) | PASS | ID `olpoofonfclfgdadmfabgimbeamljfbp` derived from manifest `key` |
| Connect right after the grant, no reload | real Chrome (manual) | **FAIL** | `connectNative` undefined in running SW, see finding 1 |
| Long idle | real Chrome (manual) | PASS | SW from 14:35 until user quit more than 8 h later, no restart, no disconnect, 65 min gaps without traffic |
| Cmd-Q, then reopen with no UI | real Chrome (manual) | PASS | socket removed, `libraries` empty; same libraryId back, connect 0.06 s after `sw-start` (`startup` event) |
| Toggle off / on | real Chrome (manual) | PASS | off: library gone; on: reconnected immediately (permission already granted) |

Note: the Chromium lifecycle check used a test variant with `nativeMessaging` as a required permission, because the optional-permission prompt is native UI that puppeteer cannot click. The first Chromium run was disturbed by an external ping at 21 min; the rerun was clean and is the one counted.

## Findings and design implications

1. **Chrome: optional `nativeMessaging` is not usable in the running SW after the grant.** Real Chrome log: 14:34:29.547 `permission-added`, 14:34:29.829 `connect-unavailable` (`typeof chrome.runtime.connectNative !== "function"`), 14:35:14.848 `sw-start`, then `connect`. The connect happened about 45 s later only because Chrome happened to restart the SW. Firefox connects immediately.
   Implication for the design: on Chrome, after `permissions.onAdded` for `nativeMessaging`, force a SW restart (`chrome.runtime.reload()` or equivalent) and connect from the fresh SW start. The ADR must specify this, and the options UI must tolerate the brief reload. A `connect-unavailable` branch with retry is not enough on its own.

2. **An open native port keeps the MV3 SW (Chrome) and event page (Firefox) alive.** No restarts over 65 min (both browsers) and over 8 h (real Chrome), including 65 min with no traffic. The 1-minute `alarms` keepalive that calls `ensureConnected` was present but never needed to reconnect during idle.
   Implication for the design: the hub model needs no extra keep-alive tricks on the tested versions. Keep the alarm as a cheap safety net and keep reconnect logic idempotent (`if (port) return`).

3. **The host dies with the browser and returns without UI.** Browser quit gives stdin EOF, so the host removes its socket. On relaunch the `startup` event or the SW top-level start reconnects (0.06 s after `sw-start` in real Chrome; 0.5 to 1.1 s measured from launch in the harness), with the same libraryId because it is stored in `storage.local`.
   Implication for the design: libraryId is the stable routing key. Reconnect on both `onStartup` and SW top-level start. Do not rely on `onInstalled`: `--load-extension` refires it on every launch, and real installs fire it once.

4. **Install durability needs a node-finding wrapper.** GUI-launched browsers get `PATH=/usr/bin:/bin:/usr/sbin:/sbin`. The recorded node is `process.execPath`, which on Homebrew is a versioned Cellar path that rots on `brew upgrade node`.
   Implication for the design: the host manifest must point at a shell wrapper, not at node. Ship the discovery order in "How the spike was built". `selfheal` (run from the MCP CLI) must be able to rewrite the wrapper and manifests, and it was verified for a deleted wrapper.

5. **Chromium with a non-default `--user-data-dir` reads host manifests only from `<user-data-dir>/NativeMessagingHosts/`.** With the manifest only in the global dir the extension got "Specified native messaging host not found." Normal profiles in the default dir use the global location. Firefox always uses the per-user Mozilla dir.
   Implication for the design: the installer should write the global manifests by default and document or detect custom profile dirs (users running custom `--user-data-dir`, CfT, Chromium forks) as an extra step.

6. **Multiple libraries coexist.** Each browser profile (and each browser) owns its own socket named by libraryId, so routing is by socket file. `auto` refusing with more than 1 library worked as intended.
   Implication for the design: the MCP server needs an explicit `list_libraries` tool and a per-call library argument, with `auto` only when exactly one is live. Labels (browser plus profile name) help the agent pick.

7. **Probing leaks into the user's real library.** During testing, `hello` probes from parallel checks reached the user's real Chrome library, because every socket under `~/.papermemory/sock/` answers anyone who can open it.
   Implication for the design: the real MCP server should discover libraries lazily (on demand, per request) and not poll. Combined with finding 8, probing should be done only after pairing.

8. **No authentication in the spike.** Protection was filesystem permissions only (`~/.papermemory` 0700, socket 0600). Any process running as the same user could read and write the library.
   Implication for the design: a pairing secret or per-client authorization is still required, as the main design doc already concludes (reads included). Not validated here.

9. **Node version drift is harmless.** The host ran on v26.8.2 and v25.2.1 with no change in behavior.
   Implication for the design: only a floor (node 18 here) is needed, not a pinned version. The host uses only built-ins (`fs`, `net`, `os`, `path`).

10. **MCP `serve` was only smoke-tested** (initialize, tools/list, clean error with no browser). Real agent clients (Claude Code, Cursor, etc.) were not driven.
    Implication for the design: treat the three tools (`list_libraries`, `search_papers`, `add_paper`) as shape only, not as validated behavior.

## Not tested and open risks

- Brave: not tested (not installed on this Mac). The installer writes the Brave manifest dir, but it is unverified.
- Windows (registry-based host registration, `.bat` wrapper, named pipes instead of Unix sockets) and Linux (manifest dirs, socket location, `XDG_RUNTIME_DIR`): not tested.
- Snap and Flatpak browsers: sandboxes may block reading host manifests or running the wrapper. Not tested.
- Release Firefox needs a signed add-on; only an unsigned XPI in Developer Edition was exercised. The `webextOptionalPermissionPrompts=false` pref bypassed the Firefox grant prompt, so the real prompt UX is unverified there.
- Long idle was tested on Chrome 142 (CfT), Firefox 146 and one real Chrome only. Browser updates that change SW or event-page lifetime could break it.
- Pairing/auth is undesigned. Concurrent clients are multiplexed by id remapping but never load-tested.
- Large payloads: native messaging caps host-to-extension messages at 1 MB and extension-to-host at 4 GB, but chunking for big libraries was not exercised.
- Behavior during Chrome updates, extension updates and host-file replacement while a host is running was not tested.

## How the spike was built

Layout: `extension/` (MV3 test extension, no build), `host/host.mjs`, `cli/papermemory-mcp.mjs` plus `cli/lib.mjs`, `checks/*.mjs`. Native host name `org.papermemory.agent_spike`.

**Chain:** agent (MCP stdio) -> `papermemory-mcp serve` -> NDJSON over Unix socket -> host (browser-launched) -> length-prefixed JSON on stdio -> extension background (`runtime.connectNative`).

**Install (`papermemory-mcp install`)**
- Creates `~/.papermemory/{bin,sock,logs}` at 0700 and copies `host.mjs` to `~/.papermemory/bin/` (copy only if the sha256 differs).
- Writes the shell wrapper `~/.papermemory/bin/pm-agent-host` (0755), recording `process.execPath` at install time.
- Writes `<name>.json` into `NativeMessagingHosts/` under each detected browser root in `~/Library/Application Support/`: Google/Chrome, Google/Chrome for Testing, Chromium, BraveSoftware/Brave-Browser, Mozilla. Manifest: `{name, description, path: <wrapper>, type: "stdio"}` plus `allowed_origins: ["chrome-extension://<id>/"]` (Chromium) or `allowed_extensions: ["<gecko id>"]` (Firefox).
- Records state in `~/.papermemory/install.json` (recorded node, manifests written, dirs it created) so `uninstall` removes exactly those. `selfheal` re-runs install in repair mode: it keeps the recorded node only if it still exists, and rewrites any missing or changed wrapper, host copy or manifest.

**Wrapper node discovery (first usable wins).** A candidate is usable if it is executable, not in a test-only skip list, and `node -e` confirms major version >= 18. Order:
1. recorded node (from install)
2. `/opt/homebrew/bin/node`
3. `/usr/local/bin/node`
4. newest `~/.nvm/versions/node/v*/bin/node` (`sort -V | tail -1`)
5. `${VOLTA_HOME:-~/.volta}/bin/node`
6. newest fnm node: `~/Library/Application Support/fnm/node-versions/v*/installation/bin/node`, then `~/.local/share/fnm/...`, then `~/.fnm/...`
7. `command -v node`

It then appends a line to `~/.papermemory/logs/wrapper.log` and `exec`s `node host.mjs "$@"`. If none is usable it logs an error and exits 1. Test-only env overrides `PM_AGENT_RECORDED_NODE` and `PM_AGENT_SKIP_NODES` simulate rot and should not ship.

**Native-messaging framing.** 4-byte little-endian length plus UTF-8 JSON, in both directions on stdio. The host accumulates stdin chunks and parses complete frames in a loop.

**Handshake.** Extension opens the port and sends `{type:"hello", libraryId, browser, label}`. The host ignores duplicate hellos. The host then creates the socket and sends `{type:"host_ready", pid, node, socket}`. Identity: `libraryId` is `crypto.randomUUID()` stored in `storage.local`; `browser` comes from `runtime.getBrowserInfo` (Firefox), `navigator.brave.isBrave()`, or `userAgentData` brands; `label` is `"<browser> · <profileName or first 6 chars of libraryId>"`.

**Socket path scheme.** `~/.papermemory/sock/<safeName(libraryId)>.sock`; dir 0700, socket chmod 0600. `safeName` replaces anything outside `[A-Za-z0-9_-]` with `_`. If the path exceeds 103 bytes (macOS `sun_path` is 104 incl. NUL) the name is truncated to 12 chars. The host unlinks any existing file at that path first (newest host wins). On shutdown it unlinks the socket only if its inode still matches the one it created, so a replaced socket is not removed by an older host. The host exits on stdin end, SIGTERM and SIGINT. Host log: `~/.papermemory/logs/host-<libraryId>.log`.

**Socket protocol.** Newline-delimited JSON. Request `{id, op, args}`, reply `{id, ok, result|error}`. The host remaps client ids to a global counter (`inflight` map: internal id -> client, client id, op), forwards `{id, op, args}` to the extension, and maps replies back. In-flight entries are dropped when the client closes. The `hello` reply is augmented with `host: {pid, node, socket}`. Client helper: connect, write one request, read one line, 5 s timeout (3 s for probes).

**Library discovery (CLI).** `listLibraries` reads `*.sock` in `sock/`, sends `hello` to each, and unlinks sockets that give ECONNREFUSED or ENOENT. `resolveLibrary` accepts `auto` (exactly one live, else an error listing all) or a libraryId prefix that must match exactly one.

**Extension lifecycle and reconnect/backoff**
- `nativeMessaging` is an optional permission. An options toggle sets `storage.local.enabled` and calls `permissions.request`. `isEnabled()` = `enabled` flag and `permissions.contains(nativeMessaging)`.
- `ensureConnected(reason)` is idempotent: returns if `port` exists, if not enabled, or (after the awaits) if a port appeared. If `typeof runtime.connectNative !== "function"` it logs `connect-unavailable` and returns (the Chrome finding).
- Triggers: SW top-level start, `onInstalled`, `onStartup`, `storage.onChanged` (enabled on), `permissions.onAdded`, and an alarm `pm-keepalive` every 1 min. `permissions.onRemoved` and enabled-off call `port.disconnect()` and clear the timer.
- On `onDisconnect`: clear `port`, record `lastError`, set status disconnected, then `scheduleReconnect`. Backoff starts at 1000 ms, doubles per attempt, caps at 60000 ms. It resets to 1000 ms on `host_ready`, and also on disconnect if the port lived more than 10 s.
- Replies are posted from a per-message handler with try/catch; unknown ops return `{ok:false, error}`. Ops in the spike: `hello`, `ping`, `search`, `add_paper`, `get_log`.
- Diagnostics: a capped (500 entries) lifecycle log in `storage.local.log` with serialized read-modify-write. Event names: `sw-start`, `installed`, `startup`, `connect`, `host-ready`, `msg`, `disconnect`, `reconnect-scheduled`, `permission-added`, `connect-unavailable`.
- Chrome extension ID is pinned by a `key` in the manifest, which `allowed_origins` needs. Firefox uses `browser_specific_settings.gecko.id`.

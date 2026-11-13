---
status: proposed
---

# Native messaging, with the browser-launched host as hub, for local agent access

Issue #357 asks for local AI agents (Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi) to read
and add papers, and to keep a bibliography per **Project** across sessions. PaperMemory is
client-side only and an MV3 extension cannot listen on a port, so something local must connect
the agent and the extension. We decided that, while **Agent access** is on, PaperMemory holds
an open `runtime.connectNative` port to a browser-launched **Native host**; that host is the
single hub for its **Library** and listens on a user-only Unix socket that each agent-launched
**MCP server** (`papermemory-mcp`) connects to. A one-time `npx -y papermemory-mcp install`
copies the host and server locally and registers everything. Research:
`research/agentic-integrations.md`; validation: `research/spike-findings.md` (macOS, Chrome
and Firefox, all lifecycle checks passed, including 65 min and 8 h idles).

## Considered options

- **Outbound WebSocket from PaperMemory to a localhost listener owned by the MCP server.**
  Rejected: nothing outside the browser can wake a sleeping service worker, so PaperMemory
  would poll a usually-closed port forever (≥30 s alarm granularity, up to 30 s first-call
  latency); concurrent agent sessions would contend for one port (hub election); Chrome's Local
  Network Access rules for extensions → loopback are undocumented; and a loopback listener is
  reachable by any web page, unlike a user-only socket.
- **Both transports behind one contract.** Rejected: doubles the lifecycle and store-review
  test matrix for no v1 benefit. The PaperMemory operation handlers stay transport-agnostic, so
  adding one later stays cheap.
- **WebMCP (`document.modelContext`).** Rejected for v1: origin trial in Chrome, prototype only
  in Firefox, no documented support for tools registered by extension pages, and it does not
  reach CLI agents at all.
- **Gist "inbox" file.** Rejected for v1: v1 targets local agents only; it adds sync latency and
  requires Gist sync. Remains the candidate for cloud agents later.
- **`externally_connectable` or a dedicated integration page.** Rejected: Firefox does not
  support web-page → extension messaging, and neither path is reachable from a CLI agent.
- **Agent-declared Project identifiers.** Rejected: a Project id passed as a tool argument is
  model-controlled, so a prompt-injected agent could claim another Project of the same client
  and delete its papers. The MCP server derives the **Project folder** from the client (MCP
  roots, else its own working directory); through tool arguments the model can only set a
  display label or opt out (but see the residual risk below for agents with a shell).
- **Same-session-only deletion.** Rejected as the main model: the maintainer wants an agent to
  maintain a per-project bibliography over many sessions. It remains the rule for additions
  made without a Project.

## Consequences

- **Chrome optional-permission quirk.** `nativeMessaging` is an *optional* permission (no new
  install-time warning for existing users). In Chrome, after the grant,
  `chrome.runtime.connectNative` is undefined in the already-running service worker (observed:
  connected only ~45 s later, after an incidental restart). PaperMemory therefore saves the
  enable intent and calls `chrome.runtime.reload()` from `permissions.onAdded` when
  `connectNative` is not a function, and connects from the fresh start. The reload closes every
  extension page and invalidates content scripts in open tabs, so the worker records a reopen
  flag first and the fresh worker reopens the options page. The options page starts the
  enable write and then requests the permission in the same synchronous turn, because Firefox
  only honours a permission request inside the user gesture. A refused prompt turns the setting
  back off. Firefox needs no reload. Only manual acceptance exercises the real Chrome grant;
  automated tests use a test build where the permission is required.
- **Persistent background while enabled.** The open port keeps Chrome's service worker alive
  for as long as Agent access is on (PaperMemory's Firefox build is MV2 with a persistent
  background page, which needs no keep-alive). Accepted: it is opt-in. A
  1-minute alarm calls the idempotent reconnect as a safety net.
- **Pairing and authorization live in PaperMemory.** The first request from an unknown client
  makes PaperMemory open its options page in a new tab on a pairing prompt naming the client
  (Zotero-10 style); **Allow** creates a per-client random secret returned once to the MCP
  server, which stores it in a 0600 file (written atomically, named by a hash of the client
  name, never by the raw name); **Deny** rejects. A pairing decision is accepted only for a
  pending, single-use, unguessable request id and only from the exact options tab PaperMemory
  opened for it, so content scripts (which share the extension id) and replays are ignored.
  PaperMemory stores only a SHA-256 hash and lists **Paired clients** with a **Revoke** button.
  Every operation is authorized at PaperMemory's operation boundary, not by the host, against
  fixed bounds (http/https URLs only, unknown arguments rejected, length caps, tag limits,
  per-client write rate limits, bounded queue, one pending pairing at a time). All writes go
  through one serialized queue with per-job deadlines; right before each job it re-checks
  that Agent access is on and the client is still authorized, and tag/note/delete mutations
  re-read the papers (`add_paper` relies on the pipeline's own reads). Agent tags may not use
  the `proj-` prefix, which is reserved for **Project tags**. Revoking a client or turning Agent access off cancels its queued jobs, and
  a closed agent connection drops its own (a job already running finishes). Operations never
  expose settings, the Gist PAT, backups or arbitrary storage keys; writes are limited to adding
  papers (forced **Review tag**, **Provenance**), attaching papers to a Project, adding tags,
  appending notes, applying a **Deletion flag**, and deleting **Own additions**.
- **Ownership is a capability, not a claim.** **Provenance** is written inside the pipeline
  from its own "new paper" outcome, so a duplicate (including a fuzzy match whose id changes)
  gains tags and Project membership but never Provenance. With a **Project**, an **Own
  addition** is a paper this **Paired client** added in the same Project, in any session; the
  **Project key** is an HMAC of the **Project folder** path under a per-install secret salt,
  held by the MCP server and never given to the model. Without a Project (home directory,
  filesystem root, an application bundle, a temporary directory, a client that gives no usable
  folder, or an explicit opt-out), ownership falls back to the **Agent session**:
  an opaque per-process id the model never sees. Provenance stores only hashes of these keys,
  so a synced Gist or an export does not reveal them. Another client in the same Project can
  only flag.
- **Projects are visible as tags.** Each Project gets a **Project tag** `proj-<slug>` fixed at
  its first add or attach (never on a read), so the user can filter a Project's bibliography
  in PaperMemory today; agents can list a Project's papers, attach existing papers to it (tag
  and membership only, no ownership), and export its BibTeX in the same format as the options
  page's tag export (papers without BibTeX are skipped and reported). A relabel changes only
  the display label. PaperMemory has no bulk tag rename, so users are told how to rename the
  tag by hand or through a JSON export/import, and that agents keep applying the original tag.
  Membership is keyed by a salted hash, so it is per machine; the tags travel with Gist sync.
- **The Native host only forwards.** It parses each line only to rewrite request ids per
  connection, passes requests (including credentials) through unchanged, never inspects them,
  and logs only ids, op names and outcomes. Its framing and handshake form a contract frozen
  separately from the operation protocol. The operation protocol is negotiated as a version
  range: additive changes do not bump it, the extension keeps the previous version for at least
  one release, and a no-overlap error names which side to update.
- **Accepted residual risk: same-user malware.** A malicious process running as the user can
  connect to the socket, read the client secret file or the salt, or read PaperMemory's storage
  files on disk directly. Neither transport defends against that (see *The Native Menace*,
  arXiv 2611.04291). The socket is not reachable from web pages, which is the exposure that
  matters.
- **Accepted residual risk: a prompt-injected agent with a shell.** All five target clients
  can run shell commands. An injected agent can therefore start `papermemory-mcp serve` from
  another folder under any client name, or read the salt and credential files, and then act
  as any paired client (it can read every credential file) in any Project: in the worst case
  it deletes any client's **Own additions**. The bound holds: it can delete only
  agent-added papers, never user-added ones, which it can only flag. "Not model-controllable" applies to tool arguments, not to an
  agent that escapes them through its shell.
- **Parsing needs a DOM.** 16 of 34 sources parse HTML with `DOMParser`, which Chrome's service
  worker lacks. On Chrome, agent-requested adds run the existing `addOrUpdatePaper` in an
  offscreen document (reason `DOM_PARSER`, warning-free `offscreen` permission), initialized
  like a content script (no downloads access, which offscreen documents lack). Offscreen
  documents only get `chrome.runtime`, so the background proxies their storage calls, only
  while the document exists (from just before it is created, since its initialization reads
  storage), only from that document, never returning sync credentials, backups or Agent access
  keys, and writing only the paper keys (other writes, such as backups, are dropped because
  other PaperMemory contexts, popup and content scripts, perform them). On Firefox the
  background is an MV2 page with a DOM, so the same ingest code runs there directly, after
  initializing state like a content script before each job, and no proxy exists; because a
  context never receives its own runtime messages, Agent access makes the Firefox background
  call its own message handler directly, so Sources that fetch through the background still
  work. A failure inside ingest reaches the agent only as a generic `failed`. The pipeline
  gains one optional hook that applies the agent's tags, Project membership and Provenance
  before each of its writes and reports whether the paper was new and when processing has
  finished, so later enrichment writes cannot drop them and the agent is answered only after
  the final write. On Firefox a job that misses its deadline cannot be aborted and may still
  complete later; the agent gets `timeout-may-complete`, and a late paper still carries the
  **Review tag** and **Provenance**, so it stays visible and deletable by its client.
- **Install durability and updates.** `install` copies a single-file bundled MCP server and
  the host (no runtime dependencies) into `~/.papermemory/bin/` with node-discovering shell
  wrappers (recorded path, Homebrew, `/usr/local`, nvm, Volta, fnm, `PATH`), because
  GUI-launched browsers and agents have a minimal `PATH` and recorded Homebrew paths rot on
  upgrade. Host manifests and agent configs point at those wrappers by absolute path, so agents
  never run `npx` at startup (no registry lookup, offline start, no automatic execution of a
  newly published version). Every `serve` start repairs wrappers and manifests from the local
  copy only. Updating is explicit: `npx -y papermemory-mcp@latest install` replaces the copy
  atomically, keeps the salt, and replaces PaperMemory's own agent entries; the options page
  says the agent tools are outdated when the installed copy is too old for the extension.
- **Multi-library routing.** Each profile's host names its socket after the `libraryId`
  (validated as a UUID and sanitized). The MCP server lists live Libraries on demand (never
  polls) and requires an explicit `libraryId` when more than one is connected.
- **Gist sync stays last-writer-wins.** Agent writes are ordinary writes followed by a push;
  an agent addition can be lost if another device pushes first, exactly like a user edit today.
  Accepted for v1 and documented for users.
- **Store policies.** Chrome Web Store listing and `docs/privacy-policy.md` must disclose that,
  when Agent access is on, library data is sent to local agent programs the user pairs (which
  may forward it to an AI provider). For Firefox, the feature is opt-in with explicit consent
  per Mozilla's add-on policies (including the changes effective 2026-12-01), and the manifest's
  data-collection declaration must reflect it before release.
- **Scope of support in v1.** Tested: macOS with Chrome and Firefox. Best-effort (manifests
  written, untested): Brave, Edge, Chromium. Unsupported: Snap/Flatpak-packaged browsers,
  browsers where policy blocks native messaging (managed machines), ChromeOS, and Windows/Linux
  until their installer paths are implemented and tested. Release Firefox requires the signed
  build (no unsigned testing path).

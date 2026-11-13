# Agentic integrations for PaperMemory (issue #357): merged research

Date: 2026-11-12. Merges two independent reports: **O** (Opus) and **C** (Codex). Primary sources for the conflicts in §3 were re-checked on 2026-11-12.

## Executive summary

- **Hard constraint (both):** an MV3 extension cannot listen on a port. It can only dial out (fetch/WebSocket), receive messages from other extensions or allow-listed pages, or launch a native host. Any agent outside the browser therefore needs **a local companion process** or **a shared remote store** (PM's Gist).
- **Zero-code today (both):** agents that drive the user's own browser profile with PM installed already trigger PM's automatic capture. What is missing is the `review` tag, provenance, and a read/tag API.
- **Real API (both):** a small local MCP companion that agents run, connected to PM by **native messaging** (C's #1) or an **outbound WebSocket from PM** (O's #1). Both work in Chrome and Firefox. They trade OS-level registration and a permission warning against pairing, port and keep-alive work.
- **Merged recommendation:** define one transport-agnostic, add-and-tag-first operation contract in PM. Ship it first over the **WebSocket relay** as a developer preview. Keep **native messaging** as the hardened transport if reconnect or Local Network Access issues show up. Add a **Gist inbox** for cloud agents (O). Treat a **dedicated integration page / WebMCP** as a watchlist item (C).
- **Prior art (both):** Zotero 10's authorized local API (Allow / Always Allow / Deny) is the consent model to copy. Hosted products (Readwise, Raindrop, and now Paperpile in beta) ship hosted MCP. PM has no backend, so that route is closed.
- **Security (both):** prompt injection is the main write risk. Default to add-only plus forced `review` tag, re-parse URLs with PM's own parsers, and add no delete or overwrite in v1. Native messaging is not a trust boundary against local malware (C, *The Native Menace*, arXiv 2611.04291).

Markers: **[V]** primary source read by at least one report (or by this merge); **[I]** inference or design judgment; **[S]** secondary source only. Provenance: **(both)**, **(O)**, **(C)**, **(merge)** = verified while merging.

---

## 1. Mechanisms

### M1. Passive capture and UI automation / CDP

- **How it works (both):** PM's `<all_urls>` content script detects and stores paper pages. Any agent driving the user's **real profile with PM installed** stores papers as a side effect: Claude in Chrome, Playwright MCP extension mode, Chrome DevTools MCP attached to the user's browser, and the ChatGPT browser extension [I]. Headless or fresh-profile agents (default Playwright MCP, browser-use, Stagehand, cloud browsers) do not [V, C: browser-use and Stagehand docs separate attach mode from a separate profile].
- **Three separate questions (C):** Does PM run in the agent's profile? Can the agent operate PM's UI? Can it call privileged PM operations? A yes to the first does not imply the others [I].
- **Operating PM's UI:**
  - Claude in Chrome's debugger tools fail on other extensions' pages ("Cannot access a chrome-extension:// URL of different extension") [S, O: claudeissues #16239, #45221].
  - CDP tools that own the browser can probably open `chrome-extension://<id>/…` in a tab [I, O, untested].
  - Chrome DevTools MCP has an optional Extensions category (install, list, reload, trigger action). `list_extensions` excludes Chrome Web Store installs [V, C: tool-reference.md], and there is no "evaluate in extension service worker" tool [V, O: developer.chrome.com/docs/devtools/agents/extensions; DevTools for Agents 1.0, 2026-05-19].
  - Since Chrome 136, `--remote-debugging-port` does not apply to the default profile [V, C: Chrome blog, 2025-03-17].
- **Chrome/Firefox:** Chromium only for the in-profile agents above. No mainstream in-profile Firefox agent exists [I, O]. Playwright's extension testing is Chromium-only [V, C].
- **Maturity:** Works today but brittle (both).
- **Examples:** Claude in Chrome (pilot 2025-08-26; Claude Code docs) [V, both]; Playwright MCP extension (approval or profile token) [V, both]; Chrome DevTools MCP [V, both]; ChatGPT desktop browser extension controlling existing Chrome/Edge/Brave tabs [V, C].
- **PM fit:** Free capture. An opt-in "agent session" toggle that auto-tags new papers `review` is a few lines of code (O). It offers no stable read/tag contract. For experiments, use the full-page memory view, not the popup, and confirm success only by reading back the stored paper and tag (C).

### M2. Native messaging + local MCP companion

- **How it works (both):** PM calls `runtime.connectNative("<host>")`. The browser spawns a registered binary that is listed in an OS manifest naming PM's extension ID. A companion exposes MCP (stdio or Streamable HTTP) to agents and forwards bounded operations to PM's background, which runs them through the existing `addOrUpdatePaper` pipeline.
- **Rendezvous caveat (C):** the browser launches the host, and the MCP client launches its own stdio process, so the two need local IPC (Unix socket or named pipe) [I]. Framing also differs: native messaging is length-prefixed, MCP stdio is newline-delimited [V, C: MCP spec 2026-07-28].
- **Chrome:** Since Chrome 105, an open `connectNative` port keeps the service worker alive. Reconnect in `onDisconnect` [V, both: SW lifecycle docs]. Install warning: "Communicate with cooperating native applications" [V, O]. **Optional permission:** Chrome's permissions API says "Most Chrome extension permissions can be specified as optional", and the exception list (debugger, declarativeNetRequest, devtools, geolocation, mdns, proxy, tts, ttsEngine) does not include `nativeMessaging` [V, merge: developer.chrome.com/docs/extensions/reference/api/permissions]. So it should be allowed as optional, but no page states so explicitly [I].
- **Firefox:** Supported. Uses `allowed_extensions` and a gecko ID; `nativeMessaging` can be optional; app→extension messages are capped at 1 MB [V, both: MDN, modified 2026-08-27]. An open port keeps the MV3 background alive (bug 1770696, Firefox 104) [S, O]. Firefox MV3 uses background scripts, not `service_worker` [V, C].
- **Maturity:** High; the API dates from 2013 (both).
- **Friction (both):** The user must install the extension, a companion binary or npm package, and a host manifest per browser and OS (plus a registry key on Windows). The host is blocked on ChromeOS and in some managed setups [I, O]. Packaging as a `.mcpb` bundle gives one-click install in Claude Desktop, but host registration still needs a post-install step [V/I, O]. Multiple profiles need explicit library selection [I, C].
- **Examples:** Claude Code ↔ Claude in Chrome native host (many 2026 reliability bug reports [S, O]; setup docs [V, C]); hangwin/mcp-chrome (12.5k stars, native bridge plus Streamable HTTP at 127.0.0.1:12306) [V, both]; jackwener/BrowserMCP (stdio → IPC → native host) [V, C]; `@mcp-b/native-server` [S, O].
- **Agents:** Any local MCP client: Claude Code/Desktop, Cursor, Codex CLI, and ChatGPT desktop, since OpenAI documents local stdio/HTTP MCP shared across desktop, CLI and IDE [V, C]. Cloud agents are not covered.
- **PM fit:** The most robust "real API" and cross-browser. Effort is medium-high. It adds an always-installed local component to a "client-side only" project (O). It should not copy the broad browser-control permissions of the example projects (C).

### M3. Outbound WebSocket from PM to a local relay

- **How it works (both):** The agent launches `papermemory-mcp` (via `npx`/`uvx`), which listens on `ws://127.0.0.1:<port>`. PM dials **out** to it and receives tool calls. This is the Playwright MCP extension pattern: a local relay, an approval page on first connect, and a per-profile token afterwards [S/V, both].
- **Chrome:** Active WebSocket traffic resets the SW idle timer since Chrome 116. An idle open socket is not guaranteed persistence [V, both]. Discovery and reconnect after SW sleep are the hard part. Options: retry on wake, alarms (≥30 s), or a user-opened "Connect" page [I, O]. **Local Network Access:** Chrome's guide says LNA gates WebSocket connections to loopback for **web pages** [V, merge]. No Chrome primary source addresses extensions. Only secondary sources say extensions with host permissions are exempt [S, merge]. Unresolved; PM must test.
- **Firefox:** Works from the event page, but keep-alive is weaker. A PM tab holding the socket is the robust option [I, O].
- **Maturity:** Medium. Microsoft's Playwright MCP proves the pattern [V/S, both]. Other examples: BrowserMCP/mcp, nathan-gage/webmcp-bridge (uses the old `navigator.modelContext`), MCP-B relay [V, C]; Playwriter on `localhost:19988` [S, O].
- **Friction:** Lower than M2: nothing to register with the browser, plus a one-time pairing in PM (both). It only works while both PM and the agent process are running.
- **Security (both):** "localhost" is not authentication. Bind to 127.0.0.1, use a pairing token shown in PM, and validate Origin/Host. The MCP Streamable HTTP spec requires Origin validation and recommends loopback plus auth [V, C: spec 2026-07-28].
- **PM fit:** Good effort/benefit. Effort is medium: an npm package plus about 150 lines in the extension (O). Keeps the "no backend" story.

### M4. `externally_connectable` / `onMessageExternal`

- **How it works (both):** Without the manifest key, any extension may message PM and no web page may. With it, PM allow-lists web origins and/or extension IDs [V, both].
- **Firefox:** Extension-to-extension messaging works. Website→extension `runtime.sendMessage` is **not** supported (bug 1319168) [V, both: MDN, 2025-11-13].
- **Uses:** (a) A partner agent extension calls a PM external API. None does today [I, both]. (b) A localhost page served by a companion calls PM: a Chrome-only variant of M3 [I, O]. Never allow-list a public origin, because any XSS on it would reach PM's store [I, both]. Keep PM's existing internal sender check and add a separate narrow entry point [I, C].
- **PM fit:** Low as a primary path; a supporting building block (both).

### M5. Dedicated integration page + content-script bridge (C)

- **How it works:** A visible PM page offers search and "propose these captures" to browser agents. On Chrome it calls PM via `externally_connectable`. Cross-browser, it uses page `postMessage` → PM content script → background, with its own authorization and strict validation [I, C].
- **Trade-off:** A hosted static page adds a web-origin dependency. An extension-owned page avoids that, but agents' access to `chrome-extension://` pages is unproven (see M1) [I, C].
- **PM fit:** Effort is low-medium on Chrome and medium cross-browser. No companion is needed, but it does not reach CLI-only or cloud agents unless they control the local browser.

### M6. WebMCP (`document.modelContext`)

- **How it works (both):** A document registers tools with `registerTool({name, description, inputSchema, execute}, {signal})`, with annotations such as `readOnlyHint` and `untrustedContentHint`. There is also a declarative form API, gated by the `tools` Permissions Policy [V: developer.chrome.com/docs/ai/webmcp, published 2026-05-18, updated 2026-10-07; imperative API, updated 2026-10-16]. `navigator.modelContext` was deprecated in Chromium 150 [V, C], so many tutorials are stale (both). WebMCP is not a network MCP endpoint [V, C: "compare-mcp" page].
- **Chrome:** Flag plus origin trial from Chrome 149 [V, both]. The overview page gives no end version [V, merge]. O's "149–156" comes from the blink-dev intent [S]. Edge runs an origin trial in 150 [V, merge: implementation-status.md]. Content scripts can query and execute page tools [V, O].
- **Firefox:** Mozilla's position is neutral (added 2026-08-03) and a prototype tracking bug exists. Playwright Next documents experimental Firefox prefs [V, C]. Nothing ships by default.
- **Consumers:** See §3c. ChatGPT Desktop is listed as supported and Brave Leo as experimental. Gemini in Chrome is "soon".
- **Extension surface:** A service worker has no document, so PM would need a page [I, C]. Whether a `chrome-extension://` page can register tools that agents see is **not documented** [unverified, both + merge]. A W3C TPAC 2026 breakout (opened 2026-10-11) proposes dedicated extension APIs for this [V, C].
- **Examples:** webmachinelearning/webmcp; GoogleChromeLabs/webmcp-extension; MCP-B packages [V, both].
- **PM fit:** Watchlist. Prototype only on a dedicated page after the extension-page question is answered. Never inject library tools into every publisher page (C).

### M7. MCP inside the extension (C)

- MCP's standard transports are stdio and Streamable HTTP; custom transports are allowed [V, C]. Chrome's TCP server APIs are Chrome Apps only [V, C], so an HTTP MCP server inside PM's worker is impossible (both). A custom browser-message transport still needs a matching client adapter [I, C].
- **PM fit:** No standalone benefit. Define the operation contract first and choose the transport separately. Contrast: cookjohn/zotero-mcp embeds Streamable HTTP in a *desktop* plugin, which an extension cannot do [V, both].

### M8. Gist shared store / inbox (O)

- **How it works:** PM already syncs the whole `papers` object to a private Gist file (`DO_NO_EDIT__PaperMemorySyncV2.json`) with a user PAT. Pull replaces local `papers` [V-local, O: `src/shared/js/utils/sync.js`, `system-architecture.md`]. Any agent with GitHub access (`gh`, GitHub MCP, ChatGPT/Codex connectors) can read it, **including cloud agents**, which no other mechanism reaches.
- **Limits:** Writes are whole-file last-writer-wins, so a concurrent PM push loses agent edits and malformed JSON can corrupt the library. The file name says "do not edit". The agent needs a gist-scoped credential [I, O].
- **Safe write design:** a separate **inbox** file (for example `PaperMemoryInbox.json`) that PM ingests on pull through `addOrUpdatePaper`, re-parsing each URL and forcing the `review` tag [I, O].
- **PM fit:** Read access is nearly free today (document the schema). Inbox writes are low-medium effort. Requires Gist sync to be enabled.

### M9. Local file import/export (O)

- The agent writes JSON/BibTeX or a URL list and the user imports it in options; export gives read access. Zero code and works everywhere, but it is not agentic. This is the baseline to beat.

### M10. Vendor or PM cloud relays (both)

- Claude in Chrome reportedly uses a cloud bridge in some setups [S, O]. Hosted MCP plus a relay to the local PM would need a designed relay or service, which contradicts "no backend" [I, both]. **Not viable for v1.**

---

## 2. Reference-manager prior art

| Product | Mechanism | Writes | Auth / consent | Signal | Prov. |
|---|---|---|---|---|---|
| Zotero local API | Desktop app serves `localhost:23119/api/`, off by default | **Yes, Zotero 10+** | Reads unauthenticated. Writes need runtime authorization (Allow / Always Allow / Deny); one-use grants are consumed; revocable; `Zotero-Server-ID` header [V: local_api page, 2026-07-29] | Built in | both |
| Zotero Connector | Extension → outbound HTTP to desktop `/connector/*` | Capture | Local | Mature [V, C: connector.js] | both |
| 54yyyu/zotero-mcp | External MCP; reads from local SQLite/API | Running Zotero 10+ local API, or Web API for older versions | `authorize-local` (Always Allow) or Web API key | ~5.9k stars | both; see §3d |
| cookjohn/zotero-mcp | Zotero plugin hosting Streamable HTTP MCP on `127.0.0.1:23120` | Yes | None documented | ~1.3k stars | both |
| Paperpile | Hosted MCP `https://mcp.paperpile.com/`, REST API, CLI, agent plugin | Saves papers | Limited public beta, enrollment by staff | Published 2026-10-13, updated 2026-11-10 [V, merge] | C; see §3b |
| Readwise / Reader | Hosted MCP `mcp2.readwise.io/mcp`; older server deprecated | Yes (create, tag, notes) | OAuth | Official ChatGPT app [V, both] | both |
| Raindrop.io | Hosted MCP `api.raindrop.io/rest/v2/ai/mcp`, Pro-only beta | Yes | OAuth 2.1 or bearer [V, both] | Official | both |
| Mendeley | Community pallaprolus/mendeley-mcp over cloud API | Yes | OAuth, keyring | ~47 stars [V, both] | both |
| Hypothes.is | Community imankgoyal/hypothesis-mcp | Annotations | API token | 1 star [V, C] | C |

**Lessons (both):** Cloud products ship hosted MCP plus OAuth, which PM cannot do. Zotero, the local-first precedent, owns a listener in a desktop process; PM needs a companion (M2/M3) for the same property. Copy Zotero's per-client authorization with "Always Allow" and revocation, but **also authenticate reads**, because PM notes may be private (C). Stars measure interest, not usage (C).

---

## 3. Disagreements and resolutions

**a. Ranking: WebSocket relay (O #1) vs native messaging (C #1).** Both reports agree on the facts. The disagreement is about weighting.

| Factor | M2 native messaging | M3 outbound WebSocket |
|---|---|---|
| Install friction | Companion plus OS host manifest per browser/OS (registry on Windows); blocked on ChromeOS and some managed setups | `npx`/`uvx` started by the agent plus a one-time pairing; nothing registered |
| Store review | New permission and install warning (avoidable if optional, see below); both stores allow it; host binary is outside review | No new permission (PM already has `*://*/*`); reviewers may question a persistent localhost connection [I, O] |
| Chrome lifecycle | Open port keeps SW alive (Chrome 105+) [V] | Only active traffic extends SW life (116+); needs reconnect-on-wake [V] |
| Firefox lifecycle | Open port keeps event page alive (Fx 104) [S] | Weaker; may need a PM tab open [I] |
| Reliability | Browser launches the host on demand, so PM can always reach it; Claude's own native host has many 2026 bugs [S] | Works only while both sides run; discovery and reconnect are custom |
| Local trust | Browser enforces the extension ID allowlist, but *The Native Menace* (Chauhan, Islam, Polakis; arXiv 2611.04291, submitted 2026-11-03, IEEE S&P 2027) shows non-privileged local apps can intercept native messaging or run confused-deputy attacks, because the channel lacks client attestation. Proposed mitigation: encryption with out-of-band key sharing [V, merge] | Any local process can connect to the port; needs pairing token plus Origin/Host checks |
| LNA | Not applicable | Extension exemption unverified (see M3) |

**Outcome (merge):** The paper narrows M2's security advantage. Both transports need an app-level pairing secret, so neither is "authenticated by default". M2's real remaining advantage is reliable reachability; M3's is install simplicity. **Recommendation:** build one operation contract with pairing. Ship M3 first as a developer preview, because the target users of #357 already run `npx`-launched MCP servers. Promote M2 if M3 testing shows SW reconnect, Firefox keep-alive, or LNA problems, or if non-developer users need always-on access. Declare `nativeMessaging` as **optional** so non-agent users never see the warning.

**b. Paperpile MCP.** **C is correct.** paperpile.com/h/agent-plugins-mcp-beta (published 2026-10-13, updated 2026-11-10) documents a limited public beta of an API, a hosted MCP at `https://mcp.paperpile.com/`, a CLI, and an agent plugin (Claude Code/Desktop, Codex CLI, ChatGPT desktop, Antigravity). Access requires enrollment, with wider rollout "in the coming weeks" [V, merge]. O simply did not find it.

**c. WebMCP consumers.** **Both are partly right.** implementation-status.md (no date on the page) lists "WebMCP is supported in ChatGPT Desktop", Brave Leo as experimental (issue 55232), Chrome origin trial 149, Edge origin trial 150, and Meta Ray-Ban Display "coming soon". It does not mention Gemini [V, merge]. The Chrome I/O 2026 blog (2026-05-19) still says "Gemini in Chrome will soon support WebMCP APIs" [V, merge]. The Chrome WebMCP overview names no production consumer [V, merge]. So: ChatGPT Desktop is listed as supported, Brave Leo is experimental, and Gemini is announced only. None of the sources mention extension-page tools.

**d. 54yyyu/zotero-mcp writes.** **C is current.** The README says "writes go to the running Zotero 10+ or through the web API". On Zotero 10+ the user runs `zotero-mcp authorize-local` (Always Allow); older Zotero needs `ZOTERO_API_KEY` [V, merge]. O's "Web API" description is the pre-Zotero-10 path. SQLite is used for local reads only.

**e. Atlas.** **Retired, not "evolved" in place.** OpenAI announced the shutdown around 2026-07-09 with a target date of **2026-08-09**. Browser and agent features moved into the new ChatGPT desktop app (ChatGPT Work, a built-in browser, and a Chrome extension that controls existing tabs) [S: press coverage, e.g. searchengineland.com/openai-chatgpt-atlas-deprecation-482003, cybernews.com/ai-news/openai-shutters-atlas-ai]. OpenAI's help article now carries a retirement notice [V, C], but it returned 403 during the merge, so the date relies on secondary sources. The successor integration target is the ChatGPT desktop app and its browser extension [V, C: learn.chatgpt.com/docs/chrome-extension].

**Re-checked open questions (merge):**
- *WebMCP on extension pages:* still undocumented. Neither Chrome's WebMCP pages nor implementation-status mention it; the TPAC breakout proposes it. **Unverified.**
- *Chrome optional `nativeMessaging`:* allowed by inference, since it is absent from Chrome's "cannot be optional" list. Not stated explicitly. **Likely yes; test it.**
- *LNA vs extension WebSocket to localhost:* Chrome docs cover web pages (including WebSocket to loopback) and say nothing about extensions. The extension exemption has only third-party sources. **Unverified; test it.**

---

## 4. Comparison

| Mechanism | Chrome | Firefox | Local process | Agents reached | Maturity | PM fit | Prov. |
|---|---|---|---|---|---|---|---|
| M1 Passive capture / UI / CDP | Yes | No in-profile agents | Tool-dependent | Claude in Chrome, ChatGPT ext, Playwright ext, DevTools MCP | Works, brittle | High for capture; no API | both |
| M2 Native messaging + MCP | Yes (105+ keep-alive) | Yes (optional perm) | Yes, registered host | All local MCP clients | High | Durable, high friction | both |
| M3 Outbound WS relay | Yes (116+; LNA unverified) | Yes (weaker keep-alive) | Yes, agent-launched | All local MCP clients | Medium | Best effort/benefit | both |
| M4 externally_connectable | Yes | Ext→ext only | No | Partner extensions; local page | High (API) | Supporting | both |
| M5 Integration page + bridge | Feasible | Feasible (content-script bridge) | No | Browser agents that can use the page | New design | Browser-only option | C |
| M6 WebMCP | Origin trial 149+, flag | Prototype / neutral | No | ChatGPT Desktop (listed), Brave Leo (exp.), Gemini (announced) | Experimental | Watchlist | both |
| M7 MCP inside extension | Custom transport only | Same | Adapter | Matching clients only | Building blocks | Does not solve reachability | C |
| M8 Gist inbox | Yes | Yes | No (GitHub) | Any agent with GitHub, **incl. cloud** | High (existing sync) | High read, medium write | O |
| M9 File import/export | Yes | Yes | No | Any | High | Baseline | O |
| M10 Cloud relay | – | – | – | Cloud MCP clients | – | Not viable | both |

---

## 5. Security, consent and store policy

**Prompt injection (both).** Indirect injection is systemic in agentic browsers [V: Brave on Comet, 2025-08-20 and 2025-10-21; Anthropic's Claude for Chrome pilot reported 23.6%→11.2% attack success, 2025-08-26; Google's WebMCP security guidance, 2026-09-01]. A poisoned page could make an agent add junk, rewrite notes, mislabel papers, or exfiltrate the library. Stored titles, notes and abstracts can also carry injected text into later sessions (C).

**Enforced at PM's operation boundary [I, both]:**
- **Add-and-tag-only by default:** accept a URL/ID plus tags, force `review` plus provenance (agent, time), and offer no delete. Appending a note is separate from replacing it, and existing notes and tags are preserved.
- Re-derive metadata with PM's own parsers; never trust agent-supplied titles or authors. Validate URL schemes.
- Never expose arbitrary storage keys, sync settings, PATs, or JavaScript evaluation.
- Bound batch size and rate. Make reads paginated and scope-configurable (IDs/titles vs notes).
- Return per-paper outcomes (stored / already present / failed / awaiting approval). Use idempotency keys for retries (C). Snapshot before agent batches (O).
- Annotate tools (`readOnlyHint`, `untrustedContentHint`) but enforce authorization in PM regardless (C).

**Auth and pairing:** Pair each companion with one browser profile and library (C). Keep the secret in the companion and out of prompts, DOM, URLs and logs. Neither native messaging (*Native Menace*) nor localhost (any process can connect) authenticates the caller by itself. `externally_connectable` authenticates an origin or extension, not user intent. For Gist writes, prefer an inbox file over a token that can rewrite the main file (O).

**Consent (both):** Zotero-style: off by default; "authorize this client" with Allow / Always Allow / Deny; visible connected-client list; revocation; operation history; a popup badge for pending agent additions. A confirmation click is not proof of a human if the agent can click that UI (C).

**Store policies:**
- Chrome Web Store: accurate data disclosure, purpose limitation, consent, and no remotely hosted code [V, C: policies updated 2025-05-22]. A fixed command schema is easy to review [I].
- Mozilla: current policy applies consent and control rules to data sent to native applications. Changes take effect **2026-12-01** [V, C]. The preview (read during merge) keeps native-messaging data under the same rules and requires: an accurate manifest data-collection declaration on Firefox 140+; explicit opt-in for personal data; transmission limited to the add-on's function; opt-in for features unrelated to the main purpose; no remote code; encrypted remote transmission [V, merge]. An agent integration is arguably outside PM's core purpose, so it must be **opt-in and disclosed**, including that library data may reach an AI provider [I].
- Update PM's privacy policy page for any agent channel (O).

---

## 6. Ranked shortlist (merged)

1. **Agent bridge = operation contract + local MCP companion, WebSocket transport first, native messaging as fallback.** One `papermemory-mcp` package (stdio for Claude Code/Cursor/Codex; `.mcpb` for Claude Desktop). Tools: `search_papers`, `get_paper`, `list_tags`, `add_paper(url, tags=["review"], note?)`, `tag_paper`, `append_note`. Paired, revocable, add-and-tag-only. *Why:* it reaches every local agent in both browsers with no backend. Starting with WS avoids host registration and a permission warning. Keeping the contract transport-agnostic makes the switch to native messaging cheap if reliability testing requires it (both, merged per §3a).
2. **Gist inbox plus documented read schema (O).** Close to zero infrastructure, and the **only path for cloud agents**. PM ingests the inbox through its normal pipeline with a forced `review` tag. Requires Gist sync; adds sync latency.
3. **Passive capture with an "agent session" auto-tag toggle (O, C agrees it works today).** A few lines of code; documents what in-profile agents already do.
4. **Watchlist: dedicated integration page with optional WebMCP (C, O agrees "watch").** Revisit when extension-page registration is documented and Gemini/Claude consume WebMCP. Chrome-first, with a content-script bridge for Firefox.

---

## 7. Open questions for the maintainer

1. Which agents matter first: local CLI/desktop, in-browser, or cloud? Cloud needs M8; local needs M2/M3.
2. Is a companion process acceptable for a "client-side only" project? If yes, `npx` (M3) or an installed host (M2)?
3. What may v1 write: add plus additive tags plus append note only? Is read scope limited to metadata, or does it include notes?
4. Is it acceptable that agent-added papers always carry `review` plus provenance, and how is the tag cleared?
5. Which profile/library does a request target when several browsers or profiles have PM?
6. Prototype checks: Chrome LNA prompt for extension SW → `ws://127.0.0.1`; optional `nativeMessaging` on Chrome; Firefox event-page keep-alive with WS; whether Claude in Chrome / ChatGPT extension can open PM's full-page view.
7. Concurrency with Gist sync: do agent writes survive a concurrent pull or push?
8. Store timing: ship after the Mozilla 2026-12-01 policy, with the data-collection manifest declaration and opt-in UI.

---

## Sources (accessed 2026-11-12 unless noted; dates are publication/update)

Platform: Chrome SW lifecycle https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle ; Chrome native messaging https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging ; Chrome permissions API (optional exceptions) https://developer.chrome.com/docs/extensions/reference/api/permissions ; permissions list https://developer.chrome.com/docs/extensions/reference/permissions-list ; externally_connectable https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable ; Chrome Apps networking https://developer.chrome.com/docs/apps/app_network ; remote-debugging change (2025-03-17) https://developer.chrome.com/blog/remote-debugging-port ; LNA blog (2025-06-09) https://developer.chrome.com/blog/local-network-access ; LNA guide https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access ; MDN native messaging (2026-08-27) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging ; MDN externally_connectable (2025-11-13) https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/externally_connectable ; MDN onMessageExternal https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onMessageExternal ; MDN background https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background ; Firefox bug 1770696 https://bugzilla.mozilla.org/show_bug.cgi?id=1770696 ; MCP transports (rev. 2026-07-28) https://modelcontextprotocol.io/specification/2026-07-28/basic/transports .

WebMCP: overview (2026-05-18 / 2026-10-07) https://developer.chrome.com/docs/ai/webmcp ; imperative API (2026-10-16) https://developer.chrome.com/docs/ai/webmcp/imperative-api ; agentic JS tools (2026-10-20) https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/agentic-javascript-tools ; compare MCP (2026-05-19) https://developer.chrome.com/docs/ai/webmcp/compare-mcp ; secure tools (2026-09-01) https://developer.chrome.com/docs/ai/webmcp/secure-tools ; Chrome at I/O 2026 (2026-05-19) https://developer.chrome.com/blog/chrome-at-io26 ; implementation status https://github.com/webmachinelearning/webmcp/blob/main/implementation-status.md ; blink-dev intent https://groups.google.com/a/chromium.org/g/blink-dev/c/gmYffo5WOE8 ; Mozilla position (2026-08-03) https://github.com/mozilla/standards-positions/issues/1412 ; Mozilla prototype bug https://bugzilla.mozilla.org/show_bug.cgi?id=2018306 ; Playwright Next WebMCP https://playwright.dev/docs/next/api/class-webmcp ; TPAC breakout (2026-10-11) https://github.com/w3c/tpac2026-breakouts/issues/84 ; GoogleChromeLabs/webmcp-extension https://github.com/GoogleChromeLabs/webmcp-extension ; MCP-B https://github.com/WebMCP-org/npm-packages ; Claude in Chrome WebMCP requests https://claudeissues.com/issue/30645-feature-webmcp-support-in-claude-chrome-extension .

Agents/tools: Claude for Chrome (2025-08-26) https://www.anthropic.com/news/claude-for-chrome ; Claude Code Chrome https://code.claude.com/docs/en/chrome ; claudeissues #16239 https://claudeissues.com/issue/16239-bug-screenshot-and-javascript-tools-fail-with-cannot-access-a-chrome-extension-u ; Playwright extension https://github.com/microsoft/playwright/blob/main/packages/extension/README.md ; Playwright Chrome extensions https://playwright.dev/docs/chrome-extensions ; Chrome DevTools MCP tool reference https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md ; DevTools for agents extensions https://developer.chrome.com/docs/devtools/agents/extensions ; browser-use https://github.com/browser-use/browser-use ; Stagehand https://github.com/browserbase/stagehand ; ChatGPT browser extension https://learn.chatgpt.com/docs/chrome-extension ; OpenAI MCP https://learn.chatgpt.com/docs/extend/mcp?surface=cli ; Atlas retirement https://help.openai.com/en/articles/20001371-chatgpt-atlas-retirement and https://searchengineland.com/openai-chatgpt-atlas-deprecation-482003 ; Comet privacy snapshot https://www.perplexity.ai/en-GB/hub/blog/introducing-privacy-snapshot ; Gemini auto browse https://support.google.com/chrome/answer/16821166 ; hangwin/mcp-chrome https://github.com/hangwin/mcp-chrome ; jackwener/BrowserMCP https://github.com/jackwener/browsermcp ; BrowserMCP/mcp https://github.com/BrowserMCP/mcp ; webmcp-bridge https://github.com/nathan-gage/webmcp-bridge ; .mcpb https://www.anthropic.com/engineering/desktop-extensions .

Prior art: Zotero local API (2026-07-29) https://www.zotero.org/support/dev/web_api/v3/local_api ; Zotero forum #132977 https://forums.zotero.org/discussion/132977/ ; Zotero connectors https://github.com/zotero/zotero-connectors ; 54yyyu/zotero-mcp https://github.com/54yyyu/zotero-mcp ; cookjohn/zotero-mcp https://github.com/cookjohn/zotero-mcp ; Paperpile beta (2026-10-13 / 2026-11-10) https://paperpile.com/h/agent-plugins-mcp-beta/ ; Readwise MCP https://docs.readwise.io/tools/mcp ; Raindrop MCP https://developer.raindrop.io/mcp/mcp ; Mendeley MCP https://github.com/pallaprolus/mendeley-mcp ; Hypothesis MCP https://github.com/imankgoyal/hypothesis-mcp .

Security/policy: The Native Menace (2026-11-03) https://arxiv.org/abs/2611.04291 ; Brave on Comet (2025-08-20) https://brave.com/blog/comet-prompt-injection/ and (2025-10-21) https://brave.com/blog/unseeable-prompt-injections/ ; Chrome Web Store policies (2025-05-22) https://developer.chrome.com/docs/webstore/program-policies/policies ; Mozilla add-on policies https://extensionworkshop.com/documentation/publish/add-on-policies/ and 2026-12 preview https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2026-12/ .

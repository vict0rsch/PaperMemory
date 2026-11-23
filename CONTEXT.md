# PaperMemory

PaperMemory is a browser extension that recognizes academic papers on publisher pages and stores their metadata. This glossary fixes the vocabulary for how a visited page becomes a stored paper, and for how local AI agents access stored papers.

## Language

### Ingestion pipeline

**Source**:
A supported publisher whose pages PaperMemory understands, implemented as a class in `src/shared/js/utils/sources/`.
_Avoid_: provider, site, publisher (when referring to the code object)

**Detect**:
Deciding that a visited URL belongs to a **Source** (`isSourceURL` / `isPaper`), which gates whether parsing runs at all.
_Avoid_: match, recognize, identify

**Parse**:
A **Source**'s `parse(url)` building a paper's metadata, typically by fetching the **Abstract URL**'s DOM or fetching a Bibtex citation file.
_Avoid_: scrape, extract, read

**Store**:
Persisting the parsed paper (`addOrUpdatePaper` with `store: true`); the final stage, after which the **Completion meta** is injected.
_Avoid_: save, commit, persist (informally)

### Page shapes & signals

**Abstract URL**:
A **Source** HTML page describing the paper (metadata, bibtex), as opposed to the PDF file.
_Avoid_: landing page, html page

**PDF URL**:
The direct link to a paper's PDF file.
_Avoid_: download link, file url

**Parsing order**:
The sequence in which a paper's two URLs are visited during the storage test — `abs;pdf` (abstract first) or `pdf;abs` (pdf first).
_Avoid_: direction, mode

**Completion meta**:
The `meta[name='pm-complete-secret-html']` element the content script injects once paper processing has finished (the `done` callback of `addOrUpdatePaper`), used by the test harness to detect success. It fires even when nothing is stored (`store: false`, e.g. arXiv with `checkNoAuto` or `checkPdfOnly`); in the storage test's default configuration, finished processing means the paper was stored.
_Avoid_: done flag, marker

### Extension surfaces

**Memory**:
The set of papers a user has stored in PaperMemory; always capitalized.
_Avoid_: library, collection (except **Library**, the agent-facing term below)

**popup Settings**:
The Settings panel inside the popup (opened with `p`), holding the quick toggles.
_Avoid_: Popup Menu, menu, gear menu

**options page**:
The extension's full settings page in its own tab (`options.html`).
_Avoid_: Advanced Options, Settings page

**full-page Memory**:
The **Memory** shown in its own tab as a table with a detail pane and bulk actions.
_Avoid_: fullMemory, Memory page

**PaperMemory block**:
The compact block PaperMemory adds to arXiv paper pages, showing the paper's **Memory** status and actions.
_Avoid_: arXiv enhancements, display

**welcome tab**:
The tab opened on first install to introduce PaperMemory and pick **Sources**.
_Avoid_: welcome page, onboarding

### Agent access

**Agent access**:
The opt-in PaperMemory setting that lets local AI agents read and write a **Library**.
_Avoid_: API, integration, agent mode

**Library**:
The Memory of one PaperMemory installation in one browser profile, addressed by agents through its `libraryId` and a human-readable label.
_Avoid_: profile, store, database

**Pairing request**:
An **MCP server**'s ask, on an agent's first PaperMemory call, to become a **Paired client** of a **Library**. It waits in PaperMemory, with no time limit, until the user clicks **Allow** or **Deny** under **Agent access**, or the **Agent session** ends; PaperMemory opens no tab for it.
_Avoid_: pairing prompt, pairing tab, authorization

**Native host**:
The small local program the browser launches for PaperMemory while **Agent access** is on; the single hub every agent connects through to reach one **Library**.
_Avoid_: daemon, relay, companion, server

**MCP server**:
The `papermemory-mcp` program an agent client launches to talk to **Libraries** through their **Native hosts**.
_Avoid_: plugin, bridge, connector

**Paired client**:
An agent client (e.g. Claude Code, Codex) that the user has allowed once to access a **Library**, until the user revokes it.
_Avoid_: app, connection, user

**Agent session**:
The lifetime of one **MCP server** process for one **Paired client**, identified by an opaque random id the **MCP server** creates and never shows the agent.
_Avoid_: conversation, run, connection

**Project folder**:
The folder an **MCP server** process works for: the first MCP root the agent client reports, else the server's working directory. It determines the **Project**; the agent cannot change it through tool arguments.
_Avoid_: repo, workspace, project root

**Project**:
The bibliography a **Paired client** keeps for one **Project folder** across **Agent sessions**. There is no Project when the **Project folder** is the home directory, the filesystem root, inside `/Applications` or a temporary directory, or after the agent opts out.
_Avoid_: repo, workspace, collection

**Project key**:
The secret identifier of a **Project**: an HMAC of its **Project folder** path under a per-install salt, held by the **MCP server** and never shown to the agent; PaperMemory stores only its hash, so Project membership is per machine.
_Avoid_: project id, project name

**Project label**:
The human-readable name of a **Project**, defaulting to its **Project folder**'s name; the only Project property an agent may change, typically from a `PaperMemory project: <name>` line in the folder's `CLAUDE.md` or `AGENTS.md`.
_Avoid_: project name (ambiguous with **Project key**), title

**Project tag**:
The `proj-<slug>` tag PaperMemory adds to every paper added to or attached to a **Project**, fixed at the Project's first add or attach and never renamed by PaperMemory; the `proj-` prefix is reserved, so agents cannot apply such tags themselves.
_Avoid_: project label, folder tag

**Attach**:
Adding an existing paper to a **Project** (its **Project tag** and membership) without making it an **Own addition**. An agent's add of a paper already in the **Library** is an Attach too, with its tags and the **Review tag**, and counts a visit; the paper keeps its id, metadata and note.
_Avoid_: add, link, import

**Provenance**:
The record stored on a paper an agent added: which **Paired client**, hashes of its **Agent session** and **Project key**, the **Project label**, when, and the agent's stated reason. Once the user opens or edits the paper it is released: it keeps the client's name, the **Project label**, when and why, with the time of the release, and drops the client id and hashes. The reason is also visible in the paper's note, as the line `Added by <client>: <reason>` appended when the add stored it.
_Avoid_: origin, source (a **Source** is a publisher), audit log

**Own addition**:
A paper the current **Paired client** added in the current **Project**, in any **Agent session** (or, without a Project, in the current **Agent session**); the only papers an agent may delete. It stops being one once the user opens or edits it (a visit, a merge or promotion such as its published version replacing the preprint, an edit of its note, tags or fields), which releases its **Provenance**.
_Avoid_: agent paper, my paper

**Review tag**:
The `review` tag PaperMemory forces onto every paper an agent adds, marking it as not yet looked at by the user.
_Avoid_: inbox, unread, pending

**Deletion flag**:
The `to-delete` tag plus a reason appended to the note, which an agent applies instead of deleting a paper that is not its **Own addition**.
_Avoid_: delete request, trash

## Relationships

- A **Source** owns the logic to **Detect**, **Parse**, and convert between an **Abstract URL** and a **PDF URL** (`toAbs` / `toPDF`).
- **Detect** → **Parse** → **Store** is a strict pipeline: each stage only runs if the previous succeeded.
- Finished processing triggers exactly one **Completion meta**, and in the storage test's default configuration that means the paper was stored; its absence (a test timeout) means the pipeline stopped at **Detect**, **Parse**, or **Store** — not necessarily **Parse**.
- The storage test visits both **Abstract URL** and **PDF URL** in each **Parsing order**; an order-dependent failure implicates the **Abstract URL**↔**PDF URL** conversion.
- Each browser profile with **Agent access** on has exactly one **Library** and one **Native host**; one **MCP server** can reach several **Libraries** and must name one when more than one is connected.
- A paper an agent adds goes through the same **Detect** → **Parse** → **Store** pipeline as a visited page; the **Review tag**, **Project tag** and **Provenance** are applied inside **Store**, with its first write (**Provenance** only when that write creates the paper); a paper that write creates then gets `Added by <client>: <reason>` in its note.
- If the paper is already in the **Library** (same id, a URL resolving to it, or a fuzzy match by title), the add is an **Attach**: the agent's tags, the **Review tag** and the **Project tag** are added, the paper keeps its id, metadata and note, and no **Provenance** is written, so it never becomes an **Own addition**.
- An **Agent session** belongs to exactly one **Paired client**; revoking the client ends all its sessions.
- A **Project** is shared by every **Paired client** working in the same **Project folder** (same **Project tag**), but **Own additions** stay per client: another client in the same Project can only put a **Deletion flag**.

## Example dialogue

> **Dev:** "The PMLR storage test times out — is `parse` broken?"
> **Maintainer:** "A timeout only tells you the **Completion meta** never appeared, i.e. processing never finished, so in the default configuration the paper wasn't **Store**d. It could have failed to **Detect** or **Parse**. Here it failed only in `pdf;abs` **Parsing order**, so `parse` derived a bad **Abstract URL** from the **PDF URL**."

> **Dev:** "Claude Code added a wrong paper yesterday. Can Codex delete it today?"
> **Maintainer:** "No. It is Claude Code's **Own addition** in that **Project**, so a new Claude Code session in the same **Project folder** may delete it, but Codex, even in the same folder, can only put a **Deletion flag** on it."

## Flagged ambiguities

- "save" vs **Store** — resolved: user-facing copy (UI, store listing, papermemory.org) says a paper is "saved to your **Memory**"; **Store** is the developer term for the pipeline stage (code, tests, contributing docs).
- "parse or detect" was used as if interchangeable — resolved: **Detect**, **Parse**, and **Store** are distinct pipeline stages, and a storage-test timeout does not pinpoint which one failed.
- "library" and "Memory" were both used for the stored papers — resolved: use **Memory** in the UI, user docs and everywhere a person is addressed; use **Library** only for the agent-facing endpoint, one browser profile's Memory addressed through its `libraryId` (`list_libraries`, the MCP server, the Native host, agent docs and code).
- "session" was used both for an agent conversation and for an **MCP server** process — resolved: an **Agent session** is one **MCP server** process; continuity across sessions comes from the **Project**, not from session names.
- "delete its own additions" — resolved: papers the same **Paired client** added in the same **Project** (any session), or in the same **Agent session** when there is no Project, and that the user has not opened or edited since; anything else gets a **Deletion flag**.
- "project" was used both for the folder identity and for its display name — resolved: the **Project key** identifies it and only the **MCP server** knows it; the **Project label** is the editable display name.
- "workspace", "repo" and "project root" were used for where an agent works — resolved: that is the **Project folder**; "repository" keeps its plain git meaning.

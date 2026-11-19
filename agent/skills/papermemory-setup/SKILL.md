---
name: papermemory-setup
description: Set up, connect or troubleshoot PaperMemory's agent tools with the user, one step at a time. Use when the user wants to install or connect PaperMemory, when the PaperMemory tools are missing, or when a PaperMemory tool fails because no library is connected, the install is incomplete, the client must pair again, Agent access is off or the protocol is outdated.
---

# PaperMemory setup

PaperMemory is a browser extension that keeps the user's research papers (their Memory). Agents reach it through a Library: one browser profile with Agent access on. The user's guide: https://papermemory.org/agents/

## How to help

- Find the first missing step below, explain it in plain words and wait for the user to do it. One step at a time.
- After each step, run its check before you go on.
- Never run `install` or `uninstall`, and never edit an agent's configuration, without the user's explicit OK. Prefer that the user runs `npx -y papermemory-mcp install` in their own terminal: it asks one question per agent (answer `y`), which you cannot answer for them.
- Read-only checks are fine: `~/.papermemory/bin/papermemory-mcp libraries`, `claude mcp list`, `codex mcp list`.

## Diagnose

Run `~/.papermemory/bin/papermemory-mcp libraries`:

- "no such file or directory": the agent tools are not installed. Step 1.
- `[]`: no browser is connected. Step 2.
- One entry per connected Library: the connection works. See the table.

| Tool message | What to do |
| --- | --- |
| `no PaperMemory library is connected` | Run the `libraries` check above |
| `several PaperMemory libraries are connected, name one: ...` | Ask the user which one; pass it as `library` |
| `PaperMemory's install is incomplete (~/.papermemory/salt is missing)` | Step 1 with `npx -y papermemory-mcp@latest install` |
| ``protocol-mismatch: Run `npx -y papermemory-mcp@latest install` `` | The same, then a new agent session |
| `protocol-mismatch: Update the PaperMemory extension` | The user updates the extension |
| `pairing-required: Tell the user: "PaperMemory needs your OK to let ...` | Relay the quoted message verbatim and wait; once the user has clicked Allow, call the tool again (step 3) |
| `unauthorized: ... the user must pair it again ...` | Step 3 |
| `disabled: Agent access is off in PaperMemory's options` | The user turns Agent access back on (step 2); this client stays paired |
| `denied: The user denied this client access` | Ask whether they meant it; if not, wait one minute, then step 3 |
| `rate-limited: The user denied a PaperMemory pairing request less than a minute ago ...` | Ask whether they meant it; if not, wait one minute, then step 3 |
| `timeout: The user did not answer the pairing request in time` | Step 3 |
| `busy: Another PaperMemory pairing request is waiting for the user ...` | The user answers the pairing card already open |
| `internal: PaperMemory could not open its pairing prompt` | The user opens a browser window, then step 3 |

No PaperMemory tools at all: check `claude mcp list` or `codex mcp list` (or the agent's MCP settings) for `papermemory`. Missing: step 1. Present: the user starts a new agent session.

## Steps

1. **Install.** Needs macOS and Node.js 18 or newer (`node -v`). The user runs `npx -y papermemory-mcp install` and answers `y` for their agent. Check: `~/.papermemory/bin/papermemory-mcp libraries` runs (it prints `[]` until step 2) and the agent's MCP list shows `papermemory`. A newly registered agent needs a new session.
2. **Turn on Agent access.** PaperMemory's options page, section Agent access: turn on "Enable Agent access", then click Allow in the browser's permission prompt (it also asks to display notifications, which announce pairing requests). Chrome reloads PaperMemory and reopens the options page. Check: the status under the switch says "Connected", and `libraries` lists the Library. Other statuses:
    - "PaperMemory agent tools not installed": step 1, also after installing a new browser. For a Chrome started with `--user-data-dir <dir>`, install with `--user-data-dir <dir>`.
    - "PaperMemory agent tools outdated": `npx -y papermemory-mcp@latest install`.
    - "PaperMemory is older than the agent tools": the user updates the extension.
    - "Permission refused": turn the switch on again and click Allow.
3. **Pair.** Call `connect`. If it answers `pairing-required`, relay its message verbatim: PaperMemory has opened its options page in a new tab, brought to the front, on an "Agent pairing request" card. The user clicks Allow within 2 minutes and tells you; then call `connect` again. Check: `connect` answers `paired: true` and the agent is listed under Paired clients.

Then follow the `papermemory` skill.

---
name: agent-access-development
description: Develop, change or release PaperMemory's Agent access. Use before editing the `agent/` package (`papermemory-mcp`: MCP server, Native host, installer, the skills it ships), the extension's Agent access code (background, ingest, options page, popup banner, the Memory queue's `agent` operation), MCP tools, pairing, protocol or version values, and when releasing the agent tools or an extension release that should prompt users to update them.
---

# Agent access development

Agent access lets local AI agents read and write a PaperMemory **Library**. Terms: `CONTEXT.md` § Agent access. Decisions and their reasons: [ADR 0002](../../../docs/adr/0002-native-messaging-hub-for-agent-access.md). Message shapes: [`research/implementation-plan.md` § Fixed contracts](../../../research/implementation-plan.md). Components and data flow: `system-architecture.md` § Agent access. Read the relevant one before you change anything, and link to it instead of restating it.

## Where things live

| Part                                              | Files                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MCP server (one process per Agent session)        | `agent/src/serve.mjs` (tools, pairing, Project, update note), `agent/src/libraries.mjs` (socket discovery, `hello`, `negotiate`, `isOlderVersion`, requests)                                                                                                                                                                          |
| Native host (browser-launched hub, only forwards) | `agent/host/host.mjs` (`HOST_VERSION` and the protocol range, sent in `host-ready`)                                                                                                                                                                                                                                                   |
| Installer and CLI                                 | `agent/src/cli.mjs`, `install.mjs`, `browsers.mjs`, `agents.mjs`, `fsutil.mjs`                                                                                                                                                                                                                                                        |
| Skills shipped to agents                          | `agent/skills/papermemory/SKILL.md`, `agent/skills/papermemory-setup/SKILL.md`                                                                                                                                                                                                                                                        |
| Package tests                                     | `agent/test/*.test.mjs` (`npm test` in `agent/`); end to end: `agent/test/e2e.chrome.mjs`, `agent/test/e2e.firefox.mjs` (shared `e2e.common.mjs`)                                                                                                                                                                                     |
| Extension background                              | `src/background/agentAccess.js` (native port, `hello`, pairing, authorization, job queue, `PROTOCOL_MIN`/`MAX`, `RECOMMENDED_AGENT_TOOLS_VERSION`), `src/background/agentIngest.js` (`add_paper` ingest, storage proxy filter), `src/entrypoints/agentIngest/` (Chrome offscreen document), `src/background/badge.js` (pairing badge) |
| Pure operations                                   | `src/shared/js/utils/agentOps.js` (bounds, tags, search, Provenance, ownership)                                                                                                                                                                                                                                                       |
| Memory writes                                     | `src/shared/js/utils/memoryQueue.js`, operation `agent` (background only)                                                                                                                                                                                                                                                             |
| Pages                                             | `src/options/agentAccessUI.js` and `src/entrypoints/options/index.html` (Agent access section), the pairing banner in `src/popup/js/popup.js`                                                                                                                                                                                         |
| Extension tests                                   | `test/test-agent-access.js`, `test/test-agent-ops.js`, `test/test-options.js` (Agent access sections), `test/test-memory-queue.js`                                                                                                                                                                                                    |
| Test build switch                                 | `wxt.config.js` (`WXT_PM_AGENT_TEST`), `scripts/refuse-agent-test-build.js`                                                                                                                                                                                                                                                           |

## Version values: when to change each

| Value                             | Where                                                                                                                            | Change it                                                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `version`                         | `agent/package.json` (and `agent/package-lock.json`)                                                                             | At every agent tools release.                                                                                                              |
| `HOST_VERSION`                    | `agent/host/host.mjs`                                                                                                            | With `version`, always equal: `agent/test/host.test.mjs` fails otherwise. The MCP server and the host report it.                           |
| `PROTOCOL_MIN`, `PROTOCOL_MAX`    | `src/background/agentAccess.js` (extension); `agent/host/host.mjs` and `agent/src/libraries.mjs` (package: keep these two equal) | Only for an incompatible message change (below). Never for a new op or an optional field.                                                  |
| `RECOMMENDED_AGENT_TOOLS_VERSION` | `src/background/agentAccess.js`                                                                                                  | In the extension release that should prompt users to update, and only AFTER that agent tools version is published on npm. A plain `x.y.z`. |

How the versions are used:

1. The extension answers `hello` with `protocolMin`, `protocolMax` and `recommendedToolsVersion`. The MCP server (`negotiate`) uses the highest protocol version both sides support and sends it as `protocol` in every request; the extension refuses a `protocol` outside its range.
2. No overlap: `protocol-mismatch`, "Update the PaperMemory extension" or "Run `npx -y papermemory-mcp@latest install`". The options page compares the host's range from `host-ready` and shows "PaperMemory agent tools outdated" or "PaperMemory is older than the agent tools".
3. Overlap, but agent tools older than `recommendedToolsVersion` (major.minor.patch; a prerelease counts as its release): the options page keeps "Connected" and adds "Update available"; the MCP server adds its update note to the first clean answer of `connect` or `get_project`, once per process.
4. Additive change (new op, new optional field in a request or an answer): keep the protocol version. Older peers answer `unknown-op` or ignore the field. Make each new field optional and handle its absence.
5. Incompatible change (an op or field removed or renamed, a meaning changed, a new required field): raise `PROTOCOL_MAX` on both sides, keep the previous version accepted for at least one release, ship the extension that accepts the new version first (stores update it by themselves), then the agent tools that speak it. Raise `PROTOCOL_MIN` only in a later release.

- `isOlderVersion` exists twice, in `agent/src/libraries.mjs` and `src/background/agentAccess.js` (the two packages cannot share code). Change both together; both are unit-tested with the same cases.

## Release checklist

Agent tools (npm package `papermemory-mcp`):

1. In `agent/`, run `npm version <x.y.z> --no-git-tag-version`, then set `HOST_VERSION` in `agent/host/host.mjs` to the same value.
2. Run `npm run build` at the root, then `cd agent && npm test`.
3. Run `node agent/test/e2e.chrome.mjs` and `node agent/test/e2e.firefox.mjs`. Each must print `OVERALL PASS` (a SKIP for OpenReview's `403 ChallengeRequired` is a known environment issue). They end with a production build: `grep -rl pm-agent-test-auto-allow dist/chrome-mv3 dist/firefox-mv2` must print nothing.
4. In `agent/`, `npm pack --dry-run` must list `dist/cli.mjs`, `dist/host.mjs`, `skills/` and `README.md`.
5. Publish with `npm publish` in `agent/` (`prepublishOnly` builds). Only the maintainer publishes: the npm name is owned by `vict0rsch`, and its `0.0.1` is a name placeholder, not a working release. Users install `@latest`, so publish a prerelease with `--tag next`. Stop before this step unless the maintainer asks you to publish.
6. Check that `npm view papermemory-mcp version` prints the new version.

Extension release that prompts users to update:

7. Only after step 6, set `RECOMMENDED_AGENT_TOOLS_VERSION` to the published version.
8. Bump the root `package.json` `version`, run the checks below, and submit with the manual `submit.yml` workflow (`contributing.md` § Submitting to the stores).

## Invariants: do not break

- **Ownership and Provenance.** Only the Memory queue writes Provenance, and only when an agent's add creates the paper; adding a paper already stored only attaches it. Agents delete only their Own additions; any other paper gets a Deletion flag. A user's visit or edit releases Provenance. `proj-` is reserved for Project tags. The Project key comes from the Project folder, never from tool arguments.
- **Pairing decision binding.** The background accepts a decision only from PaperMemory's options page in a tab (`isValidPairSender`), for a pending request, once; anything but `allow: true` denies. PaperMemory never opens a tab or focuses a window for a pairing request.
- **Test-build auto-allow guard.** The auto-allow stays inside `if (import.meta.env.WXT_PM_AGENT_TEST === "1")` with its `pm-agent-test-auto-allow` marker. Only `wxt.config.js` decides a test build, and zipping refuses one. Never zip, submit or leave in `dist/` a test build.
- **Quoted messages.** `agent/test/skill.test.mjs` checks that every message the `papermemory-setup` skill quotes appears verbatim in the code. When you change a user-facing message, change the code, the skill, the test's list and `docs/agents.md` together.
- **No auto-update.** Agents run the installed copy in `~/.papermemory/bin`, never `npx`, at start. Only the user updates, with `npx -y papermemory-mcp@latest install`; update notices only inform.
- **No network from the agent tools.** `serve` and the host talk only to the local socket (the host also to the browser, over native messaging): no registry lookup, no telemetry.
- **The Native host only forwards.** It rewrites request ids and never inspects, validates or logs `args` or `auth`. Its framing and handshake are frozen separately from the operation protocol.
- **`serve` prints only JSON-RPC to stdout.**
- **Safety while developing.** Tests use temporary HOMEs, profiles and user data dirs: keep it that way. Do not run `install` or `uninstall` in the real home, do not touch the real `~/.papermemory`, browser profiles, NativeMessagingHosts folders or agent configs unless the user asks, and kill only processes you started.

## Docs to update with your change

| Change                                                               | Update                                                                                                                                                     |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anything a user sees or runs (statuses, messages, commands, steps)   | `docs/agents.md`; `agent/README.md` (commands); the shipped skills in `agent/skills/`                                                                      |
| A decision or a consequence (security, lifecycle, versions, updates) | [ADR 0002](../../../docs/adr/0002-native-messaging-hub-for-agent-access.md)                                                                                |
| A term (new, renamed or redefined)                                   | `CONTEXT.md`, glossary only, no implementation details                                                                                                     |
| Components, data flow, message shapes                                | `system-architecture.md` § Agent access; message shapes in [`research/implementation-plan.md` § Fixed contracts](../../../research/implementation-plan.md) |

## Verify before you finish

1. `npm run build` at the root.
2. `npm run test:file` on `test/test-agent-access.js`, `test/test-agent-ops.js`, `test/test-options.js` and `test/test-meta.js`, one at a time. A new `test/test-*.js` must be listed in `.github/workflows/_test-matrix.yml`.
3. `cd agent && npm test`.
4. When a change crosses the extension and the agent tools (messages, pairing, ingest, install): both e2e scripts print `OVERALL PASS`.
5. When docs changed: `uvx --with "mkdocs-material[imaging]" mkdocs build`.
6. Last, a production `npm run build`, so that `dist/` holds no test build.

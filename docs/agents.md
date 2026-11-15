---
description: Let local AI agents search and add papers in your PaperMemory library.
icon: octicons/hubot-16
---

# Agent access

**Agent access** lets AI agents running on your computer (Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi) search your Memory, add papers to it and keep a bibliography per project. It is off by default.

Papers an agent adds always get the `review` tag so you can find what you have not looked at yet.

## Setup

1. Install the agent tools once, from a terminal:

    ```sh
    npx -y papermemory-mcp install
    ```

    It copies a small program to `~/.papermemory/`, tells your browsers how to start it, and offers to register it with each agent it finds.

2. In PaperMemory's options, turn on **Agent access**. The browser asks for the "native messaging" permission. On Chrome, the extension reloads once and reopens the options page, which then shows "connected".
3. Use your agent. The first time an agent asks for access, PaperMemory opens its options page on a prompt naming that agent: click **Allow** only if you are using that agent right now. You can revoke an agent at any time in the **Paired clients** list.

## Update and uninstall

```sh
npx -y papermemory-mcp@latest install   # update (keeps your pairings and project keys)
npx -y papermemory-mcp uninstall        # remove everything `install` created
```

The options page tells you when the installed agent tools are too old for the extension.

## What agents can do

- Search the Memory, read a paper's details and BibTeX, list tags.
- Add a paper from its URL (with a mandatory reason, stored with the paper), add tags, append to a note.
- Keep a **project** bibliography: list its papers and export its BibTeX.
- Delete papers they added themselves. For any other paper, they can only add a `to-delete` tag and a reason in the note.

Agents cannot read or change your settings, your Gist token or your backups.

## Projects

When an agent works in a folder (not your home folder, a temporary folder or an application), the papers it adds belong to that folder's **project**. PaperMemory tags them `proj-<name>`, so you can filter them with `t: proj-<name>` in the Memory. The tag is fixed when the project's first paper is added.

Add a line to the folder's `CLAUDE.md` or `AGENTS.md` to name the project:

```
PaperMemory project: <name>
```

A new session in the same folder with the same agent continues the same project and may delete the papers it added earlier. Another agent in the same folder shares the project tag but cannot delete them.

!!! info "Renaming a project tag"

    The Project tag is fixed. To rename it on existing papers, filter the Memory with `t: <tag>` and edit each paper's tags (press `e` on a focused paper), or export the Memory as JSON (Options → Data Management), replace the tag, and import it back. Agents keep applying the original tag to new papers.

## Supported browsers and agents

| | Status |
| --- | --- |
| macOS, Chrome and Firefox | Tested |
| macOS, Brave, Edge, Chromium | Best effort: set up by `install`, not tested |
| Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi | Registered by `install`; project detection verified on Oh-My-Pi only, the others are best effort |
| Windows, Linux | Not supported yet |
| Snap or Flatpak browsers, browsers where policy blocks native messaging, ChromeOS | Not supported |

## Syncing with a Gist

If you use [Gist sync](./configuration.md), it stays last-writer-wins: a paper an agent adds can be lost if another device pushes first, exactly like any other edit.

## Privacy

With Agent access on, your library data is sent to the programs you paired, which run on your computer. Those programs may send what they read to their AI provider. PaperMemory itself sends nothing else: there is no server, and the connection is a local socket that only your user can open. Turn Agent access off, or revoke a client, to stop it.

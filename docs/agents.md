---
description: Set up Agent access step by step, so that AI agents on your Mac can search your Memory and add papers to it.
icon: octicons/hubot-16
---

# Agent access

**Agent access** lets AI agents that run on your Mac (Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi) search your Memory, add papers to it, and keep a bibliography for each of your project folders. It is off by default, and you allow each agent yourself.

It is not a cloud service. PaperMemory has no server: agents reach your Memory through a connection on your own Mac. But the agents you allow can read your whole Memory, and they may send what they read to the company that runs their AI model. They cannot read your settings, your Gist token or your backups. See [Privacy](#privacy).

??? info "How it works, in three parts"

    1. **PaperMemory**, in your browser, holds your Memory.
    2. While Agent access is on, your browser starts a small helper program, the **Native host**. It waits for agents.
    3. Your agent starts PaperMemory's tools (an **MCP server**), which talk to the Native host.

    Step 1 puts the helper and the tools on your Mac. Step 2 lets your browser start the helper. Step 3 lets an agent in.

## Before you start

You need:

- **A Mac.** Windows and Linux are not supported yet.
- **Chrome or Firefox.** Brave, Edge and Chromium may work, but they are not tested.
- **PaperMemory** with Agent access: its options page has an **Agent access** section in the left column, between Sync and Keyboard shortcuts.
- **Node.js 18 or newer.** To check, open the Terminal app (press ++cmd+space++, type `Terminal`, press ++enter++), then type this and press ++enter++:

    ```sh
    node -v
    ```

    It prints a version such as `v22.11.0`. The first number must be 18 or more. If it says `command not found: node`, or the number is lower, install the LTS version from [nodejs.org](https://nodejs.org), or run `brew install node` if you use Homebrew. Then open a new Terminal window.

- **An agent**, installed and working: Claude Code, Codex, Cursor, OpenCode or Oh-My-Pi.

What is tested:

| | Status |
| --- | --- |
| macOS, Chrome and Firefox | Tested |
| macOS, Brave, Edge, Chromium | Best effort: set up by `install`, not tested |
| Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi | Registered by `install`; project detection verified on Oh-My-Pi only, the others are best effort |
| Windows, Linux | Not supported yet |
| Snap or Flatpak browsers, browsers where policy blocks native messaging, ChromeOS | Not supported |

## Step 1: Install the agent tools

You do this once per Mac, in the Terminal. On this page, `~` means your home folder, for example `/Users/you`.

1. Copy this line, paste it into the Terminal and press ++enter++:

    ```sh
    npx -y papermemory-mcp install
    ```

    `npx` comes with Node.js. It downloads PaperMemory's agent tools and runs their installer. `-y` lets it download without asking first.

2. Answer the questions. The installer asks one question for each agent it finds on your Mac:

    ```text
    Register PaperMemory with Claude Code? [y/N]
    ```

    Type `y` and press ++enter++ for each agent you want to use with PaperMemory. Pressing ++enter++ alone means no: the capital `N` shows the default.

    It only asks about the agents it finds:

    - Claude Code and Codex, when their `claude` and `codex` commands work in this Terminal.
    - OpenCode, when the `opencode` command works or the `~/.config/opencode` folder exists.
    - Cursor, when the `~/.cursor` folder exists (Cursor creates it the first time it runs).
    - Oh-My-Pi, when the `omp` command works or the `~/.omp` folder exists.

3. Read what it prints. A typical run looks like this:

    ```text
    Installed the PaperMemory host in /Users/you/.papermemory/bin
    Register PaperMemory with Claude Code? [y/N] y
    Registered PaperMemory with Claude Code
    Register PaperMemory with Codex? [y/N] n
    ```

    If a line starts with `Could not register with` or `Left`, see [Troubleshooting](#in-the-terminal).

!!! tip "Two options"

    - `npx -y papermemory-mcp install --yes` registers every agent it finds, without asking.
    - `npx -y papermemory-mcp install --dry-run` prints what it would do, and changes nothing.

### What the installer creates

| Where | What it is |
| --- | --- |
| `~/.papermemory/bin/` | A copy of the agent tools: `papermemory-mcp`, which agents start, and `papermemory-host`, which browsers start. Browsers and agents only run this copy. |
| `~/.papermemory/salt` | A random secret, used to recognize your project folders. Keep it private. |
| `~/.papermemory/install.json` | The list of everything the installer did, used to update and uninstall. A plain uninstall keeps `salt` and `clients/` next to it. |
| `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/org.papermemory.agent.json` | Tells Chrome where the Native host is. The same file goes in `Mozilla/` for Firefox, and in the folders of Brave, Edge, Chromium and Chrome for Testing. Only for the browsers whose folder exists. |
| Claude Code, Codex | A user-wide `papermemory` server, added with `claude mcp add` and `codex mcp add`. |
| Cursor | A `papermemory` entry in `~/.cursor/mcp.json`. |
| OpenCode | A `papermemory` entry in `~/.config/opencode/opencode.jsonc` (or in `opencode.json` if that is the file you have). |
| Oh-My-Pi | A `papermemory` entry in `~/.omp/agent/mcp.json`. |
| `~/.agents/skills/` and `~/.claude/skills/` | Two skills, instructions that agents read: `papermemory` (how to use PaperMemory) and `papermemory-setup` (how to help you fix the connection). |

Later, the agent tools add `~/.papermemory/clients/` (one key per agent you allow), `~/.papermemory/sock/` (where agents find connected browsers) and `~/.papermemory/logs/` (which program ran, operation names and outcomes; never paper contents or keys).

The installer leaves everything else alone: other entries in your agents' settings, and skill files you wrote yourself.

### Check the install

Check that your agent knows PaperMemory:

=== "Claude Code"

    ```sh
    claude mcp list
    ```

    The list has a line that starts with `papermemory:`.

=== "Codex"

    ```sh
    codex mcp list
    ```

    The list has a `papermemory` entry.

=== "Cursor"

    ```sh
    cat ~/.cursor/mcp.json
    ```

    The file has a `papermemory` entry under `mcpServers`.

=== "OpenCode"

    ```sh
    cat ~/.config/opencode/opencode.jsonc
    ```

    The file (or `opencode.json`) has a `papermemory` entry under `mcp`.

=== "Oh-My-Pi"

    ```sh
    cat ~/.omp/agent/mcp.json
    ```

    The file has a `papermemory` entry under `mcpServers`.

Then check the tools themselves:

```sh
~/.papermemory/bin/papermemory-mcp libraries
```

It prints `[]`: the list of connected browsers, which stays empty until Step 2.

## Step 2: Turn on Agent access

1. Open PaperMemory's options page: click the PaperMemory icon in the toolbar (in Chrome, it may be under the puzzle-piece icon), click the gear (or press ++p++), then click **All options**.
2. In the left column, click **Agent access**.
3. Turn on **Enable Agent access**.
4. Your browser asks for new permissions:

=== "Chrome"

    Chrome asks to let PaperMemory "Communicate with cooperating native applications" and "Display notifications". Click **Allow**.

    After a moment, the options page closes and opens again by itself: Chrome restarts PaperMemory once, so that it can use the new permission. Click **Agent access** in the left column again. Paper tabs that were already open lose PaperMemory's features until you reload them.

    Brave, Edge and Chromium should behave like Chrome (not tested).

=== "Firefox"

    Firefox asks to let PaperMemory "Exchange messages with programs other than Firefox" and "Display notifications to you". Click **Allow**.

The first permission lets your browser start the Native host. The second lets PaperMemory show a system notification when an agent asks for your OK (see [Allow the agent](#allow-the-agent)). If you refuse, Agent access turns itself off ("Permission refused"). If the browser asks only about notifications, because you allowed the first permission before, refusing keeps Agent access on: PaperMemory then shows no notification, only the pairing tab. On macOS, notifications also need your browser to be allowed in System Settings → Notifications.

Within a few seconds, a status line appears under the switch. **Connected** means it works. Agents can reach your Memory only while this browser is running.

Check it from the Terminal too:

```sh
~/.papermemory/bin/papermemory-mcp libraries
```

It now prints one entry, like this one:

```json
[
  {
    "libraryId": "3f9a1c2e-7b4d-4e1a-9c3b-2d5e6f7a8b9c",
    "label": "Chrome · 3f9a1c",
    "browser": "Chrome",
    "paperCount": 412,
    "protocolMin": 1,
    "protocolMax": 1
  }
]
```

Agents call this a **library**: the Memory of one browser profile where Agent access is on. Its label is the browser's name and the first six characters of its id.

### What the status line means

| Status | Meaning | What to do |
| --- | --- | --- |
| Connected | Your browser started the Native host. Agents can reach this Memory. | Go to Step 3. |
| PaperMemory agent tools not installed | Your browser could not start the Native host. | Run `npx -y papermemory-mcp install`. If you already did, see [Troubleshooting](#in-the-options-page). |
| PaperMemory agent tools outdated | The agent tools are too old for this version of PaperMemory. | Run `npx -y papermemory-mcp@latest install`. |
| PaperMemory is older than the agent tools | The extension is too old for the agent tools. | [Update the extension](#in-the-options-page). |
| Permission refused | You refused the browser's permission. The switch turned itself off. | Turn it on again, and click Allow. |
| No status line | PaperMemory is still connecting. | Wait a few seconds. |

## Step 3: First use

### Start a new agent session in your project folder

Agents load PaperMemory's tools when they start. An agent you started before Step 1 does not have them: quit it and start a new session.

Start it from your project's folder, because that folder becomes the project (see [Projects](#projects)). For example, with Claude Code, `cd` moves the Terminal into the folder, then `claude` starts the agent there:

```sh
cd ~/research/protein-lm
claude
```

With Codex, OpenCode or Oh-My-Pi, run `codex`, `opencode` or `omp` instead of `claude`. With Cursor, open the folder in Cursor.

Do not start the agent in your home folder: there, the agent works without a project.

### Ask for something

Ask in your own words, and mention PaperMemory. For example:

```text
Use PaperMemory to find the papers in my Memory about protein language models.
```

Your agent may first ask you to approve PaperMemory's tools. That question comes from your agent, not from PaperMemory.

### Confirm the project

PaperMemory's tools and skill tell the agent to check the project first. The agent tells you which project it found, usually your folder's name, and asks you to confirm.

It may also offer to add a line like this one to the folder's `CLAUDE.md` or `AGENTS.md`, to give the project a better name:

```text
PaperMemory project: Protein LM survey
```

Say yes before the agent adds its first paper: the project's tag is fixed then (see [The project tag](#the-project-tag)).

### Allow the agent

Right after you confirm the project, PaperMemory's skill tells the agent to call PaperMemory's `connect` tool, so that PaperMemory asks for your OK now rather than in the middle of a task. Without the skill, the same happens the first time the agent reads or changes your Memory.

PaperMemory opens its options page in a new tab and brings that window to the front (in a new window if the browser has none open). If you allowed notifications in Step 2, a system notification also says "_the agent's name_ wants to use PaperMemory": click it to show the tab. The tab shows this card:

> **Agent pairing request**
>
> **_the agent's name_** wants to read and add papers in this browser's PaperMemory library.
>
> Only allow it if you are using this agent right now. You can revoke it later in Agent access.
>
> **Allow** · **Deny**

The agent does not wait for you to click: after about 2 seconds, it tells you something like this (the `pairing-required` answer):

> PaperMemory needs your OK to let Claude Code use it: switch to Chrome and click **Allow** on the PaperMemory tab that just opened (the request stays open for 2 minutes).

The name is the one the agent gives itself. Only allow a name you expect.

- **Allow**: the card says "Allowed." The agent appears under **Paired clients**. Tell the agent you allowed it: its next call goes through. PaperMemory does not ask again for this agent in this browser profile, unless you revoke it.
- **Deny**: the card says "Denied." For one minute, PaperMemory refuses every new pairing request: if the agent tries again within that minute, it gets `rate-limited: The user denied a PaperMemory pairing request less than a minute ago, ...` and asks you whether to allow it.

Answer within 2 minutes. After that, the request expires and the card says "This pairing request has expired or was already answered.": ask the agent to try again.

### Find the paper in your Memory

Ask the agent to add a paper, with a reason:

```text
Add https://arxiv.org/abs/1706.03762 to PaperMemory: it is the Transformer paper we compare against.
```

PaperMemory's tools ask agents to search your Memory first, so that they do not add a paper you already have. Then open the PaperMemory popup and press ++a++ to see your Memory (or click **Full Memory** in popup Settings). The paper is there, with these tags:

- `review`, on every paper an agent adds, so you can find what you have not looked at yet;
- `proj-protein-lm-survey`, the project's tag;
- the tags the agent chose, if any.

Its note ends with a line that says which agent added it, and why: `Added by Claude Code: it is the Transformer paper we compare against.`

To list the papers agents added, type `t:review` in the Memory's search field and press ++tab++. Remove the `review` tag when you have looked at a paper.

If the paper was already in your Memory, PaperMemory does not make a copy. It adds the agent's tags, `review` and the project's tag to your paper, and keeps its note (without an `Added by` line) and details.

## Everyday use

### Things you can ask

| You say | What the agent does |
| --- | --- |
| "Find papers in my Memory about graph neural networks." | Searches your Memory. The search works like the Memory's search box: it matches words, not meanings, so the agent may try a few words. |
| "Add https://arxiv.org/abs/2010.11929: our baseline uses this model." | Searches first, then adds the paper with your reason. |
| "List this project's papers." | Lists the papers of the current project, oldest first. |
| "Export this project's bibliography as BibTeX to refs.bib." | Gets the project's BibTeX, in the same format as the options page's Export by tag, and writes the file. Papers without BibTeX are skipped and listed. |
| "Add the ResNet paper from my Memory to this project." | Attaches the paper to the project: it gets the project's tag. Attaching does not make it the agent's paper. |
| "Tag the Transformer paper with `baseline`." | Adds the tag. |
| "Add a note to it: we reuse the loss from section 3." | Appends the text to the paper's note. |
| "This paper is off-topic: flag it for deletion." | Adds the `to-delete` tag and the reason to its note. You delete it yourself. |
| "Remove the paper you added by mistake." | Deletes it, or flags it for you to delete (see [Deleting papers](#deleting-papers)). |

Agents add papers from their page on a site PaperMemory supports, such as arXiv or OpenReview (see [Venues](features.md#venues)). They can also give a DOI, as `10.…`, `doi:10.…` or a `https://doi.org/10.…` link: PaperMemory looks up the page the DOI leads to, and adds the paper from that page if its site is supported.

Some publishers, such as IEEE Xplore, refuse PaperMemory's requests when the page is not open in a tab: an agent cannot add their papers. Open the paper's page yourself: PaperMemory saves it, and the agent can then attach it to the project.

!!! note "Who added a paper, and why"

    When an agent adds a paper that was not in your Memory, PaperMemory appends `Added by <agent>: <reason>` to its note, unless the note has no room left for it (a note holds at most 20,000 characters). It also keeps the agent's name and reason with the paper for agents to read, also after you open or edit it.

### What agents can change

Agents can:

- search your Memory and read a paper's details, note and BibTeX;
- add papers, always with the `review` tag;
- attach papers from your Memory to the current project;
- add tags, except tags containing `proj-`, which is reserved for project tags;
- append text to a note (they never replace or erase a note);
- flag papers for deletion, and delete some papers they added (see below).

Agents cannot remove tags, change a paper's details, or read your settings, your Gist token or your backups.

### Deleting papers

An agent can delete a paper only if all of these are true:

- **it added the paper itself**: another agent's papers and yours are off limits;
- **in the same project**, in any session (without a project: in the same session only);
- **you have not opened or edited it since**: visiting its page, editing its note, tags, favourite or details, or PaperMemory replacing a preprint with its published version all make the paper yours.

For any other paper, the agent puts a **deletion flag**: the `to-delete` tag, and its reason at the end of the note, after `[to-delete]`. You decide. To see flagged papers, type `t:to-delete` in the Memory's search field and press ++tab++.

This way, an agent can clean up its own mistakes, but it cannot remove a paper you have looked at, or one another agent added.

## Projects

A **project** is the bibliography an agent keeps for one folder, across sessions. Every paper the agent adds or attaches in that folder belongs to the project and gets its tag.

### Which folder is the project

The project folder is the folder your agent reports to PaperMemory, or else the folder where the agent started. In practice: the folder where you start the agent, or the folder you open in Cursor.

PaperMemory recognizes a project by its folder's path. Renaming or moving the folder starts a new project.

### Naming a project

A project is named after its folder by default. To choose another name, add this line to the folder's `CLAUDE.md` or `AGENTS.md`:

```text
PaperMemory project: <name>
```

The agent reads the line and gives the name to PaperMemory. Agents usually offer to add it.

### The project tag

PaperMemory tags each paper of a project `proj-` followed by the project's name in lowercase, with dashes, cut to 40 characters: `Protein LM survey` gives `proj-protein-lm-survey`. If another project already uses that tag, a short code is added, as in `proj-protein-lm-survey-3f9a`. A name without letters or digits from a to z or 0 to 9 gets a code instead, as in `proj-3f9a1c2e`.

The tag is fixed when the project gets its first paper. Changing the project's name later does not change it.

!!! info "Renaming a project tag"

    The Project tag is fixed. You can rename or merge it in the options page, under Tags & matching → Tags. Agents keep applying the Project's original tag to new papers.

To filter a project's papers in your Memory, type `t:proj-protein-lm-survey` in the search field and press ++tab++.

### Folders without a project

There is no project when the agent works in:

- your home folder;
- the root of your disk (`/`);
- a folder inside `/Applications`;
- a temporary folder (such as `/tmp`).

These folders hold many unrelated things, so PaperMemory does not treat them as one project. There is no project either when you ask the agent to work without one.

Without a project, papers get no project tag, the agent cannot attach, list or export a project's papers, and it can delete its own additions only during the same session. The agent tells you why there is no project. To get one, start the agent from your project folder.

### Several agents in the same folder

Agents working in the same folder share the project and its tag. Each agent can only delete the papers it added itself. For the others' papers, it can only put a deletion flag.

## Several browsers or profiles

Each browser profile where you turn on Agent access is its own library, with its own Memory. You allow each agent once per profile.

When more than one is connected, the agent asks you which one to use. Answer with the browser, or with the label that `~/.papermemory/bin/papermemory-mcp libraries` shows, such as `Chrome · 3f9a1c` or `Firefox · 7b2e44`. If you only use one, turn Agent access off in the others.

- **Profiles of the same Chrome or Firefox**: nothing more to install. Turn on Agent access in each profile you want.
- **A Chrome started with its own data folder** (the `--user-data-dir` option): Chrome looks for the Native host inside that folder. Install with:

    ```sh
    npx -y papermemory-mcp install --user-data-dir <that folder>
    ```

- **A browser you installed after Step 1**: run the install again. It only sets up the browsers it finds.

## Managing access

### Paired clients

The options page lists the agents you allowed under **Agent access → Paired clients**, each with the date it was paired ("Paired on …") and a **Revoke** button. With none, it says "No paired clients yet."

### Revoking an agent

Click **Revoke**. PaperMemory refuses that agent's requests at once, including the changes it had waiting. If the agent tries again, a new pairing request opens: click **Deny** to keep it out.

### Turning Agent access off

Turn off **Enable Agent access**. PaperMemory closes the connection, and agents get the message `no PaperMemory library is connected`. A change an agent was making at that moment is not made: the agent gets `disabled: Agent access is off in PaperMemory's options`. The paired clients stay in the list, and work again when you turn Agent access back on, without a new pairing request.

## Update and uninstall

### Update

Update the agent tools when the options page says "PaperMemory agent tools outdated", or when an agent says so:

```sh
npx -y papermemory-mcp@latest install
```

It replaces the copy in `~/.papermemory/bin`, and asks again about each agent: `y` replaces PaperMemory's entry, `n` leaves it as it is. It keeps your pairings and your projects. Then start new agent sessions.

### Uninstall

```sh
npx -y papermemory-mcp uninstall
```

It removes what the installer created: the agent registrations, the browser files, the two skills, the settings files it created (when nothing else is in them) and the programs in `~/.papermemory`. It prints `Uninstalled PaperMemory agent access`.

It keeps the agents' keys (`~/.papermemory/clients`) and the project salt (`~/.papermemory/salt`), and tells you so:

```text
Kept your PaperMemory pairing keys and project salt in ~/.papermemory so a reinstall picks up where you left off. Run `npx -y papermemory-mcp uninstall --purge` to remove them too.
```

This is on purpose: after a reinstall, agents continue your projects with the same tags, and the agents you already allowed keep working, with no new pairing and no duplicate under Paired clients. To remove everything, including the keys and the salt, add `--purge`:

```sh
npx -y papermemory-mcp uninstall --purge
```

It then removes the whole `~/.papermemory` folder and reminds you: `Agents you paired are still listed in PaperMemory's options → Agent access → Paired clients: revoke them there.` `--purge` is the only flag `uninstall` accepts.

It keeps:

- your Memory, including the papers agents added and their tags;
- files it did not create, such as other entries in your agents' settings, or skill files you wrote;
- the Agent access switch and the Paired clients list in PaperMemory. Turn Agent access off and revoke the agents yourself.

After `uninstall --purge` the salt is gone, so agents cannot continue your projects after a reinstall: they start new ones. A new project with the same name as an old one gets a tag with a code added, such as `proj-protein-lm-survey-3f9a`. Agents also need to be allowed again.

If something cannot be removed, uninstall says what and ends with an error (exit code 1):

```text
Could not unregister Claude Code: `claude` is not on PATH, so its PaperMemory registration was not removed
Not removed: Claude Code registration. Fix the problem and run uninstall again.
```

Fix the problem, here by running the command in a Terminal where `claude` works, then run uninstall again. It only retries what is left.

## Troubleshooting

### In the terminal

| What you see | Why | What to do |
| --- | --- | --- |
| `command not found: npx` (or `node`) | Node.js is not installed, or this Terminal window was opened before you installed it. | Install Node.js 18 or newer (see [Before you start](#before-you-start)), then open a new Terminal window. |
| `Windows/Linux are not supported yet` | Agent access works on macOS only, for now. | None yet. |
| The installer does not ask about your agent. | It did not find the agent (see [Step 1](#step-1-install-the-agent-tools)). | Open a Terminal where the agent's command works (for example `claude --version`), or start Cursor once. Then run the install again. |
| `Could not register with <agent>: ...` | The agent's own command, or its settings file, failed. The rest of the install worked. | Read the end of the message and fix the problem. If it says `Cannot parse` and a file, that file has a syntax error. Then run the install again. |
| `Left <path> alone: a file we did not create is already there.` | A skill file that PaperMemory did not create is already there. PaperMemory never overwrites it. | Nothing. The message says where to copy PaperMemory's skill yourself, if you want it. |
| `Left <path> alone: it is a symlink.` | That skill folder is a link to another folder. PaperMemory does not write through links. | Same as above. |
| `Invalid --extension-id: <id>` | An extension id is 32 letters, from a to p. | Copy the id again from `chrome://extensions`. |
| ``Missing <file>; run `npx -y papermemory-mcp install` `` | The copy of the tools you ran is incomplete. | Run `npx -y papermemory-mcp install`. |
| `no such file or directory: /Users/you/.papermemory/bin/papermemory-mcp` | The agent tools are not installed. | Go to [Step 1](#step-1-install-the-agent-tools). |
| `Not removed: ... Fix the problem and run uninstall again.` | Uninstall could not remove everything. | See [Uninstall](#uninstall). |
| macOS asks whether "node" may access files in your Documents, Desktop or Downloads folder. | The agent tools run with Node.js, which macOS calls "node". macOS asks the first time a program reads these folders, for example when your project folder is in one of them. | Click **Allow** if you work in that folder with your agent. macOS then allows every program that this Node.js runs. To avoid the question, keep project folders elsewhere, such as `~/research`. You can change your answer in System Settings → Privacy & Security → Files and Folders. |

### In the options page

| What you see | Why | What to do |
| --- | --- | --- |
| PaperMemory agent tools not installed | Your browser could not start the Native host. Usually the agent tools are not installed. It also happens when: you installed this browser after the tools; Chrome runs with its own `--user-data-dir`; no Node.js 18 or newer was found (the last line of `~/.papermemory/logs/wrapper.log` then ends with `no usable node (>= 18) found`). | Run the install (again), with `--user-data-dir <folder>` if needed, or install Node.js. PaperMemory tries again by itself within about a minute; you can also turn the switch off and on. |
| PaperMemory agent tools outdated | The agent tools are too old for this version of PaperMemory. | Run `npx -y papermemory-mcp@latest install`, then start new agent sessions. |
| PaperMemory is older than the agent tools | The extension is too old for the agent tools. | Update the extension. Browsers do it by themselves, usually within a day. To do it now: in Chrome, open `chrome://extensions`, turn on Developer mode and click **Update**; in Firefox, open `about:addons`, click the gear and **Check for Updates**. |
| Permission refused | You refused the browser's permission. The switch turned itself off. | Turn it on again, and click **Allow**. |
| The options page closed and opened again (Chrome). | Normal, once: Chrome restarts PaperMemory to use the new permission. | Click **Agent access** again. Reload paper tabs that were open. |
| No status line, for more than a minute | PaperMemory did not manage to connect, and got no error. | Quit the browser and open it again. |
| "This pairing request has expired or was already answered." | The request expired (2 minutes after it opened), the agent's session ended, or you had already answered. | Ask the agent to try again. |
| The same agent twice under Paired clients | It was allowed again, for example after you reinstalled the agent tools following `uninstall --purge`, which deletes the agents' keys. The older entry is no longer used. | Revoke the older one: see its "Paired on" date. |

### In your agent's answers

Agents often repeat PaperMemory's messages in their own words. The word before the colon, when there is one, is the error's code.

| What you see | Why | What to do |
| --- | --- | --- |
| The agent has no PaperMemory tools, or does not know PaperMemory. | The session started before the install, PaperMemory is not registered with this agent, or the tools cannot start. | Start a new session. [Check the install](#check-the-install). If the agent says that PaperMemory failed to start, see `~/.papermemory/logs/wrapper.log`. |
| `no PaperMemory library is connected` | No browser with Agent access on is connected: the browser is closed, Agent access is off, or it is not connected. | Open the browser, and check that the status says Connected. `~/.papermemory/bin/papermemory-mcp libraries` should list it. |
| `several PaperMemory libraries are connected, name one: ...` | Agent access is on in more than one browser profile. | Tell the agent which one (see [Several browsers or profiles](#several-browsers-or-profiles)). |
| `no connected PaperMemory library matches "..."` or `"..." matches several PaperMemory libraries` | The agent named a library that is not connected, or a name that fits several. | Open that browser, or tell the agent a label from the list it shows. |
| `PaperMemory's install is incomplete (~/.papermemory/salt is missing): ...` | A file of the install is missing. | Run `npx -y papermemory-mcp@latest install`. |
| `protocol-mismatch: Update the PaperMemory extension` or `unknown-op: Unknown operation` | The extension is too old for the agent tools. | [Update the extension](#in-the-options-page). |
| ``protocol-mismatch: Run `npx -y papermemory-mcp@latest install` `` | The agent tools are too old for the extension. | Run it, then start a new agent session. |
| `unauthorized: PaperMemory no longer accepts <agent>: the user must pair it again (...)` | You revoked the agent, or PaperMemory no longer knows it (for example after you reinstalled the extension). | Its next call opens a new pairing request: allow it, or deny it to keep it out. |
| `disabled: Agent access is off in PaperMemory's options` | You turned Agent access off while the agent was making a change: the change was not made. The agent stays allowed. | Turn Agent access back on, then ask the agent to try again. |
| `pairing-required`, with "PaperMemory needs your OK to let <agent> use it: switch to <browser> and click **Allow** on the PaperMemory tab that just opened (the request stays open for 2 minutes)." | This agent is not allowed in this browser profile yet (or no longer): PaperMemory opened a pairing tab. | Click **Allow** on that tab within 2 minutes (see [Allow the agent](#allow-the-agent)), then tell the agent to go on. |
| `denied: The user denied this client access` | You clicked Deny. | If it was a mistake, wait one minute and ask the agent to try again. |
| `rate-limited: The user denied a PaperMemory pairing request less than a minute ago, ...` | After a Deny, PaperMemory refuses pairing requests for one minute. | To allow the agent, wait one minute and ask it to try again. |
| `rate-limited: At most 30 changes per minute` | Each agent can make 30 changes per minute. | Wait one minute. |
| `busy: Another PaperMemory pairing request is waiting for the user in <browser>. ...` | PaperMemory shows one pairing request at a time. | Answer the pairing card that is already open. |
| `busy: PaperMemory has too many changes waiting: try again later` or `busy: PaperMemory was busy with other changes: try again later` | Agents asked for many changes at once. | Wait a little, then try again. |
| `timeout: The user did not answer the pairing request in time` | Nobody clicked Allow or Deny within 2 minutes. | Ask the agent to try again, and watch for the new tab. |
| `internal: PaperMemory could not open its pairing prompt` | PaperMemory could open neither a tab nor a window for its pairing card. | Open a window of that browser, then ask the agent to try again. |
| `timeout: PaperMemory did not answer ... in time` or `timeout: PaperMemory did not finish this change in time` | The browser took too long, for example because it was busy or the Mac was asleep. | Try again. If it keeps happening, check the status in the options page, or restart the browser. |
| `timeout-may-complete`, with "PaperMemory did not finish adding this paper in time, but it may still store it later" | Adding the paper took more than 90 seconds. It may still appear. | Ask the agent to search for it before adding it again. |
| `failed`, with "PaperMemory could not add this paper" | PaperMemory could not read the paper's page: the site was down or refused, or its page changed. OpenReview sometimes refuses automated requests and asks for a challenge instead; IEEE Xplore refuses requests for pages that are not open in a tab. | Try again later, or give the agent another page of the same paper, such as its arXiv page. For OpenReview or IEEE Xplore, open the page yourself: if PaperMemory saves it, ask the agent to attach it to the project. |
| `unsupported-url` | The link is not a paper page on a site PaperMemory supports. For a DOI, the answer gives the page the DOI leads to (`resolvedUrl`), or says `DOI could not be resolved`: doi.org does not know the DOI, or could not be reached. | Give the agent the paper's page on a [supported site](features.md#venues). |
| `not-own-addition: You did not add this paper in this project: use flag_for_deletion` | The agent may not delete this paper (see [Deleting papers](#deleting-papers)). | Nothing: the agent flags it, and you delete it yourself. |
| `no-project: This session has no Project: see get_project` | The agent works without a project (see [Folders without a project](#folders-without-a-project)). | Start the agent from your project folder. |
| `not-found: No paper has this id` | The paper is no longer in your Memory, or the agent used a wrong id. | Ask the agent to search again. |
| `bad-args: ...` | The agent sent something PaperMemory refuses, such as a tag containing `proj-`, or a text that is too long. The message says which rule. | The agent usually fixes it by itself. |
| `too-large: The BibTeX export exceeds 900000 bytes` or `too-large: The answer exceeds 1 MiB` | Too much to send at once. | Export the project's tag from the options page: Import & export → Export by tag. |
| `internal: ...`, such as `PaperMemory could not complete this operation` or `connection closed before a reply` | Something unexpected happened, or the browser closed during the request. | Try again. If it keeps happening, [open an issue](https://github.com/vict0rsch/PaperMemory/issues). |

## Syncing with a Gist

If you use [Gist sync](features.md#gist-sync), agents' changes sync like yours. Sync is last-writer-wins: if another computer uploads its Memory first, a paper an agent just added here can be lost, exactly like one of your edits.

Project tags travel with your Memory. Projects themselves are per computer: an agent on another computer starts its own project, even for a folder with the same name.

## Privacy

- Agent access is off by default. While it is off, nothing can connect.
- While it is on, the agents you allow can read your whole Memory: titles, authors, notes, tags and BibTeX. They may send what they read to the company that runs their AI model.
- Agent access uses no server. The connection is a local socket, a file in `~/.papermemory/sock`, that only your user account can open. Web pages cannot reach it.
- Agents cannot read or change your settings, your Gist token or your backups.
- You allow each agent once per browser profile, and you can revoke it at any time. To stop everything, turn Agent access off.

??? note "What Agent access does not protect against"

    - A harmful program that runs under your user account can read the agents' keys and the salt in `~/.papermemory`, and PaperMemory's data in your browser's files.
    - All supported agents can run commands on your Mac. An agent tricked by text it read could use them to get around PaperMemory's limits. In the worst case, it deletes papers that agents added. It can never delete papers you added, opened or edited: those, it can only flag.

See also the [Privacy Policy](privacy-policy.md).

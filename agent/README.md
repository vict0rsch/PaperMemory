# papermemory-mcp

Lets local AI agents (Claude Code, Codex, Cursor, OpenCode, Oh-My-Pi) search and add papers in your PaperMemory library.

## Install

```sh
npx -y papermemory-mcp install
```

Then turn on **Agent access** in PaperMemory's options.

## Update

```sh
npx -y papermemory-mcp@latest install
```

## Uninstall

```sh
npx -y papermemory-mcp uninstall
```

See [docs/agents.md](../docs/agents.md) for details.

## Testing a development build

For contributors. `papermemory-mcp` is not on npm until it is released, so `npx -y papermemory-mcp install` does not work yet: build from your clone and run the CLI from it.

1. Build the extension and the agent tools:

    ```sh
    npm install && npm run build               # repository root: dist/chrome-mv3 and dist/firefox-mv2
    cd agent && npm install && npm run build   # agent/dist/cli.mjs and agent/dist/host.mjs
    ```

    This is a normal build: the browser asks for the permission, and PaperMemory asks you to allow each agent, as it does for users.

2. Load the build in a browser profile. Disable the store version of PaperMemory in that profile first, so that only one PaperMemory connects.
    - **Chrome**: open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose `dist/chrome-mv3`. Copy the 32-letter ID shown on its card.
    - **Firefox Developer Edition**: open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and choose `dist/firefox-mv2/manifest.json`. It has the store version's ID, so it needs no `--extension-id`. Firefox removes it when it quits.

3. Install the agent tools from the repository root:

    ```sh
    node agent/dist/cli.mjs install --extension-id <id>   # Chrome
    node agent/dist/cli.mjs install                       # Firefox
    ```

    `--extension-id` adds the unpacked extension's ID to the Chrome host manifests, next to the store ID; later installs keep it. For a Chrome started with `--user-data-dir <dir>`, add `--user-data-dir <dir>`.

    A clone under `~/Documents` is fine: `install` copies the host and the CLI to `~/.papermemory/bin` and points the browsers and agents there, so they never run anything from your clone (a host under `~/Documents` would wait on a macOS privacy prompt). After you change agent code, run `npm run build` in `agent/` and `install` again, then start a new agent session.

4. Turn on Agent access in the development build's options page (Step 2 of [docs/agents.md](../docs/agents.md)), then use an agent as in its Step 3.

5. Remove everything the same way:

    ```sh
    node agent/dist/cli.mjs uninstall
    ```

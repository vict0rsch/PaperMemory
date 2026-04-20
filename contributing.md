# Contributing

## About

PaperMemory is pure JS+HTML with minimal dependencies: no framework, (almost) no external dependencies so it's easy to help :)

The only external deps are [`select2.js`](https://select2.org/) (which requires `jQuery`) -- both installed via npm.

The project uses modern ES modules and [WXT](https://wxt.dev/) for bundling, dev server, manifest generation, and cross-browser packaging.

## Set-up

1. [Install `npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) (Node.js 22+ recommended)
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Load the extension in Chrome from `dist/chrome-mv3/` (see [Loading the extension](#loading-the-extension))
5. Edit files — WXT auto-reloads!

## What is WXT?

[WXT](https://wxt.dev/) is a framework for building browser extensions:

- **Bundling**: Uses Vite under the hood to bundle ES modules
- **Manifest generation**: Writes `manifest.json` automatically from `wxt.config.js` (Chrome MV3 and Firefox MV2)
- **Dev server**: Hot module reloading with `npm run dev`
- **Zip packaging**: `npm run zip` produces ready-to-submit archives for both browsers

You do **not** need to know WXT internals to contribute. The key thing to know is that WXT discovers entry points from `src/entrypoints/` and builds them into `dist/`.

## Build commands

```bash
npm run dev              # Dev server for Chrome (HMR, auto-reload)
npm run dev:firefox      # Dev server for Firefox

npm run build            # Production build for Chrome + Firefox
npm run build:chrome     # Production build for Chrome only
npm run build:firefox    # Production build for Firefox only

npm run zip              # Build + zip for both browsers
npm run zip:chrome       # Build + zip for Chrome only
npm run zip:firefox      # Build + zip for Firefox only
```

Build output goes to `dist/chrome-mv3/` and `dist/firefox-mv2/`.

## Loading the extension

### Chrome

1. Run `npm run dev` (or `npm run build:chrome`)
2. Open `chrome://extensions/`, enable "Developer mode"
3. Click "Load unpacked" and select the `dist/chrome-mv3/` directory
4. The extension auto-reloads on file changes when using `npm run dev`

### Firefox

1. Run `npm run dev:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. Click "Load Temporary Add-on" and select any file inside `dist/firefox-mv2/`

More info: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## Refreshing the extension

When using `npm run dev`:

- **Popup / options / fullMemory changes**: Auto-reload via HMR
- **Background script changes**: WXT reloads the service worker automatically
- **Content script changes**: Require refreshing the web page where the content script runs

### Debugging utilities (`PMDebug`)

A global `PMDebug` object is available in all HTML pages (popup, options, fullMemory, bibMatcher) for inspecting internal state from the browser console:

```javascript
PMDebug.config.state; // Global state (papers, prefs, etc.)
PMDebug.config.state.papers; // All stored papers
PMDebug.data.getStorage(); // Raw chrome.storage access
PMDebug.urls.parseIdFromUrl("https://arxiv.org/abs/2301.12345");
PMDebug.paper.isPaper("https://arxiv.org/abs/2301.12345");
PMDebug.listAllFunctions(); // Discover everything available
```

Available modules: `config`, `functions`, `miniquery`, `data`, `paper`, `bibtexParser`, `sync`, `state`, `urls`, `files`, `templates`, `handlers`, `memory`.

The debug system is implemented in `src/debug/debug.js` and imported by each entry point's `main.js`.

## Conventions

### File structure

```
├── wxt.config.js         ➤ WXT + Vite config (manifest, aliases, HTML include plugin)
├── jsconfig.json         ➤ VS Code config with path aliases (@pm, @pmu)
├── public/               ➤ Static assets copied verbatim to build output
│   ├── theme.js          ➤ Dark mode detection (runs before modules, loaded via <script>)
│   ├── data/             ➤ JSON data files (journals, abbreviations, art)
│   ├── icons/            ➤ Extension icons
│   ├── *.css             ➤ Stylesheets loaded at runtime via <link> or chrome.runtime.getURL
│   └── highlight.min.js  ➤ Code highlighting library (options page)
│
└── src/
    ├── entrypoints/              ➤ WXT entry points (only these are built into the extension)
    │   ├── background.js         ➤ Service worker — wrapped in defineBackground()
    │   ├── content.js            ➤ Content script — wrapped in defineContentScript()
    │   ├── popup/                ➤ Extension popup
    │   │   ├── index.html        ➤ Popup HTML (uses <!--=include --> for partials)
    │   │   └── main.js           ➤ Imports jquery-setup + popup.js + debug.js
    │   ├── options/              ➤ Advanced settings page
    │   │   ├── index.html
    │   │   └── main.js
    │   ├── fullMemory/           ➤ Full-page paper memory view
    │   │   ├── index.html
    │   │   └── main.js
    │   └── bibMatcher/           ➤ BibTeX matching tool
    │       ├── index.html
    │       └── main.js
    │
    ├── popup/                    ➤ Popup source code (NOT moved — shared across builds)
    │   ├── js/
    │   │   ├── popup.js          ➤ Main popup logic and initialization
    │   │   ├── handlers.js       ➤ Event handlers (clicks, keyboard, forms)
    │   │   ├── memory.js         ➤ Memory table display, search, sorting
    │   │   └── templates.js      ➤ HTML string templates for dynamic content
    │   └── html/
    │       ├── menu.html         ➤ Settings menu partial
    │       ├── modals/           ➤ Dialog partials (user guide, warnings)
    │       └── svgs/             ➤ SVG icon partials
    │
    ├── background/
    │   └── background.js         ➤ Background logic (sync, notifications, browser APIs)
    ├── content_scripts/
    │   ├── content_script.js     ➤ Paper detection on web pages
    │   └── content_script.css    ➤ Injected page styles
    ├── debug/
    │   └── debug.js              ➤ PMDebug global — imports all modules for console access
    ├── options/                  ➤ Options page logic
    ├── fullMemory/               ➤ Full memory page logic
    ├── bibMatcher/               ➤ BibTeX matcher logic
    │
    └── shared/                   ➤ Shared utilities and resources
        ├── js/
        │   ├── jquery-setup.js   ➤ jQuery + select2 global setup (import $ from 'jquery')
        │   └── utils/            ➤ Core modules (the heart of PaperMemory)
        │       ├── config.js     ➤ Global state, constants, paper source definitions
        │       ├── functions.js  ➤ Utility functions (logging, clipboard, string ops)
        │       ├── miniquery.js  ➤ DOM utilities (findEl, setHTML, addListener)
        │       ├── data.js       ➤ Storage, validation, data migrations
        │       ├── paper.js      ➤ Paper CRUD, URL conversions
        │       ├── parsers.js    ➤ Website-specific paper parsers
        │       ├── state.js      ➤ App state initialization, sorting
        │       ├── sync.js       ➤ GitHub Gist sync
        │       ├── urls.js       ➤ URL parsing and paper ID extraction
        │       ├── files.js      ➤ Local file detection
        │       └── bibtexParser.js ➤ BibTeX parsing and formatting
        └── css/                  ➤ Shared stylesheets (variables, loader animations)
```

### How WXT entry points work

WXT uses a **file-based convention** in `src/entrypoints/`:

- `background.js` → background service worker
- `content.js` → content script (injected into web pages)
- `popup/index.html` → popup page (the `main.js` next to it is the `<script>` entry)
- `options/index.html` → options page
- etc.

Each HTML entry point's `main.js` is a thin wrapper that imports:

1. `@pm/shared/js/jquery-setup.js` — sets up `window.$` globally
2. The actual page logic (e.g. `@pm/popup/js/popup.js`)
3. `@pm/debug/debug.js` — exposes `PMDebug` to the console

The background and content-script entry points (`src/entrypoints/background.js` and `src/entrypoints/content.js`) are thin wrappers around the canonical source files:

- `src/background/background.js` exports `initBackground()` — the background entry point calls it inside `defineBackground()`
- `src/content_scripts/content_script.js` exports `initContentScript()` — the content entry point calls it inside `defineContentScript()`

All logic lives in those canonical files; the entry-point wrappers contain only the WXT boilerplate (`defineBackground`/`defineContentScript` with the right configuration).

### Path aliases

Two aliases are configured in `wxt.config.js` (for Vite/WXT) and `jsconfig.json` (for VS Code):

- `@pm` → `src/` (e.g. `import "@pm/popup/js/popup.js"`)
- `@pmu` → `src/shared/js/utils/` (e.g. `import { log } from "@pmu/functions.js"`)

### HTML includes

The popup HTML uses `<!--=include path -->` directives to inline partial HTML files (menu, modals, SVGs). A custom Vite plugin in `wxt.config.js` processes these at build time.

### jQuery / select2

jQuery and select2 are installed via npm. A single file `src/shared/js/jquery-setup.js` imports them and sets `window.$ = window.jQuery`. This file is imported once at the top of each HTML entry point's `main.js`.

### Static assets (`public/`)

Files in `public/` are copied as-is to the build output. Use this for:

- CSS loaded dynamically via `chrome.runtime.getURL()` (e.g. `dark.css`)
- JSON data files accessed at runtime (e.g. `data/cell.json`)
- `theme.js` (loaded via `<script src="/theme.js">` before modules)

### Key source files for contributors

**Core Logic** (`src/shared/js/utils/`):

- `config.js` — Global state and settings. Start here to understand data structures.
- `functions.js` — Utility functions used everywhere.
- `data.js` — How papers are stored, validated, and migrated between versions.
- `parsers.js` — Add new paper sources here. Contains website-specific parsing logic.
- `paper.js` — Paper object operations. How papers are created, updated, and linked.

**User Interface** (`src/popup/js/`):

- `popup.js` — Main popup logic. How the extension popup initializes and displays papers.
- `memory.js` — Memory table functionality. Search, sorting, and display of saved papers.
- `handlers.js` — User interactions. Button clicks, keyboard shortcuts, form handling.

**Background Processing**:

- `src/background/background.js` — Handles sync, notifications, and browser API calls.
- `src/content_scripts/content_script.js` — Automatically detects papers when browsing websites.

### Prettier

Prettier is used for consistent formatting. The config lives in `.prettierrc`:

- **4 spaces** for indentation (`tabWidth: 4`, `useTabs: false`)
- **88 character** print width
- YAML files use 2-space indentation

Run the formatter with:

```bash
npx prettier --write .
```

Most editors can auto-format on save with the Prettier extension. For VS Code, install the [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) extension.

## Adding a paper source

The following functions and constants should be updated:

- `config.js:global.knownPaperPages` with `source: {patterns: [array of url matches to trigger paper parsing, or boolean functions taking it as input], name: displayName}`
    - will be used by `paper.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
- `parsers.js:makePaper()` to create a new entry
    - Typically, add a parser function in `parsers.js`
- `state:parseIdFromUrl()`
- `paper.js:paperToAbs()` and `paper.js:paperToPDF()` to enable to pdf<->webpage button
- `functions.js:getDisplayId()` if necessary
- `functions.js:isPdfUrl()` if necessary
- `test/data/urls.json` to test that the integration works (and keeps working!)

## Creating a new paper attribute

1. Add an entry in `data.js:validatePaper`
2. Add a default value to other papers in `data.js:migrateData`

## Tests

Tests use Puppeteer to launch a real Chrome instance with the extension loaded. `npm test` builds the extension first (`pretest` runs `npm run build:chrome`), then runs all test suites.

```bash
npm test                                 # Build + run all tests
npm run test:file test/test-utils.js     # Run a single test file (no auto-build)
npm run test:file test/test-menu.js test/test-popup-paper-ui.js  # Run multiple files
```

Environment variables (see `test/test-storage.js`):

```bash
headless=false onlySources=arxiv,neurips npm run test:file test/test-storage.js
```

## Github Workflows

The repo has five workflow files under `.github/workflows/`:

| File                             | Trigger                | What it does                                                                                  |
| -------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| `build.yml`                      | `push`, `pull_request` | Builds Chrome + Firefox to catch build regressions                                            |
| `test.yml`                       | `push`                 | Runs the full test matrix and the storage tests                                               |
| `submit.yml`                     | Manual dispatch only   | Builds, tests, and submits to the Chrome Web Store and Firefox Add-ons                        |
| `_test-matrix.yml`, `_build.yml` | `workflow_call` only   | Reusable workflows consumed by the above (the leading `_` signals "not a top-level workflow") |

`build.yml` and `test.yml`'s `test-matrix` job are thin wrappers that delegate to the reusable workflows — the actual steps live in `_build.yml` and `_test-matrix.yml`, so `submit.yml` can reuse `_test-matrix.yml` as its test gate without duplicating configuration.

### Submitting to the stores (`submit.yml`)

This workflow submits to the Chrome Web Store and Firefox Add-ons via [`wxt submit`](https://wxt.dev/guide/essentials/publishing.html). **It only runs when triggered manually** — there is no automatic submission on release, so publishing to the stores is always a deliberate act.

**What it does on every run, in order:**

1. Runs the reusable `_test-matrix.yml` workflow as a gate — the submit job only runs if all tests pass.
2. `npm ci` + `npm run zip` to produce the Chrome zip, the Firefox zip, and the Firefox sources zip under `dist/`.
3. Submits to Chrome and/or Firefox, each in a separate step with only that store's secrets in scope.

**How to run it.** On the Actions page, pick "Submit to stores" → "Run workflow". Two inputs:

- `target` — `both` (default), `chrome`, or `firefox`. Submits only to the selected store(s).
- `dry_run` — default `true`. Passes `--dry-run` to `wxt submit`, which validates credentials without actually uploading. Use this to verify secrets are wired up correctly, or as a first step after rotating tokens. Set to `false` to perform a real submission.

Before running with `dry_run: false`, make sure `package.json`'s `version` has been bumped — `wxt.config.js` reads the manifest version from `package.json`, so whatever is on the ref selected in the "Run workflow" dialog at dispatch time is what the stores will receive.

**Retrying a partial failure.** If Chrome succeeds and Firefox fails (or vice versa), re-dispatch manually with `target` set to the failed store. Only that side will be re-submitted; the already-successful side is untouched.

**Required secrets** (repo settings → Secrets and variables → Actions):

- Chrome: `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN`
- Firefox: `FIREFOX_EXTENSION_ID`, `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET`
- Tests: `VICT0RSCH_GITHUB_PAT` (used by the test matrix for GitHub API calls)

Each secret is only exposed to the step that needs it, so a compromised Chrome step cannot leak Firefox credentials and vice versa.

**Local equivalents** (useful for debugging credentials without going through CI):

```bash
npm run submit                       # Both stores
npm run submit:chrome                # Chrome only
npm run submit:firefox               # Firefox only
npm run submit:dry-run               # Both stores, dry run
npm run submit:chrome:dry-run        # Chrome only, dry run
npm run submit:firefox:dry-run       # Firefox only, dry run
```

These scripts read credentials from a local `.env.submit` file (see WXT's [publishing docs](https://wxt.dev/guide/essentials/publishing.html)). **Never commit `.env.submit`** — it's in `.gitignore`.

### Concurrency

`submit.yml` uses a `submit-stores` concurrency group (no cancellation), so overlapping manual dispatches queue up instead of racing each other.

## Building the documentation

We use [MkDocs](https://www.mkdocs.org/) to build the documentation, with the [Material theme](https://squidfunk.github.io/mkdocs-material/).

You'll need `cairo` to build the documentation (`brew install cairo`).

```
pip install mkdocs-material[imaging]
```

```
mkdocs serve
```

### Known issue

```
"cairosvg" Python module is installed, but it crashed with:
           no library called "cairo-2" was found
           no library called "cairo" was found
           no library called "libcairo-2" was found
...
```

Solution (from [MKDocs' troubleshooting guide](https://t.ly/MfX6u)):

```bash
export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib
mkdocs serve
```

<!-- mkdocs gh-deploy -->

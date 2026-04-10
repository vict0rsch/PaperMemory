# Contributing

## About

PaperMemory is pure JS+HTML with minimal dependencies: no framework, (almost) no external dependencies so it's easy to help :)

The external deps are [`select2.js`](https://select2.org/) which requires `JQuery`. jQuery is also used directly in a few places (popup handlers, options page). Custom DOM helpers live in `src/shared/js/utils/miniquery.js` and coexist with jQuery.

The project uses modern ES modules with Rollup for bundling to make development contributor-friendly. Chrome and Firefox builds are both handled by the [`extension`](https://www.npmjs.com/package/extension) CLI, integrated into the Rollup workflow.

## Set-up

1. [Install `npm`](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm)
2. Install dependencies: from the root of this repo `$ npm install`
3. Start development: `$ npm run dev:watch`
4. Edit files!

The build system uses Rollup to bundle ES modules for browser compatibility. In development mode, you get:

-   Automatic rebuilds when files change (via Rollup watch)
-   Live extension reloading (via `extension dev`)
-   Source maps for debugging
-   Unminified code for easier debugging

## Build Commands

```bash
npm run dev         # One-time development build
npm run dev:watch   # Development build with file watching + extension dev server
npm run build       # Production build (Chrome + Firefox zips via `extension build`)
```

In production, `npm run build` sets `NODE_ENV=production` and the Rollup config automatically triggers `extension build` to produce zipped Chrome and Firefox packages.

### Debugging Utilities

PaperMemory includes a comprehensive debugging system that's automatically available in development mode:

#### Debug Bundle (`PMDebug`)

In development builds, a global `PMDebug` object is automatically injected into all contexts (popup, content scripts, options pages, etc.) giving you access to all internal functions:

```javascript
// Access utility modules
PMDebug.data.getStorage(); // Storage operations
PMDebug.functions.log("Debug message"); // Logging utilities
PMDebug.miniquery.findEl({ element: "elementId" }); // DOM utilities
PMDebug.paper.addOrUpdatePaper(); // Paper operations
PMDebug.config.state; // Global state

// Quick shortcuts for common functions
PMDebug.getStorage(); // → PMDebug.data.getStorage()
PMDebug.log(); // → PMDebug.functions.log()
PMDebug.findEl(); // → PMDebug.miniquery.findEl()

// Discover all available functions
PMDebug.listAllFunctions();
```

#### Available Debug Modules

-   **`PMDebug.config`** - Global state, constants, and configuration
-   **`PMDebug.functions`** - Utility functions (logging, string parsing, etc.)
-   **`PMDebug.miniquery`** - DOM utilities (findEl, setHTML, etc.)
-   **`PMDebug.data`** - Storage, preferences, and data validation
-   **`PMDebug.paper`** - Paper operations (creation, updates, conversions)
-   **`PMDebug.bibtexParser`** - BibTeX parsing and formatting
-   **`PMDebug.sync`** - GitHub sync functionality
-   **`PMDebug.state`** - App state management and initialization
-   **`PMDebug.urls`** - URL parsing and paper ID extraction
-   **`PMDebug.files`** - Local file detection and PDF management
-   **`PMDebug.templates`** - HTML string templates (popup context only)
-   **`PMDebug.handlers`** - Event handlers (popup context only)
-   **`PMDebug.memory`** - Memory display logic (popup context only)

#### Common Debugging Tasks

```javascript
// Check current papers in memory
PMDebug.config.state.papers;

// Manually parse a URL
PMDebug.urls.parseIdFromUrl("https://arxiv.org/abs/2301.12345");

// Test storage operations
await PMDebug.getStorage();
await PMDebug.setStorage({ test: "value" });

// Debug DOM elements
PMDebug.setHTML({ element: "element-id" }, "<p>Debug content</p>");
// Find an element based on its class *within* a memory item
PMDebug.miniquery.findEl({
    paperId: "Arxiv-1703\\.10593",
    memoryItemClass: "memory-item-link",
});

// Test paper operations
PMDebug.paper.isPaper("https://arxiv.org/abs/2301.12345");
```

#### Implementation Details

The debug bundle is:

-   **Development-only**: Automatically built and injected only when `NODE_ENV !== "production"`
-   **Context-aware**: Available in popup, content scripts, options pages, etc.
-   **Zero production impact**: Completely absent from production builds
-   **Auto-discovery**: Use `PMDebug.listAllFunctions()` to explore available functions

The debug system is implemented in `src/debug/debug.js` and configured in `rollup.config.js`.

### Refreshing the extension

**Chrome Extensions automatically reload** when you make changes to the source files:

-   **Popup changes**: Take effect immediately, no refresh needed
-   **Content script changes**: Require refreshing the extension in `chrome://extensions/` and then refreshing any web pages where you want to see the changes

The `npm run dev:watch` command will automatically rebuild files when you save changes.

## Loading in Firefox

https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/

## Conventions

### File structure

```tree
├── jsconfig.json ➤➤➤ VS Code config with ES modules and path aliases (@pm, @pmu)
├── rollup.config.js ➤➤➤ Build configuration that bundles ES modules for browsers
├── .prettierrc ➤➤➤ Prettier config (tabWidth: 4, printWidth: 88, YAML tabWidth: 2)
├── register.mjs ➤➤➤ ESM loader registration (for test runner)
├── loader.mjs ➤➤➤ Custom ESM loader resolving @pm/* and @pmu/* aliases in Node
└── src ➤➤➤ Source code (all ES modules)
    ├── manifest.json ➤➤➤ Extension configuration for Chrome/Firefox (MV3)
    ├── background ➤➤➤ Service worker (runs in background)
    │   ├── background.js ➤➤➤ Main background script - handles browser APIs, sync, parsing
    │   └── background.bundle.js ➤➤➤ [Generated] Bundled for browser
    ├── content_scripts ➤➤➤ Scripts injected into web pages
    │   ├── content_script.js ➤➤➤ Runs on paper websites - detects/parses papers automatically
    │   ├── content_script.css ➤➤➤ Styles for notifications and UI injected into pages
    │   └── content.bundle.js ➤➤➤ [Generated] Bundled for browser
    ├── data ➤➤➤ JSON configuration files
    │   ├── journal-abbreviations.json ➤➤➤ Journal name mappings for citations
    │   ├── iso4-journals.json ➤➤➤ Standard journal abbreviations
    │   ├── art.json ➤➤➤ Article types for parsing
    │   └── cell.json ➤➤➤ Cell journal specific configurations
    ├── popup ➤➤➤ Extension popup interface (main UI)
    │   ├── css ➤➤➤ Stylesheet sources
    │   │   ├── popup.css ➤➤➤ Main popup styling
    │   │   ├── dark.css ➤➤➤ Dark mode theme
    │   │   ├── options.css ➤➤➤ Settings toggles and checkboxes
    │   │   └── select2.min.css ➤➤➤ [External] Dropdown styling library
    │   ├── html ➤➤➤ HTML templates and components
    │   │   ├── popup.html ➤➤➤ Main popup HTML structure
    │   │   ├── menu.html ➤➤➤ Settings menu template
    │   │   ├── modals/ ➤➤➤ Dialog templates (user guide, warnings, etc.)
    │   │   └── svgs/ ➤➤➤ SVG icon components
    │   ├── js ➤➤➤ ES modules for popup functionality
    │   │   ├── popup.js ➤➤➤ Main entry point - initializes popup, handles paper display
    │   │   ├── handlers.js ➤➤➤ Event handlers for buttons, keyboard shortcuts, user actions
    │   │   ├── memory.js ➤➤➤ Memory display logic - table rendering, search, sorting
    │   │   ├── templates.js ➤➤➤ HTML string templates for dynamic content
    │   │   └── select2.min.js ➤➤➤ [External] Tag selection library
    │   └── min/ ➤➤➤ [Generated] Build output
    ├── options ➤➤➤ Advanced settings page
    │   ├── options.js ➤➤➤ Settings page logic - preferences, data management, sync setup
    │   ├── options.html ➤➤➤ Settings page HTML
    │   ├── options.css ➤➤➤ Settings page styling
    │   ├── github*.css ➤➤➤ Code syntax highlighting themes
    │   ├── highlight.min.js ➤➤➤ [External] Code highlighting library
    │   └── options.bundle.js ➤➤➤ [Generated] Bundled for browser
    ├── bibMatcher ➤➤➤ BibTeX matching tool
    │   ├── bibMatcher.js ➤➤➤ Tool to match ArXiv papers to published versions
    │   ├── bibMatcher.html ➤➤➤ BibTeX matcher page HTML
    │   ├── testBibs.js ➤➤➤ Sample BibTeX entries for testing
    │   └── bibMatcher.bundle.js ➤➤➤ [Generated] Bundled for browser
    ├── fullMemory ➤➤➤ Full-page memory view
    │   ├── fullMemory.js ➤➤➤ Dedicated tab for browsing your paper memory
    │   ├── fullMemory.html ➤➤➤ Full-page memory HTML
    │   └── fullMemory.bundle.js ➤➤➤ [Generated] Bundled for browser
    ├── debug ➤➤➤ Development debugging utilities
    │   ├── debug.js ➤➤➤ Debug entry point - exports all utilities as PMDebug global
    │   └── debug.bundle.js ➤➤➤ [Generated] Development-only debug bundle
    └── shared ➤➤➤ Shared utilities and resources
        ├── css/ ➤➤➤ Shared stylesheets (variables, utilities, loading animations)
        ├── js/
        │   ├── theme.js ➤➤➤ Theme detection (runs first, before ES modules)
        │   └── utils/ ➤➤➤ Core ES modules (the heart of PaperMemory)
        │       ├── config.js ➤➤➤ Global state, constants, and configuration
        │       ├── functions.js ➤➤➤ Utility functions used throughout the app
        │       ├── miniquery.js ➤➤➤ DOM utilities (custom jQuery-like functions)
        │       ├── jquery-setup.js ➤➤➤ jQuery + Select2 initialization
        │       ├── data.js ➤➤➤ Data management - storage, migrations, validation
        │       ├── paper.js ➤➤➤ Paper operations - creation, updates, URL conversions
        │       ├── parsers.js ➤➤➤ Website parsers for different paper sources (ArXiv, Nature, etc.)
        │       ├── state.js ➤➤➤ App state management - memory initialization, sorting
        │       ├── sync.js ➤➤➤ GitHub sync functionality for data backup
        │       ├── urls.js ➤➤➤ URL parsing and paper ID extraction
        │       ├── files.js ➤➤➤ Local file detection and PDF management
        │       ├── bibtexParser.js ➤➤➤ BibTeX parsing and formatting
        │       └── logTrace.js ➤➤➤ Development logging utilities
        └── min/ ➤➤➤ [Generated] Shared build output
```

**Key Source Files for Contributors:**

**Core Logic** (`shared/js/utils/`):

-   `config.js` - Global state and settings. Start here to understand data structures.
-   `functions.js` - Utility functions used everywhere. Common operations like string parsing, clipboard access.
-   `data.js` - How papers are stored, validated, and migrated between versions.
-   `parsers.js` - Add new paper sources here. Contains website-specific parsing logic.
-   `paper.js` - Paper object operations. How papers are created, updated, and linked.

**User Interface** (`popup/js/`):

-   `popup.js` - Main popup logic. How the extension popup initializes and displays papers.
-   `memory.js` - Memory table functionality. Search, sorting, and display of saved papers.
-   `handlers.js` - User interactions. Button clicks, keyboard shortcuts, form handling.

**Background Processing**:

-   `background/background.js` - Handles sync, notifications, and browser API calls.
-   `content_scripts/content_script.js` - Automatically detects papers when browsing websites.

**Build System Features:**

-   **ES modules**: All `.js` files use modern `import`/`export` syntax
-   **Path aliases**: `@pm/*` and `@pmu/*` for clean, readable imports
-   **Automatic bundling**: Rollup generates optimized `.bundle.js` files for browsers
-   **Smart CSS processing**: Unminified CSS in development, minified in production
-   **Direct file editing**: Edit source files directly, no preprocessing required
-   **Multi-browser**: `extension build` produces Chrome and Firefox zips from the same source

### Prettier

The project uses Prettier for code formatting. Configuration is in `.prettierrc`:

-   `tabWidth`: 4, `printWidth`: 88
-   YAML files: `tabWidth`: 2

## Adding a paper source

The following functions and constants should be updated:

-   `config.js:global.knownPaperPages` with `source: {patterns: [array of url matches to trigger paper parsing, or boolean functions taking it as input], name: displayName}`
    -   will be used by `paper.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
-   `parsers.js:makePaper()` to create a new entry
    -   Typically, add a parser function in `parsers.js`
-   `state:parseIdFromUrl()`
-   `paper.js:paperToAbs()` and `paper.js:paperToPDF()` to enable to pdf<->webpage button
-   `functions.js:getDisplayId()` if necessary
-   `functions.js:isPdfUrl()` if necessary
-   `test/data/urls.json` to test that the integration works (and keeps working!)

## Creating a new paper attribute

1. Add an entry in `data.js:validatePaper`
2. Add a default value to other papers in `data.js:migrateData`

## Tests

Tests use **Mocha** + **expect** for assertions and **Puppeteer** for browser-based integration tests. The test runner uses ESM with custom loaders (`register.mjs` / `loader.mjs`) to resolve `@pm/*` and `@pmu/*` aliases in Node.

### Running tests

```bash
npm run test
```

This runs a dev build first (`pretest` → `npm run dev`), then executes all `test/test-*.js` files except `test-sync.js`.

Run a single test file with:

```bash
npm run test:file test/test-utils.js
```

### Test configuration

Test behavior is configured via `test/testConfig.yaml`. Each key can be overridden with an environment variable of the same name:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `headless` | bool | `true` | Run browser in headless mode |
| `keepOpen` | bool | `true` | Keep tab open after paper is parsed |
| `pageTimeout` | int | `200` | Timeout between paper pages (ms) |
| `maxSources` | int | `-1` | Max sources to iterate (-1 = all) |
| `onlySources` | comma-separated | `""` | Only test these sources |
| `ignoreSources` | comma-separated | `""` | Skip these sources |
| `singleOrder` | string | `""` | Test one parsing order (e.g. `"abs;pdf"`) |
| `singleName` | string | `""` | Test one duplicate name (see `test/data/duplicates.json`) |
| `dump` | bool | `true` | Dump parsed memory to JSON in `test/tmp/` |

Example:

```bash
headless=false onlySources=arxiv,neurips npm run test:file test/test-storage.js
```

### Test files

| File | Description |
|------|-------------|
| `test-storage.js` | Paper parsing from URLs → memory storage |
| `test-duplicates.js` | Duplicate detection and merging |
| `test-utils.js` | Unit tests for utility functions (no browser) |
| `test-extension-loading.js` | Extension loads correctly in Chrome |
| `test-popup-search.js` | Popup search functionality |
| `test-popup-paper-ui.js` | Popup paper display UI |
| `test-memory-item-actions.js` | Memory item action buttons |
| `test-memory-table-ui.js` | Memory table rendering |
| `test-menu.js` | Settings menu |
| `test-sync.js` | GitHub sync (excluded from default `npm test`, run separately) |
| `test-meta.js` | Meta test: asserts all test scripts are listed in CI |

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

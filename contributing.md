# Contributing

## About

PaperMemory is pure JS+HTML with minimal dependencies: no framework, (almost) no external dependencies so it's easy to help :)

The only external deps. are [`select2.js`](https://select2.org/) which requires `JQuery` and some of the latter here and there (but I'm working on getting rid of it, replacing it with a simple set of helper functions in `src/shared/utils/miniquery.js`).

The project uses modern ES modules with Rollup for bundling to make development contributor-friendly.

## Set-up

1. [Install `yarn`](https://classic.yarnpkg.com/lang/en/docs/install): Node's package manager
2. Install dependencies: from the root of this repo `$ yarn install`
3. Start development: `$ npm run dev`
4. Edit files!

The build system uses Rollup to bundle ES modules for browser compatibility. In development mode, you get:

-   Hot reloading when files change
-   Source maps for debugging
-   Unminified code for easier debugging

## Build Commands

```bash
npm run dev         # Development build (one-time)
npm run dev:watch   # Development build with file watching
npm run build       # Production build
```

For active development, use `npm run dev:watch` which will automatically rebuild files when you save changes.

### Debugging Utilities

PaperMemory includes a comprehensive debugging system that's automatically available in development mode:

#### Debug Bundle (`PMDebug`)

In development builds, a global `PMDebug` object is automatically injected into all contexts (popup, content scripts, options pages, etc.) giving you access to all internal functions:

```javascript
// Access utility modules
PMDebug.data.getStorage(); // Storage operations
PMDebug.functions.log("Debug message"); // Logging utilities
PMDebug.miniquery.findEl("#element"); // DOM utilities
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
PMDebug.findEl(".paper-item");
PMDebug.setHTML("element-id", "<p>Debug content</p>");

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
├── manifest.json ➤➤➤ Extension configuration for Chrome/Firefox
└── src  ➤➤➤ Source code (all ES modules)
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
        │       ├── data.js ➤➤➤ Data management - storage, migrations, validation
        │       ├── paper.js ➤➤➤ Paper operations - creation, updates, URL conversions
        │       ├── parsers.js ➤➤➤ Website parsers for different paper sources (ArXiv, Nature, etc.)
        │       ├── state.js ➤➤➤ App state management - memory initialization, sorting
        │       ├── sync.js ➤➤➤ GitHub sync functionality for data backup
        │       ├── urls.js ➤➤➤ URL parsing and paper ID extraction
        │       ├── files.js ➤➤➤ Local file detection and PDF management
        │       ├── bibtexParser.js ➤➤➤ BibTeX parsing and formatting
        │       ├── logTrace.js ➤➤➤ Development logging utilities

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

### Prettier

TODO

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

## Release process

1. Ensure all features are working (no automated testing for now). Mostly:
    1. All paper sources still work: papers are added and visit counts are updated
    2. Make sure to check the popup and paper page consoles for errors
    3. Memory still works:
        1. It can open
        2. You can search
        3. You can select favorites
        4. You can sort/order papers
        5. Memory items work:
            1. Content is displayed as usual
            2. They can be deleted
            3. They can be edited
            4. The buttons (go to paper, copies etc.) are functional
        6. Paper-in Popup works:
            1. Same as memory items but when on a paper's page
    4. The menu still works
        1. It can open
        2. Changes in configurations are working and persisted
    5. Notable edge case: modifying a paper when on its page:
        1. Changes in the memory should be reflected in the popup and vice-versa
2. Document functions (docstrings & comments)
3. Bump version
4. Run `npm run build`
5. Create a Github Release
    1. At least use the auto-complete release feature from PRs
    2. Add the Archive generated by `npm run build`
6. Upload the new package to Chrome & Firefox web stores 7. There's now a [Github action](https://github.com/vict0rsch/PaperMemory/actions/workflows/submit.yml) for that thanks to @louisgv in [#51](https://github.com/vict0rsch/PaperMemory/pull/51)
7. If necessary update Github and stores visuals

I'm working on adding tests in [#26](https://github.com/vict0rsch/PaperMemory/pull/26)

## Tests

Testing is WIP and relies on Puppeteer to a large extent.
Run tests with

```bash
npm run tests
```

You can adjust testing condition with `env` variables (see `tests/test-storage.js`)

```bash
env keep_browser=true max_sources=3 npm run test
```

Currently, tests **only** check that a pre-defined set of papers (`tests/data/urls.json`) are correctly parsed to memory once the browser visits a given url. Much more testing can be done: testing functions (most of them are pure, it's easier), user options, UI etc.

Help wanted: [Puppeteer in Github Actions](https://stackoverflow.com/questions/62228154/puppeteer-fails-to-initiate-in-github-actions)

### `module.export`

Why do we need this?

```javascript
if (typeof module !== "undefined" && module.exports != null) {
    var dummyModule = module;
    dummyModule.exports = { ... };
}
```

1. `if (typeof dummyModule !== "undefined" && dummyModule.exports != null) {}` is required to make functions available as module exports for the `node` test environment. Without this, `const { func } = require("path/to/file")` would not work.
2. `var dummyModule = module;` is there to be able to use IDE `Go to definition` functionalities. Without this, VSCode reads `module.exports = {...}` and thinks it's a module and does not discover functions in non-explicitly imported files

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

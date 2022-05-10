# Contributing

## About

PaperMemory is pure JS+HTML with minimal dependencies: no framework, (almost) no external dependencies so it's easy to help :) 

The only external deps. are [`select2.js`](https://select2.org/) which requires `JQuery` and some of the latter here and there (but I'm working on getting rid of it, replacing it with a simple set of helper functions in `src/shared/utils/miniquery.js`).

`npm` and `gulp` are here to make the dev+release lifecycle easier, if you don't want to set it up there still are a lot of things you can help with in the raw source code (just don't bother with the `min` files)

## Set-up

1. [Install `yarn`](https://classic.yarnpkg.com/lang/en/docs/install): Node's package manager
2. [Install `gulp`](https://gulpjs.com/): a build tool
3. Install dependencies: from the root of this repo `$ yarn install`
4. Watch file changes: `$ gulp watch`
5. Edit files!

`gulp` mainly runs the concatenation of files into a single one (especially for css and js) and its minification.

In `popup.html` you will notice:

```html
<!-- @if DEV -->
<script defer src="../../shared/utils/miniquery.js"></script>
<script defer src="../../shared/utils/config.js"></script>
<script defer src="../../shared/utils/functions.js"></script>
<script defer src="../../shared/utils/parsers.js"></script>
<script defer src="../js/handlers.js"></script>
<script defer src="../js/templates.js"></script>
<script defer src="../js/memory.js"></script>
<script defer src="../js/popup.js"></script>
<!-- @else -->
<script defer src="../../shared/utils.min.js"></script>
<script defer src="popup.min.js"></script>
<!-- @endif -->
```

Those `@` commands are meant for `gulp` (using the `preprocess` package) to choose whether to use raw, un-minified files for development (`$ gulp watch`) or concatenated and minified ones for production (`$ gulp build`)

Note: the file loaded in the popup is `src/popup/min/popup.min.html`, *not* `src/popup/popup.html` so you *have* to use `gulp watch` to see changes you make to `popup.html` reflected in the actual popup.

### Refreshing the extension

Once you load the local extension as an unpackaged extension, changes that affect the popup will directly take effect, no need to refresh anything. 

**Content scripts** however, are loaded and not binded to the source so you _have to_ refresh the extension in the settings (and then any web page you want to see changes on) for those to be taken into account.


## Conventions

### File structure

(slightly deprecated since some files have moved but names are unique enough for you to still understand I hope)

```tree
├── jsconfig.json ➤➤➤ vscode js config
├── manifest.json ➤➤➤ the extension's configuration file for the browser
└── src  ➤➤➤ actual code
    ├── background ➤➤➤ background code
    │   └── background.js ➤➤➤ background.js can interact with some browser apis content_scripts can't use
    ├── content_scripts
    │   ├── content_script.css  ➤➤➤ styling for pages modified by the content_script
    │   ├── content_script.js ➤➤➤ the code run at the opening of a page matched in manifest.json
    ├── popup
    │   ├── css ➤➤➤ The popup's style
    │   │   ├── dark.css ➤➤➤ Dark mode style sheet
    │   │   ├── options.css ➤➤➤ Sliding checkboxes style
    │   │   ├── popup.css ➤➤➤ Main style
    │   │   ├── select2.min.css ➤➤➤ Style for the select2 dropdowns (don't modify)
    │   ├── js  ➤➤➤ The javascript files specific to the popup, minified together in this order into js.min.js
    │   │   ├── handlers.js  ➤➤➤ Event handlers
    │   │   ├── memory.js ➤➤➤ Memory-specific functions
    │   │   ├── popup.js ➤➤➤ Main execution
    │   │   ├── theme.js ➤➤➤ The first thing that is executed when the popup is opened: selecting dark/light theme based on user preferences
    │   │   ├── select2.min.js ➤➤➤ JQuery-based tagging lib for paper tags
    │   │   └── templates.js ➤➤➤ HTML string templates: memory items and paper popup
    │   ├── min
    │   │   └── minified scripts
    │   ├── popup.html  ➤➤➤ Main HTML file
    └── shared
        ├── jquery.min.js ➤➤➤ JQuery lib. Do not modify. 
        ├── utils ➤➤➤ Shared utility functions minified together in this order into utils.min.js
        │   ├── bibtexParser.js ➤➤➤ Class to parse bibtex strings into objects
        │   ├── config.js       ➤➤➤ Constants / State variables used throughout out the code
        │   ├── data.js         ➤➤➤ Data/Memory manipulation (migrations, paper validation, overwrite etc.)
        │   ├── functions.js    ➤➤➤ Utility functions, relying on config.js
        │   ├── logTrace.js     ➤➤➤ Single var script to include the log stack trace in dev (gulp watch)
        │   ├── miniquery.js    ➤➤➤ Custom vanilla js replacement for JQuery (working towards removing that dependency)
        │   ├── parsers.js      ➤➤➤ Parsing functions to create papers
        │   ├── paper.js        ➤➤➤ Single-paper-related functions (isPaper, paperToAbs, paperToPDF)
        │   └── state.js        ➤➤➤ State-related functions (init, custom title function, addOrUpdatePaper etc.)
        ├── utils.min.js ➤➤➤ Concatenation and minification of all files in src/shared/utils/
        └── loader.css   ➤➤➤ the style for the loader before the BibTex entry is displayed on arxiv.org/abs/*
```

### Prettier

TODO

## Adding a paper source

The following functions and constants should be updated:

* `config.js:global.knownPaperPages` with `source: [array of url matches to trigger paper parsing, or boolean functions taking it as input]`
  * will be used by `paper.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
* `parsers.js:makePaper()` to create a new entry
  * Typically, add a parser function in `parsers.js`  
* `state:parseIdFromUrl()`
* `paper.js:paperToAbs()` and `paper.js:paperToPDF()` to enable to pdf<->webpage button
* `functions.js:getDisplayId()` if necessary
* `functions.js:isPdfUrl()` if necessary
* `test/data/urls.json` to test that the integration works (and keeps working!)


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
4. Run `gulp build`
5. Create a Github Release
    1. At least use the auto-complete release feature from PRs
    2. Add the Archive generated by `gulp build`
6. Upload the new package to Chrome & Firefox web stores
    7. There's now a [Github action](https://github.com/vict0rsch/PaperMemory/actions/workflows/submit.yml) for that thanks to @louisgv in [#51](https://github.com/vict0rsch/PaperMemory/pull/51)
8. If necessary update Github and stores visuals

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


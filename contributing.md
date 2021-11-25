# Contributing

## Set-up

1. [Install `npm`](https://www.npmjs.com/get-npm): Node's package manager
2. [Install `gulp`](https://gulpjs.com/): a build tool
3. Install dependencies: from the root of this repo `$ npm install`
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

Note: the file loaded in the popup is `src/popup/min/popup.min.html`, *not* `src/popup/popup.html`


## Conventions

### File structure


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
        │   ├── miniquery.js ➤➤➤ Custom vanilla js replacement for JQuery (working towards removing that dependency)
        │   ├── config.js ➤➤➤ Constants / State variables used throughout out the code
        │   ├── functions.js ➤➤➤ Utility functions, relying on config.js
        │   └── parsers.js ➤➤➤ Parsing functions to create papers
        ├── utils.min.js ➤➤➤ Concatenation and minification of all files in src/shared/utils/
        └── loader.css ➤➤➤ the style for the loader before the BibTex entry is displayed on arxiv.org/abs/*
```

### Prettier

TODO

## Adding a paper source

* update `config.js:global.knownPaperPages` with `source: [array of url matches to trigger paper parsing]`
  * will be used by `functions.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
* update `content_script.js:makePaper()` to create a new entry
  * Typically, add a parser function in `parsers.js`  
* `memory.js:focusExistingOrCreateNewPaperTab()` -> update the `match` creation process to define the piece of a pdf's URL which should be matched to existing tabs in order to focus it.
* Update `functions.js:paperToAbs()` and `functions.js:paperToPDF()` to enable to pdf<->webpage button
* Update `manifest.json` to
  * trigger `content_script.js` in the correct domains
  * enable your parsing function to fetch/query the data you need

## Creating a new paper attribute

1. Add an entry in `functions.js:validatePaper`
2. Add a default value to other papers in `functions.js:migrateData`

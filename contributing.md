# Contributing

## Set-up

TODO

## Conventions

### File structure

TODO

```tree
├── jsconfig.json ➤➤➤ vscode js config
├── manifest.json ➤➤➤ the extension's configuration file for the browser
└── src  ➤➤➤ actual code
    ├── bg ➤➤➤ background code
    │   └── background.js ➤➤➤ background.js can interact with some browser apis content_scripts can't use
    ├── content_scripts
    │   ├── content_script.css  ➤➤➤ styling for pages modified by the content_script
    │   ├── content_script.js ➤➤➤ the code run at the opening of a page matched in manifest.json
    │   ├── downloadButton.css ➤➤➤ the style for the direct download button on arxiv.org/abs/*
    │   └── loader.css ➤➤➤ the style for the loader before the BibTex entry is displayed on arxiv.org/abs/*
    ├── popup
    │   ├── popup-css ➤➤➤ The popup's style
    │   │   ├── abstract.css ➤➤➤ Style for Arxiv Vanity cards (deprecated)
    │   │   ├── abstract.min.css
    │   │   ├── dark.css ➤➤➤ Dark mode style sheet
    │   │   ├── dark.min.css
    │   │   ├── options.css ➤➤➤ Sliding checkboxes style
    │   │   ├── options.min.css
    │   │   ├── popup.css ➤➤➤ Main style
    │   │   ├── popup.min.css
    │   │   ├── select2.min.css ➤➤➤ Style for the select2 dropdowns (don't modify)
    │   │   ├── spinner.css  ➤➤➤ Style for the tiny circle loader when the extension reads paper data on popup open
    │   │   └── spinner.min.css
    │   ├── popup-js  ➤➤➤ The javascript files specific to the popup, minified together in this order into popup-js.min.js
    │   │   ├── handlers.js  ➤➤➤ Event handlers
    │   │   ├── memory.js ➤➤➤ Memory-specific functions
    │   │   ├── popup.js ➤➤➤ Main execution
    │   │   └── templates.js ➤➤➤ HTML string templates: memory items and paper popup
    │   ├── popup-js.min.js
    │   ├── popup.html  ➤➤➤ Main HTML file
    │   ├── popup.min.html
    │   ├── theme.js ➤➤➤ The first thing that is executed when the popup is opened: selecting dark/light theme based on user preferences
    │   └── theme.min.js
    └── shared
        ├── jquery.min.js ➤➤➤ JQuery lib. Do not modify. 
        ├── select2.min.js ➤➤➤ JQuery-based tagging lib for paper tags
        ├── utils ➤➤➤ Shared utility functions minified together in this order into utils.min.js
        │   ├── _miniquery.js ➤➤➤ Custom vanilla js replacement for JQuery (working towards removing that dependency)
        │   ├── config.js ➤➤➤ Constants / State variables used throughout out the code
        │   ├── functions.js ➤➤➤ Utility functions, relying on config.js
        │   └── parsers.js ➤➤➤ Parsing functions to create papers
        └── utils.min.js
```

### Prettier

TODO

## Adding a paper source

* update `config.js:global.knownPaperPages` with `source: [array of url matches to trigger paper parsing]`
  * will be used by `functions.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
* update `content_script.js:addOrUpdatePaper()` to retrieve the current paper's `id` to know if the paper exists
* update `content_script.js:makePaper()` to create a new entry
  * Typically, add a parser function in `parsers.js`  
* `memory.js:focusExistingOrCreateNewPaperTab()` -> update the `match` creation process to define the piece of a pdf's URL which should be matched to existing tabs in order to focus it.
* Update `manifest.json` to
  * trigger `content_script.js` in the correct domains
  * enable your parsing function to fetch/query the data you need

## Creating a new paper attribute

1. Add an entry in `functions.js:validatePaper`
2. Add a default value to other papers in `functions.js:migrateData`

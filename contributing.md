# Contributing

## Set-up

TODO

## Conventions

### File structure

TODO

In `config.js`, variables/constants start with `_` to identify them across the code as global values

### Prettier

TODO

## Adding a paper source

* update `config.js:global.knownPaperPages` with `source: [array of url matches to trigger paper parsing]`
  * will be used by `functions.js:isPaper()` to determine whether `content_script.js` should parse the current page into a paper with `addOrUpdatePaper()` (or update the existing one's visits count) and `popup.js` to display the current paper
* update `content_script.js:addOrUpdatePaper()` to retrieve the current paper's `id` to know if the paper exists
* update `content_script.js:makePaper()` to cre
* `memory.js:focusExistingOrCreateNewPaperTab()` -> update the `match` creation process to define the piece of a pdf's URL which should be matched to existing tabs in order to focus it.

## Creating a new paper attribute

`validatePaper`, `migrateData`

TODO

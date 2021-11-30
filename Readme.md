# My Paper Memory ⚡

<br/>

<p align="center">
    🏪 Official stores
    <br/>
    <a href="https://chrome.google.com/webstore/detail/arxivtools/hmebhknlgddhfbbdhgplnillngljgmdi">
        <strong>Chrome & Brave</strong>
    </a>
    &nbsp;•&nbsp;
    <a href="https://addons.mozilla.org/en-US/firefox/addon/paper-memory/">
        <strong>Firefox</strong>
    </a>
</p>

<br/>

An **automated**, web-based and minimalist reference manager.

It is not meant to replace, rather complete more standard reference managers as Zotero etc.

This browser extension allows you to do automatically store research papers you read and much more:

1. 🏬 **Automatically record papers** you open, without clicking anywhere. You can then **search** them, **tag** them, **comment** them and link a code repository.
2. 🎬 **Change a pdf's webpage title to the article's title**, because who cares about that saved bookmark `1812.10889.pdf` when it could be `InstaGAN Instance-aware Image-to-Image Translation.pdf`
3. 🎫 **BibTex citation**, because citing papers should not be a hassle you can copy a BibTex citation to your clipboard or export the Memory itself as a `.bib` file
4. 🔗 **Markdown link**, `[title](url)` because it's the little things that make sharing a paper easier (to be used in issues, PRs, Readme, HackMD.io etc.)
5. 🗂 **Direct download button** with a nice name including the paper's title, so that you don't have to open the pdf's webpage and then download it from your browser.
6. 📄 **Go back from a pdf to its abstract page**. For instance: from `https://arxiv.org/pdf/1703.06907.pdf` to `https://arxiv.org/abs/1703.06907` in a click.
7. 🏛️ **Export your data** as a `.json` file or a `.bib` full BibTex export

### Supported venues

* Arxiv
* BioRxiv
* NeurIPS
* Open Review (ICLR etc.)
* Computer Vision Foundation (I/ECCV, CVPR etc.)
* Proceedings of Machine Learning Research (PMLR) (AISTATS, ICML, CoRL, CoLT, ALT, UAI etc.)
* [Add more](https://github.com/vict0rsch/PaperMemory/issues/13)

[About finding published papers from preprints](#preprints)

### Privacy

All the data collected is stored locally on your computer and you can export it to `json` it from the menu.

## Demo


![](https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/d2.gif?raw=true)

Customize features in the menu:

<p align="center">
<img width="400" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/m.png?raw=true">
</p>

Switch between Light and Dark mode


<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/dm.png?raw=true">
</p>



---

Share ideas 💡 in [issues](https://github.com/vict0rsch/PaperMemory/issues) and love with [stars](https://github.com/vict0rsch/PaperMemory/stargazers) ⭐️:)

## Keyboard Navigation

* **Keyboard** navigation:
  * Open the popup:
    * `cmd/ctrl + shift + e`
  * Open the Memory
    * `a` from the popup's home will open it
    * navigate to the bottom left button with `tab` and hit `enter`
  * Search
    * Search field is automatically focused on memory open
    * Navigate to the top input with `tab` or `shift + tab`
  * Navigate papers
    * `tab` will iterate through papers down the list
    * `shift + tab` will go back up the list
  * Edit a paper
    * Press `e` to _edit_ the paper's metadata: tags, code and note when the paper is *focused* (from click or keyboard `tab` navigation)
      * Navigate through fields with `(shift+) tab`: tags and note if you're on a paper's page.
    * Press `enter` to _open_ a focused paper (*focus* an existing tab with the paper or *create a new tab* to the paper's pdf if it's not open already)
    * `backspace` to _delete_ a focused paper (a confirmation will be prompted first don't worry 👮‍♀️)
  * Close Memory or Menu
    * `esc` closes the memory (or the menu -- **not** in Firefox)
* **Search**
  * In a paper's authors, title and note.
    * Split queries on spaces: `gan im` will look for: _all papers whose (title OR author) contain ("gan" AND "im")_
  * In a paper's code link
    * Start the search query with `c:` to only search code links
  * In a paper's tags
    * Start the search query with `t:` to filter by tags
    * `t: gan` will look for _all papers whose tag-list contains at least 1 tag containing "gan"_
    * `t: gan tim` will look for _all papers whose tag-list contains (at least 1 tag containing "gan") AND (at least 1 tag containing "tim")_
* **Export** your memory as json file (in the extension's Menu)

## Guides

<p align="center">
<img src="https://raw.github.com/vict0rsch/PaperMemory/master/extra/imgs/guide-arrows.png?raw=true">
</p>

<p align="center">
<img src="https://raw.github.com/vict0rsch/PaperMemory/master/extra/imgs/guide-memory.png?raw=true">
</p>

## Install from source (Brave & Chrome)

* Download the repo
* Go to Chrome/Brave's extension manager
* Enable developer mode
* Click on "load unpackaged extension"
* Select the downloaded repo :)

## Preprints

There currently exists, to my knowledge, no centralized source for matching a preprint to its subsequent published article. This makes it really hard to try and implement best practices in terms of citing published papers rather than their preprint.

My approach with PaperMemory is to try and notify you that a publication likely exists by utilizing the `note` field. You will occasionally notice `Accepted @ X` in a Paper's notes. This will be added automatically if you are on a known published venue's website (as PMLR or NeurIPS) but also from:

* [CrossRef.org](https://crossref.org)
  * A query is sent to their [api](https://api.crossref.org/swagger-ui/index.html) for an exact paper title match
  * The response *must* contain an `event` field with a `name` attribute. If it does not it'll be ignored. 
  * If it does, a note is added as: `Accepted @ ${items.event.name} -- [crossref.org]`
    * Try for instance [Attention-Guided Generative Adversarial Networks for Unsupervised Image-to-Image Translation](http://arxiv.org/pdf/1903.12296v3)
* [dblp.org](https://dblp.org)
  * A query is sent to their [api](https://dblp.org/faq/How+to+use+the+dblp+search+API.html) for an exact paper title match
  * The oldest `hit` in the response which is not a preprint (`hit.venue !== "CoRR"`) is used 
  * If such a match is found, a note is added as: `Accepted @ ${venue} ${year} -- [dblp.org]\n${dblpURL}`
    * Try for instance [Domain-Adversarial Training of Neural Networks](http://arxiv.org/pdf/1505.07818v4)
    * DBLP venues are weird, for instance `JMLR` is `J. Mach. Learn. Res.`. There's a per-venue fix in the code, [raise an issue](https://github.com/vict0rsch/PaperMemory/issues/new) to add another venue fix

There's room for improvement here^, please contact me (an issue will do) if you want to help

## Todo

* [ ] Update visuals
* [ ] Document `:` being replaced by `_` when downloading a pdf ([OS requirements...](https://stackoverflow.com/questions/30960190/problematic-characters-for-filename-in-chrome-downloads-download))
* [ ] Document backup and how to get it
* [ ] Improve `Contributing.md`
* [ ] Tests (WIP => [Puppeteer + Mocha #26](https://github.com/vict0rsch/PaperMemory/pull/26))

## Help

* **Firefox**
  * Using Firefox? [#9](https://github.com/vict0rsch/PaperMemory/issues/9) 🚁
* **Papers With Code**
  * Wouldn't it be nice to automatically discover papers' repos!! see [#10](https://github.com/vict0rsch/PaperMemory/issues/10)

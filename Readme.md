# My Paper Memory ⚡

<br/><br/>

<p align="center">
    <a href="https://chrome.google.com/webstore/detail/arxivtools/hmebhknlgddhfbbdhgplnillngljgmdi?authuser=1&hl=fr">
        <strong>
            🏪 Install from the Chrome (& Brave) web-store
        </strong>
    </a>
</p>

<br/><br/>

An **automated**, web-based and minimalist reference manager.

It is not meant to replace, rather complete more standard reference managers as Zotero etc.

This browser extension allows you to do automatically store research papers you read and much more:

1. 🏬 **Automatically record papers** you open, without clicking anywhere. You can then **search** them, **tag** them, **comment** them and link a code repository.
2. 🎬 **Change a pdf's webpage title to the article's title**, because who cares about that saved bookmark `1812.10889.pdf` when it could be `InstaGAN Instance-aware Image-to-Image Translation.pdf`
3. 🎫 **BibTex citation**, because citing papers should not be a hassle you can copy a BibTex citation to your clipboard or export the Memory itself as a `.bib` file
4. 🔗 **Markdown link**, `[title](url)` because it's the little things that make sharing a paper easier (to be used in issues, PRs, Readme, HackMD.io etc.)
5. 🗂 **Direct download button** with a nice name including the paper's title, so that you don't have to open the pdf's webpage and then download it from your browser.
6. 📄 **Go back from a pdf to its abstract page**. For instance: from `https://arxiv.org/pdf/1703.06907.pdf` to `https://arxiv.org/abs/1703.06907` in a click.

Supported venues:

* arxiv.org
* neurips.cc (NeurIPS)
* openreview.net (ICLR etc.)
* openaccess.cvf.com (I/ECCV, CVPR etc.)
* [Add more](https://github.com/vict0rsch/PaperMemory/issues/13)

## Demo

(Visuals are slightly deprecated (Oct 1st 2021), I need to update them but it's currently very close to what you see here)

![](https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/d2.gif?raw=true)

Customize features in the menu:

<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/m.png?raw=true">
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
* **Download** memory as json file (in the extension's Menu)

## Guides

<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/guide-arrows.png?raw=true">
</p>

<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/guide-memory.png?raw=true">
</p>

## Install from source (Brave & Chrome)

* Download the repo
* Go to Chrome/Brave's extension manager
* Enable developer mode
* Click on "load unpackaged extension"
* Select the downloaded repo :)

## Todo

* [ ] Update visuals
* [ ] Document `:` being replaced by `_` when downloading a pdf ([OS requirements...](https://stackoverflow.com/questions/30960190/problematic-characters-for-filename-in-chrome-downloads-download))
* [ ] Document backup and how to get it
* [ ] Improve `Contributing.md`

## Help

* **Firefox**
  * Using Firefox? [#9](https://github.com/vict0rsch/PaperMemory/issues/9) 🚁
* **Papers With Code**
  * Wouldn't it be nice to automatically discover papers' repos!! see [#10](https://github.com/vict0rsch/PaperMemory/issues/10)

# ArxivTools ⚡

<br/><br/>

<p align="center">
    <a href="https://chrome.google.com/webstore/detail/arxivtools/hmebhknlgddhfbbdhgplnillngljgmdi?authuser=1&hl=fr">
        <strong>
            🏪 Chrome (& Brave) web store
        </strong>
    </a>
</p>

<br/><br/>

This browser extension allows you to do enhance Arxiv.org and Arxiv-Vanity.com:

1. 📄 **Go back to an arxiv-hosted pdf to its abstract page**. For instance: from https://arxiv.org/pdf/1703.06907.pdf to https://arxiv.org/abs/1703.06907 in a couple of clicks.
2. 🗂 **Add a direct download button** so that you don't have to open the pdf's webpage and then download it from your browser
3. 🔗**Add a Markdown link**, because it's the little things that make sharing a paper easier (to be used in issues, PRs, Readme etc.)
4. 🎫**Add the paper's BibTex citation directly on its abstract webpage**, because citing papers should not be a hassle, the extension directly queries and parses Arxiv's API (also works on [arxiv-vanity.com](https://arxiv-vanity.com))
5. 🎬 **Change a pdf's webpage title to the article's title**, because who cares about that saved bookmark `1812.10889.pdf` when it could be `InstaGAN: Instance-aware Image-to-Image Translation (1812.10889).pdf`

## Demo

![](https://github.com/vict0rsch/ArxivTools/blob/master/imgs/d2.gif?raw=true)

Augment Arxiv-Vanity with Bibtex:

<p align="center">
<img src="https://github.com/vict0rsch/ArxivTools/blob/master/imgs/v.png?raw=true">
</p>

Customize features in the menu:

<p align="center">
<img src="https://github.com/vict0rsch/ArxivTools/blob/master/imgs/m.png?raw=true">
</p>

---

Share ideas 💡 in [issues](https://github.com/vict0rsch/ArxivTools/issues) and love with [stars](https://github.com/vict0rsch/ArxivTools/stargazers) ⭐️:)

## ArxivMemory

**ArxivMemory** is here!

(_Only from source on Github, see ToDo below_)

* **Record** papers you read: Arxiv or NeurIPS papers you visit are stored, searchable, sortable, commentable, taggable
* **Keyboard** navigation:
  * `cmd/ctrl + shift + e` will open the popup
  * `tab` will focus the memory
  * `enter` will open it
  * Search field is automatically focused
  * Search for words (`foo bar` will look for all papers whose title or author names contain `foo` *and* `bar` )
  * `(shift + ) tab` to navigate the paper list
    * `e` to _edit_ the paper's tags
    * `n` to add a _note_ to that paper
    * `enter` to _open_ a focused paper (focus an existing tab with the paper or create a new tab to the paper's pdf)
    * `backspace` to _delete_ the paper (a confirmation will be prompted first don't worry 👮‍♀️) (use `tab` and `enter` to navigate the confirmation's options too 😉
* **Search**
  * In a paper's authors and title
    * Split queries on spaces: `gan im` will look for: _all papers whose (title OR author) contain ("gan" AND "im")_
  * In a paper's tags
    * Start the search query with `t:` to filter by tags
    * `t: gan` will look for _all papers whose tag-list contains at least 1 tag containing "gan"_
    * `t: gan tim` will look for _all papers whose tag-list contains (at least 1 tag containing "gan") AND (at least 1 tag containing "tim")_
* **Download** memory as json file (in the extension's Menu)

TODO:

* [ ] Make visuals
  * [ ] Gifs
  * [ ] Screenshots
* [ ] Update Readme
* [ ] Release on Chrome Webstore

## Manual Installation

* download the repo
* go to Chrome/Brave's extension manager
* enable developer mode
* load unpackaged extension
* chose downloaded repo :)

## Help

* **Arxiv-Vanity**
  * Bibtex card appears on hover
  * If link is an arxiv citation, ArxivTools fetches the citation's ID on Arxiv's `export` API.
  * Otherwise, ArxivTools extracts the paper's title, and searches for it on Arxiv's `export` API.
    * If titles don't match, Arxiv's API could not find the exact article and ArxivTools doesn't do anything
* **Firefox**
  * Using Firefox? Raise an issue if you're willing to help a little 🚁

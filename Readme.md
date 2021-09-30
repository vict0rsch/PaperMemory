# Arxiv Memory ⚡

<br/><br/>

<p align="center">
    <a href="https://chrome.google.com/webstore/detail/arxivtools/hmebhknlgddhfbbdhgplnillngljgmdi?authuser=1&hl=fr">
        <strong>
            🏪 Chrome (& Brave) web store
        </strong>
    </a>
</p>

<br/><br/>

This browser extension allows you to do automatically store ArXiv papers you read and much more:

1. 🏬 **Automatically record papers** you open, without clicking anywhere. You can then **search** them, **tag** them, **comment** them.
2. 📄 **Go back to an arxiv-hosted pdf to its abstract page**. For instance: from `https://arxiv.org/pdf/1703.06907.pdf` to `https://arxiv.org/abs/1703.06907` in a click.
3. 🗂 **Add a direct download button** so that you don't have to open the pdf's webpage and then download it from your browser
4. 🔗 **Add a Markdown link**, because it's the little things that make sharing a paper easier (to be used in issues, PRs, Readme, HackMD.io etc.)
5. 🎫 **Add the paper's BibTex citation directly on its abstract webpage**, because citing papers should not be a hassle, the extension directly queries and parses Arxiv's API (also works on [arxiv-vanity.com](https://arxiv-vanity.com) *(remember to always double check if a paper has been published before going for the ArXiv citation)*
6. 🎬 **Change a pdf's webpage title to the article's title**, because who cares about that saved bookmark `1812.10889.pdf` when it could be `InstaGAN: Instance-aware Image-to-Image Translation (1812.10889).pdf`

## Demo

![](https://github.com/vict0rsch/ArxivMemory/blob/master/imgs/d2.gif?raw=true)

Augment Arxiv-Vanity with Bibtex:

<p align="center">
<img src="https://github.com/vict0rsch/ArxivMemory/blob/master/imgs/v.png?raw=true">
</p>

Customize features in the menu:

<p align="center">
<img src="https://github.com/vict0rsch/ArxivMemory/blob/master/imgs/m.png?raw=true">
</p>

---

Share ideas 💡 in [issues](https://github.com/vict0rsch/ArxivMemory/issues) and love with [stars](https://github.com/vict0rsch/ArxivMemory/stargazers) ⭐️:)

## Keyboard Navigation

**ArxivMemory** is here!

* **Record** papers you read: Arxiv or NeurIPS papers you visit are stored, searchable, sortable, commentable, taggable
* **Keyboard** navigation:
  * `cmd/ctrl + shift + e` will open the popup
  * `tab` will iterate through fields: tags and note if you're on a paper's page, then your ArxivMemory anyway.
  * `enter` on your ArxivMemory will open it
  * Search field is automatically focused
  * Search for words (`foo bar` will look for all papers whose title or author names or note contain `foo` *and* `bar` )
  * `(shift + ) tab` to navigate the paper list
    * `e` to _edit_ the paper's tags
    * `n` to add a _note_ to that paper
    * `enter` to _open_ a focused paper (*focus* an existing tab with the paper or *create a new tab* to the paper's pdf if it's not open already)
    * `backspace` to _delete_ the paper (a confirmation will be prompted first don't worry 👮‍♀️)
* **Search**
  * In a paper's authors, title and note.
    * Split queries on spaces: `gan im` will look for: _all papers whose (title OR author) contain ("gan" AND "im")_
  * In a paper's tags
    * Start the search query with `t:` to filter by tags
    * `t: gan` will look for _all papers whose tag-list contains at least 1 tag containing "gan"_
    * `t: gan tim` will look for _all papers whose tag-list contains (at least 1 tag containing "gan") AND (at least 1 tag containing "tim")_
* **Download** memory as json file (in the extension's Menu)

## Guides

<p align="center">
<img src="https://github.com/vict0rsch/ArxivMemory/blob/master/imgs/guide-arrows.png?raw=true">
</p>

<p align="center">
<img src="https://github.com/vict0rsch/ArxivMemory/blob/master/imgs/guide-memory.png?raw=true">
</p>

## Manual Installation

* download the repo
* go to Chrome/Brave's extension manager
* enable developer mode
* load unpackaged extension
* chose downloaded repo :)

## Help

* **Arxiv-Vanity**
  * Bibtex card appears on hover
  * If link is an arxiv citation, ArxivMemory fetches the citation's ID on Arxiv's `export` API.
  * Otherwise, ArxivMemory extracts the paper's title, and searches for it on Arxiv's `export` API.
    * If titles don't match, Arxiv's API could not find the exact article and ArxivMemory doesn't do anything
* **Firefox**
  * Using Firefox? Raise an issue if you're willing to help a little 🚁

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



## Manual Installation

* download the repo
* go to Chrome/Brave's extension manager
* enable developer mode
* load unpackaged extension
* chose downloaded repo :)

## Firefox

Using Firefox? Raise an issue if you're willing to help a little 🚁

## Help

* **Arxiv-Vanity**
  * Bibtex card appears on hover
  * If link is an arxiv citation, ArxivTools fetches the citation's ID on Arxiv's `export` API.
  * Otherwise, ArxivTools extracts the paper's title, and searches for it on Arxiv's `export` API.
    * If titles don't match, Arxiv's API could not find the exact article and ArxivTools doesn't do anything

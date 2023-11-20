# My Paper Memory ⚡

<br/>

<p align="center">
    🏪 Official stores
    <br/>
    <a href="https://chrome.google.com/webstore/detail/arxivtools/hmebhknlgddhfbbdhgplnillngljgmdi">
        <strong>Chrome & Brave & Edge</strong>
    </a>
    &nbsp;•&nbsp;
    <a href="https://addons.mozilla.org/en-US/firefox/addon/paper-memory/">
        <strong>Firefox</strong>
    </a>
</p>

<br/>

[![](https://img.shields.io/chrome-web-store/stars/hmebhknlgddhfbbdhgplnillngljgmdi)](https://chrome.google.com/webstore/detail/paper-memory/hmebhknlgddhfbbdhgplnillngljgmdi)
[![](https://img.shields.io/badge/buy%20me-a%20coffee%20%E2%98%95%EF%B8%8F-FFDD03)](https://www.buymeacoffee.com/vict0rsch)
<!-- [![](https://img.shields.io/badge/Source%20%5BWIP%5D-v0.5.12-important)](https://github.com/vict0rsch/PaperMemory) -->
[![](https://img.shields.io/badge/Release-v0.5.13-A41716)](https://github.com/vict0rsch/PaperMemory/tree/0.5.13)

<br/>

<p align="center">
 <a href="#supported-venues">Supported Venues</a> &nbsp;•&nbsp; <a href="#customization">Customization</a> &nbsp;•&nbsp; <a href="#keyboard-navigation">Keyboard Navigation</a> &nbsp;•&nbsp; <a href="#guides">User Guide</a> &nbsp;•&nbsp; <a href="#advanced">Advanced features</a> &nbsp;•&nbsp; <a href="#install-from-source-brave--chrome">Install from source</a> &nbsp;•&nbsp; <a href="#preprints">About preprints</a> &nbsp;•&nbsp; <a href="#discovering-code-repositories">Discovering code Repositories</a> &nbsp;•&nbsp; <a href="#faq">FAQ</a>
</p>

An **automated**, web-based and minimalist reference manager that also finds code repositories and published versions of preprints.

It is not meant to replace, rather complete more standard reference managers as Zotero etc.

This browser extension allows you to automatically store research papers you read, find a code repository and much more:

1. 🏬 **Automatically record papers** you open, without clicking anywhere. You can then **search** them, **tag** them, **comment** them and link a code repository.
2. 💻 **Automatically find code** repositories using PapersWithCode's API
3. 🤝 **Match pre-prints to publications** using 4 different databases
4. 🎬 **Change a pdf's webpage title to the article's title**, because who cares about that saved bookmark `1812.10889.pdf` when it could be `InstaGAN Instance-aware Image-to-Image Translation.pdf`
5. 🎫 **BibTex citation**, because citing papers should not be a hassle you can copy a BibTex citation to your clipboard or export the Memory itself as a `.bib` file
6. 🔗 **Markdown link**, `[title](url)` because it's the little things that make sharing a paper easier (to be used in issues, PRs, Readme, HackMD.io etc.)
7. 🗂 **Direct download button** with a nice name including the paper's title, so that you don't have to open the pdf's webpage and then download it from your browser.
8. 📄 **Go back from a pdf to its abstract page**. For instance: from `https://arxiv.org/pdf/1703.06907.pdf` to `https://arxiv.org/abs/1703.06907` in a click.
9. 🏛️ **Export your data** as a `.json` file or a `.bib` full BibTex export

<br/>

Share ideas 💡 in [issues](https://github.com/vict0rsch/PaperMemory/issues) and love with [stars](https://github.com/vict0rsch/PaperMemory/stargazers) ⭐️:)

<br/>

<p align="center">
<img width="800" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/display.png?raw=true"/>
<br/>
<br/>
<img width="800" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/home_slideshow.gif?raw=true"/>
<br/>
<br/>
<img width="800" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/d2.gif?raw=true"/>
</p>

---

<br/>

## Supported venues

* Arxiv
  * PaperMemory will try to find if a pre-print has been published and create a corresponding `note` to the paper (see [preprints](#preprints))
  * Also detects and matches papers from [huggingface.co/papers](https://huggingface.co/papers), [arxiv-vanity.com](https://arxiv-vanity.com), [ar5iv.org](https://ar5iv.org) and [scirate.com/](https://scirate.com/)
* BioRxiv
* NeurIPS
* Open Review (ICLR etc.)
* Computer Vision Foundation (I/ECCV, CVPR etc.)
* Proceedings of Machine Learning Research (PMLR) (AISTATS, ICML, CoRL, CoLT, ALT, UAI etc.)
* Association for Computational Linguistics (ACL) (EMNLP, ACL, CoNLL, NAACL etc.)
* Proceedings of the National Academy of Sciences (PNAS)
* SciRate
* Nature (Nature, Nature Communications, Nature Machine Intelligence etc.)
* American Chemical Society (ACS)
* IOPscience
* PubMed Central
* International Joint Conferences on Artificial Intelligence (IJCAI)
* Association for Computing Machinery (ACM)
* IEEE
* Springer (books, chapters and, of course, articles)
* American Physical Society (APS)
* Wiley (Advanced Materials, InfoMat etc.)
* Science Direct
* Science (Science, Science Immunology, Science Robotics etc.)
* FrontiersIn (Frontiers in Neuroscience, Frontiers in Neuroscience, Frontiers in Microbiology etc.)
* PLOS
* Royal Society of Chemistry
* [Sci-Hub](#ad-hoc-pdfs)
* [Add more](https://github.com/vict0rsch/PaperMemory/issues/13)

[About finding published papers from preprints](#preprints)

## Privacy

All the data collected is stored locally on your computer and you can export it to `json` it from the options page.

## Feature requests

I'm regularly adding feature ideas in the [issues](https://github.com/vict0rsch/PaperMemory/issues). Feel free to go upvote the ones you'd like to see happen or submit your own requests.

## Customization

Customize features in the menu:


<p align="center">
  <img width="400" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/menu_concat.png?raw=true">
</p>

Switch between Light and Dark mode

<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/lightdark.png?raw=true">
</p>




## Keyboard Shortcuts


## User Guides

<p align="center">
<img src="https://raw.github.com/vict0rsch/PaperMemory/master/extra/imgs/guide-arrows.png?raw=true">
</p>

<p align="center">
<img src="https://raw.github.com/vict0rsch/PaperMemory/master/extra/imgs/guide-memory.png?raw=true">
</p>

## Advanced

In the extension's `options` (right click on the icon or in the popup's menu) you will find advanced customization features:

* **Auto-tagging**: add tags to papers based on regexs matched on authors and titles
* **Source filtering**: filter out some paper sources you don't want to record papers from
* **Custom title function**: provide Javascript code to generate your own web page titles and pdf filenames based on a paper's attributes
* **Data management**: export/load your memory data and export the bibliography as a `.bib` file
* **Online Synchronization**: use Github Gists to sync your papers across devices

<p align="center">
  <img src="https://raw.github.com/vict0rsch/PaperMemory/master/extra/imgs/opt_concat.png?raw=true">
</p>

## Install from source

## Preprints

There currently exists, to my knowledge, no centralized source for matching a preprint to its subsequent published article. This makes it really hard to try and implement best practices in terms of citing published papers rather than their preprint.

My approach with PaperMemory is to try and notify you that a publication likely exists by utilizing the `note` field. You will occasionally notice `Accepted @ X` in a Paper's notes. This will be added automatically if you are on a known published venue's website (as Nature, PMLR or NeurIPS) but also from DBLB, CrossRef.org, SemanticScholar.org or Google Scholar.

There's room for improvement here^, please contact me (an issue will do) if you want to help.

## Discovering Code repositories

PaperMemory uses the PapersWithCode API in order to discover code repositories 🖥️


## FAQ

## Todo

* [ ] Improve `Contributing.md`
* [ ] Write many more tests! **Help is wanted** (it's not so hard to write unittests 😄) (see `Contributing.md`)

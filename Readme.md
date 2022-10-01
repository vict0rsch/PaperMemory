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

[![](https://img.shields.io/chrome-web-store/stars/hmebhknlgddhfbbdhgplnillngljgmdi)](https://chrome.google.com/webstore/detail/paper-memory/hmebhknlgddhfbbdhgplnillngljgmdi)
[![](https://img.shields.io/badge/buy%20me-a%20coffee%20%E2%98%95%EF%B8%8F-FFDD03)](https://www.buymeacoffee.com/vict0rsch)
[![](https://img.shields.io/badge/Source%20%5BWIP%5D-v0.5.9-important)](https://github.com/vict0rsch/PaperMemory)
[![](https://img.shields.io/badge/Release-v0.5.9-A41716)](https://github.com/vict0rsch/PaperMemory/tree/0.5.7)

<br/>

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

<p align="center">
<img width="800" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/display.png?raw=true"/>
</p>

---

<br/>

<p align="center">
 <a href="#supported-venues">Supported Venues</a> &nbsp;•&nbsp; <a href="#demo">Demo</a> &nbsp;•&nbsp; <a href="#keyboard-navigation">Keyboard Navigation</a> &nbsp;•&nbsp; <a href="#guides">User Guide</a> &nbsp;•&nbsp; <a href="#advanced">Advanced features</a> &nbsp;•&nbsp; <a href="#install-from-source-brave--chrome">Install from source</a> &nbsp;•&nbsp; <a href="#preprints">About preprints</a> &nbsp;•&nbsp; <a href="#discovering-code-repositories">Discovering code Repositories</a> &nbsp;•&nbsp; <a href="#faq">FAQ</a>
</p>

<br/>

## Supported venues

* Arxiv (PaperMemory will try to find if a pre-print has been published and create a corresponding `note` to the paper (see [preprints](#preprints)))
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

### Privacy

All the data collected is stored locally on your computer and you can export it to `json` it from the options page.

### Feature requests

I'm regularly adding feature ideas in the [issues](https://github.com/vict0rsch/PaperMemory/issues). Feel free to go upvote the ones you'd like to see happen or submit your own requests.

### Duplicates

As of version `0.5.3`, PaperMemory finds and merges duplicates based on their titles only. If you visit a paper which has the same title as an existing paper, it will not be added as a new paper, rather "attached" to the existing one. However, if the existing paper does not have a known publication venue and the new paper does, then they are switched to favour the one with a known publication venue.

## Demo


![](https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/d2.gif?raw=true)

Customize features in the menu:


<p align="center">
  <img width="400" src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/menu_concat.png?raw=true">
</p>

Switch between Light and Dark mode


<p align="center">
<img src="https://github.com/vict0rsch/PaperMemory/blob/master/extra/imgs/lightdark.png?raw=true">
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
  * Paper years
    * Start the search query with `y: ${year}`, optionally with `,` separating requested years or starting with `>` or `<` to filter paper published after/before a given year (stricly)
      * `y: 20,21,22` will display papers published in `2020 OR 2021 OR 2022`
      * `y: <2015` will display papers published before (strictly) `2015`
      * `y: >19` will display papers published after (strictly) `2019`
  * Paper tags
    * Start the search query with `t:` to filter by tags
    * `t: gan` will look for _all papers whose tag-list contains at least 1 tag containing "gan"_
    * `t: gan tim` will look for _all papers whose tag-list contains (at least 1 tag containing "gan") AND (at least 1 tag containing "tim")_
* **Export** your memory as json file (in the extension's Menu)

### Keyboard Shortcuts

By default, and _if_ they are not already attributed, the following keyboard shortcuts are available:

* `cmd/ctrl + shift + e` will open PaperMemory's popup
* `cmd/ctrl + shift + s` will try to download the pdf of the current paper. If you have enabled this feature in the menu, the paper will be downloaded in your PaperMemoryStore (see thee advanced options page for more info)
* `cmd/ctrl + shift + l` will trigger the manual parsing of a paper if you have disabled automatic paper detection in the menu

All those shortcuts can be changed/set from `chrome://extensions/shortcuts` or `about:addons` (Firefox).

## Guides

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

## Install from source (Brave & Chrome)

* Download/clone the repo
* Go to Chrome/Brave's extension manager
* Enable developer mode
* Click on "load unpackaged extension"
* Select the downloaded folder :)

## Preprints

There currently exists, to my knowledge, no centralized source for matching a preprint to its subsequent published article. This makes it really hard to try and implement best practices in terms of citing published papers rather than their preprint.

My approach with PaperMemory is to try and notify you that a publication likely exists by utilizing the `note` field. You will occasionally notice `Accepted @ X` in a Paper's notes. This will be added automatically if you are on a known published venue's website (as Nature, PMLR or NeurIPS) but also from:
* [PapersWithCode.com](https://paperswithcode.com)
  * A query is sent to their [api](https://paperswithcode.com/api/v1/docs/) from an Arxiv ID or a paper's plain text title if it's not an Arxiv paper
  * As PaperMemory retrieves code, it also looks for a `proceeding` field in PWC's response.
  * If it exists and is not `null` then it is expected to look like `${conf}-${year}-${month}`.
  * In this case a note is added to the paper: `Accepted @ ${conf} ${year} -- [paperswithcode.com]`
* [dblp.org](https://dblp.org)
  * A query is sent to their [api](https://dblp.org/faq/How+to+use+the+dblp+search+API.html) for an exact paper title match
  * The oldest `hit` in the response which is not a preprint (`hit.venue !== "CoRR"`) is used
  * If such a match is found, a note is added as: `Accepted @ ${venue} ${year} -- [dblp.org]`
    * In this case, **the original Arxiv bibtex data is overwritten to use DBLP's**
    * Try for instance [Domain-Adversarial Training of Neural Networks](http://arxiv.org/pdf/1505.07818v4)
    * Note that DBLP journals may use ISO4 abbreviations
* [SemanticScholar.org](https://www.semanticscholar.org/)
  * A query is sent to their [api](https://www.semanticscholar.org/product/api) for an exact paper title match
  * Up to 50 relevant papers are returned in `response.data` as an `Array`
  * In case of a match, the venue should not be `"ArXiv"`
  * If there's a match and its venue is not Arxiv then `match.venue` and `match.year` are used to create a note: `Accepted @ {venue} ({year}) -- [semanticscholar.org]`
* [CrossRef.org](https://crossref.org)
  * A query is sent to their [api](https://api.crossref.org/swagger-ui/index.html) for an exact paper title match
  * The response *must* contain an `event` field with a `name` attribute. If it does not it'll be ignored.
  * If it does, a note is added as: `Accepted @ ${items.event.name} -- [crossref.org]`
    * Try for instance [Attention-Guided Generative Adversarial Networks for Unsupervised Image-to-Image Translation](http://arxiv.org/pdf/1903.12296v3)

There's room for improvement here^, please contact me (an issue will do) if you want to help

## Discovering Code repositories

PaperMemory uses the PapersWithCode API in order to discover code repositories. If the paper being added to the Memory is from Arxiv, PaperMemory will use PWC's `arxiv_id` search field. Otherwise it will query per title. PaperMemory then expects exactly `1` result from the API. Any different `count` in the response will make PaperMemory consider there is no match.

If a match is found, the selected repo is the official (if it exists) one with the most stars (customizable in the Advanced Options).

Here's an example return value from PWC's API

```json
"https://paperswithcode.com/api/v1/papers/?title=climategan"

{
  "count": 1,
  "next": null,
  "previous": null,
  "results": [
    {
      "id": "climategan-raising-climate-change-awareness",
      "arxiv_id": "2110.02871",
      "nips_id": null,
      "url_abs": "https://arxiv.org/abs/2110.02871v1",
      "url_pdf": "https://arxiv.org/pdf/2110.02871v1.pdf",
      "title": "ClimateGAN: Raising Climate Change Awareness by Generating Images of Floods",
      "abstract": "...",
      "authors": ["..."],
      "published": "2021-10-06",
      "conference": "climategan-raising-climate-change-awareness-1",
      "conference_url_abs": "https://openreview.net/forum?id=EZNOb_uNpJk",
      "conference_url_pdf": "https://openreview.net/pdf?id=EZNOb_uNpJk",
      "proceeding": "iclr-2022-4"
    }
  ]
}

"https://paperswithcode.com/api/v1/papers/climategan-raising-climate-change-awareness/repositories/"

{
  "count": 2,
  "next": null,
  "previous": null,
  "results": [
    {
      "url": "https://github.com/cc-ai/climategan",
      "owner": "cc-ai",
      "name": "climategan",
      "description": "Code and pre-trained model for the algorithm generating visualisations of 3 climate change related events: floods, wildfires and smog. ",
      "stars": 25,
      "framework": "pytorch",
      "is_official": true
    },
    {
      "url": "https://github.com/cc-ai/mila-simulated-floods",
      "owner": "cc-ai",
      "name": "mila-simulated-floods",
      "description": "",
      "stars": 7,
      "framework": "pytorch",
      "is_official": true
    }
  ]
}

```

## Ad-Hoc PDFs

If you want to associate a pdf to a paper in your PaperMemoryStore that is not downloaded from PaperMemory (for instance, it is behind a paywall), you can **download it to `~/Downloads/PaperMemoryStore/`** (maybe you're reading the paper on Sci-Hub you thief 🙃) provided the file's name contains the **paper's title** (not counting non-alphanumeric characters and case-insensitive).

Because of limitations Browser Extensions face, a file **must** be _downloaded from the Browser to the folder_ in order to be detected. This means that if someone sends you a pdf over Slack or if you move a file to the PaperMemoryStore folder for instance, you won't be able to match it to a PaperMemory item.

## FAQ

<details>
<summary><strong>Why does PaperMemory require access to all urls?</strong></summary>
<br/>
Because Chrome & Brave will disable an extension by default when it auto-updates with new permissions. In this case, any new addition of a paper source will require new permissions to access the data necessary to parse the paper data and will therefore disable the extension until users re-enable it.
</details>

<details>
<summary><strong>The button to go from an abstract to its pdf does not work</strong></summary>
<br/>
In general there can be 2 reasons:

1. It's a bug, it can happen, I'm sorry about this: you should raise an issue, and ideally even provide a fix in a Pull Resquest
2. More likely, the pdf is behind a paywall and the standard `abstract -> pdf` path was redirected by the venue's website

</details>

<details>
<summary><strong>How do you match Arxiv.org pre-prints to actual publications?</strong></summary>
<br/>

It's all there: [preprints](#preprints) 😃

Contributions and ideas on how to improve the process and potentially add publication sources from titles or arxiv `id` are welcome!
</details>

<details>
<summary><strong>Where does PaperMemory store my data?</strong></summary>
<br/>
It's all stored locally in your browser's local storage. If you want to transfer data to a new browser/computer, use the export/import tools in the extension's options.
</details>

<details>
<summary><strong>How can I export all or some papers?</strong></summary>
<br/>

In the Advanced Options page, you can either export your full memory data to a <code>.json</code> or <code>.bib</code> bibliography, or only export papers with a given tag. More details in <a href="https://github.com/vict0rsch/PaperMemory/issues/89">#89</a>
</details>

<details>
<summary><strong>How do I resolve duplicates?</strong></summary>
<br/>
    <ul>
        <li>If you installed PaperMemory <code>&lt;0.5.3</code> (May 2022) you may have duplicate papers in your Memory. The easiest way to resolve this is to go to a duplicate's page, then delete it from memory and refresh the page. The automatic de-duplication features in version <code>0.5.3</code> should handle the matching <em>if</em> the 2 papers have the same title.</li><br/>
        <li>If you still see duplicates with PaperMemory <code>&gt;=0.5.3</code> <em>and</em> the 2 papers have the same title, this may be a problem with PaperMemory and you should open an issue here on Github.</li>
        </ul>

</details>

<details>
<summary><strong>Can I access the memory full-screen?</strong></summary>
<br/>
Sure! In the extension popup's menu, there's a link at the bottom to the full-page memory. You can also just go to this url (Thanks @kaixin96!):

```
chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/fullMemory/fullMemory.html
```
</details>

<details>
<summary><strong>Can I exclude a paper source?</strong></summary>
<br/>
Yep. In the extension popup's advanced options page: right-click the extension's icon and click on `Options`. Or click on the link at the bottom of the popup menu. Or go to this url (Thanks @kaixin96!):

```
chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/options/options.html
```
</details>

<details>
<summary><strong>Are there data backups?</strong></summary>
<br/>

In case there's a bad bug or you mess up when overwriting your memory, PaperMemory preforms weekly backups (locally as always), which you can retrieve with a little coding:

1. Open the extension's options (either right clicking its icon, or from the extension's menu, at the bottom)
2. On the options page, open the Javascript Console with `cmd/ctrl + alt + i` or `right click > Inspect`
3. Do the following in the Javascript Console:
    ```javascript
    const backups = await getStorage("weeklyBackups")
    console.log(Object.keys(backups)) // this shows you available backup dates
    const overwrite = backups["<some key from above>"]
    console.log(overwrite) // inspect this and make sure it is what you want
    setStorage("papers", overwrite) // Careful! This will overwrite the current data with the backup data
    ```

  Note that if you uninstall PaperMemory all your data will be gone and the only way to keep track of what was in your Memory is to export it first (in the advanced options page).
</details>

## Todo

* [ ] Improve `Contributing.md`
* [ ] Write many more tests! **Help is wanted** (it's not so hard to write unittests 😄) (see `Contributing.md`)

## Help

* **Firefox**
  * Using Firefox? [#9](https://github.com/vict0rsch/PaperMemory/issues/9) 🚁

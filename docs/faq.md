---
description: PaperMemory's Frequently Asked Questions
icon: octicons/question-16
---

# FAQ

### Why does PaperMemory require access to all URLs?

PaperMemory needs to read the pages of every Source it supports, and of any page you add by hand. Chrome and Brave disable an extension when an update asks for new permissions, so each new Source would turn PaperMemory off until you turn it back on. Access to all URLs avoids that.

### Why are PDFs not saved in Firefox?

Firefox does not let extensions run on PDF pages, so PaperMemory cannot save a paper from its PDF automatically. Open the popup on the PDF and click _Add it now_, or open the paper's abstract page instead.

More info [here](https://discourse.mozilla.org/t/content-script-not-run-for-pdf-pages/33660).

### The button to go from an abstract to its PDF does not work

There are two likely reasons:

1. The PDF is behind a paywall, and the venue's website redirected the usual abstract-to-PDF link.
2. It is a bug. Please [open an issue](https://github.com/vict0rsch/PaperMemory/issues), and a pull request if you can.

### How do you match arXiv preprints to their publications?

See [Preprint matching](features.md#preprint-matching). Ideas and contributions to improve it are welcome.

### Where does PaperMemory store my data?

In your browser's extension storage. There is no PaperMemory account and no PaperMemory server. To move your Memory to another browser or computer, export it and import it from the [options page](configuration.md#import-export), or turn on [Gist sync](features.md#gist-sync).

### How can I export all or some papers?

On the options page, under [Import & export](configuration.md#import-export), you can export:

- your whole Memory as a `.json` backup,
- your whole bibliography as a `.bib` file, or as JSON,
- the papers with some tags, as `.bib`, `.json` or a `.json` list of URLs.

In the [full-page Memory](getting-started.md#full-page-memory), you can also select papers and export them as a `.bib` file.

### Can I reference my PDF in PaperMemory?

You can link a PDF that PaperMemory did not download (for instance, one behind a paywall) to a paper in your Memory. **Download it to `~/Downloads/PaperMemoryStore/`** with a file name that contains the **paper's title** (case and non-alphanumeric characters do not matter).

Browser extensions only see files that the browser downloaded. A file must be _downloaded from the browser to that folder_ to be found. A PDF you received on Slack and moved into the folder by hand will not be matched.

See [PaperMemoryStore](features.md#papermemorystore).

### How do I resolve duplicates?

When you open a paper whose title (ignoring case and punctuation) matches one already in your Memory, PaperMemory updates that paper instead of adding a second one. If you still see two papers with the same title, please [open an issue](https://github.com/vict0rsch/PaperMemory/issues).

### Can I see my Memory in a full tab?

Yes: click _Full Memory_ in popup Settings. See [Full-page Memory](getting-started.md#full-page-memory).

### Can I exclude a paper source?

Yes. On the options page, under [Capture](configuration.md#capture), turn off the Sources you do not want. Papers already saved stay in your Memory. The welcome tab shows the same list.

### Are there data backups?

PaperMemory keeps a copy of your Memory every week, in your browser, and keeps up to six. To restore one:

1. Open the [options page](configuration.md#options-page).
2. Open the JavaScript console (right-click the page, _Inspect_, then _Console_).
3. List the available backups:

    ```javascript
    chrome.storage.local.get("weeklyBackups", ({ weeklyBackups }) => {
        window.backups = weeklyBackups;
        console.log(Object.keys(weeklyBackups)); // backup dates
    });
    ```

4. Copy the one you want to the clipboard:

    ```javascript
    copy(JSON.stringify(backups["<a date from the list above>"]));
    ```

5. Paste it into a new `.json` file, then use _Replace your Memory from a backup_ under [Import & export](configuration.md#import-export). A copy of your current Memory is downloaded first.

If you uninstall PaperMemory, your Memory is deleted with it. Export it first from the options page.

# FAQ


### Why does PaperMemory require access to all urls?

Because Chrome & Brave will disable an extension by default when it auto-updates with new permissions. In this case, any new addition of a paper source will require new permissions to access the data necessary to parse the paper data and will therefore disable the extension until users re-enable it.

### The button to go from an abstract to its pdf does not work

In general there can be 2 reasons:

1. It's a bug, it can happen, I'm sorry about this: you should raise an issue, and ideally even provide a fix in a Pull Resquest
2. More likely, the pdf is behind a paywall and the standard `abstract -> pdf` path was redirected by the venue's website


### How do you match Arxiv.org pre-prints to actual publications?


It's all there: [preprints](#preprints) 😃

Contributions and ideas on how to improve the process and potentially add publication sources from titles or arxiv `id` are welcome!

### Where does PaperMemory store my data?

It's all stored locally in your browser's local storage. If you want to transfer data to a new browser/computer, use the export/import tools in the extension's options.

### How can I export all or some papers?



### How do I resolve duplicates?

* If you installed PaperMemory `<0.5.3` (May 2022) you may have duplicate papers in your Memory. The easiest way to resolve this is to go to a duplicate's page, then delete it from memory and refresh the page. The automatic de-duplication features in version `0.5.3` should handle the matching _if_ the 2 papers have the same title.
* If you still see duplicates with PaperMemory `>=0.5.3` _and_ the 2 papers have the same title, this may be a problem with PaperMemory and you should open an issue here on Github.


### Can I access the memory full-screen?

Sure! In the extension popup's menu, there's a link at the bottom to the full-page memory. You can also just go to this url (Thanks @kaixin96!):

```bash
# copy-paste this url
chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/fullMemory/fullMemory.html
```

### Can I exclude a paper source?

Yep. In the extension popup's advanced options page: right-click the extension's icon and click on `Options`. Or click on the link at the bottom of the popup menu. Or go to this url (Thanks @kaixin96!):

```bash
# copy-paste this url
chrome-extension://ehchlpggdaffcncbeopdopnndhdjelbc/src/options/options.html
```

### Are there data backups?

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
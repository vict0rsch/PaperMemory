var paperTitles = {}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type == "update-title") {
        // console.log("Executing background message received options")
        // console.log({ options: request.options })
        // console.log(" ")
        const { title, url } = request.options;
        paperTitles[url] = title
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title && !changeInfo.title.startsWith("https") && changeInfo.title.match(/\d+\.\d+v?\d?\.pdf/g)) {
        // console.log(">>> onUpdated")
        // console.log(tabId)
        // console.log(changeInfo)
        // console.log(tab)
        // console.log(paperTitles)
        if (paperTitles.hasOwnProperty(tab.url) && paperTitles[tab.url]) {
            title = paperTitles[tab.url];
            if (changeInfo.title === title) return
            // console.log("/!\\ Updating title to: ", paperTitles[tab.url])
            // https://stackoverflow.com/questions/69406482/window-title-is-not-changed-after-pdf-is-loaded
            title = title.replaceAll('"', "'")
            chrome.tabs.executeScript(tabId, {
                code: `document.title=''; document.title="${title}"`,
                runAt: 'document_start',
            });
        }
        // console.log("<<<<<<<<<<<")
    }

})
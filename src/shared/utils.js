function delay(fn, ms) {
    // https://stackoverflow.com/questions/1909441/how-to-delay-the-keyup-handler-until-the-user-stops-typing
    let timer = 0
    return function (...args) {
        clearTimeout(timer)
        timer = setTimeout(fn.bind(this, ...args), ms || 0)
    }
}

function fallbackCopyTextToClipboard(text) {
    var textArea = document.createElement("textarea");
    textArea.value = text;

    // Avoid scrolling to bottom
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";

    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        var successful = document.execCommand('copy');
        var msg = successful ? 'successful' : 'unsuccessful';
        console.log('Fallback: Copying text command was ' + msg);
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

function copyTextToClipboard(text) {
    if (!navigator.clipboard) {
        fallbackCopyTextToClipboard(text);
        return;
    }
    navigator.clipboard.writeText(text).then(function () {
        console.log('Async: Copying to clipboard was successful!');
    }, function (err) {
        console.error('Async: Could not copy text: ', err);
    });
}

function parseUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    return a;
}

const downloadTextFile = (content, fileName, contentType) => {
    var a = document.createElement("a");
    var file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}


const eventId = e => {
    const id = e.target.id.split("--")[1];
    const eid = id.replace(".", "\\.")
    return { id, eid }
}

const download_file = (fileURL, fileName) => {
    // for non-IE
    if (!window.ActiveXObject) {
        var save = document.createElement('a');
        save.href = fileURL;
        save.target = '_blank';
        var filename = fileURL.substring(fileURL.lastIndexOf('/') + 1);
        save.download = fileName || filename;
        if (navigator.userAgent.toLowerCase().match(/(ipad|iphone|safari)/) && navigator.userAgent.search("Chrome") < 0) {
            document.location = save.href;
            // window event not working here
        } else {
            var evt = new MouseEvent('click', {
                'view': window,
                'bubbles': true,
                'cancelable': false
            });
            save.dispatchEvent(evt);
            (window.URL || window.webkitURL).revokeObjectURL(save.href);
        }
    }

    // for IE < 11
    else if (!!window.ActiveXObject && document.execCommand) {
        var _window = window.open(fileURL, '_blank');
        _window.document.close();
        _window.document.execCommand('SaveAs', true, fileName || fileURL)
        _window.close();
    }
}

const defaultPDFTitleFn = (title, id) => {
    title = title.replaceAll("\n", " ").replace(/\s\s+/g, ' ');
    return `${title} - ${id}.pdf`
}
const getPdfFn = code => {
    try {
        pdfTitleFn = eval(code)
    } catch (error) {
        console.log("Error parsing pdf title function. Function string then error:");
        console.log(code)
        console.log(error)
        pdfTitleFn = defaultPDFTitleFn
    }
    try {
        pdfTitleFn("test", "1.2")
    } catch (error) {
        console.log("Error testing the user's pdf title function. Function string then error:")
        console.log(code)
        console.log(error)
        pdfTitleFn = defaultPDFTitleFn
    }

    return pdfTitleFn
}


const migrateData = async (papers, dataVersion) => {
    try {


        if (papers.hasOwnProperty("__dataVersion")) {
            if (papers["__dataVersion"] === dataVersion) {
                delete papers["__dataVersion"]
                return papers
            }
        }

        delete papers["__dataVersion"]

        for (const id in papers) {
            if (!papers[id].hasOwnProperty("bibtext")) {
                papers[id].bibtext = "";
                console.log("Migrating bibtext for " + id);
            }
            if (!papers[id].pdfLink.endsWith(".pdf")) {
                papers[id].pdfLink = papers[id].pdfLink + ".pdf"
            }
            if (!papers[id].source) {
                if (papers[id].id.includes("NeurIPS")) {
                    papers[id].source = "neurips"
                } else {
                    papers[id].source = "arxiv"
                }
            }
            // if (!papers[id].hasOwnProperty("codes")) {
            //     papers[id].codes = await fetchCodes(papers[id])
            // }
        }

        papers["__dataVersion"] = dataVersion;

        chrome.storage.local.set({ papers }, () => {
            console.log("Migrated papers:");
            console.log(papers)
        })


        delete papers["__dataVersion"]

        return papers
    } catch (error) {
        console.log("Error migrating data:")
        console.log(error)
        return papers
    }
}


var state = {
    menuIsOpen: false,
    memoryIsOpen: false,
    papers: {},
    papersList: [],
    sortedPapers: [],
    sortKey: "",
    paperTags: new Set(),
    dataVersion: 0,
    pdfTitleFn: defaultPDFTitleFn
};

const statePdfTitle = (title, id) => {
    let name;
    try {
        name = state.pdfTitleFn(title, id);
    } catch (error) {
        name = defaultPDFTitleFn(title, id);
    }

    return name.replaceAll("\n", " ").replace(/\s\s+/g, ' ')
}


const initState = async (papers, noDisplay) => {
    console.log("Found papers:")
    console.log(papers)
    state.dataVersion = 4
    papers = await migrateData(papers, state.dataVersion)
    if (noDisplay) return papers
    state.papers = papers;
    state.papersList = Object.values(papers);
    state.sortKey = "lastOpenDate";
    sortMemory()
    makeTags()
}
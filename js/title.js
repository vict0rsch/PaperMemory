/* Helper function */
function download_file(fileURL, fileName) {
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

$(() => {

    var h = null;
    $("h2").each((idx, el) => {
        if ($(el).html() === "Download:") {
            h = $(el)
        }
    });
    const id = document.title.slice(1, 11);
    const pdfUrl = "https://arxiv.org/pdf/" + id + ".pdf";
    const fileName = id + " - " + document.title.split(" ").slice(1).join(" ") + ".pdf"
    const button = `
    <div id="arxiv-container">
        <button id="arxiv-button" class="arxiv-learn-more">
            <span class="arxiv-circle" aria-hidden="true">
                <span class="arxiv-icon arxiv-arrow"></span>
            </span>
            <span class="arxiv-button-text">Download</span>
        </button>
    </div>
    `
    const ul = h.parent().append(button)
    $("#arxiv-button").click(() => {
        console.log("click")
        download_file(pdfUrl, fileName)
    })


    $.get(`https://export.arxiv.org/api/query?id_list=${id}`).then(data => {

        var bib = $(data);
        console.log("bib");
        console.log(bib);
        var authors = [];
        var key = ""
        bib.find("author name").each((k, v) => {
            authors.push($(v).text());
            if (k === 0){
                key += $(v).text().split(" ")[1].toLowerCase()
            }
        })
        const author = "{" + authors.join(" and ") + "}";
        const title = "{" + $(bib.find("entry title")[0]).text() +  "}"
        const year = "{" + $(bib.find("entry published")[0]).text().slice(0, 4) +  "}"
        key += year;
        key += title.slice(1).split(" ")[0].toLowerCase()

        const bibtex = `
    @article{${key},
    title=${title},
    author=${author},
    year=${year},
    journal={arXiv preprint arXiv:${id}}
}`.trim()

    const texDiv = `
    <div id="texDiv">
        <div id="texHeader">
            <h3>BibTex:</h3>
            <button>copy citation</button>
        </div>
        <div id="texTextarea">${bibtex}</div>
    </div>
    `
    h.parent().append(texDiv)
    function copyDivToClipboard() {
        var range = document.createRange();
        range.selectNode(document.getElementById("texTextarea"));
        window.getSelection().removeAllRanges(); // clear current selection
        window.getSelection().addRange(range); // to select text
        document.execCommand("copy");
        window.getSelection().removeAllRanges();// to deselect
    }
    $("#texHeader button").click(e => {
        copyDivToClipboard();
        $("body").append(`
        <div id="texBibCopied" style="display:none">Bibtex Citation Copied!</div>
        `)
        $("#texBibCopied").fadeIn();
        setTimeout(()=>{
            $("#texBibCopied").fadeOut(() => {
                $("#texBibCopied").remove();
            });

        }, 2000)

    });


    })

})

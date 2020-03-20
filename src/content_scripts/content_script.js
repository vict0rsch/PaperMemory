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

    var timeout = null;
    var prevent = false;

    const feedback = text => {
        try {
            clearTimeout(timeout)
            $("#feedback-notif").remove();
            prevent = true;
        } catch (error) {
            console.log("No feedback to remove.")
        }
        $("body").append(`
            <div id="feedback-notif" style="display:none">${text}</div>
        `)
        $("#feedback-notif").fadeIn();
        timeout = setTimeout(() => {
            $("#feedback-notif").fadeOut(() => {
                !prevent && $("#feedback-notif").remove();
                prevent = false;
            });

        }, 2000)
    }
    const copyDivToClipboard = divId => {
        var range = document.createRange();
        range.selectNode(document.getElementById(divId));
        window.getSelection().removeAllRanges(); // clear current selection
        window.getSelection().addRange(range); // to select text
        document.execCommand("copy");
        window.getSelection().removeAllRanges();// to deselect
    }

    var checkMd = true;
    var checkBib = true;
    var checkDownload = true;
    chrome.storage.sync.get(['checkBib', 'checkMd', 'checkDownload'], function (items) {

        console.log(">> received", items);

        checkMd = items.hasOwnProperty("checkMd") && items.checkMd;
        checkBib = items.hasOwnProperty("checkBib") && items.checkBib;
        checkDownload = items.hasOwnProperty("checkDownload") && items.checkDownload;
        console.log({ checkMd, checkBib, checkDownload });




        var h = null;
        $("h2").each((idx, el) => {
            if ($(el).html() === "Download:") {
                h = $(el);
            }
        });
        const id = document.title.slice(1, 11);
        const pdfUrl = "https://arxiv.org/pdf/" + id + ".pdf";
        const fileName = id + " - " + document.title.split(" ").slice(1).join(" ") + ".pdf";

        // -----------------------------
        // -----  Download Button  -----
        // -----------------------------
        if (checkDownload) {
            const button = `
            <div class="arxivTools-container">
                <button id="arxiv-button" class="arxiv-learn-more">
                    <span class="arxiv-circle" aria-hidden="true">
                        <span class="arxiv-icon arxiv-arrow"></span>
                    </span>
                    <span class="arxiv-button-text">Direct Download</span>
                </button>
            </div>
            `;
            h.parent().append(button)
            $("#arxiv-button").click(() => {
                console.log("click");
                download_file(pdfUrl, fileName);
            })
        }
        // ---------------------------
        // -----  Markdown Link  -----
        // ---------------------------
        if (checkMd) {
            h.parent().append(`
            <div id="markdown-container">
                <div id="markdown-header" class="arxivTools-header">
                    <h3>Markdown</h3>
                    <button>copy link</button>
                </div>
                <div id="markdown-link" class="arxivTools-codify">[${document.title}](${window.location.href})</div>
            </div>
        `);
            $("#markdown-header button").click(e => {
                copyDivToClipboard("markdown-link");
                feedback("Markdown Link Copied!");
            });
        }

        if (checkBib) {

            h.parent().append(`
                <div id="loader-container" class="arxivTools-container">
                    <div class="sk-folding-cube">
                        <div class="sk-cube1 sk-cube"></div>
                        <div class="sk-cube2 sk-cube"></div>
                        <div class="sk-cube4 sk-cube"></div>
                        <div class="sk-cube3 sk-cube"></div>
                    </div>
                </div>
            `);



            $.get(`https://export.arxiv.org/api/query?id_list=${id}`).then(data => {

                var bib = $(data);
                console.log("bib");
                console.log(bib);
                var authors = [];
                var key = "";
                bib.find("author name").each((k, v) => {
                    authors.push($(v).text());
                    if (k === 0) {
                        key += $(v).text().split(" ")[$(v).text().split(" ").length - 1].toLowerCase();
                    }
                })
                const author = "{" + authors.join(" and ") + "}";
                const title = "{" + $(bib.find("entry title")[0]).text() + "}";
                const year = $(bib.find("entry published")[0]).text().slice(0, 4);
                key += year;
                key += title.slice(1).split(" ")[0].toLowerCase().replace(/[^0-9a-z]/gi, '');

                let bibtex = `@article{${key},\n`;
                bibtex += `    title=${title},\n`;
                bibtex += `    author=${author},\n`;
                bibtex += `    year={${year}},\n`;
                bibtex += `    journal={arXiv preprint arXiv:${id}}\n`;
                bibtex += `}`;

                const bibtexDiv = `
                    <div id="bibtexDiv">
                        <div id="texHeader" class="arxivTools-header">
                            <h3>BibTex:</h3>
                            <button>copy citation</button>
                        </div>
                        <div id="texTextarea" class="arxivTools-codify">${bibtex}</div>
                    </div>
                `;

                $("#loader-container").fadeOut(() => {
                    $("#loader-container").remove();
                    h.parent().append(bibtexDiv);
                    $("#texHeader button").click(e => {
                        copyDivToClipboard("texTextarea");
                        feedback("Bibtex Citation Copied!");
                    });
                });


            })
        }
    });
})

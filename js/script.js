(function () {
    var dotsMenu;
    dotsMenu = document.querySelector(".dots");

    dotsMenu.addEventListener("click", function () {
        return dotsMenu.classList.toggle("on");
    });

}).call(this);

function parseUrl(url) {
    var a = document.createElement('a');
    a.href = url;
    return a;
}

var helpIsOpen = false;

const arxiv = id => {
    $.get("https://export.arxiv.org/api/query?id_list=" + id).done(
        xml => {
            xml = $(xml);
            const title = xml.find("entry title").text();
            let authors = [];
            xml.find("entry author name").each((i, a) => authors.push(a.textContent));
            const cite = authors[0].split(" ")[0] + year + title.split(" ")[0];
            const template = `@misc{${cite},
                title={${title}},
                author={${authors.join(" and ")}},
                year={${year}},
                eprint={${id}},
                archivePrefix={arXiv},
                primaryClass={cs.CY}
            }`

        }
    )
}

const main = url => {
    url = parseUrl(url);
    console.log(url);

    $("#helpGithubLink").click(() => {
        chrome.tabs.update({
            url: "https://github.com/vict0rsch/arxiv-pdf-abs"
        });
    })
    $("#coblock").click(() => {
        chrome.tabs.update({
            url: "https://marketplace.visualstudio.com/items?itemName=vict0rsch.coblock"
        });
    })

    $("button.dots").click(() => {
        helpIsOpen ?
            $("#helpDiv").slideUp({
                duration: 500,
                easing: "easeOutQuint"
            }) :
            $("#helpDiv").slideDown({
                duration: 500,
                easing: "easeOutQuint"
            });
        helpIsOpen = !helpIsOpen;
    })

    if (url.hostname === "arxiv.org") {
        $("#notArxiv").hide();
        $("#notPdf").show();
        if (url.href.endsWith(".pdf")) {
            $("#notPdf").hide();
            $("#isArxiv").show();
            const paperId = url.href.split("/").reverse()[0].replace(".pdf", "");
            const newURL = `https://arxiv.org/abs/` + paperId;
            $("#goToAbstract").text(paperId)
            $("#goToAbstract").click((e) => {
                chrome.tabs.update({
                    url: newURL
                });
                window.close();
            })
        }
    }
}

$(() => {

    chrome.tabs.query({
        'active': true,
        'lastFocusedWindow': true
    }, function (tabs) {
        var url = tabs[0].url;
        main(url)
    });

});

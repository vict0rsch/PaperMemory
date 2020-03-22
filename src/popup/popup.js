// (function () {
//     var dotsMenu;
//     dotsMenu = document.querySelector(".dots");

//     dotsMenu.addEventListener("click", function () {
//         return dotsMenu.classList.toggle("on");
//     });

// }).call(this);

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

    $("#tabler-menu").click(() => {
        helpIsOpen ?
        $("#helpDiv").slideUp({
            duration: 500,
            easing: "easeOutQuint"
        }) && $("#tabler-menu").fadeOut( ()=> {
            $("#tabler-menu").html(`
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-adjustments" />
                </svg>
            `);
            $("#tabler-menu").fadeIn()
        })
        :
        $("#helpDiv").slideDown({
            duration: 500,
            easing: "easeOutQuint"
        }) &&  $("#tabler-menu").fadeOut( ()=> {
            $("#tabler-menu").html(`
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-circle-x" />
                </svg>
            `);
            $("#tabler-menu").fadeIn()
        })
        helpIsOpen = !helpIsOpen;
    })

    const checks = ["checkBib", "checkMd", "checkDownload", "checkPdfTitle"]
    chrome.storage.sync.get(checks, function (items) {

        console.log({ items })

        const hasKey = {};
        for (const key of checks) {
            hasKey[key] = items.hasOwnProperty(key);
        }
        console.log({ hasKey })
        const setValues = {}
        for (const key of checks) {
            setValues[key] = hasKey[key] ? items[key] : true;
        }
        console.log({ setValues })
        chrome.storage.sync.set(setValues, function () {
            chrome.storage.sync.get(checks, function (items) {
                console.log({ items })
                for (const key of checks) {
                    $("#" + key).prop("checked", items[key]);
                    setValues[key] = hasKey[key] ? items[key] : true;
                }
            });
        });

        for (const key of checks) {
            $("#" + key).change(function () {
                const checked = this.checked;
                chrome.storage.sync.set({ [key]: checked }, function () {
                    console.log(`Settings saved for ${key} (${checked})`);
                });
            });
        }

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
    });
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

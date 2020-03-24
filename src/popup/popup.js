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

const main = tab => {

    var feedbackTimeout = null;
    var feedbackPrevent = false;

    const feedback = () => {
        try {
            clearTimeout(feedbackTimeout)
            $("#feedback-notif").remove();
            feedbackPrevent = true;
        } catch (error) {
            console.log("No feedback to remove.")
        }
        $("#helpDiv").append(`
            <div id="check-feedback">
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-floppy-disk" />
                </svg>
            </div>
        `)
        $("#check-feedback").animate({
            right: "12px",
            opacity: "1"
        }, 300, "easeInOutBack");
        feedbackTimeout = setTimeout(() => {
            $("#check-feedback").animate({
                right: "-100px",
                opacity: "0"
            }, 300, "easeInOutBack", () => {
                !feedbackPrevent && $("#check-feedback").remove();
                feedbackPrevent = false;
            });

        }, 1500)
    }

    const url = parseUrl(tab.url);
    console.log(url);


    $("#helpGithubLink").click(() => {
        chrome.tabs.update({
            url: "https://github.com/vict0rsch/ArxivTools"
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
            }) && $("#tabler-menu").fadeOut(() => {
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
            }) && $("#tabler-menu").fadeOut(() => {
                $("#tabler-menu").html(`
                <svg class="tabler-icon">
                    <use xlink:href="../../icons/tabler-sprite-nostroke.svg#tabler-circle-x" />
                </svg>
            `);
                $("#tabler-menu").fadeIn()
            })
        helpIsOpen = !helpIsOpen;
    })

    const checks = ["checkBib", "checkMd", "checkDownload", "checkPdfTitle", "checkVanity"]
    chrome.storage.sync.get(checks, function (items) {

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
                    feedback()
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
                $("#goToAbstract").text(paperId);
                $("#abstract-card").click((e) => {
                    chrome.tabs.update({
                        url: newURL
                    });
                    window.close();
                })
                $.get(`https://export.arxiv.org/api/query?id_list=${paperId}`).then(data => {
                    const bib = $(data);
                    const title = $(bib.find("entry title")[0]).text();
                    $("#abstract-card-title").text(title);
                });
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
        console.log(tabs[0])
        main(tabs[0])
    });

});

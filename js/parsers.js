String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

const parseArxivBibtex = xmlData => {
    var bib = $(xmlData);
    // console.log(bib)
    var authors = [];
    var key = "";
    bib.find("author name").each((k, v) => {
        authors.push($(v).text());
        if (k === 0) {
            key += $(v).text().split(" ")[$(v).text().split(" ").length - 1].toLowerCase();
        }
    })
    var pdfLink = "";
    bib.find("link").each((k, v) => {
        const link = $(v).attr("href")
        if (link && link.indexOf("arxiv.org/pdf/") >= 0) {
            pdfLink = link
        }
    })
    const author = authors.join(" and ");
    const title = $(bib.find("entry title")[0]).text();
    const year = $(bib.find("entry published")[0]).text().slice(0, 4);
    key += year;
    key += title.slice(1).split(" ")[0].toLowerCase().replace(/[^0-9a-z]/gi, '');
    let arxivId;
    const ids = bib.find("id");
    ids.each((k, v) => {
        if ($(v).html().match(/\d\d\d\d\.\d\d\d\d\d/g)) {
            arxivId = $(v).html().match(/\d\d\d\d\.\d\d\d\d\d/g)[0];
        }
    })

    const bibvars = { key, title, author, year, arxivId, pdfLink };

    let bibtext = `@article{${key},\n`;
    bibtext += `    title={${title}},\n`;
    bibtext += `    author={${author}},\n`;
    bibtext += `    year={${year}},\n`;
    bibtext += `    journal={arXiv preprint arXiv:${arxivId}}\n`;
    bibtext += `}`;

    return {
        bibvars, bibtext
    }
}

const parseNeuripsHTML = (url, htmlText) => {
    const dom = new DOMParser().parseFromString(htmlText.replaceAll("\n", ""), "text/html");
    const doc = $(dom);
    const ps = doc.find(".container-fluid .col p");
    const hash = url.split("/").slice(-1)[0].replace("-Paper.pdf", "");

    const title = doc.find("h4").first().text();
    const author = $(ps[1]).text().split(", ").map((author, k) => {
        const parts = author.split(" ");
        const caps = parts.map((part, i) => { return part.capitalize() })
        return caps.join(" ")
    }).join(" and ");
    const pdfLink = url;
    const year = $(ps[0]).text().match(/\d{4}/)[0];
    const key = `neurips${year}${hash.slice(0, 8)}`;
    const arxivId = `NeurIPS-${year}_${hash.slice(0, 8)}`;

    return { key, title, author, year, arxivId, pdfLink }
}

const fetchArxivBibtex = async arxivId => {
    return $.get(`https://export.arxiv.org/api/query?id_list=${arxivId}`)
}

const fetchNeuripsHTML = async url => {

    let paperPage;
    if (url.endsWith(".pdf")) {
        paperPage = url.replace("/file/", "/hash/").replace("-Paper.pdf", "-Abstract.html");
    } else {
        paperPage = url;
    }

    return fetch(paperPage).then((response) => {
        return response.text()
    })
}

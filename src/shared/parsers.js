String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

var englishStopWords = new Set([
    ["i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you", "your", "yours", "yourself", "yourselves", "he", "him", "his", "himself", "she", "her", "hers", "herself", "it", "its", "itself", "they", "them", "their", "theirs", "themselves", "what", "which", "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing", "a", "an", "the", "and", "but", "if", "or", "because", "as", "until", "while", "of", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will", "just", "don", "should", "now"]
]);

const firstNonStopLowercase = title => {
    let t = title.toLowerCase();
    let words = t.split(" ").map(w => w.replace(/[^0-9a-z]/gi, ''));
    let meaningful = words.filter(w => englishStopWords.has(w))
    if (meaningful.length > 0) {
        return meaningful[0]
    }
    return words[0]
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
    key += firstNonStopLowercase(title);
    let id;
    const ids = bib.find("id");
    ids.each((k, v) => {
        if ($(v).html().match(/\d\d\d\d\.\d\d\d\d\d/g)) {
            id = $(v).html().match(/\d\d\d\d\.\d\d\d\d\d/g)[0];
        }
    })

    const bibvars = { key, title, author, year, id, pdfLink };

    let bibtext = `@article{${key},\n`;
    bibtext += `    title={${title}},\n`;
    bibtext += `    author={${author}},\n`;
    bibtext += `    year={${year}},\n`;
    bibtext += `    journal={arXiv preprint arXiv:${id}}\n`;
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
    const id = `NeurIPS-${year}_${hash.slice(0, 8)}`;

    const bibtext = `
@inproceedings{NEURIPS${year}_${hash.slice(0, 8)}
    author = {${author}},
    booktitle = {Advances in Neural Information Processing Systems},
    editor = {H. Larochelle and M. Ranzato and R. Hadsell and M. F. Balcan and H. Lin},
    publisher = {Curran Associates, Inc.},
    title = {${title}},
    url = {${url}},
    year = {${year}}
}`

    return { key, title, author, year, id, pdfLink, bibtext }
}

const fetchArxivBibtex = async id => {
    return $.get(`https://export.arxiv.org/api/query?id_list=${id}`)
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


const fetchOpts = {
    headers: {
        'mode': 'no-cors'
    }
}

const fetchPWCId = async (arxiv_id, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxiv_id) {
        pwcPath += new URLSearchParams({ arxiv_id })
    } else if (title) {
        pwcPath += new URLSearchParams({ title })
    }
    const json = await $.getJSON(pwcPath).then((data) => { return data });
    console.log({ json })

    undefined()

    if (json["count"] !== 1) return
    return json["results"][0]["id"];
}

const fetchCodes = async (paper) => {


    let arxiv_id, title;
    if (paper.source = "neurips") {
        title = paper.title;
    } else {
        arxiv_id = paper.id
    }

    const pwcId = await fetchPWCId(arxiv_id, title);
    if (!pwcId) return []

    let codePath = `https://paperswithcode.com/api/v1/papers/${pwcId}/repositories/?`
    codePath += new URLSearchParams({ page: 1, items_per_page: 10 })

    const response = await fetch(codePath);
    const json = await response.json();
    if (json["count"] < 1) return

    let codes = json["results"];
    codes.sort((a, b) => a.stars - b.stars);
    return codes.slice(0, 5)
}
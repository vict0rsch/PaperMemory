String.prototype.capitalize = function () {
    return this.charAt(0).toUpperCase() + this.slice(1);
};

const firstNonStopLowercase = (title) => {
    let t = title.toLowerCase();
    let words = t.split(" ").map((w) => w.replace(/[^0-9a-z]/gi, ""));
    let meaningful = words.filter((w) => _englishStopWords.has(w));
    if (meaningful.length > 0) {
        return meaningful[0];
    }
    return words[0];
};

const parseArxivBibtex = (xmlData) => {
    var bib = $(xmlData);
    // console.log(bib)
    var authors = [];
    var key = "";
    bib.find("author name").each((k, v) => {
        authors.push($(v).text());
        if (k === 0) {
            key += $(v)
                .text()
                .split(" ")
                [$(v).text().split(" ").length - 1].toLowerCase();
        }
    });
    var pdfLink = "";
    bib.find("link").each((k, v) => {
        const link = $(v).attr("href");
        if (link && link.indexOf("arxiv.org/pdf/") >= 0) {
            pdfLink = link;
        }
    });
    const pdfVersion = pdfLink.match(/v\d+\.pdf/gi);
    if (pdfVersion && pdfVersion.length > 0) {
        pdfLink = pdfLink.replace(pdfVersion[0], ".pdf");
    }
    const author = authors.join(" and ");
    const title = $(bib.find("entry title")[0]).text();
    const year = $(bib.find("entry published")[0]).text().slice(0, 4);
    key += year;
    key += firstNonStopLowercase(title);
    let id;
    const ids = bib.find("id");
    ids.each((k, v) => {
        if (
            $(v)
                .html()
                .match(/\d\d\d\d\.\d\d\d\d\d/g)
        ) {
            id = $(v)
                .html()
                .match(/\d\d\d\d\.\d\d\d\d\d/g)[0];
        }
    });
    id = `Arxiv-${id}`;

    const bibvars = { key, title, author, year, id, pdfLink };
    let bibtext = "";
    bibtext += `@article{${key}, \n`;
    bibtext += `    title = { ${title} }, \n`;
    bibtext += `    author = { ${author} }, \n`;
    bibtext += `    year = { ${year}}, \n`;
    bibtext += `    journal = { arXiv preprint arXiv: ${id}}\n`;
    bibtext += `}`;

    return {
        bibvars,
        bibtext,
    };
};

const parseNeuripsHTML = (url, htmlText) => {
    const dom = new DOMParser().parseFromString(
        htmlText.replaceAll("\n", ""),
        "text/html"
    );
    const doc = $(dom);
    const ps = doc.find(".container-fluid .col p");
    const hash = url.split("/").slice(-1)[0].replace("-Paper.pdf", "");

    const title = doc.find("h4").first().text();
    const author = $(ps[1])
        .text()
        .split(", ")
        .map((author, k) => {
            const parts = author.split(" ");
            const caps = parts.map((part, i) => {
                return part.capitalize();
            });
            return caps.join(" ");
        })
        .join(" and ");
    const pdfLink = url;
    const year = $(ps[0]).text().match(/\d{4}/)[0];
    const key = `neurips${year}${hash.slice(0, 8)} `;
    const id = `NeurIPS - ${year}_${hash.slice(0, 8)} `;

    const bibtext = `
@inproceedings{NEURIPS${year}_${hash.slice(0, 8)}
    author = { ${author}
},
booktitle = { Advances in Neural Information Processing Systems },
    editor = { H.Larochelle and M.Ranzato and R.Hadsell and M.F.Balcan and H.Lin },
    publisher = { Curran Associates, Inc.},
    title = { ${title}},
url = { ${url}},
year = { ${year}}
}`;

    return { key, title, author, year, id, pdfLink, bibtext };
};

const parseCvfHTML = (url, htmlText) => {
    const dom = new DOMParser().parseFromString(
        htmlText.replaceAll("\n", ""),
        "text/html"
    );
    const doc = $(dom);

    const title = $.trim(doc.find("#papertitle").text());
    let author = doc.find("#authors i").first().text();
    author = author
        .split(",")
        .map((a) => $.trim(a))
        .join(" and ");
    const { year, id, conf } = parseCVFUrl(url);
    let pdfLink = "";
    if (url.endsWith(".pdf")) {
        pdfLink = url;
    } else {
        doc.find("a").each((k, v) => {
            if ($(v).text() === "pdf") {
                let href = $(v).attr("href");
                if (href.startsWith("../")) {
                    href = href.replaceAll("../", "");
                }
                if (!href.startsWith("/")) {
                    href = "/" + href;
                }
                pdfLink = "http://openaccess.thecvf.com" + href;
            }
        });
    }
    const bibtext = doc.find(".bibref").first().text().replaceAll(",  ", ",\n  ");
    const key = bibtext.split("{")[1].split(",")[0];

    return { key, title, author, year, id, pdfLink, bibtext, conf };
};

const fetchArxivXML = async (id) => {
    id += "";
    id = id.replace("Arxiv-", "");
    return $.get(`https://export.arxiv.org/api/query`, { id_list: id });
};

const fetchNeuripsHTML = async (url) => {
    let paperPage;
    if (url.endsWith(".pdf")) {
        paperPage = url
            .replace("/file/", "/hash/")
            .replace("-Paper.pdf", "-Abstract.html");
    } else {
        paperPage = url;
    }

    return fetch(paperPage).then((response) => {
        return response.text();
    });
};

const fetchCvfHTML = async (url) => {
    let paperPage, text;
    if (url.endsWith(".pdf")) {
        paperPage = url
            .replace("/papers_backup/", "/papers/")
            .replace("/papers/", "/html/")
            .replace(".pdf", ".html");
    } else {
        paperPage = url;
    }

    text = await fetch(paperPage).then((response) => {
        return response.ok ? response.text() : "";
    });

    if (!text && paperPage.includes("thecvf.com/content_")) {
        const { conf, year } = parseCVFUrl(url);
        paperPage = paperPage.replace(
            `/content_${conf}_${year}/`,
            `/content_${conf.toLowerCase()}_${year}/`
        );
        text = await fetch(paperPage).then((response) => {
            return response.ok ? response.text() : "";
        });
    }

    return text;
};

const fetchOpts = {
    headers: {
        mode: "no-cors",
    },
};

const fetchPWCId = async (arxiv_id, title) => {
    let pwcPath = `https://paperswithcode.com/api/v1/papers/?`;
    if (arxiv_id) {
        pwcPath += new URLSearchParams({ arxiv_id });
    } else if (title) {
        pwcPath += new URLSearchParams({ title });
    }
    const json = await $.getJSON(pwcPath);
    console.log({ json });

    if (json["count"] !== 1) return;
    return json["results"][0]["id"];
};

const fetchCodes = async (paper) => {
    let arxiv_id, title;
    if ((paper.source = "neurips")) {
        title = paper.title;
    } else {
        arxiv_id = paper.id;
    }

    const pwcId = await fetchPWCId(arxiv_id, title);
    if (!pwcId) return [];

    let codePath = `https://paperswithcode.com/api/v1/papers/${pwcId}/repositories/?`;
    codePath += new URLSearchParams({ page: 1, items_per_page: 10 });

    const response = await fetch(codePath);
    const json = await response.json();
    if (json["count"] < 1) return;

    let codes = json["results"];
    codes.sort((a, b) => a.stars - b.stars);
    return codes.slice(0, 5);
};

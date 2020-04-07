const parseBibtex = xmlData => {
    var bib = $(xmlData);
    var authors = [];
    var key = "";
    bib.find("author name").each((k, v) => {
        authors.push($(v).text());
        if (k === 0) {
            key += $(v).text().split(" ")[$(v).text().split(" ").length - 1].toLowerCase();
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

    const bibvars = { key, title, author, year, arxivId };

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

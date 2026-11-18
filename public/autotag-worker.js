// Counts the papers an auto-tagging rule matches (options page, src/options/tags.js), off the
// page's thread: a pathological pattern can backtrack for seconds, and the page terminates
// this worker when it exceeds its time budget. Same matching as autoTagPaper (paper.js):
// title AND authors, case-insensitive; an empty pattern matches everything.
let papers = []; // [{title, author}]

onmessage = ({ data }) => {
    if (data.type === "papers") {
        papers = data.papers;
        return;
    }
    const invalid = [];
    const make = (key) => {
        if (!data[key]) return null;
        try {
            return new RegExp(data[key], "i");
        } catch (e) {
            invalid.push(key);
        }
    };
    const title = make("title");
    const authors = make("authors");
    if (invalid.length) return postMessage({ reqId: data.reqId, invalid });
    if (!title && !authors) return postMessage({ reqId: data.reqId, empty: true });
    const count = papers.filter(
        (p) =>
            (!title || title.test(String(p.title ?? "").slice(0, 500))) &&
            (!authors || authors.test(String(p.author ?? "").slice(0, 2000))),
    ).length;
    postMessage({ reqId: data.reqId, count });
};

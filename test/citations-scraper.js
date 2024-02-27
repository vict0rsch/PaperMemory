const Heap = require("heap");
const puppeteer = require("puppeteer");
const fs = require("fs");
const glob = require("glob");

const waitForLoad = (page) =>
    new Promise((resolve) => {
        page.once("load", resolve);
    });

const getTotalCitations = (page) => {
    return page.evaluate(() => {
        return Promise.resolve(
            parseInt(querySelector("#gsc_rsb_st .gsc_rsb_std").innerText)
        );
    });
};

const parseAuthor = (page) => {
    return page.evaluate(async () => {
        await new Promise((resolve) => {
            var interval = setInterval(() => {
                if (querySelector("#gsc_bpf_more").disabled) {
                    clearInterval(interval);
                    console.info("No more papers!");
                    resolve();
                } else {
                    querySelector("#gsc_bpf_more").click();
                }
            }, 800);
        });
        let citeCounter = {};
        queryAll(".gsc_a_ac.gs_ibl")
            .map((e) => e.innerText)
            .forEach((t) => {
                if (!citeCounter.hasOwnProperty(t)) {
                    citeCounter[t] = 0;
                }
                citeCounter[t] += 1;
            });
        let yearCounter = {};
        queryAll("#gsc_a_b .gsc_a_y")
            .map((e) => e.innerText)
            .forEach((t) => {
                if (!yearCounter.hasOwnProperty(t)) {
                    yearCounter[t] = 0;
                }
                yearCounter[t] += 1;
            });
        const name = document.title
            .split(" ")
            .slice(0, -3)
            .join(" ")
            .trim()
            .replace(/[^\w\s_-]/g, "");
        const [total, h, i10] = queryAll("#gsc_rsb_st .gsc_rsb_std")
            .filter((v, i) => i % 2 === 0)
            .map((e) => e.innerText);
        const tags = queryAll("#gsc_prf_i .gsc_prf_inta.gs_ibl").map((a) =>
            a.innerText.toLowerCase()
        );
        const id = window.location.href.match(/user=(\w+)&?/)[1];
        const affiliations = document
            .querySelector("#gsc_prf_i .gsc_prf_il")
            .innerText.split(",")
            .map((a) => a.trim());
        return {
            name,
            total,
            h,
            i10,
            citeCounter,
            yearCounter,
            id,
            tags,
            affiliations,
        };
    });
};

const getCoauthors = (page, max = 4) => {
    return page.evaluate((max) => {
        return Promise.resolve(
            queryAll(document, "#gsc_rsb_co .gsc_rsb_a_desc a")
                .map((a) => a.getAttribute("href"))
                .map((h) => h.match(/user=([\w|-|-|_]+)&?/)[1])
                .slice(0, max)
        );
    }, max);
};

(async () => {
    var data, knownIds;
    if (glob.sync("./tmp/citations.json").length) {
        data = JSON.parse(fs.readFileSync("./tmp/citations.json"));
        knownIds = Object.values(data).map((author) => author.id);
    } else {
        data = {};
        knownIds = ["KOBmy0sAAAAJ"];
    }
    var nextId = new Heap((a, b) => {
        if (a.level === b.level) {
            return a.order - b.order;
        }
        return a.level - b.level;
    });
    nextId.push({ id: knownIds.pop(), order: 0, level: 0 });
    knownIds = new Set(knownIds ?? []);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 900 });
    console.log("knownIds: ", knownIds);
    console.log("nextId: ", nextId);
    console.log("nextId.size(): ", nextId.size());

    var currentUser;

    while (nextId.size()) {
        currentUser = nextId.pop();
        const currentId = currentUser.id;
        const currentLevel = currentUser.level;

        console.log("knownIds: ", knownIds);
        console.log("nextId: ", nextId);
        console.log("nextId.size(): ", nextId.size());
        console.log("currentId: ", currentId);

        if (!knownIds.has(currentId)) {
            knownIds.add(author.id);
            try {
                page.goto(`https://scholar.google.com/citations?user=${currentId}`);
                await waitForLoad(page);
                const total = await getTotalCitations(page);
                if (total > 10000) {
                    const { name, ...author } = await parseAuthor(page);
                    data[name] = author;
                    const coauthors = await getCoauthors(page);
                    for (const [k, ca] of coauthors.entries()) {
                        nextId.push({ id: ca, order: k, level: currentLevel + 1 });
                    }
                    fs.writeFileSync(
                        "./tmp/citations.json",
                        JSON.stringify(data, null, 2)
                    );
                }
            } catch (error) {
                console.error(error);
            }
        }
    }
})();

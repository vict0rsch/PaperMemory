import { expect } from "expect";
import fs from "fs";
import { basename } from "node:path";
import {
    findExtensionId,
    getMemoryPapers,
    getPMURLs,
    makeBrowser,
    makeVisitFailureCollector,
    setStorage,
    visitPaperPage,
} from "./browser.js";
import {
    hasManualBotPrevention,
    indent,
    loadConfig,
    readURLs,
    root,
    sleep,
} from "./utilsForTests.js";

let { dump, headless, ignoreSources, keepOpen, maxSources, onlySources, pageTimeout } =
    loadConfig();

if (typeof ignoreSources === "string") {
    ignoreSources = ignoreSources.split(",").map((source) => source.trim());
}

console.log(`\n${basename(import.meta.url)} args:`);
console.log("  pageTimeout   : ", pageTimeout);
console.log("  maxSources    : ", maxSources);
console.log("  onlySources   : ", onlySources);
console.log("  keepOpen      : ", keepOpen);
console.log("  dump          : ", dump);
console.log("  ignoreSources : ", ignoreSources);
console.log("  headless      : ", headless);

const targetUrls = (entries) => entries.filter((entry) => typeof entry === "string");

const buildPaperTargets = () => {
    let urls = Object.entries(readURLs());

    if (maxSources > 0) {
        console.info("Truncating urls to maxSources: ", maxSources);
        urls = urls.slice(0, maxSources);
    } else if (onlySources && onlySources.length > 0) {
        urls = urls.filter(([source]) => onlySources.includes(source));
    }

    if (ignoreSources && ignoreSources.length > 0) {
        urls = urls.filter(([source]) => !ignoreSources.includes(source));
    }

    const skippedSources = [];
    const targets = urls.flatMap(([source, entries]) => {
        if (hasManualBotPrevention(entries)) {
            skippedSources.push(source);
            return [];
        }

        const urls = targetUrls(entries);
        return {
            source,
            abstractUrl: urls[0],
            pdfUrl: urls[1],
            noPdf: Boolean(entries[2]?.noPdf),
        };
    });

    if (skippedSources.length) {
        console.log(
            `\n>>> Skipping manual open-url tests for sources with manual bot prevention: ${skippedSources.join(", ")}`,
        );
    }

    return targets;
};

const paperForSource = (source, memoryPapers) =>
    Object.values(memoryPapers).find((paper) => paper.source === source);

const memorySources = (memoryPapers) =>
    Object.values(memoryPapers)
        .map((paper) => paper.source)
        .sort();

const withoutDataVersion = (memoryPapers) => {
    const papers = { ...memoryPapers };
    delete papers.__dataVersion;
    return papers;
};

const createMemoryContext = async () => {
    const browser = await makeBrowser(headless);
    const extensionId = await findExtensionId(browser);
    const { popupURL } = getPMURLs(extensionId);
    const memoryPage = await browser.newPage();
    await memoryPage.goto(popupURL);
    await setStorage(memoryPage, "papers", { __dataVersion: 1 });
    return { browser, memoryPage };
};

const readMemory = async ({ memoryPage }) =>
    withoutDataVersion(await getMemoryPapers(memoryPage));

const dumpMemory = (label, memoryPapers) => {
    if (!dump) return;

    fs.mkdirSync(`${root}/test/tmp`, { recursive: true });
    fs.writeFileSync(
        `${root}/test/tmp/open-urls-${label}-${Date.now()}.json`,
        JSON.stringify(memoryPapers, null, 2),
    );
};

const visitTargets = async ({ browser }, targets, phaseLabel) => {
    const visitFailures = makeVisitFailureCollector(`${phaseLabel} open-url visits`);

    for (const [index, target] of targets.entries()) {
        console.log(
            `${indent(2)}(${index + 1}/${targets.length}) visiting ${phaseLabel} for ${target.source} (${target.url.slice(0, 30)}[...])`,
        );
        const page = await browser.newPage();
        await visitFailures.visit(browser, target.url, {
            page,
            keepOpen,
            timeout: pageTimeout,
            indents: 3,
        });
    }

    visitFailures.throwIfFailed();
    await sleep(1000);
};

const assertStoredSources = (memoryPapers, targets) => {
    const expectedSources = targets.map(({ source }) => source).sort();
    const storedSources = memorySources(memoryPapers);
    expect(storedSources).toEqual(expectedSources);
};

const assertVisitCounts = (memoryPapers, targets) => {
    const undercountedSources = [];

    for (const target of targets) {
        const paper = paperForSource(target.source, memoryPapers);
        const expectedMinCount = target.pdfUrl && !target.noPdf ? 2 : 1;
        if (!paper || paper.count < expectedMinCount) {
            undercountedSources.push({
                source: target.source,
                expectedMinCount,
                actualCount: paper?.count,
            });
        }
    }

    expect(undercountedSources).toEqual([]);
};

describe("Manual open URL parsing phases", function () {
    const paperTargets = buildPaperTargets();
    const abstractTargets = paperTargets.map((target) => ({
        ...target,
        url: target.abstractUrl,
    }));
    const pdfTargets = paperTargets
        .filter((target) => target.pdfUrl && !target.noPdf)
        .map((target) => ({
            ...target,
            url: target.pdfUrl,
        }));
    const timeout = (abstractTargets.length * 2 + pdfTargets.length + 2) * 20 * 5000;

    let abstractContext;
    let pdfContext;

    this.timeout(timeout);
    this.slow(timeout);

    after(async function () {
        if (!keepOpen) {
            await abstractContext?.browser.close();
            await pdfContext?.browser.close();
        }
    });

    it("Phase 1: stores every paper from Abstract URLs", async function () {
        abstractContext = await createMemoryContext();

        await visitTargets(abstractContext, abstractTargets, "Abstract URL");
        const memoryPapers = await readMemory(abstractContext);
        dumpMemory("abstract", memoryPapers);

        assertStoredSources(memoryPapers, abstractTargets);
        for (const target of abstractTargets) {
            expect(
                paperForSource(target.source, memoryPapers)?.count,
            ).toBeGreaterThanOrEqual(1);
        }
    });

    it("Phase 2: stores every paper from PDF URLs in a fresh context", async function () {
        pdfContext = await createMemoryContext();

        await visitTargets(pdfContext, pdfTargets, "PDF URL");
        const memoryPapers = await readMemory(pdfContext);
        dumpMemory("pdf", memoryPapers);

        assertStoredSources(memoryPapers, pdfTargets);
    });

    it("Phase 3: increments PDF-backed papers when Abstract URLs reuse the PDF context", async function () {
        if (!pdfContext) this.skip();

        await visitTargets(pdfContext, abstractTargets, "Abstract URL after PDF URL");
        const memoryPapers = await readMemory(pdfContext);
        dumpMemory("pdf-then-abstract", memoryPapers);

        assertStoredSources(memoryPapers, abstractTargets);
        assertVisitCounts(memoryPapers, abstractTargets);
    });
});

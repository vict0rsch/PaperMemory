// TODO: data management: 1/ import css 2/ import functions 3/ remove from popup
// TODO: fix biorxiv bibtex \t

// -------------------------
// -----  Local Utils  -----
// -------------------------

function getRandomInt(max) {
    // https://developer.mozilla.org/fr/docs/Web/JavaScript/Reference/Global_Objects/Math/random
    return Math.floor(Math.random() * max);
}

const sleep = async (timeout) =>
    new Promise((resolve) => {
        setTimeout(resolve, timeout);
    });

// ----------------------
// -----  Keyboard  -----
// ----------------------

const setUpKeyboardListeners = () => {
    addListener(document, "keypress", (e) => {
        const enterToClickIds = [
            "auto-tags-new-save",
            "auto-tags-item-save",
            "auto-tags-item-delete",
        ];
        if (e.key === "Enter") {
            if (enterToClickIds.some((id) => e.target.id.includes(id))) {
                dispatch(e.target.id, "click");
            }
        }
    });
};

// ------------------------------
// -----  PWC Preferences  -----
// ------------------------------

const setupPWCPrefs = async () => {
    const pwcPrefs = (await getStorage("pwcPrefs")) ?? {};

    const official = pwcPrefs.hasOwnProperty("official") ? pwcPrefs.official : false;
    const framework = pwcPrefs.hasOwnProperty("framework")
        ? pwcPrefs.framework
        : "none";

    findEl("official-repo").checked = official;
    findEl("framework-select").value = framework;

    addListener("official-repo", "change", async (e) => {
        const newValue = findEl("official-repo").checked;
        const prefs = (await getStorage("pwcPrefs")) ?? {};
        prefs.official = newValue;
        setStorage("pwcPrefs", prefs);
    });
    addListener("framework-select", "change", async (e) => {
        const newValue = findEl("framework-select").value;
        let prefs = (await getStorage("pwcPrefs")) ?? {};
        prefs.framework = newValue;
        setStorage("pwcPrefs", prefs);
    });
};

// --------------------------
// -----  Auto Tagging  -----
// --------------------------

const autoTagsFeedback = (text, ok = true) => {
    const html = /*html*/ `<span style="color: ${ok ? "green" : "red"}">${text}</span>`;
    setHTML("auto-tags-feedback", html);
    setTimeout(() => {
        setHTML("auto-tags-feedback", "");
    }, 2000);
};

const autoTagsMaxIndex = (autoTags) => {
    return Math.max(...autoTags.map((t) => t.id));
};

const getAutoTagHTML = (at) => {
    const title = at.title || "";
    const authors = at.authors || "";
    const tags = (at.tags ?? []).join(", ");
    const id = at.id;

    return /*html*/ `
    <div class="row auto-tags-item" id="auto-tags-item--${id}">
        <div class="col-3">
            <input type="text" id="auto-tags-item-title--${id}" value="${title}" />
        </div>
        <div class="col-3">
            <input type="text" id="auto-tags-item-authors--${id}" value="${authors}" />
        </div>
        <div class="col-3">
            <input type="text" id="auto-tags-item-tags--${id}" value="${tags}" />
        </div>
        <div class="col-3">
            <div class="row">
                <div class="col-6 d-flex justify-content-evenly" title="Update regexs & tags">
                    <svg style="stroke: #24f62a; width: 32px; height: 32px; cursor: pointer"
                        id="auto-tags-item-save--${id}" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M5 12l5 5l10 -10" />
                    </svg>
                </div>
                <div class="col-6 d-flex justify-content-evenly" title="Delete regexs & tags">
                    <svg tabindex="0" style="stroke:  var(--red); width: 32px; height: 32px; cursor: pointer; stroke-width: 1.5"
                        id="auto-tags-item-delete--${id}" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <line x1="4" y1="7" x2="20" y2="7" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                </div>
            </div>
        </div>
    </div>
    `;
};

const addAutoTagListeners = (autoTags) => {
    for (const atid of autoTags.map((t) => t.id)) {
        addListener(`auto-tags-item-save--${atid}`, "click", updateAutoTagHandler);
        addListener(`auto-tags-item-delete--${atid}`, "click", deleteAutoTagHandler);
    }
    addListener("auto-tags-new-save", "click", saveNewAutoTagItem);
};

const updateAutoTagHandler = async (e) => {
    const i = e.target.id.split("--").last();
    let at = {};
    at.title = val(`auto-tags-item-title--${i}`).trim();
    at.authors = val(`auto-tags-item-authors--${i}`).trim();
    at.tags = val(`auto-tags-item-tags--${i}`);
    at.tags = at.tags ? at.tags.split(",").map((t) => t.trim()) : [];
    at.id = parseInt(i);

    let autoTags = (await getStorage("autoTags")) ?? [];
    const idx = autoTags.findIndex((a) => a.id === at.id);
    if (!Number.isInteger(idx)) {
        autoTagsFeedback("Update error", false);
        return;
    }
    autoTags[idx] = at;
    setStorage("autoTags", autoTags, () => {
        autoTagsFeedback("Change has been saved");
    });
};

const deleteAutoTagHandler = async (e) => {
    const i = e.target.id.split("--").last();
    let newAT = (await getStorage("autoTags")) ?? [];
    if (confirm("Confirm AutoTag item deletion?")) {
        newAT = newAT.filter((t) => t.id !== parseInt(i));
        setStorage("autoTags", newAT);
        findEl(`auto-tags-item--${i}`).remove();
    }
};

const saveNewAutoTagItem = async () => {
    let autoTags = (await getStorage("autoTags")) ?? [];
    const id = Math.max(autoTagsMaxIndex(autoTags) + 1, 0);
    let at = {};
    at.title = val("auto-tags-new-title").trim();
    at.authors = val("auto-tags-new-authors").trim();
    at.tags = val("auto-tags-new-tags");
    at.id = id;
    at.tags = at.tags ? at.tags.split(",").map((t) => t.trim()) : [];
    at.tags = at.tags.filter((t) => t);

    if (!at.title && !at.authors) {
        autoTagsFeedback(
            "You have to set at least one of: Title RegEx or Authors RegEx",
            false
        );
        return;
    }
    if (!at.tags.length) {
        autoTagsFeedback(
            "You have to set at least one tag (tags are coma-separated)",
            false
        );
        return;
    }
    if (!Number.isFinite(at.id)) {
        autoTagsFeedback("Saving error, contact developer", false);
        return;
    }
    log("Saving new autoTag item: ", at);
    autoTags.push(at);
    setStorage("autoTags", autoTags, () => {
        const items = findEl("auto-tags-list").getElementsByClassName("auto-tags-item");
        const last = Array.from(items).last();
        last.insertAdjacentHTML("afterend", getAutoTagHTML(at));
        addListener(`auto-tags-item-save--${at.id}`, "click", updateAutoTagHandler);
        addListener(`auto-tags-item-delete--${at.id}`, "click", deleteAutoTagHandler);
        val(`auto-tags-new-title`, "");
        val(`auto-tags-new-authors`, "");
        val(`auto-tags-new-tags`, "");
    });
};

const setupAutoTags = async () => {
    let autoTags = (await getStorage("autoTags")) ?? [];
    if (typeof autoTags === "undefined") {
        autoTags = [
            {
                authors: "",
                title: "gan",
                tags: ["generative", "gan"],
                id: 0,
            },
        ];
    }
    let htmls = [];
    for (const at of autoTags) {
        htmls.push(getAutoTagHTML(at));
    }
    setHTML("auto-tags-list", htmls.join(""));
    addAutoTagListeners(autoTags);
};

// -------------------------------
// -----  Preprint Matching  -----
// -------------------------------

const addPreprintUpdate = (update) => {
    const { paper } = update;
    let contents = [];
    for (const [k, v] of Object.entries(update)) {
        if (k !== "paper" && k !== "bibtex") {
            if (v) {
                contents.push(`<span>${k}:</span>&nbsp;<span>${v}</span>`);
            }
        }
    }
    contents = contents.join("<br>");
    const html = /*html*/ `
    <div class="paper-update-item" id="paper-update-item--${paper.id}">
        <h4>${paper.title}</h4>
        <div>
            <div class="preprint-update-contents">
                <div>Updates to approve:</div>
                ${contents}
            </div>
            <div>
                <button class="preprint-update-ok" id="puo--${paper.id}">Ok</button>
                <button class="preprint-update-cancel" id="puc--${paper.id}">Cancel</button>
            </div>
        </div>
    </div>
    `;

    findEl("updates-to-confirm").append(createElementFromHTML(html));

    addListener(`puo--${paper.id}`, "click", async () => {
        await registerUpdate(update);
        findEl(`paper-update-item--${paper.id}`).remove();
    });
    addListener(`puc--${paper.id}`, "click", () => {
        findEl(`paper-update-item--${paper.id}`).remove();
    });
};

const registerUpdate = async (update) => {
    const { paper } = update;
    for (const [k, v] of Object.entries(update)) {
        if (k !== "paper") {
            paper[k] = v;
        }
    }
    let papers = (await getStorage("papers")) ?? {};
    console.log("papers[paper.id]: ", papers[paper.id]);
    console.log("paper: ", paper);
    papers[paper.id] = paper;
    await setStorage("papers", papers);
};

const startMatching = async (papersToMatch) => {
    showId("matching-progress-container", "flex");
    setHTML("matching-status-total", papersToMatch.length);

    const progressbar = document.querySelector(".progress");

    const changeProgress = (progress) => {
        progressbar.style.width = `${progress}%`;
    };

    for (const [idx, paper] of papersToMatch.entries()) {
        console.log("idx: ", idx);
        setHTML("matching-status-index", idx + 1);
        setHTML("matching-status-title", paper.title);
        changeProgress(parseInt((idx / papersToMatch.length) * 100));

        var bibtex, venue, note, code;

        setHTML("matching-status-provider", "paperswithcode.org ...");
        pwcMatch = await tryPWCMatch(paper);
        console.log("pwcMatch: ", pwcMatch);
        code = !paper.codeLink && pwcMatch?.url;
        venue = pwcMatch?.venue;
        note = !paper.note && pwcMatch?.note;

        if (!venue) {
            setHTML("matching-status-provider", "dblp.org ...");
            dblpMatch = await tryDBLP(paper);
            console.log("dblpMatch: ", dblpMatch);
            bibtex = dblpMatch?.bibtex;
            venue = dblpMatch?.venue;
            note = !paper.note && dblpMatch?.note;
        }

        if (!venue) {
            setHTML("matching-status-provider", "crossref.org ...");
            crossRefMatch = await tryCrossRef(paper);
            console.log("crossRefMatch: ", crossRefMatch);
            venue = dblpMatch?.venue;
            note = !paper.note && dblpMatch?.note;
        }
        if (venue || code) {
            addPreprintUpdate({ bibtex, venue, note, codeLink: code, paper });
        }
    }
    changeProgress(100);
    setHTML("matching-status", "All done!");
};

const setupPreprintMatching = async () => {
    const papers = (await getStorage("papers")) ?? {};
    const papersToMatch = Object.values(cleanPapers(papers)).filter(
        (paper) => !paper.venue
    );
    setHTML("preprints-number", papersToMatch.length);
    addListener("start-matching", "click", () => {
        startMatching(papersToMatch);
    });
};

// -----------------------------------
// -----  Custom title function  -----
// -----------------------------------

const handleCustomPDFFunctionSave = async () => {
    const userCode = val("custom-title-textarea").trim();
    const { titleFunction, code, errorMessage } = await getTitleFunction(userCode);
    const examplePaper = await getExamplePaper(0);
    setHTML("custom-title-example", examplePaper.title);
    if (errorMessage) {
        const errorFeedback = /*html*/ `<span style="color: red">${errorMessage}</span>`;
        setHTML("custom-title-feedback", errorFeedback);
    } else {
        findEl("custom-title-result").innerText = titleFunction(examplePaper);
        // save function string
        chrome.storage.local.set({ titleFunctionCode: code });
        // no error so far: all good!
        const savedFeedback = /*html*/ `<span style="color: green">Saved!</span>`;
        setHTML("custom-title-feedback", savedFeedback);
        setTimeout(() => {
            setHTML("custom-title-feedback", "");
        }, 1000);
    }
};

const handleDefaultPDFFunctionClick = async () => {
    const code = global.defaultTitleFunctionCode;
    const titleFunction = eval(code);
    chrome.storage.local.set({ titleFunctionCode: code });
    val("custom-title-textarea", code);

    const examplePaper = await getExamplePaper(0);
    setHTML("custom-title-example", examplePaper.title);
    findEl("custom-title-result").innerText = titleFunction(examplePaper);

    const savedFeedback = /*html*/ `<span style="color: var(--green)"
        >Saved!</span
    >`;
    setHTML("custom-title-feedback", savedFeedback);
    setTimeout(() => {
        setHTML("custom-title-feedback", "");
    }, 1000);
};

const handleTryAnotherPaper = async () => {
    const examplePaper = await getExamplePaper();
    const { titleFunction } = await getTitleFunction();
    setHTML("custom-title-example", examplePaper.title);
    findEl("custom-title-result").innerText = titleFunction(examplePaper);
};

/**
 * Retrieve the custom pdf function, updates the associated textarea and adds and
 * event listener for when the latter changes.
 * @param {object} menu the user's menu options, especially including pdfTitleFn
 */
const setupTitleFunction = async () => {
    // attempt to use the user's custom function
    const { titleFunction, code } = await getTitleFunction();

    // update the user's textarea
    val("custom-title-textarea", code);
    const examplePaper = await getExamplePaper(0);
    findEl("custom-title-example").innerText = examplePaper.title;
    findEl("custom-title-result").innerText = titleFunction(examplePaper);
    setHTML(
        "paper-available-keys",
        Object.keys(examplePaper)
            .map((k) => `<code>${k}</code>`)
            .join(", ")
    );
    // listen to saving click
    addListener("custom-title-save", "click", handleCustomPDFFunctionSave);
    // listen to the event resetting the pdf title function
    // to the built-in default
    addListener("custom-title-default", "click", handleDefaultPDFFunctionClick);
    // listen to the 'try another' paper button
    addListener("another-paper", "click", handleTryAnotherPaper);
};

// -----------------------------
// -----  Data Management  -----
// -----------------------------

const handleDownloadMemoryClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        downloadTextFile(
            JSON.stringify(papers),
            `PaperMemory-data-${date}-${time}.json`,
            "text/json"
        );
    });
};

const handleDownloadBibtexJsonClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.keys(papers).reduce((obj, k) => {
            obj[k] = bibtexToString(papers[k].bibtex);
            return obj;
        }, {});
        downloadTextFile(
            JSON.stringify(bibtex),
            `PaperMemory-bibtex-${date}-${time}.json`,
            "text/json"
        );
    });
};

const handleDownloadBibtexPlainClick = () => {
    const now = new Date();
    const date = now.toLocaleDateString().replaceAll("/", ".");
    const time = now.toLocaleTimeString().replaceAll(":", ".");
    chrome.storage.local.get("papers", ({ papers }) => {
        // const version = versionToSemantic(papers.__dataVersion);
        delete papers.__dataVersion;
        const bibtex = Object.values(papers)
            .map((v, k) => {
                let b = v.bibtex;
                if (!b) {
                    b = "";
                    log(v);
                }
                return bibtexToString(b);
            })
            .join("\n");
        downloadTextFile(
            bibtex,
            `PaperMemory-bibtex-${date}-${time}.bib`,
            "text/plain"
        );
    });
};

const handleConfirmOverwrite = (papersToWrite, warning) => (e) => {
    setHTML(
        "overwriteFeedback",
        `<div class="arxivTools-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
    );
    setTimeout(async () => {
        if (warning) {
            for (const id in papersToWrite) {
                if (papersToWrite.hasOwnProperty(id) && !id.startsWith("__")) {
                    const { paper, warnings } = validatePaper(papersToWrite[id], false);
                    papersToWrite[id] = paper;
                    log(warnings);
                }
            }
        }
        await setStorage("papers", papersToWrite);
        setHTML(
            "overwriteFeedback",
            `<h4 style="margin: 1.5rem">Memory overwritten.</h4>`
        );
        val("overwrite-arxivmemory-input", "");
    }, 700);
};

const handleCancelOverwrite = (e) => {
    hideId("overwriteFeedback");
    setHTML("overwriteFeedback", ``);
    val("overwrite-arxivmemory-input", "");
};

const handleOverwriteMemory = () => {
    var file = document.getElementById("overwrite-arxivmemory-input").files;
    log("file: ", file);
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    var reader = new FileReader();
    reader.onload = function (e) {
        try {
            const overwritingPapers = JSON.parse(e.target.result);
            showId("overwriteFeedback");
            setHTML(
                "overwriteFeedback",
                `<div class="arxivTools-container"><div class="sk-folding-cube"><div class="sk-cube1 sk-cube"></div><div class="sk-cube2 sk-cube"></div><div class="sk-cube4 sk-cube"></div><div class="sk-cube3 sk-cube"></div></div></div>`
            );
            const confirm = `<button id="confirm-overwrite">Confirm</button>`;
            const cancel = `<button id="cancel-overwrite">Cancel</button>`;
            const title = `<h4 class="w-100 code-font" style="font-size: 0.9rem;">Be careful, you will not be able to revert this operation. Make sure you have downloaded a backup of your memory before overwriting it.</h4>`;
            const overwriteDiv = `<div id="overwrite-buttons" class="flex-center-evenly pt-3 px-4"> ${title} <div class="flex-center-evenly w-100">${cancel} ${confirm}</div></div>`;
            setTimeout(async () => {
                const { success, message, warning, papersToWrite } =
                    await prepareOverwriteData(overwritingPapers);
                if (success) {
                    if (warning) {
                        const nWarnings = (warning.match(/<br\/>/g) ?? []).length;
                        setHTML(
                            "overwriteFeedback",
                            `<h5 class="errorTitle">Done with ${nWarnings} warnings. Confirm overwrite?</h5>${warning}${overwriteDiv}`
                        );
                    } else {
                        style("overwriteFeedback", "text-align", "center");
                        setHTML(
                            "overwriteFeedback",
                            `<h5 class="mb-0 mt-2">Data seems valid. Confirm overwrite?</h5>${overwriteDiv}`
                        );
                    }
                    addListener(
                        "confirm-overwrite",
                        "click",
                        handleConfirmOverwrite(papersToWrite, warning)
                    );
                    addListener("cancel-overwrite", "click", handleCancelOverwrite);
                } else {
                    setHTML("overwriteFeedback", message);
                }
            }, 1500);
        } catch (error) {
            setHTML(
                "overwriteFeedback",
                `<br/><strong>Error:</strong><br/>${stringifyError(error)}`
            );
        }
    };
    reader.readAsText(file);
};

const handleSelectOverwriteFile = () => {
    var file = document.getElementById("overwrite-arxivmemory-input").files;
    if (!file || file.length < 1) {
        return;
    }
    file = file[0];
    setHTML("overwrite-file-name", file.name);
    if (!file.name.endsWith(".json")) return;
    findEl("overwrite-arxivmemory-button").disabled = false;
};

const setupDataManagement = () => {
    addListener("download-arxivmemory", "click", handleDownloadMemoryClick);
    addListener("download-bibtex-json", "click", handleDownloadBibtexJsonClick);
    addListener("download-bibtex-plain", "click", handleDownloadBibtexPlainClick);
    addListener("overwrite-arxivmemory-button", "click", handleOverwriteMemory);
    addListener("overwrite-arxivmemory-input", "change", handleSelectOverwriteFile);
};

// ----------------------------
// -----  Select Sources  -----
// ----------------------------

const makeSource = ([key, name], idx) => {
    return /*html*/ `
    <div class="source-container">
        <div class="source-wrapper">
            <input class="switch source-switch" type="checkbox" id="source-${key}" name="${key}" value="${key}">
            <label for="${key}">${name}</label><br><br>
        </div>
    </div>`;
};

const setupSourcesSelection = async () => {
    const sources = global.sourcesNames;
    const table = Object.entries(sources).map(makeSource).join("");
    setHTML("select-sources", table);

    let ignoreSources = (await getStorage("ignoreSources")) ?? {};

    for (const key of Object.keys(sources)) {
        ignoreSources[key] = ignoreSources.hasOwnProperty(key)
            ? ignoreSources[key]
            : false;
        const el = findEl(`source-${key}`);
        if (el) {
            el.checked = !ignoreSources[key];
        }
    }
    setStorage("ignoreSources", ignoreSources);

    for (const key of Object.keys(sources)) {
        addListener(`source-${key}`, "change", async (e) => {
            const key = e.target.id.replace("source-", "");
            let ignoreSources = (await getStorage("ignoreSources")) ?? {};
            const el = findEl(e.target.id);
            ignoreSources[key] = !el.checked;
            console.log("Updating source", key, "to", ignoreSources[key]);
            setStorage("ignoreSources", ignoreSources);
        });
    }
};

// ----------------------------
// -----  Document Ready  -----
// ----------------------------

(() => {
    setupPWCPrefs();
    setupAutoTags();
    setupPreprintMatching();
    setUpKeyboardListeners();
    setupSourcesSelection();
    setupTitleFunction();
    setupDataManagement();
})();

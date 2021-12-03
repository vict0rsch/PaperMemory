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
    const tags = (at.tags || []).join(", ");
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
                <div class="col-6 d-flex justify-content-evenly">
                    <svg style="stroke: #24f62a; width: 32px; height: 32px; cursor: pointer"
                        id="auto-tags-item-save--${id}" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M5 12l5 5l10 -10" />
                    </svg>
                </div>
                <div class="col-6 d-flex justify-content-evenly">
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
    const i = e.target.id.split("--").reverse()[0];
    let at = {};
    at.title = val(`auto-tags-item-title--${i}`).trim();
    at.authors = val(`auto-tags-item-authors--${i}`).trim();
    at.tags = val(`auto-tags-item-tags--${i}`);
    at.tags = at.tags ? at.tags.split(",").map((t) => t.trim()) : [];
    at.id = parseInt(i);

    let autoTags = await getStorage("autoTags");
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
    const i = e.target.id.split("--").reverse()[0];
    let newAT = await getStorage("autoTags");
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
    console.log("Saving new autoTag item: ", at);
    autoTags.push(at);
    setStorage("autoTags", autoTags, () => {
        const items = findEl("auto-tags-list").getElementsByClassName("auto-tags-item");
        const last = Array.from(items).reverse()[0];
        last.insertAdjacentHTML("afterend", getAutoTagHTML(at));
        addListener(`auto-tags-item-save--${at.id}`, "click", updateAutoTagHandler);
        addListener(`auto-tags-item-delete--${at.id}`, "click", deleteAutoTagHandler);
        val(`auto-tags-new-title`, "");
        val(`auto-tags-new-authors`, "");
        val(`auto-tags-new-tags`, "");
    });
};

const setupAutoTags = async () => {
    let autoTags = await getStorage("autoTags");
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

// ----------------------------
// -----  Document Ready  -----
// ----------------------------

(() => {
    setupAutoTags();
    setUpKeyboardListeners();
})();

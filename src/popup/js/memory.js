// ES Module imports
import { state } from "@pmu/config.js";
import {
    arraysIdentical,
    parseTags,
    isPdfUrl,
    copyTextToClipboard,
    copyHyperLinkToClipboard,
    logError,
    log,
    info,
    warn,
} from "@pmu/functions.js";
import {
    updatePaperVisits,
    isPaper,
    addOrUpdatePaper,
    paperToAbs,
    paperToPDF,
} from "@pmu/paper.js";
import { sortMemory, makeTags, getTagsOptions, duration } from "@pmu/state.js";
import {
    findEl,
    setHTML,
    val,
    queryAll,
    addListener,
    showId,
    hideId,
    setTextId,
    setPlaceholder,
    addClass,
    removeClass,
    fadeIn,
    fadeOut,
    dispatch,
    slideDown,
    slideUp,
} from "@pmu/miniquery.js";
import { parseIdFromUrl } from "@pmu/urls.js";
import { getMemoryItemHTML } from "@pm/popup/js/templates.js";
import { closeMenu, showPopupModal, popupMain } from "@pm/popup/js/popup.js";
import {
    handleTagClick,
    addEventsToMemoryItems,
    addEventsToMemoryControls,
    handleClearSearch,
} from "@pm/popup/js/handlers.js";

export const toggleTagsCollapse = (on) => {
    if (on) {
        if (!!findEl({ element: "tags-list-container" })) return;
        const contents = /*html*/ `
            <ul id="all-tags-list">
                ${[...state.paperTags]
                    .map((t) => /*html*/ `<li class="memory-tag" >${t}</li>`)
                    .join("")}
            </ul>`;
        const details = /*html*/ `
            <div id="tags-list-container">
                <details id="tags-list-details" style="outline: none !important;">
                    <summary style="font-size: 0.85rem; color: #5f5f5f;">Tags list</summary>
                    ${contents}
                </details>
            </div>`;
        findEl({ element: "memory-filters" }).insertAdjacentHTML("afterend", details);
    } else {
        findEl({ element: "tags-list-container" })?.remove();
    }
};
/**
 * Updates all the papers' options HTML list
 */
export const updateAllMemoryPaperTagOptions = () => {
    for (const id in state.papers) {
        if (state.papers.hasOwnProperty(id) && id !== "__dataVersion") {
            const paper = state.papers[id];
            setHTML(`memory-item-tags--${id}`, getTagsOptions(paper));
        }
    }
};

export const sampleAsciiArt = async () => {
    const artPath = chrome.runtime.getURL("src/data/art.json");
    const art = await fetch(artPath).then((res) => res.json());
    const nArts = Object.keys(art).length;
    const u = Math.floor(Math.random() * nArts);
    const [animal, ascii] = Object.entries(art)[u];
    return { animal, ascii };
};

export const updatePopupPaperNoMemory = async (url) => {
    const { animal, ascii } = await sampleAsciiArt();
    let noPaperHtml = /* html */ `
        <div class="no-paper-div">
            <h3>This paper is not in your Memory&nbsp;
            <span id="no-paper-why-span">
                <button class="code-font" id="no-paper-why-code">?</button>
            </span>
            </h3>
            <div>
                <div>Here's a ${animal} for your trouble</div><br>
                <div id="ascii-art-div"><div style="text-align:">${ascii}</div></div>
            </div>
        </div>
    `;

    const isFirefox = navigator.userAgent.search("Firefox") > -1;
    const allowManualParsing = isFirefox || state.prefs.checkNoAuto;
    let ff_warning = "";
    if (isFirefox) {
        ff_warning = /* html */ `
            <div id="ff-warning">
                Firefox does not support content scripts on PDFs.<br/>
                Use the button below to parse this paper.<br/>
            </div>
        `;
    }
    if (allowManualParsing) {
        noPaperHtml += /* html */ `
            <div id="manual-trigger-wrapper">
                ${ff_warning}
                <div id="manual-trigger-btn">Try manual trigger</div>
                <div id="manual-loader-container" class="pm-container" style='display: none;'>
                    <div class="sk-folding-cube">
                        <div class="sk-cube1 sk-cube"></div>
                        <div class="sk-cube2 sk-cube"></div>
                        <div class="sk-cube4 sk-cube"></div>
                        <div class="sk-cube3 sk-cube"></div>
                    </div>
                </div>
                <div id="manual-parsing-error"></div>
            </div>
        `;
    }

    const previousIsArxiv = findEl({ element: "isArxiv" }).innerHTML;
    setHTML("isArxiv", noPaperHtml);

    addListener("no-paper-why-code", "click", () => {
        showPopupModal("noPaper");
    });

    if (allowManualParsing) {
        addListener("manual-trigger-btn", "click", async () => {
            showId("manual-loader-container");
            try {
                const is = await isPaper(url);
                let paper;
                const update = await addOrUpdatePaper({ url, is });
                if (update) {
                    paper = update.paper;
                } else {
                    return;
                }
                if (paper) {
                    hideId("manual-loader-container");
                    setHTML("isArxiv", previousIsArxiv);
                    popupMain(url, is, true);
                }
            } catch (error) {
                hideId("manual-loader-container");
                const errorText =
                    "There was an issue parsing this paper. <br/> " +
                    "Raise an issue on Github if you think it is a bug.<br/>" +
                    "Attempted url: " +
                    url;
                setHTML("manual-parsing-error", `<strong>${errorText}</strong>`);
                warn("Manual Parsing Error:", error);
            }
        });
    }
};

/**
 * Copy a text to the clipboard and display a feedback text
 * @param {string} id Id of the paper to display the feedback in the memory item
 * @param {string} textToCopy Text to copy to the clipboard
 * @param {string} feedbackText Text to display as feedback
 * @param {string} context The context in which the action took place: "popup" or "memory" (or "content_script")
 * @param {string} hyperLinkTitle The title of the hyperlink to copy to the clipboard
 */
export const copyAndConfirmMemoryItem = async ({
    id,
    textToCopy,
    feedbackText,
    context = "popup",
    hyperLinkTitle = null,
}) => {
    if (!hyperLinkTitle) {
        copyTextToClipboard(textToCopy);
    } else {
        await copyHyperLinkToClipboard(textToCopy, hyperLinkTitle);
    }
    const element =
        context === "popup"
            ? findEl({ element: "popup-feedback-copied" })
            : context === "memory"
            ? findEl({ paperId: id, memoryItemClass: "memory-item-feedback" })
            : null;
    if (!element) return;
    element.innerText = feedbackText;
    fadeIn(element);
    setTimeout(() => {
        fadeOut(element);
    }, 2000);
};

/**
 * Looks for an open tab with the code of the paper. Matches are not exact:
 * a tab url needs only to include the targetURL to be valid. If no existing
 * tab matches the targetURL, a new tab is created
 * @param {string} targetURL URL of the page to open
 */
export const focusExistingOrCreateNewURLTab = (targetURL) =>
    new Promise((resolve) => {
        targetURL = targetURL.replace("http://", "https://");
        if (!targetURL.startsWith("https://")) {
            targetURL = "https://" + targetURL;
        }
        if (!chrome.tabs) {
            if (window?.location?.href) {
                window.location.href = targetURL;
            }
            return resolve();
        }
        const { origin } = new URL(targetURL);
        chrome.tabs.query({ url: `${origin}/*` }, (tabs) => {
            for (const tab of tabs) {
                if (tab.url.includes(targetURL)) {
                    const tabUpdateProperties = { active: true };
                    const windowUpdateProperties = { focused: true };
                    chrome.windows.getCurrent((w) => {
                        if (w.id !== tab.windowId) {
                            chrome.windows.update(
                                tab.windowId,
                                windowUpdateProperties,
                                () => {
                                    chrome.tabs.update(tab.id, tabUpdateProperties);
                                    resolve();
                                }
                            );
                        } else {
                            chrome.tabs.update(tab.id, tabUpdateProperties);
                            resolve();
                        }
                    });
                    resolve();
                    return;
                }
            }
            chrome.tabs.create({ url: targetURL });
            resolve();
        });
        resolve();
    });

/**
 * Trim then save in chrome.storage.local the content of the note for a paper.
 * Also updates this paper's memory table display and the main popup's textarea
 * (if the paper being edited from the memory is actually the one currently opened
 * and which is therefore being displayed by the popup)
 * @param {string} id The id of the paper whose note is being saved
 * @param {string} note The content of the note
 */
export const saveNote = (id, note) => {
    state.papers[id].note = note;
    chrome.storage.local.set({ papers: state.papers }, () => {
        setHTML(
            findEl({ paperId: id, memoryItemClass: "memory-note-div" }),
            note
                ? /*html*/ ` <div class="memory-note-div memory-item-faded">
                      <span class="note-content-header">Note:</span>
                      <span class="note-content">${note}</span>
                  </div>`
                : /*html*/ `<div class="memory-note-div memory-item-faded"></div>`
        );
        const textarea = findEl({ element: `popup-form-note-textarea--${id}` });
        val(textarea, note);
        val(findEl({ paperId: id, memoryItemClass: "form-note-textarea" }), note);
    });
};

/**
 * Trim then save in chrome.storage.local the code link for a paper.
 * Also updates this paper's memory table display and the main popup's code input
 * (if the paper being edited from the memory is actually the one currently opened
 * and which is therefore being displayed by the popup)
 * @param {string} id The id of the paper whose code is being saved
 * @param {string} codeLink The link to the paper's code
 */
export const saveCodeLink = (id, codeLink) => {
    codeLink = codeLink.trim();
    state.papers[id].codeLink = codeLink;
    chrome.storage.local.set({ papers: state.papers }, () => {
        const displayLink = codeLink.replace(/^https?:\/\//, "");
        setHTML(
            findEl({ paperId: id, memoryItemClass: "memory-code-link" }),
            displayLink
        );
        setHTML(`popup-code-link`, displayLink);
        val(findEl({ paperId: id, memoryItemClass: "form-code-input" }), codeLink);
        codeLink ? showId("popup-code-link") : hideId("popup-code-link");
        const codeInput = findEl({ element: `popup-form-codeLink--${id}` });
        val(codeInput, codeLink);
    });
};

export const saveFavoriteItem = (id, favorite) => {
    state.papers[id].favorite = favorite;
    state.papers[id].favoriteDate = new Date().toJSON();
    chrome.storage.local.set({ papers: state.papers }, () => {
        if (favorite) {
            addClass(`memory-container--${id}`, "favorite");
            addClass(
                findEl({
                    paperId: id,
                    memoryItemClass: "memory-item-favorite",
                }).querySelector("svg"),
                "favorite"
            );
        } else {
            removeClass(`memory-container--${id}`, "favorite");
            removeClass(
                findEl({
                    paperId: id,
                    memoryItemClass: "memory-item-favorite",
                }).querySelector("svg"),
                "favorite"
            );
        }

        if (state.sortKey === "favoriteDate") {
            if (!favorite) {
                sortMemory();
                displayMemoryTable();
            }
            const n = state.sortedPapers.filter((p) => p.favorite).length;
            const memSearch = findEl({ element: "memory-search" });
            if (memSearch) {
                setPlaceholder(memSearch, `Search ${n} entries`);
            }
        }

        let checkFavorite = findEl({ element: `checkFavorite--${id}` });
        if (checkFavorite) {
            checkFavorite.checked = favorite;
        }
    });
};

/**
 * Function to change the html content of #memory-sort-arrow to an up or down arrow
 * @param {string} direction up/down string to change the arrow's direction
 */
export const setMemorySortArrow = (direction) => {
    let arrow;
    if (direction === "up") {
        arrow = /*html*/ `<svg
            viewBox="0 0 24 24"
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-up"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="9" x2="12" y2="5" />
            <line x1="8" y1="9" x2="12" y2="5" />
        </svg>`;
    } else {
        arrow = /*html*/ `<svg
            class="memory-sort-arrow-svg"
            id="memory-sort-arrow-down"
            viewBox="0 0 24 24"
        >
            <path stroke="none" d="M0 0h24v24H0z" fill="none" />
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="16" y1="15" x2="12" y2="19" />
            <line x1="8" y1="15" x2="12" y2="19" />
        </svg>`;
    }

    setHTML("memory-sort-arrow", arrow);
};

/**
 * Reverses the state's 2 ordered lists: sortedPapers and papersList
 */
export const reverseMemory = () => {
    state.sortedPapers.reverse();
    state.papersList.reverse();
};

/**
 * Function to filter the sortedPapers list into papersList, keeping papers whose
 * title, author or note includes all the words in the query.
 * e.g.: "cli ga" will look for all papers for which either their note, authors or title
 *        contains both the strings "cli" and "ga".
 * @param {string} letters The user's string query.
 */
export const searchMemory = (letters) => {
    const words = letters.toLowerCase().split(" ");
    let papersList = [];
    const contentKeys = ["title", "author", "note", "tags", "id", "venue"];
    for (const paper of state.sortedPapers) {
        const contents = contentKeys.map((key) => {
            if (Array.isArray(paper[key])) {
                return paper[key].join(" ").toLowerCase();
            } else if (typeof paper[key] === "string") {
                return paper[key].toLowerCase();
            }
            logError(`searchMemory: non-string & non-array content for key ${key}`);
            log(paper);
            return "";
        });

        if (words.every((w) => contents.some((c) => c.includes(w)))) {
            if (!state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    state.papersList = papersList;
};

/**
 * Filters the sortedPapers into papersList, keeping papers published in a list of years
 * e.g.: "y:21, 22" or "y: <2012"
 * @param {string} letters The string representing the tags query, deleting "t:" and splitting on " "
 */
export const searchMemoryByYear = (letters) => {
    const condition = letters.includes("<")
        ? "smaller"
        : letters.includes(">")
        ? "greater"
        : "";
    const searchYears = letters
        .replace("y:", "")
        .replace(/(<|>)/g, "")
        .toLowerCase()
        .replaceAll(",", " ")
        .split(" ")
        .filter((y) => y.length > 0)
        .map((y) => (y.length === 4 ? y : "20" + y))
        .map((y) => parseInt(y, 10));
    let papersList = [];
    let compare = (y, py) => y === py;
    if (condition === "smaller") {
        compare = (y, py) => y > py;
    } else if (condition === "greater") {
        compare = (y, py) => y < py;
    }
    for (const paper of state.sortedPapers) {
        const paperYear = parseInt(paper.year, 10);
        if (searchYears.some((year) => compare(year, paperYear))) {
            papersList.push(paper);
        }
    }
    state.papersList = papersList;
};
/**
 * Filters the sortedPapers into papersList, keeping papers whose tags match the query: all
 * papers whose tags contain all words in the query. Triggered when a query starts with "t: ".
 * e.g.: "cli ga" will look for all papers which have at least 1 tag containing the substring "cli"
 *        AND at least 1 tag containing the substring "ga"
 * @param {string} letters The string representing the tags query, deleting "t:" and splitting on " "
 */
export const searchMemoryByTags = (letters) => {
    const tags = letters.replace("t:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of state.sortedPapers) {
        const paperTags = paper.tags.map((t) => t.toLowerCase());
        if (tags.every((t) => paperTags.some((pt) => pt.indexOf(t) >= 0))) {
            if (!state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    state.papersList = papersList;
};

/**
 * Filters the sortedPapers into papersList, keeping papers whose code matches the query. Similar
 * to searchMemory but looks into the codeLink attribute. Triggered when a query starts with "c: ".
 * @param {string} letters The string representing the code query, deleting "c:" and splitting on " "
 */
export const searchMemoryByCode = (letters) => {
    const words = letters.replace("c:", "").toLowerCase().split(" ");
    let papersList = [];
    for (const paper of state.sortedPapers) {
        let paperCode = paper.codeLink || "";
        paperCode = paperCode.toLowerCase();
        if (words.every((w) => paperCode.includes(w))) {
            if (!state.showFavorites || paper.favorite) {
                papersList.push(paper);
            }
        }
    }
    state.papersList = papersList;
};

/**
 * Updates a paper's tag HTML list from the object's tags array.
 * @param {string} id The paper's id
 */
export const updatePaperTagsHTML = (id) => {
    setHTML(
        findEl({ paperId: id, memoryItemClass: "tag-list" }),
        state.papers[id].tags
            .map((t) => `<span class="memory-tag">${t}</span>`)
            .join("")
    );
};

/**
 * Update the select2 input for tags, with options from the paper's tags array attribute,
 * using getTagsOptions.
 * @param {string} id The paper's id
 */
export const updateTagOptions = (id) => {
    updateAllMemoryPaperTagOptions();
    // update popup tags if the current paper is being edited in the memory
    const tagOptions = getTagsOptions(state.papers[id]);
    setHTML(`popup-item-tags--${id}`, tagOptions);
};

/**
 * Update a paper's tags array attribute from the user's selection in a select2 multi-select input.
 * @param {string} id The paper's id
 * @param {string} elementId The paper's html element selector (either an id for the popup main tags, or a class for a memory item)
 */
export const updatePaperTags = (id, elementId) => {
    let ref;
    // elementId may be an ID selector (in the main popup)
    // or a class selector (in the memory)
    if (elementId.startsWith("#")) {
        ref = findEl({ element: elementId.replace("#", "") });
    } else {
        ref = findEl({ paperId: id, memoryItemClass: elementId });
    }
    const tags = parseTags(ref);
    let updated = false;
    let newTags = new Set();
    if (!arraysIdentical(state.papers[id].tags, tags)) updated = true;
    state.papers[id].tags = tags;

    // If there's a change: update the global set of tags:
    // we need to add or remove tags to the global suggestions array
    // for select2
    if (updated) {
        chrome.storage.local.set({ papers: state.papers }, () => {
            // update the global set of tags
            makeTags();
            // update the selected tags in the select2 input for this paper
            updateTagOptions(id);
            // update the displayed tags for this paper
            updatePaperTagsHTML(id);
            const tagEls = queryAll(
                ".memory-tag",
                findEl({ paperId: id, memoryItemClass: "tag-list" })
            );
            for (const el of tagEls) {
                addListener(el, "click", handleTagClick);
            }
        });
    }
};

/**
 * Iterates over all papers in the papersList (sorted and filtered),
 * creates each paper's HTML template and appends it to #memory-table.
 * Also creates the relevant events.
 */
export const displayMemoryTable = (pagination = 0) => {
    const start = Date.now();

    // Clear existing items
    var memoryTable = findEl({ element: "memory-table" });
    if (pagination === 0) {
        setHTML(memoryTable, "");
        state.currentMemoryPagination = 0;
    }

    // Add relevant sorted papers (papersList may be smaller than sortedPapers
    // depending on the search query)
    let table = [];
    for (const paper of state.papersList.slice(
        pagination * state.memoryItemsPerPage,
        (pagination + 1) * state.memoryItemsPerPage
    )) {
        try {
            table.push(getMemoryItemHTML(paper));
        } catch (error) {
            log("displayMemoryTable error:");
            log(error);
            log(paper);
        }
    }
    // https://stackoverflow.com/questions/18393981/append-vs-html-vs-innerhtml-performance
    if (pagination === 0) {
        setHTML(memoryTable, table.join(""));
    } else {
        memoryTable.insertAdjacentHTML("beforeend", table.join(""));
    }

    addEventsToMemoryItems();
    // Save fields on edits save (submit)
    const end = Date.now();

    info("Display duration (s): " + (end - start) / 1e3);
};

export const setMemorySearchPlaceholder = () =>
    setPlaceholder("memory-search", `Search ${state.papersList.length} entries ...`);

/**
 * Main function called after the user clicks on the PaperMemory button
 * or presses `a`.
 * + closes the menu if it is open (should not be)
 */
export const makeMemoryHTML = async () => {
    // Fill-in input placeholder
    setMemorySearchPlaceholder();
    displayMemoryTable();

    // search keypress events.
    // deprecated fix: https://stackoverflow.com/questions/49278648/alternative-for-events-deprecated-keyboardevent-which-property
    addEventsToMemoryControls();
};

export const openMemory = () => {
    state.prefsIsOpen && closeMenu();
    state.memoryIsOpen = true;
    // hide menu button
    hideId("memory-switch-open");
    showId("memory-switch-close");
    hideId("menu-switch");
    dispatch("memory-switch", "blur");
    slideDown("memory-container", 200, () => {
        setTimeout(() => {
            dispatch("memory-search", "focus");
        }, 100);
    });
    setTimeout(() => {
        addListener("memory-search-clear-icon", "click", handleClearSearch);
        // set default sort to lastOpenDate
        val("memory-select", "lastOpenDate");
        // set default sort direction arrow down
        setMemorySortArrow("down");
    }, 200);
};

/**
 * Closes the memory overlay with slideUp
 */
export const closeMemory = () => {
    dispatch("memory-switch", "blur");
    hideId("memory-switch-close");
    showId("memory-switch-open");
    slideUp("memory-container", 200, () => {
        val("memory-search", "");
        dispatch("memory-search", "clear-search");
        state.memoryIsOpen = false;
        if (state.showFavorites) {
            dispatch("filter-favorites", "click");
        }
        showId("menu-switch", "flex");
    });
};

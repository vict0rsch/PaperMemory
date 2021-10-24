/**
 * Close the menu's overlay: slide div up and update button svg
 */
const closeMenu = () => {
    let classes = ["tabler-icon", "menu-svg"];

    slideUp("menu-container", 300);
    $("#tabler-menu").fadeOut(() => {
        setHTML("tabler-menu", tablerSvg("settings", "tabler-menu-svg", classes));
        $("#tabler-menu").fadeIn();
    });
    global.state.menuIsOpen = false;
};

/**
 * Open the menu's overlay: slide div down and update button svg
 */
const openMenu = () => {
    let classes = ["tabler-icon", "menu-svg"];
    slideDown("menu-container", 300);
    $("#tabler-menu").fadeOut(() => {
        setHTML("tabler-menu", tablerSvg("circle-x", "close-menu-btn", classes));
        $("#tabler-menu").fadeIn();
    });
    global.state.menuIsOpen = true;
};
/**
 * Parses menu options from the storage and adds events listeners for their change.
 * Notably, if a key in `menuCheckNames` is missing from `menu` it is set to true
 * @param {object} menu The menu retrieved from storage
 * @param {string []} menuCheckNames The array of all expected menu options
 */
const getAndTrackPopupMenuChecks = (menu, menuCheckNames) => {
    let setValues = {};
    for (const key of menuCheckNames) {
        setValues[key] = menu.hasOwnProperty(key)
            ? menu[key]
            : global.menuCheckDefaultFalse.indexOf(key) >= 0
            ? false
            : true;
        findEl(key).checked = setValues[key];
    }
    chrome.storage.local.set(setValues);

    for (const key of menuCheckNames) {
        addListener(key, "change", handleMenuCheckChange);
    }
};

/**
 * Creates click events on the popup
 */
const setStandardPopupClicks = () => {
    addListener("helpGithubLink", "click", () => {
        chrome.tabs.create({
            url: "https://github.com/vict0rsch/ArxivMemory",
        });
    });

    addListener("keyboardShortcuts", "click", () => {
        chrome.tabs.create({
            url: "https://github.com/vict0rsch/ArxivTools#keyboard-navigation",
        });
    });

    addListener("tabler-menu", "click", () => {
        global.state.menuIsOpen ? closeMenu() : openMenu();
    });

    addListener("memory-switch", "click", handleMemorySwitchClick);

    addListener("download-arxivmemory", "click", handleDownloadMemoryClick);
};

/**
 * Retrieve the custom pdf function, updates the associated textarea and adds and
 * event listener for when the latter changes.
 * @param {object} menu the user's menu options, especially including pdfTitleFn
 */
const setAndHandleCustomPDFFunction = (menu) => {
    // attempt to use the user's custom function
    if (menu.pdfTitleFn && typeof menu.pdfTitleFn === "string") {
        global.state.pdfTitleFn = getPdfFn(menu.pdfTitleFn);
    }
    // it may have failed but getPdfFn is guaranteed to return a working function
    // so use that and update storage just in case.
    chrome.storage.local.set({ pdfTitleFn: global.state.pdfTitleFn.toString() });
    // update the user's textarea
    val("customPdfTitleTextarea", global.state.pdfTitleFn.toString());
    // listen to saving click
    addListener("saveCustomPdf", "click", handleCustomPDFFunctionSave);
    // listen to the event resetting the pdf title function
    // to the built-in default
    addListener("defaultCustomPdf", "click", handleDefaultPDFFunctionClick);
};

/**
 * Main function when opening the window:
 * + Display the appropriate html depending on whether the user is currently looking at a paper
 * + Add event listeners (clicks and keyboard)
 * @param {str} url Currently focused and active tab's url.
 */
const popupMain = async (url, isKnownPage) => {
    addListener(document, "keydown", handlePopupKeydown);

    // Set click events (regardless of paper)
    setStandardPopupClicks();

    // Display popup metadata
    if (isKnownPage) {
        showId("isArxiv", "flex");
        const id = parseIdFromUrl(url);
        global.state.currentId = id;

        if (!global.state.papers.hasOwnProperty(id)) {
            // Unknown paper, probably deleted by the user
            console.log("Unknown id " + id);
            updatePopupPaperNoMemory();
            return;
        }

        const paper = global.state.papers[id];
        const eid = paper.id.replace(".", "\\.");

        // -----------------------------
        // -----  Fill Paper Data  -----
        // -----------------------------
        setTextId("popup-paper-title", paper.title.replaceAll("\n", ""));
        setTextId("popup-authors", paper.author.replaceAll(" and ", ", "));
        if (paper.codeLink) {
            showId("popup-code-link");
            setTextId("popup-code-link", paper.codeLink);
        }

        // ----------------------------------
        // -----  Customize Popup html  -----
        // ----------------------------------
        setHTML("popup-memory-edit", getPopupEditFormHTML(paper));
        setHTML("popup-copy-icons", getPopupPaperIconsHTML(paper, url));
        findEl(`checkFavorite--${id}`).checked = paper.favorite;

        // --------------------------
        // -----  Paper  edits  -----
        // --------------------------
        $(`#popup-item-tags--${eid}`).select2({
            ...global.select2Options,
            width: "87%",
        });
        document.body.style.height = "auto";
        addListener(`popup-form-note-textarea--${id}`, "focus", () => {
            var that = this;
            textareaFocusEnd(that);
        });
        setFormChangeListener(id, true);
        addListener(`popup-save-edits--${id}`, "click", handlePopupSaveEdits(id));

        // ------------------------
        // -----  SVG clicks  -----
        // ------------------------
        addListener(`popup-memory-item-link--${id}`, "click", () => {
            chrome.tabs.update({
                url: `https://arxiv.org/abs/${paper.id.replace("Arxiv-", "")}`,
            });
            window.close();
        });
        addListener(`popup-code-link`, "click", () => {
            const codeLink = findEl(`popup-code-link`).textContent;
            if (codeLink) {
                focusExistingOrCreateNewCodeTab(codeLink);
            }
        });
        addListener(`popup-memory-item-copy-link--${id}`, "click", () => {
            const pdfLink = global.state.papers[id].pdfLink;
            copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!", true);
        });
        addListener(`popup-memory-item-md--${id}`, "click", () => {
            const md = global.state.papers[id].md;
            copyAndConfirmMemoryItem(id, md, "MarkDown link copied!", true);
        });
        addListener(`popup-memory-item-bibtex--${id}`, "click", () => {
            const bibtext = formatBibtext(global.state.papers[id].bibtext);
            copyAndConfirmMemoryItem(id, bibtext, "Bibtex citation copied!", true);
        });
        addListener(`popup-memory-item-download--${id}`, "click", () => {
            let pdfTitle = statePdfTitle(paper.title, paper.id);
            console.log({ pdfTitle });
            chrome.downloads.download({
                url: paper.pdfLink,
                filename: pdfTitle.replaceAll(":", "_"),
            });
        });
    }
    const menu = await getStorage(global.menuStorageKeys);
    // Set checkboxes
    getAndTrackPopupMenuChecks(menu, global.menuCheckNames);

    // Set PDF title function
    setAndHandleCustomPDFFunction(menu);
};

const setPopupColors = async () => {
    if ((await getTheme()) !== "dark") return;
    // Your CSS as text
    var link = document.createElement("link");
    link.href = chrome.extension.getURL("src/popup/popup-css/dark.min.css");
    link.type = "text/css";
    link.rel = "stylesheet";
    document.head.appendChild(link);
};

$(() => {
    setPopupColors();

    const query = { active: true, lastFocusedWindow: true };
    chrome.tabs.query(query, async (tabs) => {
        const url = tabs[0].url;

        const is = isPaper(url);
        console.log("is: ", is);
        const isKnownPage = Object.values(is).some((i) => i);
        console.log("isKnownPage: ", isKnownPage);

        if (!isKnownPage) showId("notArxiv");

        await initState();
        makeMemoryHTML();
        popupMain(url, isKnownPage);
    });
});

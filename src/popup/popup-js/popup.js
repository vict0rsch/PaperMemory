/**
 * Close the menu's overlay: slide div up and update button svg
 */
const closeMenu = () => {
    let classes = ["tabler-icon"];
    if (global.state.theme === "dark") {
        classes.push("dark-svg");
    }
    $("#menu-container").slideUp({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            setHTMLEl("tabler-menu", tablerSvg("settings", "tabler-menu-svg", classes));
            $("#tabler-menu").fadeIn();
        });
    global.state.menuIsOpen = false;
};

/**
 * Open the menu's overlay: slide div down and update button svg
 */
const openMenu = () => {
    let classes = ["tabler-icon", "menu-svg"];
    if (global.state.theme === "dark") {
        classes.push("dark-svg");
    }
    $("#menu-container").slideDown({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            setHTMLEl("tabler-menu", tablerSvg("circle-x", "close-menu-btn", classes));
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
        setValues[key] = menu.hasOwnProperty(key) ? menu[key] : true;
        document.getElementById(key).checked = setValues[key];
    }
    chrome.storage.local.set(setValues);

    for (const key of menuCheckNames) {
        addListener(key, "change", () => {
            const checked = document.getElementById(key).checked;
            chrome.storage.local.set({ [key]: checked }, function () {
                console.log(`Settings saved for ${key} (${checked})`);
            });
        });
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

    addListener("download-arxivmemory", "click", () => {
        const now = new Date().toLocaleString();
        chrome.storage.local.get("papers", ({ papers }) => {
            const version = papers.__dataVersion;
            downloadTextFile(
                JSON.stringify(papers),
                `arxiv-memory-${version}-${now}.json`,
                "text/json"
            );
        });
    });
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
    addListener("saveCustomPdf", "click", () => {
        const code = val("customPdfTitleTextarea").trim();
        try {
            // check code: it can be evaluated and it runs without error
            const fn = eval(code);
            const tested = fn("test", "1.2");
            if (typeof tested !== "string") {
                throw Error(
                    "Custom function returns the wrong type:",
                    typeof tested,
                    tested
                );
            }
            // no error so far: all good!
            const savedFeedback = /*html*/ `<span style="color: green">Saved!</span>`;
            setHTMLEl("customPdfFeedback", savedFeedback);
            // save function string
            chrome.storage.local.set({ pdfTitleFn: code });
            global.state.pdfTitleFn = fn;
            setTimeout(() => {
                setHTMLEl("customPdfFeedback", "");
            }, 1000);
        } catch (error) {
            // something went wrong!
            console.log("setAndHandleCustomPDFFunction error:");
            const errorFeedback = /*html*/ `<span style="color: red">${error}</span>`;
            savedFeedback("customPdfFeedback", errorFeedback);
        }
    });
    // listen to the event resetting the pdf title function
    // to the built-in default
    document.getElementById("defaultCustomPdf").addEventListener("click", () => {
        const code = defaultPDFTitleFn.toString();
        const savedFeedback = /*html*/ `<span style="color: green">Saved!</span>`;
        chrome.storage.local.set({ pdfTitleFn: code });
        global.state.pdfTitleFn = defaultPDFTitleFn;
        val("customPdfTitleTextarea", code);
        setHTMLEl("customPdfFeedback", savedFeedback);
        setTimeout(() => {
            setHTMLEl("customPdfFeedback", "");
        }, 1000);
    });
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
        setHTMLEl("popup-memory-edit", getPopupEditFormHTML(paper));
        setHTMLEl("popup-copy-icons", getPopupPaperIconsHTML(paper, url));
        document.getElementById(`checkFavorite--${id}`).checked = paper.favorite;

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
        addListener(`popup-save-edits--${id}`, "click", () => {
            const { note, codeLink, favorite } = getPaperEdits(id, true);
            updatePaperTags(id, `#popup-item-tags--${id}`);
            saveNote(id, note);
            saveCodeLink(id, codeLink);
            saveFavoriteItem(id, favorite);
            setHTMLEl("popup-feedback-copied", "Saved tags, code, note & favorite!");
            $("#popup-feedback-copied").fadeIn(200);
            setTimeout(() => {
                $("#popup-feedback-copied").fadeOut(200);
            }, 1500);
            document.getElementById(`popup-save-edits--${id}`).disabled = true;
        });

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
            const codeLink = document.getElementById(`popup-code-link`).textContent;
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

    console.log("Using Dark theme");
    const theme = global.darkTheme;

    setStyle(document.body, "background", theme.background);
    setStyle(document.body, "color", theme.color);

    document.querySelectorAll("code").forEach((el) => {
        setStyle(el, "background", theme.codeBackground);
    });
    document.querySelectorAll("a").forEach((el) => {
        setStyle(el, "color", theme.aColor);
    });

    setStyle("memory-container", "background", theme.background);
    setStyle("popup-header", "color", theme.background);
    setStyle("menu-container", "background", theme.background);
    setStyle("memory-search", "background", theme.lighterBackground);
    setStyle("memory-search", "color", theme.color);
    setStyle("memory-search", "borderColor", theme.color);
    setStyle("memory-select", "background", theme.lighterBackground);
    setStyle("memory-select", "color", theme.color);
    setStyle("memory-select", "borderColor", theme.color);
    setStyle("customPdfTitleTextarea", "background", theme.lighterBackground);
    setStyle("customPdfTitleTextarea", "color", theme.color);
    setStyle("customPdfTitleTextarea", "borderColor", theme.color);
    setStyle("header-icon", "color", theme.background);

    addClass("memory-switch-text-off", "dark-svg");
    addClass("tabler-menu-svg", "dark-svg");

    addClass("download-arxivmemory", "dark-btn");
    addClass("saveCustomPdf", "dark-btn");
    addClass("defaultCustomPdf", "dark-btn");

    // Your CSS as text
    var styles = /*css*/ `
    .select2-results__option--selectable{
        background: grey;
        color: white;
    }
    .select2-container--default .select2-results__option--selected{
        background-color: rgb(165, 165, 165);
    }
    .select2-selection__choice{
        background-color: ${theme.lighterBackground} !important;
        border-color: ${theme.lighterBackground} !important;
        color: ${theme.color} !important;
    }`;
    var styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = styles;
    document.head.appendChild(styleSheet);
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

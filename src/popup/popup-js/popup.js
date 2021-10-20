/**
 * Close the menu's overlay: slide div up and update button svg
 */
const closeMenu = () => {
    $("#menuDiv").slideUp({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            setHTMLEl(
                "tabler-menu",
                tablerSvg("settings", "tabler-menu-svg", ["tabler-icon"])
            );
            $("#tabler-menu").fadeIn();
        });
    _state.menuIsOpen = false;
};

/**
 * Open the menu's overlay: slide div down and update button svg
 */
const openMenu = () => {
    $("#menuDiv").slideDown({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            setHTMLEl(
                "tabler-menu",
                tablerSvg("circle-x", "close-menu-btn", ["tabler-icon", "menu-svg"])
            );
            $("#tabler-menu").fadeIn();
        });
    _state.menuIsOpen = true;
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
        _state.menuIsOpen ? closeMenu() : openMenu();
    });

    addListener("memory-switch", "click", () => {
        _state.memoryIsOpen ? closeMemory() : openMemory();
    });

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
        _state.pdfTitleFn = getPdfFn(menu.pdfTitleFn);
    }
    // it may have failed but getPdfFn is guaranteed to return a working function
    // so use that and update storage just in case.
    chrome.storage.local.set({ pdfTitleFn: _state.pdfTitleFn.toString() });
    // update the user's textarea
    val("customPdfTitleTextarea", _state.pdfTitleFn.toString());
    // listen to saving click
    addListener("saveCustomPdf", "click", () => {
        const code = $.trim(val("customPdfTitleTextarea"));
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
            _state.pdfTitleFn = fn;
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
        _state.pdfTitleFn = defaultPDFTitleFn;
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
        _state.currentId = id;

        if (!_state.papers.hasOwnProperty(id)) {
            // Unknown paper, probably deleted by the user
            console.log("Unknown id " + id);
            updatePopupPaperNoMemory();
            return;
        }

        const paper = _state.papers[id];
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
            ..._select2Options,
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
            const pdfLink = _state.papers[id].pdfLink;
            copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!", true);
        });
        addListener(`popup-memory-item-md--${id}`, "click", () => {
            const md = _state.papers[id].md;
            copyAndConfirmMemoryItem(id, md, "MarkDown link copied!", true);
        });
        addListener(`popup-memory-item-bibtex--${id}`, "click", () => {
            const bibtext = formatBibtext(_state.papers[id].bibtext);
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
    const menu = await getStorage(_menuStorageKeys);
    // Set checkboxes
    getAndTrackPopupMenuChecks(menu, _menuCheckNames);

    // Set PDF title function
    setAndHandleCustomPDFFunction(menu);
};

$(() => {
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

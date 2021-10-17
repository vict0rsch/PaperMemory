/**
 * Close the menu's overlay: slide div up and update button svg
 */
const closeMenu = () => {
    $("#menuDiv").slideUp({
        duration: 300,
        easing: "easeOutQuint",
    }) &&
        $("#tabler-menu").fadeOut(() => {
            document.getElementById("tabler-menu").innerHTML = tablerSvg(
                "adjustments",
                undefined,
                ["tabler-icon"]
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
            document.getElementById("tabler-menu").innerHTML = tablerSvg(
                "adjustments",
                undefined,
                ["tabler-icon", "menu-svg"]
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
        document.getElementById(key).addEventListener("change", () => {
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
    $("#helpGithubLink").on("click", () => {
        chrome.tabs.create({
            url: "https://github.com/vict0rsch/ArxivMemory",
        });
    });

    $("#keyboardShortcuts").on("click", () => {
        chrome.tabs.create({
            url: "https://github.com/vict0rsch/ArxivTools#keyboard-navigation",
        });
    });

    $("#tabler-menu").on("click", () => {
        _state.menuIsOpen ? closeMenu() : openMenu();
    });

    $("#memory-switch").on("click", () => {
        _state.memoryIsOpen ? closeMemory() : openMemory();
    });

    $("#download-arxivmemory").on("click", () => {
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
    $("#customPdfTitleTextarea").val(_state.pdfTitleFn.toString());
    // listen to saving click
    $("#saveCustomPdf").on("click", () => {
        const code = $.trim($("#customPdfTitleTextarea").val());
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
            $("#customPdfFeedback").html(
                /*html*/ `<span style="color: green">Saved!</span>`
            );
            // save function string
            chrome.storage.local.set({ pdfTitleFn: code });
            _state.pdfTitleFn = fn;
            setTimeout(() => {
                $("#customPdfFeedback").html("");
            }, 1000);
        } catch (error) {
            // something went wrong!
            $("#customPdfFeedback").html(
                /*html*/ `<span style="color: red">${error}</span>`
            );
        }
    });
    // listen to the event resetting the pdf title function
    // to the built-in default
    $("#defaultCustomPdf").on("click", () => {
        const code = defaultPDFTitleFn.toString();
        chrome.storage.local.set({ pdfTitleFn: code });
        _state.pdfTitleFn = defaultPDFTitleFn;
        $("#customPdfTitleTextarea").val(code);
        $("#customPdfFeedback").html(
            /*html*/ `<span style="color: green">Saved!</span>`
        );
        setTimeout(() => {
            $("#customPdfFeedback").html("");
        }, 1000);
    });
};

/**
 * Main function when opening the window:
 * + Display the appropriate html depending on whether the user is currently looking at a paper
 * + Add event listeners (clicks and keyboard)
 * @param {str} url Currently focused and active tab's url.
 */
const popupMain = async (url) => {
    $(document).on("keydown", handlePopupKeydown);

    const menu = await getStorage(_menuStorageKeys);
    // Set checkboxes
    getAndTrackPopupMenuChecks(menu, _menuCheckNames);

    // Set click events (regardless of paper)
    setStandardPopupClicks();

    // Set PDF title function
    setAndHandleCustomPDFFunction(menu);

    const is = isPaper(url);
    console.log("is: ", is);
    const isKnownPage = Object.values(is).some((i) => i);
    console.log("isKnownPage: ", isKnownPage);

    // Display popup metadata
    if (isKnownPage) {
        showId("isArxiv", "flex");
        const id = parseIdFromUrl(url);
        _state.currentId = id;

        const waitStart = Date.now();
        let i = 0;
        while (!_state.papersReady) {
            i += 1;
        }
        console.log("Waited for: " + (Date.now() - waitStart) / 1000);

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
        setTextId("popup-paper-title", paper.title);
        setTextId("popup-authors", paper.author);
        if (paper.codeLink) {
            showId("popup-code-link");
            setTextId("popup-code-link", paper.codeLink);
        }

        // ----------------------------------
        // -----  Customize Popup html  -----
        // ----------------------------------
        setHTMLId("popup-memory-edit", getPopupEditFormHTML(paper));
        setHTMLId("popup-copy-icons", getPopupPaperIconsHTML(paper, url));

        // --------------------------
        // -----  Paper  edits  -----
        // --------------------------
        $(`#popup-item-tags--${eid}`).select2({
            ..._select2Options,
            width: "87%",
        });
        document.body.style.height = "auto";
        $(`#popup-form-note-textarea--${eid}`).on("focus", () => {
            var that = this;
            textareaFocusEnd(that);
        });
        $(`#popup-save-edits--${eid}`).on("click", () => {
            const note = $(`#popup-form-note-textarea--${eid}`).val();
            const codeLink = $(`#popup-form-note--${eid}`)
                .find(".form-code-input")
                .first()
                .val();
            const favorite = $(`#checkFavorite--${eid}`).prop("checked");
            updatePaperTags(id, `#popup-item-tags--${eid}`);
            saveNote(id, note);
            saveCodeLink(id, codeLink);
            saveFavoriteItem(id, favorite);
            $("#popup-feedback-copied").text("Saved tags, code, note & favorite!");
            $("#popup-feedback-copied").fadeIn(200);
            setTimeout(() => {
                $("#popup-feedback-copied").fadeOut(200);
            }, 1500);
        });

        // ------------------------
        // -----  SVG clicks  -----
        // ------------------------
        $(`#popup-memory-item-link--${eid}`).on("click", () => {
            chrome.tabs.update({
                url: `https://arxiv.org/abs/${paper.id.replace("Arxiv-", "")}`,
            });
            window.close();
        });
        $(`#popup-code-link`).on("click", () => {
            const codeLink = $(`#popup-code-link`).text();
            if (codeLink) {
                focusExistingOrCreateNewCodeTab(codeLink);
            }
        });
        $(`#popup-memory-item-copy-link--${eid}`).on("click", () => {
            const pdfLink = _state.papers[id].pdfLink;
            copyAndConfirmMemoryItem(id, pdfLink, "Pdf link copied!", true);
        });
        $(`#popup-memory-item-md--${eid}`).on("click", () => {
            const md = _state.papers[id].md;
            copyAndConfirmMemoryItem(id, md, "MarkDown link copied!", true);
        });
        $(`#popup-memory-item-bibtex--${eid}`).on("click", () => {
            const bibtext = formatBibtext(_state.papers[id].bibtext);
            copyAndConfirmMemoryItem(id, bibtext, "Bibtex citation copied!", true);
        });
        $(`#popup-memory-item-download--${eid}`).on("click", () => {
            let pdfTitle = statePdfTitle(paper.title, paper.id);
            console.log({ pdfTitle });
            chrome.downloads.download({
                url: paper.pdfLink,
                filename: pdfTitle.replaceAll(":", "_"),
            });
        });
    } else {
        showId("notArxiv");
    }
};

$(() => {
    const query = { active: true, lastFocusedWindow: true };
    chrome.tabs.query(query, async (tabs) => {
        await initState();
        makeMemoryHTML();
        popupMain(tabs[0].url);
    });
});

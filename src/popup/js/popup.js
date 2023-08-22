/**
 * Close the menu's overlay: slide div up and update button svg
 */
const closeMenu = () => {
    let classes = ["pm-tabler-icon", "menu-svg"];

    slideUp("menu-container", 300);
    setHTML("menu-switch", tablerSvg("settings", "menu-switch-svg", classes));
    dispatch("menu-switch", "blur");
    global.state.prefsIsOpen = false;
};

/**
 * Open the menu's overlay: slide div down and update button svg
 */
const openMenu = () => {
    let classes = ["pm-tabler-icon", "menu-svg"];
    slideDown("menu-container", 300);
    dispatch("menu-switch", "blur");
    setHTML("menu-switch", tablerSvg("circle-x", "close-menu-btn", classes));
    global.state.prefsIsOpen = true;
};
/**
 * Parses prefs options from the storage and adds events listeners for their change.
 * Notably, if a key in `prefsCheckNames` is missing from `prefs` it is set to true
 * @param {object} prefs The user preferences retrieved from storage
 * @param {string []} prefsCheckNames The array of all expected prefs options
 */
const getAndTrackPopupMenuChecks = (prefs, prefsCheckNames) => {
    let setValues = {};
    for (const key of prefsCheckNames) {
        setValues[key] = prefs.hasOwnProperty(key)
            ? prefs[key]
            : global.prefsCheckDefaultFalse.indexOf(key) >= 0
            ? false
            : true;
        const el = findEl(key);
        if (el) {
            el.checked = setValues[key];
        }
    }
    setStorage("prefs", setValues);

    for (const key of prefsCheckNames) {
        addListener(key, "change", handlePrefsCheckChange);
    }
};

/**
 * Shows a modal with the given name
 * @param {string} name The name of the modal to show
 */
const showPopupModal = (name) => {
    document.querySelectorAll(".popup-modal-content").forEach(hideId);
    showId(`modal-${name}-content`, "contents");
    style("popup-modal-wrapper", "display", "flex");
    [...document.getElementsByTagName("a")].forEach((el) => {
        addListener(el, "click", () => {
            chrome.tabs.create({ url: el.getAttribute("href") });
        });
    });
};

/**
 * Closes the popup modal
 */
const closePopupModal = () => {
    style("popup-modal-wrapper", "display", "none");
};

/**
 * Creates click events on the popup
 */
const setStandardPopupClicks = () => {
    addListener("helpGithubLink", "click", () => {
        chrome.tabs.create({
            url: "https://github.com/vict0rsch/PaperMemory",
        });
    });

    addListener("whats-new-container", "click", () => {
        chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
            const version = chrome.runtime.getManifest().version;
            if (typeof whatsnew === "undefined") {
                whatsnew = {};
            }
            if (!whatsnew.hasOwnProperty(version)) {
                hideId("whats-new-marker");
            }
            chrome.storage.local.set({
                whatsnew: { ...whatsnew, [version]: true },
            });
            showPopupModal("whatsnew");
        });
    });
    addListener("keyboardShortcuts", "click", () => {
        // button on the home page when not on a known source
        showPopupModal("keyboard");
    });
    addListener("keyboardShortcutsMenu", "click", () => {
        // button in the menu
        showPopupModal("keyboard");
    });
    shouldWarn("pdf-title", (displayWarning) => {
        if (displayWarning) {
            showId("warning-button");
            addListener("warning-button", "click", async () => {
                // button in the menu
                showPopupModal("warning-pdf-title");
                let warnings = (await getStorage("userWarnings")) ?? {};
                warnings["pdf-title"] = true;
                setStorage("userWarnings", warnings);
                hideId("warning-button");
            });
        }
    });
    addListener("close-popup-modal", "click", closePopupModal);

    // When the user clicks anywhere outside of the modal, close it
    addListener(window, "click", (event) => {
        if (event.target === findEl("popup-modal-wrapper")) {
            closePopupModal();
        }
    });

    addListener("menu-switch", "click", () => {
        global.state.prefsIsOpen ? closeMenu() : openMenu();
    });

    addListener("memory-switch", "click", handleMemorySwitchClick);
};

/**
 * Displays the paper edit modal and setup validation
 * @param {Object} parsedPaper the parsed paper from addOrUpdatePaper
 * @param {string} url the url of the parsed paper
 */
const editManualWebsite = (parsedPaper, url) => {
    // Open modal and form
    hideId("manual-website-validation");
    showPopupModal("manual-website");
    showId("website-trigger-btn");

    // Set inputs to parsed values
    const formKeys = ["author", "title", "year", "url", "note", "pdfLink"];
    for (const key of formKeys) {
        findEl(`manual-website-${key}`).value = parsedPaper[key] ?? "";
    }
    setHTML("manual-website-url", parsedPaper.codeLink);

    // Set the form's submit event / user confirmation
    addListener("manual-website-form", "submit", async (e) => {
        e.preventDefault();
        hideId("manual-website-validation");

        // Find input values
        const title = val("manual-website-title");
        let author = val("manual-website-author");
        const year = val("manual-website-year");
        const note = val("manual-website-note");
        const pdfLink = val("manual-website-pdfLink");

        if (author.includes(",")) {
            author = author
                .split(",")
                .map((a) => a.trim())
                .join(" and ");
        }

        // check values are valid
        let updatedPaper = { ...parsedPaper, title, author, year, note, pdfLink };
        const citationKey = `${miniHash(
            author.split(" and ")[0].split(" ").last()
        )}${year}${firstNonStopLowercase(title)}`;
        updatedPaper.bibtex = bibtexToString({
            ...bibtexToObject(updatedPaper.bibtex),
            author,
            year,
            title,
            citationKey,
            url: pdfLink,
        });
        const { warnings, paper } = validatePaper(updatedPaper);

        // Display warnings if any
        let validationHTML = "";
        for (const key of Object.keys(warnings)) {
            for (const warning of warnings[key]) {
                validationHTML += `<li>${warning}</li>`;
            }
        }
        if (validationHTML.length > 0) {
            // Display warinngs -> don't store paper yet
            validationHTML = `<ul>${validationHTML}</ul>`;
            setHTML("manual-website-validation", validationHTML);
            showId("manual-website-validation");
        } else {
            // No warnings -> store paper
            global.state.papers[paper.id] = paper;
            await setStorage("papers", global.state.papers);
            await pushToRemote();
            popupMain(url, await isPaper(url), true, null);
            hideId("website-trigger-btn");
            hideId("notArxiv");
            closePopupModal();
        }
        return false;
    });
};

/**
 * Main function when opening the window:
 * + Display the appropriate html depending on whether the user is currently looking at a paper
 * + Add event listeners (clicks and keyboard)
 * @param {str} url Currently focused and active tab's url.
 */
const popupMain = async (url, is, manualTrigger = false, tab = null) => {
    console.log(navigator.userAgent);
    if (navigator.userAgent === "PuppeteerAgent") {
        info("Is puppet");
        // style(document.body, "min-width", "500px");
        // style(document.body, "max-width", "500px");
        // style(document.body, "width", "500px");
        // style("popup-modal-wrapper", "min-width", "500px");
        // style("popup-modal-wrapper", "max-width", "500px");
        // style("popup-modal-wrapper", "width", "500px");
    }

    addListener(document, "keydown", handlePopupKeydown);

    chrome.storage.local.get("whatsnew", ({ whatsnew }) => {
        const version = chrome.runtime.getManifest().version;
        if (!whatsnew || !whatsnew.hasOwnProperty(version)) {
            showId("whats-new-marker");
        }
    });

    console.log("manualTrigger: ", manualTrigger);
    if (manualTrigger) {
        // manual trigger: do not re-create standard listeners
        // but update the current state and rebuild the Memory's HTML
        hideId("memory-switch");
        showId("memory-spinner");
        await initSyncAndState({ forceInit: true });
        hideId("memory-spinner");
        showId("memory-switch");
        makeMemoryHTML();
    } else {
        // Set click events (regardless of paper)
        setStandardPopupClicks();
    }
    const prefs = await getPrefs();
    // Set checkboxes
    getAndTrackPopupMenuChecks(prefs, global.prefsCheckNames);

    // Set options page link
    addListener("advanced-configuration", "click", () => {
        chrome.runtime.openOptionsPage();
    });
    // Set fullMemory page link
    addListener("full-memory", "click", () => {
        chrome.tabs.create({
            url: chrome.extension.getURL("src/fullMemory/fullMemory.html"),
        });
    });

    // Set PDF title function
    // setAndHandleCustomPDFFunction(menu);

    // Display popup metadata
    if (Object.values(is).some((i) => i)) {
        setTimeout(() => {
            document.body.style.height = "auto";
            document.body.style.minHeight = "450px";
        }, 0);
        showId("isArxiv", "flex");

        const id = await parseIdFromUrl(url);
        global.state.currentId = id;

        if (!id || !global.state.papers.hasOwnProperty(id)) {
            // Unknown paper, probably deleted by the user
            log("Unknown id " + id);
            await updatePopupPaperNoMemory(url);
            if (prefs.checkDirectOpen && !prefs.checkNoAuto) {
                dispatch("memory-switch", "click");
            }
            return;
        }

        const paper = global.state.papers[id];
        const eid = paper.id.replaceAll(".", "\\.");

        // -----------------------------
        // -----  Fill Paper Data  -----
        // -----------------------------
        setTextId("popup-paper-title", paper.title.replaceAll("\n", ""));
        setTextId("popup-authors", cutAuthors(paper.author, 350).replace(/({|})/g, ""));
        if (paper.codeLink) {
            setTextId("popup-code-link", paper.codeLink.replace(/^https?:\/\//, ""));
            showId("popup-code-link");
        }
        if (paper.source === "website") {
            setTextId("popup-website-url", paper.pdfLink.replace(/^https?:\/\//, ""));
            showId("popup-website-url");
        }

        // ----------------------------------
        // -----  Customize Popup html  -----
        // ----------------------------------
        log("Popup paper:", paper);
        setHTML("popup-memory-edit", getPopupEditFormHTML(paper));
        setHTML("popup-copy-icons", getPopupPaperIconsHTML(paper, url, is));
        findEl(`checkFavorite--${id}`).checked = paper.favorite;
        let extraDivWidth = 0;
        for (const p of [
            "checkScirate",
            "checkVanity",
            "checkAr5iv",
            "checkHugginface",
        ]) {
            if (prefs[p]) extraDivWidth += 5;
        }
        style("popup-icons-container", "width", `${75 + extraDivWidth}%`);

        // --------------------------
        // -----  Paper  edits  -----
        // --------------------------
        $(`#popup-item-tags--${eid}`).select2({
            ...global.select2Options,
            width: "87%",
        });
        addListener(`popup-form-note-textarea--${id}`, "focus", () => {
            var that = this;
            textareaFocusEnd(that);
        });
        setFormChangeListener(id, true);
        addListener("popup-delete-paper", "click", handlePopupDeletePaper(id));

        // ------------------------
        // -----  SVG clicks  -----
        // ------------------------
        addListener(`popup-memory-item-scirate--${id}`, "click", () => {
            const arxivId = arxivIdFromPaperID(paper.id);
            const scirateURL = `https://scirate.com/arxiv/${arxivId}`;
            chrome.tabs.update({ url: scirateURL });
            window.close();
        });
        addListener(`popup-memory-item-vanity--${id}`, "click", () => {
            const arxivId = arxivIdFromPaperID(paper.id);
            const vanityURL = `https://www.arxiv-vanity.com/papers/${arxivId}`;
            chrome.tabs.update({ url: vanityURL });
            window.close();
        });
        addListener(`popup-memory-item-ar5iv--${id}`, "click", () => {
            const arxivId = arxivIdFromPaperID(paper.id);
            const ar5ivURL = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;
            chrome.tabs.update({ url: ar5ivURL });
            window.close();
        });
        addListener(`popup-memory-item-huggingface--${id}`, "click", () => {
            const arxivId = arxivIdFromPaperID(paper.id);
            const huggingfaceURL = `https://huggingface.co/papers/${arxivId}`;
            chrome.tabs.update({ url: huggingfaceURL });
            window.close();
        });
        addListener(`popup-memory-item-link--${id}`, "click", () => {
            const pdfURL = paperToPDF(paper);
            const absURL = paperToAbs(paper);
            chrome.tabs.update({ url: isPdfUrl(url) ? absURL : pdfURL });
            window.close();
        });
        addListener(`popup-code-link`, "click", async () => {
            const codeLink = findEl(`popup-code-link`).textContent;
            if (codeLink) {
                await focusExistingOrCreateNewCodeTab(codeLink);
                global.close && global.close();
            }
        });
        addListener(`popup-website-url`, "click", async (e) => {
            const url = findEl(`popup-website-url`).textContent;
            if (url) {
                await focusExistingOrCreateNewCodeTab(url);
                // global.close && global.close();
            }
        });
        addListener(`popup-memory-item-copy-link--${id}`, "click", () => {
            const link = prefs.checkPreferPdf ? paperToPDF(paper) : paperToAbs(paper);
            const text = prefs.checkPreferPdf ? "PDF" : "Abstract";
            copyAndConfirmMemoryItem(id, link, `${text} link copied!`, true);
        });
        addListener(`popup-memory-item-md--${id}`, "click", () => {
            const md = makeMdLink(paper, prefs);
            const text = prefs.checkPreferPdf ? "PDF" : "Abstract";
            copyAndConfirmMemoryItem(id, md, `Markdown link to ${text} copied!`, true);
        });
        addListener(`popup-memory-item-bibtex--${id}`, "click", () => {
            let bibtex = global.state.papers[id].bibtex;
            let bibobj = bibtexToObject(bibtex);
            if (!bibobj.hasOwnProperty("url")) {
                bibobj.url = paperToAbs(global.state.papers[id]);
            }
            if (!bibobj.hasOwnProperty("pdf")) {
                bibobj.pdf = paperToPDF(global.state.papers[id]);
            }
            bibtex = bibtexToString(bibobj);
            copyAndConfirmMemoryItem(id, bibtex, "Bibtex citation copied!", true);
        });
        addListener(`popup-memory-item-openLocal--${id}`, "click", async () => {
            const file = (await findLocalFile(paper)) || global.state.files[paper.id];
            if (file) {
                chrome.downloads.open(file.id);
            } else {
                chrome.tabs.create({ url: paper.pdfLink });
            }
        });
        addListener(`popup-memory-item-download--${id}`, "click", async () => {
            downloadPaperPdf(paper);
        });
    } else {
        if (prefs.checkDirectOpen) {
            dispatch("memory-switch", "click");
        }
        // ------------------------------------
        // -----  Manual Website Parsing  -----
        // ------------------------------------
        const allowWebsiteParsing = tab && global.state.prefs.checkWebsiteParsing;
        if (allowWebsiteParsing) {
            // Add website parsing button, loader and error div
            const websiteParsingHtml = /* html */ `
                <div id="website-trigger-wrapper">
                    <div id="website-trigger-btn">Parse current website</div>
                    <div id="website-loader-container" class="pm-container" style='display: none;'>
                        <div class="sk-folding-cube">
                            <div class="sk-cube1 sk-cube"></div>
                            <div class="sk-cube2 sk-cube"></div>
                            <div class="sk-cube4 sk-cube"></div>
                            <div class="sk-cube3 sk-cube"></div>
                        </div>
                    </div>
                    <div id="website-parsing-error"></div>
                </div>`;
            setHTML("webite-parsing-root", websiteParsingHtml);
            showId("webite-parsing-root");
            addListener("website-trigger-btn", "click", async () => {
                hideId("website-trigger-btn");
                showId("website-loader-container");
                hideId("website-parsing-error");
                let update;
                // auto parse Paper
                try {
                    update = await addOrUpdatePaper({
                        tab,
                        url: tab.url,
                        store: false,
                    });
                } catch (error) {
                    console.log("error: ", error);
                    hideId("website-loader-container");
                    showId("website-parsing-error");
                    setHTML(
                        "website-parsing-error",
                        `<h3>Error</h3><div>${error}</div>`
                    );
                }
                hideId("website-loader-container");
                // check with user before storing
                update?.paper && editManualWebsite(update.paper, url);
            });
        }
    }
};

// ------------------------------
// -----  Script Execution  -----
// ------------------------------

const query = { active: true, lastFocusedWindow: true };
if (window.location.href.includes("popup")) {
    chrome.tabs.query(query, async (tabs) => {
        chrome.runtime.connect({ name: "PaperMemoryPopupSync" });
        const url = tabs[0].url;

        let stateReadyPromise, remoteIsReadyPromise;
        remoteIsReadyPromise = new Promise((remoteReadyResolve) => {
            stateReadyPromise = new Promise((stateReadyResolve) => {
                initSyncAndState({
                    stateIsReady: stateReadyResolve,
                    remoteIsReady: remoteReadyResolve,
                });
            });
        });

        await stateReadyPromise;

        const is = await isPaper(url);
        const isKnown = Object.values(is).some((i) => i);

        if (!isKnown) showId("notArxiv");

        hideId("memory-spinner");
        showId("memory-switch");
        makeMemoryHTML();
        popupMain(url, is, false, tabs[0]);
        if (navigator.userAgent.search("Firefox") > -1) {
            hideId("overwrite-container");
        }

        await remoteIsReadyPromise;

        if (global.state.currentId && !global.state.papers[global.state.currentId]) {
            global.state.currentId = null;
            makeMemoryHTML();
            await updatePopupPaperNoMemory(url);
        }
    });
}

/**
 * Return a formatted HTML string from a paper
 * @param {object} paper A paper object
 * @returns HTML string
 */
const getMemoryItemHTML = (paper, titles) => {
    const addDate = new Date(paper.addDate).toLocaleString().replace(",", "");
    const lastOpenDate = new Date(paper.lastOpenDate).toLocaleString().replace(",", "");
    const displayId = getDisplayId(paper.id);
    const note = paper.note || "";
    const id = paper.id;
    const tags = new Set(paper.tags);
    const tagOptions = getTagsOptions(paper);
    const favoriteClass = paper.favorite ? "favorite" : "";
    // titles behave differently in build/watch mode. This works in build
    titles.pdfLink = `Open link to ${paper.title}`;
    titles.copyLink = `Open link to the paper's ${
        global.state.prefs.checkPreferPdf ? "PDF" : "abstract"
    }`;

    let codeDiv = /*html*/ `
        <small class="memory-item-faded">
            <span class="memory-code-link"> ${paper.codeLink || ""} </span>
        </small>
    `;
    let noteDiv = /*html*/ `<div class="memory-note-div memory-item-faded"></div>`;
    if (paper.note) {
        noteDiv = /*html*/ `
            <div class="memory-note-div memory-item-faded">
                <span class="note-content-header">Note:</span>
                <span class="note-content">${note}</span>
            </div>
        `;
    }

    let openLocalDiv = global.state.files.hasOwnProperty(paper.id)
        ? /*html*/ `
            <div
                class="memory-item-openLocal memory-item-svg-div"
                title=${titles.openLocal}
            >
                ${tablerSvg("vocabulary", "", ["memory-icon-svg"])}
            </div>`
        : ``;

    return /*html*/ `
        <div
            class="memory-container ${favoriteClass}"
            tabindex="0"
            id="memory-container--${id}"
        >
            <h4
                class="memory-title"
                title="Added ${addDate}&#13;&#10;Last open ${lastOpenDate}"
            >
                <span class="memory-item-favorite">
                    ${tablerSvg("star", "", [
                        "memory-item-favorite-svg",
                        favoriteClass,
                    ])}
                </span>
                ${paper.title}
            </h4>
            <div class="my-1 mx-0">
                <small class="tag-list">
                    ${[...tags]
                        .map((t) => `<span class="memory-tag" >${t}</span>`)
                        .join("")}
                </small>
                <div class="edit-tags p-0" style="display: none">
                    <div class="flex-center-between">
                        <span class="label">Tags:</span>
                        <select
                            class="memory-item-tags"
                            id="memory-item-tags--${id}"
                            multiple="multiple"
                        >
                            ${tagOptions}
                        </select>
                    </div>
                </div>
            </div>
            <small class="memory-authors">${cutAuthors(paper.author)}</small>

            <div class="code-and-note">${codeDiv} ${noteDiv}</div>

            <div class="memory-item-actions flex-center-between mt-2">
                <div class="d-flex align-items-center">
                    <div
                        class="memory-item-edit memory-item-svg-div me-2"
                        title=${titles.edit}
                    >
                        ${tablerSvg("writing", "", ["memory-icon-svg"])}
                    </div>

                    <small class="memory-item-faded memory-display-id">
                        ${displayId}
                    </small>
                </div>

                <div
                    class="memory-item-link memory-item-svg-div"
                    title=${titles.pdfLink}
                >
                    ${tablerSvg("external-link", "", ["memory-icon-svg"])}
                </div>

                ${openLocalDiv}

                <div
                    class="memory-item-copy-link memory-item-svg-div"
                    title=${titles.copyLink}
                >
                    ${tablerSvg("link", "", ["memory-icon-svg"])}
                </div>

                <div class="memory-item-md memory-item-svg-div" title=${titles.copyMd}>
                    ${tablerSvg("markdown", "", ["memory-icon-svg"])}
                </div>

                <div
                    class="memory-item-bibtex memory-item-svg-div"
                    title=${titles.copyBibtext}
                >
                    ${tablerSvg("math-function", "", ["memory-icon-svg"])}
                </div>

                <span style="display: none" class="memory-item-feedback"></span>

                <div title=${titles.visits} class="memory-item-faded memory-visits">
                    Visits: ${paper.count}
                </div>
            </div>

            <div class="extended-item" style="display: none">
                <div class="item-note">
                    <form class="form-note">
                        <div class="flex-center-start">
                            <span class="label">Code:</span>
                            <input
                                type="text"
                                class="form-code-input"
                                value="${paper.codeLink || ""}"
                                placeholder="Add link"
                            />
                        </div>
                        <div class="flex-center-start">
                            <span class="label">Note:</span>
                            <textarea
                                rows="2"
                                class="form-note-textarea"
                                placeholder="Anything to note?"
                            >
${note}</textarea
                            >
                        </div>
                        <div class="form-note-buttons">
                            <button class="cancel-note-form back-to-focus">
                                Done
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="memory-delete" title="Delete from Memory">-</div>
        </div>
    `;
};

/**
 * Return a formatted HTML string to edit the user's stored metadata
 * about a paper: tags, notes, code link
 * @param {object} paper A paper object
 * @returns HTML string
 */
const getPopupEditFormHTML = (paper) => {
    const id = paper.id;
    const tagOptions = getTagsOptions(paper);
    const note = paper.note || "";
    const checked = "";
    const displayId = getDisplayId(paper.id);

    return /*html*/ ` <div
        style="max-width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 4px 16px;"
    >
        <div style="width: 100%">
            <div
                style="width: 100%; display: flex; justify-content: space-between; align-items: center;"
            >
                <span class="label">Tags:</span>
                <select
                    id="popup-item-tags--${id}"
                    class="memory-item-tags"
                    multiple="multiple"
                >
                    ${tagOptions}
                </select>
            </div>
            <div
                class="form-note"
                id="popup-form-note--${id}"
                style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-direction: column;"
            >
                <div class="flex-center-start w-100 mr-0">
                    <span class="label">Code:</span>
                    <input
                        id="popup-form-codeLink--${id}"
                        type="text"
                        class="form-code-input mt-0 noMemoryOnA"
                        value="${paper.codeLink || ""}"
                        placeholder="Add link"
                    />
                </div>
                <div class="flex-center-start w-100 mr-0">
                    <span class="label">Note:</span>
                    <textarea
                        rows="2"
                        class="noMemoryOnA popup-form-note-textarea"
                        id="popup-form-note-textarea--${id}"
                        placeholder="Anything to note?"
                    >
${note}</textarea
                    >
                </div>
            </div>
            <div
                style="display: flex; justify-content: space-between; align-items: center"
            >
                <div
                    style="display: flex; justify-content: flex-start; align-items: center"
                >
                    <label class="label" for="checkFavorite">Favorite: </label>
                    <input
                        ${checked}
                        class="switch"
                        type="checkbox"
                        id="checkFavorite--${id}"
                        name="checkFavorite"
                        value="checkFavorite"
                    />
                </div>
                <div id="popup-delete-paper" title="Delete paper from Memory">
                    <svg
                        width="25"
                        height="25"
                        viewBox="0 0 24 24"
                        stroke-width="1"
                        fill="none"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke="white"
                    >
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <line x1="4" y1="7" x2="20" y2="7" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                        <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                    </svg>
                </div>
                <small id="popup-displayId"> ${displayId} </small>
                <button
                    hidden
                    class="back-to-focus"
                    id="popup-save-edits--${id}"
                >
                    Save
                </button>
            </div>
        </div>
    </div>`;
};

/**
 * Return a formatted HTML string with the svg icons to display in the main popup
 * @param {object} paper A paper object
 * @returns HTML string
 */
const getPopupPaperIconsHTML = (paper, currentUrl, is) => {
    const id = paper.id;
    const name = isPdfUrl(currentUrl) ? "HTML" : "PDF";

    let scirate = "";
    if (global.state.prefs.checkScirate && paper.source === "arxiv") {
        scirate = /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-scirate--${id}"
            title="Open on SciRate"
        >
            ${tablerSvg("messages", "", ["popup-click-svg"])}
        </div>`;
    }

    const download =
        global.state.prefs.checkStore && (is.localFile || is.stored)
            ? /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-openLocal--${id}"
            title="Open downloaded pdf"
        >
            ${tablerSvg("vocabulary", "", ["popup-click-svg"])}
        </div>
        `
            : /*html*/ `
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-download--${id}"
            title="Download pdf"
        >
            ${tablerSvg("file-download", "", ["popup-click-svg"])}
        </div>
    `;
    return /*html*/ `${scirate}
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-link--${id}"
            title="Open Paper ${name} Page"
        >
            ${tablerSvg("external-link", "", ["popup-click-svg"])}
        </div>
        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-copy-link--${id}"
            title="Copy link to paper"
        >
            ${tablerSvg("link", "", ["popup-click-svg"])}
        </div>

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-md--${id}"
            title="Copy Markdown-formatted link"
        >
            ${tablerSvg("markdown", "", ["popup-click-svg"])}
        </div>

        <div
            tabindex="0"
            class="memory-item-svg-div"
            id="popup-memory-item-bibtex--${id}"
            title="Copy Bibtex citation"
        >
            ${tablerSvg("math-function", "", ["popup-click-svg"])}
        </div>

        ${download}`;
};

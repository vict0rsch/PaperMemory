/**
 * Return a formatted HTML string from a paper
 * @param {object} paper A paper object
 * @returns HTML string
 */
const getMemoryItemHTML = (paper) => {
    const addDate = new Date(paper.addDate).toLocaleString().replace(",", "");
    const lastOpenDate = new Date(paper.lastOpenDate).toLocaleString().replace(",", "");
    const displayId = paper.id.split("_")[0].split(".")[0];
    const note = paper.note || "";
    const id = paper.id;
    const tags = new Set(paper.tags);
    const tagOptions = getTagsHTMLOptions(paper);
    const favoriteClass = paper.favorite ? "favorite" : "";
    const titles = {
        edit: `"Edit paper details&#13;&#10;(or press 'e' when this paper is focused,&#13;&#10; i.e. when you navigated to it with 'tab')"`,
        pdfLink: `"Open ${paper.pdfLink}"`,
        copyPdfLink: `"Copy pdf link"`,
        copyMd: `"Copy Markdown-formatted link"`,
        copyBibtext: `"Copy Bibtex citation"`,
        visits: `"Number of times you have loaded&#13;&#10;the paper's Page or PDF"`,
    };
    let codeDiv = /*html*/ `
    <small class="memory-item-faded">
        <span class="memory-item-code-link">${paper.codeLink || ""}</span>
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

    return /*html*/ `
    <div class="memory-item-container ${favoriteClass}" tabindex="0" id="memory-item-container--${id}">

        <h4 class="memory-item-title" title="Added ${addDate}&#13;&#10;Last open ${lastOpenDate}">
                <span class="memory-item-favorite">
                    ${tablerSvg("star", "", [
                        "memory-item-favorite-svg",
                        favoriteClass,
                    ])}
                </span>
                ${paper.title}
        </h4>
        <div class="memory-item-tags-div">
            <small class="tag-list">
                ${Array.from(tags)
                    .map((t) => `<span class="memory-tag">${t}</span>`)
                    .join("")}
            </small>
            <div class="edit-tags">
                <div style="display:flex; align-items: center"; justify-content: space-between">
                    <select class="memory-item-tags" multiple="multiple">
                        ${tagOptions}
                    </select>
                </div>
            </div>
        </div>
        <small class="authors">${paper.author}</small>
        
        <div class="code-and-note">
            ${codeDiv}
            ${noteDiv}
        </div>

        <div class="memory-item-actions">

            <div style="display: flex; align-items: center">
                <div class="memory-item-edit memory-item-svg-div" title=${titles.edit} >
                    ${tablerSvg("writing", "", ["memory-icon-svg"])}
                </div>
                
                <small class="memory-item-faded">
                        ${displayId}
                </small>
                        
            </div>

            <div class="memory-item-link memory-item-svg-div"  title=${titles.pdfLink} >
                ${tablerSvg("file-symlink", "", ["memory-icon-svg"])}
            </div>
                
            <div class="memory-item-copy-link memory-item-svg-div" title=${
                titles.copyPdfLink
            } >
                ${tablerSvg("link", "", ["memory-icon-svg"])}
            </div>

            <div class="memory-item-md memory-item-svg-div" title=${titles.copyMd} >
                ${tablerSvg("clipboard-list", "", ["memory-icon-svg"])}
            </div>

            <div class="memory-item-bibtext memory-item-svg-div" title=${
                titles.copyBibtext
            }>
                ${tablerSvg("archive", "", ["memory-icon-svg"])}
            </div>

            <span style="color: green; display: none" class="memory-item-feedback"></span>
            
            <div title=${titles.visits} class="memory-item-faded">
                Visits: ${paper.count}
            </div>

        </div>

        <div class="extended-item" style="display: none">
            <div class="item-note">
                <form class="form-note">
                    <div class="textarea-wrapper">
                        <span class="label">Code:</span>
                        <input type="text" class="form-code-input" value="${
                            paper.codeLink || ""
                        }">
                    </div>
                    <div class="textarea-wrapper">
                        <span class="label">Note:</span>
                        <textarea rows="3" class="form-note-textarea">${note}</textarea>
                    </div>
                    <div class="form-note-buttons">
                        <button type="submit">Save</button>
                        <button class="cancel-note-form back-to-focus">Cancel</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="delete-memory-item"> - </div>
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
    const tagOptions = getTagsHTMLOptions(paper);
    const note = paper.note || "";
    const checked = paper.favorite ? `checked="true"` : "";
    return /*html*/ `
    <div style="max-width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 4px 16px;">
        <div style="width: 100%">
            <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
                <span class="label">Tags:</span>
                <select id="popup-item-tags--${id}"class="memory-item-tags" multiple="multiple">
                    ${tagOptions}
                </select>
            </div>
            <div 
                class="form-note" 
                id="popup-form-note--${id}" 
                style="width: 100%; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; flex-direction: column;"
            >
                <div class="textarea-wrapper w-100 mr-0">
                    <span class="label">Code:</span>
                    <input type="text" class="form-code-input mt-0 noMemoryOnA" value="${
                        paper.codeLink || ""
                    }">
                </div>
                <div class="textarea-wrapper w-100 mr-0">
                    <span class="label">Note:</span>
                    <textarea 
                        rows="3" 
                        style="width:85%;" 
                        class="noMemoryOnA"
                        id="popup-form-note-textarea--${id}"
                    >${note}</textarea>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center">
                <div style="display: flex; justify-content: flex-start; align-items: center">
                    <label for="checkFavorite" style="font-family: monospace; margin-right: 16px;">Favorite: </label>
                    <input ${checked} class="switch" type="checkbox" id="checkFavorite--${id}" name="checkFavorite" value="checkFavorite">
                </div>
                <button class="back-to-focus" id="popup-save-edits--${id}">Save</button>
            </div>
        </div>
        <div>
            
        </div>
    </div>`;
};

/**
 * Return a formatted HTML string with the svg icons to display in the main popup
 * @param {object} paper A paper object
 * @returns HTML string
 */
const getPopupPaperIconsHTML = (paper, currentUrl) => {
    const id = paper.id;
    const display =
        paper.source !== "arxiv" || currentUrl.indexOf(".pdf") < 0 ? "none" : "inherit";

    return /*html*/ `
    <div
        class="memory-item-svg-div" 
        id="popup-memory-item-link--${id}"
        title="Open Paper HTML Page"
        style="display: ${display}"
    >
        ${tablerSvg("external-link", "", ["popup-click-svg"])}
    </div>
    <div 
        class="memory-item-svg-div"
        id="popup-memory-item-copy-link--${id}"
        title="Copy pdf link" 
    >
        ${tablerSvg("link", "", ["popup-click-svg"])}
    </div>

    <div 
        class="memory-item-svg-div"
        id="popup-memory-item-md--${id}"
        title="Copy Markdown-formatted link" 
    >
        ${tablerSvg("clipboard-list", "", ["popup-click-svg"])}
    </div>

    <div 
        class="memory-item-svg-div"
        id="popup-memory-item-bibtex--${id}"
        title="Copy Bibtex citation" 
    >
        ${tablerSvg("archive", "", ["popup-click-svg"])}
    </div>

    <div 
        class="memory-item-svg-div"
        id="popup-memory-item-download--${id}"
        title="Download pdf" 
    >
        ${tablerSvg("file-download", "", ["popup-click-svg"])}
    </div>`;
};

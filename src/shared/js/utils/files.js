import { cleanPapers, miniHash, getStoredFiles } from "@pmu/functions.js";
import { state } from "@pmu/config.js";
import { parseIdFromUrl } from "@pmu/urls.js";

/**
 * Given a single paper or an url, find a matching file in the users'
 * downloads/PaperMemoryStore/ folder.
 * If a url is provided, it is first checked whether it is a known paper.
 * If not, the promise will resolve to null.
 * If it is, the promise will resolve to the file object as per the chrome.downloads.search API.
 * @param {object || string} paperOrUrl The paper to match to local files
 * @returns {Promise} Resolves a file object if exactly one is found, null otherwise
 */
export const findLocalFile = async (paperOrUrl) => {
    let paper;
    if (typeof paperOrUrl === "string") {
        // paperOrUrl is an url: find its paper (if any)
        let id;
        try {
            id = await parseIdFromUrl(paperOrUrl);
        } catch (error) {
            // no paper found
            return new Promise((resolve) => resolve(null));
        }
        if (state.papers.hasOwnProperty(id)) {
            paper = state.papers[id];
        } else {
            // The id found does not exist (parseIdFromUrl bug?)
            return new Promise((resolve) => resolve(null));
        }
    } else {
        // the paper is an actual paper object not a url
        paper = paperOrUrl;
    }
    // Return a Promise searching PaperMemoryStore/.*
    const storedFiles = await getStoredFiles();
    const matches = await matchPapersToFiles({ [paper.id]: paper }, storedFiles);
    const localFile = Object.values(matches);
    // resolve to a file object if exactly one is found otherwise to null
    return localFile.length === 1 ? localFile[0] : null;
};

/**
 * For each file in the files array, check if there exists a paper such that:
 *
 * 1. the file's finalUrl matches a paper's id as per parseIdFromUrl(candidate.finalUrl)
 * 2. if not, if there exists any paper such that the file's filename contains the paper's title
 *
 * [Note: title matching is done by first lowercasing then removing all non-alphanumeric characters]
 *
 * @param {object} papers An object mapping ids to papers, just like state.papers
 * @param {array} files An array of file objects as per the chrome.downloads.search API
 * @returns {object} An object mapping ids to files
 */
export const matchPapersToFiles = async (papers, files) => {
    // pre-compute paper's simplified titles
    const titles = Object.fromEntries(
        Object.values(papers).map((paper) => [paper.id, miniHash(paper.title)]),
    );
    // filter non-existing file handles
    files = files.filter(
        (f) =>
            f.exists &&
            f.state === "complete" &&
            !f.filename.toLowerCase().includes("readme.txt"),
    );
    // pre-compute file's simplified titles
    const fileTitles = Object.fromEntries(
        files.map((f) => [f.id, miniHash(f.filename)]),
    );

    // matching object to return
    let matches = {};

    for (const candidate of files) {
        let id;

        try {
            // find the file's id from its finalUrl
            id = await parseIdFromUrl(candidate.finalUrl);
            // if an id is found and it is in the papers requested for matching
            if (id && papers.hasOwnProperty(id)) matches[id] = candidate;
        } catch (error) {
            id = null;
        }
        if (!id) {
            // no id was found, try to match titles.
            // This is expensive so it should be rare.
            const candidateFileTitle = fileTitles[candidate.id];
            const match = Object.entries(titles).find(([id, title]) =>
                candidateFileTitle.includes(title),
            );
            if (match) {
                matches[match[0]] = candidate;
            }
        }
    }
    return matches;
};

/**
 * A function to detect whether the current local file is known in the
 * user's memory by ensuring there exists a paper whose title is in the filename.
 * The loose comparison is made against lowercase and letter-only strings.
 *
 * @param {string} url The current url (potentially: local file)
 * @returns {string || boolean} false if no paper is found, the paper's id if found
 */
export const isKnownLocalFile = (url) => {
    if (!url.startsWith("file://")) return false;
    if (!url.endsWith(".pdf")) return false;

    const filePath = decodeURIComponent(url).replace("file://", "");
    const storedPaths = Object.entries(state.files).filter(
        ([id, file]) => file.filename === filePath,
    );

    if (storedPaths.length > 0) {
        console.log("Found stored");
        return storedPaths[0][0];
    }

    const filename = decodeURIComponent(url.split("/").last())
        .toLowerCase()
        .replace(/\W/g, "");
    const titles = Object.values(cleanPapers(state.papers))
        .map((p) => {
            return { title: miniHash(p.title), id: p.id };
        })
        .filter((t) => filename.includes(t.title));

    if (titles.length === 0) return false;

    return titles[0].id;
};

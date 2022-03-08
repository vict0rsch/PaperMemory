/**
 * Make sure the currently stored data is compatible with the potentially updated code.
 * To do so, we check the stored data version and the current version of the extension.
 * If need be, fields are updated/added/deleted
 *
 * @param {object} papers reference papers to update
 * @param {number} manifestDataVersion the current version of the extension
 * @param {boolean} store whether to store the updated papers in storage
 * @returns {object} {papers: migratedPapers, success: ?, ?error: string}
 */
const migrateData = async (papers, manifestDataVersion, store = true) => {
    if (typeof papers === "undefined") {
        chrome.storage.local.set({ papers: { __dataVersion: manifestDataVersion } });
        return { papers: { __dataVersion: manifestDataVersion }, success: true };
    }
    const currentVersion = papers["__dataVersion"] || -1;
    var deleteIds = [];
    const latestDataVersion = 210;

    let newPapers = { ...papers };

    try {
        if (currentVersion >= latestDataVersion) {
            return { papers: papers, success: true };
        }

        store && backupData({ ...papers });

        delete papers["__dataVersion"];

        for (const id in papers) {
            if (currentVersion < 5) {
                info("Applying migration 5");
                // pre-0.2.8 and manifestDataVersion()
                if (!papers[id].hasOwnProperty("bibtex")) {
                    papers[id].bibtex = "";
                    log("Migrating bibtex for " + id);
                }
                if (!papers[id].pdfLink.endsWith(".pdf")) {
                    papers[id].pdfLink = papers[id].pdfLink + ".pdf";
                }
                if (!papers[id].codeLink) {
                    papers[id].codeLink = "";
                }
                if (!papers[id].source) {
                    if (papers[id].id.includes("NeurIPS")) {
                        papers[id].source = "neurips";
                    } else {
                        papers[id].source = "arxiv";
                    }
                }
            }
            if (currentVersion < 208) {
                // 0.2.8
                info("Applying migration 0.2.8");
                if (
                    papers[id].source !== "arxiv" &&
                    papers[id].md.includes("https://arxiv.com/abs/")
                ) {
                    papers[id].md = `[${papers[id].title}](${papers[id].pdfLink})`;
                }
                if (
                    papers[id].source !== "arxiv" &&
                    papers[id].pdfLink.includes("arxiv.org/pdf/")
                ) {
                    papers[id].source = "arxiv";
                }
                if (id.match(/^\d/) && papers[id].source === "arxiv") {
                    const newId = `Arxiv-${id}`;
                    let newPaper = { ...papers[id], id: newId };
                    papers[newId] = newPaper;
                    deleteIds.push(id);
                }
            }
            if (currentVersion < 209) {
                // 0.2.9
                info("Applying migration 0.2.9");
                if (!papers[id].hasOwnProperty("favorite")) {
                    papers[id].favorite = false;
                    papers[id].favoriteDate = "";
                }
            }
            if (currentVersion < 210) {
                info("Applying migration 0.2.10");
                if (papers[id].source === "arxiv") {
                    // replace vX in pdfs so the paper always points to the latest
                    const pdfVersion = papers[id].pdfLink.match(/v\d+\.pdf/gi);
                    if (pdfVersion && pdfVersion.length > 0) {
                        papers[id].pdfLink = papers[id].pdfLink.replace(
                            pdfVersion[0],
                            ".pdf"
                        );
                    }
                }
                if (papers[id].hasOwnProperty("bibtext")) {
                    papers[id].bibtex = papers[id].bibtext + "";
                    delete papers[id].bibtext;
                }
            }

            // need to fix https://github.com/vict0rsch/PaperMemory/issues/10
            // if (!papers[id].hasOwnProperty("codes")) {
            //     papers[id].codes = await fetchCodes(papers[id])
            // }
        }

        deleteIds.forEach((id, k) => {
            delete papers[id];
            log("Deleting " + id);
        });

        newPapers = { ...papers };
        newPapers["__dataVersion"] = manifestDataVersion;

        if (store) {
            chrome.storage.local.set({ papers: newPapers }, () => {
                log("Migrated papers:");
                log(newPapers);
                log("Data version is now " + manifestDataVersion);
            });
        }
        return { papers: newPapers, success: true };
    } catch (err) {
        log(
            `Error migrating data from version ${currentVersion} to ${manifestDataVersion}: `
        );
        log(err);

        return { papers: newPapers, success: false, error: err };
    }
};

/**
 * @param {string} key The storage key to log (log)
 */
const logStorage = (key) => {
    chrome.storage.local.get(key, (data) => {
        log(data[key]);
    });
};

/**
 * A utility function to retrieve some value associated with the
 * input key from storage.
 * usage: const value = await getStorage(key);
 *
 * @param {string} key The storage key to retrieve
 * @returns {any}
 */
const getStorage = async (key) => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(key, (data) => {
            if (typeof key === "string") {
                resolve(data[key]);
            } else {
                resolve(data);
            }
        });
    });
};

/**
 * A utility function to update the storage. Supports callbacks.
 * usage: setStorage("papers", {...}, () => {log("Done.")})
 *
 * @param {string} key The storage key to update
 * @param {any} value The key's value to store
 * @param {function} cb callback function to execute after successful storage
 * write
 * @returns {promise}
 */
const setStorage = async (key, value, cb = () => {}) => {
    return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
            cb();
            resolve(true);
        });
    });
};

/**
 * Delete a paper from storage.
 *
 * @param {string} id Paper id to delete. Must be exact.
 */
const deletePaperInStorage = async (id) => {
    const papers = await getStorage("papers");
    let deleted = false;
    if (papers.hasOwnProperty(id)) {
        deleted = delete papers[id];
    }
    if (deleted) {
        setStorage("papers", papers);
        log("Successfully deleted paper", id);
    } else {
        log("Error: no deletion");
    }
};

/**
 * @returns {string} Either "dark" or "light" depending on the user's preference.
 * Defaults to "light"
 */
const getTheme = async () => {
    const darkMode = await getStorage("checkDarkMode");
    return darkMode ? "dark" : "light";
};

/**
 * Stores the last 5 versions of the user's memory whenever there's a migration.
 * @param {object} papers The papers to store.
 */
const backupData = async (papers) => {
    chrome.storage.local.get("papersBackup", ({ papersBackup }) => {
        if (typeof papersBackup === "undefined") {
            papersBackup = {};
        }

        const oldestKeys = Object.keys(papersBackup)
            .map((v) => parseInt(v))
            .sort((a, b) => (a < b ? 1 : -1))
            .slice(4);

        for (const key of oldestKeys) {
            delete papersBackup[key];
        }

        papersBackup[papers["__dataVersion"]] = papers;

        chrome.storage.local.set({ papersBackup }, () => {
            log("Backed up data with version: " + papers["__dataVersion"]);
        });
    });
};

/**
 * Retrieve the boolean preferences as defined in config.js/menuStorageKeys
 * @returns {object} The user's preferences as per the popup's sliders in the menu.
 */
const getMenu = async () => {
    const storedMenu = await getStorage(global.menuStorageKeys);
    let menu = {};
    for (const m of global.menuCheckNames) {
        menu[m] = storedMenu.hasOwnProperty(m) ? storedMenu[m] : true;
    }
    return menu;
};

/**
 * Turns the manifest's semantic string version into an int:
 * PaperMemory version a.b.c => data version a * 10^4 + b * 10^2 + c
 * (with 10^2 and 10^1, 0.3.1 would be lower than 0.2.12)
 *
 * @returns {number} the int-ified semantic version
 */
const getManifestDataVersion = () => {
    const manifest = chrome.runtime.getManifest();
    return manifest.version
        .split(".")
        .map((v, k) => parseInt(v) * 10 ** (4 - 2 * k))
        .reduce((a, b) => a + b);
};

/**
 * Turns a version int into a semantic string (opposite operation to getManifestDataVersion)
 * @param {number} dataVersionInt The data version as an int
 * @returns {string} the semantic equivalent of the data version int
 */
const versionToSemantic = (dataVersionInt) => {
    // 209 -> 0.2.9
    // 1293 -> 0.12.93
    // 23439 -> 2.34.39
    major = parseInt(dataVersionInt / 1e4, 10);
    dataVersionInt -= major * 1e4;
    minor = parseInt(dataVersionInt / 1e2, 10);
    dataVersionInt -= minor * 1e2;
    return `${major}.${minor}.${dataVersionInt}`;
};

/**
 * Verify that a paper complies with expected fields, types and sets defaults
 * if possible.
 * @param {object} paper The paper object whose attributes should be verified
 * @param {boolean} log Whether to log the errors
 * @returns {object} {warnings: list of warning messages, paper: new paper with
 * updated missing keys to default values}
 */
const validatePaper = (paper, log = true) => {
    /*
    object mapping a paper's attributes to another object describing the 
    expected behavior of this attribute:
        a type, a description and a default function.
    If a paper is missing an attribute but the latter has a default function,
    the attribute will be set according to that function.
    Otherwise, it is considered an error.
    */
    const expectedKeys = {
        addDate: {
            type: "string",
            desc: "the paper's date of addition to the Memory",
            default: (p) => new Date().toJSON(),
        },
        author: {
            type: "string",
            desc: "` and `-separated authors `${firstName} ${lastName}`",
        },
        bibtex: {
            type: "string",
            desc: "BibTex citation with new lines (`\n`)",
        },
        codeLink: {
            type: "string",
            desc: "the paper's code link",
            default: (p) => "",
        },
        count: {
            type: "number",
            desc: "the paper's number of visits",
            default: (p) => 1,
        },
        favorite: {
            type: "boolean",
            desc: "user wants to star the paper",
            default: (p) => false,
        },
        favoriteDate: {
            type: "string",
            desc: "date the paper was added as a favorite",
            default: (p) => "",
        },
        id: {
            type: "string",
            desc: "Unique PaperMemory ID",
        },
        key: {
            type: "string",
            desc: "BibTex citation key",
            default: (p) => `defaultKey_${p.id}`,
        },
        lastOpenDate: {
            type: "string",
            desc: "When the paper was last opened",
            default: (p) => new Date().toJSON(),
        },
        md: {
            type: "string",
            desc: "markdown-formatted string `[${title}](${pdfLink})`",
            default: (p) => `[${p.title}](${p.pdfLink})`,
        },
        note: {
            type: "string",
            desc: "the user's note for this paper",
            default: (p) => "",
        },
        pdfLink: {
            type: "string",
            desc: "the link to the paper's pdf",
        },
        source: {
            type: "string",
            desc: "the paper's source i.e. where it was added to the memory from",
        },
        tags: {
            type: "array[string]",
            desc: "the user's tags for this paper",
            default: (p) => [],
        },
        year: {
            type: "string",
            desc: "year of publication",
        },
    };

    let warns = [];

    for (const key in expectedKeys) {
        if (!paper.hasOwnProperty(key)) {
            // the paper is missing the attribute `key`
            if (expectedKeys[key].default) {
                // there's a default function fo the missing attribute
                const defaultValue = expectedKeys[key].default(paper);
                paper[key] = defaultValue;
                message = `➤ Attribute "${key}" absent; will be set to "${defaultValue}" (${paper.id})`;
                // stores the update message. If `log` is true, also log the message
                warns.push(message);
                log && console.warn(message);
            } else {
                // There's no default function for the missing attribute.
                // This behavior is unaccounted for: throw an error and break the validation.
                throw new Error(
                    `Cannot continue, paper is corrupted. Missing mandatory attribute "${key}" in ${paper.id}`
                );
            }
        } else {
            // the paper has the attribute `key`
            const expectedType = expectedKeys[key].type;
            const keyType = typeof paper[key];
            if (!expectedType.startsWith("array")) {
                // for non-array types, we can directly compare strings
                if (keyType !== expectedType) {
                    // wrong type: store (and log?) warning.
                    // This is not a deal breaker, just a warning.
                    message = `➤ ${key} should be of type ${expectedType} not ${keyType} (${paper.id})`;
                    warns.push(message);
                    log && console.warn(message);
                }
            } else {
                // expected values are arrays.
                // find the expected type of the array's elements:
                const subType = expectedType.split("[")[1].replace("]", "");
                if (!Array.isArray(paper[key])) {
                    // the attribute is not an array: warning
                    message = `${key} should be an array (${paper.id})`;
                    warns.push(message);
                    log && console.warn(message);
                } else {
                    // the attribute is an array
                    if (paper[key].length > 0) {
                        // if it contains elements: check they are of the expected type
                        const keyType = typeof paper[key][0];
                        if (keyType !== subType) {
                            // sub-type mismatch: warning
                            message = `➤ ${key} should contain ${subType} not ${keyType} (${paper.id})`;
                            warns.push(message);
                            log && console.warn(message);
                        }
                    }
                }
            }
        }
    }

    // check the paper's source is valid
    const sources = Object.keys(global.knownPaperPages);
    if (sources.indexOf(paper.source) < 0) {
        message = `Unknown source ${paper.source} (${paper.id})`;
        warns.push(message);
        console.warn(message);
    }

    return { warnings: warns, paper: paper };
};

/**
 *
 * @param {object} data the data to overwrite the stored memory with
 * @returns {object} the operation's status report:
 * {
 *  success: overwrite went well,
 *  message: overwrite error message in case it fails,
 *  warning: warnings resulting from the paper validation procedure,
 *  papersToWrite: papersToWrite,
 * }
 */
const prepareOverwriteData = async (data) => {
    let error = true;
    let warning = "";
    let message = "";
    let papersToWrite;
    try {
        if (!data.__dataVersion) {
            data.__dataVersion = 1;
        }
        // run data migration in order to ensure the data is valid
        // but do not store the resulting object.
        const migration = await migrateData(data, getManifestDataVersion(), false);
        if (!migration.success) {
            // there was an error in the migration process: abort overwrite
            message = "Could not migrate the data before storing it";
            if (migration.error) {
                message += ":<br/>" + stringifyError(migration.error);
            }
            return {
                success: false,
                message: message,
            };
        }

        // validate (and set defaults) the papers in the overwriting data
        papersToWrite = migration.papers;
        for (const id in papersToWrite) {
            if (!id.startsWith("__")) {
                paperWarnings = validatePaper(papersToWrite[id]).warnings;
                if (paperWarnings && paperWarnings.length > 0) {
                    warning += "<br/>" + paperWarnings.join("<br/>");
                }
            }
        }
        if (warning) {
            // there were warnings in the validation: store current memory
            // as `uploadBackup` key to be safe in case the user regrets
            // confirming the overwrite
            const prevPapers = await getStorage("papers");
            setStorage("uploadBackup", prevPapers);
        }
        error = false;
    } catch (err) {
        // something went very wrong (eg: impossible paper validation or bug)
        log("prepareOverwriteData error", err);
        message =
            `<h5 class="errorTitle"> /!\\ OverwriteMemoryError:</h5><br/>` +
            stringifyError(err);
        error = true;
    }
    // return status report and papers to write if the user confirms
    return {
        success: !error,
        message: message,
        warning: warning,
        papersToWrite: papersToWrite,
    };
};
// Debug bundle - exports all utility functions for development debugging
// This file is only built and loaded in development mode

// Import all utility modules
import * as config from "@pmu/config.js";
import * as functions from "@pmu/functions.js";
import * as miniquery from "@pmu/miniquery.js";
import * as data from "@pmu/data.js";
import * as paper from "@pmu/paper.js";
import * as bibtexParser from "@pmu/bibtexParser.js";
import * as sync from "@pmu/sync.js";
import * as state from "@pmu/state.js";
import * as urls from "@pmu/urls.js";
import * as files from "@pmu/files.js";
import * as parsers from "@pmu/parsers.js";
// Import popup-specific modules (when available)
// Important: these modules themselves import popup.js which contains
// immediately-invoked functions that should not be called twice. This is why
// we use a global variable to track whether the popup has been initialized.

// If in the future we need to import other non-utils modules, we should
// check that this double-import issue is addressed.
import * as templates from "@pm/popup/js/templates.js";
import * as handlers from "@pm/popup/js/handlers.js";
import * as memory from "@pm/popup/js/memory.js";

// Create the debug object
const PMDebug = {
    // Utility modules
    config,
    functions,
    miniquery,
    data,
    paper,
    bibtexParser,
    sync,
    state,
    urls,
    files,
    parsers,
    // Popup modules
    templates,
    handlers,
    memory,

    // Helper to access commonly used functions directly
    get getStorage() {
        return data.getStorage;
    },
    get setStorage() {
        return data.setStorage;
    },
    get getPrefs() {
        return data.getPrefs;
    },
    get log() {
        return functions.log;
    },
    get info() {
        return functions.info;
    },
    get findEl() {
        return miniquery.findEl;
    },
    get setHTML() {
        return miniquery.setHTML;
    },

    get getPapers() {
        return config.state.papers;
    },

    // Utility to list all available functions
    listAllFunctions() {
        const modules = [
            "config",
            "functions",
            "miniquery",
            "data",
            "paper",
            "bibtexParser",
            "sync",
            "state",
            "urls",
            "files",
            "templates",
            "handlers",
            "parsers",
            "memory",
        ];
        modules.forEach((moduleName) => {
            if (this[moduleName]) {
                console.group(`PMDebug.${moduleName}`);
                Object.keys(this[moduleName]).forEach((key) => {
                    if (typeof this[moduleName][key] === "function") {
                        console.log(`• ${key}()`);
                    } else {
                        console.log(`• ${key}`);
                    }
                });
                console.groupEnd();
            }
        });
    },
};

// Make it globally available
if (typeof window !== "undefined") {
    window.PMDebug = PMDebug;
} else if (typeof global !== "undefined") {
    global.PMDebug = PMDebug;
}

export default PMDebug;

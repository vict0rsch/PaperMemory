import { glob } from "glob";
import fs from "fs";
import os from "os";
import ora from "ora";
import YAML from "yaml";

/**
 * Get the root directory of the project.
 */
export const root = fs.existsSync("./wxt.config.js") ? "." : "..";

/**
 * Find Chrome executable path across different operating systems.
 * @returns {string} Path to Chrome executable
 * @throws {Error} If Chrome is not found
 */
export const findChromeExecutable = () => {
    // Allow override via environment variable
    if (process.env.CHROME_PATH) {
        if (fs.existsSync(process.env.CHROME_PATH)) {
            console.log(`Using Chrome from CHROME_PATH: ${process.env.CHROME_PATH}`);
            return process.env.CHROME_PATH;
        } else {
            throw new Error(
                `Chrome executable not found at CHROME_PATH: ${process.env.CHROME_PATH}`,
            );
        }
    }

    const platform = os.platform();

    let possiblePaths = [];

    if (platform === "darwin") {
        // macOS paths
        possiblePaths = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        ];
    } else if (platform === "linux") {
        // Linux paths
        possiblePaths = [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
            "/opt/google/chrome/chrome",
        ];
    } else if (platform === "win32") {
        // Windows paths
        possiblePaths = [
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
            "C:\\Program Files\\Chromium\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe",
        ];
    }

    // Check each possible path
    for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
            console.log(`Found Chrome at: ${path}`);
            return path;
        }
    }

    // If no Chrome found, provide helpful error message
    const pathList = possiblePaths.map((p) => `  - ${p}`).join("\n");
    throw new Error(
        `Chrome executable not found on ${platform}. Searched in:\n${pathList}\n\n` +
            `Please install Google Chrome or Chromium, or set CHROME_PATH environment variable.`,
    );
};

/**
 * Sleep for a given duration, and display a spinner.
 */
export const sleep = async (duration, textToDisplay) => {
    const text = textToDisplay
        ? `${textToDisplay} (${duration / 1e3}s)`
        : `Waiting for ${duration / 1e3}s`;
    const spinner =
        duration > 200 ? ora({ text, spinner: "timeTravel" }).start() : null;
    await new Promise((resolve) => setTimeout(resolve, duration));
    spinner && spinner.stop();
};

/**
 * Load all utils files into the global scope.
 */
export const loadPaperMemoryUtils = async () => {
    const utilsFiles = glob
        .sync(`${root}/src/shared/js/utils/*.js`)
        .filter((file) => !file.endsWith("gist.js") && !file.endsWith("sync.js"))
        .map((file) => `../${file}`);
    const utilsModules = await asyncMap(utilsFiles, async (file) => {
        const module = await import(file);
        return {
            name: file.split("/").pop().split(".")[0], // remove .js
            module,
        };
    });

    global.PMUtils = {};

    for (const moduleDict of utilsModules) {
        global.PMUtils[moduleDict.name] = moduleDict.module;
    }
};

/**
 * Generate an array of integers from 0 to n-1.
 * @param {number} n
 */
export const range = (n) => [...Array(n).keys()];

/**
 * Read a JSON file.
 */
export const readJSON = (fname) => JSON.parse(fs.readFileSync(fname));

/**
 * Run a function on each element of an array, and return the results.
 */
export const asyncMap = (arr, func) => Promise.all(arr.map(func));

/**
 * Read the urls data file.
 */
export const readURLs = () => readJSON(`${root}/test/data/urls.json`);

/**
 * Read the duplicates data file.
 */
export const readDuplicates = () => readJSON(`${root}/test/data/duplicates.json`);

export const indent = (n) => " ".repeat(n * 4);

/**
 * Load the test config file, and override any values with environment variables.
 */
export const loadConfig = () => {
    const conf = {};
    const file = fs.readFileSync(`${root}/test/testConfig.yaml`, "utf8");
    const defaults = YAML.parse(file); // dict of {key: {type: str, defaultValue: any}}
    for (const [key, { type, defaultValue }] of Object.entries(defaults)) {
        conf[key] = process.env[key] || defaultValue;
        if (type === "int") {
            conf[key] = parseInt(conf[key]);
        } else if (type === "bool") {
            conf[key] = ["true", "1"].indexOf((conf[key] + "").toLowerCase()) >= 0;
        } else if (type === "float") {
            conf[key] = parseFloat(conf[key]);
        } else if (type === "comma-separated-str") {
            conf[key] = conf[key]
                .split(",")
                .map((item) => item.trim())
                .filter((item) => item);
        }
    }
    return conf;
};

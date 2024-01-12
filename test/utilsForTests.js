const glob = require("glob");
const fs = require("fs");
const ora = require("ora");
const YAML = require("yaml");

/**
 * Get the root directory of the project.
 */
exports.root = fs.existsSync("./manifest.json") ? "." : "..";

/**
 * Sleep for a given duration, and display a spinner.
 */
exports.sleep = async (duration, textToDisplay) => {
    const text = textToDisplay
        ? `${textToDisplay} (${duration / 1e3}s)`
        : `Waiting for ${duration / 1e3}s`;
    const spinner = ora({ text, spinner: "timeTravel" }).start();
    await new Promise((resolve) => setTimeout(resolve, duration));
    spinner.stop();
};

/**
 * Load all utils files into the global scope.
 */
exports.loadPaperMemoryUtils = () => {
    const utilsFiles = glob
        .sync(`${this.root}/src/shared/js/utils/*.js`)
        .filter((file) => !file.endsWith("gist.js") && !file.endsWith("sync.js"))
        .map((file) => `../${file.replace(".js", "")}`);
    const utilsModules = utilsFiles.map((file) => require(file));

    for (const module of utilsModules) {
        for (const [name, func] of Object.entries(module)) {
            global[name] = func;
        }
    }
};

/**
 * Generate an array of integers from 0 to n-1.
 * @param {number} n
 */
exports.range = (n) => [...Array(n).keys()];

/**
 * Read a JSON file.
 */
exports.readJSON = (fname) => JSON.parse(fs.readFileSync(fname));

/**
 * Run a function on each element of an array, and return the results.
 */
exports.asyncMap = (arr, func) => Promise.all(arr.map(func));

/**
 * Read the urls data file.
 */
exports.readURLs = () => this.readJSON(`${this.root}/test/data/urls.json`);

/**
 * Read the duplicates data file.
 */
exports.readDuplicates = () => this.readJSON(`${this.root}/test/data/duplicates.json`);

/**
 * Load the test config file, and override any values with environment variables.
 */
exports.loadConfig = () => {
    const conf = {};
    const file = fs.readFileSync(`${this.root}/test/testConfig.yaml`, "utf8");
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

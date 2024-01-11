const glob = require("glob");
const fs = require("fs");
const ora = require("ora");

exports.root = fs.existsSync("./manifest.json") ? "." : "..";

exports.sleep = async (duration, textToDisplay) => {
    const text = textToDisplay
        ? `${textToDisplay} (${duration / 1e3}s)`
        : `Waiting for ${duration / 1e3}s`;
    const spinner = ora({ text, spinner: "timeTravel" }).start();
    await new Promise((resolve) => setTimeout(resolve, duration));
    spinner.stop();
};

exports.loadPaperMemoryUtils = () => {
    const utilsFiles = glob
        .sync(`${this.root}/src/shared/js/utils/*.js`)
        .filter((file) => !file.endsWith("gist.js") && !file.endsWith("sync.js"))
        .map((file) => `../${file.replace(".js", "")}`);
    console.log("utilsFiles: ", utilsFiles);
    const utilsModules = utilsFiles.map((file) => require(file));

    for (const module of utilsModules) {
        for (const [name, func] of Object.entries(module)) {
            global[name] = func;
        }
    }
};

exports.range = (n) => [...Array(n).keys()];

exports.readJSON = (fname) => JSON.parse(fs.readFileSync(fname));

exports.asyncMap = (arr, func) => Promise.all(arr.map(func));

exports.readURLs = () => this.readJSON(`${this.root}/test/data/urls.json`);

exports.readDuplicates = () => this.readJSON(`${this.root}/test/data/duplicates.json`);

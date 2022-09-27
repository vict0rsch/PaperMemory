const glob = require("glob");
const fs = require("fs");
const ora = require("ora");

exports.sleep = async (duration, textToDisplay) => {
    const text = textToDisplay
        ? `${textToDisplay} (${duration / 1e3}s)`
        : `Waiting for ${duration / 1e3}s`;
    const spinner = ora({ text, spinner: "timeTravel" }).start();
    await new Promise((resolve) => setTimeout(resolve, duration));
    spinner.stop();
};

exports.loadPaperMemoryUtils = () => {
    const utilsFiles = glob.sync("../src/shared/js/utils/*.js");
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

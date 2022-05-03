const glob = require("glob");
const fs = require("fs");

exports.sleep = async (duration) => {
    await new Promise((resolve) => setTimeout(resolve, duration));
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

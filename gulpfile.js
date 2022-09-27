const { src, dest, parallel, watch, series } = require("gulp");
const concat = require("gulp-concat");
const uglify = require("gulp-uglify");
const cleanCss = require("gulp-clean-css");
const rename = require("gulp-rename");
const preprocess = require("gulp-preprocess");
const htmlmin = require("gulp-html-minifier-terser");
const minifyJSTemplate = require("gulp-minify-html-literals");
const readlineSync = require("readline-sync");
const fs = require("fs");
const zip = require("gulp-zip");
const { v4: uuidv4 } = require("uuid");
const debug = require("gulp-debug");

function popupJS() {
    return src([
        "src/popup/js/handlers.js",
        "src/popup/js/templates.js",
        "src/popup/js/memory.js",
        "src/popup/js/popup.js",
    ])
        .pipe(concat("popup.js"))
        .pipe(
            minifyJSTemplate({
                minifyOptions: { minifyCSS: false, collapseWhitespace: true },
                shouldMinify: (template) => true,
            })
        )
        .pipe(uglify({ mangle: true }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/min/"));
}

function utilsJS() {
    return (
        src([
            "src/shared/js/utils/miniquery.js",
            "src/shared/js/utils/config.js",
            "src/shared/js/utils/levenshtein.js",
            "src/shared/js/utils/bibtexParser.js",
            "src/shared/js/utils/functions.js",
            "src/shared/js/utils/gist.js",
            "src/shared/js/utils/sync.js",
            "src/shared/js/utils/data.js",
            "src/shared/js/utils/paper.js",
            "src/shared/js/utils/state.js",
            "src/shared/js/utils/parsers.js",
        ])
            // .pipe(debug())
            .pipe(concat("utils.js"))
            .pipe(
                minifyJSTemplate({
                    minifyOptions: { minifyCSS: false, collapseWhitespace: true },
                    shouldMinify: (template) => true,
                })
            )
            .pipe(uglify({ mangle: true }))
            .pipe(rename({ suffix: ".min" }))
            .pipe(dest("src/shared/min"))
    );
}

function themeJS() {
    return src(["src/shared/js/theme.js"])
        .pipe(uglify({ mangle: true }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/shared/min"));
}

function popupHTMLDev() {
    return src(["src/popup/popup.html"])
        .pipe(preprocess({ context: { DEV: true } }))
        .pipe(rename("popup.min.html"))
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(dest("src/popup/min/"));
}

function popupHTML() {
    return src(["src/popup/popup.html"])
        .pipe(preprocess({ context: { DEV: false } }))
        .pipe(rename("popup.min.html"))
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(dest("src/popup/min/"));
}

function popupCSS() {
    return src([
        "src/shared/css/vars.css",
        "src/popup/css/options.css",
        "src/popup/css/popup.css",
        "src/shared/css/loader.css",
    ])
        .pipe(concat("popup.css"))
        .pipe(cleanCss())
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/min/"));
}
function popupDarkCSS() {
    return src(["src/popup/css/dark.css"])
        .pipe(cleanCss())
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/min/"));
}

function watchFiles() {
    watch("src/popup/js/*.js", popupJS);
    watch("src/shared/js/theme.js", themeJS);
    watch(
        ["src/popup/css/*.css", "src/shared/css/*.css"],
        parallel(popupCSS, popupDarkCSS)
    );
    watch("src/popup/*.html", popupHTMLDev);
    watch("src/shared/js/utils/*", utilsJS);
}

function createArchive(cb) {
    var manifest = JSON.parse(fs.readFileSync("./manifest.json"));
    let archiveName = `Archive-${manifest.version}.zip`;
    let archiveFolder = "extra/archives/";
    const archivePath = `${archiveFolder}${archiveName}`;
    if (fs.existsSync(archivePath)) {
        console.log(archivePath + " already exists");
        const index = readlineSync.keyInSelect(
            ["Create temporary archive", "Overwrite"],
            "What now ?"
        );
        if (index < 0) {
            return cb();
        }
        if (index === 0) {
            archiveName = uuidv4().split("-")[0] + "-" + archiveName;
            archiveFolder = "extra/archives/tmp/";
            console.log("Creating zip: " + archiveFolder + archiveName);
        }
    }
    return src([
        "./**",
        "!extra/**",
        "!test/**",
        "!coverage/**",
        "!node_modules/**",
        "!./.vscode/**",
        "!keys.json",
    ])
        .pipe(zip(archiveName))
        .pipe(dest(archiveFolder));
}

exports.build = parallel(popupJS, themeJS, utilsJS, popupCSS, popupDarkCSS, popupHTML);
exports.dev = parallel(popupJS, themeJS, utilsJS, popupCSS, popupDarkCSS, popupHTMLDev);
exports.watch = series(exports.dev, watchFiles);
exports.archive = series(exports.build, createArchive);
exports.html = series(popupHTMLDev);
exports.popupHTMLDev = popupHTMLDev;

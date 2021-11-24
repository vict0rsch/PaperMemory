var { src, dest, parallel } = require("gulp");
var concat = require("gulp-concat");
var uglify = require("gulp-uglify");
var cleanCss = require("gulp-clean-css");
var rename = require("gulp-rename");
var preprocess = require("gulp-preprocess");
const htmlmin = require("gulp-html-minifier-terser");

function popupJS() {
    return src([
        "src/popup/popup-js/handlers.js",
        "src/popup/popup-js/templates.js",
        "src/popup/popup-js/memory.js",
        "src/popup/popup-js/popup.js",
    ])
        .pipe(concat("popup.js"))
        .pipe(uglify({ mangle: false }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/"));
}

function utilsJS() {
    return src([
        "src/shared/utils/miniquery.js",
        "src/shared/utils/config.js",
        "src/shared/utils/functions.js",
        "src/shared/utils/parsers.js",
    ])
        .pipe(concat("utils.js"))
        .pipe(uglify({ mangle: false }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/shared/"));
}

function themeJS() {
    return src(["src/popup/theme.js"])
        .pipe(uglify({ mangle: false }))
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/"));
}

function popupHTMLDev() {
    return src(["src/popup/popup.html"])
        .pipe(preprocess({ context: { DEV: true } }))
        .pipe(rename("popup.min.html"))
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(dest("src/popup/"));
}
function popupHTML() {
    return src(["src/popup/popup.html"])
        .pipe(preprocess({ context: { DEV: false } }))
        .pipe(rename("popup.min.html"))
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(dest("src/popup/"));
}

function popupCSS() {
    return src([
        "src/popup/popup-css/dark.css",
        "src/popup/popup-css/options.css",
        "src/popup/popup-css/popup.css",
        "src/shared/loader.css",
    ])
        .pipe(concat("popup.css"))
        .pipe(cleanCss())
        .pipe(rename({ suffix: ".min" }))
        .pipe(dest("src/popup/"));
}

exports.popupJS = popupJS;
exports.themeJS = themeJS;
exports.utilsJS = popupHTML;
exports.popupHTMLDev = popupHTMLDev;

exports.popupCSS = popupCSS;

exports.popupHTML = popupHTML;

exports.popup = parallel(popupJS, themeJS, utilsJS, popupCSS, popupHTML);

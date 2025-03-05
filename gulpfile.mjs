import gulp from "gulp";
const { src, dest, parallel, series } = gulp;
const gwatch = gulp.watch;
import concat from "gulp-concat";
import uglify from "gulp-uglify";
import cleanCss from "gulp-clean-css";
import rename from "gulp-rename";
import preprocess from "gulp-preprocess";
import htmlmin from "gulp-html-minifier-terser";
// import minifyJSTemplate from "gulp-minify-html-literals";
import readlineSync from "readline-sync";
import fs from "fs";
import zip from "gulp-zip";
import { v4 as uuidv4 } from "uuid";
import include from "gulp-include";
// import debug from "gulp-debug";

function popupJS() {
    return (
        src([
            "src/popup/js/handlers.js",
            "src/popup/js/templates.js",
            "src/popup/js/memory.js",
            "src/popup/js/popup.js",
        ])
            .pipe(concat("popup.js"))
            // .pipe(
            //     minifyJSTemplate({
            //         minifyOptions: { minifyCSS: false, collapseWhitespace: true },
            //         shouldMinify: (template) => true,
            //     })
            // )
            .pipe(uglify({ mangle: true }))
            .pipe(rename({ suffix: ".min" }))
            .pipe(dest("src/popup/min/"))
    );
}

function utilsJS() {
    return (
        src([
            "src/shared/js/utils/octokit.bundle.js",
            "src/shared/js/utils/miniquery.js",
            "src/shared/js/utils/config.js",
            "src/shared/js/utils/bibtexParser.js",
            "src/shared/js/utils/functions.js",
            "src/shared/js/utils/sync.js",
            "src/shared/js/utils/data.js",
            "src/shared/js/utils/paper.js",
            "src/shared/js/utils/state.js",
            "src/shared/js/utils/parsers.js",
        ])
            // .pipe(debug())
            .pipe(concat("utils.js"))
            // .pipe(
            //     minifyJSTemplate({
            //         minifyOptions: { minifyCSS: false, collapseWhitespace: true },
            //         shouldMinify: (template) => true,
            //     })
            // )
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
    return src(["src/popup/html/popup.html"])
        .pipe(preprocess({ context: { DEV: true } }))
        .pipe(include())
        .pipe(rename("popup.min.html"))
        .pipe(htmlmin({ collapseWhitespace: true, removeComments: true }))
        .pipe(dest("src/popup/min/"));
}

function popupHTML() {
    return src(["src/popup/html/popup.html"])
        .pipe(preprocess({ context: { DEV: false } }))
        .pipe(include())
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
    gwatch("src/popup/js/*.js", popupJS);
    gwatch("src/shared/js/theme.js", themeJS);
    gwatch(
        ["src/popup/css/*.css", "src/shared/css/*.css"],
        parallel(popupCSS, popupDarkCSS)
    );
    gwatch("src/popup/*.html", popupHTMLDev);
    gwatch("src/shared/js/utils/*", utilsJS);
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
        "!docs/**",
        "!test/**",
        "!site/**",
        "!coverage/**",
        "!node_modules/**",
        "!./.vscode/**",
        "!keys.json",
        "!yarn.lock",
    ])
        .pipe(zip(archiveName))
        .pipe(dest(archiveFolder));
}

export const build = parallel(
    popupJS,
    themeJS,
    utilsJS,
    popupCSS,
    popupDarkCSS,
    popupHTML
);

export const dev = parallel(
    popupJS,
    themeJS,
    utilsJS,
    popupCSS,
    popupDarkCSS,
    popupHTMLDev
);

export const watch = series(dev, watchFiles);

export const archive = series(build, createArchive);

export const html = series(popupHTMLDev);

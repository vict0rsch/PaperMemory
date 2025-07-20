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
import { spawn } from "child_process";
// import debug from "gulp-debug";

// Helper function to build ES modules using Rollup
function buildESModules() {
    return new Promise((resolve, reject) => {
        const rollup = spawn("npx", ["rollup", "-c"], { stdio: "inherit" });
        rollup.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Rollup build failed with code ${code}`));
            }
        });
    });
}

// Note: popupJS() and utilsJS() tasks removed - now handled by Rollup

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
    // Watch theme.js (still processed by Gulp)
    gwatch("src/shared/js/theme.js", themeJS);

    // Watch CSS files
    gwatch(
        ["src/popup/css/*.css", "src/shared/css/*.css"],
        parallel(popupCSS, popupDarkCSS)
    );

    // Watch HTML files
    gwatch("src/popup/*.html", popupHTMLDev);
    gwatch("src/popup/html/modals/*.html", popupHTMLDev);
    gwatch("src/popup/html/svgs/*.html", popupHTMLDev);

    // Watch for ES module changes (handled by Rollup)
    gwatch(
        [
            "src/shared/js/utils/*",
            "src/popup/js/*.js",
            "src/content_scripts/*.js",
            "src/background/*.js",
            "src/options/*.js",
            "src/bibMatcher/*.js",
            "src/fullMemory/*.js",
        ],
        buildESModules
    );
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

// Updated build tasks - removed redundant JS bundling
export const build = parallel(
    themeJS,
    popupCSS,
    popupDarkCSS,
    popupHTML,
    buildESModules
);

export const dev = parallel(
    themeJS,
    popupCSS,
    popupDarkCSS,
    popupHTMLDev,
    buildESModules
);

export const watch = series(dev, watchFiles);

export const archive = series(build, createArchive);

export const html = series(popupHTMLDev);

export const modules = buildESModules;

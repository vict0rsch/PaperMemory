import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import alias from "@rollup/plugin-alias";
import replace from "@rollup/plugin-replace";
import postcss from "rollup-plugin-postcss";
import copy from "rollup-plugin-copy";
import del from "rollup-plugin-delete";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { glob } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;

// Define common plugins with alias configuration
const getCommonPlugins = () => [
    alias({
        entries: [
            { find: "@pm", replacement: path.resolve(__dirname, "src") },
            {
                find: "@pmu",
                replacement: path.resolve(__dirname, "src/shared/js/utils"),
            },
        ],
    }),
    replace({
        __DEV__: JSON.stringify(isDevelopment),
        preventAssignment: true,
    }),
    nodeResolve({
        browser: true,
        preferBuiltins: false,
    }),
    commonjs(),
    ...(isProduction ? [terser()] : []),
];

// Generate HTML files
const generateHTML = (isDev = false) => ({
    name: "generate-html",
    generateBundle() {
        // Read the source HTML
        const htmlContent = fs.readFileSync("src/popup/html/popup.html", "utf-8");

        // Process includes with glob support
        let processedHTML = htmlContent.replace(
            /<!--=include\s+(.+?)\s+-->/g,
            (match, includePath) => {
                const fullPath = path.resolve(__dirname, "src/popup/html", includePath);
                try {
                    // Handle glob patterns
                    if (includePath.includes("*")) {
                        const files = glob.sync(fullPath);
                        return files
                            .map((file) => fs.readFileSync(file, "utf-8"))
                            .join("\n");
                    } else {
                        return fs.readFileSync(fullPath, "utf-8");
                    }
                } catch (e) {
                    console.warn(`Could not include file: ${fullPath}`);
                    return match;
                }
            }
        );

        // Remove @if DEV blocks since we now use direct bundle references
        processedHTML = processedHTML.replace(
            /<!-- @if DEV -->[\s\S]*?<!-- @else -->/g,
            ""
        );
        processedHTML = processedHTML.replace(/<!-- @endif -->/g, "");

        // Update CSS references for the new build system
        processedHTML = processedHTML.replace(
            '<link rel="stylesheet" type="text/css" href="popup.min.css" />',
            `<link rel="stylesheet" type="text/css" href="${
                isProduction ? "popup.min.css" : "popup.css"
            }" />`
        );

        // Inject debug script in development mode
        if (isDev) {
            const debugScriptTag =
                '<script src="../../debug/debug.bundle.js"></script>';
            processedHTML = processedHTML.replace(
                "</head>",
                `    ${debugScriptTag}\n</head>`
            );
        }

        // Minify HTML in production
        if (isProduction) {
            processedHTML = processedHTML
                .replace(/>\s+</g, "><")
                .replace(/\s+/g, " ")
                .trim();
        }

        // Write the processed HTML
        this.emitFile({
            type: "asset",
            fileName: "popup.min.html",
            source: processedHTML,
        });
    },
});

// CSS processing plugin
const processCSS = (inputFiles, outputPath, minimize = true) => ({
    name: "process-css",
    buildStart() {
        // Watch CSS files for rebuilds
        inputFiles.forEach((file) => {
            this.addWatchFile(path.resolve(__dirname, file));
        });
    },
    generateBundle() {
        // Read and concatenate CSS files
        const cssContent = inputFiles
            .map((file) => {
                const fullPath = path.resolve(__dirname, file);
                return fs.readFileSync(fullPath, "utf-8");
            })
            .join("\n");

        // Basic CSS minification if needed
        let processedCSS = cssContent;
        if (minimize && isProduction) {
            processedCSS = cssContent
                .replace(/\/\*[\s\S]*?\*\//g, "") // Remove comments
                .replace(/\s+/g, " ") // Collapse whitespace
                .replace(/;\s*}/g, "}") // Remove last semicolon in blocks
                .trim();
        }

        // Emit the CSS file
        this.emitFile({
            type: "asset",
            fileName: path.basename(outputPath),
            source: processedCSS,
        });
    },
});

// Process static HTML files to conditionally inject debug scripts
const processStaticHTML = () => ({
    name: "process-static-html",
    writeBundle() {
        const htmlFiles = [
            {
                src: "src/options/options.html",
                debugScript: '    <script src="../debug/debug.bundle.js"></script>',
                insertBefore: "</body>",
            },
            {
                src: "src/fullMemory/fullMemory.html",
                debugScript: '        <script src="../debug/debug.bundle.js"></script>',
                insertBefore: "</head>",
            },
            {
                src: "src/bibMatcher/bibMatcher.html",
                debugScript: '        <script src="../debug/debug.bundle.js"></script>',
                insertBefore: "</body>",
            },
        ];

        htmlFiles.forEach(({ src, debugScript, insertBefore }) => {
            let htmlContent = fs.readFileSync(src, "utf-8");

            // Remove any existing debug script tags first (cleanup)
            htmlContent = htmlContent.replace(
                /\s*<script src="\.\.\/debug\/debug\.bundle\.js"><\/script>\s*/g,
                ""
            );

            // Only inject debug script in development mode
            if (isDevelopment) {
                htmlContent = htmlContent.replace(
                    insertBefore,
                    `${debugScript}\n${insertBefore}`
                );
            }

            // Write the processed HTML back
            fs.writeFileSync(src, htmlContent);
        });
    },
});

// Configuration for different builds
const configs = [
    // Theme JS (standalone)
    {
        input: "src/shared/js/theme.js",
        output: {
            file: "src/shared/min/theme.min.js",
            format: "iife",
            sourcemap: !isProduction,
        },
        plugins: [...(isProduction ? [terser()] : [])],
    },

    // Popup modules bundle
    {
        input: "src/popup/js/popup.js",
        output: {
            file: "src/popup/min/popup.bundle.js",
            format: "iife",
            name: "PaperMemoryPopup",
            sourcemap: !isProduction,
        },
        plugins: [
            ...getCommonPlugins(),
            generateHTML(isDevelopment),
            processCSS(
                [
                    "src/shared/css/vars.css",
                    "src/popup/css/options.css",
                    "src/popup/css/popup.css",
                    "src/shared/css/loader.css",
                ],
                isProduction ? "popup.min.css" : "popup.css"
            ),
            processCSS(["src/popup/css/dark.css"], "dark.min.css"),
        ],
    },

    // Content script modules bundle
    {
        input: "src/content_scripts/content_script.js",
        output: {
            file: "src/content_scripts/content.bundle.js",
            format: "iife",
            name: "PaperMemoryContent",
            sourcemap: !isProduction,
        },
        plugins: getCommonPlugins(),
    },

    // Options page modules bundle
    {
        input: "src/options/options.js",
        output: {
            file: "src/options/options.bundle.js",
            format: "iife",
            name: "PaperMemoryOptions",
            sourcemap: !isProduction,
        },
        plugins: getCommonPlugins(),
    },

    // Background service worker modules bundle
    {
        input: "src/background/background.js",
        output: {
            file: "src/background/background.bundle.js",
            format: "iife",
            name: "PaperMemoryBackground",
            sourcemap: !isProduction,
        },
        plugins: getCommonPlugins(),
    },

    // BibMatcher modules bundle
    {
        input: "src/bibMatcher/bibMatcher.js",
        output: {
            file: "src/bibMatcher/bibMatcher.bundle.js",
            format: "iife",
            name: "PaperMemoryBibMatcher",
            sourcemap: !isProduction,
        },
        plugins: getCommonPlugins(),
    },

    // FullMemory modules bundle
    {
        input: "src/fullMemory/fullMemory.js",
        output: {
            file: "src/fullMemory/fullMemory.bundle.js",
            format: "iife",
            name: "PaperMemoryFullMemory",
            sourcemap: !isProduction,
        },
        plugins: getCommonPlugins(),
    },

    // Debug bundle (development only)
    ...(isDevelopment
        ? [
              {
                  input: "src/debug/debug.js",
                  output: {
                      file: "src/debug/debug.bundle.js",
                      format: "iife",
                      name: "PMDebug",
                      sourcemap: true,
                  },
                  plugins: [...getCommonPlugins(), processStaticHTML()],
              },
          ]
        : []),
];

export default configs;

import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import alias from "@rollup/plugin-alias";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === "production";

// Define common plugins with alias configuration
const getPlugins = () => [
    alias({
        entries: [
            { find: "@pm", replacement: path.resolve(__dirname, "src") },
            {
                find: "@pmu",
                replacement: path.resolve(__dirname, "src/shared/js/utils"),
            },
        ],
    }),
    nodeResolve({
        browser: true,
        preferBuiltins: false,
    }),
    commonjs(),
    ...(isProduction ? [terser()] : []),
];

export default [
    // Popup modules bundle
    {
        input: "src/popup/js/popup.js",
        output: {
            file: "src/popup/min/popup.bundle.js",
            format: "iife",
            name: "PaperMemoryPopup",
            sourcemap: !isProduction,
        },
        plugins: getPlugins(),
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
        plugins: getPlugins(),
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
        plugins: getPlugins(),
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
        plugins: getPlugins(),
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
        plugins: getPlugins(),
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
        plugins: getPlugins(),
    },
];

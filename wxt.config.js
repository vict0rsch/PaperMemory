import { defineConfig } from "wxt";
import path from "path";
import fs from "fs";
import { createRequire } from "module";
import { glob } from "glob";

const pkg = createRequire(import.meta.url)("./package.json");
const disableBrowserStartup = process.env.WXT_NO_BROWSER === "1";

function htmlIncludePlugin(basePath) {
    return {
        name: "html-include",
        transformIndexHtml: {
            order: "pre",
            handler(html, ctx) {
                // an included file may include others (paths stay relative to basePath)
                const expand = (text, depth = 0) =>
                    text.replace(/<!--=include\s+(.+?)\s+-->/g, (match, includePath) => {
                        const fullPath = path.resolve(basePath, includePath);
                        try {
                            const content = includePath.includes("*")
                                ? glob
                                      .sync(fullPath)
                                      .map((f) => fs.readFileSync(f, "utf-8"))
                                      .join("\n")
                                : fs.readFileSync(fullPath, "utf-8");
                            return depth < 5 ? expand(content, depth + 1) : content;
                        } catch {
                            console.warn(`Could not include file: ${fullPath}`);
                            return match;
                        }
                    });
                return expand(html);
            },
        },
    };
}

export default defineConfig({
    srcDir: "src",
    outDir: "dist",
    webExt: {
        disabled: disableBrowserStartup,
    },
    manifest: {
        name: "Paper Memory",
        version: pkg.version,
        description:
            "Automatically record papers and their codes from Arxiv, OpenReview & more! Organize your library with tags, links and quick notes.",
        homepage_url: "https://papermemory.org",
        icons: { 192: "icons/favicon-192x192.png" },
        commands: {
            _execute_action: {
                suggested_key: {
                    default: "Ctrl+Shift+E",
                    linux: "Ctrl+Shift+M",
                },
                description: "Open PaperMemory's Popup",
            },
            manualParsing: {
                suggested_key: { default: "Ctrl+Shift+P" },
                description:
                    "Manually trigger the parsing of a paper; only available if you have disabled auto-parsing in the menu",
            },
            downloadPdf: {
                suggested_key: { default: "Ctrl+Shift+S" },
                description:
                    "Download the pdf file for the current paper into your PaperMemoryStore",
            },
            defaultAction: {
                suggested_key: { default: "Alt+Shift+E" },
                description:
                    "Execute PaperMemory's default action for the current paper (if available)",
            },
        },
        action: {
            default_icon: "icons/favicon-192x192.png",
            default_title: "PaperMemory",
        },
        permissions: [
            "activeTab",
            "storage",
            "unlimitedStorage",
            "downloads",
            "downloads.open",
            "scripting",
        ],
        host_permissions: ["*://*/*"],
        web_accessible_resources: [
            {
                resources: ["data/*.json", "dark.css"],
                matches: ["<all_urls>"],
            },
        ],
        content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'",
        },
        browser_specific_settings: {
            gecko: {
                id: "{ff9cbac9-82ff-4e2b-96ae-ae0845aa85f5}",
            },
        },
    },
    hooks: {
        // Firefox MV2 only opens the popup with `_execute_browser_action`
        "build:manifestGenerated": (wxt, manifest) => {
            if (manifest.manifest_version !== 2) return;
            manifest.commands = Object.fromEntries(
                Object.entries(manifest.commands).map(([name, command]) => [
                    name === "_execute_action" ? "_execute_browser_action" : name,
                    command,
                ]),
            );
        },
    },
    zip: {
        excludeSources: [
            "extra/**",
            "docs/**",
            "test/**",
            "scripts/**",
            "CNAME",
            "mkdocs.yml",
            // Defense in depth: never ship credentials/keys in the sources zip
            // uploaded to AMO, even if one ends up in the workspace.
            "**/.env*",
            "**/keys.json",
            "**/credentials*",
            "**/*.pem",
            "**/*.key",
            "tmp/**",
            "coverage/**",
            "site/**",
            "**/*.log",
        ],
    },
    vite: ({ command }) => ({
        resolve: {
            alias: {
                "@pm": path.resolve("src"),
                "@pmu": path.resolve("src/shared/js/utils"),
            },
        },
        define: {
            __DEV__: JSON.stringify(command === "serve"),
        },
        plugins: [htmlIncludePlugin(path.resolve("src/popup/html"))],
    }),
});

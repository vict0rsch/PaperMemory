import { defineConfig } from "wxt";
import path from "path";
import fs from "fs";
import { glob } from "glob";

function htmlIncludePlugin(basePath) {
    return {
        name: "html-include",
        transformIndexHtml: {
            order: "pre",
            handler(html, ctx) {
                return html.replace(
                    /<!--=include\s+(.+?)\s+-->/g,
                    (match, includePath) => {
                        const fullPath = path.resolve(basePath, includePath);
                        try {
                            if (includePath.includes("*")) {
                                return glob
                                    .sync(fullPath)
                                    .map((f) => fs.readFileSync(f, "utf-8"))
                                    .join("\n");
                            }
                            return fs.readFileSync(fullPath, "utf-8");
                        } catch {
                            console.warn(`Could not include file: ${fullPath}`);
                            return match;
                        }
                    },
                );
            },
        },
    };
}

export default defineConfig({
    srcDir: "src",
    outDir: "dist",
    manifest: {
        name: "Paper Memory",
        version: "1.1.0",
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
                resources: ["data/*.json", "dark.css", "github-dark-dimmed.css"],
                matches: ["<all_urls>"],
            },
        ],
        content_security_policy: {
            extension_pages: "script-src 'self'; object-src 'self'",
        },
        browser_specific_settings: {
            gecko: {
                id: "papermemory@vict0rsch",
            },
        },
    },
    vite: () => ({
        resolve: {
            alias: {
                "@pm": path.resolve("src"),
                "@pmu": path.resolve("src/shared/js/utils"),
            },
        },
        define: {
            __DEV__: JSON.stringify(false),
        },
        plugins: [htmlIncludePlugin(path.resolve("src/popup/html"))],
    }),
});

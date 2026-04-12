import "@pm/shared/js/jquery-setup.js";
import "@pm/shared/css/loader.css";
import "@pm/content_scripts/content_script.css";
import { initContentScript } from "@pm/content_scripts/content_script.js";

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    cssInjectionMode: "manifest",

    async main() {
        await initContentScript();
    },
}); // end defineContentScript

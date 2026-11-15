import { resolve as pathResolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const baseURL = pathToFileURL(process.cwd() + "/").href;
const srcURL = new URL("src/", baseURL).href;

export async function resolve(specifier, context, defaultResolve) {
    // Handle @pmu/* imports
    if (specifier.startsWith("@pmu/")) {
        const relativePath = specifier.replace("@pmu/", "src/shared/js/utils/");
        const resolved = new URL(relativePath, baseURL).href;
        return {
            url: resolved,
            shortCircuit: true,
        };
    }

    // Handle @pm/* imports
    if (specifier.startsWith("@pm/")) {
        const relativePath = specifier.replace("@pm/", "src/");
        const resolved = new URL(relativePath, baseURL).href;
        return {
            url: resolved,
            shortCircuit: true,
        };
    }

    // Fall back to the default resolver for all other imports
    return defaultResolve(specifier, context);
}

export async function load(url, context, defaultLoad) {
    if (url.endsWith(".css")) {
        return {
            format: "module",
            source: "export default {};",
            shortCircuit: true,
        };
    }

    const loaded = await defaultLoad(url, context);
    if (!url.startsWith(srcURL) || !loaded.source) return loaded;
    // WXT defines import.meta.env at build time, Node does not: the extension's modules
    // that read it get an empty one (not Firefox, not an Agent access test build), on
    // their first line so that line numbers do not change
    const source = Buffer.from(loaded.source).toString();
    if (!source.includes("import.meta.env")) return loaded;
    return { ...loaded, source: `import.meta.env ??= {}; ${source}` };
}

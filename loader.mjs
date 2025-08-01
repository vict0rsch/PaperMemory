import { resolve as pathResolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const baseURL = pathToFileURL(process.cwd() + "/").href;

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

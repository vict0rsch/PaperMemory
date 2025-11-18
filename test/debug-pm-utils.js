// $ node --import ./register.mjs
// > const dpu = await import("./test/debug-pm-utils.js")

import { loadPaperMemoryUtils } from "./utilsForTests.js";
import { readJSON } from "./utilsForTests.js";

await loadPaperMemoryUtils();

export const testUrls = readJSON("./test/data/urls.json");

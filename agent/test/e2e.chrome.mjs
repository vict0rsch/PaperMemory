// Agent access end-to-end test on Chrome (cloakbrowser), not in `npm test`: node agent/test/e2e.chrome.mjs
// Builds an Agent access test build, installs the agent tools in a temp HOME for a temp --user-data-dir
// (Chrome then reads host manifests only from <user-data-dir>/NativeMessagingHosts), and runs Step 14's
// assertions. Prints OVERALL PASS or OVERALL FAIL.
import { launchPersistentContext } from "cloakbrowser/puppeteer";

import {
    build,
    check,
    finish,
    install,
    minimalEnv,
    rebuildProduction,
    runSuite,
    tempDir,
    tempHome,
} from "./e2e.common.mjs";

const home = tempHome();
const userDataDir = tempDir("pmu-");
const dirs = [home, userDataDir];
console.log(`Temp HOME ${home}, user data dir ${userDataDir}`);
let extensionDir;

const launch = () =>
    launchPersistentContext({
        headless: true,
        userDataDir,
        extensionPaths: [extensionDir],
        launchOptions: { env: minimalEnv(home) },
    });

// The extension's service worker; a worker target can close while it is attached, so retry.
async function serviceWorker(browser) {
    for (let attempt = 1; ; attempt++) {
        const target = await browser.waitForTarget(
            (t) => t.type() === "service_worker" && t.url().endsWith("/background.js"),
            { timeout: 15_000 },
        );
        try {
            const worker = await target.worker();
            await worker.evaluate(() => chrome.runtime.id);
            return { worker, extensionId: new URL(target.url()).host };
        } catch (err) {
            if (attempt === 3) throw err;
        }
    }
}

let browser;
try {
    extensionDir = build("chrome").dir;
    browser = await launch();
    const { worker, extensionId } = await serviceWorker(browser);
    install(home, ["--extension-id", extensionId, "--user-data-dir", userDataDir]);
    await worker.evaluate(() => chrome.storage.local.set({ agentAccess: { enabled: true } }));
    const driver = {
        home,
        get browser() {
            return browser;
        },
        optionsUrl: `chrome-extension://${extensionId}/options.html`,
        storage: async (key) =>
            (await serviceWorker(browser)).worker.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k]), key),
        close: () => browser.close(),
        relaunch: async () => {
            browser = await launch();
        },
    };
    dirs.push(await runSuite(driver));
} catch (err) {
    await check("setup", () => Promise.reject(err));
} finally {
    await browser?.close().catch(() => {});
    rebuildProduction("chrome");
}
finish(dirs);

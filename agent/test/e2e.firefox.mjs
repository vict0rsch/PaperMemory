// Agent access end-to-end test on Firefox Developer Edition, not in `npm test`: node agent/test/e2e.firefox.mjs
// Builds an Agent access test build, sideloads it unsigned in a temp profile, installs the agent tools in a
// temp HOME, and runs Step 14's assertions using only what MCP tools return (no storage inspection).
// Prints OVERALL PASS or OVERALL FAIL.
// Firefox reads native host manifests from the user's Application Support folder, which macOS derives
// from CFFIXED_USER_HOME, not HOME: with both set to the temp HOME, Firefox reads
// <temp HOME>/Library/Application Support/Mozilla/NativeMessagingHosts, never the real one.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import puppeteer from "puppeteer-core";

import {
    build,
    check,
    finish,
    install,
    minimalEnv,
    openOptions,
    rebuildProduction,
    runSuite,
    tempDir,
    tempHome,
} from "./e2e.common.mjs";

const FIREFOX = process.env.FIREFOX_PATH ?? "/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox";

const home = tempHome();
const profile = tempDir("pmp-");
const dirs = [home, profile];
console.log(`Temp HOME ${home}, profile ${profile}`);
const uuid = crypto.randomUUID();
let geckoId;

const launch = () =>
    puppeteer.launch({
        browser: "firefox",
        executablePath: FIREFOX,
        headless: true,
        userDataDir: profile,
        env: { ...minimalEnv(home), CFFIXED_USER_HOME: home },
        extraPrefsFirefox: {
            "xpinstall.signatures.required": false,
            "extensions.autoDisableScopes": 0,
            "extensions.webextOptionalPermissionPrompts": false,
            // a fixed moz-extension:// origin, to open the options page
            "extensions.webextensions.uuids": JSON.stringify({ [geckoId]: uuid }),
        },
    });

let browser;
try {
    const { dir, manifest } = build("firefox");
    geckoId = manifest.browser_specific_settings.gecko.id;
    // an unsigned XPI in the profile, which Developer Edition loads with signatures off
    fs.mkdirSync(path.join(profile, "extensions"));
    execFileSync("/usr/bin/zip", ["-q", "-r", path.join(profile, "extensions", `${geckoId}.xpi`), "."], { cwd: dir });
    // the installer writes a Firefox host manifest only where a Mozilla folder exists
    const mozilla = path.join(home, "Library", "Application Support", "Mozilla");
    fs.mkdirSync(mozilla, { recursive: true });
    install(home);
    const hostManifest = path.join(mozilla, "NativeMessagingHosts", "org.papermemory.agent.json");
    assert.deepEqual(JSON.parse(fs.readFileSync(hostManifest, "utf8")).allowed_extensions, [geckoId]);
    browser = await launch();
    const optionsUrl = `moz-extension://${uuid}/options.html`;
    // the options toggle cannot request a permission the test build declares under `permissions`
    const page = await openOptions(browser, optionsUrl);
    await page.evaluate(() => PMDebug.data.setStorage("agentAccess", { enabled: true }));
    await page.close();
    const driver = {
        home,
        get browser() {
            return browser;
        },
        optionsUrl,
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
    rebuildProduction("firefox");
}
finish(dirs);

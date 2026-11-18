// Store assets from the real build: one command rebuilds everything.
//   npm run build:chrome            (dist/chrome-mv3, the build that is recorded)
//   node scripts/store-assets/build.mjs [stills|videos|docs]   (default: stills + videos; docs is never in the default)
// Writes extra/store/*.png (screenshots, tile, marquee) and design-review/step7/out/*.{mp4,webm,gif}
// (promo, walkthrough, loops; not committed). `docs` writes unframed light PNGs + the 5 loop GIFs to docs/assets/. Needs the network (arxiv.org) and ffmpeg
// (dev-only prerequisite; /opt/homebrew/bin/ffmpeg or $FFMPEG). Headless, a fresh profile, seeded
// with the real papers of seed.json; the BibMatcher sources are mocked; nothing is downloaded.
import fs from "node:fs";
import * as L from "./lib.mjs";
import { capture, compose, docsAssets } from "./stills.mjs";
import { videos } from "./videos.mjs";

const what = process.argv[2] || "all";
if (what === "docs") {
    const missing = ["saved", "find", "cite", "export", "bibmatcher"]
        .map((n) => `${L.OUT}/loop-${n}.gif`)
        .filter((f) => !fs.existsSync(f));
    if (missing.length) {
        console.error(`docs needs these loop GIFs first:\n  ${missing.join("\n  ")}\nMake them with: node scripts/store-assets/build.mjs videos loop`);
        process.exit(1);
    }
}
const env = await L.start();
try {
    if (what === "all" || what === "stills") {
        await capture(env);
        await compose(env);
        console.log(`stills -> ${L.STORE}`);
    }
    if (what === "all" || what === "videos") {
        await videos(env, process.argv[3]);
        console.log(`videos -> ${L.OUT}`);
    }
    if (what === "docs") {
        await capture(env);
        await docsAssets(env);
        console.log(`docs -> ${L.ROOT}docs/assets`);
    }
} finally {
    await env.close();
}

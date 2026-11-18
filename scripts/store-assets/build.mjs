// Store assets from the real build: one command rebuilds everything.
//   npm run build:chrome            (dist/chrome-mv3, the build that is recorded)
//   node scripts/store-assets/build.mjs [stills|videos]   (default: both)
// Writes extra/store/*.png (screenshots, tile, marquee) and design-review/step7/out/*.{mp4,webm,gif}
// (promo, walkthrough, loops; not committed). Needs the network (arxiv.org) and ffmpeg
// (dev-only prerequisite; /opt/homebrew/bin/ffmpeg or $FFMPEG). Headless, a fresh profile, seeded
// with the real papers of seed.json; the BibMatcher sources are mocked; nothing is downloaded.
import * as L from "./lib.mjs";
import { capture, compose } from "./stills.mjs";
import { videos } from "./videos.mjs";

const what = process.argv[2] || "all";
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
} finally {
    await env.close();
}

# Store assets

Screenshots, promo tile, marquee, promo/walkthrough videos and short loops, recorded from the real build.

```sh
npm run build:chrome                          # dist/chrome-mv3 is what gets recorded
node scripts/store-assets/build.mjs [stills|videos]   # default: both
```

- `node scripts/store-assets/build.mjs docs` (not part of the default): unframed light-theme PNGs of the extension plus the five `loop-*.gif` (copied from `design-review/step7/out/`) in `docs/assets/`, for the docs site and Readme.
- `extra/store/`: `screenshot-1..5.png` (1280×800, + `-dark` variants of 2 and 4), `promo-tile-440x280.png`, `marquee-1400x560.png`, `listing.md` (store copy).
- `design-review/step7/out/` (not committed): `promo-1080p` and `walkthrough-1080p` (`.mp4` H.264 + `.webm`), `loop-*.webm` / `.gif`.
- Dev-only prerequisite: ffmpeg (`/opt/homebrew/bin/ffmpeg`, or set `$FFMPEG`). No npm dependency beyond the dev ones.
- Needs the network (arxiv.org). Headless Chromium, fresh profile, Memory seeded from `seed.json` (real papers); BibMatcher sources are mocked (`data.mjs`); nothing is downloaded, no sync token is used.

Files: `build.mjs` (entry), `stills.mjs` (captures + store images), `videos.mjs` (storyboards, recording, ffmpeg), `cues.mjs` (cursor, highlight ring, 1.4× camera), `lib.mjs` (browser, screencast), `frame.html` (drawn browser, caption band, cards).

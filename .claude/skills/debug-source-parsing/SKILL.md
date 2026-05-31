---
name: debug-source-parsing
description: Diagnose why a paper source fails to detect, parse, or store in PaperMemory by reproducing the failure inside cloakbrowser, isolating which pipeline stage broke, fixing the source, and verifying with the targeted storage test. Use when a source's storage test times out, a paper is not stored, or `parse` returns wrong/undefined fields.
---

# Debug Source Parsing

Workflow for debugging a single PaperMemory source (`src/shared/js/utils/sources/<source>.js`) when its detection, parsing, or storage fails. The driver is a real browser launched via cloakbrowser, because most sources block plain `node` `fetch` (Cloudflare, bot prevention).

Vocabulary (detect / parse / store, abstract URL, pdf URL, parsing order, completion meta) is defined in the repo-root `CONTEXT.md`.

## Background you need

- A visited page becomes a stored paper through a strict three-stage pipeline; each stage runs only if the previous succeeded:
    1. **detect** — `isSourceURL(url)` / `isPaper(url)` decide the URL belongs to a source. If this fails, `parse` never runs.
    2. **parse** — the source's `parse(url)` builds metadata, usually via `fetchDom(absURL)`.
    3. **store** — `addOrUpdatePaper({ store: true })` persists it, then the content script injects the **completion meta** `meta[name='pm-complete-secret-html']`.
- Source storage tests live in `test/test-storage.js`. They visit each source's **abstract** and **pdf** URLs (from `test/data/urls.json`) and assert the paper was stored. `test/browser.js` → `visitPaperPage` waits ~15s for the completion meta; on timeout it screenshots the page to `tmp/` and throws `Timeout for <url> -> Screenshot ...`.
- **A timeout only means "not stored" — it does not pinpoint the stage.** The failure could be detect, parse, or store. Don't assume `parse`.
- Each source is visited in **both parsing orders**: `abs;pdf` (abstract first) and `pdf;abs` (pdf first).
- `fetchDom` (`src/shared/js/utils/parsers.js`) returns an **empty DOM on a non-OK response** (no throw). The throw then happens later on `dom.getElementById(...).innerText`, so a wrong/blocked URL surfaces as a timeout, not a fetch error.
- Always `npm run build:chrome` before running browser tests — they load the built `dist/chrome-mv3`.

## Workflow

```
- [ ] 1. Reproduce: run the targeted storage test for the one source
- [ ] 2. Read clues: order(s) failed + tmp/ screenshot + console 404s + left-open page
- [ ] 3. Hypothesize: map clue -> failing stage/cause
- [ ] 4. Confirm in cloakbrowser: reproduce the offending fetch/DOM step
- [ ] 5. Fix the source (minimal, surgical)
- [ ] 6. Verify: re-run the targeted test in both orders, then clean up
```

### 1. Reproduce

Scope the run to the failing source so it takes seconds, not minutes:

```bash
onlySources=<source> npm run test:file -- test/test-storage.js
```

Note which order fails (`abs;pdf` vs `pdf;abs`) and the exact URL in the timeout message. The test runs with `keepOpen`, so the failing page stays open for inspection.

### 2. Read clues

- **Which order(s) failed** — one order vs both is the strongest signal (see step 3).
- **The screenshot** referenced in the timeout (`tmp/screenshot_*.jpg`): a normally rendered page, a bot-wall/challenge, or a blank page are three different stories.
- **Console output**: a `Failed to load resource: ... status of 404` means a fetch inside `parse` hit a wrong URL.
- **The left-open page**: open its DevTools and inspect how far the pipeline got — was the source even detected, did `parse` throw, did a `fetch` fail. Inspect extension state via `PMDebug` (see `test/browser.js` helpers for the shape).

### 3. Hypothesize (clue -> cause)

| Clue | Likely stage & cause |
| --- | --- |
| Fails in **one** order only | **parse** — the URL conversion for the *other* page is wrong. Inspect `absURL` / `pdfLink` / `toAbs` / `toPDF`. |
| Fails in **both** orders, page **rendered fine** | **parse** — a selector/field the publisher changed, so `dom.getElementById(...)`/`getElementsByTagName(...)` returns null and throws (or returns a wrong/`undefined` field). |
| Fails in **both** orders, page is a **challenge/blank** | **detect or fetch blocked** — bot-wall. Confirm with a visible browser; the source may need the `botPrevention` flag in `urls.json`. |
| Stored, but a field is wrong/`undefined` | **parse** — the extraction logic for that field; check against the live DOM. |

### 4. Confirm in cloakbrowser

Reproduce the suspect fetch from a real browser page. `parse`/`fetchDom` run in the content script, which shares the page's **origin**, so a `page.evaluate(fetch)` reproduces the same status/CORS behavior. Write a throwaway script and run it with the repo's loader:

```js
// test/tmp-debug-<source>.js
import { makeBrowser } from "./browser.js";

const url = "<failing-url>";
const candidates = {
    current: /* buggy derivation copied from parse() */ "",
    fixed: /* proposed derivation */ "",
};

const browser = await makeBrowser(true); // headless; pass false to watch
const page = (await browser.pages())[0];
await page.goto(url).catch(() => {});

for (const [label, u] of Object.entries(candidates)) {
    const res = await page.evaluate(async (u) => {
        const r = await fetch(u);
        const text = r.ok ? await r.text() : "";
        const dom = new DOMParser().parseFromString(text, "text/html");
        return { u, status: r.status, ok: r.ok, hasKeyEl: !!dom.getElementById("bibtex") };
    }, u);
    console.log(label, res);
}
await browser.close();
```

```bash
node --import ./register.mjs test/tmp-debug-<source>.js
```

Adjust `hasKeyEl` to whatever element/field `parse` depends on. Confirm the buggy candidate 404s / lacks the element and the fixed one returns 200 with it.

### 5. Fix

Make the **smallest** change to the failing stage — usually a derivation in `parse` (or `toAbs`/`toPDF`) or a single selector. Prefer mirroring an existing correct helper in the same file over inventing new logic. Touch only the broken line(s).

### 6. Verify and clean up

```bash
npm run build:chrome && onlySources=<source> npm run test:file -- test/test-storage.js
```

All cases must pass in **both** orders. Then delete the throwaway script (`test/tmp-debug-<source>.js`). Leave `tmp/` screenshots alone (test artifacts).

## Notes

- Set `headless` to `false` (e.g. `HEADLESS=0` for `test/manual-open-urls-browser.js`, or `makeBrowser(false)`) when you need to watch the page interactively.
- Sources flagged `botPrevention` in `urls.json` are skipped by the automated test — debug those manually with a visible browser.

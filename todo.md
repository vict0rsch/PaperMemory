# Out-of-scope / follow-up (paper sources refactor)

Deferred from the paper-source registry work — **behavior changes** or larger refactors not bundled in that PR.

1. **Wiley** — possible key overwrite bug when merging parsed fields (needs investigation + test).
2. **Science** — `publisher` may be undeclared or inconsistent for some parsed papers.
3. **IOP** — `m513` (or similar) ID leak / wrong venue suffix edge case.
4. **`parsers.js` split** — further split into `fetchHelpers.js` / `parseHelpers.js` (shared HTTP + DOM helpers only).
5. **`isPaper` return shape** — redesign if callers should get structured metadata instead of ad-hoc fields.
6. **Per-source UI hooks** — arxiv / website branches scattered across `templates.js`, `popup.js`, `handlers.js`, `options.js`, `background.js`, `content_script.js`; could align with `getSource(...)` later.
7. **Website test fixture** — add a `website` entry to `test/data/urls.json` so storage tests cover the generic HTML path.
8. **`state.papers` global reads** — further removals beyond `getDisplayId(paper)` where display logic still reaches into global state.
9. **Puppeteer integration tests** — `test-duplicates`, `test-storage`, and `test-sync` are run for smoke signal; full green is not a merge gate (live-site fragility predates the source registry work).

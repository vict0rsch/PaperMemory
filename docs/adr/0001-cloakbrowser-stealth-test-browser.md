# Use cloakbrowser as the headless browser for integration tests

The test suite drives a real Chrome instance with the unpacked extension loaded to
visit live publisher pages. The previous stack (`puppeteer-extra` +
`puppeteer-extra-plugin-stealth`) injects JavaScript patches that antibot systems
increasingly detect — causing intermittent failures on Cloudflare-fronted and other
bot-walled academic publisher pages. We replaced it with
[cloakbrowser](https://github.com/CloakHQ/cloakbrowser), which applies stealth at
the Chromium C++ source level rather than via JavaScript injection, making the patches
transparent to bot detection.

## Considered options

- **Playwright mode** (`import { launch } from 'cloakbrowser'`) — the recommended
  cloakbrowser API, better reCAPTCHA resistance. Rejected: would require rewriting all
  test helpers that assume the Puppeteer `Browser`/`Page` API (`browser.pages()`,
  `page.evaluate`, `waitForSelector`, `screenshot`, etc.).
- **puppeteer-extra-plugin-stealth** (status quo) — easy but config-level: patches
  break on every Chrome update and are detectable themselves.

## Consequences

- A custom Chromium binary (~200MB) auto-downloads to `~/.cloakbrowser` on first use
  per platform. CI caches it via `actions/cache` keyed on `package-lock.json`.
- On macOS the binary trails one Chromium major version behind linux/windows (145 vs
  146 as of the initial adoption). This has not caused test divergence.
- `CHROME_PATH` / the system-installed Chrome is no longer used for tests.
- `--disable-web-security` and `--disable-gpu` remain in the test args for now;
  they partially undermine stealth and are candidates for removal once stability is
  confirmed.

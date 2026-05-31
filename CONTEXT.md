# PaperMemory

PaperMemory is a browser extension that recognizes academic papers on publisher pages and stores their metadata. This glossary fixes the vocabulary for how a visited page becomes a stored paper.

## Language

### Ingestion pipeline

**Source**:
A supported publisher whose pages PaperMemory understands, implemented as a class in `src/shared/js/utils/sources/`.
_Avoid_: provider, site, publisher (when referring to the code object)

**Detect**:
Deciding that a visited URL belongs to a **Source** (`isSourceURL` / `isPaper`), which gates whether parsing runs at all.
_Avoid_: match, recognize, identify

**Parse**:
A **Source**'s `parse(url)` building a paper's metadata, typically by fetching the **Abstract URL**'s DOM or fetching a Bibtex citation file.
_Avoid_: scrape, extract, read

**Store**:
Persisting the parsed paper (`addOrUpdatePaper` with `store: true`); the final stage, after which the **Completion meta** is injected.
_Avoid_: save, commit, persist (informally)

### Page shapes & signals

**Abstract URL**:
A **Source** HTML page describing the paper (metadata, bibtex), as opposed to the PDF file.
_Avoid_: landing page, html page

**PDF URL**:
The direct link to a paper's PDF file.
_Avoid_: download link, file url

**Parsing order**:
The sequence in which a paper's two URLs are visited during the storage test — `abs;pdf` (abstract first) or `pdf;abs` (pdf first).
_Avoid_: direction, mode

**Completion meta**:
The `meta[name='pm-complete-secret-html']` element the content script injects once a paper is **Store**d, used by the test harness to detect success.
_Avoid_: done flag, marker

## Relationships

- A **Source** owns the logic to **Detect**, **Parse**, and convert between an **Abstract URL** and a **PDF URL** (`toAbs` / `toPDF`).
- **Detect** → **Parse** → **Store** is a strict pipeline: each stage only runs if the previous succeeded.
- A **Store** triggers exactly one **Completion meta**; its absence (a test timeout) means the pipeline stopped at **Detect**, **Parse**, or **Store** — not necessarily **Parse**.
- The storage test visits both **Abstract URL** and **PDF URL** in each **Parsing order**; an order-dependent failure implicates the **Abstract URL**↔**PDF URL** conversion.

## Example dialogue

> **Dev:** "The PMLR storage test times out — is `parse` broken?"
> **Maintainer:** "A timeout only tells you the **Completion meta** never appeared, i.e. the paper wasn't **Store**d. It could have failed to **Detect** or **Parse**. Here it failed only in `pdf;abs` **Parsing order**, so `parse` derived a bad **Abstract URL** from the **PDF URL**."

## Flagged ambiguities

- "parse or detect" was used as if interchangeable — resolved: **Detect**, **Parse**, and **Store** are distinct pipeline stages, and a storage-test timeout does not pinpoint which one failed.

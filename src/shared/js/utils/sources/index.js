import { AclSource } from "./acl.js";
import { AcmSource } from "./acm.js";
import { AcsSource } from "./acs.js";
import { AipSource } from "./aip.js";
import { ApsSource } from "./aps.js";
import { ArxivSource } from "./arxiv.js";
import { BiorxivSource } from "./biorxiv.js";
import { CellSource } from "./cell.js";
import { ChemrxivSource } from "./chemrxiv.js";
import { CVFSource } from "./cvf.js";
import { FrontiersSource } from "./frontiers.js";
import { HalSource } from "./hal.js";
import { IeeeSource } from "./ieee.js";
import { IhepSource } from "./ihep.js";
import { IjcaiSource } from "./ijcai.js";
import { IopSource } from "./iop.js";
import { JmlrSource } from "./jmlr.js";
import { MdpiSource } from "./mdpi.js";
import { NatureSource } from "./nature.js";
import { NeuripsSource } from "./neurips.js";
import { OpenReviewSource } from "./openreview.js";
import { OupSource } from "./oup.js";
import { PlosSource } from "./plos.js";
import { PmcSource } from "./pmc.js";
import { PMLRSource } from "./pmlr.js";
import { PnasSource } from "./pnas.js";
import { RscSource } from "./rsc.js";
import { ScienceSource } from "./science.js";
import { SciencedirectSource } from "./sciencedirect.js";
import { SpringerSource } from "./springer.js";
import { WileySource } from "./wiley.js";
import { WebsiteSource } from "./website.js";

/**
 * Single source of truth for all paper sources. Add a new source here (once)
 * after creating its module file. Order is irrelevant: patterns across sources
 * are mutually exclusive (enforced by the "Source Pattern Mutual Exclusion"
 * test in test/test-meta.js).
 *
 * `WebsiteSource` is the universal fallback and is NOT dispatched via
 * `sourceFromIs` / `matchUrl`; it is invoked explicitly in paper.js.
 */
const ALL_SOURCES = [
    AclSource,
    AcmSource,
    AcsSource,
    AipSource,
    ApsSource,
    ArxivSource,
    BiorxivSource,
    CellSource,
    ChemrxivSource,
    CVFSource,
    FrontiersSource,
    HalSource,
    IeeeSource,
    IhepSource,
    IjcaiSource,
    IopSource,
    JmlrSource,
    MdpiSource,
    NatureSource,
    NeuripsSource,
    OpenReviewSource,
    OupSource,
    PlosSource,
    PmcSource,
    PMLRSource,
    PnasSource,
    RscSource,
    ScienceSource,
    SciencedirectSource,
    SpringerSource,
    WileySource,
    WebsiteSource,
];

const DISPATCH_SOURCES = ALL_SOURCES.filter((S) => S !== WebsiteSource);

const BY_NAME = Object.fromEntries(ALL_SOURCES.map((S) => [S.name, S]));

/** @param {string} name */
export const getSource = (name) => BY_NAME[name];

export const allSources = () => [...ALL_SOURCES];

export const knownPaperPages = Object.fromEntries(
    ALL_SOURCES.map((S) => [S.name, { patterns: S.patterns, name: S.displayName }]),
);

/** @param {Record<string, boolean>} is from isPaper() */
export const sourceFromIs = (is) => {
    for (const S of DISPATCH_SOURCES) {
        if (is[S.name]) return S;
    }
    return null;
};

/** @param {string} url */
export const matchUrl = (url) => {
    for (const S of DISPATCH_SOURCES) {
        if (S.matches(url)) return S;
    }
    return null;
};

/** Lowercase source names used for fuzzy de-duplication (arxiv, biorxiv). */
export const preprintSources = DISPATCH_SOURCES.filter((S) => S.isPreprint).map((S) =>
    S.name.toLowerCase(),
);

/**
 * Retained for consumers (e.g. urls.js) that key into `is` by string name.
 * Order is not semantically meaningful — patterns are mutually exclusive.
 */
export const SOURCE_DISPATCH_ORDER = DISPATCH_SOURCES.map((S) => S.name);

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
import { IhepSource } from "./ihep.js";
import { IjcaiSource } from "./ijcai.js";
import { IeeeSource } from "./ieee.js";
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
import { SciencedirectSource } from "./sciencedirect.js";
import { ScienceSource } from "./science.js";
import { SpringerSource } from "./springer.js";
import { WebsiteSource } from "./website.js";
import { WileySource } from "./wiley.js";

/** Key order in knownPaperPages (must match former config.js for stable iteration). */
const CONFIG_KEY_ORDER = [
    "acl",
    "acm",
    "aps",
    "acs",
    "arxiv",
    "biorxiv",
    "cell",
    "chemrxiv",
    "cvf",
    "frontiers",
    "hal",
    "ihep",
    "ijcai",
    "ieee",
    "iop",
    "jmlr",
    "mdpi",
    "nature",
    "neurips",
    "openreview",
    "oup",
    "plos",
    "pmc",
    "pmlr",
    "pnas",
    "rsc",
    "science",
    "sciencedirect",
    "springer",
    "website",
    "wiley",
    "aip",
];

/** First match wins for makePaper / parseIdFromUrl (must match former cascades). */
export const SOURCE_DISPATCH_ORDER = [
    "arxiv",
    "neurips",
    "cvf",
    "openreview",
    "biorxiv",
    "pmlr",
    "acl",
    "pnas",
    "nature",
    "acs",
    "iop",
    "jmlr",
    "pmc",
    "ijcai",
    "acm",
    "ieee",
    "springer",
    "aps",
    "wiley",
    "sciencedirect",
    "science",
    "frontiers",
    "ihep",
    "plos",
    "rsc",
    "mdpi",
    "oup",
    "hal",
    "chemrxiv",
    "cell",
    "aip",
];

const BY_NAME = {
    acl: AclSource,
    acm: AcmSource,
    aps: ApsSource,
    acs: AcsSource,
    arxiv: ArxivSource,
    biorxiv: BiorxivSource,
    cell: CellSource,
    chemrxiv: ChemrxivSource,
    cvf: CVFSource,
    frontiers: FrontiersSource,
    hal: HalSource,
    ihep: IhepSource,
    ijcai: IjcaiSource,
    ieee: IeeeSource,
    iop: IopSource,
    jmlr: JmlrSource,
    mdpi: MdpiSource,
    nature: NatureSource,
    neurips: NeuripsSource,
    openreview: OpenReviewSource,
    oup: OupSource,
    plos: PlosSource,
    pmc: PmcSource,
    pmlr: PMLRSource,
    pnas: PnasSource,
    rsc: RscSource,
    science: ScienceSource,
    sciencedirect: SciencedirectSource,
    springer: SpringerSource,
    website: WebsiteSource,
    wiley: WileySource,
    aip: AipSource,
};

/** @param {string} name */
export const getSource = (name) => BY_NAME[name];

export const allSources = () => CONFIG_KEY_ORDER.map((k) => BY_NAME[k]);

export const knownPaperPages = Object.fromEntries(
    CONFIG_KEY_ORDER.map((k) => {
        const S = BY_NAME[k];
        return [k, { patterns: S.patterns, name: S.displayName }];
    }),
);

/** @param {Record<string, boolean>} is from isPaper() */
export const sourceFromIs = (is) => {
    for (const name of SOURCE_DISPATCH_ORDER) {
        if (is[name]) return BY_NAME[name];
    }
    return null;
};

/** @param {string} url */
export const matchUrl = (url) => {
    for (const name of SOURCE_DISPATCH_ORDER) {
        const S = BY_NAME[name];
        if (S.matches(url)) return S;
    }
    return null;
};

/** Lowercase source names used for fuzzy de-duplication (arxiv, biorxiv). */
export const preprintSources = SOURCE_DISPATCH_ORDER.filter(
    (name) => BY_NAME[name].isPreprint,
).map((n) => n.toLowerCase());

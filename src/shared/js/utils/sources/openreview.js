import { BasePaperSource } from "./base.js";
import {
    cleanStr,
    dedent,
    firstNonStopLowercase,
    log,
    logError,
} from "@pmu/functions.js";
import { bibtexToObject, bibtexToString } from "@pmu/bibtexParser.js";
import {
    extractAPIv2ContentValue,
    getOpenReviewForumJSON,
    getOpenReviewNoteJSON,
    makeOpenReviewBibTex,
} from "@pmu/parsers.js";

export class OpenReviewSource extends BasePaperSource {
    static name = "openreview";
    static displayName = "OpenReview";
    static patterns = [
        "openreview.net/forum",
        "openreview.net/pdf",
        "openreview.net/attachment",
    ];

    /** @type {Record<string, string>} organizer key → display abbreviation */
    static confOverrides = {
        "robot-learning": "CoRL",
        ijcai: "IJCAI",
    };

    static async urlToId(url, ctx) {
        const OR_id = url.match(/id=\w+/)[0].replace("id=", "");
        return ctx.findPaperForProperty(ctx.papers, "openreview", OR_id);
    }

    static async parse(url) {
        const noteJson = await getOpenReviewNoteJSON(url);
        const forumJson = await getOpenReviewForumJSON(url);

        if (noteJson.status === 403 && noteJson.name === "ForbiddenError") {
            logError(
                dedent(`Error parsing OpenReview url ${url}.
            Most likely because this entry is protected and you do not have the rights to access it.

            1/ Make sure you are logged in.
            2/ Alternatively, this may be due to OpenReview changing the visibility of this paper.

            Try accessing this URL manually to make sure.`),
            );
            throw Error(noteJson.message);
        } else if (noteJson.status === 404 && noteJson.name === "NotFoundError") {
            logError(dedent(`Error parsing OpenReview url ${url}.`));
            throw Error(noteJson.message);
        }

        var paper = noteJson.notes[0];
        let isV2 = false;
        var forum = forumJson.notes;

        ({ isV2, paper } = extractAPIv2ContentValue(paper));
        log("paper", paper);
        const title = paper.content.title;
        const author = (
            paper.content.authors ||
            paper.content.authors?.value || ["Anonymous"]
        ).join(" and ");
        const bibtex = bibtexToString(
            paper.content._bibtex || makeOpenReviewBibTex(paper, url),
        );
        const bibObj = bibtexToObject(bibtex);
        const key = bibObj.citationKey;
        const year = bibObj.year;

        let pdfLink;
        if (paper.pdf) {
            pdfLink = `https://openreview.net/pdf?id=${paper.id}`;
        } else {
            if (paper.html) {
                pdfLink = paper.html.replace("/forum?id=", "/pdf?id=");
            } else {
                pdfLink = url.replace("/forum?id=", "/pdf?id=");
            }
        }

        const confParts = paper.invitation?.split("/") || paper.domain.split("/");
        let organizer = confParts[0].split(".")[0];
        let event = confParts
            .slice(1)
            .join("/")
            .split("-")[0]
            .replaceAll("/", " ")
            .replace(" Conference", "");

        let overrideOrg = organizer;
        let overridden = false;
        if (OpenReviewSource.confOverrides.hasOwnProperty(organizer)) {
            overrideOrg = OpenReviewSource.confOverrides[organizer];
            overridden = true;
        }
        if (overridden) {
            event = event.replace(overrideOrg, "");
            organizer = overrideOrg;
        }

        const conf = `${organizer} ${event}`
            .replace(/ \d\d\d\d/g, "")
            .replace(/\s\s+/g, " ");
        const id = `OR-${organizer}-${year}_${paper.id}`;

        let candidates, decision, note;

        candidates = isV2
            ? forum.filter((r) => r?.content?.recommendation?.value)
            : forum.filter(
                  (r) =>
                      [
                          "Final Decision",
                          "Paper Decision",
                          "Acceptance Decision",
                      ].indexOf(r?.content?.title) > -1,
              );
        let venue = "";
        if (candidates && candidates.length > 0) {
            decision = isV2
                ? candidates[0].content.recommendation.value
                : candidates[0].content.decision;
            decision = decision
                .split(" ")
                .map((v, i) => {
                    return i === 0 ? cleanStr(v) + "ed" : v;
                })
                .join(" ");
            note = `${decision} @ ${conf} (${year})`;
            if (decision.toLowerCase().indexOf("rejected") < 0) {
                venue = conf;
            }
        }

        if (author !== "Anonymous" && !venue && bibObj.booktitle) {
            note = `Accepted @ ${bibObj.booktitle}`;
            venue = bibObj.booktitle;
        }
        if (author === "Anonymous" && decision != "Rejected") {
            note = `Under review @ ${conf} (${year}) (${new Date().toLocaleDateString()})`;
        }

        return { author, bibtex, id, key, note, pdfLink, title, venue, year };
    }

    static toAbs(paper) {
        return paper.pdfLink.replace("/pdf?", "/forum?");
    }

    static toPDF(paper) {
        return paper.pdfLink.replace("/forum?", "/pdf?");
    }

    static async venue(paper) {
        let venue = BasePaperSource.extractVenueFromNote(paper);
        if (!venue) {
            venue = (await OpenReviewSource.parse(paper.pdfLink, null, {})).venue;
        }
        return venue;
    }
}

import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const SKILL = new URL("../skill/SKILL.md", import.meta.url);

test("SKILL.md has frontmatter with name and description", () => {
    const text = fs.readFileSync(SKILL, "utf8");
    const match = text.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(match, "frontmatter present");
    const lines = match[1].split("\n");
    assert.ok(lines.includes("name: papermemory"));
    assert.ok(lines.some((l) => l.startsWith("description: ")));
});

test("SKILL.md carries the Tag rename hint verbatim", () => {
    const text = fs.readFileSync(SKILL, "utf8");
    assert.ok(
        text.includes(
            "The Project tag is fixed. To rename it on existing papers, filter the Memory with `t: <tag>` and edit each paper's tags (press `e` on a focused paper), or export the Memory as JSON (Options → Data Management), replace the tag, and import it back. Agents keep applying the original tag to new papers.",
        ),
    );
});

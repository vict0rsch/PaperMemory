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
            "The Project tag is fixed. You can rename or merge it in the options page, under Tags & matching → Tags. Agents keep applying the Project's original tag to new papers.",
        ),
    );
});

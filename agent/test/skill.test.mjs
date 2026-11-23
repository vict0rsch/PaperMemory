import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), "utf8");
const skill = (name) => read(`../skills/${name}/SKILL.md`);

for (const name of ["papermemory", "papermemory-setup"]) {
    test(`${name}/SKILL.md has frontmatter with its name and a description`, () => {
        const match = skill(name).match(/^---\n([\s\S]*?)\n---\n/);
        assert.ok(match, "frontmatter present");
        const lines = match[1].split("\n");
        assert.ok(lines.includes(`name: ${name}`));
        assert.ok(lines.some((l) => l.startsWith("description: ")));
    });
}

test("papermemory/SKILL.md carries the Tag rename hint verbatim", () => {
    assert.ok(
        skill("papermemory").includes(
            "The Project tag is fixed. You can rename or merge it in the options page, under Tags & matching → Tags. Agents keep applying the Project's original tag to new papers.",
        ),
    );
});

test("papermemory/SKILL.md sends connection problems to the papermemory-setup skill", () => {
    assert.match(skill("papermemory"), /use the `papermemory-setup` skill/);
});

test("papermemory-setup/SKILL.md links the guide, keeps the user in charge, and quotes real messages", () => {
    const text = skill("papermemory-setup");
    for (const line of [
        "https://papermemory.org/agents/",
        "~/.papermemory/bin/papermemory-mcp libraries",
        "Never run `install` or `uninstall`, and never edit an agent's configuration, without the user's explicit OK.",
    ]) {
        assert.ok(text.includes(line), line);
    }
    // Each message it quotes, as the agent tools and the options page show it.
    const code = [
        "../src/libraries.mjs",
        "../src/serve.mjs",
        "../../src/background/agentAccess.js",
        "../../src/entrypoints/options/index.html",
    ]
        .map(read)
        .join("\n")
        .replace(/\s+/g, " ");
    for (const message of [
        "no PaperMemory library is connected",
        "several PaperMemory libraries are connected, name one: ",
        "PaperMemory's install is incomplete (~/.papermemory/salt is missing)",
        "Run `npx -y papermemory-mcp@latest install`",
        "Update the PaperMemory extension",
        "the user must pair it again",
        "Agent access is off in PaperMemory's options",
        "access to PaperMemory. Do not ask again unless the user says otherwise",
        "Stop and ask the user before doing anything else with PaperMemory",
        "The user denied a PaperMemory pairing request less than a minute ago",
        "Too many PaperMemory pairing requests are waiting for the user",
        "Enable Agent access",
        "PaperMemory agent tools not installed",
        "PaperMemory agent tools outdated",
        "PaperMemory is older than the agent tools",
        "Permission refused",
        "Paired clients",
    ]) {
        assert.ok(text.includes(message), `the skill quotes: ${message}`);
        assert.ok(code.includes(message), `the code says: ${message}`);
    }
});

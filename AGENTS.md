# 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- Read `system-architecture.md` first to understand repository structure and boundaries before broad grepping/searching across the entire codebase.
- If the user's request is too vague or short or unclear, use the "grill-with-docs" skill to clarify the request.
- Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

# 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

# 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

# 4. Plans Must Be Executable By Small Models

**Every plan must be clear, exhaustive, imperative, and verifiable.**

Hard rules when writing a plan so a small model can follow literally without guessing intent:
- Use numbered imperative steps (`Do X`, `Then do Y`), never vague goals.
- Make the plan exhaustive for the requested scope: no hidden steps, no implicit work.
- State assumptions and prerequisites explicitly before execution steps.
- For each step, define an objective verification check (test, command, observable output, or diff condition).
- Define concrete completion criteria so an agent can truthfully decide "done" vs "not done."
- Use language that a small model can follow literally without guessing intent.

# 5. Agent Entry Point (Shared Across Providers)

Provider-specific rule files are the source of truth for cross-provider mirroring:

- `.cursor/rules/mirror-providers.mdc`
- `.claude/rules/mirror-providers.md`

# 6. Be safe, be consistent

**Security is a hard gate. A task is not done until this section is satisfied.**

Always perform a security pass while reading and writing code:
- Treat secrets exposure as critical (API keys, tokens, passwords, credentials, private keys, webhook URLs, `.env` contents).
- Never hardcode secrets in code, tests, docs, examples, commits, PR text, logs, or terminal snippets.
- Do not move secrets into "safe-looking" files (fixtures, sample configs, scripts). If a value is sensitive, keep it out.
- If you detect a leak or high-risk pattern, stop and warn clearly. Do this even when it is outside the original request.

Before declaring completion, run a critical consistency review of your own work:
- Verify the result is consistent with sections 1-4: explicit assumptions, minimal scope, and surgical edits only.
- Confirm every changed line traces directly to the user's request (no speculative features, no side-quest refactors).
- Check that your naming, structure, and behavior align with existing project language and conventions.
- Check consistency with documentation produced by the `/grill-with-docs` process (`CONTEXT.md`, `CONTEXT-MAP.md`, and relevant ADRs). If code and docs disagree, flag it explicitly.
- Challenge your own decisions: "Where did I overreach?" and "What part is inconsistent with the stated principles?"
- If inconsistencies remain, report them explicitly and propose the smallest concrete fix.

Completion rule:
- Do not present the task as complete until all checks are done: (1) secret/leak/security scan, (2) critical consistency self-review, (3) consistency check against `/grill-with-docs` artifacts (`CONTEXT.md`, `CONTEXT-MAP.md`, relevant ADRs).
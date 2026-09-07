# Skills inventory (`.agents/skills`)

Every real (non-symlink) directory under `.agents/skills` is listed here. Symlinks are not
inventoried — they point at a real copy in another tree, and `skillTrees.test.ts` already proves
each one resolves.

A third-party skill stays only while something in the repo routes to it. `skillTrees.test.ts` fails
when a real directory is missing from this table or a listed one is gone. Reinstall a deleted one
from its upstream when a playbook row needs it.

The routing file named in a third-party row is read by the test and grepped for the skill's name, so
"it seemed useful" is not a reason — name the file that sends work to it.

| Skill                              | Origin                           | Why we keep it                                                                                       |
| ---------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `UX-to-Prompt`                     | third-party, upstream unrecorded | routed from `.claude/skills/IA-Review/SKILL.md` (and `UX-Audit`) once a remediation plan is approved |
| `codebase-design`                  | Matt Pocock skills               | routed from `.agents/skills/improve-codebase-architecture/SKILL.md` for the architecture vocabulary  |
| `domain-modeling`                  | Matt Pocock skills               | routed from `docs/agents/domain.md` when the glossary has a real gap                                 |
| `grilling`                         | Matt Pocock skills               | routed from `.agents/skills/improve-codebase-architecture/SKILL.md` to walk a design tree            |
| `improve-codebase-architecture`    | Matt Pocock skills               | routed from `.claude/skills/codebase-health/references/churn-hotspots.md`, `ship-it` and `/simplify` |
| `launch-readiness-triage`          | ours                             | PLAYBOOK-adjacent: daily P0/P1 and the Friday findings review                                        |
| `quality-finding-lifecycle`        | ours                             | finding identity, severity and closure proof for every audit skill                                   |
| `role-journey-ux-audit`            | ours                             | PLAYBOOK § 6 — role-scoped, multi-viewport UX walk                                                   |
| `supabase-health-drift-audit`      | ours                             | scheduled read-only Supabase drift and posture audit                                                 |
| `supabase-postgres-best-practices` | Supabase agent skills            | routed from `.claude/skills/debugging-patterns/SKILL.md` for slow-query and index symptoms           |
| `vercel-composition-patterns`      | Vercel Labs agent skills         | routed from `docs/PLAYBOOK.md` § 2 for component APIs that grow boolean props                        |
| `vercel-react-best-practices`      | Vercel Labs agent skills         | routed from `docs/PLAYBOOK.md` § 2 for rendering, data fetching and bundle cost                      |
| `web-design-guidelines`            | Vercel Labs agent skills         | routed from `docs/PLAYBOOK.md` § 6 for a Web Interface Guidelines pass on rendered UI                |

## What was removed, and why

On 2026-09-07 thirty-eight third-party directories were deleted: `ask-matt`, `claude-handoff`,
`code-review`, `design-an-interface`, `diagnosing-bugs`, `edit-article`,
`git-guardrails-claude-code`, `grill-me`, `grill-with-docs`, `handoff`, `implement`, `loop-me`,
`migrate-to-shoehorn`, `obsidian-vault`, `prototype`, `qa`, `request-refactor-plan`, `research`,
`resolving-merge-conflicts`, `review-fix`, `scaffold-exercises`, `setup-matt-pocock-skills`,
`setup-pre-commit`, `simplify-review`, `tdd`, `teach`, `to-issues`, `to-prd`, `triage`,
`ubiquitous-language`, `wayfinder`, `wizard`, `write-a-skill`, `writing-beats`, `writing-concisely`,
`writing-fragments`, `writing-great-skills`, `writing-shape`.

Nothing in the repo routed to any of them except their own router (`ask-matt`) and installer
(`setup-matt-pocock-skills`), and Codex loaded all of their descriptions on every turn. Several
duplicated a surface we already use: `code-review` against the built-in `/code-review` that
`docs/PLAYBOOK.md` § 4 and `ship-pr` invoke, `review-fix` / `simplify-review` against `/simplify` and
`/harden`, `claude-handoff` / `handoff` against the harness handoff skill, `tdd` against
`superpowers:test-driven-development`, and the three grill variants against
`superpowers:brainstorming`.

A mention counts as routing only when it names the thing as a skill — `skills/<name>`, the name in
backticks, or `/<name>` as a command. A bare word (`qa`, `triage`, `implement`, `research`) is prose,
and a path segment (`docs/qa/findings.md`) is not a route to the `qa` skill.

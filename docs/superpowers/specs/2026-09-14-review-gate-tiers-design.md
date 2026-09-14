# Review gate tiers — risk-scaled scrutiny that degrades without lying

> **Status:** Draft — design approved in chat 2026-09-14, not yet implemented

## Problem

The independent review gate has one bar for every change and one way to meet it:
a cross-harness review (Codex on Claude-authored, Claude on Codex-authored),
recorded as an evidence comment pinned to the head SHA.

Two consequences, both hit on 2026-09-14:

1. **A harness outage is a hard stop.** Codex hit its usage limit (returns
   Sep 19). Every Claude-authored PR became unmergeable, including a one-line
   lockfile revert. The documented human-fallback could not be used either: its
   regex is `/^Fallback reason: Claude unavailable\s*[-—:]\s*.+$/im`, which
   hardcodes *Claude* as the missing reviewer, so "Codex unavailable" is
   unsayable. The fallback is structurally unavailable in exactly half the
   cases it was written for.

2. **Every change pays the same price.** A docs edit and an RLS policy change
   cost one cross-harness review each. For a solo operator on a finite token
   budget, the uniform tax is the budget.

The gate must stop blocking on reviewer availability without collapsing into
self-review.

## What the gate actually guarantees

Worth restating, because it bounds every option. From `scripts/qa/review-gate.ts`:

> the comment is written by the agent that ran the review, so this proves a
> review was CLAIMED for this SHA, not that its log was read. It closes the
> "merged before the review finished" and "reviewed an older head" holes, which
> are the two that have actually fired.

The gate is an **honest-attestation mechanism with SHA pinning**. It never
verified review quality. So the design goal is not "replace Codex's judgement"
— it is "record what scrutiny actually happened, pinned to the SHA, and never
let that record overstate itself."

The originating incident (#2040, 2026-09-05) was not caused by a weak review.
It was caused by an **unrecorded** one: the PR was squash-merged while the
review was still running, and the two P2s it then found were already on `main`.
That property — the record is always true, and always about this SHA — is the
one this design refuses to trade away.

## Design

Risk sets the **floor**; a ladder of reviewer tiers supplies what is available
today. A floor can be exceeded, never understated.

### The tier ladder

| Tier | Meaning | Supplied by |
| --- | --- | --- |
| `independent` | Cross-harness review | `codex-review.sh` / `claude-review.sh` |
| `adversarial` | >=2 same-harness subagent reviews, distinct bug-finding lenses, all findings addressed | any agent |
| `owner` | A human read the diff and says so | repository OWNER/MEMBER only |
| `none` | No independent review; low-risk paths, CI green | any agent |

`owner` is weaker than `adversarial` in scrutiny but is the only tier with
override authority. That asymmetry is deliberate and is the one place a human
can outrank the computed floor.

### The risk map

Highest floor wins across a PR's changed files. An unrecognised path defaults to
`adversarial` — fail safe, not fail cheap.

| Floor | Paths |
| --- | --- |
| `independent` | RLS / grants / policies, auth & RBAC, money (`stripe`, `payout`, `refund`, `checkout`, fees), `supabase/functions/**`, `packages/replication/**`, **and the guardrails**: `.github/**`, `scripts/qa/**`, `playwright*.config.ts`, `CLAUDE.md`, `AGENTS.md`, `docs/agents/shared-rules.md` |
| `adversarial` | `supabase/migrations/**` (see below), everything else in `apps/**` and `packages/**`, test files, dependency manifests (`package.json`, `pnpm-lock.yaml`) |
| `none` | `docs/**` and `*.md` outside the instruction files |

The semantic categories above (RLS, auth/RBAC, money) must be expressed as
concrete path patterns in the module, not matched by keyword inference at
runtime — a keyword scan over file contents would make the floor depend on
prose. Enumerating those globs against the current tree is the first
implementation task, and the enumeration is itself reviewable because it lands
in `scripts/qa/`, which the map puts at `independent`.

Three deliberate choices:

**Guardrails are `independent`.** A change to `scripts/qa/` or
`playwright.ci.config.ts` can disable the thing that would catch the next
defect, and does so while every check stays green. Self-review of the gate
itself is never permitted. This will occasionally be inconvenient; that is the
point.

**Migrations are `adversarial`, with a named lens.** Migration paths accept
`adversarial` only when the `migration-auditor` agent is one of the two lenses
and `src/test/database/` is green. Migrations carry more program-enforced
coverage than any other area (`qa:migrations:guard`, the DB contract suite,
behavioural SQL tests in CI), so this trades a general-purpose reviewer for a
specialised one rather than for less scrutiny.

**Test files and dependency manifests are `adversarial`, not `none`.** A
test-only change can delete coverage or add a test that cannot fail — both
shipped and were caught on 2026-09-14. A dependency diff looks clerical and is
not: #2225 was manifests plus a lockfile, carrying a 5,929-line React renderer
change and an undisclosed three-major `@types/node` downgrade that dependabot's
own metadata labelled `semver-patch`. Diff size does not track blast radius.

Consequence worth stating plainly: **both dependency PRs merged on 2026-09-14
would still require review under these rules.** The savings come from docs and
from not re-reviewing unchanged heads, not from waving through dependencies.

### Evidence grammar

The tier is named in the line, so a green `Review gate` never reads as
"reviewed" when it means "docs, nobody looked":

```
Review gate: independent/codex reviewed <base>..<head> — no findings
Review gate: adversarial reviewed <base>..<head> — 2 lenses, all findings addressed
Review gate: none reviewed <base>..<head> — low-risk paths, CI green
```

The existing `Review gate: codex reviewed …` form stays valid and maps to
`independent`, so in-flight PRs and Codex's current scripts keep working with no
change.

### Override with recorded debt

Replaces the unusable `Fallback reason: Claude unavailable` regex:

```
Review gate: owner reviewed <base>..<head> — override, floor was independent
Override reason: <harness> unavailable — <detail>
Deferred re-review: MYK9-<n>
```

- `<harness>` is free text, so "Codex unavailable — usage limit until Sep 19"
  is sayable.
- `Deferred re-review:` is **mandatory** and must name a real issue. The gate
  refuses an override without one, so the ledger cannot be skipped by
  forgetting.
- Only OWNER/MEMBER may supply `owner`, unchanged from today. The repo is
  public; anyone can comment on a PR.

`ship-pr` gains one step: on an override it files the Linear issue (title,
merged SHA, floor, what was supplied instead) and puts its id in the line.

### Relationship to the docs-only direct-to-`main` exception

`CLAUDE.md` already lets a docs-only commit skip the PR ceremony entirely, with
`.github/**`, `.claude/**`, `.codex/**`, `.agents/**` and the instruction files
explicitly out of scope. The `none` tier does not change or widen that path: it
governs PRs that exist, and its exclusions are a superset of the existing ones.
A docs-only change may still go direct to `main` exactly as today.

## Components

**`scripts/qa/review-tier.ts`** — exports `requiredTier(files: string[])`
returning the floor plus the path that set it. CLI:
`pnpm qa:review-tier --base origin/main`.

**`scripts/qa/review-gate.ts`** — imports the same module; validates the tier in
the evidence line against the computed floor; enforces override rules.

Two consumers, one source of truth. The calculator is runnable **before** a
review, which is the point: an agent asks what tier a diff needs and skips an
expensive round when a cheap one suffices. Today the floor only materialises in
CI, after the expensive thing has already run.

## Testing

**Risk map** — table-driven, asserting the computed floor per file list:
each guardrail path, migrations plus the named-lens requirement, deps and test
files landing on `adversarial`, an unknown path defaulting to `adversarial`,
and **highest-floor-wins on a mixed list** (the case most likely to regress
silently).

**Gate** — evidence below the floor refused; override without
`Deferred re-review:` refused; non-OWNER `owner` line refused; legacy line maps
to `independent`.

**Discipline:** every assertion must be shown to fail when its rule is removed.
A rule test that passes against a stubbed-out rule means the gate silently
accepts anything. On 2026-09-14 two tests that could not fail shipped in one
session; the extra runs are cheaper than that.

**Not tested:** whether a review was any good. The gate never verified that and
still will not. `adversarial` in a status is not a quality guarantee — it is a
claim, at a named tier, pinned to this SHA.

## Risks

- **A debt ledger nobody drains** becomes a list of quietly accepted risk. The
  mitigation is deliberately deferred: if overrides accumulate, add a nightly
  check that reddens on deferred re-reviews older than N days.
- **The risk map is a single point of failure.** Both consumers import it, so a
  mistake there is a mistake everywhere. It stays a short readable table, never
  inference, with its guardrail exclusions pinned by tests.
- **`adversarial` is weaker than it looks.** On #1536 two clean subagent rounds
  still missed a P1 that Codex caught. It is a floor for medium risk, never for
  the guardrail set.

## Non-goals

- Verifying review quality.
- Removing the SHA pin, or any property that keeps the record true.
- Changing branch protection or the required-checks ruleset.

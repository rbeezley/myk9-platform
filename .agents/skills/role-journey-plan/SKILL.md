---
name: role-journey-plan
description: Turns one role's journey into owner decisions and a plan. Maps the journey in code, walks it in the running app with every write refused, checks the findings against plans and issues that already exist, takes the owner's decisions one at a time, then writes docs/plan-<topic>.md and its Linear issue. Use when the owner asks what to improve next for a role, or says "walk through", "plan the exhibitor journey", "what usability improvements should we plan", or names a journey to review and plan.
---

# Role Journey Plan

The output is a plan the owner decided, not a list of findings. Use `role-journey-ux-audit` when
the request is an audit with no decisions, `qa-feature` to reproduce and fix a known bug, and
`plan-recheck` after a plan has shipped.

Read `docs/INTENT.md` and the role's section before anything else, and quote the target feeling in
the plan's "Why".

## 1. Fix the scope

One role, one journey with a start and an end the owner would recognize ("from the public show
page to a paid entry"). If the request is "what next?", offer two or three journeys, recommend
one, and wait.

## 2. Map it in code

Delegate the reading to a search agent and keep the conclusion. Ask for, in journey order: the
route, the file, every field and which are required, the exact wording the person reads, each
`// INTENT:` comment, and a count of screens and required inputs from start to end. Ask for
`path:line` on every fact and for anything inferred to be marked.

## 3. Walk it with every write refused

The walk runs against the shared database. Nothing may change there.

- Use `scripts/qa/readonly-walk.ts`. Put the walk script under `.logs/walks/` as `<name>.mts`
  and run it with `pnpm exec tsx .logs/walks/<name>.mts`. A `.ts` file there refuses top-level
  `await`. Start the dev server the way the harness documents.
- `installReadOnlyGuard` refuses everything that is not a read. Pass `signedOut: true` for a
  signed-out walk so no session can be created.
- An RPC is sent only when its name is on a list of functions read and found STABLE. A name
  that looks like a read is not evidence. When a screen needs an RPC the guard refused, read
  that function's latest `CREATE OR REPLACE FUNCTION`; if it is STABLE or IMMUTABLE, pass it in
  `readRpcs` for this walk and say so in the report. Never add one on its name.
- When a screen saves a draft before it will continue, use `answerLocally` for those tables. The
  save is answered in the browser and never sent.
- Before opening a ringside scoresheet or tapping a score, call `cutOffBackend` and close the
  context without reconnecting.
- Resolve accounts and passwords as `role-journey-ux-audit` § Preflight says. Never print them.
- Print `formatWalkLog` at the end and read it. A refused request the walk did not expect is a
  screen that writes on open: report it.
- Stop where the next step needs a real write. Say so. Do not work round it.
- Afterwards, prove nothing changed with one read-only query: no new rows in the tables answered
  locally, and the walked show's newest `entries.updated_at` is older than the walk.

```ts
import { chromium } from '@playwright/test';
import { answerLocally, formatWalkLog, installReadOnlyGuard } from '../../scripts/qa/readonly-walk';

const appOrigin = 'http://localhost:5173';
const browser = await chromium.launch({ channel: process.env.WALK_BROWSER_CHANNEL });
const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
const log = await installReadOnlyGuard(context, { appOrigin });
await answerLocally(context, ['entry_carts', 'entry_cart_items'], log);
const page = await context.newPage();
// sign in, then for each step: goto, wait, print the visible text, fields and controls
console.log(formatWalkLog(log));
await browser.close();
```

Set `WALK_BROWSER_CHANNEL=msedge` on a machine with no Playwright Chromium installed.

## 4. Report before deciding

One table of findings. Every row says **seen** (on screen, this run), **read** (in code, not
seen), or **inferred**. Never promote a row. Give the screen and input count as the baseline.

Before calling anything a bug, look for the decision behind it: `git log -S` the wording, and
search Linear with `includeArchived: true`. A finding that turns out to be deliberate is withdrawn
in the report, with the issue that decided it.

## 5. Check what already exists

Plans, audits and issues pile up. For each finding, find the plan or issue that already covers
it: search `docs/` (plans, `docs/archive`, `docs/qa`, `docs/ux-audits`, `docs/audits`) and Linear.
Say for each: covered and done, covered and open, ruled out, or not covered. Write a new plan
only when no existing plan owns the journey. Otherwise extend that plan and name the neighbours.

## 6. Take the decisions one at a time

Separate the fixes that need no decision from the decisions that are the owner's. For each
decision, in its own message:

- the fact that shapes it, verified, with what you could not verify said plainly;
- two or three options, each a sentence;
- one recommendation and its cost.

Then wait. Record the answer in the owner's words. When the owner's answer overturns the
recommendation or an earlier decision, say what it reverses and where that was recorded. Never
decide for the owner, and never start building.

State the duplication question for anything new: does this duplicate an existing page, and why is
that justified instead of a link?

## 7. Write the plan and the issue

`docs/plan-<topic>.md`, with `> **Status:** Active`, one row in `docs/README.md`, and these parts:
why (with the INTENT line), how it was checked, the journey today with the baseline count, what
is wrong (the seen/read table), the decisions with their date, the design, the duplication
answer, what is left open, phases with a Phase 0 that confirms every read or inferred fact on a
throwaway record, a testing phase, connections, non-goals.

File one Linear issue per plan with a priority, acceptance criteria and non-goals. Money work, and
anything adding a migration, gets its own issue. Comment on every issue a decision changes.

## Boundaries

- No source edits. The plan, its README row and Linear are the only writes.
- The plan is uncommitted until the owner says to commit it.
- Close every browser you launched and stop only a dev server you started.

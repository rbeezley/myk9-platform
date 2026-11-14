---
name: plan-recheck
description: Re-checks a shipped plan against what the owner decided. Given a docs/plan-*.md file or its Linear issue, walks the running app with every write refused and marks each decision and acceptance criterion as seen working, seen not working, or not checkable, compares on-screen wording with the wording approved, and recounts the plan's baseline of screens and inputs. Use after a plan's issues have merged and deployed, or when the owner asks "did this work as intended", "re-check the plan", or "walk it again".
---

# Plan Re-check

The task walks in `docs/qa/walks/` ask whether a job still works. This asks whether a plan did
what the owner decided, and whether the journey got shorter. Use `verify-plan` before a plan is
built, `role-journey-ux-audit` for an open-ended audit, and `qa-feature` to fix what this finds.

## 1. Read what was decided

Read the plan in full and its Linear issue with `get_issue` (never from a list result), plus the
issue's comments. Extract four lists:

1. **Decisions**, each with its date and the owner's choice.
2. **Acceptance criteria**, from the issue.
3. **Approved wording**: every sentence the plan quotes for a screen, an email or a message.
4. **The baseline**: the count the plan recorded (screens, required inputs, actions) and how it
   was counted.

Then read every issue the plan names as connected. A later decision can replace an earlier one;
the latest dated decision wins, and the report says which was replaced.

## 2. Establish what shipped

For each issue: its state, the merged PR, and whether production has it. A merge is not a deploy.
Say which build the walk ran against (local `main` at a commit, or production) and re-check only
what that build contains. An issue still open is reported as "not built yet", not as a failure.

## 3. Walk it with every write refused

Follow `role-journey-plan` § 3: `scripts/qa/readonly-walk.ts`, a script under `.logs/walks/`, the
same account rules, the same stop at the first step that needs a real write, and the same query
afterwards proving nothing changed.

Walk the journey from its start, as the plan's role, at the viewport the plan used. Do not jump
to the changed screens: the baseline is a count of the whole journey.

## 4. Mark each item

| Mark             | Meaning                                                          |
| ---------------- | ---------------------------------------------------------------- |
| Seen working     | Observed on screen in this run, with the text or state quoted.   |
| Seen not working | Observed, and it differs from the decision. Quote both.          |
| Not checkable    | Needs a write, a second account, an email, a payment, or a date. |
| Not built yet    | The issue is open or the build does not contain it.              |

Rules:

- A test passing is not "seen working". Only the screen is.
- Wording is compared exactly. A paraphrase is "seen not working" unless a later decision
  changed the sentence; then cite it.
- For an item that is "not checkable", say what would check it and who can run that.
- Look for the decision's opposite. If the owner removed something, confirm it is gone
  everywhere it appeared, not only where the plan named it.
- Check that nothing the plan listed as a non-goal was built.

## 5. Recount the baseline

Count screens and required inputs the same way the plan did, on the same journey. Report before
and after side by side. If the count went up, say which step added to it.

## 6. Report

Lead with the answer: how many decisions are seen working, out of how many. Then:

- the build walked, the role, the viewport;
- one table: decision or criterion, mark, evidence;
- the baseline, before and after;
- wording that differs, quoted both ways;
- what could not be checked, and how it could be;
- anything the walk refused that it did not expect (a screen that writes on open).

File a Linear issue only for something a real user could hit before launch that causes real harm,
per `CLAUDE.md` § Workflow. Everything else is a line in the report. Comment the result on the
plan's issue. Do not move the issue to Done: that needs every criterion met and a fresh read of
the whole issue.

When every decision is seen working and nothing is open, say the plan can be closed: status
`Complete`, moved to `docs/archive/`, its README row dropped. Propose it; the owner decides.

## Boundaries

- No source edits, no fixes, no plan rewrites.
- Nothing is written to the shared database. A step that needs a write is "not checkable".
- Close every browser you launched and stop only a dev server you started.

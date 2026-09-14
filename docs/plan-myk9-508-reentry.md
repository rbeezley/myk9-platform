# MYK9-508: resume an unfinished show entry

> **Status:** Active

## Scope

Browser Back from the agreement leaves the registration route. Reopening the
same show currently starts with no dog selected although a saved draft can
restore the dog, classes, and step. Keep draft recovery on the existing wizard;
do not add another entry page or change the Stripe cancellation flow (MYK9-509).

This narrow bug fix follows the registration-wizard redesign in MYK9-483 / PR
#2210. It does not need a separate OpenSpec proposal because that change already
owns the wizard structure and this only exposes its existing draft loader.

## Implementation

1. On the exhibitor's empty dog-selection step, recognize a saved draft with
   entry work for this show and show a prominent Resume entry action. Selecting
   it uses the existing draft loader and preserves the option to start a new
   entry.
2. Do not surface an empty draft as resumable. Keep staff/secretary flows and
   payment submission unchanged. Handle a stale or unreadable draft in plain
   language.

## Testing

1. Add focused component coverage for when the prompt appears, disappears, and
   restores a saved draft through the existing handler.
2. Add a Playwright regression for select dog → advance → browser Back → reopen
   show → resume. Assert that the selected dog and step return without a new
   dog profile or payment submission.
3. Run targeted tests, typecheck, and the required shuffled myK9Show suite
   before pushing. Reconcile the branch with main after PR #2210 merges.

## Verification recorded

- Focused hook, prompt, submission, and existing draft-load tests: 36 passed,
  including a shuffled run. Review coverage also checks that completed entries
  cannot be resumed, rejected draft reads cannot overwrite the saved payload,
  and successful submission clears drafts for the filed dog while preserving
  unrelated dogs. Resume waits for dog data and rejects missing dogs; metadata
  stays current across autosaves and hook instances. The receipt rail is no
  longer a route back into a filed entry. The prompt keeps a saved entry visible
  while the dog query is unavailable, skips rejected candidates, and offline
  staff submissions discard the filed draft. A retry action can refresh the
  profile and dog roster; the resume prompt stays hidden after the exhibitor
  edits the dog selection, and completed drafts are removed on attempted load.
- Chromium browser Back → reopen → Resume entry: passed. The initial run failed
  before the pagehide save was added, confirming the immediate-exit gap.
- App typecheck, touched-file ESLint, and code-quality ratchet: passed.
- Full shuffled app suite: stopped after 30 seconds without test results, per
  the repository's test-runner instruction. Its only output was a CSS parse
  warning; this is not a passing full-suite verdict.

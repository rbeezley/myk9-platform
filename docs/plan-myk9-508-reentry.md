# MYK9-508: resume an unfinished show entry

> **Status:** Active

## Scope

Browser Back can leave the registration route before the 30-second draft save.
On reopening the show, the exhibitor sees an empty dog selection even if a
draft contains the dog, classes, and step. Reentry belongs in the existing
wizard and DraftManager; a second resume dialog would duplicate that surface.
The Stripe cancellation/cart path remains MYK9-509.

This is a narrow follow-on to the merged MYK9-483 wizard redesign. That change
owns the wizard structure, so a second OpenSpec proposal would duplicate it.

## Implementation

1. Save a meaningful draft on pagehide and avoid replacing it with an empty
   new-wizard envelope. Read the saved payload when deciding whether to offer
   resume; an empty or completed entry does not qualify.
2. Show the latest unfinished entry prominently within DraftManager on the
   exhibitor's empty dog step. Preserve the option to select a different dog.
3. Wait for the dog roster before offering automatic resume. The existing
   manual draft loader can restore locally while offline; defer registration
   creation until the roster arrives and validates the selected dog. Keep the
   draft if the roster is temporarily unavailable. Do not change payment or
   legal-agreement submission.
4. After a successful entry submission or cart handoff, remove only class
   lines that were handled. Keep denied classes, unrelated drafts, and unfiled
   dogs; never turn a completed entry into a resume candidate.

## Testing

1. Unit tests for draft save, eligibility, failed load, accepted load, and
   partial cleanup after an entry is filed.
2. Component tests for the single visible resume action and recovery states.
3. Playwright browser Back → reopen → resume, asserting the step and dog return.
4. Targeted tests, typecheck, shuffled app suite, code-quality ratchet, and
   independent review before merge.

## Verification recorded

- Focused draft hook, DraftManager, wizard, and submission tests: 42 passed. They cover
  pagehide, empty-reentry preservation, rejected and accepted draft reads,
  eligibility, roster loading/error recovery, dog/class/step restoration,
  profile-refetch failure, the first post-resume edit, class-level cleanup,
  stale pre-class draft cleanup, continued saving after partial submission,
  offline manual draft restoration, and stable payload parsing across unrelated renders.
- Chromium browser Back → reopen → Resume entry: passed.
- App and test TypeScript checks, E2E typecheck ratchet, touched-file ESLint,
  code-quality ratchet, plan metadata, and diff check: passed.
- Full shuffled app suite: stopped after 30 seconds without test results, per
  the repository's runner guidance. It is not a passing full-suite verdict.

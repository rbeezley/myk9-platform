# Choice audit: secretary and exhibitor flows

**Date:** 2026-11-09
**Auditor:** Claude
**Baseline:** `906674b4d` (main)
**Sources:** code only. Two read-only sweeps of `apps/myk9show/src` (secretary and club-admin surfaces; exhibitor and public surfaces), then spot checks of the shortlisted items in source. No browser walk.

## What this is

A narrow audit, not the full six-pass. It covers one question from Pass 4 (cognitive load) across two roles: **where does the app ask the user to choose, and could it decide instead?** The rule it applies is the owner's from 2026-10-15: older, low-tech users; decide automatically; offer a choice only when the user holds information the app cannot know, or the action is destructive or about money.

Each choice point is classified:

- **Automate** — the app can decide; remove the question.
- **Delete** — the choice or control does not earn its place.
- **Keep** — deliberate, destructive, or about money.
- **Owner call** — removing it changes a rule only the owner can change.

## Inventory

| Kind                              | Secretary / club admin     | Exhibitor / public |
| --------------------------------- | -------------------------- | ------------------ |
| Confirmation dialogs              | 38 rows (about 50 prompts) | 18                 |
| Pick-between-options              | 30                         | 25                 |
| Defer / dismiss branches          | 13                         | 8                  |
| Settings controls                 | about 45                   | 25                 |
| System-internals prompts          | 13                         | 14                 |
| Destructive actions with no guard | 10                         | 13                 |

Most confirmations are sound: they guard deletes, money, or irreversible filings, and many carry an `// INTENT:` comment. The findings below are the exceptions.

## Findings

Status: **Verified** means I read the cited code. **From sweep** means the inventory reported it and I did not re-read it.

### Automate

| #   | Choice today                                                                                                                                                       | Proposed                                                                               | Evidence                                                                                                                   | Status                           | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------- |
| A1  | Leaving the show wizard asks "Unsaved Changes… will be lost" and then discards the draft, although the wizard can keep a draft and offers to resume it next visit. | Keep the draft silently on leave. The resume banner already offers "Start a new show". | `pages/secretary/ShowCreationWizardPage.tsx:270-287`, `ShowCreationWizard/WizardDraftResumeBanner.tsx`                     | Verified                         | High     |
| A2  | Each Accept or Waitlist opens an email preview with "Not now" / "Send now", even when that email step is switched on for the show.                                 | Send automatically when the step is on. The per-show switch is the one decision.       | `features/lifecycle-emails/LifecycleEmailPreviewDialog.tsx:57,96-115`, `useEntryDecisionLifecycleEmails.tsx:167`           | Verified (owner call, see below) | High     |
| A3  | Exhibitor returning to the entry wizard is asked "Continue your entry?" with "Resume entry" / "Start over".                                                        | Resume automatically. Keep a small "Start over" link.                                  | `components/shows/RegistrationWorkflow/DraftManager.tsx:62-95`                                                             | Verified                         | Medium   |
| A4  | An exhibitor with one dog must still tick it on the Dogs step. Auto-select runs only when the flow has no Dogs step.                                               | Pre-select the only eligible dog.                                                      | `pages/RegistrationWizardPage/useRegistrationWizard.ts:55-68`                                                              | Verified                         | Medium   |
| A5  | Card payment takes two presses on two pages: "Submit & pay" in the wizard hands off to the cart, where a second button goes to Stripe.                             | One press from the wizard to Stripe when the cart holds only this entry.               | `features/registration/registrationCartCheckout.ts:110` (handoff verified); second button `CartSummary.tsx:314` from sweep | Partly verified                  | Medium   |
| A6  | "Add entry to which show?" lists shows even when only one can take an entry.                                                                                       | Go straight to that show.                                                              | `features/actions/AddEntryShowPicker.tsx:29-50`                                                                            | Verified                         | Low      |
| A7  | Forgot-password starts with an empty email although the user just typed it on sign-in.                                                                             | Carry the email across.                                                                | `pages/ForgotPasswordPage.tsx:12`                                                                                          | From sweep                       | Low      |
| A8  | Exhibitor missing an address is sent out of the entry wizard to Account. Staff get an in-place dialog for the same fix.                                            | Open the existing fill-in dialog for the exhibitor too.                                | `components/shows/RegistrationWorkflow/OwnerAddressFix.tsx:9-15`                                                           | Verified                         | Medium   |

### Delete

| #   | Choice today                                                                                                                                                            | Proposed                                                                                        | Evidence                                                                                                                 | Status                                      | Severity |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | -------- |
| D1  | Onboarding Dogs step shows "Skip for now" and "Next"; both do the same thing.                                                                                           | One button.                                                                                     | `pages/onboarding/steps/StepDogs.tsx:119-124`                                                                            | Verified (buttons); same handler from sweep | Low      |
| D2  | "Export Shows" asks for confirmation before downloading a CSV.                                                                                                          | Download on click.                                                                              | `components/shows/browse/ShowBulkActionsBar.tsx:234-262`                                                                 | From sweep                                  | Low      |
| D3  | Check-in "Pull" asks to confirm and then also offers Undo. "Put back" asks to confirm a reversal. INTENT names confirms on routine show-day actions as an anti-pattern. | Act, then Undo. Drop both confirms.                                                             | `components/common/CheckInStatusDialog.tsx:283`, `components/entries/management/checkInDesk/CheckInDesk.tsx:248`         | From sweep                                  | Medium   |
| D4  | Four differently worded unsaved-changes dialogs ("Unsaved Changes", "Discard changes?", "Leave {subject}?", the judge-qualifications one).                              | One dialog, one wording.                                                                        | `UnsavedChangesRouteGuard.tsx:265`, `DiscardChangesDialog.tsx:30`, `JudgeQualificationPanel.tsx:384`, wizard page `:590` | From sweep                                  | Low      |
| D5  | Exhibitor Account exposes "Clear Cache" (Storage) and the account menu has "Refresh app".                                                                               | Move behind support guidance; an exhibitor should never need either.                            | `components/preferences/DataSettings.tsx:138-176`, `components/layout/AccountMenuContent.tsx:207`                        | From sweep                                  | Medium   |
| D6  | Exhibitor notification settings: Sound, Vibration and Haptic as three switches, plus voice, voice speed and four voice categories.                                      | One "Sound and vibration" switch for exhibitor-only accounts; keep the rest for ringside roles. | `components/notifications/NotificationSettings.tsx:119-298`                                                              | From sweep                                  | Medium   |
| D7  | The install banner appears on every page and returns 7 days after dismissal.                                                                                            | Show it only on My Shows close to a show the person is entered in.                              | `components/pwa/PWAInstallBanner.tsx:59-155`, `hooks/usePWAInstall.ts:41`                                                | From sweep                                  | Low      |

### Jargon in a forced choice

| #   | Finding                                                                                                                                                                                                                               | Evidence                                        | Status   | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------- | -------- |
| J1  | The conflict toast reads "This record was changed elsewhere", lists the changed field names joined by commas, and offers "Take theirs" / "Keep mine". It never closes on its own. INTENT asks for clear choices, not technical diffs. | `providers/ReplicationSyncProvider.tsx:827-856` | Verified | High     |
| J2  | The sync-failure toast offers "Retry" / "Discard" and never closes on its own. Discard drops the queued change.                                                                                                                       | `providers/ReplicationSyncProvider.tsx:754-774` | Verified | Medium   |

Both carry `// INTENT:` comments requiring an explicit choice, so the persistence stays. The wording and what the user is shown are open.

### Owner calls

1. **A2, email after Accept.** Entry management records an owner rule that anything which emails people needs a confirm step (`EntryManagementBulkBar.tsx:120`). Sending acceptance emails automatically changes that rule for this one case.
2. **Entry agreement tick is cleared whenever the exhibitor leaves the Payment step** (`useRegistrationWizard.ts:73-82`, verified). It reads as deliberate: re-affirm after changing the entry. Keeping the tick removes a repeat step.
3. **Show wizard fields with no default.** Trial start time is never defaulted; the entry window has no default (a comment says the secretary sets it by hand); all three payment methods start off; show name is typed although club and dates are known. Each could have a sensible default. (From sweep, `wizardStore.ts:170-212`, `ShowDetailsStep.tsx:172`.)
4. **Sign-up asks for the password twice and offers three role checkboxes.** A show-password toggle would replace the second field.

### Keep

Deliberate and correct as they stand: the Score Confirmation read-back; refund-all two-step; Withdraw vs Pull chooser; the shared delete dialog with 10-minute Undo; junior handler declaration; PWA update prompt and the stale-version banner; step-up re-authentication; the sign-out guard; Close out show; Send results and Mark as submitted; Generate new access codes; Resend confirmation; Record as printed; waitlist offer, remove and withdraw-offer.

### The reverse: destructive actions with no guard

The sweep also listed actions that change money or status at once, with no confirm and no Undo. None is verified; each needs a read before anything is filed. An Undo toast fits better than a dialog.

- Class status "Cancelled" from the Show Desk dropdown (`ClassOperationalControls.tsx:147-153`)
- "Deny refund" (`PullReconciliationActions.tsx:52-76`)
- "Payment Due" ledger reversal and "Paid in Full: Online" (`EnrollmentCard.tsx:267,296`)
- Show wizard "Remove trial" (`TrialConfigurationStep.tsx:292-301`)
- Exhibitor wait-list "Decline" (`WaitListSection.tsx:233`)
- Exhibitor "Start over", which deletes every saved draft (`DraftManager.tsx:88`)

### A defect found in passing

Password minimum is 6 at sign-up and 8 on reset and change (`SignUpPage.tsx:141`, `ResetPasswordPage.tsx:21`, `SecuritySettings.tsx:29`). From sweep.

## Summary

**Overall:** needs work, no critical issues. The app's confirms are mostly well chosen. The cost sits in a small number of questions the app already knows the answer to, and in system internals reaching exhibitors.

**Quick wins (low effort, no rule change):** A1, A4, A6, A7, D1, D2, D4.

**Highest value:** A1 (the wizard is a new secretary's first task), A2 (asked on every accept), J1 (a forced choice in technical words on show day).

**Recommendations**

1. Ship the quick wins as one batch.
2. Decide the four owner calls.
3. Verify the unguarded destructive actions, then give each an Undo.

## Reconciliation

Searched Linear with `includeArchived: true` for the shortlisted items (wizard leave and drafts, acceptance email preview, conflict toast, entry resume, agreement reset, card checkout handoff, notification settings, password length). No existing issue covers any of them. Related closed work: MYK9-1290 removed the visible Save/Load Draft buttons; MYK9-1742 pre-ticked the agreement for staff; MYK9-1378, 1445, 1220 and 1104 fixed false conflicts but not the toast wording. Linear search is fuzzy, so absence here is not proof.

## Coverage gaps

- No browser walk; nothing here was seen rendered.
- Not opened: show and club edit-panel field tabs, Reports page pickers, lunch orders, incident log, self check-in tools, pricing and subscription purchase, dog record forms, shared `packages/*` UI.
- Excluded by scope: `/at-show` ringside, site admin.
- The per-kind counts come from the sweeps and were not recounted.

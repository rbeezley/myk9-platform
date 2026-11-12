# Plain-language audit: secretary and exhibitor wording

> **Date:** 2026-11-09 · **Method:** code-only sweep (two read-only passes: secretary and club-admin; exhibitor, sign-in and app-wide), then the top findings re-read in the code. No browser walk. · **Scope:** `apps/myk9show/src`, user-visible text only.

The question: where does the app speak to an older, low-tech volunteer in words they would not understand, or tell them something failed without saying what to do next? `docs/INTENT.md` already sets the rule (no software jargon, plain-English errors, dog-show terms are fine). This audit measures how far the code is from it.

Rows marked **Verified** were re-read by the author. Rows marked **From sweep** were not; verify the caller before filing or fixing (the choice audit's one wrong finding came from skipping that).

## Summary

The newest code is already plain: club-admin hooks, premium publish errors, the online-entry gate, the step-up password messages (`features/step-up/stepUpAuth.ts`), and `utils/friendlySaveError.ts`. The debt is concentrated in six places:

1. **Raw technical text reaches the screen** on the paths that matter most: sign-in, sign-up, submitting an entry, refunds, recording a payment.
2. **"Failed to ..." developer-speak** in about 100 toasts and alerts (about 71 secretary side, about 28 exhibitor side), and about 20 generic "An unexpected error occurred" / "Something went wrong" messages with no next step.
3. **Offline and sync vocabulary** ("queued", "sync", "server", "reload", "cache") in banners every role sees, at the venue, on the worst day.
4. **One thing, several names** on screens used together.
5. **A password rule that differs by page** (6 on sign-up, 8 on reset and account).
6. **Em dashes** in about 290 visible strings, including the main Submit button. The no-em-dash rule has no guard; emojis are nearly clean (6 exhibitor files, 0 secretary).

## Verified findings

| #   | Where                                                                                                                                        | What the user sees                                                                                                        | Why it hurts                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| V1  | `pages/SmartSignInPage.tsx:243` via `hooks/useAuth.ts:306`                                                                                   | Supabase's own sign-in error text, passed through untouched (`setError(err.message)`)                                     | A mistyped password is the most common error there is. The provider's wording does not say what to do. |
| V2  | `pages/SignUpPage.tsx:165`                                                                                                                   | Supabase's sign-up error text, passed through                                                                             | Same, on the first screen a new exhibitor uses.                                                        |
| V3  | `pages/SignUpPage.tsx:134-135` vs `pages/ResetPasswordPage.tsx:21` (and `SecuritySettings.tsx`)                                              | "Password must be at least 6 characters" vs "at least 8 characters"                                                       | A password accepted at sign-up is refused when she later changes it.                                   |
| V4  | `pages/RegistrationWizardPage/submitPaymentStep.ts:262`                                                                                      | `notifications.error(getErrorMessage(error))`: whatever was thrown, including "Failed to add entry" and raw database text | The moment of submitting and paying. She cannot tell whether she was charged.                          |
| V5  | `pages/CartPage.tsx:451-455` (text from `store/cartStore.ts`)                                                                                | The cart store's raw error string in a red alert                                                                          | Same flow, one step earlier.                                                                           |
| V6  | `components/entries/management/RefundEntryDialog.tsx:263,272`; `RequestPaymentDialog.tsx:93,105`; `features/payments/useShowRefundAll.ts:57` | For any unmapped failure, the supabase-js message (normally "Edge Function returned a non-2xx status code")               | Money screens. No next step, and it reads like something broke badly.                                  |
| V7  | `hooks/useEnrollmentLedgerActions.ts:107`                                                                                                    | "Payment not recorded: {raw server message}"                                                                              | At the check-in table with cash in hand.                                                               |
| V8  | `hooks/useEntryManagementActions.ts:213` (shown by the armband dialog)                                                                       | The database's message for a refused armband, else "Failed to assign armband"                                             | A duplicate armband number should say so in plain words.                                               |
| V9  | No test under `src/test/ci` checks UI strings for em dashes                                                                                  | n/a                                                                                                                       | The rule exists only as a habit, so new ones keep arriving (two sit in files changed this week).       |

**Intentional, do not "fix" blindly:** the sync-failure toast's "Reason: ..." line (`providers/replicationSyncFormatters.ts:140-146`) is deliberate: its comment says it is there so a secretary, and whoever she calls, can see why Retry keeps failing. The headline is already plain. Worth asking whether exhibitors should see that line at all, not whether to delete it.

## From the sweep, by theme

Counts are grep-based and approximate. The full row lists (file, line, exact text, suggested wording) are in the two sweep reports attached to MYK9 issues filed from this audit.

### A. Raw errors on screen (beyond V1 to V8)

About 27 secretary-side and 33 exhibitor-side surfaces. The notable ones: bounced-email provider text in an entry card's tooltip (`components/entries/EmailStatusIcon.tsx:45,52`); a raw Stripe payment id and error after "Refund all" (`components/shows/RefundResultDetail.tsx:71`); "This report could not be generated: {PDF library error}" (`pages/secretary/ReportsPage/ReportPreview.tsx:446`); bulk status failure lines with a raw reason (`hooks/bulkDispatch.ts:110`); reset-password and change-password provider text; the onboarding profile save; account settings save.

Two helpers matter here. `getUserFriendlyError` (`utils/errorMessages.ts`) returns raw text in development and a generic fallback in production, so testers see worse than users. `getErrorMessage` from `@myk9/core` filters nothing. `utils/friendlySaveError.ts` already does this well and is the one to reuse.

### B. "Failed to ..." and messages with no next step

Everyday secretary screens: move-up requests (approve, deny, load), entry edits, tasks, the results-visibility page (about 12 strings), the waitlist page, the show status pill, "Could not download the official PDF" seven times in `useAKCOfficialPdfAction.ts`. Exhibitor side: class selection add and remove, My Entries load, pull and withdraw ("An unexpected error occurred."), the entry-flow crash screens ("Section Unavailable ... registration wizard section encountered an error", "Failed to load component", "Retry attempts: 2").

The house pattern already in the newer code is: "We couldn't {do the thing}. {What is still true.} Try again."

### C. Offline, sync and update vocabulary

Seen by every role: "Offline — changes saved here", "Sync needs attention", "Queued — will sync when online", "Status change queued. It will sync when you are back online.", "Sync backlog is full", "Resyncing local data...", "We couldn't reach the server", "Reload to keep working offline", "Clear Cached Data", "Local Storage", "Install app", "This record was changed elsewhere" with raw field names and "Take theirs / Keep mine". Plain forms: "saved on this phone", "will be sent when you are back online", "update the app", "add to your home screen".

### D. One thing, several names

| Thing                    | Names in use                                                                             | Suggested                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Waitlist                 | waitlist (about 100), wait list (about 27), wait-list                                    | waitlist                                                            |
| Try again                | "Retry" x38, "Try again" x27 (secretary side alone)                                      | Try again                                                           |
| Free entry               | Comp, Comped, Waive, Waived, Fees Waived                                                 | owner's choice of one                                               |
| Closing a show           | Close out, Closeout, wrap-up, close the show                                             | Close the show                                                      |
| The platform's cut       | platform fee, service fee, card processing fee                                           | service fee                                                         |
| The club's money account | bank account, payment account, Payments, Stripe                                          | bank account                                                        |
| Who to contact           | trial secretary, show organizer, show team, the club, the administrator, club admin      | the show secretary (show problems); myK9Show support (app problems) |
| Creating an account      | Sign up, Create an account, Create account                                               | Create account                                                      |
| Payment methods          | four spellings of card, three of check                                                   | one each                                                            |
| Pull on show day         | Pull, "Pull / no-show", absent, scratched                                                | Pull                                                                |
| Leaving a class          | button "Leave class…" then Pull or Withdraw; "Withdraw" also used for leaving a waitlist | "Pull or withdraw…"; "Leave waitlist"                               |
| A link                   | Link copied, URL copied                                                                  | Link copied                                                         |
| Wi-Fi                    | WiFi, Wi-Fi                                                                              | Wi-Fi                                                               |

Entry, entry form and registration are mostly handled well; the leftovers are "registration fees", "this wizard", "an enrollment must be filed", and "Reg #". `docs/reference/ui-vocabulary.md` covers verbs only; it has no noun list, which is why these drift.

### E. Abbreviations and raw values

"TBD" and "TBA" for judge, date and venue (about 15 places, including public show pages; "TBD" is also stored as a judge's name by the wizard); "N/A"; "Reg #"; "DOB"; "Confirmation #"; "EIN" unexplained; raw status values printed in a few places (a dog's upcoming shows, the support ticket, the browse-shows bulk bar, message roles); times shown with seconds in three secretary places. Dates and times are otherwise good.

### F. Late-entry payment card

`components/shows/RegistrationWorkflow/PaymentStep/SecretaryPaymentManagement.tsx` reads like an accounting tool: "Fee Override", "Reconciliation", "Enable bulk payment operations", "Reset to Pending", a status reason of "Technical issues", and "This action requires admin approval". This is as much a choice-audit finding (does a secretary need these tabs?) as a wording one.

### G. Em dashes and emojis

About 290 visible strings carry an em dash (about 90 secretary, about 200 exhibitor and shared, of which about 90 are in landing and entry-blank templates). Highest traffic: the Submit button ("Submit — pay cash at show"), every My Entries status line ("Accepted — you're in"), the sign-in hint, the offline line in the account menu, the publish gate messages. Another 24 are a bare "—" used as an empty table cell. Emojis: medals on the public results board, icons in the dog Achievements dialogs, one download arrow.

## Proposed batches

Ordered by harm to this audience. Each is one surface or one mechanism, so each can be one PR.

| Batch | What                                                                                                                                                                                                                                                    | Size                        | Notes                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| P1    | **Sign-in and sign-up errors in plain words, one password rule.** Map the provider's errors by code (wrong email or password, email not confirmed, too many tries, already has an account) the way `stepUpAuth.ts` does; make the minimum 8 everywhere. | Small                       | V1, V2, V3. Owner call: 8 is the number? The server-side minimum should match.                                 |
| P2    | **Money and entry-submission errors never show raw text.** Submit entry, cart, refund, payment link, refund-all, record payment, armband. Each gets a fixed sentence that says what did and did not happen ("Nothing was charged.").                    | Medium                      | V4 to V8. Money paths: independent review tier.                                                                |
| P3    | **"We couldn't ..." sweep.** Replace the remaining "Failed to ..." and "An unexpected error occurred" strings with the house pattern; one shared helper so new code has an obvious thing to call.                                                       | Medium, mechanical          | About 120 strings. Can be split secretary / exhibitor.                                                         |
| P4    | **Offline and update wording.** One short word list ("saved on this phone", "sent when you are back online", "update the app") applied to the account menu, banners, sync toasts and the status popover.                                                | Small to medium             | Owner call on the conflict toast ("Take theirs / Keep mine") and on whether exhibitors see the "Reason:" line. |
| P5    | **One name per thing.** Add a noun list to `docs/reference/ui-vocabulary.md`, then apply it: waitlist, Try again, service fee, bank account, the show secretary, Create account, payment method names.                                                  | Medium                      | Owner calls: the word for a free entry; "Close the show".                                                      |
| P6    | **Em-dash guard and cleanup.** A CI ratchet that counts em dashes in UI strings and may only go down, then remove them from the highest-traffic strings first.                                                                                          | Small guard, medium cleanup | V9. Same shape as the code-quality ratchet.                                                                    |
| P7    | **Abbreviations.** "To be announced", "Registration number", "Date of birth", "Confirmation number", "Not recorded"; stop storing "TBD" as a judge name.                                                                                                | Small                       |                                                                                                                |
| P8    | **Late-entry payment card.** Decide which of its tabs a secretary needs, then reword what stays.                                                                                                                                                        | Owner decision first        | Overlaps the choice audit.                                                                                     |

Not proposed: rewording dead code the sweep found (`utils/inputValidation.ts`, `lib/dataValidation.ts`, `hooks/useSecurityValidation.ts`, `hooks/useUserFriendlyErrors.ts`, `services/error/APIErrorInterceptor.ts`, `NetworkStatusIcon`, `CreditCardVisual` are not rendered anywhere, **From sweep**). Deleting them is its own small job.

## Limits

- Code-only. Who sees a string, and how often, is inferred from the code path. Nothing was checked in a browser.
- Counts come from grep and will be off by a few; multi-line JSX text is under-counted.
- Judge, steward and at-show scoring screens, site-admin pages and printed reports were out of scope.
- Supabase's exact error strings (V1, V2) were not captured from a live response; the mapping should key on the error code, not the text.

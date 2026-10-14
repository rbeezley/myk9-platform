# Proposal

Tracking: [MYK9-1162](https://linear.app/myk9-platform/issue/MYK9-1162/add-dog-asks-for-the-registration-number-first-and-finds-an-existing). The owner approved the design on 2026-10-14, including option B, which relaxes the 2026-08-28 entry rule for secretaries. Narrows [MYK9-1151](https://linear.app/myk9-platform/issue/MYK9-1151).

## Why

A dog cannot be entered in a show without a registration number. Even so, Add Dog asks for the number second and checks for duplicates only at Save, and only against dogs already on the device. When a duplicate slips through, the server merges the new dog onto the existing one and silently drops its other registrations (MYK9-1151).

The opposite failure costs a mail-in its place. Since 2026-08-28 the database refuses any entry for a dog with no number for the trial's registry. A secretary holding a mail-in envelope with a missing or illegible number cannot key it in, and the show can fill while the number is chased.

Both problems hit secretaries during entry season, so they matter for fall 2026 launch readiness: duplicate dogs and lost mail-in places are the support load a volunteer secretary cannot absorb.

## What Changes

- **Add Dog starts with the registration.** Step 1 asks for registry and number. It looks the dog up from the device copy, and from the server when online, before any other field is asked for.
  - A match offers the existing dog through the existing "Use existing dog" path.
  - No match carries the number into the rest of the form.
  - The current Essential → Registration → Optional order becomes Registration → Essential → Optional. No new screen is added.
- **Foreign numbers stay private.** An exhibitor whose number belongs to another owner's dog is told only that the number is already registered to another dog and to contact the show secretary. A new server lookup answers that with a yes or no and nothing else. Secretaries, who already see the whole dog directory, get the full match.
- **"No registration number yet" is a secretary-only escape hatch.** It skips the lookup and creates a dog with no registration.
- **A secretary's entry may hold its place without a number (BREAKING, for a database rule).** The 2026-08-28 rule that refuses no-number entries is relaxed only for entries inserted by someone who can manage the trial. Exhibitor (self-service) inserts are still refused, and the conformation-puppy carve-out is unchanged.
- **A held entry is visible and chased.** An entry whose dog has no number for the trial's registry:
  - appears under a new **Entries → Exceptions → Registration number needed** pane;
  - is left out of the catalog, run order, printed judge sheets and the emergency trial packet until a number is added;
  - leaves that state on its own once the number is added, because nothing is stored to clear.
- **"Registration number needed" lifecycle email.** A new per-show lifecycle step:
  - prepared when such an entry is saved and previewed by the secretary like the accepted and waitlisted emails;
  - resent from the Exceptions row with "Send reminder";
  - the row reads "No email on file — contact by phone" when there is no address;
  - never sent once the number exists.
- **Secretary guide.** Card 5 ("Add a mail-in entry") is updated to describe number-first Add Dog and held entries.

## Duplication Decision

**Does this duplicate an existing surface? No.**

- It reorders the existing Add Dog panel.
- It reuses the existing "Use existing dog" path and the dog's existing Registrations section for adding further numbers.
- It adds one pane to the existing Entries → Exceptions list, beside move-ups, pulls and waitlist.
- It adds one step to the existing lifecycle email settings.

A link is not enough because the problem is the order of fields inside the one Add Dog form, and the follow-up for held entries belongs in the place secretaries already work their exceptions.

## Capabilities

### New Capabilities

- `entry-registration-number-pending`: an organizer-made entry whose dog has no registration for the trial's registry holds its capacity place, is surfaced for follow-up, and is kept off official show paperwork until a number exists.

### Modified Capabilities

- `dog-identity-deduplication`:
  - Add Dog looks the dog up by registry identity before asking for other details.
  - A foreign-owner match reveals nothing.
  - The no-number path is secretary-only.
- `entry-management-cockpit`: the Exceptions list gains a "Registration number needed" pane.
- `show-lifecycle-emails`: a "Registration number needed" step, with its preview, reminder and no-email behaviour.

## Non-Goals

- **No received-date column for mail-ins.** Capacity stays first-commit-wins, and a secretary holds the place by keying the entry as it arrives.
- **No automatic withdrawal of held entries.** Pulling or withdrawing stays a secretary decision under the club's premium rules.
- **No change to MYK9-1151's merge.** Its offline residue keeps its own issue.
- **No new duplicate-management page and no exhibitor-facing "held entry" screen** beyond the email.
- **No conformation or puppy-class support beyond the existing carve-out.**

## Impact

- **App:**
  - `components/panels/edit/AddDogPanel/*` (step order, lookup step) and `utils/dogIdentity.ts`;
  - the Entries cockpit exception list (`entryManagementCockpitParams.ts`, `entryManagementViews.ts`, `EntryManagementPage.tsx`);
  - catalog, run sheet and paper-scoring selection (`lib/reports/catalogFields.ts`, `buildRunSheetEntries.ts`, `paperScoresheetData.ts`, pipeline print);
  - `features/lifecycle-emails/*`;
  - the secretary guide.
- **Database (migrations; going live needs an owner-run `supabase db push`):**
  - a boolean registry-identity lookup RPC;
  - `entries_require_dog_registration()` relaxed for trial managers;
  - `emergency_packet_input` excludes held entries;
  - the lifecycle `step_type` CHECKs and `ensure_show_lifecycle_email_steps` widened, with steps backfilled for existing shows.
- **Edge functions:** `send-lifecycle-email` accepts the new step. Going live needs an owner-run deploy; `generate-trial-packet` reads the narrowed RPC unchanged.
- **Review tier:** the RPC and the trigger relaxation are security-sensitive and take the independent (Codex) review.

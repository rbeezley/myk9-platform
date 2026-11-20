# Rebuild a premium narrative from the show's details (MYK9-2280)

> **Status:** Active

## Problem

"Show Hours" and "Trial Information" are built from the show's facts, with no AI (MYK9-2055). Once
a premium is published, `resolvePremiumNarratives` (`supabase/functions/generate-premium/premiumNarratives.ts`)
keeps the published text, so a trial or start time added later never reaches either section.
Regenerate does not help, because it goes through the same rule.

There is no working path today. Clearing the field in the editor does not rebuild it: the server
rebuilds a section only when the **published** copy is blank. So a secretary would have to
publish a premium with that section missing (the PDF drops a blank section), then Regenerate,
then publish again.

## Decision (owner, 2026-11-20)

Under each of the two fields, a **Use the show's current details** link that fills only that
field. The owner chose this over documenting the workaround (which does not work in one step)
and over storing the built text apart from the secretary's edits (too much for launch).

## Design

1. **The server returns the built text alongside the kept text.** `generate-premium` adds
   `builtNarratives` (the output of `buildPremiumNarratives(show)`) to its response, next to
   `narratives` (the resolved text). `GeneratedPremium` and `premiumPublishSchema` gain the field
   as optional, so an older cached response still parses. Nothing is written to the database.
2. **The link makes no request.** The editor already holds the latest server response. On Edit
   show it comes from `usePremiumFacts` when the tab opens; in the wizard and after a Regenerate
   it comes from `handleGenerate`. The link copies `builtNarratives.<field>` into that one field
   synchronously. Nothing is in flight, so it cannot overwrite text typed during a request (the
   first defect of the #4226 button).
3. **The link shows only when it would change something:** when the field's text differs from
   the built text, after trimming. A secretary who never edited a section and whose show facts
   are unchanged sees nothing new. The link's presence is also the "this section is out of date"
   signal.
4. **Holds, beyond Regenerate's.** The built text reflects the **saved** show, like everything
   else `generate-premium` reads, so the link must not offer it while the form says otherwise.
   It is disabled, with a reason line, while:
   - `isGenerating` is true;
   - `regenerateBlockedReason` is set (the unsaved organization change, the second defect of
     the #4226 button);
   - **any other Edit show field has unsaved changes.** The reason line reads "Save the show
     first, then reopen Premium to use its current details." Without this hold, a changed venue
     or date would print new in the details and old in Show Hours, because Save & Publish lays
     the editor's text over refreshed facts (`applyEditorCopyToPremium`).
     **"Unsaved" means a narrative input that Edit show can change, and no other.** The
     narratives read the non-trial fields of `NarrativeShowRow` (`premiumNarratives.ts`). A
     typed classification maps each one either to an editable Edit show form key or to "not
     editable here":
     - `name` → `name`, and `location` → `location`: editable on Basic Info;
     - `start_date` and `end_date`: not editable here (read-only, derived from the trials);
     - `venue_name`, `city` and `state`: not in `showToFormData`, so not editable here.

     Trials save from their own panel, so they are always saved. The panel compares the mapped
     form keys (today `name` and `location`) with the snapshot it opened with, and passes the
     result down as a prop, the way `savedOrganization` is passed today. Mapping to real form
     keys matters: `ShowEditFormData` extends `Record<string, unknown>`, so comparing a key the
     form never holds would compare `undefined` with `undefined` and pass silently.

     Two earlier versions of this rule were rejected in review. Both reused or trimmed the
     whole-form dirty flag. That flag turns true on its own when the editor loads its draft into
     `generatedPremium`, and an exclusion list misses every premium-tab control added later
     ("Generate exhibitor documents on save" was the first). An allowlist of the builder's
     inputs has neither problem. To keep it from drifting, a parity test fails when
     `NarrativeShowRow` gains a non-trial field that the classification does not name, reading
     the edge function the way `premiumFactsParity.test.tsx` does.
5. **Offline there is no link,** including when the editor loaded online and then lost its
   connection. `builtNarratives` stays in the editor's state after the facts query is disabled,
   so visibility is gated on `useIsOnline()` as well as on the field being present. With no
   server response there is no `builtNarratives` at all. The offline local draft does not try
   to build narratives itself.
6. **Undo is the field.** The link replaces one field's text, and the Save prompt (MYK9-2201)
   already asks before publishing edited narratives. No confirm dialog: the action is visible,
   limited to one field, and the secretary can retype.

## Out of scope

- Merging the built text into a secretary's edits.
- Any change to what `resolvePremiumNarratives` keeps on publish.
- The guide text: one sentence in the secretary guide's premium paragraph once the link ships.

## Files

- `supabase/functions/generate-premium/index.ts` (add `builtNarratives` to the response) and its tests.
- `apps/myk9show/src/types/premium-types.ts` and `features/premium/premiumPublishSchema.ts` (an optional field).
- `features/premium/PremiumEditorFields.tsx` (the link under each field). It takes `builtNarratives`
  and the disabled reason as props from `PremiumContentEditor`. That file is in flight for MYK9-2236,
  so this work waits until that PR merges.
- `docs/user-guides/secretary-guide.md` (one sentence), then `pnpm askq:prepare-docs`.

## Testing

- Unit test (edge function): the response carries `builtNarratives` equal to `buildPremiumNarratives`
  even when `narratives` keeps a published edit.
- Component tests on the real `PremiumEditorFields`:
  - the link is hidden when the text equals the built text;
  - it is shown when they differ, and clicking fills only that field;
  - it is disabled with the reason while generating, while blocked, and while the form has
    unsaved changes;
  - it is absent with no `builtNarratives`, and it disappears when the editor goes offline
    after a successful load.
- Through `ShowEditPanel` (not the editor alone):
  - opening Premium on a published show, which loads the draft, leaves the link enabled under a
    narrative that differs;
  - ticking "Generate exhibitor documents on save" leaves it enabled;
  - changing the show name or the location disables it, with the reason line.
- Parity test: the classification names every non-trial key of `NarrativeShowRow`, and each
  editable entry maps to a key `showToFormData` actually sets.
- Browser walk on a published draft: add a trial and save. Reopen Edit show › Premium, see the
  link under Trial Information, use it, then Save & Publish. In the published PDF, assert on the
  narrative paragraphs, not the schedule (`StandardBody` lists trials from structured facts
  whatever the narrative says):
  - the **Trial Information** paragraph names the new trial and the new trial count;
  - the **Show Hours** paragraph keeps its prior text.

## Deploy

`generate-premium` redeploys (a function deploy), then the next Deploy myK9Show run. Then the
guides release, for the guide sentence.

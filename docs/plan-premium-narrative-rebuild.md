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
     the editor's text over refreshed facts (`applyEditorCopyToPremium`). The panel already knows
     when it is dirty; it passes that down as a prop, just as `savedOrganization` is passed today.
     A whole-form hold is simpler than listing the inputs each narrative reads, and it cannot
     drift when a narrative starts reading a new one.
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
- Browser walk on a published draft: add a trial and save. Reopen Edit show › Premium, see the
  link under Trial Information, use it, then Save & Publish. In the published PDF, assert on the
  narrative paragraphs, not the schedule (`StandardBody` lists trials from structured facts
  whatever the narrative says):
  - the **Trial Information** paragraph names the new trial and the new trial count;
  - the **Show Hours** paragraph keeps its prior text.

## Deploy

`generate-premium` redeploys (a function deploy), then the next Deploy myK9Show run. Then the
guides release, for the guide sentence.

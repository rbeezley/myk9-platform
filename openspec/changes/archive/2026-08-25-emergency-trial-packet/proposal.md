## Why

Show-day recovery cannot depend on the same app, device, session, or local store that may have failed. For fall 2026 launch readiness, secretaries need a complete, visibly dated paper snapshot generated before each trial day, delivered outside myK9, and physically placed in the trial box.

## What Changes

- Add an Emergency Trial Packet action to the existing show-scoped Reports workflow; do not add another reports page or duplicate individual report controls.
- Compose one PDF from real show/trial/class/entry data with a cover and recovery instructions, trial catalog, per-class check-in/running order, pre-identified blank score recording pages, judge/secretary certification pages, and page-level reconstruction labels.
- Mark every page `SNAPSHOT — NOT LIVE` with the generation time, show, trial day, ring, class, date, and page number where applicable.
- Upload immutable packet snapshots to a dedicated Storage bucket and retain delivery metadata for readiness/status display.
- Email a server-derived unauthenticated packet link to the show secretary and club administrators. The email and cover both say: print it and put it in the trial box.
- Keep packet generation an explicit online operation in the existing Reports surface. Entry-close and show-eve automation can reuse the same storage/delivery contract later; this slice does not create a second server-side PDF implementation.
- Remove the unreachable fixture-only `PrintManager` from secretary preloading so no mock report code is presented as operational capability.
- Add an operator note for running on paper and transcribing paper results back into myK9.

This does not duplicate an existing page. Reports remains the canonical rendering surface; a link alone is insufficient because no current action composes, externalizes, and delivers a failure-independent artifact. Non-goals are a new packet page, decorative PDF design, automatic Deno PDF rendering, and replacing registry-specific official closeout packets.

## Capabilities

### New Capabilities

- `emergency-trial-packet`: Complete, reconstructable, out-of-band paper fallback generation, delivery, retrieval, and operational guidance.

### Modified Capabilities

- None. The change composes existing report behavior and preserves the current requirements for canonical Reports scope and explicit physical-print confirmation.

## Impact

- `apps/myk9show`: Reports-page action, pure TypeScript PDF composer, upload/delivery client, status UI, tests, and removal of the fixture-only preload.
- `supabase`: Storage bucket/policies, packet metadata, a show-scoped delivery Edge Function, recipient resolution, email delivery audit, and focused authorization tests.
- Documentation: secretary/operator recovery instructions and a required human paper-day drill.
- Dependencies: reuses existing `jspdf`, `jspdf-autotable`, Supabase Storage, Resend, report query/mapping, and show-management authorization patterns; no new package is required.

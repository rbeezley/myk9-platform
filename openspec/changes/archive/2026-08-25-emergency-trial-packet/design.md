## Context

See `proposal.md` for motivation. Reports already owns real show/trial/class/entry data through `useReportData`, maps it through `reportDataMapping.ts`, and renders the required individual paperwork. Organization-form PDF builders cover registry forms, while `OfflineReportService` and `PrintManager` are mock/localStorage-era paths and are not reliable sources for this work.

The failure-independent artifact is online-only by definition: it must leave IndexedDB and the app before failure. Core report reads remain replication-backed through the existing report query layer; Storage upload and email delivery are explicitly online administration operations. The UX must reinforce the secretary intent, “That was easy,” with one preparation action, a clear success result, and an unavoidable physical instruction.

## Goals / Non-Goals

**Goals:**

- Produce deterministic PDF bytes from the same real data contract as Reports.
- Make every page useful when physically separated and honest about snapshot staleness.
- Keep packet objects private while allowing email-link retrieval without an app session.
- Fail closed on show authorization, object ownership, recipient derivation, upload, metadata, and email errors.
- Preserve immutable packet history and explicit physical-print confirmation.

**Non-Goals at the time of this change:**

- Automatic Deno/cron PDF rendering or a second server-side report implementation. MYK9-228 later superseded this boundary by extracting the same renderer for both runtimes and adding automated per-day generation without creating a second implementation.
- A new reports, readiness, or packet page.
- Decorative fidelity to each registry's official forms; official closeout downloads remain separate.
- Treating email delivery as proof the packet was physically printed.
- Offline packet generation or upload; the useful artifact must already be external before offline recovery begins.

## Decisions

### Compose a purpose-built PDF from the Reports data contract

Add a pure TypeScript packet model/composer under the report feature. The Reports page supplies `show`, `trials`, `classes`, and `entries` already returned by `useReportData`; the composer sorts trials, classes, and entries deterministically and emits PDF bytes with the existing `jspdf` dependency and a small fixed-layout vector table renderer.

This intentionally does not render React report DOM to canvas, which would produce image-only text, inconsistent pagination, and fragile browser behavior. It also does not reuse `OfflineReportService`, whose localStorage data gathering and legacy types are fixtures rather than the live report contract. Registry PDF templates may be appended later, but the first packet uses a legible cross-registry degraded-mode recording layout so it remains complete without duplicating all organization-form code.

### Build a whole-show snapshot grouped by trial day and class (superseded)

One packet covers the show rather than requiring one action per trial. Its sections are cover/recovery, catalog, then each trial and class with check-in/running order and writable score rows, followed by certification/signature pages and transcription guidance. Page decoration is applied after content generation so every physical page carries the global snapshot identity and the most specific available trial/ring/class context.

A whole-show packet better matches the user's trial-box mental model and survives confusion over which device or email contains a given day. It also reduces opportunities to forget a class. The PDF model retains trial-day boundaries so later scheduling can redeliver the same whole-show artifact before each day.

MYK9-228 superseded the artifact unit after operational review: the shipped system creates one packet per trial day, preserving self-contained trial sections while avoiding repeated printing of already-completed days.

### Use immutable private objects plus long-lived signed URLs

Create a private `trial-packets` bucket. Paths are `<show_id>/<snapshot_uuid>.pdf`; uploads use `upsert: false`. Authenticated Storage policies authorize only `can_manage_show(show_id)`/`is_show_secretary(show_id)` for the first path segment. No public SELECT policy is added.

The delivery service verifies the caller and exact show/path relationship, verifies the object exists, and creates a signed URL lasting through the show plus a bounded post-show recovery window. A signed URL is preferable to a public bucket because packets contain names, armbands, dog registration data, and operating details. The tokenized URL still opens directly from email without an app session, satisfying the recovery requirement while limiting exposure.

### Record immutable snapshot/delivery metadata server-side

Add `trial_packet_snapshots` with packet id, show id, Storage path, generated time, generator, SHA-256, page count, byte size, delivery status, recipient count, provider message id, delivered time, and error. Writes occur in the service-role delivery function after caller authorization; app clients receive read-only show-scoped status through RLS.

The app never accepts arbitrary recipients or writes “sent” metadata optimistically. Delivery attempts are append-only audit facts. Failed delivery remains visible without overwriting the object or inventing readiness; a user retry prepares a fresh immutable snapshot and delivery attempt. Email audit uses the existing email-log conventions where compatible.

### Derive recipients from active show roles

Reuse the role-validity and show-scope authorization patterns from `send-results` and `send-targeted-message`. Resolve active `secretary`, `trial_secretary`, and `club_admin` roles scoped directly to the show or its club, join their `people.email`, deduplicate case-insensitively, and exclude missing addresses. Site/platform administrators may authorize delivery but are not automatically recipients.

The caller cannot supply `to`, `cc`, or reply-to addresses. If the configured show has no deliverable operational recipient, the operation fails with a plain action message.

### Keep preparation in Reports and reuse Paperwork Print semantics

Add an Emergency Trial Packet card/action beside the existing report controls, not a registry entry in the one-report selector: it is a composition of several reports, not another mutually exclusive report type. On success it shows generation time, recipient count, link validity, and the primary instruction “Print it and put it in the trial box.” The follow-up uses the existing explicit Paperwork Print confirmation contract; upload/email never marks paper printed.

`PrintManager` has no import outside lazy preload plumbing, so remove the lazy export/preload references and delete the fixture component after a final route/import search. This is deletion of a false surface, not replacement with another manager.

### Separate technical verification from the human acceptance gate

Unit tests cover packet ordering/content/page markers, filename/path generation, upload arguments, recipient derivation, authorization, signed-link bounds, idempotent retry, and failure reporting. Component tests use the project custom render. Edge tests run under the existing edge-test TypeScript configuration.

Technical completion additionally requires generating a real packet, opening the emailed link outside the app session, and printing. Richard recorded successful receipt, opening, and printing on 2026-08-25, but did not separately evidence a signed-out or clean-device condition. He explicitly accepted MYK9-198 for closure while waiving that stricter condition and the separate mock paper-day rehearsal; the waivers are recorded as accepted residual UAT risk rather than evidence that either exercise occurred.

## Risks / Trade-offs

- [The first slice depends on a secretary preparing the packet] → Put the action in canonical Reports with entry-close/show-eve guidance; retain a later cron-rendering option without duplicating it now.
- [Signed URLs can be forwarded] → Keep the bucket private, use unguessable immutable paths, bound validity to the show window, and avoid storing the token in app metadata.
- [A generic score-recording page may omit registry nuance] → Include all identity, running-order, timing/result, notes, and signature fields required for degraded operation; validate with the human paper-day drill and keep official registry PDFs separate.
- [Large shows can create large PDFs or slow the browser] → Use vector text/tables, deterministic pagination, a visible working state, bounded size checks, and no embedded photos.
- [Email succeeds but the paper is never printed] → Never equate delivery with physical readiness; repeat the trial-box instruction and require explicit Mark printed evidence.
- [Storage upload succeeds but delivery fails] → Retain the immutable object and failed delivery-attempt metadata for audit, surface the partial failure, and let staff prepare a fresh immutable snapshot.

## Migration Plan

1. Apply the private bucket, packet metadata table, indexes, RLS, and Storage policies.
2. Deploy and verify the authenticated delivery Edge Function with recipient/authz tests.
3. Ship the packet composer and Reports action behind the availability checks.
4. Generate and deliver a seeded-show packet; verify the signed URL from a signed-out/clean browser and print it.
5. Run the human paper-day drill before relying on the packet at a live trial, or record an explicit product-owner waiver. MYK9-198 closed on 2026-08-25 under that waiver after the live email/open/print path passed.

Rollback removes the Reports action first, leaving immutable Storage objects and metadata available to operators. The function can then be undeployed. Data/bucket deletion is deliberately not part of rollback because existing emergency artifacts may still be operationally required.

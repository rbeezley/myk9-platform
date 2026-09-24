## Why

Tracking: MYK9-694. The canonical premium publish action can fail with a generic message, blocking show publication and hiding the actionable cause. The current implementation also uploads to a public Storage bucket before the show row commits, so staged PDFs are downloadable even when publication fails.

## What Changes

- Fix the demonstrated premium publication failure and provide actionable recovery for known missing requirements.
- Keep the existing canonical publish action and per-show coordinator; do not add a new page or dialog.
- Stage an append-only PDF in a private bucket and atomically commit its trusted path with the show experience snapshot.
- Serve published PDFs through a narrow public download endpoint that signs only the path currently committed for that show.
- Preserve management-card preview for a committed draft show only after validating its bearer and checking existing `can_manage_show` / `is_show_secretary` helpers under the caller JWT; anonymous and unrelated users still receive not-found. Keep RBAC out of custom Edge role-table joins.
- Protect all publication-owned pointer, version, and experience snapshot fields across both show INSERT and UPDATE: authenticated creation is allowed only with safe empty publication defaults, and the commit RPC remains the only way to transition to published state.
- Separate durable publication/readiness metadata from ephemeral signed URLs; obtain a fresh signed URL only when a user explicitly downloads.
- Preserve legacy flat PDFs as read-only committed data through the endpoint, but remove legacy flat writes and missing-schema fallback.
- Support both PostgREST `PGRST204` and PostgreSQL `42703` exact missing-column errors during endpoint-before-migration rollout; do not disguise unrelated failures as legacy compatibility.
- Make retry safe for partial uploads, changed intent, and stale attempts; do not expose raw technical errors.
- Preserve all existing object bytes and rows, including Darboshea; no cleanup or migration of that data is in scope.

## Non-goals

- A second publishing workflow or visual redesign.
- Old-client write compatibility or rollback to a client that uses public Storage URLs.
- Deleting, moving, overwriting, or modifying Darboshea's row or Storage object.
- Applying the migration to a linked database as part of this PR.

## Impact

- Existing premium/experience publish services, shared publish hook, and publish-info reader.
- A public committed-pointer download Edge Function.
- One migration changing the bucket to private, defining publication RPCs and scoped policies.
- Client, Edge Function, and behavioral SQL regression coverage.

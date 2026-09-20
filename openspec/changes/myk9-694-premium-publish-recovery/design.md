## Design

Preserve the secretary intent of calm recovery. Diagnose the actual failing stage before editing. The trusted publication identity is the Storage object path, never a caller-supplied absolute URL. Persist that path and derive a public URL through the configured Supabase client at the read boundary.

Publishing uses a server-issued monotonic attempt version. Beginning an attempt increments the show's version before generation; the final authorized `SECURITY DEFINER` RPC commits only when that version is still current. A stalled older attempt therefore cannot overwrite a newer publish. The final RPC validates the exact staged path and atomically commits the path, timestamp, and complete experience snapshot.

New artifacts are append-only for authenticated organizers: the client may insert an exact `<show-id>/<artifact-id>.pdf` object but cannot update or delete it. The bucket accepts only PDF content within a bounded size. For rollout compatibility, the deployed/rollback app's legacy flat `<show-id>.pdf` policies temporarily retain their exact-path insert/update/delete access; the new app never writes that shape and these legacy objects are not claimed to be append-only. Failed final commits leave the last-good path, metadata, snapshot, and bytes untouched; retry reuses the same artifact id, attempt version, and timestamp, treating an already-staged object as safe partial progress. Cleanup is a separate privileged operation, not part of the versioned organizer publish policy.

Every UI entry point routes through one per-show attempt coordinator. Known Edge Function failures are classified from the real `FunctionsHttpError` response body, while technical payloads remain in logs and the organizer sees plain recovery guidance.

## Risks

- PDF upload can succeed before the experience snapshot update; retry must safely complete rather than duplicate.
- An older stalled attempt can resume after a newer publish; the server-side attempt version must reject it.
- Immutable public objects accumulate; privileged garbage collection is intentionally separate from publication.
- Over-broad error matching could mislead; tests must pin stage/cause classification.
- Storage/RLS and RPC behavior require migration-level authorization and behavioral SQL coverage.

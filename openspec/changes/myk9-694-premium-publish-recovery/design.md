## Design

Preserve the secretary intent of calm recovery. Diagnose the actual failing stage before editing. The trusted publication identity is the Storage object path. The new app sends the URL derived for that exact path, and PostgreSQL accepts it only when it exactly matches one of the known public Storage origins plus that path. The row stores both values in the same transaction so versioned readers can verify one publication identity; legacy flat writes remain URL-only.

Publishing uses a server-issued monotonic attempt version. Beginning an attempt increments the show's version before generation; the final authorized `SECURITY DEFINER` RPC commits only when that version is still current. A stalled older attempt therefore cannot overwrite a newer publish. The final RPC validates the exact staged path and URL and atomically commits path, URL, timestamp, version, and complete experience snapshot.

| App | Database | Write behavior                                             | Read behavior |
| --- | -------- | ---------------------------------------------------------- | ------------- |
| old | old      | legacy flat URL/path                                       | legacy URL    |
| new | old      | legacy fallback only on missing-RPC schema error           | legacy URL    |
| old | new      | legacy flat write; trigger clears stale versioned identity | legacy URL    |
| new | new      | immutable versioned path + exact URL committed together    | trusted path  |

The retry identity fingerprints the complete `{ premium, inkSaver }` intent. A changed intent obtains a fresh artifact and server version; only the same validated intent can reuse both. Invalid persisted attempts are discarded, stale attempts are evicted and require an explicit retry, and different in-flight intents for the same show conflict instead of joining one another.

New artifacts are append-only for authenticated organizers: the client may insert an exact `<show-id>/<artifact-id>.pdf` object but cannot update or delete it. The bucket accepts only PDF content within a bounded size. For rollout compatibility, the deployed/rollback app's legacy flat `<show-id>.pdf` policies temporarily retain their exact-path insert/update/delete access; the new app never writes that shape and these legacy objects are not claimed to be append-only. Failed final commits leave the last-good path, metadata, snapshot, and bytes untouched; retry reuses the same artifact id, attempt version, and timestamp, treating an already-staged object as safe partial progress. Cleanup is a separate privileged operation, not part of the versioned organizer publish policy.

Migration `20260712130000` removed the bucket-wide public `SELECT` policy because it enabled directory listing and exposed premium URLs before sharing. The legacy Storage upsert still needs row visibility for its `UPDATE`, so the compatibility migration grants `SELECT` only to authenticated managers/club-scoped secretaries/platform admins for exact flat `<show-id>.pdf` objects belonging to shows they may manage. This does not restore anonymous or bucket-wide/versioned-object listing; authorized show staff can see legacy object metadata for shows they manage.

Every UI entry point routes through one per-show attempt coordinator. Known Edge Function failures are classified from the real `FunctionsHttpError` response body, while technical payloads remain in logs and the organizer sees plain recovery guidance, including an actionable correction in the header action surface.

## Risks

- PDF upload can succeed before the experience snapshot update; retry must safely complete rather than duplicate.
- An older stalled attempt can resume after a newer publish; the server-side attempt version must reject it.
- Immutable public objects accumulate; privileged garbage collection is intentionally separate from publication.
- Over-broad error matching could mislead; tests must pin stage/cause classification.
- Storage/RLS and RPC behavior require migration-level authorization and behavioral SQL coverage.

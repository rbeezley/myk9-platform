## Design

Preserve the secretary intent of an easy, reversible choice. Preview is the canonical style editor; `ShowEditPremiumTab` shows the current style and deep-links to Preview instead of duplicating the selector. Preview state may be local until Save, Cancel restores the persisted style, and Save uses the established mutation flow. Available choices must come from the canonical entitlement source. No new page is justified.

## Persistence boundary

Saving a style uses `public.update_show_style(uuid, text)`, the server-authorized
command from migration `20260920130937_myk9_691_update_show_style.sql`. The RPC
is authenticated-only, scopes the show to a site admin or manager of its club,
and requires effective account Premium for every style except `monogram`. It
updates only `shows.style` and returns the replication version; it must not
overwrite unrelated show fields. A database trigger rejects direct
invoker-level updates to `shows.style`, preserving the RPC as the enforceable
client boundary. The client mutation remains style-only and offline-safe: it
must not fabricate a cold local row, must discard a queued mutation if its
local replica write fails, must reconcile permanent server rejection against
the show's outstanding style-mutation lineage and warm caches, must patch every
field returned by the canonical mutation into the local cache, and must keep
async pending/error state scoped to the show being saved.

## Rejected style mutation recovery

The first rollback implementation compared the current row style with one
failed mutation's attempted style. That is insufficient when two saves overlap:
an older rejection can be followed by a newer rejection, and discarding both
can leave a dirty row with no queued mutation to clear it.

Keep the style in the replicated row so offline Preview continues to show the
latest durable local choice after reload. Reconcile by mutation lineage instead
of adding per-error style comparisons: read pending and failed mutations for the
show, select the newest remaining `update_show_style` intent by queue sequence
(timestamp and ID are legacy tie-breakers), then reconcile the row to that
intent. If no style intent remains, restore the clean base style. Preserve dirty
state only while unrelated row mutations remain; otherwise mark the restored
row clean. Failure handling excludes the just-failed mutation, and discard
triggers reconciliation after it has been removed. Retry re-enters the pending
queue with its original sequence and retains the associated local style until
it succeeds or is discarded.

An alternative is to stop writing style optimistically into the replicated
show and derive an offline overlay from queued RPC mutations. That avoids row
rollback, but requires startup hydration and every Preview/public/print reader
to understand a second source of style state. The queue already stores the
style intent, but existing readers consume replicated show rows; this would
spread new behavior across the app. Mutation-lineage reconciliation uses the
existing offline row and queue APIs, so it is the smaller durable design.

Preview is a draft choice until Save. A canceled or failed save leaves the
persisted style active, while a successful draft save updates the pending
presentation and the persisted style used by public and printable surfaces.

## Risks

- Local preview state could leak into persisted data on Cancel; test it.
- A duplicated options list could drift from entitlements; reuse the canonical source.
- Save errors could leave ambiguous state; reconcile deferred rejection to the persisted style and show plain recovery copy.
- Multiple rejected style edits could leave dirty replica state; reconcile the whole show-scoped style lineage and preserve unrelated queued edits.
- Generic show saves could clobber style; exclude `style` from generic update payloads and form persistence.

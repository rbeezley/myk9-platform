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
local replica write fails, must reconcile permanent server rejection to the
clean replica base and warm caches, must patch every field returned by the
canonical mutation into the local cache, and must keep async pending/error
state scoped to the show being saved.

Preview is a draft choice until Save. A canceled or failed save leaves the
persisted style active, while a successful draft save updates the pending
presentation and the persisted style used by public and printable surfaces.

## Risks

- Local preview state could leak into persisted data on Cancel; test it.
- A duplicated options list could drift from entitlements; reuse the canonical source.
- Save errors could leave ambiguous state; reconcile deferred rejection to the persisted style and show plain recovery copy.
- Generic show saves could clobber style; exclude `style` from generic update payloads and form persistence.

## Why

> "They exist in Supabase. This UI is not going to work. Secretaries are going to need to see the codes later otherwise they will think they are missing like I did and constantly regenerate them. All 4 codes should be shown to the secretary. Exhibitors should only see the exhibitor code."

> "Every role should see exhibitor code since it is read only and their own code. For example Judge should see Judge and exhibitor code. Secretary and site admin should see all 4 codes."

The current one-time plaintext display makes valid access codes look missing after navigation or refresh, encouraging secretaries to revoke and redistribute working credentials unnecessarily. Persistently recoverable, role-scoped display supports fall 2026 launch readiness by making a show-day access task calm and reliable for secretaries while limiting exhibitors to the credential intended for them.

## What Changes

- Store each newly generated show access code in recoverable encrypted form alongside its validation hash.
- Add a server-authorized read path that returns all four codes to users who can manage the show, judge plus exhibitor codes to assigned judges, steward plus exhibitor codes to assigned stewards, and only the exhibitor code to authenticated exhibitors with an active entry in that show.
- Load and display saved codes on the existing Show Access Codes card after navigation or refresh.
- Preserve regeneration as an explicit reset action, with the regenerated values immediately persisted for later display.
- Handle existing hash-only rows honestly: explain that their original plaintext cannot be recovered and require one final regeneration to establish recoverable encrypted values.
- Keep anonymous visitors and authenticated users without a qualifying show role or active show entry from receiving any code.
- Add database authorization, migration-contract, component, and audience tests.
- Non-goals: add a new access-code page, duplicate the card on another surface, change passcode validation or ringside claims, expose judge/steward/admin codes to exhibitors, or attempt an expensive brute-force recovery of legacy hashes.

This does not duplicate an existing page. The shared Show Access Codes card already appears in the show Overview, Settings, and Show Desk tools; making that component load the authoritative values is the coherent fix, and a link cannot solve missing data on the existing destination.

## Capabilities

### New Capabilities

- `recoverable-show-access-codes`: Secure encrypted persistence, audience-scoped retrieval, legacy handling, and durable display of show access codes.

### Modified Capabilities

- None.

## Impact

- Database: `public.show_passcodes`, passcode generation/regeneration RPCs, a new role-scoped retrieval RPC, grants, and migration-contract tests.
- UI: the shared `ShowAccessCodesCard`, Show Overview audience context, and focused component/page tests.
- Security: recoverable ciphertext remains inaccessible through direct table reads; decryption occurs only inside a `SECURITY DEFINER` function that authorizes the current user and returns the minimum role set.
- Operations: existing hash-only shows need one last code regeneration after deployment; no production database push is included without explicit approval.

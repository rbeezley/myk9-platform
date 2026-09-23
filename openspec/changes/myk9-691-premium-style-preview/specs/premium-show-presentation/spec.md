## ADDED Requirements

### Requirement: Organizer previews and saves an entitled show style

An authorized organizer SHALL be able to use the existing Preview experience to select among entitled styles, see the pending presentation before saving, and explicitly save or cancel the draft style change. The Preview controls SHALL remain the only style editor.

The Save action SHALL require an online connection. While offline, Save SHALL be disabled and the UI SHALL explain that style changes are not stored offline. The pending selection SHALL remain local preview state; Cancel SHALL restore the persisted style.

Save SHALL call `public.update_show_style(uuid, text)` using the authenticated session captured at the start of the operation. The database RPC SHALL authorize only a site admin or a manager of the show's club, require effective account Premium for every style except Monogram, update only `shows.style`, and return the updated show version. It SHALL return SQLSTATE `42501` for authorization or entitlement denial and `22023` for invalid style or missing show input. Raw authenticated updates to `shows.style` SHALL be rejected.

Before calling the RPC, the client SHALL require that the current owner matches the session owner, the local show row is clean, and no pending mutation exists for that show. After RPC acknowledgement, it SHALL verify that the owner still matches and request the established replication sync. The RPC's show update SHALL advance `updated_at` and the replication version so the incremental show sync can refresh persistent readers. The style-save client SHALL NOT write the shared replica or patch query caches; the mounted Preview SHALL show the acknowledged style, while other readers update when normal sync completes.

If the owner changes while the RPC is in flight, the client SHALL NOT request sync for the new account. Generic show edits SHALL omit `style` so they cannot overwrite the RPC-owned value. Save acknowledgement SHALL NOT be presented as proof that other local readers have already refreshed.

Draft and published presentation SHALL remain distinct: the style Save changes the draft style only. Public rendering SHALL continue to use the published snapshot until the existing publish action updates it.

The client SHALL NOT queue style saves offline or add a style projection lifecycle to the generic mutation manager, upload runner, queue, or sync result. This requirement does not change existing generic replica account-isolation behavior.

The SQL boundary SHALL also cover authenticated user-originated privileged show writers. In particular, a free-plan club manager calling `create_show_with_children` with a Premium style SHALL be rejected atomically; Monogram and an entitled Premium manager SHALL remain valid controls.

#### Scenario: Default style is shown

- **WHEN** a show has no explicit style
- **THEN** Preview clearly indicates Monogram as the current default

#### Scenario: Pending style is previewed and saved

- **WHEN** an online organizer selects an entitled style and saves
- **THEN** Preview updates before save and the authorized RPC persists that exact draft style for the public and printable presentation data

#### Scenario: Offline save is unavailable

- **WHEN** the device is offline and a style is selected
- **THEN** Save is disabled, the UI explains that styles are not saved offline, and no RPC or replica mutation is attempted

#### Scenario: Change is canceled or the RPC fails

- **WHEN** the organizer cancels or the server rejects the save
- **THEN** the persisted style remains active and the outcome is understandable

#### Scenario: Save outcome is ambiguous

- **WHEN** the client cannot confirm whether the server committed the save
- **THEN** the UI does not claim that the previous style is still active and directs the organizer to sync and reload before retrying

#### Scenario: Unentitled style is unavailable

- **WHEN** a style is outside the show or account entitlement
- **THEN** it is not offered as a selectable style, and the server remains authoritative at Save time

#### Scenario: Server authorization is narrow

- **WHEN** a caller is not a site admin or manager of the show club, or lacks effective account Premium for a non-Monogram style
- **THEN** the RPC rejects the save with SQLSTATE `42501` and leaves every show field unchanged

#### Scenario: Pending local work blocks style Save

- **WHEN** the show's replica row is dirty or the authenticated owner's queue has a pending mutation for that show
- **THEN** the RPC is not called and the organizer is told to sync the show's pending changes first

#### Scenario: Account changes during preflight

- **WHEN** the authenticated owner changes while clean-row and queue checks are in flight
- **THEN** the RPC is not called under the previously captured session

#### Scenario: Other readers refresh through normal sync

- **WHEN** the style RPC acknowledges the save for the same authenticated owner
- **THEN** the client requests normal replication sync and does not write the shared replica or query caches directly; other readers reflect the style after a successful sync

#### Scenario: Account changes during save

- **WHEN** the authenticated owner changes while the RPC is in flight
- **THEN** no sync request is dispatched for the new account, and the organizer is told the style may already have been saved

#### Scenario: Draft and published presentation stay distinct

- **WHEN** an organizer previews or saves a draft style on a show with a published experience
- **THEN** the Preview uses the draft choice and the public published snapshot remains unchanged until the existing publish action

#### Scenario: Direct table style update cannot bypass the RPC

- **WHEN** an authenticated client issues a raw `UPDATE public.shows SET style = ...`
- **THEN** the database rejects it with SQLSTATE `42501`

#### Scenario: Privileged show creation enforces entitlement

- **WHEN** a free-plan manager calls `create_show_with_children` with a Premium style
- **THEN** the operation fails with authorization SQLSTATE and creates neither the show nor its children; Monogram and entitled Premium cases succeed

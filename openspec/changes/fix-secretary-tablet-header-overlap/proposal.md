## Why

The final Go Live 0.7 secretary re-walk found that the canonical Setup and Show Desk header overlaps the show title with the published-state control at a 768px tablet viewport. This breaks the secretary's "That was easy" orientation at the exact width commonly used for show-day tablets and must be fixed before the re-walk can be signed off.

Original request: "can you work on what is remaining for 0.7"

## What Changes

- Make the existing show-management header responsive so the title, status control, and actions remain separately readable and usable at tablet widths.
- Preserve the same canonical Setup and Show Desk routes, show metadata, status control, and actions at every supported viewport.
- Add a focused responsive regression test or source-level guard for the tablet header arrangement.
- Re-run the affected authenticated Setup and Show Desk checks at desktop, tablet, and mobile widths.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `secretary-show-workbench-guidance`: the canonical workbench header must remain readable and non-overlapping on touch-width layouts.

## Impact

- Affected code: the existing Show Management Shell header and its focused tests/styles.
- No route, dialog, data model, replication path, API, or shared-system change.
- Duplication check: this changes the layout of the existing canonical Setup/Show Desk header; a link or new surface would not address the overlap and would fragment the secretary workflow.
- Non-goals: no new workbench, status control, action menu, or responsive navigation pattern; no visual redesign outside the header's narrow-width layout.

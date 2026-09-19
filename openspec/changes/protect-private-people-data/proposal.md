## Why

Any club admin or secretary can currently read every row in `people`, including a minor handler's date of birth and home address. Closing that cross-club PII boundary is a fall 2026 launch-readiness requirement because the directory's broad operational search should not imply broad access to private identity fields.

## What Changes

- Move junior-handler private fields out of the broadly searchable people directory into a narrowly authorized private relation.
- Permit a person to read and maintain their own private fields, and permit show managers to read them only for people connected to shows they manage.
- Keep existing directory/search behavior for non-private fields unchanged.
- Add migration contract and behavioral SQL coverage for self, related manager, unrelated manager, exhibitor, and anonymous access.
- Non-goals: re-scope all directory fields, redesign people management, or add a second people-management surface.
- Duplication check: this changes the authorization boundary behind existing surfaces; no new page, dialog, or duplicate workflow is introduced, and a link cannot secure data returned by the current table policy.

## Capabilities

### New Capabilities

- `people-private-data-access`: Private person fields are separated from the searchable directory and readable only by the subject or a manager of a related show.

### Modified Capabilities


## Impact

- Supabase migration, grants, RLS policies, generated database types, and junior-handler read/write paths.
- High-risk migration requiring explicit live-data survey, migration audit, dry run, and post-merge database-push approval.

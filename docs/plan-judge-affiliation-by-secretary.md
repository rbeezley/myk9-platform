# A show's secretary sets a judge's affiliation (MYK9-2294)

> **Status:** Active

Design first (orchestrate rule, #4224): this changes who may write part of a person's record, so
it is reviewed before any code. The owner decided on 2026-11-19 to use option B, a single-field
RPC. Parent: MYK9-2292, which shipped `people.judge_affiliation` in #4239.

## What exists today

- `people.judge_affiliation` (ASCA §1.5.7) is written only by `update_person_details`, which is
  gated by `person_edit_allowed`. That check admits:
  - the person;
  - a site admin;
  - `can_manage_show_person`, which needs the person to be an owner or handler on an entry in a
    show the caller manages;
  - a person created from a show the caller manages;
  - a person the caller created with an unlinked account.
- Gaps in that check:
  - A judge with a login and no entries fails every branch, so the secretary cannot set the
    affiliation, although ASCA requires it on the premium.
  - #4239's checklist line therefore says "Ask the judge to add it on their profile".
- `can_manage_show(show_id)` (latest: `20261113222900_myk9_1886_one_club_admin_rule.sql`) is the
  established "may this caller manage this show" check. It is SECURITY DEFINER with
  `search_path=''`.
- `judge_assignments` links a person to a show (`show_id`, `person_id`, `status`). Its
  `declined` and `cancelled` statuses do not print on the premium (#4239's judge set).

## The change

**One new RPC, `set_judge_affiliation(p_person_id uuid, p_show_id uuid, p_affiliation text)`.**
It is SECURITY DEFINER with `search_path=''`, executable by `authenticated` only, and revoked
from PUBLIC and anon.

- **Who may call it.** The caller must pass `can_manage_show(p_show_id)`. The person must also
  hold a `judge_assignments` row on that show whose status is not `declined` or `cancelled`.
- **What it writes.** It writes only `people.judge_affiliation`: `nullif(btrim(p_affiliation),
'')`, kept within the existing 200-character CHECK. No other column changes. It does not go
  through `update_person_details`, so it cannot become a general person editor.
- **Refusals.** A caller who fails either test gets 42501. A person who is not on the show gets
  the same 42501, so the RPC never reveals whether a person exists.
- **Why the show is passed in.** The permission is "you manage a show this person judges". The
  RPC checks that one show instead of searching every show. The editor already knows which show
  it is in.
- **Unchanged.** `person_edit_allowed` stays exactly as it is. The judge can still edit their own
  affiliation from their profile, as today.

**The app.**

- Where the secretary manages a show's judges (the existing judges list in Edit show), each
  judge on an ASCA show gets an "Affiliation" field that saves through the RPC.
- The checklist line from #4239 then links there ("Add <name>'s affiliation") instead of saying
  "ask the judge".
- No new page.

## Alternatives weighed

- **A new branch in `person_edit_allowed` for "judge on a show I manage".** Rejected: it would
  open the judge's whole person record (address, phone, email) to every secretary of any show
  they judge.
- **Do nothing.** Rejected by the owner: the secretary is the one preparing the premium.

## Risks

- **Two writers of one field.** The judge on their profile and a secretary through the RPC can
  overwrite each other. Last write wins, the same as today between the judge and a site admin.
  This is acceptable for a one-line credential.
- **A secretary of a show the judge only judges once can change the affiliation the judge shows
  at every other show.** Accepted, because the affiliation is the judge's standing and not
  show-specific. The person editor still shows the current value to the judge.

## Testing phase

**SQL tests, under `supabase/tests`, registered in the runner:**

- a manager of the show sets and clears the affiliation of an assigned judge;
- 42501 for each of these:
  - a manager of another show;
  - a secretary of the show whose target person is not assigned;
  - a declined or cancelled assignment;
  - anon;
- no other `people` column changes;
- the 200-character limit holds;
- `person_edit_allowed` is unchanged, checked by comparing its function definition before and
  after.

**App test.** The affiliation field on an ASCA show's judge saves through the RPC. The checklist
links to it.

**Checks.** `pnpm qa:sql-local` passes, and the migration auditor reviews the migration.

**Deploy order.** The migration, then the site.

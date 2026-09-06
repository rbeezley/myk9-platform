-- Multiple browser tabs/processes can race before the client in-flight guard
-- runs. Enforce the one-active-cart invariant at the database boundary too.

begin;

-- Old clients could leave expired rows at status='active'. Clear those stale
-- shells first, then retain the newest live cart when historical races left
-- more than one active row for the same show and exhibitor.
update public.entry_carts
set status = 'expired'
where status = 'active'
  and (expires_at is null or expires_at <= now());

with ranked_active_carts as (
  select
    id,
    row_number() over (
      partition by show_id, exhibitor_id
      order by created_at desc, id desc
    ) as row_number
  from public.entry_carts
  where status = 'active'
)
update public.entry_carts carts
set status = 'expired'
from ranked_active_carts ranked
where carts.id = ranked.id
  and ranked.row_number > 1;

create unique index if not exists entry_carts_active_show_exhibitor_unique_idx
  on public.entry_carts (show_id, exhibitor_id)
  where status = 'active';

commit;

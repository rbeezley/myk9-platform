-- Multiple browser tabs/processes can race before the client in-flight guard
-- runs. Enforce the one-active-cart invariant at the database boundary too.

begin;

create unique index if not exists entry_carts_active_show_exhibitor_unique_idx
  on public.entry_carts (show_id, exhibitor_id)
  where status = 'active';

commit;

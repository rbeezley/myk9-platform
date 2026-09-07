-- MYK9-439: add the three foreign-key indexes introduced after the MYK9-113 sweep.
--
-- These are additive only. Each index puts its foreign-key column first so
-- PostgreSQL can use it for parent-row referential checks and joins.

begin;

create index calendar_feed_tokens_show_id_fk_idx
  on public.calendar_feed_tokens (show_id);
create index show_officials_person_id_fk_idx
  on public.show_officials (person_id);
create index show_officials_created_by_fk_idx
  on public.show_officials (created_by);

do $$
declare
  target_fk_count bigint;
  target_fk_pair_count bigint;
  missing text[];
begin
  select count(*), count(distinct format('%I.%I', t.relname, a.attname))
  into target_fk_count, target_fk_pair_count
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and cardinality(c.conkey) = 1
    and n.nspname = 'public'
    and (
      (t.relname = 'calendar_feed_tokens' and a.attname = 'show_id')
      or (t.relname = 'show_officials' and a.attname = 'person_id')
      or (t.relname = 'show_officials' and a.attname = 'created_by')
    );

  if target_fk_count <> 3 or target_fk_pair_count <> 3 then
    raise exception
      'MYK9-439 expected exactly three single-column public target FKs, found % constraint(s) across % pair(s)',
      target_fk_count,
      target_fk_pair_count;
  end if;

  select array_agg(format('%I.%I', t.relname, a.attname) order by t.relname, a.attname)
  into missing
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f'
    and cardinality(c.conkey) = 1
    and n.nspname = 'public'
    and (
      (t.relname = 'calendar_feed_tokens' and a.attname = 'show_id')
      or (t.relname = 'show_officials' and a.attname = 'person_id')
      or (t.relname = 'show_officials' and a.attname = 'created_by')
    )
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = c.conrelid
        and i.indisvalid
        and i.indisready
        and i.indislive
        and i.indpred IS NULL
        and (i.indkey::smallint[])[0:cardinality(c.conkey) - 1] @> c.conkey
    );

  if missing is not null then
    raise exception 'MYK9-439 missing FK-leading indexes: %', array_to_string(missing, ', ');
  end if;
end
$$;

commit;

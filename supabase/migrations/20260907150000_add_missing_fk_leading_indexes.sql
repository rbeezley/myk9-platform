-- MYK9-439: add the three foreign-key indexes introduced after the MYK9-113 sweep.
--
-- These are additive only. Each index puts its foreign-key column first so
-- PostgreSQL can use it for parent-row referential checks and joins.

-- These indexes intentionally run outside an explicit transaction so each
-- non-concurrent build releases its table lock before the next one starts.
-- Refuse to wait behind live writes for more than five seconds, and require a
-- separate concurrent-index plan before any target relation reaches 100 MB.
set lock_timeout = '5s';
set statement_timeout = '10min';

do $$
declare
  oversized text;
begin
  select string_agg(
    format('%I.%I (%s)', n.nspname, c.relname, pg_size_pretty(pg_relation_size(c.oid))),
    ', '
    order by c.relname
  )
  into oversized
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname = 'public'
    and c.relname in ('calendar_feed_tokens', 'show_officials')
    and pg_relation_size(c.oid) >= 100 * 1024 * 1024;

  if oversized is not null then
    raise exception
      'MYK9-439 requires a concurrent-index plan before indexing relations at or above 100 MB: %',
      oversized;
  end if;
end
$$;

create index if not exists calendar_feed_tokens_show_id_fk_idx
  on public.calendar_feed_tokens (show_id);
create index if not exists show_officials_person_id_fk_idx
  on public.show_officials (person_id);
create index if not exists show_officials_created_by_fk_idx
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

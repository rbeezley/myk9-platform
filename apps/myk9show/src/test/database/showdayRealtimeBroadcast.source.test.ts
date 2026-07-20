import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260718210000_migrate_showday_realtime_to_broadcast.sql'
);

const migration = readFileSync(migrationPath, 'utf8');

describe('show-day Realtime Broadcast migration', () => {
  it('broadcasts only a table-name invalidation signal on a private show topic', () => {
    expect(migration).toMatch(
      /realtime\.send\(\s*jsonb_build_object\('table',\s*TG_TABLE_NAME\),\s*'showday_change',\s*v_topic,\s*true\s*\)/s
    );
    expect(migration).toContain("format('show:%s:changes', show_id)");
  });

  it('allows clients to receive only correctly scoped private show topics', () => {
    expect(migration).toMatch(
      /CREATE POLICY "show-day change signals are readable"[\s\S]*ON realtime\.messages[\s\S]*FOR SELECT[\s\S]*TO anon, authenticated/s
    );
    expect(migration).toContain('realtime.topic() ~');
    expect(migration).toContain(':changes$');
  });

  it('routes entries and classes through one failure-isolated trigger function', () => {
    expect(migration).toContain('OLD.show_id');
    expect(migration).toContain('NEW.show_id');
    expect(migration).toContain('OLD.trial_id');
    expect(migration).toContain('NEW.trial_id');
    expect(migration).toContain('SELECT DISTINCT');
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN');
    expect(migration).toContain('RAISE WARNING');
    expect(migration).toMatch(
      /CREATE TRIGGER broadcast_entries_showday_change[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*ON public\.entries/s
    );
    expect(migration).toMatch(
      /CREATE TRIGGER broadcast_classes_showday_change[\s\S]*AFTER INSERT OR UPDATE OR DELETE[\s\S]*ON public\.classes/s
    );
  });

  it('removes only the approved high-cost and dead publication tables', () => {
    for (const table of ['entries', 'classes', 'show_message_threads']) {
      expect(migration).toContain(`ALTER PUBLICATION supabase_realtime DROP TABLE public.${table}`);
    }

    for (const table of ['shows', 'show_announcements', 'show_messages']) {
      expect(migration).not.toContain(
        `ALTER PUBLICATION supabase_realtime DROP TABLE public.${table}`
      );
    }
  });
});

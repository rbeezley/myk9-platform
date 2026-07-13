import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const migrationSql = readdirSync(resolve(root, 'supabase/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');
const compactSql = migrationSql.replace(/\s+/g, ' ');

describe('shared entry capacity enforcement', () => {
  it('routes both entry write boundaries through one class-and-judge decision', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity');
    expect(migrationSql.match(/FROM public\.evaluate_entry_capacity/g)).toHaveLength(2);
    expect(migrationSql).toContain('max_entries');
    expect(migrationSql).toContain('hashtext(p_class_id::text)');
    expect(compactSql).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
  });

  it('pins source authorization and mail-in reserve behavior', () => {
    expect(migrationSql).toContain("submission_source IN ('organizer', 'show_desk')");
    expect(migrationSql).toContain("submission_source = 'self_service'");
    expect(migrationSql).toContain('mail_in_reserved');
    expect(migrationSql).toContain("submission_source = 'show_desk'");
    expect(migrationSql).toContain('capacity_override');
  });

  it('returns mixed outcomes without adding non-created rows to legacy entries', () => {
    expect(migrationSql).toContain("'outcome', 'created'");
    expect(migrationSql).toContain("'outcome', 'waitlisted'");
    expect(migrationSql).toContain("'outcome', 'denied'");
    expect(migrationSql).toContain("'outcomes', to_jsonb(v_outcomes)");
    expect(migrationSql).toContain("'entries', to_jsonb(v_entry_pairs)");
  });

  it('keeps active dog-class waitlisting idempotent under concurrent overflow', () => {
    expect(migrationSql).toContain('waitlist_entries_active_class_dog_key');
    expect(migrationSql).toContain("status IN ('waiting', 'offered')");
    expect(migrationSql).toContain('ON CONFLICT');
  });

  it('keeps the shared decision inaccessible to clients', () => {
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.evaluate_entry_capacity');
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.evaluate_entry_capacity[^;]+TO (?:anon|authenticated)/
    );
  });
});

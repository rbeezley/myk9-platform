import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const migrationSql = readFileSync(
  resolve(root, 'supabase/migrations/20260712200000_entry_capacity_enforcement.sql'),
  'utf8'
);
const compactSql = migrationSql.replace(/\s+/g, ' ');
const rollbackSqlPath = resolve(root, 'scripts/qa/rollback-entry-capacity-enforcement.sql');

describe('shared entry capacity enforcement', () => {
  it('routes both entry write boundaries through one class-and-judge decision', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.evaluate_entry_capacity');
    expect(migrationSql.match(/FROM public\.evaluate_entry_capacity/g)).toHaveLength(2);
    expect(migrationSql).toContain('max_entries');
    expect(migrationSql).toContain('hashtext(p_class_id::text)');
    expect(compactSql).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
    expect(migrationSql.indexOf("hashtext('showcapacity:'")).toBeLessThan(
      migrationSql.indexOf('hashtext(p_class_id::text)')
    );
    expect(migrationSql.indexOf('hashtext(p_class_id::text)')).toBeLessThan(
      migrationSql.indexOf("hashtext('judgeday:'")
    );
  });

  it('pins source authorization and mail-in reserve behavior', () => {
    expect(migrationSql).toContain("submission_source IN ('organizer', 'show_desk')");
    expect(migrationSql).toContain("submission_source = 'self_service'");
    expect(migrationSql).toContain('available_spots');
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
    expect(migrationSql).toContain("status IN ('waiting', 'offered')");
    expect(migrationSql).toContain(
      "ON CONFLICT (class_id, dog_id) WHERE status IN ('waiting', 'offered')"
    );
  });

  it('keeps the shared decision inaccessible to clients', () => {
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.evaluate_entry_capacity');
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.evaluate_entry_capacity[^;]+TO (?:anon|authenticated)/
    );
  });

  it('anchors self-service waitlist ownership to the authenticated enrollment owner', () => {
    expect(compactSql).toContain(
      'WHERE en.id = p_registration_id AND en.show_id = p_show_id AND (v_is_official OR en.handler_id = v_caller_person_id)'
    );
  });

  it('authorizes the registration before returning an idempotent result', () => {
    const ownershipGuard = migrationSql.indexOf('registration % does not belong to the caller');
    const idempotentReturn = migrationSql.indexOf('-- Idempotent retry after authorization');
    const closeGuard = migrationSql.indexOf('entry period has closed for show %');

    expect(ownershipGuard).toBeGreaterThan(-1);
    expect(idempotentReturn).toBeGreaterThan(ownershipGuard);
    expect(closeGuard).toBeGreaterThan(idempotentReturn);
    expect(compactSql).toContain(
      "pg_advisory_xact_lock(hashtext('entrysubmission:' || p_submission_id::text))"
    );
    expect(compactSql).toContain(
      "IF v_result->>'registration_id' IS DISTINCT FROM p_registration_id::text THEN"
    );
  });

  it('ships an executable rollback that restores both replaced RPCs before dropping the helper', () => {
    const rollbackSql = readFileSync(rollbackSqlPath, 'utf8');

    expect(rollbackSql).toContain('20260628202146_create_online_paid_entry_capacity_gate.sql');
    expect(rollbackSql).toContain('20260711190000_guard_submit_show_entries_entry_open.sql');
    expect(rollbackSql).toContain(
      'DROP FUNCTION public.evaluate_entry_capacity(uuid, uuid, uuid, uuid, text, boolean)'
    );
  });
});

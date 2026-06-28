import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const webhookSource = readFileSync(
  resolve(root, 'apps/myk9show/supabase/functions/stripe-webhook/index.ts'),
  'utf8'
);

const migrationSql = readdirSync(resolve(root, 'supabase/migrations'))
  .filter(file => file.endsWith('.sql'))
  .sort()
  .map(file => readFileSync(resolve(root, 'supabase/migrations', file), 'utf8'))
  .join('\n');
const compactMigrationSql = migrationSql.replace(/\s+/g, ' ');

describe('stripe webhook online cart capacity gate', () => {
  it('routes paid cart entry creation through the atomic capacity RPC', () => {
    expect(webhookSource).toContain("rpc('create_online_paid_entry'");
    expect(webhookSource).not.toContain(".from('entries')\n      .insert(\n        buildEntryInsert");
  });

  it('locks each judge-day before reading capacity and inserting the online entry', () => {
    expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.create_online_paid_entry');
    expect(compactMigrationSql).toContain(
      "hashtext('judgeday:' || v_judge_id::text || ':' || v_trial_date::text)"
    );
    expect(migrationSql).toContain(
      'FROM public.get_judge_day_capacity(v_judge_id, v_show_id, v_trial_date)'
    );
    expect(migrationSql).toContain('COALESCE(v_judge_capacity.available_spots, 0) <= 0');
    expect(migrationSql).toContain('INSERT INTO public.entries');
  });

  it('keeps the online capacity RPC service-role only', () => {
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.create_online_paid_entry'
    );
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.create_online_paid_entry');
    expect(migrationSql).toContain('TO service_role');
    expect(migrationSql).not.toContain(
      'GRANT EXECUTE ON FUNCTION public.create_online_paid_entry(uuid, uuid, uuid, numeric, text, text, text, timestamptz, uuid, uuid) TO authenticated'
    );
  });
});

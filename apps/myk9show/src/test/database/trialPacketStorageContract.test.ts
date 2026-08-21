import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  import.meta.dirname,
  '../../../../../supabase/migrations/20260820220000_emergency_trial_packets.sql'
);

describe('emergency trial packet storage contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it('keeps packet objects private and immutable', () => {
    expect(sql).toMatch(/VALUES \('trial-packets', 'trial-packets', false/i);
    expect(sql).toMatch(/ON storage\.objects FOR INSERT[\s\S]*bucket_id = 'trial-packets'/i);
    expect(sql).not.toMatch(/ON storage\.objects FOR SELECT[\s\S]*bucket_id = 'trial-packets'/i);
    expect(sql).not.toMatch(/ON storage\.objects FOR (UPDATE|DELETE)[\s\S]*bucket_id = 'trial-packets'/i);
  });

  it('authorizes uploads from the show id path prefix', () => {
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\][\s\S]*can_manage_show/i);
    expect(sql).toMatch(/storage\.foldername\(name\)\)\[1\][\s\S]*is_show_secretary/i);
  });

  it('makes snapshot metadata append-only and manager-readable', () => {
    expect(sql).toMatch(/CREATE TABLE public\.trial_packet_snapshots/i);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.trial_packet_snapshots FROM anon/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.trial_packet_snapshots TO authenticated/i);
    expect(sql).toMatch(/ON public\.trial_packet_snapshots FOR SELECT/i);
    expect(sql).not.toMatch(/ON public\.trial_packet_snapshots FOR (INSERT|UPDATE|DELETE)/i);
  });
});

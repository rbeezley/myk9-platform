/**
 * MYK9-1685 — the migration adds the five columns with the owner-decided defaults and backfills
 * only the shows that already use the tool, without deleting anything.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261104014300_myk9_1685_show_uses_switches.sql'
  ),
  'utf8'
).replace(/--.*$/gm, '');
const flat = sql.replace(/\s+/g, ' ');

describe('20261104014300_myk9_1685_show_uses_switches.sql', () => {
  it.each([
    ['uses_device_scoring', 'true'],
    ['uses_paper_packet', 'false'],
    ['uses_volunteers', 'false'],
    ['uses_landing_page', 'false'],
    ['publishes_own_premium', 'false'],
  ])('adds shows.%s boolean NOT NULL DEFAULT %s', (column, def) => {
    expect(flat).toContain(`ADD COLUMN IF NOT EXISTS ${column} boolean NOT NULL DEFAULT ${def}`);
  });

  it('backfills paper packet, volunteers and landing page from existing use', () => {
    expect(flat).toMatch(
      /SET uses_paper_packet = true .*trial_packet_snapshots t WHERE t\.show_id = s\.id/
    );
    expect(flat).toMatch(/SET uses_volunteers = true .*volunteers v WHERE v\.show_id = s\.id/);
    expect(flat).toMatch(
      /SET uses_landing_page = true .*s\.experience_is_published OR s\.experience_published_at IS NOT NULL/
    );
  });

  it('deletes nothing and adds no grants (shows has table-level grants only)', () => {
    expect(flat).not.toMatch(/\b(DELETE|DROP|TRUNCATE|GRANT|REVOKE)\b/i);
  });
});

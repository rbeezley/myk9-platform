import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../../supabase/migrations/20260511140000_add_premium_cover_image.sql'
  ),
  'utf8'
);

describe('premium cover image migration', () => {
  it('adds cover_image_url to club_premium_templates idempotently', () => {
    expect(sql).toMatch(/alter\s+table\s+public\.club_premium_templates/i);
    expect(sql).toMatch(/add\s+column\s+if\s+not\s+exists\s+cover_image_url\s+text/i);
  });
});

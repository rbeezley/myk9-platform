/** MYK9-2281: the retired shows.uses_landing_page column is dropped, without CASCADE. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const flat = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261121201300_myk9_2281_drop_uses_landing_page.sql'
  ),
  'utf8'
)
  .replace(/--.*$/gm, '')
  .replace(/\s+/g, ' ')
  .trim();

describe('20261121201300_myk9_2281_drop_uses_landing_page.sql', () => {
  it('drops shows.uses_landing_page and nothing else, without CASCADE', () => {
    expect(flat).toBe('ALTER TABLE public.shows DROP COLUMN IF EXISTS uses_landing_page;');
  });
});

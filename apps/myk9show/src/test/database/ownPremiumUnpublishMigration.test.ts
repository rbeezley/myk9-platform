/**
 * MYK9-2054: the migration drops the landing-page switch, adds the club's own premium link with
 * explicit grants, and the two RPCs are the only writers (authenticated only, never anon).
 * Behavior is covered by supabase/tests/myk9_2054_own_premium_unpublish_test.sql (CI only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/migrations/20261120202300_myk9_2054_own_premium_unpublish.sql'
  ),
  'utf8'
).replace(/--.*$/gm, '');
const flat = sql.replace(/\s+/g, ' ');

describe('20261120202300_myk9_2054_own_premium_unpublish.sql', () => {
  it('drops uses_landing_page', () => {
    expect(flat).toContain('ALTER TABLE public.shows DROP COLUMN IF EXISTS uses_landing_page;');
  });

  it('adds the own premium link with a web-address check and no column-level grant (table-level SELECT covers it)', () => {
    expect(flat).toContain('ADD COLUMN IF NOT EXISTS own_premium_link text');
    expect(flat).toMatch(/CHECK \(own_premium_link IS NULL OR \(own_premium_link ~\* '\^https\?/);
    expect(flat).not.toMatch(/GRANT SELECT \(/);
  });

  it('puts the link under the publication guard trigger', () => {
    expect(flat).toMatch(
      /UPDATE OF .*own_premium_link ON public\.shows FOR EACH ROW EXECUTE FUNCTION public\.guard_premium_publication_state/
    );
  });

  it('lets the guard pass an UPDATE that leaves every published_premium_* column empty', () => {
    expect(flat).toMatch(
      /IF NEW\.published_premium_path IS NULL AND NEW\.published_premium_url IS NULL AND NEW\.published_premium_at IS NULL AND NEW\.published_premium_version IS NULL THEN RETURN NEW;/
    );
  });

  it.each(['public.set_own_premium(uuid, text, text, text)', 'public.unpublish_premium(uuid)'])(
    '%s is executable by authenticated and not by anon',
    signature => {
      expect(flat).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon;`);
      expect(flat).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`);
    }
  );

  it('unpublish clears the file, the link and the announcement and reads no entry', () => {
    const body = flat.slice(flat.indexOf('CREATE OR REPLACE FUNCTION public.unpublish_premium'));
    for (const fragment of [
      'published_premium_path = NULL',
      'published_premium_url = NULL',
      'published_premium_at = NULL',
      'own_premium_link = NULL',
      'experience_is_published = false',
      "experience_published_content = '{}'::jsonb",
    ]) {
      expect(body).toContain(fragment);
    }
    expect(body).not.toMatch(/entries|enrollments/i);
  });
});

/**
 * Every organization a show can be CREATED for must be one a judge can be QUALIFIED for.
 *
 * These two lists were hand-maintained separately and drifted: `SHOW_ORGANIZATIONS` is
 * derived from `listRegistries()` and gained ASCA, while `JUDGE_ORGANIZATIONS` stayed
 * AKC/UKC/NACSW/CPE/OTHER. Nothing surfaced it while judge pickers ignored organization
 * — an ASCA show simply offered every active judge. The moment those pickers began
 * filtering (as they must, since assigning a judge is the write path onto the show's
 * registry paperwork), an ASCA show would have offered nobody, with no way to fix it
 * from inside the app.
 *
 * Both halves are now derived from the same registry list; this asserts they cannot
 * drift again when a registry is added.
 */
import { describe, expect, it } from 'vitest';
import { SHOW_ORGANIZATIONS } from '../organizations';
import { JUDGE_ORGANIZATIONS } from '@/features/judges/judgeOrganizations';

describe('judge qualification organizations cover every show organization', () => {
  it('offers a qualification option for each creatable show organization', () => {
    const judgeValues = new Set(JUDGE_ORGANIZATIONS.map(o => o.value));
    const uncovered = SHOW_ORGANIZATIONS.map(o => o.value).filter(v => !judgeValues.has(v));

    expect(uncovered).toEqual([]);
  });

  it('actually has organizations to compare, so the check cannot pass vacuously', () => {
    expect(SHOW_ORGANIZATIONS.length).toBeGreaterThanOrEqual(3);
    expect(JUDGE_ORGANIZATIONS.length).toBeGreaterThan(SHOW_ORGANIZATIONS.length);
  });

  it('keeps the non-registry credentials a judge may still hold', () => {
    const values = JUDGE_ORGANIZATIONS.map(o => o.value);
    // A judge may be credentialed by a body this app does not run shows for.
    expect(values).toEqual(expect.arrayContaining(['NACSW', 'CPE', 'OTHER']));
  });

  it('uses one spelling per organization', () => {
    const values = JUDGE_ORGANIZATIONS.map(o => o.value);
    expect(new Set(values).size).toBe(values.length);
    // The comparison against show organizations is exact, so a case variant of a
    // registry code would silently fail to match.
    const registryValues = SHOW_ORGANIZATIONS.map(o => o.value);
    for (const value of registryValues) {
      expect(values.filter(v => v.toUpperCase() === value.toUpperCase())).toEqual([value]);
    }
  });
});

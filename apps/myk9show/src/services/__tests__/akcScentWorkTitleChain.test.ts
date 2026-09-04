/**
 * AKC Scent Work prerequisite chain.
 *
 * `031_seed_sport_titles.sql` gave AKC supersession but no
 * `prerequisite_title_id` edges, while UKC and ASCA both got a chain in the same
 * section. `computeTitleProgress` defaults `prerequisiteMet` to true, so every
 * one of the 49 AKC titles sorted as "next eligible" for a dog that had never
 * trialed — and the dog Overview's "Title progress" card, which takes the first
 * three unearned titles by sort order, showed Container Novice / Advanced /
 * Excellent at 0 of 3 to a green dog.
 *
 * Every assertion here is paired with the pre-migration data (`withChain: false`)
 * so a green run is known to distinguish the fix from the bug.
 */
import { describe, expect, it } from 'vitest';
import { computeTitleProgress, type TitleProgressResult } from '../titleEngine';
import { levelResolverForTemplate } from '@/features/registries/elementLevels';
import {
  AKC_FLAT_LEVELS,
  AKC_TITLE_PREREQUISITES,
  AKC_TITLE_ROOTS,
  buildAkcScentWorkTitles,
} from './fixtures/akcScentWorkTitles';

const akcLevels = levelResolverForTemplate({ sport_code: 'akc-scent-work' }, AKC_FLAT_LEVELS);

/** Titles the dog can pursue right now: prerequisite met, nothing earned toward it yet. */
function nextEligible(results: TitleProgressResult[]): string[] {
  return results
    .filter(r => !r.isEarned && r.prerequisiteMet && r.earnedLegs === 0)
    .map(r => r.abbreviation);
}

function locked(results: TitleProgressResult[]): string[] {
  return results.filter(r => !r.isEarned && !r.prerequisiteMet).map(r => r.abbreviation);
}

/** Exactly what `DogDetailsMain/TitleProgressSection` puts on the Overview card. */
function overviewCards(results: TitleProgressResult[]): string[] {
  return results
    .filter(r => !r.isEarned && !r.isSuperseded)
    .slice(0, 3)
    .map(r => r.abbreviation);
}

describe('AKC Scent Work title chain', () => {
  it('covers all 49 seeded titles, with seven roots', () => {
    const titles = buildAkcScentWorkTitles();
    expect(titles).toHaveLength(49);

    const roots = titles.filter(t => !t.prerequisite_title_id).map(t => t.abbreviation);
    expect(roots.sort()).toEqual([...AKC_TITLE_ROOTS].sort());
    expect(Object.keys(AKC_TITLE_PREREQUISITES)).toHaveLength(42);
  });

  it('gives a dog with no qualifying runs only the Novice element titles to pursue', () => {
    const results = computeTitleProgress([], buildAkcScentWorkTitles(), akcLevels);

    // SWN is a level title awarded for the four Novice element titles; it has no
    // prerequisite of its own, so it is reachable from the very first run.
    // SWD is unchained on purpose — see the fixture's note on Detective.
    expect(nextEligible(results).sort()).toEqual(
      ['SBN', 'SCN', 'SEN', 'SHDN', 'SIN', 'SWD', 'SWN'].sort()
    );
    expect(locked(results)).toHaveLength(42);
  });

  it('shows Container, Interior and Exterior Novice on the Overview card', () => {
    const results = computeTitleProgress([], buildAkcScentWorkTitles(), akcLevels);
    expect(overviewCards(results)).toEqual(['SCN', 'SIN', 'SEN']);
  });

  it('without the chain, every title is pursuable and the card shows one element at three levels', () => {
    // The pre-migration data. This is the regression the chain exists to prevent:
    // the assertions above must fail here, or they prove nothing.
    const results = computeTitleProgress([], buildAkcScentWorkTitles(false), akcLevels);

    expect(nextEligible(results)).toHaveLength(49);
    expect(locked(results)).toHaveLength(0);
    expect(overviewCards(results)).toEqual(['SCN', 'SCA', 'SCE']);
  });

  it('unlocks the next level in an element only once that element is titled', () => {
    const containerNovice = [
      { element: 'Container', level: 'Novice', date: '2026-03-01' },
      { element: 'Container', level: 'Novice', date: '2026-03-02' },
      { element: 'Container', level: 'Novice', date: '2026-03-03' },
    ].map(({ element, level, date }, index) => ({
      id: `leg-${index}`,
      source: 'platform' as const,
      element,
      level,
      trial_date: date,
      show_name: 'Spring Trial',
    }));

    const results = computeTitleProgress(containerNovice, buildAkcScentWorkTitles(), akcLevels);
    const byAbbr = new Map(results.map(r => [r.abbreviation, r]));

    expect(byAbbr.get('SCN')!.isEarned).toBe(true);
    // Advanced Container opens; Excellent stays shut behind Advanced.
    expect(byAbbr.get('SCA')!.prerequisiteMet).toBe(true);
    expect(byAbbr.get('SCE')!.prerequisiteMet).toBe(false);
    // The Elite accumulation title for the level just earned also opens.
    expect(byAbbr.get('SCNE')!.prerequisiteMet).toBe(true);
    // Other elements are untouched.
    expect(byAbbr.get('SIA')!.prerequisiteMet).toBe(false);
  });

  it('leaves Detective unchained, and out of the card, rather than over-locking it', () => {
    // AKC opens Detective to a dog holding ANY Master title, which one
    // `prerequisite_title_id` cannot express. Seeding SWM would lock out a dog
    // the regulations let in, so the edge is deliberately absent. The cost is
    // bounded: SWD sorts at 700 and never reaches the Overview card.
    const results = computeTitleProgress([], buildAkcScentWorkTitles(), akcLevels);
    const detective = results.find(r => r.abbreviation === 'SWD');

    expect(detective!.prerequisiteMet).toBe(true);
    expect(overviewCards(results)).not.toContain('SWD');
  });
});

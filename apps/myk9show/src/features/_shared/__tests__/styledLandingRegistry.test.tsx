import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { STYLED_LANDING_BY_STYLE } from '../styledLandingRegistry';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { fromAny } from '@total-typescript/shoehorn';

// Landing pages read entry counts from this hook — mock it to keep the
// renders synchronous and offline.
vi.mock('@/hooks/queries/useEntriesDatabase', () => ({
  useEntriesByShowQuery: () => ({ data: [] }),
}));

const ALL_STYLES = [
  'heritage',
  'headline',
  'monogram',
  'banner',
  'fieldGuide',
  'gazette',
  'magazine',
  'poster',
] as const;

const MOCK_SHOW: Show = {
  id: 'show-1',
  name: 'Spring Scent Work Trial',
  organization: 'Bexar County Kennel Club',
  startDate: '2026-06-12',
  endDate: '2026-06-14',
  entryOpenDate: '2026-04-15',
  entryCloseDate: '2026-06-03',
  preEntryFee: '25',
  dayOfShowFee: '22',
} as Show;

const MOCK_TRIAL = fromAny<Trial, unknown>({
  id: 't1',
  trialNumber: 1,
  trialDate: '2026-06-12',
});

const ALL_TRIALS = [MOCK_TRIAL];

/**
 * A show whose trials carry classes, so the offered-classes section renders.
 *
 * The entry window is computed relative to now, not hardcoded: Monogram and
 * Field Guide render "See classes" only inside their `canEnterOnline` branch,
 * so a fixture whose entry close date has passed hides the link in those two
 * styles and the assertion below would fail for a reason that has nothing to
 * do with the link. A fixed future date would also rot into that failure.
 */
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const isoDay = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString().slice(0, 10);

const SHOW_WITH_CLASSES: Show = fromAny<Show, unknown>({
  ...MOCK_SHOW,
  entryOpenDate: isoDay(-YEAR_MS),
  entryCloseDate: isoDay(YEAR_MS),
  startDate: isoDay(YEAR_MS),
  endDate: isoDay(YEAR_MS),
  trials: [
    {
      id: 't1',
      name: 'Saturday Trial',
      date: '2026-06-12',
      classes: [
        { id: 'c1', element: 'Interior', level: 'Advanced' },
        { id: 'c2', element: 'Container', level: 'Novice', section: 'A' },
      ],
    },
    {
      id: 't2',
      name: 'Sunday UKC Nosework',
      date: '2026-06-13',
      classes: [{ id: 'c3', element: 'Vehicle', level: 'Advanced' }],
    },
  ],
});

describe('STYLED_LANDING_BY_STYLE', () => {
  it('has an entry for every ShowStyle value (exhaustive)', () => {
    for (const style of ALL_STYLES) {
      expect(STYLED_LANDING_BY_STYLE[style]).toBeDefined();
      expect(typeof STYLED_LANDING_BY_STYLE[style]).toBe('function');
    }
  });

  it('maps each style to its own distinct landing-page component', () => {
    // No two styles share a renderer — a copy-paste regression that
    // routes (e.g.) Magazine to HeritageLandingPage would surface here.
    const seen = new Set<unknown>();
    for (const style of ALL_STYLES) {
      const component = STYLED_LANDING_BY_STYLE[style];
      expect(seen.has(component)).toBe(false);
      seen.add(component);
    }
    expect(seen.size).toBe(ALL_STYLES.length);
  });

  // Per-style smoke renders. Each one mounts the actual component with
  // a minimal show fixture and asserts a style-specific marker is
  // present in the DOM. This is the integration safety net §5/§7
  // called for in the PR review — proves the registry entry actually
  // resolves to a renderable component, not just a non-null function.
  it.each(ALL_STYLES)('renders the %s landing page without crashing', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = render(
      <Component show={MOCK_SHOW} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );
    // Every styled landing page renders the show name somewhere.
    expect(container.textContent).toContain('Spring Scent Work Trial');
  });

  /**
   * MYK9-259 is the precedent this guards: four of eight styles silently could
   * not render awards/house-rules, because each style hosted its own copy of a
   * shared concern. The offered-classes section is the signed-out exhibitor's
   * only way to see which elements a show runs, so a style that fails to host
   * it drops a launch-scope capability without failing anything else.
   */
  it.each(ALL_STYLES)('hosts the offered-classes section in the %s landing', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = render(
      <Component show={SHOW_WITH_CLASSES} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );

    const section = container.querySelector('#offered-classes');
    expect(section).not.toBeNull();
    // Grouped by trial, and the level is shown beside its element — an
    // exhibitor looking for Interior must be able to see which day runs it.
    expect(section?.textContent).toContain('Saturday Trial');
    expect(section?.textContent).toContain('Interior');
    expect(section?.textContent).toContain('Advanced');
  });

  it.each(ALL_STYLES)('points "See classes" at that section in the %s landing', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = render(
      <Component show={SHOW_WITH_CLASSES} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );

    const link = container.querySelector('[data-testid="see-classes-link"]');
    expect(link?.getAttribute('href')).toBe('#offered-classes');
  });

  it.each(ALL_STYLES)('renders no offered-classes section in %s when the show has none', style => {
    const Component = STYLED_LANDING_BY_STYLE[style];
    const { container } = render(
      <Component show={MOCK_SHOW} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );
    // MOCK_SHOW carries no trials, so an empty shell would be noise.
    expect(container.querySelector('#offered-classes')).toBeNull();
  });

  it('renders Field Guide with its [data-field-guide] scope attribute', () => {
    const Component = STYLED_LANDING_BY_STYLE.fieldGuide;
    const { container } = render(
      <Component show={MOCK_SHOW} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );
    expect(container.querySelector('[data-field-guide]')).not.toBeNull();
  });
});

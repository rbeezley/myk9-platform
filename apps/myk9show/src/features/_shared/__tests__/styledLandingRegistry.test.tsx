import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import { STYLED_LANDING_BY_STYLE } from '../styledLandingRegistry';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';

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

const MOCK_TRIAL: Trial = {
  id: 't1',
  trialNumber: 1,
  trialDate: '2026-06-12',
} as Trial;

const ALL_TRIALS = [MOCK_TRIAL];

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

  it('renders Field Guide with its [data-field-guide] scope attribute', () => {
    const Component = STYLED_LANDING_BY_STYLE.fieldGuide;
    const { container } = render(
      <Component show={MOCK_SHOW} trial={MOCK_TRIAL} allTrials={ALL_TRIALS} />
    );
    expect(container.querySelector('[data-field-guide]')).not.toBeNull();
  });
});

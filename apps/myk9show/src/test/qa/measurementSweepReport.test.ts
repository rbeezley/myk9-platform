/**
 * Tests for the measurement sweep's reporting rules.
 *
 * Lives here, not beside the module it tests, because vitest.config.ts excludes
 * `**\/e2e/**` and Playwright's default testMatch claims `*.test.ts` — a test
 * file under `src/test/e2e/` would be invisible to vitest and executed by
 * Playwright, which is a silent no-op in the suite that is supposed to run it.
 *
 * Each case exists because the corresponding rule, if removed, would let the
 * report state something false. That is the point: round 5 established that the
 * harness lies more readily than the app does, so the harness gets the tests.
 */

import { describe, expect, it } from 'vitest';
import type { ContrastGroup, ProbeResult, TargetGroup } from '../e2e/qa/measurementProbe';
import {
  contrastClusters,
  partition,
  renderSweepReport,
  sanityFailures,
  targetClusters,
  type RouteMeasurement,
} from '../e2e/qa/measurementSweepReport';

function probe(overrides: Partial<ProbeResult> = {}): ProbeResult {
  return {
    sanity: { blackOnWhite: 21, whiteOnWhite: 1, greyOnWhite: 4.54 },
    measured: 100,
    unmeasurable: 0,
    interactive: 20,
    totals: { contrast: 0, targets: 0, names: 0 },
    contrastGroups: [],
    targetGroups: [],
    contrast: [],
    targets: [],
    names: [],
    overflowPx: 0,
    overflowSources: [],
    viewport: { width: 1280, height: 720 },
    bodyBackground: 'rgb(30, 28, 25)',
    bodyLuma: 27,
    ...overrides,
  };
}

function measurement(overrides: Partial<RouteMeasurement> = {}): RouteMeasurement {
  return {
    id: 'exhibitor/my-entries',
    group: 'exhibitor',
    route: 'my-entries',
    path: '/exhibitor/entries',
    landedPath: '/exhibitor/entries',
    theme: 'dark',
    reached: true,
    error: null,
    probe: probe(),
    ...overrides,
  };
}

const contrastFinding = (fg: string, bg: string, ratio: number) => ({
  kind: 'contrast' as const,
  text: 'Current',
  ratio,
  required: 4.5,
  fontPx: 12,
  bold: false,
  fg,
  bg,
  opacity: 1,
  where: 'div > span',
});

describe('sanityFailures', () => {
  it('passes the known answers a working probe returns', () => {
    expect(sanityFailures(probe())).toEqual([]);
  });

  it('catches the collapsed-ratio failure mode round 5 shipped three times', () => {
    // Every broken colour parser produced ratios near 1.0 across the board.
    const broken = probe({ sanity: { blackOnWhite: 1.0, whiteOnWhite: 1, greyOnWhite: 1.0 } });
    expect(sanityFailures(broken)).toEqual([
      'blackOnWhite=1 (expected ~21)',
      'greyOnWhite=1 (expected ~4.54)',
    ]);
  });

  it('catches a probe that inflates rather than collapses', () => {
    const broken = probe({ sanity: { blackOnWhite: 21, whiteOnWhite: 3.2, greyOnWhite: 4.54 } });
    expect(sanityFailures(broken)).toHaveLength(1);
  });
});

describe('partition', () => {
  it('keeps a clean measurement', () => {
    expect(partition([measurement()]).usable).toHaveLength(1);
  });

  it('excludes a route that redirected, so its findings are not misattributed', () => {
    const { usable, excluded } = partition([
      measurement({ reached: false, landedPath: '/sign-in' }),
    ]);
    expect(usable).toHaveLength(0);
    expect(excluded[0].reason).toContain('/sign-in');
  });

  it('excludes a dark run that actually rendered light', () => {
    // Light mode uses a darker muted token that clears AA nearly everywhere, so
    // a failed theme flip is indistinguishable from a healthy dark theme.
    const { usable, excluded } = partition([
      measurement({ theme: 'dark', probe: probe({ bodyLuma: 250 }) }),
    ]);
    expect(usable).toHaveLength(0);
    expect(excluded[0].reason).toContain('dark theme did not apply');
  });

  it('does not apply the dark-theme check to a light run', () => {
    expect(
      partition([measurement({ theme: 'light', probe: probe({ bodyLuma: 250 }) })]).usable
    ).toHaveLength(1);
  });

  it('excludes a measurement whose known-answer checks failed', () => {
    const { usable, excluded } = partition([
      measurement({ probe: probe({ sanity: { blackOnWhite: 1, whiteOnWhite: 1, greyOnWhite: 1 } }) }),
    ]);
    expect(usable).toHaveLength(0);
    expect(excluded[0].reason).toContain('known-answer check failed');
  });

  it('disbelieves a page where most of the text failed', () => {
    // The real shape: 1,277 findings across 1,291 text nodes on the registration
    // wizard, every one an entrance-animation artefact. The known-answer checks
    // stayed green because the arithmetic was correct — only the ratio of
    // findings to content revealed it.
    const { usable, excluded } = partition([
      measurement({
        probe: probe({ measured: 1291, totals: { contrast: 1277, targets: 0, names: 0 } }),
      }),
    ]);
    expect(usable).toHaveLength(0);
    expect(excluded[0].reason).toContain('implausible failure rate');
  });

  it('still trusts a page with many findings when most of its text passes', () => {
    expect(
      partition([
        measurement({
          probe: probe({ measured: 400, totals: { contrast: 40, targets: 0, names: 0 } }),
        }),
      ]).usable
    ).toHaveLength(1);
  });

  it('does not disbelieve a tiny page that happens to fail proportionally', () => {
    // 6 of 8 is 75%, but 8 text nodes is an empty state, not evidence of a
    // broken probe. The guard needs enough content to mean anything.
    expect(
      partition([
        measurement({ probe: probe({ measured: 8, totals: { contrast: 6, targets: 0, names: 0 } }) }),
      ]).usable
    ).toHaveLength(1);
  });

  it('excludes on error and on a missing probe', () => {
    expect(partition([measurement({ error: 'timeout' })]).excluded).toHaveLength(1);
    expect(partition([measurement({ probe: null })]).excluded).toHaveLength(1);
  });
});

const contrastGroup = (fg: string, bg: string, worst: number, count = 1): ContrastGroup => ({
  signature: `${fg} on ${bg}`,
  count,
  worst,
  required: 4.5,
  fontPx: 14,
  bold: false,
  sampleText: 'Current',
});

const targetGroup = (
  signature: string,
  smallest: number,
  under24: boolean,
  labels: string[],
  count = 1
): TargetGroup => ({ signature, count, smallest, under24, labels });

describe('contrastClusters', () => {
  it('ranks a colour pair seen on many routes above a worse one seen once', () => {
    const shared = contrastGroup('rgb(154,145,132)', 'rgb(48,38,32)', 3.96);
    const isolated = contrastGroup('rgb(120,120,120)', 'rgb(90,90,90)', 1.6);
    const clusters = contrastClusters([
      measurement({ id: 'a', probe: probe({ contrastGroups: [shared] }) }),
      measurement({ id: 'b', probe: probe({ contrastGroups: [shared] }) }),
      measurement({ id: 'c', probe: probe({ contrastGroups: [shared, isolated] }) }),
    ]);
    // Spread first: three routes beats a worse single reading. This ordering IS
    // the argument for sweeping broadly - one token edit fixes the top row.
    expect(clusters[0].routes).toHaveLength(3);
    expect(clusters[0].worst).toBe(3.96);
    expect(clusters[1].routes).toHaveLength(1);
  });

  it('clusters from untruncated per-page aggregates, not the sampled rows', () => {
    // The probe returns at most `limit` sample rows per page. If clustering read
    // those, a pair used 400 times but never among a page's worst dozen would
    // vanish from a ranking that claims to measure spread. Here the sampled rows
    // deliberately carry a DIFFERENT colour pair from the aggregates.
    const clusters = contrastClusters([
      measurement({
        probe: probe({
          contrastGroups: [contrastGroup('rgb(1,1,1)', 'rgb(2,2,2)', 4.1, 400)],
          contrast: [contrastFinding('rgb(9,9,9)', 'rgb(8,8,8)', 1.2)],
        }),
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].signature).toBe('rgb(1,1,1) on rgb(2,2,2)');
    expect(clusters[0].occurrences).toBe(400);
  });

  it('does not double-count one route measured twice as two routes', () => {
    const g = contrastGroup('rgb(1,1,1)', 'rgb(2,2,2)', 2);
    const clusters = contrastClusters([
      measurement({ id: 'a', theme: 'light', probe: probe({ contrastGroups: [g] }) }),
      measurement({ id: 'a', theme: 'light', probe: probe({ contrastGroups: [g] }) }),
    ]);
    expect(clusters[0].routes).toEqual(['a (light)']);
    expect(clusters[0].occurrences).toBe(2);
  });
});

describe('targetClusters', () => {
  it('sorts controls that miss the 24px AA floor ahead of merely-small ones', () => {
    const clusters = targetClusters([
      measurement({
        probe: probe({
          targetGroups: [
            targetGroup('button, 32px shortest side, under 44px', 32, false, ['Change']),
            targetGroup('button, 20px shortest side, under 24px (WCAG 2.5.8 AA)', 20, true, [
              'Close',
            ]),
          ],
        }),
      }),
    ]);
    expect(clusters[0].signature).toContain('2.5.8');
    expect(clusters[1].signature).toContain('under 44px');
  });

  it('keeps same-shape controls that differ only in label as one cluster', () => {
    // "Terms", "Privacy" and "Contact" in one footer row are ONE finding.
    const clusters = targetClusters([
      measurement({
        probe: probe({
          targetGroups: [
            targetGroup(
              'a, 18px shortest side, under 44px',
              18,
              false,
              ['Terms', 'Privacy', 'Contact'],
              3
            ),
          ],
        }),
      }),
    ]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].occurrences).toBe(3);
    expect(clusters[0].detail).toContain('Terms');
    expect(clusters[0].detail).toContain('Privacy');
  });
});

describe('renderSweepReport', () => {
  it('reports the true finding count, not the truncated row count', () => {
    // The probe caps its returned rows; the totals it carries do not. A report
    // that counts rows understates the page.
    const md = renderSweepReport(
      [
        measurement({
          probe: probe({
            totals: { contrast: 37, targets: 0, names: 0 },
            contrastGroups: [contrastGroup('a', 'b', 3)],
          }),
        }),
      ],
      41
    );
    expect(md).toContain('| Contrast findings | 37 |');
  });

  it('lists excluded measurements rather than dropping them', () => {
    const md = renderSweepReport([measurement({ reached: false, landedPath: '/sign-in' })], 41);
    expect(md).toContain('Excluded measurements');
    expect(md).toContain('/sign-in');
    expect(md).toContain('| Usable | 0 |');
  });

  it('renders every table with as many cells per row as its header declares', () => {
    // Adding an "Instances" column to the cluster rows without adding it to the
    // small-target header shipped a table whose rows had six cells under a
    // five-column head. Markdown renders that silently and wrong.
    const md = renderSweepReport(
      [
        measurement({
          probe: probe({
            contrastGroups: [contrastGroup('rgb(1,1,1)', 'rgb(2,2,2)', 3)],
            targetGroups: [targetGroup('button, 32px shortest side, under 44px', 32, false, ['X'])],
            names: [{ kind: 'name', role: 'input', html: '<input>', where: 'div > input' }],
            overflowPx: 12,
            overflowSources: [
              { tag: 'div', className: 'wide', text: 'wide', left: 0, right: 9999 },
            ],
          }),
        }),
        measurement({ id: 'z', reached: false, landedPath: '/sign-in' }),
      ],
      42
    );

    const lines = md.split('\n');
    let header: number | null = null;
    let checked = 0;
    for (const line of lines) {
      if (!line.startsWith('|')) {
        header = null;
        continue;
      }
      const cells = line.split('|').length;
      if (header === null) header = cells;
      else if (!/^\|[\s|-]+\|$/.test(line)) {
        expect(cells, `row has ${cells} cells under a ${header}-cell header: ${line}`).toBe(header);
        checked++;
      }
    }
    // Guard the guard: if the fixture stopped producing rows this would pass
    // while checking nothing.
    expect(checked).toBeGreaterThan(8);
  });

  it('renders every section even when nothing was found', () => {
    const md = renderSweepReport([measurement()], 41);
    for (const heading of [
      '## Coverage',
      '## Contrast clusters',
      '## Small-target clusters',
      '## Controls with no accessible name',
      '## Horizontal overflow',
      '## Excluded measurements',
    ]) {
      expect(md.split('\n').some(line => line === heading)).toBe(true);
    }
    expect(md).toContain('_None._');
  });
});

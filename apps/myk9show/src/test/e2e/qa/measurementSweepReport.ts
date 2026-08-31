/**
 * Renders the measurement sweep's raw per-route probes into a findings report.
 *
 * Pure: no Playwright, no DOM, no filesystem. That is deliberate — the round-5
 * lesson is that the harness is a program, so the half of it that decides what
 * counts as a finding must be testable without a browser. See
 * `measurementSweepReport.test.ts`, which breaks each rule to prove it fires.
 *
 * ## The one judgement this file makes
 *
 * It ranks by SPREAD, not by severity. A 3.9:1 caption on one page is a page
 * nit; the same token at 3.9:1 on nine pages is a token defect worth one edit.
 * That distinction is the whole argument for sweeping broadly instead of
 * running the full impeccable playbook everywhere, so the report leads with it.
 */

import type { ProbeResult } from './measurementProbe';

export interface RouteMeasurement {
  id: string;
  group: string;
  route: string;
  path: string;
  landedPath: string;
  theme: 'light' | 'dark';
  reached: boolean;
  error: string | null;
  probe: ProbeResult | null;
}

/** Tolerance on the probe's known answers. Wider than rounding, far narrower
 *  than any real breakage — round 5's broken parsers landed at ~1.0, not 20.9. */
const SANITY = {
  blackOnWhite: { expected: 21, slack: 0.3 },
  whiteOnWhite: { expected: 1, slack: 0.05 },
  greyOnWhite: { expected: 4.54, slack: 0.15 },
};

/**
 * Above this share of a page's text failing, the measurement is disbelieved.
 * Set well above any plausible real defect — a page whose every caption is
 * genuinely below AA would still sit far under half its text nodes, because
 * headings, labels and body copy do not all share one token.
 */
const IMPLAUSIBLE_FAILURE_RATE = 0.5;

export function sanityFailures(probe: ProbeResult): string[] {
  const out: string[] = [];
  for (const [key, { expected, slack }] of Object.entries(SANITY)) {
    const actual = probe.sanity[key as keyof typeof probe.sanity];
    if (Math.abs(actual - expected) > slack) {
      out.push(`${key}=${actual} (expected ~${expected})`);
    }
  }
  return out;
}

/**
 * A measurement is usable only if the page was reached, the probe ran, and its
 * arithmetic checked out. Anything else is reported as an EXCLUSION with its
 * reason, never dropped silently — a shrinking route count is how a sweep
 * quietly stops covering the app while still printing a tidy table.
 */
export function partition(measurements: RouteMeasurement[]) {
  const usable: RouteMeasurement[] = [];
  const excluded: { m: RouteMeasurement; reason: string }[] = [];
  for (const m of measurements) {
    if (m.error) excluded.push({ m, reason: `navigation/probe error: ${m.error}` });
    else if (!m.probe) excluded.push({ m, reason: 'probe returned nothing' });
    else if (!m.reached) excluded.push({ m, reason: `redirected to ${m.landedPath}` });
    else {
      const failures = sanityFailures(m.probe);
      if (failures.length) {
        excluded.push({ m, reason: `known-answer check failed: ${failures.join(', ')}` });
      } else if (
        m.probe.measured > 20 &&
        m.probe.totals.contrast / m.probe.measured > IMPLAUSIBLE_FAILURE_RATE
      ) {
        // A page where most of the text fails is a broken measurement, not a
        // broken page. The registration wizard produced 1,277 findings out of
        // 1,291 text nodes on one run — every one an artefact of being caught
        // mid-fade-in. Nothing in the known-answer checks moved, because the
        // arithmetic was fine; only the ratio of findings to content gave it
        // away. This is the generic form of the round-5 trap, so it is a
        // standing guard rather than a fix for that one page.
        excluded.push({
          m,
          reason: `implausible failure rate: ${m.probe.totals.contrast}/${m.probe.measured} text nodes failed — treat as a broken measurement, not findings`,
        });
      } else if (m.theme === 'dark' && m.probe.bodyLuma >= 128) {
        // A "dark" run that rendered light measures the light palette and files
        // it under dark. Light mode uses a darker muted token that clears AA
        // almost everywhere, so this reads as a clean dark theme.
        excluded.push({ m, reason: `dark theme did not apply (bodyLuma ${m.probe.bodyLuma})` });
      } else usable.push(m);
    }
  }
  return { usable, excluded };
}

export interface Cluster {
  signature: string;
  detail: string;
  worst: number;
  routes: string[];
}

/**
 * Groups contrast findings by the colour pair that produced them. The colour
 * pair — not the text — is the thing a fix would change.
 */
export function contrastClusters(usable: RouteMeasurement[]): Cluster[] {
  const map = new Map<string, Cluster>();
  for (const m of usable) {
    for (const f of m.probe!.contrast) {
      const signature = `${f.fg} on ${f.bg}`;
      const existing = map.get(signature);
      const where = `${m.id} (${m.theme})`;
      if (existing) {
        existing.worst = Math.min(existing.worst, f.ratio);
        if (!existing.routes.includes(where)) existing.routes.push(where);
      } else {
        map.set(signature, {
          signature,
          detail: `${f.fontPx}px${f.bold ? ' bold' : ''}, needs ${f.required}:1 — e.g. "${f.text}"`,
          worst: f.ratio,
          routes: [where],
        });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.routes.length - a.routes.length || a.worst - b.worst
  );
}

/**
 * Groups small targets by role, tier, and the shortest side — NOT by the exact
 * box. Clustering on `WxH` split one finding ("the landing footer link row is
 * 18px tall") into eight rows that differ only in label width, which buries the
 * cross-route signal the whole report is ranked on.
 */
export function targetClusters(usable: RouteMeasurement[]): Cluster[] {
  const map = new Map<string, Cluster>();
  for (const m of usable) {
    for (const f of m.probe!.targets) {
      const smallest = Math.min(f.width, f.height);
      const tier = f.under24 ? 'under 24px (WCAG 2.5.8 AA)' : 'under 44px';
      const signature = `${f.role}, ${smallest}px shortest side, ${tier}`;
      const existing = map.get(signature);
      const where = `${m.id} (${m.theme})`;
      if (existing) {
        if (!existing.routes.includes(where)) existing.routes.push(where);
        if (!existing.detail.includes(f.label) && existing.detail.length < 90) {
          existing.detail += `, "${f.label}"`;
        }
      } else {
        map.set(signature, { signature, detail: `e.g. "${f.label}"`, worst: smallest, routes: [where] });
      }
    }
  }
  return [...map.values()].sort(
    (a, b) => b.routes.length - a.routes.length || a.worst - b.worst
  );
}

function table(header: string[], rows: string[][]): string {
  if (!rows.length) return '_None._\n';
  const head = `| ${header.join(' | ')} |`;
  const sep = `| ${header.map(() => '---').join(' | ')} |`;
  return [head, sep, ...rows.map(r => `| ${r.join(' | ')} |`)].join('\n') + '\n';
}

function clusterRows(clusters: Cluster[], limit: number): string[][] {
  return clusters
    .slice(0, limit)
    .map(c => [
      `\`${c.signature}\``,
      String(c.routes.length),
      String(c.worst),
      c.detail.replace(/\|/g, '\\|'),
      c.routes.slice(0, 4).join(', ') + (c.routes.length > 4 ? ` +${c.routes.length - 4}` : ''),
    ]);
}

export function renderSweepReport(
  measurements: RouteMeasurement[],
  routeCount: number
): string {
  const { usable, excluded } = partition(measurements);
  const contrast = contrastClusters(usable);
  const targets = targetClusters(usable);

  const totalContrast = usable.reduce((n, m) => n + m.probe!.totals.contrast, 0);
  const totalTargets = usable.reduce((n, m) => n + m.probe!.totals.targets, 0);
  const totalNames = usable.reduce((n, m) => n + m.probe!.totals.names, 0);
  const totalMeasured = usable.reduce((n, m) => n + m.probe!.measured, 0);
  const totalUnmeasurable = usable.reduce((n, m) => n + m.probe!.unmeasurable, 0);
  const overflow = usable.filter(m => m.probe!.overflowPx > 0);

  const lines: string[] = [];
  lines.push('# Route measurement sweep — findings');
  lines.push('');
  lines.push(
    'Measurement only. Nothing here has been fixed, and nothing here is a gate. ' +
      'Rank by the **Routes** column, not by the ratio: a single low reading is a page nit, ' +
      'the same colour pair across many routes is one token edit.'
  );
  lines.push('');
  lines.push('## Coverage');
  lines.push('');
  lines.push(
    table(
      ['Metric', 'Value'],
      [
        ['Routes in table', String(routeCount)],
        ['Route × theme measurements attempted', String(measurements.length)],
        ['Usable', String(usable.length)],
        ['Excluded (see below)', String(excluded.length)],
        ['Text nodes measured for contrast', String(totalMeasured)],
        ['Text nodes not measurable (image/gradient backdrop)', String(totalUnmeasurable)],
        ['Contrast findings', String(totalContrast)],
        ['Small-target findings', String(totalTargets)],
        ['Unnamed-control findings', String(totalNames)],
        ['Measurements with horizontal overflow', String(overflow.length)],
      ]
    )
  );
  lines.push('## Contrast clusters');
  lines.push('');
  lines.push(
    table(
      ['Colour pair', 'Routes', 'Worst', 'Detail', 'Where'],
      clusterRows(contrast, 20)
    )
  );
  lines.push('## Small-target clusters');
  lines.push('');
  lines.push(
    table(['Control', 'Routes', 'Smallest side', 'Detail', 'Where'], clusterRows(targets, 20))
  );
  lines.push('## Controls with no accessible name');
  lines.push('');
  lines.push(
    table(
      ['Route', 'Theme', 'Role', 'Markup'],
      usable
        .flatMap(m =>
          m.probe!.names.map(n => [
            m.id,
            m.theme,
            n.role,
            `\`${n.html.replace(/\|/g, '\\|').slice(0, 90)}\``,
          ])
        )
        .slice(0, 25)
    )
  );
  lines.push('## Horizontal overflow');
  lines.push('');
  lines.push(
    table(
      ['Route', 'Theme', 'Overflow px', 'Viewport', 'First source'],
      overflow.map(m => [
        m.id,
        m.theme,
        String(m.probe!.overflowPx),
        `${m.probe!.viewport.width}px`,
        (m.probe!.overflowSources[0]?.text || m.probe!.overflowSources[0]?.tag || '—').replace(
          /\|/g,
          '\\|'
        ),
      ])
    )
  );
  lines.push('## Excluded measurements');
  lines.push('');
  lines.push(
    'These produced no usable numbers. They are listed rather than dropped so the ' +
      'coverage count above cannot quietly shrink.'
  );
  lines.push('');
  lines.push(
    table(
      ['Route', 'Theme', 'Reason'],
      excluded.map(e => [e.m.id, e.m.theme, e.reason.replace(/\|/g, '\\|').slice(0, 120)])
    )
  );

  return lines.join('\n');
}

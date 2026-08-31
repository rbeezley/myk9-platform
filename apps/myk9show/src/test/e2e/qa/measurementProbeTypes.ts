/**
 * Result shapes for the route measurement sweep's in-page probe.
 *
 * Split out of `measurementProbe.ts` so that file stays under the 500-line
 * ceiling: the probe body must be one self-contained function (Playwright
 * serialises it into the page), so it cannot be broken up further, and its
 * types are erased at runtime anyway.
 */

export interface ProbeSanity {
  /** Must be ~21. Black on white is the maximum possible WCAG ratio. */
  blackOnWhite: number;
  /** Must be ~1. White on white is the minimum. */
  whiteOnWhite: number;
  /** Must be ~4.5. A mid grey (#767676) on white is the AA boundary case. */
  greyOnWhite: number;
  /**
   * Height of a synthetic stretched link inside a 120px card. Must be 120, not
   * the ~20px of its own text: the whole point of the pattern is that the card
   * is the hit area. If this reads ~20 the stretched-link detection has broken
   * and the run will over-report small targets (MYK9-281).
   */
  stretchedLink: number;
}

export interface ContrastFinding {
  kind: 'contrast';
  text: string;
  ratio: number;
  required: number;
  fontPx: number;
  bold: boolean;
  fg: string;
  bg: string;
  /** Product of every ancestor's opacity. A value below 1 that nobody styled
   *  means the element was caught mid-animation, not that it renders faint. */
  opacity: number;
  where: string;
}

export interface TargetFinding {
  kind: 'target';
  label: string;
  role: string;
  width: number;
  height: number;
  /** True when the effective target also misses the 24px WCAG 2.5.8 AA floor. */
  under24: boolean;
  where: string;
}

export interface NameFinding {
  kind: 'name';
  role: string;
  html: string;
  where: string;
}

export interface OverflowSource {
  tag: string;
  className: string;
  text: string;
  left: number;
  right: number;
}

/** Per-page aggregate of one colour pair, counted BEFORE the report limit. */
export interface ContrastGroup {
  signature: string;
  count: number;
  worst: number;
  required: number;
  fontPx: number;
  bold: boolean;
  sampleText: string;
}

/** Per-page aggregate of one undersized-control shape, counted before the limit. */
export interface TargetGroup {
  signature: string;
  count: number;
  smallest: number;
  under24: boolean;
  labels: string[];
}

export interface ProbeResult {
  sanity: ProbeSanity;
  /** Text nodes whose contrast was successfully computed. */
  measured: number;
  /** Text nodes skipped because their backdrop is an image or gradient. */
  unmeasurable: number;
  /** Interactive elements considered for the target and name checks. */
  interactive: number;
  /** True finding counts, before the per-category report limit is applied. */
  totals: { contrast: number; targets: number; names: number };
  /** Every colour pair on the page, aggregated. Clustering reads THIS, never
   *  the truncated `contrast` rows — see the note in `measurementProbe.ts`. */
  contrastGroups: ContrastGroup[];
  /** Every undersized-control shape on the page, aggregated. */
  targetGroups: TargetGroup[];
  contrast: ContrastFinding[];
  targets: TargetFinding[];
  names: NameFinding[];
  overflowPx: number;
  overflowSources: OverflowSource[];
  viewport: { width: number; height: number };
  bodyBackground: string;
  /** Mean channel of the body background; < 128 means the dark theme applied. */
  bodyLuma: number;
}

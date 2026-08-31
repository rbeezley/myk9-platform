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

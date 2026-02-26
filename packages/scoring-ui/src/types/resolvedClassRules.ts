/**
 * Resolved class rules for scoresheet rendering.
 *
 * Built from the class record at scoring time — no DB or template
 * lookups needed, so scoring works fully offline.
 */
export interface ResolvedClassRules {
  /** Number of search areas (1, 2, or 3) */
  areaCount: number;
  /** Timer mode: single countdown or dual (search + element) */
  timerMode: 'single' | 'dual';
  /** Maximum time in seconds for the search */
  maxTimeSeconds: number;
  /** Number of hides, or null if not set */
  hideCount: number | null;
  /** Whether the handler knows the hide count */
  hidesKnown: boolean;
  /** Number of distractions in the search area */
  distractionCount: number;
}

/**
 * Input shape accepted by buildResolvedClassRules().
 *
 * Intentionally loose — both ReplicatedClass (myK9Q) and the
 * myK9Show class record can satisfy this without adapter code.
 */
export interface ClassRuleFields {
  // Area count (DB: num_areas, app: areaCount)
  areaCount?: number | null | undefined;
  area_count?: number | null | undefined;
  num_areas?: number | null | undefined;

  // Time limit (DB: time_limit_seconds, app: timeLimitSeconds)
  timeLimitSeconds?: number | null | undefined;
  time_limit_seconds?: number | null | undefined;

  // Timer mode (DB: timer_mode, app: timerMode)
  timerMode?: string | null | undefined;
  timer_mode?: string | null | undefined;

  // Hide count (DB: num_hides, app: hideCount)
  hideCount?: number | null | undefined;
  hide_count?: number | null | undefined;
  num_hides?: number | null | undefined;

  // Hides known (DB: hides_known, app: hidesKnown)
  hidesKnown?: boolean | null | undefined;
  hides_known?: boolean | null | undefined;

  // Distraction count (DB: distraction_count, app: distractionCount)
  distractionCount?: number | null | undefined;
  distraction_count?: number | null | undefined;
}

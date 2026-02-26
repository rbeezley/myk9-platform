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
 * Accepts two naming conventions:
 * - camelCase (myK9Show's ReplicatedClass, app code)
 * - snake_case (myK9Q's Class, raw DB rows)
 *
 * Both apps can pass their class record directly without adapters.
 * Builder prefers camelCase, falls back to snake_case, then defaults.
 */
export interface ClassRuleFields {
  areaCount?: number | null | undefined;
  area_count?: number | null | undefined;

  timeLimitSeconds?: number | null | undefined;
  time_limit_seconds?: number | null | undefined;

  timerMode?: string | null | undefined;
  timer_mode?: string | null | undefined;

  hideCount?: number | null | undefined;
  hide_count?: number | null | undefined;

  hidesKnown?: boolean | null | undefined;
  hides_known?: boolean | null | undefined;

  distractionCount?: number | null | undefined;
  distraction_count?: number | null | undefined;
}

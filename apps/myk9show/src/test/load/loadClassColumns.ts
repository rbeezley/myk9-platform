/**
 * The class column list the virtual reader selects.
 *
 * A harness-local copy, NOT an import. `CLASS_AUTHENTICATED_COLUMN_SELECT` lives
 * in `services/database/classes/reads.ts`, which imports `supabaseClient` — that
 * reads `import.meta.env`, undefined outside Vite, so importing it from here made
 * Playwright discovery find zero tests.
 *
 * Extracting the constant into a pure module was tried first and widened its
 * template-literal type, breaking PostgREST select inference in 30 places across
 * production components. A copy is the smaller risk, and
 * `loadVirtualUser.fidelity.test.ts` asserts it stays byte-identical to the
 * application's, so drift fails a test rather than silently measuring a query
 * the app never issues.
 */

const HARNESS_CLASS_COLUMN_SELECT = `id,
      trial_id,
      name,
      description,
      level,
      element,
      section,
      competition_type,
      entry_fee,
      max_entries,
      allow_waitlist,
      max_dogs_per_handler,
      breed_restrictions,
      jump_heights,
      age_min,
      age_max,
      height_min,
      height_max,
      handler_age_min,
      handler_age_max,
      start_time,
      estimated_duration,
      actual_start_time,
      actual_end_time,
      status,
      time_limit_seconds,
      num_areas,
      max_faults,
      qualifying_threshold,
      is_scoring_finalized,
      results_released_at,
      dogs_ahead_notification_count,
      total_entries_count,
      checked_in_count,
      scored_count,
      created_at,
      updated_at,
      deleted_at,
      deleted_by,
      class_number,
      timer_mode,
      distraction_count,
      is_results_reviewed,
      judge_name,
      time_limit_area2_seconds,
      time_limit_area3_seconds,
      display_order,
      results_released_by,
      version,
      status_source,
      reopened_after_closeout_at,
      revised_expected_start`;

export const LOAD_CLASS_AUTHENTICATED_COLUMN_SELECT = `${HARNESS_CLASS_COLUMN_SELECT},
      has_blank,
      hides_known`;

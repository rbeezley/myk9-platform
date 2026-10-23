import type { ReaderContext } from './loadVirtualUserContext';

/**
 * The reads `ReplicatedClassesTable.enrichClassRows` makes for every classes delta
 * that returns rows: visibility cascade, hide counts, max-time rules, judge names.
 * A class changing during a show (status, counts, a score recalculation) therefore
 * costs a device about a dozen requests, not one.
 *
 * Restated rather than imported for the reason in `loadVirtualUserContext.ts`; the
 * stage order, batch size, filters and the stages that stop early on a failed read
 * mirror `resolveClass{Visibility,HideCounts,TimeLimitRules,JudgeNames}.ts`.
 * Every stage is best-effort in the application, so none of them fails the pass.
 */

export interface EnrichableClassRow {
  readonly id: string | number;
  readonly trial_id?: string | null;
}

interface TrialRow {
  readonly id: string;
  readonly show_id?: string | null;
  readonly registry_id?: string | null;
}

const VISIBILITY_COLUMNS =
  'preset, placement_timing, qualification_timing, time_timing, faults_timing, self_checkin_enabled';
const VISIBILITY_BATCH_SIZE = 100;

const HIDE_RULE_COLUMNS =
  'element, level, section, hide_count_fixed, hides_known, sport_templates!inner(organization)';
const TIME_LIMIT_RULE_COLUMNS =
  'element, level, max_time_seconds_fixed, max_time_seconds_min, max_time_seconds_max, has_30_second_warning, hide_count_fixed, hide_count_min, hide_count_max, hides_known, distraction_count_min, distraction_count_max, area_count, has_blank, timer_mode, odors, sport_templates!inner(organization)';

const unique = (values: readonly (string | null | undefined)[]): string[] => [
  ...new Set(values.filter((value): value is string => !!value)),
];

/** `getTrialRegistry`: a blank registry reads as AKC. */
const registryOf = (trial: TrialRow | undefined): string => trial?.registry_id?.trim() || 'AKC';

async function readTrials(
  ctx: ReaderContext,
  columns: string,
  trialIds: readonly string[]
): Promise<TrialRow[] | null> {
  const out = await ctx.request<TrialRow>('classes (enrichment)', () =>
    ctx.client.from('trials').select(columns).in('id', trialIds).abortSignal(ctx.signal)
  );
  return out.ok ? out.rows : null;
}

async function readByIds(
  ctx: ReaderContext,
  table: string,
  key: string,
  ids: readonly string[]
): Promise<boolean> {
  if (ids.length === 0) return true;
  const out = await ctx.request(`classes (enrichment)`, () =>
    ctx.client
      .from(table)
      .select(`${key}, ${VISIBILITY_COLUMNS}`)
      .in(key, ids as string[])
      .abortSignal(ctx.signal)
  );
  return out.ok;
}

/** The one `trials` read `enrichClassRows` shares with its four stages (MYK9-1345). */
type PreloadedTrials = readonly TrialRow[] | undefined;

async function resolveVisibility(
  ctx: ReaderContext,
  rows: readonly EnrichableClassRow[],
  preloaded: PreloadedTrials
): Promise<void> {
  const scoped = [
    ...new Map(rows.filter(row => row.trial_id).map(row => [String(row.id), row])).values(),
  ];
  for (let offset = 0; offset < scoped.length; offset += VISIBILITY_BATCH_SIZE) {
    const batch = scoped.slice(offset, offset + VISIBILITY_BATCH_SIZE);
    const trialIds = unique(batch.map(row => String(row.trial_id)));
    const trials = preloaded
      ? preloaded.filter(trial => trialIds.includes(trial.id))
      : await readTrials(ctx, 'id, show_id', trialIds);
    // A failed read throws in the application and ends the stage.
    if (!trials) return;
    const showIds = unique(trials.map(trial => trial.show_id));
    const reads = await Promise.all([
      readByIds(ctx, 'show_visibility_settings', 'show_id', showIds),
      readByIds(ctx, 'trial_visibility_overrides', 'trial_id', trialIds),
      readByIds(
        ctx,
        'class_visibility_overrides',
        'class_id',
        batch.map(row => String(row.id))
      ),
    ]);
    if (reads.includes(false)) return;
  }
}

async function resolveHideCounts(
  ctx: ReaderContext,
  rows: readonly EnrichableClassRow[],
  preloaded: PreloadedTrials
): Promise<void> {
  const trialIds = unique(rows.map(row => row.trial_id));
  if (trialIds.length === 0) return;
  const trials = preloaded ?? (await readTrials(ctx, 'id, show_id, registry_id', trialIds));
  if (!trials) return;

  const registryIds = unique(trials.map(trial => trial.registry_id));
  if (registryIds.length > 0) {
    await ctx.request('classes (enrichment)', () =>
      ctx.client
        .from('sport_class_rules')
        .select(HIDE_RULE_COLUMNS)
        .in('sport_templates.organization', registryIds)
        .eq('hides_known', true)
        .not('hide_count_fixed', 'is', null)
        .abortSignal(ctx.signal)
    );
  }

  await Promise.all(
    unique(trials.map(trial => trial.show_id)).map(showId =>
      ctx.request('classes (enrichment)', () =>
        ctx.client.rpc('get_show_class_hide_counts', { p_show_id: showId }).abortSignal(ctx.signal)
      )
    )
  );
}

async function resolveTimeLimitRules(
  ctx: ReaderContext,
  rows: readonly EnrichableClassRow[],
  preloaded: PreloadedTrials
): Promise<void> {
  const withTrial = rows.filter(row => row.trial_id);
  const trialIds = unique(withTrial.map(row => row.trial_id));
  if (trialIds.length === 0) return;
  const trials = preloaded ?? (await readTrials(ctx, 'id, registry_id', trialIds));
  if (!trials) return;
  const byId = new Map(trials.map(trial => [trial.id, trial]));
  const registries = [...new Set(withTrial.map(row => registryOf(byId.get(String(row.trial_id)))))];
  await ctx.request('classes (enrichment)', () =>
    ctx.client
      .from('sport_class_rules')
      .select(TIME_LIMIT_RULE_COLUMNS)
      .in('sport_templates.organization', registries)
      .abortSignal(ctx.signal)
  );
}

async function resolveJudgeNames(
  ctx: ReaderContext,
  rows: readonly EnrichableClassRow[],
  preloaded: PreloadedTrials
): Promise<void> {
  const trialIds = unique(rows.map(row => row.trial_id));
  if (trialIds.length === 0) return;
  const trials = preloaded ?? (await readTrials(ctx, 'id, show_id', trialIds));
  if (!trials) return;
  await Promise.all(
    unique(trials.map(trial => trial.show_id)).map(showId =>
      ctx.request('classes (enrichment)', () =>
        ctx.client.rpc('get_show_judges', { p_show_id: showId }).abortSignal(ctx.signal)
      )
    )
  );
}

/**
 * One `trials` read, then the four stages together, as `enrichClassRows` runs
 * them since MYK9-1345. A failed shared read hands the stages `undefined`, so
 * each reads `trials` itself, exactly as the application falls back.
 */
export async function enrichClassRows(
  ctx: ReaderContext,
  rows: readonly EnrichableClassRow[]
): Promise<void> {
  const trialIds = unique(rows.map(row => row.trial_id));
  const preloaded: PreloadedTrials =
    trialIds.length === 0
      ? []
      : ((await readTrials(ctx, 'id, show_id, registry_id', trialIds)) ?? undefined);
  await Promise.all([
    resolveVisibility(ctx, rows, preloaded),
    resolveHideCounts(ctx, rows, preloaded),
    resolveTimeLimitRules(ctx, rows, preloaded),
    resolveJudgeNames(ctx, rows, preloaded),
  ]);
}

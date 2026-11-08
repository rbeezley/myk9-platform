import {
  type AskQRulebookAsset,
  getRulebookScopeOptions,
  selectRulebook,
} from './documentContext.ts';

interface TrialContext {
  registry_id?: string | null;
  trial_type?: string | null;
}

/**
 * Registry + sport labels for EVERY trial of a show, independent of which
 * rulebooks are bundled: a Scent Work + Obedience show must not read as
 * single-sport just because only the Scent Work rulebook exists. A trial with
 * no bundled rulebook is labelled from its raw registry/type columns.
 */
export function describeShowRegistries(
  trials: TrialContext[],
  allRulebooks: AskQRulebookAsset[]
): string[] {
  const labels = new Set<string>();
  for (const trial of trials) {
    const rulebook = selectRulebook(
      allRulebooks,
      trial.registry_id ?? undefined,
      trial.trial_type ?? undefined
    );
    if (rulebook) {
      labels.add(getRulebookScopeOptions([rulebook])[0].label);
      continue;
    }
    const raw = [trial.registry_id, trial.trial_type]
      .map(part => part?.trim())
      .filter(Boolean)
      .join(' ');
    labels.add(raw || 'unspecified registry');
  }
  return [...labels];
}

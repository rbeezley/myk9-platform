import { judgeKey, type JudgeKey } from './types';

export interface JudgeAcrossTrials extends JudgeKey {
  key: string;
  /** Trial ids the judge is on, in the order the show lists its trials. */
  trialIds: string[];
}

/**
 * MYK9-1728: one entry per judge for the whole show. `byTrial` is each trial's judges (the
 * Show Desk's existing judges-on-days read); `trialIds` is the show's trial order. The first
 * of a judge's trials is the one their list is edited on, and the rest mirror it.
 */
export function judgesAcrossTrials(
  trialIds: readonly string[],
  byTrial: ReadonlyMap<string, readonly { person_id: string; judge_name: string }[]>
): JudgeAcrossTrials[] {
  const byKey = new Map<string, JudgeAcrossTrials>();
  for (const trialId of trialIds) {
    for (const judge of byTrial.get(trialId) ?? []) {
      const key = judgeKey(judge);
      const found = byKey.get(key);
      if (found) found.trialIds.push(trialId);
      else byKey.set(key, { key, ...judge, trialIds: [trialId] });
    }
  }
  return [...byKey.values()].sort((a, b) => a.judge_name.localeCompare(b.judge_name));
}

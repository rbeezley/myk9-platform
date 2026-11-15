/**
 * Resolves a show's effective withdrawal terms in one joined read via shows.club_id:
 *  - `policy`: the structured fields (show override per field, else the club default), the
 *    ONLY input to the refund the app suggests. Null when neither level declares one.
 *  - `text`: the words exhibitors read (MYK9-1976): the show's text, else the club's, else
 *    the default built from `policy` and the show's registry.
 *
 * Online-only, like every read and write of the policy columns: errors (a missing column
 * before the migration is applied, a lost connection) propagate as isError and callers render
 * nothing rather than crash.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { resolveConfiguredRegistryId, type RegistryId } from '@/features/registries';
import {
  getEffectiveWithdrawalPolicy,
  type WithdrawalPolicy,
  type ClubWithdrawalFields,
  type ShowWithdrawalFields,
} from './withdrawalPolicy';
import {
  resolveWithdrawalPolicyText,
  type WithdrawalPolicyTextSource,
} from './withdrawalPolicyText';

const SELECT = `
  withdrawal_cutoff_date,
  withdrawal_retention_type,
  withdrawal_retention_value,
  withdrawal_policy_notes,
  withdrawal_policy_text,
  trials ( registry_id ),
  clubs (
    default_withdrawal_retention_type,
    default_withdrawal_retention_value,
    default_withdrawal_policy_notes,
    default_withdrawal_policy_text
  )
`;

export interface EffectiveWithdrawalTerms {
  policy: WithdrawalPolicy | null;
  text: string;
  textSource: WithdrawalPolicyTextSource;
  registryId: RegistryId | null;
}

type ClubTextFields = ClubWithdrawalFields & { default_withdrawal_policy_text?: string | null };

/** Embedded to-one can come back as an object or a single-element array; normalize both. */
function toOne<T>(raw: unknown): T | null {
  return ((Array.isArray(raw) ? raw[0] : raw) as T | undefined) ?? null;
}

/** A show never mixes registries (MYK9-490): the first trial naming a configured one answers. */
export function registryFromTrials(raw: unknown): RegistryId | null {
  const trials = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const trial of trials as Array<{ registry_id?: string | null }>) {
    const id = resolveConfiguredRegistryId(trial?.registry_id);
    if (id) return id;
  }
  return null;
}

export function useEffectiveWithdrawalPolicy(showId: string | null | undefined) {
  return useQuery<EffectiveWithdrawalTerms>({
    queryKey: ['effective-withdrawal-policy', showId],
    enabled: !!showId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shows')
        .select(SELECT)
        .eq('id', showId as string)
        .single();
      if (error) throw error;

      const row = data as unknown as Record<string, unknown>;
      const club = toOne<ClubTextFields>(row.clubs);
      const policy = getEffectiveWithdrawalPolicy(row as ShowWithdrawalFields, club);
      const registryId = registryFromTrials(row.trials);
      const { text, source } = resolveWithdrawalPolicyText({
        showText: row.withdrawal_policy_text as string | null | undefined,
        clubText: club?.default_withdrawal_policy_text,
        policy,
        registryId,
      });
      return { policy, text, textSource: source, registryId };
    },
  });
}

/**
 * MYK9-2171: the payout brake (platform_settings.payouts_require_approval).
 *
 * The server stamps who switched it and when (trg_stamp_payout_brake_change) and
 * requires a recent password only to switch it OFF; the Supabase client's fetch
 * answers that refusal with the one step-up prompt. Switching it on needs none.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { personName } from '@/hooks/entryDisplayNames';
import { PAYOUT_DECISION_MUTATION_OPTIONS } from './usePayoutApprovalActions';

export const PAYOUT_BRAKE_QUERY_KEY = ['admin', 'payout-brake'] as const;

export interface PayoutBrakeState {
  on: boolean;
  changedAt: string | null;
  /** The person's name; null when no change is recorded or the person is gone. */
  changedByName: string | null;
}

type BrakeRow = {
  payouts_require_approval: boolean | null;
  payouts_require_approval_changed_at: string | null;
  changer: { first_name: string | null; last_name: string | null } | null;
};

const BRAKE_SELECT =
  'payouts_require_approval, payouts_require_approval_changed_at, ' +
  'changer:people!platform_settings_payouts_require_approval_changed_by_fkey(first_name, last_name)';

/** Fail closed: anything but an explicit false reads as on. */
function brakeIsOn(value: boolean | null | undefined): boolean {
  return value !== false;
}

function toBrakeState(row: BrakeRow): PayoutBrakeState {
  return {
    on: brakeIsOn(row.payouts_require_approval),
    changedAt: row.payouts_require_approval_changed_at,
    changedByName: personName(row.changer),
  };
}

export function usePayoutBrake() {
  return useQuery({
    queryKey: PAYOUT_BRAKE_QUERY_KEY,
    queryFn: async (): Promise<PayoutBrakeState> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select(BRAKE_SELECT)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // A singleton: no row means it could not be read, never "no brake".
      if (!data) throw new Error('Could not read the payout brake.');
      return toBrakeState(data as unknown as BrakeRow);
    },
  });
}

export const PAYOUT_BRAKE_ON_QUERY_KEY = ['payout-brake', 'on'] as const;

/**
 * MYK9-2172: whether the brake is on, for the wording a club or secretary reads.
 * The same column as usePayoutBrake, read alone: a club has no use for who
 * switched it. Fails closed like usePayoutBrake: while it loads, offline, or on
 * an error it reads as on, so no screen names an exact payout day the brake
 * could make untrue.
 */
export function usePayoutBrakeOn(enabled = true): boolean {
  const query = useQuery({
    queryKey: PAYOUT_BRAKE_ON_QUERY_KEY,
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('payouts_require_approval')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Could not read the payout brake.');
      return brakeIsOn(
        (data as { payouts_require_approval: boolean | null }).payouts_require_approval
      );
    },
  });
  return query.data ?? true;
}

export function useSetPayoutBrake() {
  const queryClient = useQueryClient();
  return useMutation({
    ...PAYOUT_DECISION_MUTATION_OPTIONS,
    mutationFn: async (on: boolean): Promise<PayoutBrakeState> => {
      const { data, error } = await supabase
        .from('platform_settings')
        .update({ payouts_require_approval: on })
        .eq('id', true)
        .select(BRAKE_SELECT)
        .maybeSingle();
      if (error) throw error;
      // RLS filters an update it refuses to zero rows, with no error.
      if (!data) throw Object.assign(new Error('Permission denied'), { code: '42501' });
      return toBrakeState(data as unknown as BrakeRow);
    },
    onSuccess: state => {
      queryClient.setQueryData(PAYOUT_BRAKE_QUERY_KEY, state);
      queryClient.setQueryData(PAYOUT_BRAKE_ON_QUERY_KEY, state.on);
    },
    // A refused write leaves the cache holding what the screen last read; reread it.
    onError: () => queryClient.invalidateQueries({ queryKey: PAYOUT_BRAKE_QUERY_KEY }),
  });
}

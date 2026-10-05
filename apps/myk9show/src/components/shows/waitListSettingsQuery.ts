/**
 * The show's wait list settings read, shared by the settings card that edits
 * them and the offer dialog that states the offer window (MYK9-1002).
 * NOTE: the columns are added by migration 114 but the Supabase generated
 * types do not know about them yet. Cast via ShowCapacityRow.
 */

import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WaitListShowConfig, MailInStrategy } from '@/types/waitlist-types';
import { waitListSettingsKey, type WaitListSettings } from './useWaitListSwitch';

interface ShowCapacityRow {
  default_judge_day_capacity: number | null;
  mail_in_strategy: MailInStrategy | null;
  mail_in_value: number | null;
  mail_in_deadline: string | null;
  mail_in_auto_release: boolean | null;
  mail_in_release_date: string | null;
  waitlist_payment_deadline_hours: number | null;
  waitlist_auto_offer: boolean | null;
  allow_waitlist: boolean | null;
}

function rowToConfig(row: ShowCapacityRow): WaitListShowConfig {
  return {
    defaultJudgeDayCapacity: row.default_judge_day_capacity ?? 125,
    mailInStrategy: row.mail_in_strategy ?? 'none',
    mailInValue: row.mail_in_value,
    mailInDeadline: row.mail_in_deadline,
    mailInAutoRelease: row.mail_in_auto_release ?? false,
    mailInReleaseDate: row.mail_in_release_date,
    waitlistPaymentDeadlineHours: row.waitlist_payment_deadline_hours ?? 48,
  };
}

export const waitListSettingsQueryOptions = (showId: string) =>
  queryOptions({
    queryKey: waitListSettingsKey(showId),
    queryFn: async (): Promise<WaitListSettings> => {
      const { data: row, error } = await supabase
        .from('shows')
        .select(
          'default_judge_day_capacity, mail_in_strategy, mail_in_value, mail_in_deadline, mail_in_auto_release, mail_in_release_date, waitlist_payment_deadline_hours, waitlist_auto_offer, allow_waitlist'
        )
        .eq('id', showId)
        .single();

      if (error) throw error;
      const capacityRow = row as unknown as ShowCapacityRow;
      return {
        config: rowToConfig(capacityRow),
        autoOffer: capacityRow.waitlist_auto_offer ?? true,
        allowWaitlists: capacityRow.allow_waitlist ?? false,
      };
    },
    enabled: !!showId,
  });

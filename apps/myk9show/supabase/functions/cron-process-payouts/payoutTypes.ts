// The payout run's shared shapes (MYK9-2170, MYK9-2183): what index.ts builds
// and hands to processShow and the Stripe reconciliation.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { ShowMoneyLock } from '../_shared/showMoneyLock.ts';
import type { ClubNoticeDeps } from '../_shared/payoutClubNotices.ts';

export interface EligibleShow {
  id: string;
  name: string;
  club_id: string | null;
  end_date: string;
}

/** A transfer as Stripe lists it; destination is an account id unless expanded. */
export interface StripeTransferListItem {
  id: string;
  amount: number;
  destination: string | { id: string } | null;
}

/** The two Stripe calls the payout run makes. */
export interface StripeTransfers {
  transfers: {
    list(params: {
      transfer_group: string;
      limit: number;
    }): PromiseLike<{ data: StripeTransferListItem[] }>;
    create(
      params: {
        amount: number;
        currency: string;
        destination: string;
        transfer_group: string;
        metadata: Record<string, string>;
      },
      options: { idempotencyKey: string }
    ): PromiseLike<{ id: string }>;
  };
}

export interface PayoutAlertOptions {
  dedupeKey?: string;
  /** operator_alerts severity (the shared alertAdmin's AlertSeverity); defaults to 'error'. */
  severity?: 'info' | 'warn' | 'error';
}

export interface ProcessShowDeps {
  supabase: SupabaseClient;
  stripe: StripeTransfers;
  stripeLivemode: boolean;
  /** platform_settings.payouts_require_approval, read once per run (alert copy only). */
  brakeOn: boolean;
  alertAdmin: (subject: string, html: string, opts?: PayoutAlertOptions) => Promise<unknown>;
  clubNoticeDeps: (clubId: string, contactEmail: string | null | undefined) => ClubNoticeDeps;
  acquireMoneyLock: (showId: string) => Promise<ShowMoneyLock>;
  siteUrl: string | undefined;
}

/** A money lock this run holds. */
export type HeldMoneyLock = Extract<ShowMoneyLock, { ok: true }>;

/** The run's counters, reported in the response and the log. */
export type PayoutSummary = Record<string, number>;

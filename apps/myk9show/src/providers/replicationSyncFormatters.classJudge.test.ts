import { describe, expect, it } from 'vitest';
import { PREMIUM_NOT_PUBLISHED_MESSAGE } from '@/features/payments/onlineEntryGate';
import {
  formatClassJudgeRefusal,
  formatSyncFailureReason,
  formatSyncFailureToast,
  type SyncFailedEventDetail,
} from './replicationSyncFormatters';

function detail(error: string): SyncFailedEventDetail {
  return {
    count: 1,
    message: error,
    mutations: [
      {
        id: 'm1',
        tableName: 'entries',
        operation: 'UPDATE',
        error: `Non-retryable error: ${error}`,
        failureKind: 'authorization',
        rpc: { name: 'ringside_update_entry', fields: { result_status: 'qualified' } },
      } as SyncFailedEventDetail['mutations'][number],
    ],
  };
}

describe('class judge refusal (RS403)', () => {
  it('names the judge whose class it is', () => {
    expect(formatSyncFailureToast(detail('This class is judged by Ada Lovelace'))).toBe(
      'Score not saved. This class is judged by Ada Lovelace. Ask them to score it, or ask the secretary.'
    );
  });

  it('says so when the class has no judge', () => {
    expect(formatSyncFailureToast(detail('This class has no judge assigned'))).toBe(
      'Score not saved. This class has no judge assigned. Ask the secretary to assign one.'
    );
  });

  it('adds no second reason line under the sentence', () => {
    expect(formatSyncFailureReason(detail('This class is judged by Ada Lovelace'))).toBeUndefined();
  });

  it('leaves other authorization failures on the generic score message', () => {
    const other = detail('new row violates row-level security policy');
    expect(formatClassJudgeRefusal(other.mutations)).toBeUndefined();
    expect(formatSyncFailureToast(other)).toContain("You're not authorized to score this class");
  });
});

describe('publish-gate refusal in the sync-failure toast (MYK9-2197)', () => {
  it('says the unpublished-premium refusal instead of the generic line', () => {
    const showUpdate: SyncFailedEventDetail = {
      count: 1,
      message: PREMIUM_NOT_PUBLISHED_MESSAGE,
      mutations: [
        {
          id: 'm2',
          tableName: 'shows',
          operation: 'UPDATE',
          error: `Non-retryable error: ${PREMIUM_NOT_PUBLISHED_MESSAGE}`,
        },
      ],
    };
    expect(formatSyncFailureToast(showUpdate)).toBe(
      `We couldn't save this show change. ${PREMIUM_NOT_PUBLISHED_MESSAGE}`
    );
  });
});

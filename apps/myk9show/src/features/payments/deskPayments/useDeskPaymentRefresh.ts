import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UploadCompleteEventDetail } from '@myk9/replication';
import { showPaymentsQueryKey } from '@/services/database/show-payments';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps } from './deskPaymentDeps';
import {
  DESK_PAYMENTS_RECORDED_EVENT,
  settleUploadedDeskPayments,
  type DeskPaymentsRecordedDetail,
} from './deskPaymentEvents';

/**
 * MYK9-2479, app-wide (mounted by the replication provider): a replayed desk payment
 * that the queue got through settles its local record, and every show whose money moved
 * has its ledger read (`['show-payments', showId]`) refreshed, so an open close-out is
 * current without a reload. Entry Management reloads its forms on the same event
 * (`useReloadOnDeskPaymentsRecorded`). The generic handler refreshes only `[tableName]`.
 */
export function useDeskPaymentRefresh(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const onUploadComplete = (event: Event) => {
      const detail = (event as CustomEvent<UploadCompleteEventDetail>).detail;
      void settleUploadedDeskPayments(
        detail,
        defaultDeskPaymentDeps.table,
        defaultDeskPaymentDeps.refreshEntries
      ).catch(error =>
        logger.warn('Settling replayed desk payments failed', 'replication', {}, error as Error)
      );
    };
    const onRecorded = (event: Event) => {
      const { showIds } = (event as CustomEvent<DeskPaymentsRecordedDetail>).detail;
      for (const showId of showIds) {
        void queryClient.invalidateQueries({ queryKey: showPaymentsQueryKey(showId) });
      }
    };
    window.addEventListener('replication:upload-complete', onUploadComplete);
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, onRecorded);
    return () => {
      window.removeEventListener('replication:upload-complete', onUploadComplete);
      window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, onRecorded);
    };
  }, [queryClient]);
}

/** Entry Management's half: reload the form money of the show on screen when it moved. */
export function useReloadOnDeskPaymentsRecorded(
  selectedShowId: string,
  loadEntries: (showId: string) => Promise<void>
): void {
  useEffect(() => {
    if (!selectedShowId) return;
    const onRecorded = (event: Event) => {
      const { showIds } = (event as CustomEvent<DeskPaymentsRecordedDetail>).detail;
      if (showIds.includes(selectedShowId)) void loadEntries(selectedShowId);
    };
    window.addEventListener(DESK_PAYMENTS_RECORDED_EVENT, onRecorded);
    return () => window.removeEventListener(DESK_PAYMENTS_RECORDED_EVENT, onRecorded);
  }, [selectedShowId, loadEntries]);
}

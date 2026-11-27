import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '@/context/authContextObject';
import { UNSENT_WORK_REFRESH_EVENTS, announceUnsentChanged } from '@/hooks/useUnsentWork';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps, type DeskPaymentDeps } from './deskPaymentDeps';
import { DESK_PAYMENTS_RECORDED_EVENT } from './deskPaymentEvents';
import {
  readDeskPaymentLines,
  removeRefusedDeskPayment,
  retryDeskPayment,
  type LedgerCheckCache,
} from './deskPaymentReader';
import type { DeskPaymentLine } from './deskPaymentTypes';

const REFRESH_EVENTS = [...UNSENT_WORK_REFRESH_EVENTS, DESK_PAYMENTS_RECORDED_EVENT, 'online'];

export interface DeskPaymentLinesState {
  lines: DeskPaymentLine[];
  /** The action in progress, by payment id, so its button cannot be pressed twice. */
  busyId: string | null;
  tryAgain: (line: DeskPaymentLine) => void;
  remove: (line: DeskPaymentLine) => void;
}

/**
 * MYK9-2479: one form's payments held on this device, for the signed-in account only.
 * Re-read on every queue event, every local write, and an account switch, so a line
 * follows its payment from "waiting to send" until it is proven recorded and goes.
 */
export function useDeskPaymentLines(
  showId: string | undefined,
  enrollmentId: string | null | undefined,
  deps: DeskPaymentDeps = defaultDeskPaymentDeps
): DeskPaymentLinesState {
  const authUserId = useContext(AuthContext)?.user?.id ?? null;
  // The read, with the show and account it was made for: a line is shown only under both.
  const [read, setRead] = useState<{
    showId: string;
    owner: string | null;
    lines: DeskPaymentLine[];
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const ledgerCache = useRef<LedgerCheckCache | null>(null);
  const latest = useRef(0);

  const refresh = useCallback(() => {
    const request = ++latest.current;
    if (!showId) return;
    readDeskPaymentLines(showId, deps, ledgerCache)
      .then(next => {
        if (request === latest.current) setRead({ showId, owner: authUserId, lines: next });
      })
      .catch(error => {
        // An unreadable device shows no line rather than an earlier read; the next event reads again.
        if (request === latest.current) setRead({ showId, owner: authUserId, lines: [] });
        logger.warn('Desk payments could not be read', 'secretary', {}, error as Error);
      });
  }, [authUserId, deps, showId]);

  useEffect(() => {
    refresh();
    const unsubscribe = deps.table.subscribe(() => refresh());
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
    return () => {
      latest.current += 1;
      unsubscribe();
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
    };
  }, [deps, refresh]);

  const lines =
    read && read.showId === showId && read.owner === authUserId && enrollmentId
      ? read.lines.filter(line => line.payment.enrollmentId === enrollmentId)
      : [];

  const run = useCallback(
    (line: DeskPaymentLine, action: () => Promise<void>) => {
      if (busyId) return;
      setBusyId(line.payment.id);
      ledgerCache.current = null;
      void action()
        .catch(error => logger.warn('Desk payment action failed', 'secretary', {}, error as Error))
        .finally(() => {
          setBusyId(null);
          announceUnsentChanged();
          refresh();
        });
    },
    [busyId, refresh]
  );

  return {
    lines,
    busyId,
    tryAgain: line => run(line, () => retryDeskPayment(line, deps)),
    remove: line => run(line, () => removeRefusedDeskPayment(line, deps)),
  };
}

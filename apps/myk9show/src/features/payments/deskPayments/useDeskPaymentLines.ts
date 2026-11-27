import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '@/context/authContextObject';
import { UNSENT_WORK_REFRESH_EVENTS, announceUnsentChanged } from '@/hooks/useUnsentWork';
import { logger } from '@/services/LoggingService';
import { defaultDeskPaymentDeps, type DeskPaymentDeps } from './deskPaymentDeps';
import { announceDeskPaymentsRecorded, DESK_PAYMENTS_RECORDED_EVENT } from './deskPaymentEvents';
import {
  readDeskPaymentLines,
  removeRefusedDeskPayment,
  retryDeskPayment,
  type LedgerCheckCache,
} from './deskPaymentReader';
import type { DeskPaymentLine } from './deskPaymentTypes';

/**
 * How often a form with something shown re-reads with no event (Codex round 1 on #4461):
 * an upload pass with only retryable failures announces nothing, and another tab's
 * queue events stay in that tab. No cross-tab channel exists in the app to reuse.
 */
export const DESK_PAYMENT_LINES_POLL_MS = 15_000;

const REFRESH_EVENTS = [...UNSENT_WORK_REFRESH_EVENTS, DESK_PAYMENTS_RECORDED_EVENT, 'online'];

export interface DeskPaymentLinesState {
  lines: DeskPaymentLine[];
  /** The action in progress, by payment id, so its button cannot be pressed twice. */
  busyId: string | null;
  /**
   * The last read of this device's payments failed. `lines` are the last ones known for
   * this show and account (none, if no read has worked yet) and their actions are off:
   * an unreadable queue is not an empty one.
   */
  unreadable: boolean;
  /**
   * A line this form showed has gone (settled here or in another tab) and the show's money
   * is being reloaded: until it is, the form's balance may not count that payment yet.
   */
  balanceRefreshing: boolean;
  tryAgain: (line: DeskPaymentLine) => void;
  remove: (line: DeskPaymentLine) => void;
}

/**
 * MYK9-2479: one form's payments held on this device, for the signed-in account only.
 * Re-read on every queue event, every local write, an account switch, a return to the
 * tab, and every 15 seconds while something is shown, so a line follows its payment from
 * "waiting to send" until it is proven recorded and goes. A line that goes reloads the
 * show's money itself (Codex round 2 on #4461): whichever tab settled it, this tab's
 * balance then counts it, and `balanceRefreshing` says so until it does.
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
    unreadable: boolean;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [balanceRefreshes, setBalanceRefreshes] = useState(0);
  const ledgerCache = useRef<LedgerCheckCache | null>(null);
  const latest = useRef(0);
  // The ids this form last showed, for the show, account and form they were read under.
  const shown = useRef<{ key: string; ids: string[] } | null>(null);

  const refreshBalance = useCallback((forShow: string) => {
    setBalanceRefreshes(count => count + 1);
    void announceDeskPaymentsRecorded([forShow]).finally(() =>
      setBalanceRefreshes(count => count - 1)
    );
  }, []);

  const refresh = useCallback(() => {
    const request = ++latest.current;
    if (!showId) return;
    readDeskPaymentLines(showId, deps, ledgerCache)
      .then(next => {
        if (request !== latest.current) return;
        const key = `${showId}|${authUserId ?? ''}|${enrollmentId ?? ''}`;
        const before = shown.current?.key === key ? shown.current.ids : [];
        const present = new Set(next.map(line => line.payment.id));
        shown.current = {
          key,
          ids: next
            .filter(line => line.payment.enrollmentId === enrollmentId)
            .map(l => l.payment.id),
        };
        setRead({ showId, owner: authUserId, lines: next, unreadable: false });
        if (before.some(id => !present.has(id))) refreshBalance(showId);
      })
      .catch(error => {
        // Keep what was last known for this show and account, and say the read failed:
        // showing nothing would read as "nothing waiting" and invite a second payment.
        if (request === latest.current) {
          setRead(prev =>
            prev && prev.showId === showId && prev.owner === authUserId
              ? { ...prev, unreadable: true }
              : { showId, owner: authUserId, lines: [], unreadable: true }
          );
        }
        logger.warn('Desk payments could not be read', 'secretary', {}, error as Error);
      });
  }, [authUserId, deps, enrollmentId, refreshBalance, showId]);

  useEffect(() => {
    refresh();
    const unsubscribe = deps.table.subscribe(() => refresh());
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') refresh();
    };
    for (const name of REFRESH_EVENTS) window.addEventListener(name, refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      latest.current += 1;
      unsubscribe();
      for (const name of REFRESH_EVENTS) window.removeEventListener(name, refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [deps, refresh]);

  const current = read && read.showId === showId && read.owner === authUserId ? read : null;
  const lines =
    current && enrollmentId
      ? current.lines.filter(line => line.payment.enrollmentId === enrollmentId)
      : [];
  const unreadable = current?.unreadable ?? false;
  const polling = lines.length > 0 || unreadable;

  useEffect(() => {
    if (!polling) return undefined;
    const timer = setInterval(refresh, DESK_PAYMENT_LINES_POLL_MS);
    return () => clearInterval(timer);
  }, [polling, refresh]);

  const run = useCallback(
    (line: DeskPaymentLine, action: () => Promise<void>) => {
      if (busyId || unreadable) return;
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
    [busyId, refresh, unreadable]
  );

  return {
    lines,
    busyId,
    unreadable,
    balanceRefreshing: balanceRefreshes > 0,
    tryAgain: line => run(line, () => retryDeskPayment(line, deps)),
    remove: line => run(line, () => removeRefusedDeskPayment(line, deps)),
  };
}

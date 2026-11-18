import { useCallback, useRef, useState } from 'react';
import type { LedgerWriteOutcome } from '@/hooks/useEnrollmentLedgerActions';

/**
 * Where one payment or refund dialog's ledger write stands. `failed`: refused,
 * nothing recorded. `unconfirmed`: the answer was lost, so it may have been saved.
 */
export type LedgerSaveStatus = 'idle' | 'saving' | 'failed' | 'unconfirmed';

/**
 * MYK9-2156: a payment or refund dialog closes only after its ledger write
 * succeeds. A failed or unconfirmed write leaves the dialog open with what the
 * secretary typed, so a cash payment is not lost to a Wi-Fi blip, and a second
 * click while the write is pending does nothing (a payment recorded twice is
 * worse than the bug).
 */
export function useLedgerDialogSave() {
  const [status, setStatus] = useState<LedgerSaveStatus>('idle');
  const inFlight = useRef(false);

  const save = useCallback(
    async (write: () => Promise<LedgerWriteOutcome>, onSaved: () => void) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setStatus('saving');
      // A write that throws gave no answer: it may have reached the server.
      let outcome: LedgerWriteOutcome = 'unconfirmed';
      try {
        outcome = await write();
      } catch {
        outcome = 'unconfirmed';
      } finally {
        inFlight.current = false;
      }
      if (outcome === 'saved') {
        setStatus('idle');
        onSaved();
      } else {
        setStatus(outcome);
      }
    },
    []
  );

  /** A freshly opened dialog starts with no message from an earlier attempt. */
  const reset = useCallback(() => setStatus('idle'), []);

  return { status, save, reset };
}

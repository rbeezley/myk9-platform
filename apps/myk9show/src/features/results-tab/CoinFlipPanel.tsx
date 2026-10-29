import { useMemo } from 'react';

import type { ResultsClassRow } from './buildResultsClassRows';
import { CoinFlipDialog, type CoinFlipGroupsState } from './CoinFlipDialog';
import { coinFlipAction, deriveClassTies } from './coinFlipRows';
import { useRecordCoinFlip } from './useRecordCoinFlip';

interface CoinFlipPanelProps {
  showId: string;
  /** The selected class; the dialog exists only for one. */
  row: ResultsClassRow;
  isNationals: boolean | null;
  rankingKeyState: CoinFlipGroupsState;
  onRetry: () => void;
  online: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * MYK9-1473: the coin flip dialog for the selected class. Its tie groups are derived from the
 * class's replicated rows (recorded ones included, so a wrong winner can be corrected), and it
 * stays closed unless the class actually owes or may change a flip.
 */
export function CoinFlipPanel({
  showId,
  row,
  isNationals,
  rankingKeyState,
  onRetry,
  online,
  open,
  onOpenChange,
}: CoinFlipPanelProps) {
  const coinFlip = useRecordCoinFlip(showId);
  const groups = useMemo(() => deriveClassTies(row.entries, isNationals), [isNationals, row]);
  return (
    <CoinFlipDialog
      key={row.id}
      open={open && coinFlipAction(row) !== null}
      onOpenChange={onOpenChange}
      className={row.name}
      groups={groups}
      groupsState={rankingKeyState}
      onRetry={onRetry}
      online={online}
      saving={coinFlip.isPending}
      onSave={orders =>
        coinFlip
          .save({ classId: row.id, trialId: row.trialId, orders })
          .then(() => onOpenChange(false))
          .catch(() => undefined)
      }
    />
  );
}

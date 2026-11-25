import { useState } from 'react';
import { DollarSign } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { BulkBarButton } from '@/components/list-toolkit';
import { parseShowFee } from '@/components/panels/edit/classEntryFeeCopy';
import { formatFeeDollars } from '@/features/_shared/juniorFeeLimit';
import { useShowStore } from '@/store/showStore';
import { useBulkClassEntryFee, type BulkFeeClass } from './useBulkClassEntryFee';

interface BulkEntryFeeProps {
  showId: string | undefined;
  classes: readonly BulkFeeClass[];
  /** Called when every selected class took the change; the bar clears its selection. */
  onFullSuccess: () => void;
}

/**
 * Select classes' "Set entry fee" (MYK9-1931): pick the classes, set the fee. "Use the show's
 * fee" empties it, so the classes charge the show's fee again. The same write as the fee field
 * in Edit class; entries already made keep what they were charged. The dialog mounts only
 * when opened, like Assign steward's.
 */
export function BulkEntryFeeButton({
  disabled,
  ...props
}: BulkEntryFeeProps & { disabled: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <BulkBarButton
        onClick={() => setOpen(true)}
        icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
        disabled={disabled}
      >
        Set entry fee
      </BulkBarButton>
      {open && <BulkEntryFeeDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function BulkEntryFeeDialog({
  showId,
  classes,
  onFullSuccess,
  onClose,
}: BulkEntryFeeProps & { onClose: () => void }) {
  const [fee, setFeeValue] = useState(0);
  const { setFee, busy } = useBulkClassEntryFee();
  const { shows } = useShowStore();
  const showFee = parseShowFee(shows.find(show => show.id === showId)?.preEntryFee);
  const count = classes.length;

  const apply = async (value: number | null) => {
    const ok = await setFee(classes, value);
    onClose();
    if (ok) onFullSuccess();
  };

  return (
    <Dialog
      open
      onOpenChange={next => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set entry fee</DialogTitle>
          <DialogDescription>
            {count} {count === 1 ? 'class' : 'classes'} selected. Entries already made keep the fee
            they were charged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="bulkClassEntryFee">Entry fee for these classes</Label>
          <CurrencyInput
            id="bulkClassEntryFee"
            value={fee}
            onChange={setFeeValue}
            placeholder="Show's fee"
            disabled={busy}
            aria-describedby={showFee === null ? undefined : 'bulkClassEntryFee-hint'}
          />
          {showFee !== null && (
            <p id="bulkClassEntryFee-hint" className="text-xs text-muted-foreground">
              The show&apos;s fee is {formatFeeDollars(showFee)}.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void apply(null)}>
            Use the show&apos;s fee
          </Button>
          <Button disabled={busy || fee <= 0} onClick={() => void apply(fee)}>
            Set fee
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

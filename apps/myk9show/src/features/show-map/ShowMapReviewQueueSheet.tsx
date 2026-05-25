import { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { ReviewQueueDogGroup } from './showMapReviewQueue';

interface ShowMapReviewQueueSheetProps {
  open: boolean;
  onClose: () => void;
  groups: readonly ReviewQueueDogGroup[];
  onApprove: (entryIds: string[]) => void;
  isApproving: boolean;
}

// INTENT: Day-one mass-approval surface. At the start of a show cycle, every
// submitted entry needs approval — the per-entry review sheet would force
// dozens of context switches. The queue sheet lists dogs (default all
// selected) so a secretary clears the entire backlog in two clicks
// (open queue → Approve N) while still being able to deselect specific dogs
// they want to review individually.
export function ShowMapReviewQueueSheet({
  open,
  onClose,
  groups,
  onApprove,
  isApproving,
}: ShowMapReviewQueueSheetProps) {
  const allKeys = useMemo(() => groups.map(g => g.key), [groups]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(allKeys));

  // Reset selection to "all" every time the sheet opens or the queue changes.
  useEffect(() => {
    if (open) setSelected(new Set(allKeys));
  }, [open, allKeys]);

  const selectedCount = useMemo(
    () =>
      groups.reduce(
        (sum, group) => sum + (selected.has(group.key) ? group.count : 0),
        0
      ),
    [groups, selected]
  );

  const toggleGroup = (key: string) => {
    setSelected(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allChecked = selected.size === groups.length && groups.length > 0;
  const noneChecked = selected.size === 0;
  const setAll = (checked: boolean) => {
    setSelected(checked ? new Set(allKeys) : new Set());
  };

  const handleApprove = () => {
    const ids = groups
      .filter(group => selected.has(group.key))
      .flatMap(group => group.entryIds);
    onApprove(ids);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={next => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
        aria-label="Review queue"
      >
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle>Review queue</SheetTitle>
          <SheetDescription>
            {groups.length === 0
              ? 'No entries are currently waiting for approval.'
              : 'Uncheck any dog you want to review individually first, then approve the rest.'}
          </SheetDescription>
        </SheetHeader>

        {groups.length > 0 && (
          <div className="flex items-center justify-between border-b px-6 py-3">
            <label
              className="flex cursor-pointer items-center gap-2 text-sm"
              data-testid="review-queue-select-all"
            >
              <Checkbox
                checked={allChecked ? true : noneChecked ? false : 'indeterminate'}
                onCheckedChange={checked => setAll(checked === true)}
              />
              <span className="font-medium">Select all dogs</span>
            </label>
            <Badge variant="secondary" data-testid="review-queue-selected-count">
              {selectedCount} selected
            </Badge>
          </div>
        )}

        <ul
          className="flex-1 divide-y overflow-y-auto"
          data-testid="review-queue-list"
        >
          {groups.map(group => (
            <li key={group.key} className="px-6 py-3">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-3 text-left"
                data-group-key={group.key}
                data-testid={`review-queue-toggle-${group.key}`}
                onClick={() => toggleGroup(group.key)}
              >
                <Checkbox
                  checked={selected.has(group.key)}
                  tabIndex={-1}
                  // Toggle is owned by the parent button; the checkbox is
                  // visual-only here. onCheckedChange is wired so keyboard
                  // focus on the checkbox still updates state if the user
                  // tabs to it directly.
                  onCheckedChange={() => toggleGroup(group.key)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{group.dogName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {group.handler ? `${group.handler} · ` : ''}
                    {group.count} {group.count === 1 ? 'entry' : 'entries'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>

        <SheetFooter className="border-t px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isApproving}
            data-testid="review-queue-cancel"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleApprove}
            disabled={isApproving || selectedCount === 0}
            data-testid="review-queue-approve"
          >
            {isApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {selectedCount === 0
              ? 'Approve entries'
              : selectedCount === 1
                ? 'Approve 1 entry'
                : `Approve ${selectedCount} entries`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

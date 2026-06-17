import React, { useState } from 'react';
import { AlertTriangle, Trash2, UserX, Dog } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOwnedLiveDogsByPersonQuery } from '@/hooks/queries/useDogsDatabase';

type DeleteMode = 'soft' | 'permanent';

const MAX_DOGS_LISTED = 8;

interface AdminDeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  entityName: string;
  isDeleting: boolean;
  bulkCount?: number;
  /** The person being deleted. Drives the owns-dogs guard (single delete only). */
  personId?: string;
}

export function AdminDeleteUserDialog({
  open,
  onOpenChange,
  onSoftDelete,
  onPermanentDelete,
  entityName,
  isDeleting,
  bulkCount,
  personId,
}: AdminDeleteUserDialogProps) {
  const [mode, setMode] = useState<DeleteMode>('soft');

  // Reset to soft delete when dialog opens
  React.useEffect(() => {
    if (open) setMode('soft');
  }, [open]);

  // A person who still owns live dogs can't be deleted (it would orphan them) —
  // the DB trigger (migration 20260617130000) enforces it; this is the friendly
  // pre-check. Single-person delete only; bulk relies on the DB guard.
  const checkOwnedDogs = open && !!personId && !bulkCount;
  const { data: ownedDogs, isLoading: dogsLoading } = useOwnedLiveDogsByPersonQuery(
    personId ?? '',
    checkOwnedDogs
  );
  const blockedByDogs = checkOwnedDogs && !dogsLoading && (ownedDogs?.length ?? 0) > 0;

  const handleConfirm = () => {
    if (mode === 'soft') {
      onSoftDelete();
    } else {
      onPermanentDelete();
    }
  };

  if (blockedByDogs) {
    const dogs = ownedDogs ?? [];
    const shown = dogs.slice(0, MAX_DOGS_LISTED);
    const remaining = dogs.length - shown.length;
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dog className="h-5 w-5" />
              Can&apos;t delete {entityName}
            </DialogTitle>
            <DialogDescription>
              This person still owns {dogs.length} live{' '}
              {dogs.length === 1 ? 'dog' : 'dogs'}. Deleting them would leave{' '}
              {dogs.length === 1 ? 'it' : 'them'} without an owner.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Delete or reassign these dogs first:</span>
              <ul className="mt-2 list-disc pl-5 space-y-0.5">
                {shown.map(d => (
                  <li key={d.id}>{d.name}</li>
                ))}
              </ul>
              {remaining > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">…and {remaining} more.</p>
              )}
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Delete {bulkCount ? 'Users' : 'User'}
          </DialogTitle>
          <DialogDescription>
            Choose how to delete <strong>{entityName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Soft Delete Option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors
              ${mode === 'soft' ? 'border-primary bg-primary/5' : 'border-border hover:border-border/80'}`}
          >
            <input
              type="radio"
              name="deleteMode"
              value="soft"
              checked={mode === 'soft'}
              onChange={() => setMode('soft')}
              className="mt-1"
              aria-label="Deactivate"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <UserX className="h-4 w-4 text-orange-500" />
                <span className="font-medium">Deactivate</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Hides the user from the system. Records are preserved and can be restored later.
              </p>
            </div>
          </label>

          {/* Permanent Delete Option */}
          <label
            className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors
              ${mode === 'permanent' ? 'border-destructive bg-destructive/5' : 'border-border hover:border-border/80'}`}
          >
            <input
              type="radio"
              name="deleteMode"
              value="permanent"
              checked={mode === 'permanent'}
              onChange={() => setMode('permanent')}
              className="mt-1"
              aria-label="Permanently delete"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="font-medium">Permanently delete</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Removes all data and the login account. This cannot be undone.
              </p>
            </div>
          </label>

          {/* Warning for permanent delete */}
          {mode === 'permanent' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                This will permanently delete <strong>{entityName}</strong>, including their login
                account, roles, and club memberships. Proceed with caution.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant={mode === 'permanent' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : mode === 'soft' ? 'Deactivate' : 'Permanently Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

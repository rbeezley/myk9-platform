import React, { useState } from 'react';
import { AlertTriangle, Trash2, UserX } from 'lucide-react';
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

type DeleteMode = 'soft' | 'permanent';

interface AdminDeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSoftDelete: () => void;
  onPermanentDelete: () => void;
  entityName: string;
  isDeleting: boolean;
  bulkCount?: number;
}

export function AdminDeleteUserDialog({
  open,
  onOpenChange,
  onSoftDelete,
  onPermanentDelete,
  entityName,
  isDeleting,
  bulkCount,
}: AdminDeleteUserDialogProps) {
  const [mode, setMode] = useState<DeleteMode>('soft');

  // Reset to soft delete when dialog opens
  React.useEffect(() => {
    if (open) setMode('soft');
  }, [open]);

  const handleConfirm = () => {
    if (mode === 'soft') {
      onSoftDelete();
    } else {
      onPermanentDelete();
    }
  };

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
                This will permanently delete <strong>{entityName}</strong>, including all related
                records (dogs, entries, registrations). Proceed with caution.
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

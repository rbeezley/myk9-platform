/**
 * Delete Dog Dialog Component
 *
 * Confirmation dialog for removing a dog
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ExhibitorDog } from '@/services/exhibitorService';

interface DeleteDogDialogProps {
  dog: ExhibitorDog | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteDogDialog({ dog, onOpenChange, onConfirm, isDeleting }: DeleteDogDialogProps) {
  return (
    <Dialog open={!!dog} onOpenChange={() => onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Dog</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove {dog?.call_name || dog?.name}? This will mark the dog
            as inactive but won't delete their entry history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { motion } from 'framer-motion';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DialogFooter } from '@/components/ui/dialog';

interface ConfirmationOverlayProps {
  isResolving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmationOverlay({ isResolving, onCancel, onConfirm }: ConfirmationOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="mt-4"
    >
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Are you sure you want to apply this resolution? This action cannot be undone.
        </AlertDescription>
      </Alert>
      <DialogFooter className="mt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isResolving}
        >
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isResolving}
          className="bg-gradient-to-r from-primary to-secondary"
        >
          {isResolving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Resolving...
            </>
          ) : (
            'Confirm Resolution'
          )}
        </Button>
      </DialogFooter>
    </motion.div>
  );
}

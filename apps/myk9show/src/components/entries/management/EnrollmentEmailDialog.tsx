import React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface EnrollmentEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSending: boolean;
  ownerName: string | undefined;
  message: string;
  onMessageChange: (value: string) => void;
  onCancel: () => void;
  onSend: () => void;
}

/**
 * Controlled "Email Exhibitor" dialog. The async send (which computes amount
 * due and calls the decision-email handler) lives in the parent EnrollmentCard
 * and is passed as `onSend`; this shell owns only the presentation.
 */
export const EnrollmentEmailDialog: React.FC<EnrollmentEmailDialogProps> = ({
  open,
  onOpenChange,
  isSending,
  ownerName,
  message,
  onMessageChange,
  onCancel,
  onSend,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Email Exhibitor</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          Sending entry decisions to <strong>{ownerName ?? 'exhibitor'}</strong>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="email-message">
            Message to exhibitor{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="email-message"
            value={message}
            onChange={e => onMessageChange(e.target.value)}
            placeholder="Add any notes, parking info, payment instructions…"
            rows={4}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isSending}>
          Cancel
        </Button>
        <Button disabled={isSending} onClick={onSend}>
          {isSending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Sending…
            </>
          ) : (
            'Send Email'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EnrollmentEmailDialog;

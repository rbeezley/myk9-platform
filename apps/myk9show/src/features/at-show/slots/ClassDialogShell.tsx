/**
 * ClassDialogShell — the one frame for the ringside class dialogs (MYK9-1502):
 * a small icon and eyebrow over the class name, a divider, the body, and a Close
 * footer. The dialog caps at the viewport; only the body scrolls, so Close stays
 * reachable on a phone. Theme tokens only.
 */
import type React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { handleOpenChange } from './dialogHelpers';

interface ClassDialogShellProps {
  icon: LucideIcon;
  /** "Class options", "Status", "Select areas". */
  eyebrow: string;
  className: string;
  onClose: () => void;
  children: React.ReactNode;
}

export const ClassDialogShell: React.FC<ClassDialogShellProps> = ({
  icon: Icon,
  eyebrow,
  className,
  onClose,
  children,
}) => (
  <Dialog open onOpenChange={open => handleOpenChange(open, onClose)}>
    <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0">
      <DialogHeader className="space-y-1 px-5 pb-3 pr-12 pt-5 text-left">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon aria-hidden className="h-3.5 w-3.5" />
          {eyebrow}
        </p>
        <DialogTitle className="text-lg leading-snug">{className}</DialogTitle>
      </DialogHeader>
      <div className="border-t border-border" />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">{children}</div>
      <div className="flex justify-end border-t border-border px-5 py-3">
        <Button variant="ghost" className="min-h-11" onClick={onClose}>
          Close
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

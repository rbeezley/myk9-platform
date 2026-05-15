import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Globe, Loader2, RefreshCw } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog/dialog';
import { productVersion, formattedBuildDate } from '@/config/appVersion';
import {
  applyPwaUpdate,
  checkForPwaUpdate,
  onUpdateAvailable,
} from '@/services/pwa/pwaUpdate';

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'updating';

export const AboutDialog: React.FC<AboutDialogProps> = ({ open, onOpenChange }) => {
  const [status, setStatus] = useState<UpdateStatus>('idle');

  // Subscribe to update events while the dialog is open so the button reflects live state.
  useEffect(() => {
    if (!open) return;
    const unsubscribe = onUpdateAvailable(() => setStatus('update-available'));

    // Also check current SW state on open in case an update is already waiting.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then(reg => {
          if (reg?.waiting) setStatus('update-available');
        })
        .catch(() => {
          /* ignore */
        });
    }

    return () => {
      unsubscribe();
      setStatus('idle');
    };
  }, [open]);

  const handleCheck = useCallback(async () => {
    setStatus('checking');
    const hasUpdate = await checkForPwaUpdate();
    if (hasUpdate) {
      setStatus('update-available');
      return;
    }
    setStatus('up-to-date');
    setTimeout(() => setStatus(prev => (prev === 'up-to-date' ? 'idle' : prev)), 4000);
  }, []);

  const handleApply = useCallback(async () => {
    setStatus('updating');
    await applyPwaUpdate();
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="items-center text-center">
          <div className="mx-auto mb-2 w-[72px] h-[72px] rounded-2xl bg-muted p-2 shadow-md border-2 border-border">
            <img
              src="/pwa-192x192.png"
              alt="myK9Show Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">myK9Show</DialogTitle>
          <DialogDescription className="text-primary font-semibold tracking-wide text-center">
            Show Management
          </DialogDescription>
        </DialogHeader>

        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">Version {productVersion}</p>
          <p className="text-xs text-muted-foreground/70">Build: {formattedBuildDate}</p>
        </div>

        <UpdateRow status={status} onCheck={handleCheck} onApply={handleApply} />

        {/* Links */}
        <a
          href="https://myk9t.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-4 py-3 bg-muted rounded-lg text-primary text-sm font-medium hover:bg-accent transition-colors"
        >
          <Globe className="h-5 w-5" />
          <span>Visit myk9t.com</span>
        </a>

        {/* Copyright */}
        <div className="pt-3 border-t text-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} myK9T. All rights reserved.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface UpdateRowProps {
  status: UpdateStatus;
  onCheck: () => void;
  onApply: () => void;
}

const UpdateRow: React.FC<UpdateRowProps> = ({ status, onCheck, onApply }) => {
  if (status === 'update-available' || status === 'updating') {
    const updating = status === 'updating';
    return (
      <button
        type="button"
        disabled={updating}
        onClick={onApply}
        className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-70"
      >
        {updating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating…
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4" />
            Update Now
          </>
        )}
      </button>
    );
  }

  if (status === 'up-to-date') {
    return (
      <div className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-lg bg-muted text-sm font-medium text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-emerald-500" />
        You're up to date
      </div>
    );
  }

  const checking = status === 'checking';
  return (
    <button
      type="button"
      disabled={checking}
      onClick={onCheck}
      className="flex w-full items-center justify-center gap-2 px-4 py-3 rounded-lg bg-muted text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-70"
    >
      {checking ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking…
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          Check for updates
        </>
      )}
    </button>
  );
};

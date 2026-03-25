/**
 * PWA Install Banner
 *
 * Smart banner that appears at the top of the app when:
 * - App is not installed as PWA
 * - Browser supports PWA installation (Chrome/Edge) OR user is on iOS Safari
 *
 * Uses shadcn Dialog for iOS instructions modal.
 */

import { useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallBanner() {
  const { isInstalled, canInstall, isIOSSafari, isDismissed, promptInstall, dismissInstallPrompt } =
    usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  const shouldShow = !isInstalled && !isDismissed && (canInstall || isIOSSafari);

  if (!shouldShow) return null;

  const handleInstall = async () => {
    if (canInstall) {
      await promptInstall();
    } else if (isIOSSafari) {
      setShowIOSInstructions(true);
    }
  };

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md animate-in slide-in-from-top duration-300">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
          {isIOSSafari ? (
            <Share className="h-5 w-5 shrink-0" />
          ) : (
            <Download className="h-5 w-5 shrink-0" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold">Install myK9Show</span>
            <span className="truncate text-xs opacity-90">
              {isIOSSafari
                ? 'Get notifications for your dogs'
                : 'Quick access from your home screen'}
            </span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleInstall}
            className="shrink-0 font-semibold"
          >
            {isIOSSafari ? 'Show me' : 'Install'}
          </Button>
          <button
            onClick={dismissInstallPrompt}
            className="shrink-0 rounded p-1 opacity-80 transition-opacity hover:opacity-100"
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Spacer to push content below the fixed banner */}
      <div className="h-[52px] sm:h-[56px]" />

      {/* iOS Safari Instructions Dialog */}
      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="items-center text-center">
            <div className="mb-2 rounded-full bg-primary/10 p-3">
              <Download className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-xl">Install myK9Show</DialogTitle>
          </DialogHeader>

          <p className="text-center text-sm text-muted-foreground">
            Add to your home screen to receive notifications when your dogs are up!
          </p>

          <ol className="my-4 space-y-0 divide-y divide-border">
            {[
              {
                step: 1,
                text: (
                  <>
                    Tap the <strong>Share</strong> button{' '}
                    <Share className="inline h-4 w-4 align-text-bottom" /> at the bottom of Safari
                  </>
                ),
              },
              {
                step: 2,
                text: (
                  <>
                    Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>
                  </>
                ),
              },
              {
                step: 3,
                text: (
                  <>
                    Tap <strong>&quot;Add&quot;</strong> in the top right corner
                  </>
                ),
              },
            ].map(({ step, text }) => (
              <li key={step} className="flex items-start gap-3 py-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {step}
                </span>
                <span className="pt-0.5 text-sm leading-relaxed">{text}</span>
              </li>
            ))}
          </ol>

          <p className="text-center text-xs italic text-muted-foreground">
            Then open myK9Show from your home screen to get notified!
          </p>

          <Button className="mt-2 w-full" onClick={() => setShowIOSInstructions(false)}>
            Got it!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

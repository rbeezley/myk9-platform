/**
 * PWA Install Banner
 *
 * Smart banner that appears at the top of the app when:
 * - App is not installed as PWA
 * - Browser supports PWA installation (Chrome/Edge) OR user is on iOS Safari
 *
 * Uses shadcn Dialog for iOS instructions modal.
 */

import { useLayoutEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallBanner() {
  const { isInstalled, canInstall, isIOSSafari, isDismissed, promptInstall, dismissInstallPrompt } =
    usePWAInstall();
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  const shouldShow = !isInstalled && !isDismissed && (canInstall || isIOSSafari);

  // Publish the banner's presence to the rest of the app shell. The fixed
  // AppHeader, the sidebar, and sticky sub-headers all read --pwa-banner-height
  // / --app-top-inset (index.css) so they stack BELOW this banner instead of
  // hiding behind it. useLayoutEffect runs before paint, avoiding a flash where
  // the header sits at top-0 for one frame.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('pwa-banner-visible', shouldShow);
    return () => root.classList.remove('pwa-banner-visible');
  }, [shouldShow]);

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
      <div className="fixed top-0 left-0 right-0 z-[60] bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-md animate-in slide-in-from-top duration-300">
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
                ? 'Use Ringside offline and get show alerts'
                : 'One home-screen app for entries, Ringside, and alerts'}
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

      {/* Spacer to push in-flow content below the fixed banner. Driven by the
          same var the header/sidebar read so the offsets can never drift. */}
      <div className="h-[var(--pwa-banner-height,0px)]" />

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
            Add myK9Show to your home screen for Ringside access, offline show-day work, and
            notifications when your dogs are up.
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
            Then open myK9Show from your home screen before show day.
          </p>

          <Button className="mt-2 w-full" onClick={() => setShowIOSInstructions(false)}>
            Got it!
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

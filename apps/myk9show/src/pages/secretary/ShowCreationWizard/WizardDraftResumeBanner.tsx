/**
 * Tells the secretary, on a fresh create, that the wizard is holding work she
 * started earlier — and gives her the way out.
 *
 * This exists because the wizard used to claim persistence it did not deliver.
 * `saveProgress()` only set `lastSaved` and cleared `isDirty`; `lastSaved` was
 * never rendered anywhere; and an unconditional `resetWizard()` on every fresh
 * create-mode mount destroyed the persisted draft on the next visit. Clearing
 * `isDirty` also switched off the unsaved-changes dialog, so the secretary
 * clicked "Save Draft", got no feedback, left with no warning, came back, and
 * the show setup was gone.
 *
 * With the mount-time reset removed, the draft genuinely survives. That makes
 * the resume state real, so it has to be visible and escapable — otherwise a
 * secretary starting her SECOND show would silently inherit the first one's
 * fields, which is the same class of surprise pointing the other way.
 */
import React from 'react';
import { History } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WizardDraftResumeBannerProps {
  /** When the draft was last written, if it was ever explicitly saved. */
  lastSaved: Date | null;
  onStartFresh: () => void;
}

export const WizardDraftResumeBanner: React.FC<WizardDraftResumeBannerProps> = ({
  lastSaved,
  onStartFresh,
}) => (
  <div
    className="flex flex-wrap items-center justify-between gap-3 border-b border-info/30 bg-info/10 px-4 py-3 sm:px-6"
    role="status"
    aria-live="polite"
  >
    <div className="flex items-start gap-2">
      <History className="mt-0.5 h-4 w-4 flex-shrink-0 text-info" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-foreground">Picking up where you left off</p>
        <p className="text-xs text-muted-foreground">
          {lastSaved
            ? `This show has been kept since ${lastSaved.toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}.`
            : 'This show was kept from an earlier visit.'}
        </p>
      </div>
    </div>
    <Button variant="outline" size="sm" onClick={onStartFresh}>
      Start a new show
    </Button>
  </div>
);

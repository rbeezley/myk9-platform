import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone } from 'lucide-react';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
import { Button } from '@/components/ui/button';
import { ScheduleSlipScriptCard } from '@/features/show-workbench/ScheduleSlipScriptCard';

/**
 * The delay script, offered where the delay is set (MYK9-954). It used to be a
 * separate Tools card that defaulted to the show's FIRST class and 30 minutes;
 * here it opens on this class and the minutes it actually runs behind.
 */
export function AnnounceDelayButton({
  showId,
  className,
  delayMinutes,
}: {
  showId: string;
  className: string;
  /** Unknown when the class has no scheduled start to compare against. */
  delayMinutes?: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const subtitle =
    delayMinutes === undefined
      ? `${className} is running behind. Set the minutes, then read the script over the PA or post it to the show feed.`
      : `${className} is running about ${delayMinutes} minutes behind. Read the script over the PA or post it to the show feed.`;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2 min-h-11 gap-2"
        onClick={() => setOpen(true)}
      >
        <Megaphone className="h-4 w-4" aria-hidden="true" />
        Announce the delay
      </Button>
      {/* SlideOverPanel is not portaled and the focused-class card is sticky (its own stacking
          context), so the panel goes to <body> to sit above the app header and sidebar. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <SlideOverPanel
            open={open}
            onClose={() => setOpen(false)}
            title="Announce the delay"
            subtitle={subtitle}
            size="lg"
          >
            <div className="p-6">
              <ScheduleSlipScriptCard
                showId={showId}
                defaultClassName={className}
                {...(delayMinutes !== undefined && { defaultDelayMinutes: delayMinutes })}
              />
            </div>
          </SlideOverPanel>,
          document.body
        )}
    </>
  );
}

import { createPortal } from 'react-dom';
import { SlideOverPanel } from '@/components/panels/SlideOverPanel';
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
  open,
  onOpenChange,
}: {
  showId: string;
  className: string;
  /** Unknown when the class has no scheduled start to compare against. */
  delayMinutes?: number | undefined;
  /** Controlled by the class header's Actions menu: the menu item is the way in. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const subtitle =
    delayMinutes === undefined
      ? `${className} is running behind. Set the minutes, then read the script over the PA or post it to the show feed.`
      : `${className} is running about ${delayMinutes} minutes behind. Read the script over the PA or post it to the show feed.`;
  return (
    <>
      {/* SlideOverPanel is not portaled and the focused-class card is sticky (its own stacking
          context), so the panel goes to <body> to sit above the app header and sidebar. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <SlideOverPanel
            open={open}
            onClose={() => onOpenChange(false)}
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

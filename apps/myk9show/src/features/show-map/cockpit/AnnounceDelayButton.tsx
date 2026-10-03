import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="mt-2 min-h-11 gap-2">
          <Megaphone className="h-4 w-4" aria-hidden="true" />
          Announce the delay
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Announce the delay</DialogTitle>
          <DialogDescription>
            {delayMinutes === undefined
              ? `${className} is running behind. Set the minutes, then read the script over the PA or post it to the show feed.`
              : `${className} is running about ${delayMinutes} minutes behind. Read the script over the PA or post it to the show feed.`}
          </DialogDescription>
        </DialogHeader>
        <ScheduleSlipScriptCard
          showId={showId}
          defaultClassName={className}
          {...(delayMinutes !== undefined && { defaultDelayMinutes: delayMinutes })}
        />
      </DialogContent>
    </Dialog>
  );
}

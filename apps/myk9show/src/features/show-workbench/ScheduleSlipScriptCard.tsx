import { useMemo, useState } from 'react';
import { ClipboardCopy, Megaphone, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthContext } from '@/hooks/useAuthContext';
import { useAnnouncementStore } from '@/store/announcementStore';
import { getAnnouncementAuthor } from '@/types/announcement-types';
import {
  DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES,
  DEFAULT_SCHEDULE_SLIP_RING,
  SCHEDULE_SLIP_ANNOUNCEMENT_PRIORITY,
  buildScheduleSlipAnnouncementTitle,
  buildScheduleSlipScript,
} from './scheduleSlipScript';

interface ScheduleSlipScriptCardProps {
  showId: string;
  showName?: string | null;
  defaultClassName?: string;
}

export function ScheduleSlipScriptCard({
  showId,
  showName,
  defaultClassName = '',
}: ScheduleSlipScriptCardProps) {
  const { user, userWithRoles } = useAuthContext();
  const createAnnouncement = useAnnouncementStore(s => s.createAnnouncement);
  const [ring, setRing] = useState(DEFAULT_SCHEDULE_SLIP_RING);
  const [delayMinutes, setDelayMinutes] = useState(String(DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES));
  const [affectedClass, setAffectedClass] = useState(defaultClassName);
  const [note, setNote] = useState('');
  const [isPosting, setIsPosting] = useState(false);

  const delayValue =
    delayMinutes.trim() === '' ? Number.NaN : Number(delayMinutes);
  const script = useMemo(
    () =>
      buildScheduleSlipScript({
        showName: showName ?? null,
        ring,
        delayMinutes: Number.isFinite(delayValue)
          ? delayValue
          : DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES,
        affectedClass,
        note,
      }),
    [affectedClass, delayValue, note, ring, showName]
  );
  const announcementTitle = buildScheduleSlipAnnouncementTitle({ ring });
  const author = getAnnouncementAuthor(user, userWithRoles, 'Secretary');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script);
      toast.success('Schedule update copied');
    } catch {
      toast.error('Could not copy schedule update');
    }
  }

  async function handlePostAnnouncement() {
    if (!author.id) {
      toast.error('Sign in again before posting an announcement');
      return;
    }

    setIsPosting(true);
    try {
      await createAnnouncement(
        {
          show_id: showId,
          title: announcementTitle,
          content: script,
          priority: SCHEDULE_SLIP_ANNOUNCEMENT_PRIORITY,
          expires_at: null,
        },
        author.id,
        author.role,
        author.name
      );
      toast.success('Schedule announcement posted');
    } catch {
      toast.error('Could not post schedule announcement');
    } finally {
      setIsPosting(false);
    }
  }

  function handleReset() {
    setRing(DEFAULT_SCHEDULE_SLIP_RING);
    setDelayMinutes(String(DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES));
    setAffectedClass(defaultClassName);
    setNote('');
  }

  return (
    <section className="rounded-md border bg-card p-4" aria-labelledby="schedule-slip-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="schedule-slip-title" className="text-base font-semibold">
            Schedule delay script
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ready-to-read PA copy when a ring is running behind.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleCopy}>
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copy script
          </Button>
          <Button type="button" size="sm" onClick={handlePostAnnouncement} disabled={isPosting}>
            <Megaphone className="mr-2 h-4 w-4" aria-hidden="true" />
            {isPosting ? 'Posting...' : 'Post announcement'}
          </Button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="schedule-slip-ring">Ring or area</Label>
          <Input
            id="schedule-slip-ring"
            value={ring}
            onChange={event => setRing(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-slip-delay">Delay minutes</Label>
          <Input
            id="schedule-slip-delay"
            inputMode="numeric"
            pattern="[0-9]*"
            value={delayMinutes}
            onChange={event => setDelayMinutes(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="schedule-slip-class">Affected class</Label>
          <Input
            id="schedule-slip-class"
            value={affectedClass}
            onChange={event => setAffectedClass(event.target.value)}
            placeholder="Container Novice A"
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor="schedule-slip-note">Optional note</Label>
        <Input
          id="schedule-slip-note"
          value={note}
          onChange={event => setNote(event.target.value)}
          placeholder="We will start the next class after lunch."
        />
      </div>

      <div className="mt-3 space-y-2">
        <Label htmlFor="schedule-slip-script">PA script</Label>
        <Textarea id="schedule-slip-script" value={script} readOnly rows={4} />
      </div>
    </section>
  );
}

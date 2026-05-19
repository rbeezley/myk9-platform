import { useMemo, useState } from 'react';
import { ClipboardCopy, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES,
  DEFAULT_SCHEDULE_SLIP_RING,
  buildScheduleSlipScript,
} from './scheduleSlipScript';

interface ScheduleSlipScriptCardProps {
  showName?: string | null;
  defaultClassName?: string;
}

export function ScheduleSlipScriptCard({
  showName,
  defaultClassName = '',
}: ScheduleSlipScriptCardProps) {
  const [ring, setRing] = useState(DEFAULT_SCHEDULE_SLIP_RING);
  const [delayMinutes, setDelayMinutes] = useState(String(DEFAULT_SCHEDULE_SLIP_DELAY_MINUTES));
  const [affectedClass, setAffectedClass] = useState(defaultClassName);
  const [note, setNote] = useState('');

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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(script);
      toast.success('Schedule update copied');
    } catch {
      toast.error('Could not copy schedule update');
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
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
            Reset
          </Button>
          <Button type="button" size="sm" onClick={handleCopy}>
            <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden="true" />
            Copy script
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

import { useState } from 'react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { MockNoteBox } from './MockNoteBox';
import { MOCK_SHOW_NOTE_PROMPTS, taskSeparator, type MockShowTask } from './mockShowSheet';
import type { MockTaskProgress } from './mockShowProgress';
import type { SupportTicket } from '../support/supportTickets';

interface MockTaskCardProps {
  task: MockShowTask;
  progress: MockTaskProgress;
  ticket: SupportTicket | null;
  onProgress: (progress: MockTaskProgress) => void;
}

export function MockTaskCard({ task, progress, ticket, onProgress }: MockTaskCardProps) {
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null);
  const minutesText = minutesDraft ?? (progress.minutes === null ? '' : String(progress.minutes));

  const commitMinutes = () => {
    if (minutesDraft === null) return;
    const trimmed = minutesDraft.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error('Type the minutes as a number, like 20.');
      setMinutesDraft(null);
      return;
    }
    setMinutesDraft(null);
    if (parsed !== progress.minutes) onProgress({ ...progress, minutes: parsed });
  };

  return (
    <li className="rounded-md border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <label className="-m-2 flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center p-2">
          <Checkbox
            checked={progress.done}
            onCheckedChange={done => onProgress({ ...progress, done })}
            aria-label={`Task ${task.number} done`}
          />
        </label>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold sm:text-lg">
            <span className="mr-1">{task.number}.</span>
            {task.name}
            <span className="font-normal text-muted-foreground">
              {taskSeparator(task.detail)}
              {task.detail}
            </span>
          </h3>
        </div>
      </div>

      <div className="mt-4 space-y-4 sm:pl-11">
        <div className="flex items-center gap-3">
          <label htmlFor={`mock-minutes-${task.number}`} className="text-sm font-medium">
            Minutes it took
          </label>
          <Input
            id={`mock-minutes-${task.number}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={minutesText}
            onChange={event => setMinutesDraft(event.target.value)}
            onBlur={commitMinutes}
            className="min-h-11 w-24 text-base"
          />
        </div>
        <MockNoteBox
          id={`mock-note-${task.number}`}
          target={{ part: 'task', number: task.number }}
          ticket={ticket}
          label="Your notes on this task"
          placeholder="Where you got stuck, what you didn't understand, what looked wrong."
        />
        <details className="text-sm text-muted-foreground">
          <summary className="min-h-11 cursor-pointer py-2">What to write down</summary>
          <ul className="list-disc space-y-1 pl-5">
            {MOCK_SHOW_NOTE_PROMPTS.map(prompt => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </details>
      </div>
    </li>
  );
}

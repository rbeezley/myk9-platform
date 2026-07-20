import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { CockpitClassPrototype } from './secretaryCockpitPrototypeData';

interface SecretaryCockpitPrototypeExpectedStartProps {
  classItem: CockpitClassPrototype;
  onChange: (classItem: CockpitClassPrototype, revisedExpectedTime?: string) => void;
}

function toTimeInputValue(displayTime: string | null | undefined): string {
  if (!displayTime) return '';
  const match = displayTime.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!match) return displayTime;

  let hour = Number(match[1]);
  const minute = match[2];
  const period = match[3]?.toUpperCase();
  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

function toDisplayTime(inputTime: string): string {
  const [rawHour, minute] = inputTime.split(':');
  const hour = Number(rawHour);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${period}`;
}

export function SecretaryCockpitPrototypeExpectedStart({
  classItem,
  onChange,
}: SecretaryCockpitPrototypeExpectedStartProps) {
  const [editing, setEditing] = useState(false);
  const [inputTime, setInputTime] = useState(
    toTimeInputValue(classItem.revisedExpectedTime ?? classItem.time)
  );

  function closeEditor() {
    setInputTime(toTimeInputValue(classItem.revisedExpectedTime ?? classItem.time));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="min-h-11 w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Edit revised expected start for ${classItem.name}. Scheduled ${classItem.time ?? 'time not set'}. ${
          classItem.revisedExpectedTime
            ? `Expected ${classItem.revisedExpectedTime}.`
            : 'No revised expected start.'
        }`}
        onClick={() => setEditing(true)}
      >
        {classItem.revisedExpectedTime ? (
          <>
            <span className="block whitespace-nowrap font-bold text-primary">
              Expected {classItem.revisedExpectedTime}
            </span>
            <span className="mt-0.5 block whitespace-nowrap text-xs font-normal text-muted-foreground">
              Scheduled {classItem.time ?? 'not set'}
            </span>
          </>
        ) : (
          <>
            <span className="block font-semibold text-foreground">
              {classItem.time ?? 'Time not set'}
            </span>
            <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-primary">
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit expected
            </span>
          </>
        )}
      </button>
    );
  }

  return (
    <form
      className="flex w-full flex-col items-stretch gap-1.5 rounded-lg border border-primary/30 bg-background p-1.5"
      onSubmit={event => {
        event.preventDefault();
        if (!inputTime) return;
        onChange(classItem, toDisplayTime(inputTime));
        setEditing(false);
      }}
    >
      <label htmlFor={`expected-start-${classItem.id}`} className="sr-only">
        Revised expected start for {classItem.name}
      </label>
      <Input
        id={`expected-start-${classItem.id}`}
        type="time"
        value={inputTime}
        className="h-11 w-full bg-background px-2"
        onChange={event => setInputTime(event.target.value)}
        autoFocus
      />
      <div className="flex items-center gap-1.5">
        <Button
          type="submit"
          size="icon"
          className="h-11 w-11"
          disabled={!inputTime}
          aria-label={`Save revised expected start for ${classItem.name}`}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-11 w-11"
          aria-label={`Cancel revised expected start edit for ${classItem.name}`}
          onClick={closeEditor}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      {classItem.revisedExpectedTime && (
        <button
          type="button"
          className="min-h-11 text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => {
            onChange(classItem, undefined);
            setEditing(false);
          }}
        >
          Use scheduled time
        </button>
      )}
    </form>
  );
}

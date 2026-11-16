import { Checkbox } from '@/components/ui/checkbox';
import { formatJudgeDayDate } from '@/features/show-map/judgeDay';
import {
  formatLabelDay,
  type ArmbandLabelChoice,
  type ArmbandLabelDog,
} from '@/lib/labels/armbandLabelChoice';
import type { ReportScope } from '@/lib/reports/types';
import { SetupEyebrow } from './LabelModeChrome';

const SELECT = 'min-h-[44px] w-full max-w-xs rounded-md border bg-background px-2 text-sm';
const SCOPE_OPTION: Record<ReportScope['kind'], string> = {
  show: 'Every day of the show',
  trial: 'This trial',
  class: 'This class',
};

/**
 * Which labels print, in plain words: a day, one dog, and "only labels added since the last
 * print". Every choice can be changed here and none blocks Print (MYK9-2073).
 */
export function ArmbandLabelChoiceControls({
  scope,
  choice,
  onChange,
  days,
  dogs,
  note,
}: {
  scope: ReportScope;
  choice: ArmbandLabelChoice;
  onChange: (next: ArmbandLabelChoice) => void;
  days: readonly string[];
  dogs: readonly ArmbandLabelDog[];
  /** Says what the choice did, e.g. when the label was last printed. */
  note: string | null;
}) {
  const oneDog = dogs.find(dog => dog.dogKey === choice.dogKey);
  return (
    <div>
      <SetupEyebrow className="mb-2">Which labels</SetupEyebrow>
      {oneDog && (
        <p className="mb-1 text-base">
          For{' '}
          <strong>
            {oneDog.callName} #{oneDog.armband}
          </strong>
          {choice.day && (
            <>
              , for <strong>{formatLabelDay(choice.day)}</strong>
            </>
          )}
          .
        </p>
      )}
      {oneDog && note && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {note}
        </p>
      )}
      {oneDog && (
        <p className="mb-1 text-xs text-muted-foreground">Change the day or dog to print more.</p>
      )}
      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1 text-sm">
          <span>Day</span>
          <select
            className={SELECT}
            value={choice.day ?? ''}
            onChange={event => onChange({ ...choice, day: event.target.value || null })}
          >
            <option value="">{SCOPE_OPTION[scope.kind]}</option>
            {days.map(day => (
              <option key={day} value={day}>
                {formatJudgeDayDate(day)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Dog</span>
          <select
            className={SELECT}
            value={choice.dogKey ?? ''}
            onChange={event => onChange({ ...choice, dogKey: event.target.value || null })}
          >
            <option value="">Every dog</option>
            {dogs.map(dog => (
              <option key={dog.dogKey} value={dog.dogKey}>
                {dog.label}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor="armband-added-since"
          className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm"
        >
          <Checkbox
            id="armband-added-since"
            checked={choice.addedOnly}
            onCheckedChange={checked => onChange({ ...choice, addedOnly: checked === true })}
          />
          <span>Only labels added since the last print</span>
        </label>
        {!oneDog && note && (
          <p role="status" className="text-xs text-muted-foreground">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}

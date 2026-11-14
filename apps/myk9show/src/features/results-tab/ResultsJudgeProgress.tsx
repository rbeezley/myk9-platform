import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  judgeProgress,
  type ReviewJudge,
} from '@/features/show-map/cockpit/trialPacket/judgeReview';
import {
  judgeRecordReminder,
  type JudgeRecord,
} from '@/features/show-map/cockpit/trialPacket/judgeRecord';

interface ResultsJudgeProgressProps {
  judges: readonly ReviewJudge[];
  onPrint: (judgeKey: string | null) => void;
  /** The judge's records, one per judge per day (MYK9-1924 phase 2b); only initialled days are offered. */
  records?: readonly JudgeRecord[];
  onRecord?: (record: JudgeRecord) => void;
}

function statusLine(judge: ReviewJudge, doneWord: string): string {
  if (judge.initialled) return `All ${doneWord}`;
  if (judge.done) return `${judge.judgeName}'s classes are done.`;
  return `${judge.finishedCount} of ${judge.classes.length} classes done`;
}

/**
 * Per-judge progress on Results (MYK9-1924 phase 2a): which judges' classes are finished and
 * initialled, and a door into the judge review packet for each. It extends the existing "Needs
 * judge's initials" state and the sign-off section, and reads the very same rows. Nothing blocks:
 * a judge who is still judging can have what is finished so far printed.
 */
export function ResultsJudgeProgress({
  judges,
  onPrint,
  records = [],
  onRecord,
}: ResultsJudgeProgressProps) {
  if (judges.length === 0) return null;
  const doneWord = judges[0]!.registryId.trim().toUpperCase() === 'AKC' ? 'initialled' : 'signed';
  const progress = judgeProgress(judges, doneWord);
  return (
    <section aria-label="Judges" className="space-y-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{progress.label}</h2>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 gap-2"
          onClick={() => onPrint(null)}
        >
          <Printer className="h-4 w-4" aria-hidden="true" />
          Print every judge&apos;s results
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-md border">
        {judges.map(judge => {
          const ready = records.filter(record => record.judgeKey === judge.key && record.ready);
          return (
            <li
              key={judge.key}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block font-medium">{judge.judgeName}</span>
                <span className="block text-muted-foreground">{statusLine(judge, doneWord)}</span>
              </span>
              <Button
                type="button"
                variant={judge.done && !judge.initialled ? 'default' : 'outline'}
                className="min-h-11"
                onClick={() => onPrint(judge.key)}
              >
                {judge.initialled
                  ? 'Print again'
                  : judge.done
                    ? 'Print results for initials'
                    : 'Print results so far'}
              </Button>
              {onRecord &&
                ready.map(record => (
                  <div
                    key={record.key}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {record.judgeName}&apos;s{' '}
                        {doneWord === 'initialled'
                          ? 'classes are initialled'
                          : 'classes are signed'}{' '}
                        for {record.dayLabel}.
                      </span>
                      {judgeRecordReminder(record.registryId) && (
                        <span className="block text-muted-foreground">
                          {judgeRecordReminder(record.registryId)}
                        </span>
                      )}
                    </span>
                    <Button type="button" className="min-h-11" onClick={() => onRecord(record)}>
                      Judge&apos;s record, {record.dayLabel}
                    </Button>
                  </div>
                ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

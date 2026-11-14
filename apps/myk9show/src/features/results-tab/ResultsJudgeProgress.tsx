import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  judgeProgress,
  type ReviewJudge,
} from '@/features/show-map/cockpit/trialPacket/judgeReview';

interface ResultsJudgeProgressProps {
  judges: readonly ReviewJudge[];
  onPrint: (judgeKey: string | null) => void;
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
export function ResultsJudgeProgress({ judges, onPrint }: ResultsJudgeProgressProps) {
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
        {judges.map(judge => (
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
          </li>
        ))}
      </ul>
    </section>
  );
}

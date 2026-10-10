import { ClipboardPen } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTrialSecretaryOnlyReason } from '@/features/actions/TrialSecretaryAccessContext';

import type { ShowMapClassInput } from './showMapTypes';
import { buildPaperScoringPicker, type PaperScoringPickerClass } from './paperScoringPicker';

function PickerClassLink({ cls }: { cls: PaperScoringPickerClass }) {
  return (
    <li>
      <Link
        to={cls.href}
        className="flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted"
      >
        <span className="font-medium">{cls.label}</span>
        <span className="text-muted-foreground">
          {cls.progress}
          {cls.done && ' - done'}
        </span>
      </Link>
    </li>
  );
}

/**
 * MYK9-1062: the show home's door to paper scoring. Paper scoring is per class
 * and lives at `/scoring/classes/:id/entries`; this only picks the class and
 * links there. Hidden (not greyed) for a viewer who may not operate the show,
 * using the same secretary-only answer the cockpit's per-class action greys on.
 */
export function ShowHomePaperScores({ classes }: { classes: readonly ShowMapClassInput[] }) {
  const secretaryOnlyReason = useTrialSecretaryOnlyReason();
  const picker = useMemo(() => buildPaperScoringPicker(classes), [classes]);
  const { groups, finished } = picker;
  const all = [...groups.flatMap(group => group.classes), ...finished];

  if (secretaryOnlyReason !== undefined || all.length === 0) return null;

  const icon = <ClipboardPen className="h-4 w-4" aria-hidden="true" />;
  const only = all.length === 1 ? all[0] : undefined;
  if (only) {
    return (
      <Button asChild variant="outline" size="sm" className="min-h-11 gap-2">
        <Link to={only.href}>
          {icon}
          Enter results from scoresheet
        </Link>
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="min-h-11 gap-2">
          {icon}
          Enter results from scoresheet
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enter results from scoresheet</DialogTitle>
          <DialogDescription>Choose a class. Unfinished classes come first.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map(group => (
            <section key={group.trialId} aria-label={group.label} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">{group.label}</h3>
              <ul className="space-y-2">
                {group.classes.map(cls => (
                  <PickerClassLink key={cls.id} cls={cls} />
                ))}
              </ul>
            </section>
          ))}
          {finished.length > 0 && (
            <section aria-label="Finished" className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Finished</h3>
              <ul className="space-y-2">
                {finished.map(cls => (
                  <PickerClassLink key={cls.id} cls={cls} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

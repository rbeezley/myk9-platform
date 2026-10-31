/**
 * StaleClassPrompt — asks the judge whether to mark a left-behind class's unscored dogs
 * absent and complete it (MYK9-1514). Mounted once for every at-show page; the check that
 * fills the store runs after each saved score. Nothing changes without a tap.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { replicatedClassesTable } from '@/services/replication/ReplicatedClassesTable';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { useOptimisticScoring } from '@/hooks/useOptimisticScoring';
import { toOptimisticScorePayload } from '@/pages/scoring/types';
import { logger } from '@/services/LoggingService';
import { ABSENT_SCORE } from '../absentScore';
import { buildRingsideReplication } from '../ringsideCapabilities';
import { recheckStaleClass } from './checkStaleClass';
import { confirmStaleClass } from './confirmStaleClass';
import { useStaleClassPromptStore } from './staleClassPromptStore';

export function StaleClassPrompt() {
  const prompt = useStaleClassPromptStore(state => state.prompt);
  const navigate = useNavigate();
  const { submitScoreOptimistically } = useOptimisticScoring();
  const [working, setWorking] = useState(false);

  if (!prompt) return null;

  const dogCount = prompt.unscoredEntryIds.length;

  const markAbsent = async (entryId: string, classId: string, className: string) => {
    const entry = await replicatedEntriesTable.getEntryById(entryId);
    let failure: Error | null = null;
    await submitScoreOptimistically({
      entryId,
      classId,
      armband: Number(entry?.armband) || 0,
      className,
      scoreData: toOptimisticScorePayload(ABSENT_SCORE),
      onError: err => {
        failure = err;
      },
    });
    if (failure) throw failure;
  };

  // The server derives completion unless a secretary set the status by hand; then the
  // established status write completes it, as the Status dialog does.
  const completeIfManual = async (classId: string) => {
    const cls = await replicatedClassesTable.getClassById(classId);
    if (cls?.statusSource === 'manual' && cls.classStatus !== 'completed') {
      await buildRingsideReplication().updateClassStatus(classId, 'completed');
    }
  };

  const confirm = async () => {
    setWorking(true);
    let wrote = 0;
    try {
      const result = await confirmStaleClass(prompt, {
        recheck: recheckStaleClass,
        markAbsent: async (...args) => {
          await markAbsent(...args);
          wrote += 1;
        },
        completeIfManual,
      });
      useStaleClassPromptStore.getState().dismiss();
      if (result.outcome === 'not-needed') {
        toast.info(`${result.className} no longer needs completing`);
        return;
      }
      const count = result.markedCount;
      // Offline, the writes are only saved on this device until they sync.
      const online = typeof navigator === 'undefined' || navigator.onLine !== false;
      const message = online
        ? `${result.className} completed, ${count} marked absent`
        : `${result.className}: ${count} marked absent on this device. It completes when you are back online.`;
      toast.success(message, {
        action: {
          label: 'Review',
          onClick: () => navigate(`/at-show/${prompt.showId}/class/${prompt.classId}`),
        },
      });
    } catch (err) {
      // Some dogs may already be written; the retry must not need the class to be idle again.
      if (wrote > 0) useStaleClassPromptStore.setState({ prompt: { ...prompt, retry: true } });
      logger.error('Could not mark the stale class absent', 'at-show', {}, err as Error);
      toast.error(`Could not finish ${prompt.className}. Nothing more was changed; try again.`);
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={open => {
        if (!open && !working) useStaleClassPromptStore.getState().snooze(Date.now());
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{prompt.className} is still open</DialogTitle>
          <DialogDescription>
            {prompt.className} has {dogCount} {dogCount === 1 ? 'dog' : 'dogs'} not scored. Mark{' '}
            {dogCount === 1 ? 'it' : 'them'} absent and complete the class?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={working}
            onClick={() => useStaleClassPromptStore.getState().snooze(Date.now())}
          >
            Not yet
          </Button>
          <Button disabled={working} onClick={() => void confirm()}>
            Mark absent &amp; complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

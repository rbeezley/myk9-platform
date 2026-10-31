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
import { logger } from '@/services/LoggingService';
import { completeStaleClassRpc } from './completeStaleClassRpc';
import { confirmStaleClass } from './confirmStaleClass';
import { useStaleClassPromptStore } from './staleClassPromptStore';

export function StaleClassPrompt() {
  const prompt = useStaleClassPromptStore(state => state.prompt);
  const navigate = useNavigate();
  const [working, setWorking] = useState(false);

  if (!prompt) return null;

  const dogCount = prompt.unscoredEntryIds.length;

  const confirm = async () => {
    setWorking(true);
    try {
      const result = await confirmStaleClass(prompt, {
        complete: (classId, ids) => completeStaleClassRpc(prompt.showId, classId, ids),
      });
      if (result.outcome === 'needs-connection') {
        // Online-only: nothing was marked or queued. Keep the prompt open to try again.
        toast.error("Needs a connection. Try again when you're back online.");
        return;
      }
      if (result.outcome === 'changed') {
        // The class changed since the judge looked; nothing was written. Ask again.
        const n = result.currentEntryIds.length;
        useStaleClassPromptStore.getState().replaceEntryIds(result.currentEntryIds);
        toast.info(`${result.className} changed. ${n} ${n === 1 ? 'dog is' : 'dogs are'} left.`);
        return;
      }
      if (result.outcome === 'refused') {
        // Nothing was written. A dog in the ring means the class is in use: ask again later.
        if (result.reason === 'in_ring') {
          useStaleClassPromptStore.getState().snooze(Date.now());
          toast.info(`A dog is in the ring in ${result.className}. Try again when it is done.`);
        } else {
          useStaleClassPromptStore.getState().dismiss();
          toast.info(`${result.className} is no longer in progress`);
        }
        return;
      }
      useStaleClassPromptStore.getState().dismiss();
      if (result.outcome === 'not-needed') {
        toast.info(`${result.className} has no unscored dogs left`);
        return;
      }
      toast.success(`${result.className} completed, ${result.markedCount} marked absent`, {
        action: {
          label: 'Review',
          onClick: () => navigate(`/at-show/${prompt.showId}/class/${prompt.classId}`),
        },
      });
    } catch (err) {
      logger.error('Could not mark the stale class absent', 'at-show', {}, err as Error);
      toast.error(`Could not finish ${prompt.className}. Nothing was changed; try again.`);
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

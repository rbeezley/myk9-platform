import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { shareFile } from '@/utils/share';
import { ResultCard } from './ResultCard';
import { renderResultCardImage } from './renderResultCardImage';
import type { ResultCardModel } from './resultCardModel';

interface ResultRevealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  model: ResultCardModel | null;
  onSeen: (releaseKey: string) => void;
}

export function ResultRevealDialog({
  open,
  onOpenChange,
  model,
  onSeen,
}: ResultRevealDialogProps) {
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !model) return;

    onSeen(model.releaseKey);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const fireConfetti = confetti.create(undefined, { useWorker: false });
    void fireConfetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.3 },
    });
  }, [model, onSeen, open]);

  async function handleShare() {
    if (!model || !model.shareEnabled) return;

    setSharing(true);
    setShareError(null);

    try {
      const blob = await renderResultCardImage(model);
      await shareFile(blob, {
        title: model.shareTitle,
        text: model.shareText,
        fileName: `${slugify(model.dogName)}-result.png`,
      });
    } catch {
      setShareError("We couldn't prepare the share card. Your result is still here.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-sm overflow-y-auto p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle>New result</DialogTitle>
        </DialogHeader>
        {model ? (
          <div className="space-y-3">
            <ResultCard model={model} />
            {shareError ? <p className="text-sm text-destructive">{shareError}</p> : null}
            {model.shareEnabled ? (
              <Button onClick={handleShare} disabled={sharing} className="min-h-[44px] w-full">
                <Share2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {sharing ? 'Preparing...' : 'Share'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

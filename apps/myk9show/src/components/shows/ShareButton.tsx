import { Share2 } from 'lucide-react';
import { useCallback } from 'react';
import { toast } from 'sonner';
import { shareOrCopy, type ShareOptions } from '../../utils/share';

interface ShareButtonProps {
  shareData: ShareOptions;
  className?: string;
}

export function ShareButton({ shareData, className = '' }: ShareButtonProps) {
  const handleShare = useCallback(async () => {
    try {
      const result = await shareOrCopy(shareData);
      if (result === 'copied') {
        toast.success('Link copied!');
      }
    } catch {
      toast.error('Unable to share');
    }
  }, [shareData]);

  return (
    <button
      onClick={handleShare}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground ${className}`}
      aria-label="Share this show"
    >
      <Share2 className="h-4 w-4" />
      Share
    </button>
  );
}

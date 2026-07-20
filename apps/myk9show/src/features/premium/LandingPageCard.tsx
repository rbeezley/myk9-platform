import { useState, useCallback } from 'react';
import { Globe, Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { notifications } from '@/lib/notifications';
import type { ShowStyle } from '@/features/registries';
import { PREMIUM_STYLE_LABELS } from '@/types/premium-types';
import { LANDING_CARD_ANCHOR } from '@/features/show-workbench/publishReadiness';

const STYLE_LABELS: Record<ShowStyle, string> = PREMIUM_STYLE_LABELS;

// Target ring so a "Finish setup" checklist jump (`#setup-publish-landing`)
// visibly lands here, matching the #setup-publish row's pattern.
const ANCHOR_CLASS =
  'scroll-mt-20 target:ring-2 target:ring-ring target:ring-offset-2 target:ring-offset-background';

interface LandingPageCardProps {
  showId: string;
  showStyle: ShowStyle;
}

export function LandingPageCard({ showId, showStyle }: LandingPageCardProps) {
  const [copied, setCopied] = useState(false);

  const url = `${window.location.origin}/shows/${showId}`;
  const styleLabel = STYLE_LABELS[showStyle] ?? showStyle;

  const handleCopy = useCallback(async () => {
    const copyViaFallback = () => {
      const el = document.createElement('textarea');
      el.value = url;
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    };

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      } else {
        copyViaFallback();
      }
      setCopied(true);
      notifications.success('URL copied', { description: 'Share it with exhibitors.' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        copyViaFallback();
        setCopied(true);
        notifications.success('URL copied', { description: 'Share it with exhibitors.' });
        setTimeout(() => setCopied(false), 2000);
      } catch {
        notifications.error('Could not copy — please copy the URL manually.');
      }
    }
  }, [url]);

  return (
    <Card
      id={LANDING_CARD_ANCHOR}
      className={cn('flex flex-col gap-4 p-4 sm:flex-row sm:items-center', ANCHOR_CLASS)}
    >
      <div className="bg-primary/10 text-primary rounded-md p-3">
        <Globe className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold">Public Landing Page</h3>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {styleLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{url}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleCopy}
        className="min-h-[44px] w-full shrink-0 sm:w-auto"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 mr-1.5 text-green-600" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy Link
          </>
        )}
      </Button>
    </Card>
  );
}

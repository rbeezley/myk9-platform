import { useState, useCallback } from 'react';
import { Globe, Copy, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { notifications } from '@/lib/notifications';
import type { ShowStyle } from '@/features/registries';
import { PREMIUM_STYLE_LABELS } from '@/types/premium-types';

const STYLE_LABELS: Record<ShowStyle, string> = PREMIUM_STYLE_LABELS;

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
    <Card className="p-4 flex items-center gap-4">
      <div className="bg-primary/10 text-primary rounded-md p-3">
        <Globe className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">Public Landing Page</h3>
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {styleLabel}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{url}</p>
      </div>
      <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0">
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

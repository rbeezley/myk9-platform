import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Facebook, Mail, Link2, Check } from 'lucide-react';
import { shareOrCopy } from '@/utils/share';
import { cn } from '@/lib/utils';

interface ShareData {
  title: string;
  text: string;
  url: string;
}

interface ShareEventProps {
  shareData: ShareData;
}

export function ShareEvent({ shareData }: ShareEventProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareData.url)}`;
  const mailtoUrl = `mailto:?subject=${encodeURIComponent(shareData.title)}&body=${encodeURIComponent(`${shareData.text}\n\n${shareData.url}`)}`;

  const handleCopyLink = async () => {
    await shareOrCopy({ url: shareData.url, title: shareData.title, text: shareData.text });
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const buttonClass =
    'h-10 w-10 flex items-center justify-center rounded-full border border-border/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground';

  return (
    <Card>
      <div className="p-4 border-b border-border/30">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Share This Event
        </h3>
      </div>
      <div className="flex items-center justify-center gap-3 p-4">
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className={buttonClass}
        >
          <Facebook className="h-4 w-4" />
        </a>
        <a href={mailtoUrl} aria-label="Share via email" className={buttonClass}>
          <Mail className="h-4 w-4" />
        </a>
        <button
          onClick={handleCopyLink}
          aria-label="Copy link"
          className={cn(buttonClass, copied && 'text-emerald-600 border-emerald-600/30')}
        >
          {copied ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
        </button>
      </div>
    </Card>
  );
}

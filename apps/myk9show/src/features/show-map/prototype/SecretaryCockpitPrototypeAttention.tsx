import { AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AttentionPrototype,
  CockpitPrototypeTone,
} from './secretaryCockpitPrototypeData';

const TONE_STYLES: Record<CockpitPrototypeTone, string> = {
  urgent: 'border-destructive/30 bg-destructive/10 text-destructive',
  warning: 'border-warning/40 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info-strong',
};

export function SecretaryCockpitPrototypeAttentionCard({
  item,
  onActivate,
}: {
  item: AttentionPrototype;
  onActivate: (item: AttentionPrototype) => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-[88px] w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE_STYLES[item.tone]
      )}
      onClick={() => onActivate(item)}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background/90">
        {item.tone === 'urgent' ? (
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        ) : (
          <span className="font-bold">{item.tone === 'warning' ? '2' : '↻'}</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{item.title}</span>
        <span className="mt-1 block text-sm opacity-80">{item.detail}</span>
      </span>
      <span className="shrink-0 font-semibold">
        {item.action.label}
        <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

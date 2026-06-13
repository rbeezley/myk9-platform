import { cn } from '@/lib/utils';

export interface PodiumPositionProps {
  placement: 1 | 2 | 3 | 4;
  handlerName: string;
  dogName: string;
  breed: string;
  armband?: string | null;
}

const PLACEMENT_CONFIG: Record<
  1 | 2 | 3 | 4,
  { label: string; badge: string; platform: string; text: string }
> = {
  1: {
    label: '1st',
    badge: 'bg-amber-400 text-amber-950 shadow-amber-400/30',
    platform: 'h-20 bg-gradient-to-t from-amber-500 to-amber-400',
    text: 'text-warning ',
  },
  2: {
    label: '2nd',
    badge: 'bg-slate-300 text-slate-800 shadow-slate-300/30',
    platform: 'h-14 bg-gradient-to-t from-slate-400 to-slate-300',
    text: 'text-slate-500 dark:text-slate-400',
  },
  3: {
    label: '3rd',
    badge: 'bg-orange-400 text-orange-950 shadow-orange-400/30',
    platform: 'h-10 bg-gradient-to-t from-orange-500 to-orange-400',
    text: 'text-warning ',
  },
  4: {
    label: '4th',
    badge: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
    platform:
      'h-7 bg-gradient-to-t from-slate-300 to-slate-200 dark:from-slate-700 dark:to-slate-600',
    text: 'text-slate-500 dark:text-slate-400',
  },
};

export function PodiumPosition({
  placement,
  handlerName,
  dogName,
  breed,
  armband,
}: PodiumPositionProps) {
  const config = PLACEMENT_CONFIG[placement];

  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div
        className={cn(
          'flex h-8 w-12 items-center justify-center rounded-full text-xs font-bold shadow-md',
          config.badge
        )}
      >
        {config.label}
      </div>
      <p className="text-sm font-semibold leading-tight">{handlerName}</p>
      <p className={cn('celebration-serif text-sm italic', config.text)}>&ldquo;{dogName}&rdquo;</p>
      <p className="text-xs text-muted-foreground">{breed}</p>
      {armband && <p className="text-[10px] text-muted-foreground/70">#{armband}</p>}
      <div className={cn('mt-1 w-full rounded-t-sm', config.platform)} />
    </div>
  );
}

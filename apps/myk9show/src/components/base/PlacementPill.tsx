const PLACEMENT_STYLES: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-zinc-300 text-zinc-800',
  3: 'bg-amber-600 text-amber-50',
  4: 'bg-indigo-400 text-indigo-50',
};

const ORDINALS = ['1st', '2nd', '3rd', '4th'];

interface PlacementPillProps {
  placement: number;
  size?: 'sm' | 'md';
}

export function PlacementPill({ placement, size = 'md' }: PlacementPillProps) {
  const label = ORDINALS[placement - 1] ?? `${placement}th`;
  const style = PLACEMENT_STYLES[placement] ?? 'bg-muted text-muted-foreground';
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-0.5 text-sm';
  return (
    <span className={`rounded-full font-bold ${padding} ${style}`}>{label}</span>
  );
}

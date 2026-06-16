const PLACEMENT_STYLES: Record<number, string> = {
  1: 'bg-yellow-400 text-yellow-900',
  2: 'bg-zinc-300 text-zinc-800',
  3: 'bg-amber-600 text-amber-50',
  4: 'bg-indigo-400 text-indigo-50',
};

/** English ordinal suffix — handles the 11th/12th/13th and 21st/22nd/23rd cases. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

interface PlacementPillProps {
  placement: number;
  size?: 'sm' | 'md';
}

export function PlacementPill({ placement, size = 'md' }: PlacementPillProps) {
  const label = ordinal(placement);
  const style = PLACEMENT_STYLES[placement] ?? 'bg-muted text-muted-foreground';
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-0.5 text-sm';
  return (
    <span className={`rounded-full font-bold ${padding} ${style}`}>{label}</span>
  );
}

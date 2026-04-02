import { cn } from '@/lib/utils';
import { DogAvatar } from '@/components/shared/DogAvatar';
import type { TVPlacement } from './types';

const MEDAL_CONFIG = {
  1: {
    emoji: '🥇',
    label: '1st Place',
    border: 'border-amber-400',
    podiumHeight: 'h-24',
    textColor: 'text-amber-400',
    bg: 'from-amber-700 to-amber-500',
  },
  2: {
    emoji: '🥈',
    label: '2nd Place',
    border: 'border-zinc-400',
    podiumHeight: 'h-[72px]',
    textColor: 'text-zinc-400',
    bg: 'from-zinc-600 to-zinc-400',
  },
  3: {
    emoji: '🥉',
    label: '3rd Place',
    border: 'border-orange-600',
    podiumHeight: 'h-14',
    textColor: 'text-orange-600',
    bg: 'from-orange-800 to-orange-600',
  },
  4: {
    emoji: '',
    label: '4th Place',
    border: 'border-zinc-600',
    podiumHeight: 'h-10',
    textColor: 'text-zinc-500',
    bg: 'from-zinc-700 to-zinc-600',
  },
} as const;

interface TVPodiumCardProps {
  placement: TVPlacement;
  animationDelay: number;
  showShimmer?: boolean;
}

export function TVPodiumCard({ placement, animationDelay, showShimmer }: TVPodiumCardProps) {
  const config = MEDAL_CONFIG[placement.placement as keyof typeof MEDAL_CONFIG] ?? MEDAL_CONFIG[4];
  const displayName = placement.dog?.callName ?? placement.dog?.name ?? 'Unknown';
  const displayTime =
    placement.searchTime != null
      ? `${placement.searchTime.toFixed(1)}s`
      : placement.totalScore != null
        ? `${placement.totalScore}`
        : '';

  return (
    <div className="text-center animate-slide-up" style={{ animationDelay: `${animationDelay}s` }}>
      {config.emoji ? (
        <div className={cn('text-sm mb-1', config.textColor)}>
          {config.emoji} {config.label}
        </div>
      ) : (
        <div className="text-xs text-zinc-600 mb-1">{config.label}</div>
      )}

      <DogAvatar
        imageUrl={placement.dog?.imageUrl ?? null}
        name={displayName}
        size="lg"
        borderColor={config.border}
        className="mx-auto mb-2"
      />

      <div className="font-bold text-zinc-100 text-base">
        #{placement.armband} {displayName}
      </div>
      {placement.handler && <div className="text-zinc-400 text-sm">{placement.handler}</div>}
      {displayTime && <div className={cn('text-sm mt-1', config.textColor)}>{displayTime}</div>}

      <div
        className={cn(
          'mt-2 rounded-t-md bg-gradient-to-b',
          config.bg,
          config.podiumHeight,
          showShimmer && 'relative overflow-hidden'
        )}
      >
        {showShimmer && (
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
        )}
      </div>
    </div>
  );
}

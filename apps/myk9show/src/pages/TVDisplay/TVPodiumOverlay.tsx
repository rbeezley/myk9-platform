import { useEffect, useCallback } from 'react';
import { TVPodiumCard } from './TVPodiumCard';
import { TVConfetti } from './TVConfetti';
import type { TVCompletedClass } from './types';

const DISPLAY_DURATION_MS = 20_000;

// Staggered reveal: 4th → 3rd → 2nd → 1st (reversed order, ~1s between each)
const REVEAL_DELAYS = { 1: 3.6, 2: 2.4, 3: 1.2, 4: 0 };

interface TVPodiumOverlayProps {
  queue: TVCompletedClass[];
  onComplete: (classId: string) => void;
  soundEnabled?: boolean;
}

export function TVPodiumOverlay({ queue, onComplete, soundEnabled }: TVPodiumOverlayProps) {
  const current = queue[0];

  const handleComplete = useCallback(() => {
    if (current) {
      onComplete(current.id);
    }
  }, [current, onComplete]);

  // Auto-dismiss after 20 seconds
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(handleComplete, DISPLAY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [current, handleComplete]);

  // Play chime on mount if enabled
  useEffect(() => {
    if (!current || !soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 523.25; // C5
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
      osc.start();
      osc.stop(ctx.currentTime + 1.5);
    } catch {
      // Web Audio not available
    }
  }, [current, soundEnabled]);

  if (!current) return null;

  // Sort placements for podium order: 2nd, 1st, 3rd, 4th
  const sorted = [...current.placements].sort((a, b) => {
    const order = [2, 1, 3, 4];
    return order.indexOf(a.placement) - order.indexOf(b.placement);
  });

  return (
    <div className="fixed inset-0 bg-zinc-950 z-50 flex flex-col items-center justify-center">
      <TVConfetti />
      <div className="text-center mb-8">
        <div className="text-xs text-zinc-500 uppercase tracking-[0.2em]">Final Results</div>
        <div className="text-2xl font-bold text-zinc-100 mt-1">{current.name}</div>
        <div className="text-sm text-zinc-600 mt-1">Judge: {current.judgeName}</div>
      </div>
      <div className="flex items-end justify-center gap-6 px-10">
        {sorted.map(p => (
          <TVPodiumCard
            key={p.placement}
            placement={p}
            animationDelay={REVEAL_DELAYS[p.placement as keyof typeof REVEAL_DELAYS] ?? 0}
            showShimmer={p.placement === 1}
          />
        ))}
      </div>
      <div className="text-center mt-6 text-xs text-zinc-600 tracking-wider">
        <span>{current.totalEntries} entries</span>
        <span> &nbsp;•&nbsp; </span>
        <span>{current.qualifiedCount} qualified</span>
      </div>
    </div>
  );
}

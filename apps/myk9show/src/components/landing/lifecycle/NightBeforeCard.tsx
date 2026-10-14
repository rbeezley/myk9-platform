import { useEffect, useState } from 'react';
import type { SetupReadinessSignalId } from '@/features/show-workbench/setupReadinessSignals';
import { useReducedMotion } from '@/features/_shared/hooks/useReducedMotion';
import './nightBeforeCard.css';

// D11 honesty rule: each line is the positive form of a setup readiness signal the app really
// computes today. Entries-reconciled, printing and offline-tablet lines join only when MYK9-1145
// builds the real "Ready for show day" screen.
export const NIGHT_BEFORE_CHECKS: readonly {
  signal: SetupReadinessSignalId;
  label: string;
  sub: string;
}[] = [
  {
    signal: 'show-details-missing',
    label: 'Show details complete',
    sub: 'Dates, venue and trials in place',
  },
  {
    signal: 'no-classes',
    label: 'Classes built',
    sub: 'Every trial has its classes',
  },
  {
    signal: 'judges-missing',
    label: 'Judges assigned to every class',
    sub: 'Nothing waiting on a judge',
  },
  {
    signal: 'show-not-visible',
    label: 'Show visible to exhibitors',
    sub: 'Listed and open to view',
  },
  {
    signal: 'exhibitor-materials-unpublished',
    label: 'Premium list published',
    sub: 'Up to date since your last change',
  },
];

export function NightBeforeCard({ active, stepMs = 750 }: { active: boolean; stepMs?: number }) {
  const reducedMotion = useReducedMotion();
  const total = NIGHT_BEFORE_CHECKS.length;
  const [ticked, setTicked] = useState(0);
  const [run, setRun] = useState(0);

  // Reduced motion is derived, not stored: the finished state shows with no animation.
  const shown = reducedMotion ? total : ticked;

  useEffect(() => {
    if (!active || reducedMotion) return;
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setTicked(count);
      if (count >= total) window.clearInterval(timer);
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [active, reducedMotion, run, stepMs, total]);

  const replay = () => {
    setTicked(0);
    setRun(r => r + 1);
  };

  const allSet = shown >= total;
  return (
    <div className="lc-night">
      <div className="lc-night-head">
        <div>
          <div className="lc-night-when">Friday, 9:40 pm</div>
          <div className="lc-night-title">Ready for show day</div>
        </div>
        <span className="lc-night-summary" data-all={allSet ? 'true' : 'false'}>
          {allSet ? 'All set' : `${shown} of ${total} checked`}
        </span>
      </div>
      <ul className="lc-night-list">
        {NIGHT_BEFORE_CHECKS.map((c, i) => {
          const state = shown > i ? 'done' : shown === i ? 'checking' : 'waiting';
          return (
            <li key={c.signal} data-state={state}>
              <span className="lc-night-mark" aria-hidden="true" />
              <div>
                <div className="lc-night-label">{c.label}</div>
                <div className="lc-night-sub">
                  {state === 'done' ? c.sub : state === 'checking' ? 'Checking…' : 'Waiting'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="lc-night-foot">
        <p
          className="lc-night-closing"
          data-shown={allSet ? 'true' : 'false'}
          aria-hidden={!allSet}
        >
          Everything is handled. See you at the ring.
        </p>
        <button type="button" className="lc-night-replay" onClick={replay}>
          Replay
        </button>
      </div>
    </div>
  );
}

/**
 * The single at-show "Add to Home Screen" nudge.
 *
 * There is deliberately ONE nudge with two reasons, not two prompts:
 *   - `offline-scoring` — non-installed iOS Safari purges IndexedDB after 7 idle
 *     days, which would lose a queued score.
 *   - `favorite-alerts` — iOS only delivers web push to an installed PWA, so a
 *     favorited dog's "your turn" alert cannot arrive until the app is installed.
 *
 * Calm and dismissible in both cases: this is guidance, not an error.
 */

import React from 'react';
import { badgeClass } from './slots/atShowChrome.helpers';

export type AddToHomeNudgeReason = 'offline-scoring' | 'favorite-alerts';

const REASON_COPY: Record<AddToHomeNudgeReason, string> = {
  'offline-scoring': 'for reliable offline scoring.',
  'favorite-alerts': 'to get alerts when a dog you favorited is coming up.',
};

interface AtShowAddToHomeNudgeProps {
  reason: AddToHomeNudgeReason;
  installInstructions: string;
  onDismiss: () => void;
}

export const AtShowAddToHomeNudge: React.FC<AtShowAddToHomeNudgeProps> = ({
  reason,
  installInstructions,
  onDismiss,
}) => (
  <div
    role="status"
    className={`flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm ${badgeClass(
      'neutral'
    )}`}
  >
    <span>
      <strong>Add to Home Screen</strong> {REASON_COPY[reason]} {installInstructions}
    </span>
    <button type="button" onClick={onDismiss} className="shrink-0 underline">
      Dismiss
    </button>
  </div>
);

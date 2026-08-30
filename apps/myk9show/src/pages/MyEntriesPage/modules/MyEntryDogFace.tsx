/**
 * The always-visible per-dog band on `MyEntryCard`.
 *
 * One line per dog naming the classes it is entered in, carrying — per class —
 * its check-in state before it runs and its result once it is scored. This is
 * the surface that answers "am I checked in?" on Saturday morning and "did she
 * qualify?" on Saturday afternoon without opening anything.
 *
 * INTENT: read-only. This band renders no controls and opens no write path.
 * Check-in writes belong to the summary band's single next action and to the
 * per-class control inside `MyEntryCardDetails`, both routed through the same
 * `onCheckInClick(entry, cls)` handler. Do not turn a class name here into a
 * button — a second path to the same mutation is what the card's next-action
 * INTENT exists to prevent.
 *
 * @module MyEntriesPage/modules/MyEntryDogFace
 */

import React from 'react';
import { Check, TriangleAlert, MinusCircle } from 'lucide-react';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { ResultBadge } from '@/components/common/ResultBadge';
import { PlacementPill } from '@/components/base/PlacementPill';
import type { MyEntryDogGroup } from './my-entries-types';
import {
  buildDogFaceSummary,
  formatCheckInTally,
  type DogFaceCheckInState,
  type DogFaceTrialGroup,
} from './dogFaceSummary';
import { formatTrialLabel } from './myEntriesUtils';
import { formatMonthDay } from '@/lib/format/dates';

/**
 * "Trial 1 · Aug 1", dropping whichever half the data does not carry. Only
 * rendered when a dog has more than one trial on the order.
 */
function formatTrialGroupLabel(group: DogFaceTrialGroup): string {
  const parts: string[] = [];
  if (group.trialNumber) parts.push(formatTrialLabel(group.trialNumber));
  if (group.trialDate) parts.push(formatMonthDay(group.trialDate));
  return parts.length > 0 ? parts.join(' · ') : 'Other classes';
}

/**
 * The pre-run marker for one class. Every state carries a text label for
 * assistive tech; colour alone never conveys it (DESIGN.md).
 */
const CheckInMarker: React.FC<{ state: DogFaceCheckInState }> = ({ state }) => {
  if (state === 'arrived') {
    return (
      <span className="myk9-entries-dog-face-checked">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only">checked in</span>
      </span>
    );
  }
  if (state === 'pulled') {
    return (
      <span className="myk9-entries-dog-face-pulled">
        <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Pulled
      </span>
    );
  }
  if (state === 'conflict') {
    return (
      <span className="myk9-entries-dog-face-conflict">
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
        Conflict
      </span>
    );
  }
  return null;
};

interface MyEntryDogFaceProps {
  dogs: MyEntryDogGroup[];
}

export const MyEntryDogFace: React.FC<MyEntryDogFaceProps> = ({ dogs }) => {
  if (dogs.length === 0) return null;

  return (
    <div className="myk9-entries-dog-face">
      {dogs.map((dog, index) => {
        const summary = buildDogFaceSummary(dog.classes);
        const tally = formatCheckInTally(summary);

        return (
          <div
            key={dog.dogId || dog.id}
            className={
              index > 0
                ? 'myk9-entries-dog-face-row myk9-entries-dog-face-row--divided'
                : 'myk9-entries-dog-face-row'
            }
          >
            <div className="myk9-entries-dog-face-id">
              {dog.armband && (
                <ArmbandBadge armband={dog.armband} className="h-8 min-w-8 rounded-lg text-xs" />
              )}
              <span className="myk9-entries-dog-face-name">{dog.dogName}</span>
            </div>

            <div className="myk9-entries-dog-face-body">
              {summary.groups.map(group => (
                <div key={group.key} className="myk9-entries-dog-face-trial">
                  {/* Only when there is more than one trial to tell apart. A
                      show can run two trials in a day with the SAME class
                      list, so without this the names repeat with nothing to
                      distinguish them — and a check mark on one of them
                      would be unattributable. */}
                  {summary.showTrialHeadings && (
                    <span className="myk9-entries-dog-face-trial-label">
                      {formatTrialGroupLabel(group)}
                    </span>
                  )}
                  {/* A list, so assistive tech announces "list, N items"
                      rather than running the class names together. */}
                  <ul className="myk9-entries-dog-face-classes">
                    {group.classes.map(cls => (
                      <li key={cls.id} className="myk9-entries-dog-face-class">
                        <span>{cls.name}</span>
                        {cls.resultStatus ? (
                          <>
                            <ResultBadge resultStatus={cls.resultStatus} />
                            {cls.finalPlacement != null && (
                              <PlacementPill placement={cls.finalPlacement} size="sm" />
                            )}
                            {/* Time and faults read with the result, not
                                behind the toggle: "Q in 24.3s" is the run. */}
                            {cls.searchTimeSeconds != null && (
                              <span className="myk9-entries-dog-face-time">
                                {cls.searchTimeSeconds.toFixed(1)}s
                              </span>
                            )}
                            {cls.totalFaults != null && (
                              <span className="myk9-entries-dog-face-faults">
                                {cls.totalFaults}F
                                <span className="sr-only">
                                  {cls.totalFaults === 1 ? ' fault' : ' faults'}
                                </span>
                              </span>
                            )}
                          </>
                        ) : (
                          // `pulled` and `conflict` are states the exhibitor
                          // set themselves; without a marker they looked
                          // identical to a class nobody had checked in for.
                          <CheckInMarker state={cls.checkInState} />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {tally && <span className="myk9-entries-dog-face-tally">{tally}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

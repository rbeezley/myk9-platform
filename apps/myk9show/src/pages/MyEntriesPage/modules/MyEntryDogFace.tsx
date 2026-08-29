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
import { Check } from 'lucide-react';
import { ArmbandBadge } from '@/components/common/ArmbandBadge';
import { ResultBadge } from '@/components/common/ResultBadge';
import { PlacementPill } from '@/components/base/PlacementPill';
import type { MyEntryDogGroup } from './my-entries-types';
import { buildDogFaceSummary, formatCheckInTally } from './dogFaceSummary';

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
              {summary.classes.length > 0 && (
                // A list, so assistive tech announces "list, N items" rather
                // than running the class names together as one sentence.
                <ul className="myk9-entries-dog-face-classes">
                  {summary.classes.map(cls => (
                    <li key={cls.id} className="myk9-entries-dog-face-class">
                      <span>{cls.name}</span>
                      {cls.resultStatus ? (
                        <>
                          <ResultBadge resultStatus={cls.resultStatus} />
                          {cls.finalPlacement != null && (
                            <PlacementPill placement={cls.finalPlacement} size="sm" />
                          )}
                        </>
                      ) : (
                        cls.arrived && (
                          <span className="myk9-entries-dog-face-checked">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="sr-only">checked in</span>
                          </span>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {tally && <span className="myk9-entries-dog-face-tally">{tally}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * FirstRunZeroState — welcoming first-run surface for the My Shows page.
 *
 * Replaces the zeroed CompactStatsRow + empty DogStrip + empty tabs stack that a
 * brand-new exhibitor (no entries) would otherwise see. Showing all-zero stat
 * cards reads as noise and makes the page feel like a data-entry chore — the
 * opposite of the Exhibitor intent ("This respects my time"). Instead we present
 * a single, calm call-to-action that adapts to whether they've added a dog yet.
 *
 * INTENT: Exhibitor first run must feel frictionless, never like a form to fill.
 * Lead with one primary action; keep the page quiet until there's real data.
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { PawPrint, CalendarPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FirstRunZeroStateProps {
  /**
   * Whether the exhibitor already has at least one dog on file.
   * `undefined` means dog ownership is still resolving — in that case we keep the
   * call-to-action dog-neutral (Browse Shows only) so we never flash the wrong
   * "Add Your First Dog" / "Add Another Dog" copy before the answer is known.
   */
  hasDogs: boolean | undefined;
  /** Opens the Add Dog panel (shown as the primary action when hasDogs is false). */
  onAddDog: () => void;
}

export const FirstRunZeroState: React.FC<FirstRunZeroStateProps> = ({ hasDogs, onAddDog }) => {
  // While ownership is unknown, lead with the universally-safe "Browse Shows"
  // and withhold any dog-specific button until the query settles.
  const dogOwnershipKnown = hasDogs !== undefined;

  // The heading/body/icon must also stay neutral while ownership is unknown —
  // otherwise a returning exhibitor with dogs briefly sees the brand-new
  // "Welcome! Let's get you set up" first-run copy before the query resolves.
  // Three states: known-has-dogs, known-no-dogs, and unknown (dog-agnostic).
  const Icon = hasDogs === false ? PawPrint : CalendarPlus;
  const heading = !dogOwnershipKnown
    ? 'Find your next show'
    : hasDogs
      ? "Your dogs are ready — let's find a show"
      : 'Welcome! Let’s get you set up';
  const body = !dogOwnershipKnown
    ? 'Browse upcoming shows and enter in just a few taps.'
    : hasDogs
      ? 'You haven’t entered any shows yet. Browse upcoming shows and enter in just a few taps.'
      : 'Add your dog once and we’ll remember the details — entering a show takes about 30 seconds from here on.';

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-8 text-center sm:p-12">
      <div className="mx-auto mb-5 inline-flex items-center justify-center rounded-full border border-primary/15 bg-primary/8 p-5">
        <Icon className="h-9 w-9 text-primary" />
      </div>

      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>

      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        {hasDogs ? (
          <>
            <Button asChild size="lg">
              <Link to="/shows">
                <CalendarPlus className="mr-2 h-4 w-4" />
                Browse Shows
              </Link>
            </Button>
            <Button variant="outline" size="lg" onClick={onAddDog}>
              <PawPrint className="mr-2 h-4 w-4" />
              Add Another Dog
            </Button>
          </>
        ) : (
          <>
            {/* hasDogs === false → lead with Add Your First Dog. hasDogs ===
                undefined (still resolving) → omit the dog button entirely and
                let Browse Shows stand alone until ownership is known. */}
            {dogOwnershipKnown && (
              <Button size="lg" onClick={onAddDog}>
                <PawPrint className="mr-2 h-4 w-4" />
                Add Your First Dog
              </Button>
            )}
            <Button
              asChild
              variant={dogOwnershipKnown ? 'outline' : 'default'}
              size="lg"
            >
              <Link to="/shows">
                <CalendarPlus className="mr-2 h-4 w-4" />
                Browse Shows
              </Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default FirstRunZeroState;

/**
 * RingsideHome — the signed-in landing for the bare `/at-show` route when there
 * is NOT exactly one live show to auto-jump into (zero, or several). Presents the
 * user's live + upcoming shows as cards that deep-link into ringside, an empty
 * state when there are none, and a passcode affordance for at-venue staff.
 *
 * Full-screen + self-contained (the `/at-show` route renders chromeless, outside
 * the app sidebar). INTENT: no dead ends — even with nothing live, there's a way
 * back and a passcode path forward.
 */

import { ArrowLeft, ChevronRight, KeyRound, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { RingsideShowRef } from './ringsideEntryResolver';

interface RingsideHomeProps {
  liveShows: RingsideShowRef[];
  upcomingShows: RingsideShowRef[];
  /** Reveal the passcode entry flow (reuses SmartSignInPage in the parent). */
  onEnterPasscode: () => void;
}

/** Generic label for a (rare) judge-only show whose name didn't resolve. */
function showLabel(show: RingsideShowRef): string {
  return show.showName ?? 'Your assigned show';
}

function ShowCard({ show, sublabel }: { show: RingsideShowRef; sublabel: string }) {
  return (
    <Link
      to={`/at-show/${show.showId}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-input bg-background p-4 text-left transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{showLabel(show)}</span>
        <span className="block text-sm text-muted-foreground">{sublabel}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

export function RingsideHome({ liveShows, upcomingShows, onEnterPasscode }: RingsideHomeProps) {
  const hasShows = liveShows.length > 0 || upcomingShows.length > 0;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Radio className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="text-2xl font-bold text-foreground">Ringside</h1>
          <p className="mt-1 text-muted-foreground">
            {hasShows ? 'Pick a show to step into the ring.' : 'No show is live right now.'}
          </p>
        </div>

        {liveShows.length > 0 && (
          <section className="mb-6" aria-labelledby="ringside-live-heading">
            <h2
              id="ringside-live-heading"
              className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Live now
            </h2>
            <div className="space-y-2">
              {liveShows.map(show => (
                <ShowCard key={show.showId} show={show} sublabel="Happening today" />
              ))}
            </div>
          </section>
        )}

        {upcomingShows.length > 0 && (
          <section className="mb-6" aria-labelledby="ringside-upcoming-heading">
            <h2
              id="ringside-upcoming-heading"
              className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Coming up
            </h2>
            <div className="space-y-2">
              {upcomingShows.map(show => (
                <ShowCard key={show.showId} show={show} sublabel="Upcoming show" />
              ))}
            </div>
          </section>
        )}

        {!hasShows && (
          <div className="mb-6 rounded-lg border border-dashed border-input bg-background p-6 text-center text-muted-foreground">
            When you have a show running, or an assignment, it&apos;ll show up here for one-tap
            access.
          </div>
        )}

        {/* Passcode path — for staff physically at a show that isn't tied to
            their account (QR / secretary-issued passcode). Reuses the shared
            SmartSignInPage flow in the parent. */}
        <button
          type="button"
          onClick={onEnterPasscode}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-input bg-background p-3 text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <KeyRound className="h-4 w-4" aria-hidden />
          At a show? Enter a passcode
        </button>

        <div className="mt-6 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

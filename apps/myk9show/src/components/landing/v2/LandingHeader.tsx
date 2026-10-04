import { Link } from 'react-router-dom';
import { LAUNCH_YEAR } from './constants';

interface LandingHeaderProps {
  onJoinWaitlistClick: () => void;
}

export function LandingHeader({ onJoinWaitlistClick }: LandingHeaderProps) {
  return (
    <header className="l-hdr">
      <div className="l-hdr-inner">
        <a href="#top" className="l-brand min-h-11">
          <img
            src="/logo.svg"
            alt="myK9Show"
            width="2076"
            height="596"
            className="h-9 w-32 shrink-0 object-contain sm:h-11 sm:w-40 dark:brightness-150 dark:saturate-50"
          />
        </a>
        <span className="l-status-chip">Waitlist · launching {LAUNCH_YEAR}</span>
        <span className="l-hdr-spacer" />
        <nav className="l-hdr-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#offline">Ringside</a>
          <a href="#trust">Who we are</a>
        </nav>
        {/* INTENT: cold-start exhibitors arrive wanting to enter a show, not
            join a waitlist. Surface the existing public /shows browse route so
            discovery isn't gated behind sign-in. Rendered as a persistent
            header button (NOT inside .l-hdr-nav, which is display:none below
            640px) so it stays reachable for phone users. Links existing
            route — no new surface (UX-P2-05). */}
        <Link to="/shows" className="l-btn l-btn-ghost">
          Browse shows
        </Link>
        <Link to="/sign-in" className="l-btn l-btn-ghost l-signin-btn">
          Sign in
        </Link>
        <button
          type="button"
          className="l-btn l-btn-ghost l-waitlist-btn"
          onClick={onJoinWaitlistClick}
        >
          Join the waitlist
        </button>
      </div>
    </header>
  );
}

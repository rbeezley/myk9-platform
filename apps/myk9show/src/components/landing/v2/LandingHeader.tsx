import { Link } from 'react-router-dom';
import { LAUNCH_YEAR } from './constants';

interface LandingHeaderProps {
  onJoinWaitlistClick: () => void;
}

export function LandingHeader({ onJoinWaitlistClick }: LandingHeaderProps) {
  return (
    <header className="l-hdr">
      <div className="l-hdr-inner">
        <a href="#top" className="l-brand">
          <span className="l-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 120 160" fill="currentColor">
              <path
                className="ribbon"
                d="M48 78 L38 150 L52 140 L60 152 L68 140 L82 150 L72 78 Z"
                opacity="0.92"
              />
              <circle cx="60" cy="60" r="36" />
              <circle
                cx="60"
                cy="60"
                r="36"
                fill="none"
                stroke="#faf9f5"
                strokeWidth="2"
                opacity="0.95"
              />
              <circle
                cx="60"
                cy="60"
                r="26"
                fill="none"
                stroke="#faf9f5"
                strokeWidth="1"
                opacity="0.7"
              />
            </svg>
          </span>
          myK9Show
        </a>
        <span className="l-status-chip">Waitlist · launching {LAUNCH_YEAR}</span>
        <span className="l-hdr-spacer" />
        <nav className="l-hdr-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#offline">Offline</a>
          <a href="#trust">Who we are</a>
          <Link to="/pricing">Pricing</Link>
        </nav>
        <button type="button" className="l-btn l-btn-ghost" onClick={onJoinWaitlistClick}>
          Join the waitlist
        </button>
        <Link to="/sign-in" className="l-btn-text">
          Early access →
        </Link>
      </div>
    </header>
  );
}

import { LAUNCH_YEAR } from './constants';
import { MyK9ShowMark } from '@/components/brand/MyK9ShowMark';

interface LandingHeaderProps {
  onJoinWaitlistClick: () => void;
}

export function LandingHeader({ onJoinWaitlistClick }: LandingHeaderProps) {
  return (
    <header className="l-hdr">
      <div className="l-hdr-inner">
        <a href="#top" className="l-brand">
          <span className="l-brand-mark" aria-hidden="true">
            <MyK9ShowMark />
          </span>
          myK9Show
        </a>
        <span className="l-status-chip">Waitlist · launching {LAUNCH_YEAR}</span>
        <span className="l-hdr-spacer" />
        <nav className="l-hdr-nav" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#offline">Ringside</a>
          <a href="#trust">Who we are</a>
        </nav>
        <button type="button" className="l-btn l-btn-ghost" onClick={onJoinWaitlistClick}>
          Join the waitlist
        </button>
        {/* "Pricing" + "Early access →" links intentionally removed pre-launch.
            /pricing-page and /sign-in are still reachable by direct URL for
            internal testing — bookmark them. Re-expose both as part of the
            launch PR when the product goes live. */}
      </div>
    </header>
  );
}

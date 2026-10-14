import { Link } from 'react-router-dom';
import { ADD_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';

// Signed-in visitors reach the landing only through the club-onboarding return,
// where the app header already shows their account, so Sign in is hidden.
export function LandingHeader({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <header className="l-hdr">
      <div className="l-hdr-inner">
        <a href="#top" className="l-brand min-h-11">
          <img
            src="/logo.svg"
            alt="myK9Show"
            width="2076"
            height="596"
            className="l-brand-logo h-9 w-32 shrink-0 object-contain sm:h-11 sm:w-40 dark:brightness-150 dark:saturate-50"
          />
        </a>
        <span className="l-hdr-spacer" />
        <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-hdr-desktop min-h-11">
          {FIND_A_SHOW.label}
        </Link>
        {!signedIn && (
          <Link to="/sign-in" className="l-btn l-btn-ghost min-h-11">
            Sign in
          </Link>
        )}
        <a href={ADD_YOUR_CLUB.href} className="l-btn l-btn-primary min-h-11">
          {ADD_YOUR_CLUB.label}
        </a>
      </div>
    </header>
  );
}

import { Link } from 'react-router-dom';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT, FIND_A_SHOW } from './landingCtas';
import type { Audience } from './lifecycleStories';

// Signed-in visitors reach the landing only through the club-onboarding return, where the
// app header already shows their account, so Sign in is hidden. `audience` is the CTA
// audience from ctaAudience() (always 'club' when signed in); on 'exhibitor' the primary
// action is the exhibitor's first step, a free account.
export function LandingHeader({
  signedIn = false,
  audience = 'club',
}: {
  signedIn?: boolean;
  audience?: Audience;
}) {
  const exhibitor = audience === 'exhibitor';
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
        {exhibitor ? (
          <Link to={CREATE_ACCOUNT.to} className="l-btn l-btn-primary min-h-11">
            {CREATE_ACCOUNT.short}
          </Link>
        ) : (
          <a href={ADD_YOUR_CLUB.href} className="l-btn l-btn-primary min-h-11">
            {ADD_YOUR_CLUB.label}
          </a>
        )}
      </div>
    </header>
  );
}

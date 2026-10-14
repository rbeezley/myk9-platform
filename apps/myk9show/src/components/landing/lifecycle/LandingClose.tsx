import { Link } from 'react-router-dom';
import { ClubOnboarding } from './ClubOnboarding';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT, FIND_A_SHOW } from './landingCtas';
import type { Audience } from './lifecycleStories';

// The close follows the story switch: clubs are asked to add their club, exhibitors to
// create the free account they need to enter. The club form below stays for both, since
// the header's club action and sign-in returns link to it.
export function LandingClose({ audience = 'club' }: { audience?: Audience }) {
  const exhibitor = audience === 'exhibitor';
  return (
    <>
      <section className="l-closing lc-close" aria-labelledby="close-title">
        <div className="l-container">
          {exhibitor ? (
            <>
              <h2 id="close-title">Ready for your next trial.</h2>
              <p>Create a free account to enter shows and follow your entries.</p>
            </>
          ) : (
            <>
              <h2 id="close-title">Ready when your next show is.</h2>
              <p>Tell us about your club and your next show date. We’ll help you set it up.</p>
            </>
          )}
          <div className="lc-hero-ctas lc-close-ctas">
            {exhibitor ? (
              <Link to={CREATE_ACCOUNT.to} className="l-btn l-btn-primary l-btn-lg min-h-11">
                {CREATE_ACCOUNT.label}
              </Link>
            ) : (
              <a href={ADD_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
                {ADD_YOUR_CLUB.label}
              </a>
            )}
            <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-btn-lg min-h-11">
              {FIND_A_SHOW.label}
            </Link>
          </div>
        </div>
      </section>
      <ClubOnboarding />
    </>
  );
}

import { Link } from 'react-router-dom';
import { ClubOnboarding } from './ClubOnboarding';
import { BRING_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';

export function LandingClose() {
  return (
    <>
      <section className="l-closing lc-close" aria-labelledby="close-title">
        <div className="l-container">
          <h2 id="close-title">Ready when your next show is.</h2>
          <p>Tell us about your club and your next show date. We’ll help you set it up.</p>
          <div className="lc-hero-ctas" style={{ justifyContent: 'center' }}>
            <a href={BRING_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
              {BRING_YOUR_CLUB.label}
            </a>
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

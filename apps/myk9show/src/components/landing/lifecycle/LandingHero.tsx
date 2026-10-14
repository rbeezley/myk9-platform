import { Link } from 'react-router-dom';
import { HERO_PHOTO_SIZES } from './heroPhoto';
import { ADD_YOUR_CLUB, CREATE_ACCOUNT, FIND_A_SHOW } from './landingCtas';
import './landingSections.css';

// `showSignUp` is false for a signed-in visitor, who already has an account.
export function LandingHero({ showSignUp = true }: { showSignUp?: boolean }) {
  return (
    <section className="l-hero lc-hero" id="top" aria-labelledby="hero-title">
      <div className="lc-hero-inner">
        <img
          className="lc-hero-photo"
          src="/hero-ziva-tera-1600.jpg"
          srcSet="/hero-ziva-tera-800.jpg 800w, /hero-ziva-tera-1600.jpg 1600w"
          sizes={HERO_PHOTO_SIZES}
          width={1600}
          height={1395}
          alt="A Belgian Tervuren and a Dutch Shepherd standing in an autumn field"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
        <div className="l-container lc-hero-copy">
          <h1 id="hero-title" className="l-h1">
            From premium list to <em>placements</em>.
          </h1>
          <p className="l-lede">
            Run your scent work show on one system: entries, ringside scoring that works without
            signal, and results.
          </p>
          <div className="lc-hero-ctas">
            <a href={ADD_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
              {ADD_YOUR_CLUB.label}
            </a>
            <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-btn-lg min-h-11">
              {FIND_A_SHOW.label}
            </Link>
          </div>
          {showSignUp && (
            <p className="lc-hero-exhibitor">
              Entering a show? <Link to={CREATE_ACCOUNT.to}>{CREATE_ACCOUNT.label}</Link>.
            </p>
          )}
          <p className="lc-hero-registries">
            For AKC Scent Work, UKC Nosework and ASCA Scent Detection.
          </p>
        </div>
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { BRING_YOUR_CLUB, FIND_A_SHOW } from './landingCtas';
import './landingSections.css';

export function LandingHero() {
  return (
    <section className="l-hero lc-hero" id="top" aria-labelledby="hero-title">
      <img
        className="lc-hero-photo"
        src="/hero-ziva-tera-1600.jpg"
        srcSet="/hero-ziva-tera-800.jpg 800w, /hero-ziva-tera-1600.jpg 1600w"
        sizes="100vw"
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
          <a href={BRING_YOUR_CLUB.href} className="l-btn l-btn-primary l-btn-lg min-h-11">
            {BRING_YOUR_CLUB.label}
          </a>
          <Link to={FIND_A_SHOW.to} className="l-btn l-btn-ghost l-btn-lg min-h-11">
            {FIND_A_SHOW.label}
          </Link>
        </div>
        <p className="lc-hero-registries">
          For AKC Scent Work, UKC Nosework and ASCA Scent Detection.
        </p>
      </div>
    </section>
  );
}

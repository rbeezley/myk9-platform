import { WaitlistFormLanding } from './WaitlistFormLanding';

export function HeroPhotoLed() {
  return (
    <section className="l-hero" id="top">
      <div className="l-photo-band">
        <img
          src="/hero-ziva-tera.jpg"
          alt="Two working-line dogs — a Belgian Tervuren and a Dutch Shepherd — standing in a golden autumn field"
          loading="eager"
          fetchPriority="high"
          decoding="async"
        />
        <div className="l-photo-meta">
          <span className="l-swatch" aria-hidden="true" />
          <span>
            <em>Ziva &amp; Tera</em>
          </span>
        </div>
      </div>
      <div className="l-hero-below">
        <div className="l-hero-grid">
          <div className="l-col-left">
            <div className="l-kicker">
              <span className="l-dot" aria-hidden="true" />
              <span className="l-eyebrow">Dog-sport software · Scent work first</span>
            </div>
            <h1 className="l-h1">
              From premium list to <em>final placements</em> — without the paperwork.
            </h1>
            <p className="l-lede">
              Online entries, ringside scoring, and exhibitor tracking —{' '}
              <strong>built for AKC Scent Work, UKC Nosework, and ASCA Scent Detection.</strong>{' '}
              Obedience, agility, and conformation arrive in 2027.
            </p>
          </div>
          <div className="l-col-right">
            <WaitlistFormLanding emailInputId="l-wl-hero" />
          </div>
        </div>
      </div>
    </section>
  );
}

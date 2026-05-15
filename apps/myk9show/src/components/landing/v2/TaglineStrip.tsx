import { Wifi, CheckSquare, Clock } from 'lucide-react';

export function TaglineStrip() {
  return (
    <div className="l-tagline-strip" role="region" aria-label="Product highlights">
      <div className="l-container l-tagline-inner">
        <span className="l-tag">
          <Wifi aria-hidden="true" />
          Local-first PWA · works offline at venues
        </span>
        <span className="l-tag-sep" aria-hidden="true" />
        <span className="l-tag">
          <CheckSquare aria-hidden="true" />
          AKC Scent Work · UKC Nosework · ASCA Scent Detection
        </span>
        <span className="l-tag-sep" aria-hidden="true" />
        <span className="l-tag l-tag-future">
          <Clock aria-hidden="true" />
          Obedience, agility &amp; conformation in 2027
        </span>
      </div>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { FEES_LINK, PRICING_CARDS, PRICING_LEDE, feeHeadline, withFee } from './landingFacts';
import { useLandingFeeLabel } from './useLandingFeeLabel';

// What it costs, in two cards. The full explanation, with worked examples, is /fees: this
// section links there and does not repeat it.
export function PricingSection() {
  const feeLabel = useLandingFeeLabel();
  return (
    <section className="l-section lc-pricing" id="pricing" aria-labelledby="pricing-title">
      <div className="l-container">
        <h2 id="pricing-title" className="l-h2">
          What it costs
        </h2>
        <p className="lc-section-lede">{withFee(PRICING_LEDE, feeLabel)}</p>
        <div className="lc-pricing-cards">
          {PRICING_CARDS.map(card => (
            <div className="lc-pricing-card" key={card.who}>
              <h3>{card.who}</h3>
              <p className="lc-pricing-price">{card.price ?? feeHeadline(feeLabel)}</p>
              <ul>
                {card.points.map(point => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="lc-section-more">
          <Link to={FEES_LINK.to}>{FEES_LINK.label}</Link>
        </p>
      </div>
    </section>
  );
}

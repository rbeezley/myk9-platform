import { FAQ_ITEMS, withFee } from './landingFacts';
import { useLandingFeeLabel } from './useLandingFeeLabel';

// Six questions a club board asks, every answer on the page: nothing to open, nothing hidden.
export function FaqSection() {
  const feeLabel = useLandingFeeLabel();
  return (
    <section className="l-section lc-faq" id="faq" aria-labelledby="faq-title">
      <div className="l-container">
        <h2 id="faq-title" className="l-h2">
          Questions clubs ask
        </h2>
        <dl className="lc-faq-list">
          {FAQ_ITEMS.map(item => (
            <div className="lc-faq-item" key={item.q}>
              <dt>{item.q}</dt>
              {item.a.map(paragraph => (
                <dd key={paragraph}>{withFee(paragraph, feeLabel)}</dd>
              ))}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

import { FAQ_ITEMS, withFee } from './landingFacts';
import { useLandingFeeLabel } from './useLandingFeeLabel';

// Six questions a club board asks. Each opens in place (native <details>, so it works with no
// script and from the keyboard): the page has a length budget on a phone
// (landing-lifecycle.spec.ts, "page length is 8 to 14 screens"), and six open answers broke it.
export function FaqSection() {
  const feeLabel = useLandingFeeLabel();
  return (
    <section className="l-section lc-faq" id="faq" aria-labelledby="faq-title">
      <div className="l-container">
        <h2 id="faq-title" className="l-h2">
          Questions clubs ask
        </h2>
        <div className="lc-faq-list">
          {FAQ_ITEMS.map(item => (
            <details className="lc-faq-item" key={item.q}>
              <summary>{item.q}</summary>
              {item.a.map(paragraph => (
                <p key={paragraph}>{withFee(paragraph, feeLabel)}</p>
              ))}
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

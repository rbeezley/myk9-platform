import { TRUST_ITEMS } from './landingFacts';

// The trust bar, straight under the hero. Keeps the `about` anchor the footer links to and the
// one mention of the older ringside app on the page.
export function TrustSection() {
  return (
    <section className="lc-trust" id="about" aria-labelledby="trust-title">
      <div className="l-container">
        <h2 id="trust-title" className="lc-trust-title">
          Built by the team behind mySWT and myNWT
        </h2>
        <ul className="lc-trust-items">
          {TRUST_ITEMS.map(item => (
            <li key={item.lead}>
              <strong>{item.lead}</strong> <span>{item.text}</span>
            </li>
          ))}
        </ul>
        <p className="lc-trust-lineage">
          It&apos;s the ringside experience you may know as myK9Q, now built right in.
        </p>
      </div>
    </section>
  );
}

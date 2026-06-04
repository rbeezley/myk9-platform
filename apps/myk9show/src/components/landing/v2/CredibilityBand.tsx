interface CredCard {
  name: string;
  dotColor: string;
  desc: string;
  stat: string;
  isNew?: boolean;
}

const CARDS: CredCard[] = [
  {
    name: 'mySWT',
    dotColor: 'var(--teal-500)',
    desc: 'AKC Scent Work entries & results.',
    stat: 'Since 2017',
  },
  {
    name: 'myNWT',
    dotColor: 'var(--purple-500)',
    desc: 'UKC Nosework trial management.',
    stat: 'Since 2013',
  },
  {
    name: 'Ringside',
    dotColor: 'var(--terracotta-500)',
    desc: 'Offline scoring and ring-flow tools.',
    stat: 'Offline-first · 2025',
  },
  {
    name: 'myK9Show',
    dotColor: 'var(--terracotta-500)',
    desc: 'One platform. Offline-first. Modern Web.',
    stat: 'Joining the waitlist · 2026',
    isNew: true,
  },
];

export function CredibilityBand() {
  return (
    <section className="l-cred" id="trust">
      <div className="l-container l-cred-grid">
        <div>
          <span className="l-eyebrow">Who we are</span>
          <h2 className="l-h2">
            The same team you've trusted at trial since <em>2013.</em>
          </h2>
          <p className="l-body">
            myK9Show is the next chapter from RyKris — the people behind mySWT, myNWT, and the
            ringside tools now built into this platform. Thirteen years of building scent-sport
            software, alongside the judges, secretaries, and exhibitors who use it every weekend.
          </p>
        </div>
        <div className="l-cred-cards">
          {CARDS.map(card => (
            <div key={card.name} className={`l-cred-card${card.isNew ? ' l-is-new' : ''}`}>
              <div className="l-name">
                <span className="l-dot" style={{ background: card.dotColor }} aria-hidden="true" />
                {card.name}
              </div>
              <div className="l-desc">{card.desc}</div>
              <div className="l-stat">{card.stat}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Wifi, Clock, List } from 'lucide-react';
import type { ReactNode } from 'react';

interface FeatureCard {
  icon: ReactNode;
  title: ReactNode;
  body: string;
  footLeft: string;
  badge: string;
}

const CARDS: FeatureCard[] = [
  {
    icon: <Wifi width={20} height={20} />,
    title: (
      <>
        Offline-first <em>ringside.</em>
      </>
    ),
    body: 'Set the trial up online. Run trial day offline on any phone or tablet. Sync the moment signal returns — never lose a score because the venue Wi-Fi died.',
    footLeft: 'PWA · local-first',
    badge: 'No internet required',
  },
  {
    icon: <Clock width={20} height={20} />,
    title: (
      <>
        Scent-sport rules, <em>built in.</em>
      </>
    ),
    body: 'AKC Scent Work, UKC Nosework, and ASCA Scent Detection — class structures, levels, and qualifying logic are pre-loaded. No spreadsheet templates. No edge cases by hand.',
    footLeft: 'AKC · UKC · ASCA',
    badge: '3 sanctioning bodies',
  },
  {
    icon: <List width={20} height={20} />,
    title: (
      <>
        One flow. <em>Entry to ribbon.</em>
      </>
    ),
    body: 'Premium list → online entries → armbands → catalog → live scoring → results → title tracking. The same record, end to end, with no re-keying between stages.',
    footLeft: 'End-to-end',
    badge: 'No re-keying',
  },
];

export function ClubFeatures() {
  return (
    <section className="l-section l-alt" id="features">
      <div className="l-container">
        <div className="l-audience-tag l-for-clubs">
          <span className="l-dot" aria-hidden="true" />
          For clubs &amp; secretaries
        </div>
        <div className="l-section-heading">
          <h2>
            Run a trial without <em>the paperwork</em> — from premium list to final placements.
          </h2>
          <div className="l-aside">
            One system replaces the spreadsheet, the entry form, the catalog, and the
            scoresheet. Offline at the venue, synced when you're back.
          </div>
        </div>
        <div className="l-features-grid">
          {CARDS.map((card, idx) => (
            <article key={idx} className="l-feature l-club-tone">
              <span className="l-icon-wrap" aria-hidden="true">
                {card.icon}
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <div className="l-footnote">
                <span>{card.footLeft}</span>
                <span className="l-badge">{card.badge}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

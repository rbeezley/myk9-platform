import { Search, Activity, BarChart3 } from 'lucide-react';
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
    icon: <Search width={20} height={20} />,
    title: (
      <>
        Find your trial. <em>Enter in minutes.</em>
      </>
    ),
    body: 'Browse upcoming trials by sanctioning body, level, and distance. Saved dogs, saved handlers — entry is as fast as “tap, confirm, pay.”',
    footLeft: 'Browse · Enter',
    badge: 'One profile, every trial',
  },
  {
    icon: <Activity width={20} height={20} />,
    title: (
      <>
        Live from <em>ringside.</em>
      </>
    ),
    body: "Ring status, next-up alerts, and your dog's score the moment the judge signs off. From your phone, even with one bar of LTE.",
    footLeft: 'Live status',
    badge: 'Push notifications',
  },
  {
    icon: <BarChart3 width={20} height={20} />,
    title: (
      <>
        Titles, trends, <em>the whole story.</em>
      </>
    ),
    body: 'Qualifying rate by element. Time-under-par by level. Health records and training journal alongside thirteen years of placements — never lost, never re-entered.',
    footLeft: 'Statistics',
    badge: 'Career history',
  },
];

export function ExhibitorFeatures() {
  return (
    <section className="l-section">
      <div className="l-container">
        <div className="l-audience-tag l-for-exhibitors">
          <span className="l-dot" aria-hidden="true" />
          For exhibitors
        </div>
        <div className="l-section-heading">
          <h2>
            Your dog's career — <em>in one place.</em> Forever.
          </h2>
          <div className="l-aside">
            Browse, enter, follow the day live, then watch your titles, statistics, and ribbons
            build over the years.
          </div>
        </div>
        <div className="l-features-grid">
          {CARDS.map((card, idx) => (
            <article key={idx} className="l-feature l-exhibitor-tone">
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

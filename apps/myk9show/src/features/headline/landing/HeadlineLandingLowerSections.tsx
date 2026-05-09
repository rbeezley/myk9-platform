import type { HeritageLandingData } from '@/features/heritage/landing/types';
import { SectionHead } from './HeadlineLandingPrimitives';
import { formatDateRange, shortDate } from './headlineLandingDates';

export function ScheduleAndPlan({ data }: { data: HeritageLandingData }) {
  const cards = [
    ...data.accommodations.map((item, index) => ({
      num: item.type ?? `Hotel · ${String(index + 1).padStart(2, '0')}`,
      title: item.name,
      meta: [item.address, item.phone].filter(Boolean).join(' · '),
      info: item.url ?? 'Listed in the published premium.',
    })),
    data.hospitalityNotes
      ? {
          num: 'Hospitality',
          title: 'On-site hospitality',
          meta: 'Trial weekend',
          info: data.hospitalityNotes,
        }
      : null,
    data.awardsDescription
      ? {
          num: 'Awards',
          title: 'Awards offered',
          meta: 'Presented at the trial',
          info: data.awardsDescription,
        }
      : null,
    data.venueAddress
      ? {
          num: 'Venue',
          title: data.venueName ?? 'Trial venue',
          meta: data.venueAddress,
          info: 'Check-in and crating details are listed in the premium.',
        }
      : null,
  ].filter((item): item is { num: string; title: string; meta: string; info: string } =>
    Boolean(item)
  );

  return (
    <section className="hd-section" id="schedule">
      <SectionHead index={4} kicker="Schedule · Lodging · Venue" title="Plan the trip.">
        <p className="hd-prose">
          {data.houseRulesNotes ??
            'Show hours, travel planning, hospitality, awards, and venue notes are collected here for a fast pre-entry scan.'}
        </p>
      </SectionHead>
      <div className="hd-cards-grid">
        {cards.slice(0, 6).map(card => (
          <div className="hd-card" key={`${card.num}-${card.title}`}>
            <div className="num">{card.num}</div>
            <h3 className="title">{card.title}</h3>
            <div className="meta">{card.meta || 'Details TBD'}</div>
            <div className="info">{card.info}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Officers({ data }: { data: HeritageLandingData }) {
  const officers = [
    ...data.officers,
    data.secretaryName ? { title: 'Trial Secretary', name: data.secretaryName } : null,
  ].filter((officer): officer is { title: string; name: string } => Boolean(officer));

  if (officers.length === 0) return null;

  return (
    <section className="hd-section" id="who">
      <SectionHead index={5} kicker="Officers · Trial committee" title="Who's running this." />
      <div className="hd-officers">
        {officers.map(officer => (
          <div className="o" key={`${officer.title}-${officer.name}`}>
            <div className="role">{officer.title}</div>
            <div className="name">{officer.name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinalCta({ data }: { data: HeritageLandingData }) {
  return (
    <section className="hd-final" id="enter">
      <div className="hd-final-inner">
        <div>
          <div className="hd-final-tag">
            Closing {shortDate(data.entryCloseDate, data.timezone)}
          </div>
          <h2>
            Get your dog
            <br />
            <span className="accent">on the entry list.</span>
          </h2>
          <p className="hd-final-sub">
            {data.entryLimit ? `${data.entryLimit} available runs. ` : ''}
            Entries are accepted through myK9Show until the closing date or the published limit is
            reached.
          </p>
        </div>
        <div className="hd-final-side">
          <div className="l">Online entry</div>
          <div className="v">{data.showName}</div>
          <a className="cta" href={data.entryWizardUrl}>
            Submit Entry
          </a>
          <div className="helper">Saves and resumes</div>
        </div>
      </div>
    </section>
  );
}

export function Footer({ data }: { data: HeritageLandingData }) {
  return (
    <footer className="hd-footer">
      <div className="hd-footer-inner">
        <div className="col">
          <h4>{data.clubName}</h4>
          <p>{data.memberClubLanguage}</p>
        </div>
        <div className="col">
          <h4>Trial Secretary</h4>
          <p>{data.secretaryName ?? 'Secretary listed in premium'}</p>
          {data.secretaryEmail && (
            <a href={`mailto:${data.secretaryEmail}`}>{data.secretaryEmail}</a>
          )}
        </div>
        <div className="col">
          <h4>Published via myK9Show</h4>
          <p>{data.showName}</p>
        </div>
      </div>
      <div className="hd-footer-fine">
        <span>{data.clubName}</span>
        <span>{formatDateRange(data)}</span>
        <span>{data.licenseLanguage}</span>
      </div>
    </footer>
  );
}

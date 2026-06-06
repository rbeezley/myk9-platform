import { useEffect } from 'react';
import type { Show } from '@/types/show-types';
import type { Trial } from '@/components/trials/types/trial.types';
import { useHeritageLandingData } from '@/features/heritage/landing/useHeritageLandingData';
import type { HeritageLandingData } from '@/features/heritage/landing/types';
import { formatJourneyDate } from '@/features/heritage/landing/utils/dateFormat';
import { useCountdown } from '@/features/heritage/hooks/useCountdown';
import { ensureHeadlineFontsLoaded } from '../fonts';
import { FinalCta, Footer, Officers, ScheduleAndPlan } from './HeadlineLandingLowerSections';
import { SectionHead } from './HeadlineLandingPrimitives';
import { formatDateRange, shortDate } from './headlineLandingDates';
import '../headline.css';
import '../headline-detail.css';

interface HeadlineLandingPageProps {
  show: Show | null | undefined;
  trial: Trial | null | undefined;
  allTrials: Trial[];
}

function formatPercent(current: number, limit: number | null): number {
  if (!limit || limit <= 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

function feeAmountParts(amount: string): { dollars: string; cents: string } {
  const match = amount.match(/^(\$?\d+)(\.\d{2})?$/);
  return { dollars: match?.[1] ?? amount, cents: match?.[2] ?? '' };
}

function joinOrFallback(items: string[], fallback: string): string {
  const present = items.filter(Boolean);
  return present.length > 0 ? present.join(' · ') : fallback;
}

function getHeroTitleParts(showName: string | null | undefined): { base: string; suffix: string | null } {
  const base = showName?.trim() || 'Scent Work';
  return /\btrial\b/i.test(base) ? { base, suffix: null } : { base, suffix: 'Trial' };
}

function HeadlineNav({ data }: { data: HeritageLandingData }) {
  return (
    <>
      <div className="hd-topbar" />
      <nav className="hd-nav" aria-label="Show sections">
        <div className="hd-nav-inner">
          <a className="hd-nav-mark" href="#overview">
            {data.clubName || 'myK9Show'}
            <span className="mono">{data.showName}</span>
          </a>
          <div className="hd-nav-links">
            <a href="#judges">Judges</a>
            <a href="#particulars">Details</a>
            <a href="#roster">Entry status</a>
            <a href="#schedule">Schedule</a>
            <a href="#enter">Enter</a>
          </div>
          <a className="hd-nav-cta" href={data.entryWizardUrl}>
            Enter this show
          </a>
        </div>
      </nav>
    </>
  );
}

function Hero({ data }: { data: HeritageLandingData }) {
  const countdown = useCountdown(data.entryCloseDate, data.timezone);
  const totalRuns = data.entryLimit ? `${data.entryLimit} runs` : 'Limit TBD';
  const title = getHeroTitleParts(data.showName);

  return (
    <header className="hd-hero" id="overview">
      <div className="hd-hero-tag">{data.licenseLanguage}</div>
      <div className="hd-club-line">{data.clubName}</div>
      <h1 className="hd-title">
        {title.base}
        {title.suffix && (
          <>
            {' '}
            <span className="accent">{title.suffix}</span>
          </>
        )}
        <span className="mark">.</span>
      </h1>
      <p className="hd-subtitle">
        {data.welcomeText ??
          `${data.showSubtitle}. Dates, judges, fees, schedule, venue notes, and entry details in one place.`}
      </p>

      <div className="hd-hero-grid">
        <div>
          <div className="l">When</div>
          <div className="v">{formatDateRange(data)}</div>
        </div>
        <div>
          <div className="l">Where</div>
          <div className="v">{data.venueName ?? data.venueAddress ?? 'Venue TBD'}</div>
        </div>
        <div>
          <div className="l">Trials</div>
          <div className="v">{data.trials.length || 'TBD'}</div>
        </div>
        <div>
          <div className="l">Capacity</div>
          <div className="v">{totalRuns}</div>
        </div>
      </div>

      <div className="hd-hero-bottom">
        <div className="hd-cta-stack">
          <a className="hd-cta" href={data.entryWizardUrl}>
            Enter this show
          </a>
          <a className="hd-cta ghost" href="#particulars">
            Review details
          </a>
          <span className="hd-cta-meta">
            Closes {shortDate(data.entryCloseDate, data.timezone)}
          </span>
        </div>

        {countdown.hasTarget && !countdown.closed && (
          <div className="hd-ticker" aria-label="Countdown to entries close">
            <div className="pre">Closing in</div>
            {[
              ['d', countdown.days],
              ['h', countdown.hours],
              ['m', countdown.minutes],
              ['s', countdown.seconds],
            ].map(([label, value]) => (
              <div className="b" key={label}>
                <span className="n">{String(value).padStart(2, '0')}</span>
                <span className="l">{label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </header>
  );
}

function Judges({ data }: { data: HeritageLandingData }) {
  const judges =
    data.judges.length > 0
      ? data.judges
      : [{ id: 'tbd', name: 'Judges to be announced', city: null, trials: [], elements: [] }];

  return (
    <section className="hd-section" id="judges">
      <SectionHead index={1} kicker="Approved judging panel" title="The bench is set." />
      <div className="hd-judges">
        {judges.map(judge => (
          <div className="hd-judge" key={judge.id}>
            <div className="role">{joinOrFallback(judge.trials, 'Trials TBD')}</div>
            <h3 className="name">{judge.name}</h3>
            <div className="city">{judge.city ?? 'Assignment details will be posted here'}</div>
            <div className="panel">
              <span className="panel-label">Element panel</span>
              {joinOrFallback(judge.elements, 'Elements assigned by trial')}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Particulars({ data }: { data: HeritageLandingData }) {
  return (
    <section className="hd-section" id="particulars">
      <SectionHead index={2} kicker="Before you enter" title="Entry details.">
        <p className="hd-prose">{data.showSubtitle}</p>
      </SectionHead>
      <table className="hd-detail-table">
        <tbody>
          <tr>
            <th>Sanctioning</th>
            <td>{data.licenseLanguage}</td>
          </tr>
          <tr>
            <th>Format</th>
            <td>
              {data.trials.length || 'TBD'} trial{data.trials.length === 1 ? '' : 's'}
            </td>
          </tr>
          <tr>
            <th>Entry limit</th>
            <td>
              <span className="accent">{data.entryLimit ? `${data.entryLimit} runs` : 'TBD'}</span>
            </td>
          </tr>
          <tr>
            <th>Opens</th>
            <td>{shortDate(data.entryOpenDate, data.timezone)}</td>
          </tr>
          <tr>
            <th>Closes</th>
            <td>
              <span className="accent">{shortDate(data.entryCloseDate, data.timezone)}</span>
            </td>
          </tr>
          <tr>
            <th>Confirmation</th>
            <td>{shortDate(data.confirmationDate, data.timezone)}</td>
          </tr>
        </tbody>
      </table>

      {data.fees.length > 0 && (
        <>
          <div className="hd-h2-kicker">Entry fees</div>
          <div className="hd-fees">
            {data.fees.map(fee => {
              const parts = feeAmountParts(fee.amount);
              return (
                <div className="hd-fee" key={fee.label}>
                  <div className="l">{fee.label}</div>
                  <div className="n">
                    {parts.dollars}
                    {parts.cents && <span className="cents">{parts.cents}</span>}
                  </div>
                  <div className="sub">per dog, per trial where applicable</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

function Roster({ data }: { data: HeritageLandingData }) {
  const pct = formatPercent(data.entryCount, data.entryLimit);
  const limit = data.entryLimit ?? 0;

  return (
    <section className="hd-section" id="roster">
      <SectionHead index={3} kicker="Live status" title="Entry status at a glance." />
      <div className="hd-twocol">
        <div
          className="hd-capacity in"
          style={{ '--hd-capacity-pct': `${pct}%` } as React.CSSProperties}
        >
          <div className="hd-capacity-head">
            <div className="nums">
              {data.entryCount}
              <span className="of">/{limit || 'TBD'}</span>
            </div>
            <div className="lbl">
              Runs claimed
              <br />
              <span className="accent">{pct}% full</span>
            </div>
          </div>
          <div className="bar">
            <div className="bar-fill" />
          </div>
          <div className="hd-capacity-foot">
            <div>{shortDate(data.entryOpenDate, data.timezone)}</div>
            <div>{shortDate(data.entryCloseDate, data.timezone)}</div>
          </div>
        </div>

        <div>
          <div className="hd-h2-kicker">Limits at a glance</div>
          <table className="hd-detail-table">
            <tbody>
              <tr>
                <th>Total</th>
                <td>{data.entryLimit ? `${data.entryLimit} runs` : 'Limit TBD'}</td>
              </tr>
              <tr>
                <th>Status</th>
                <td>
                  <span className="accent">Open</span> · accepting entries
                </td>
              </tr>
              <tr>
                <th>Timezone</th>
                <td>{data.timezone}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {data.journeySteps.length > 0 && (
        <>
          <div className="hd-h2-kicker hd-spaced-kicker">The journey from here</div>
          <div className="hd-timeline in">
            {data.journeySteps.map((step, index) => (
              <div className={`step ${step.status}`} key={`${step.label}-${step.date}`}>
                <div className="num">{String(index + 1).padStart(2, '0')}</div>
                <div className="when">
                  {step.date ? formatJourneyDate(step.date, data.timezone) : 'TBD'}
                </div>
                <div className="what">
                  {step.label}
                  <span className="desc">{step.description}</span>
                </div>
                <div className="status">{step.status === 'future' ? 'Upcoming' : step.status}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function HeadlineLandingPage({ show, trial, allTrials }: HeadlineLandingPageProps) {
  useEffect(() => {
    ensureHeadlineFontsLoaded();
  }, []);

  const data = useHeritageLandingData(show, trial, allTrials);

  return (
    <div data-headline className="hd-shell">
      <title>
        {data.clubName} · {data.showName}
      </title>
      <meta
        name="description"
        content={`${data.showName} — ${data.showSubtitle}. Entries close ${shortDate(
          data.entryCloseDate,
          data.timezone
        )}.`}
      />
      <meta property="og:title" content={`${data.clubName} · ${data.showName}`} />
      <meta property="og:description" content={data.showSubtitle} />
      <meta property="og:type" content="event" />

      <HeadlineNav data={data} />
      <main>
        <Hero data={data} />
        <Judges data={data} />
        <Particulars data={data} />
        <Roster data={data} />
        <ScheduleAndPlan data={data} />
        <Officers data={data} />
        <FinalCta data={data} />
      </main>
      <Footer data={data} />
    </div>
  );
}

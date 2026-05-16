import { GazetteDropCap } from '../../components/GazetteDropCap';
import { useReducedMotion } from '@/features/heritage/hooks/useReducedMotion';
import { formatDateInTimezone } from '../utils/dateFormat';

interface LeadArticleSectionProps {
  showName: string;
  showSubtitle: string;
  welcomeText: string | null;
  trialChairName: string | null;
  trialChairTitle: string | null;
  trialStartDate: string | null;
  trialEndDate: string | null;
  timezone: string;
}

/**
 * The front-page lead + 3-column drop-cap body. This is the section that
 * does the most surgery vs Heritage — Heritage's WelcomeSection is a single
 * narrow column with an ornament rule; Gazette renders it as a true
 * newspaper-grade `column-count: 3` flow with a 72px Playfair drop cap and
 * a "Continued on §02" tail line.
 *
 * If `welcomeText` is null, the section still renders a generic 3-paragraph
 * body using the show title — Gazette's whole identity is column inches, so
 * the section can never be empty. (Heritage gracefully omits its Welcome
 * when text is missing — Gazette can't make that trade.)
 */
export function LeadArticleSection({
  showName,
  showSubtitle,
  welcomeText,
  trialChairName,
  trialChairTitle,
  trialStartDate,
  trialEndDate,
  timezone,
}: LeadArticleSectionProps) {
  const reducedMotion = useReducedMotion();

  const dateRange = [
    trialStartDate ? formatDateInTimezone(trialStartDate, timezone, 'short') : null,
    trialEndDate && trialEndDate !== trialStartDate
      ? formatDateInTimezone(trialEndDate, timezone, 'short')
      : null,
  ]
    .filter(Boolean)
    .join(' – ');

  const paragraphs = (welcomeText ?? '').split(/\n\n+/).filter(p => p.trim().length > 0);
  const lead = paragraphs[0] ?? defaultLeadParagraph(showName, showSubtitle);
  const rest = paragraphs.slice(1);

  const riseClass = (delay: 'delay-2' | 'delay-3') =>
    reducedMotion ? '' : `gz-rise ${delay}`;

  return (
    <>
      <article
        className="mx-auto max-w-[1100px] border-b px-6 py-8 md:px-12 md:py-12"
        style={{ borderColor: 'var(--gz-ink)' }}
      >
        <div
          className="mb-4 text-center text-[11px] uppercase"
          style={{
            color: 'var(--gz-brown)',
            letterSpacing: '0.32em',
            fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
          }}
        >
          Front Page · Trial Edition{dateRange ? ` · ${dateRange}` : ''}
        </div>
        <h2
          className={`mx-auto mb-4 max-w-[18ch] text-center text-balance ${riseClass('delay-2')}`}
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 900,
            fontSize: 'clamp(40px, 5vw, 64px)',
            lineHeight: 1,
            letterSpacing: '-0.015em',
            color: 'var(--gz-ink)',
          }}
        >
          {showName}
        </h2>
        <p
          className={`mx-auto mb-6 max-w-[640px] text-center ${riseClass('delay-3')}`}
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 22,
            lineHeight: 1.4,
            color: 'var(--gz-soft)',
            textWrap: 'pretty',
          }}
        >
          {showSubtitle}
        </p>
        {trialChairName && (
          <div
            className={`mx-auto max-w-[580px] border-t border-b py-3 text-center text-[11px] uppercase ${riseClass('delay-3')}`}
            style={{
              borderColor: 'var(--gz-hair)',
              color: 'var(--gz-brown)',
              letterSpacing: '0.18em',
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}
          >
            By {trialChairName}
            {trialChairTitle ? `, ${trialChairTitle}` : ''} · Special to the Gazette
          </div>
        )}
      </article>

      <div id="welcome" className="mx-auto max-w-[1100px] px-6 pt-8 pb-6 md:px-12">
        <div className="gz-columns">
          <GazetteDropCap>{lead}</GazetteDropCap>
          {rest.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {trialChairName && (
            <span className="gz-signature">
              <em>{trialChairName}</em>
              {trialChairTitle ? <> · {trialChairTitle}</> : null}
            </span>
          )}
        </div>
        <div className="gz-continued mx-auto max-w-[1100px] px-0 md:px-0">
          <a
            href="#particulars"
            style={{
              color: 'var(--gz-brown)',
              textDecorationColor: 'var(--gz-hair)',
            }}
          >
            Continued on §02 — Particulars
          </a>
        </div>
      </div>
    </>
  );
}

function defaultLeadParagraph(showName: string, subtitle: string): string {
  return `${showName} returns this season. ${subtitle}. Exhibitors are advised to enter early; the trial committee has set the limit firmly and last spring's meeting filled well before the published close.`;
}

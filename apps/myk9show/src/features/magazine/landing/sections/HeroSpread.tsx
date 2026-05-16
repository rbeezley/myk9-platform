import { MagazineHeading } from '../../components/MagazineHeading';
import { MagazineCover } from '../../components/MagazineCover';
import { formatShortDate } from '../utils/dateFormat';

interface HeroSpreadProps {
  clubName: string;
  showName: string;
  showSubtitle: string;
  trialStartDate: string | null;
  trialEndDate: string | null;
  venueCity: string | null;
  venueName: string | null;
  timezone: string;
  coverImageUrl: string | null;
  coverCaption: string | null;
  monogramLetters: string;
  trialChairName: string | null;
}

/**
 * Two-column editorial cover spread.
 *
 * Left column (~55%): smallcaps eyebrow, oversized italic display title,
 * dek paragraph, and a byline row with trial chair / dates / venue.
 * Right column (~45%): 4:5 photographic feature slot via `MagazineCover`.
 *
 * Collapses to single-column under 960px; the photo moves above the text
 * so the visual hierarchy stays photographic-first.
 *
 * The italic emphasis on the title uses `em.em-gold` (CSS-scoped under
 * `[data-magazine]`) — Outlook-safe by accident: this component is web-
 * only, so background-clip on text is fine here.
 */
export function HeroSpread({
  clubName,
  showName,
  showSubtitle,
  trialStartDate,
  trialEndDate,
  venueCity,
  venueName,
  timezone,
  coverImageUrl,
  coverCaption,
  monogramLetters,
  trialChairName,
}: HeroSpreadProps) {
  const dateLabel = [
    trialStartDate ? formatShortDate(trialStartDate, timezone) : null,
    trialEndDate && trialEndDate !== trialStartDate
      ? formatShortDate(trialEndDate, timezone)
      : null,
  ]
    .filter(Boolean)
    .join(' – ');

  const venueLine = [venueName, venueCity].filter(Boolean).join(', ');

  return (
    <header
      className="mx-auto grid w-full max-w-[1280px] gap-10 px-6 py-12 md:grid-cols-[1.1fr_1fr] md:gap-16 md:px-16 md:py-20"
      style={{ borderBottom: '1px solid var(--mz-ink)' }}
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <span
            className="text-xs uppercase"
            style={{
              color: 'var(--mz-gold-3)',
              fontFamily: 'var(--mz-meta)',
              letterSpacing: '0.28em',
            }}
          >
            Feature · {clubName}
          </span>
          <span
            aria-hidden="true"
            className="hidden h-px flex-1 md:block"
            style={{ background: 'var(--mz-gold-rule)' }}
          />
        </div>

        <MagazineHeading level={1} italic={false}>
          {showName.split(' ').slice(0, -1).join(' ')}{' '}
          <em className="em-gold">{showName.split(' ').slice(-1)[0] ?? showName}</em>
        </MagazineHeading>

        <p
          className="max-w-lg italic"
          style={{
            color: 'var(--mz-quill)',
            fontFamily: 'var(--mz-display)',
            fontSize: 'clamp(18px, 2vw, 24px)',
            lineHeight: 1.4,
          }}
        >
          {showSubtitle}
        </p>

        <div
          className="flex flex-wrap items-center gap-4 pt-6 text-xs uppercase"
          style={{
            borderTop: '1px solid rgba(26,26,26,0.18)',
            color: 'var(--mz-mute)',
            fontFamily: 'var(--mz-meta)',
            letterSpacing: '0.28em',
          }}
        >
          {trialChairName && (
            <span>
              <strong style={{ color: 'var(--mz-ink)', fontWeight: 500 }}>By</strong>{' '}
              {trialChairName}
            </span>
          )}
          {dateLabel && (
            <>
              <span
                aria-hidden="true"
                className="h-1 w-1 rounded-full"
                style={{ background: 'var(--mz-gold-2)' }}
              />
              <span>{dateLabel}</span>
            </>
          )}
          {venueLine && (
            <>
              <span
                aria-hidden="true"
                className="h-1 w-1 rounded-full"
                style={{ background: 'var(--mz-gold-2)' }}
              />
              <span>{venueLine}</span>
            </>
          )}
        </div>
      </div>

      <MagazineCover
        imageUrl={coverImageUrl}
        alt={`${showName} cover photograph`}
        monogramLetters={monogramLetters}
        caption={coverCaption}
      />
    </header>
  );
}

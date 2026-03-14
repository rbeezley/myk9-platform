import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/shows/ShareButton';
import { ShowBrandedHero } from './ShowBrandedHero';
import { useScheduleSummary } from '@/hooks/queries/useScheduleSummary';
import { formatDateRange } from '@/utils/date-format';
import type { Show } from '@/types/show-types';

interface PublicShowViewProps {
  show: Show;
  onRegister: () => void;
}

function formatDayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function formatLevelRange(levels: string[]): string {
  if (levels.length <= 2) return levels.join(', ');
  return `${levels[0]}–${levels[levels.length - 1]}`;
}

const baseUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? window.location.origin;

export function PublicShowView({ show, onRegister }: PublicShowViewProps) {
  const { data: schedule } = useScheduleSummary(show.id);
  const dateRange = formatDateRange(show.startDate, show.endDate);

  const shareData = useMemo(
    () => ({
      title: `${show.name} — ${dateRange}`,
      text: `${show.organization ? `${show.organization} Dog Show` : 'Dog Show'} in ${show.location} · ${show.clubName}`,
      url: `${baseUrl}/shows/${show.id}`,
    }),
    [show.id, show.name, show.organization, show.location, show.clubName, dateRange]
  );

  const entryCloseFormatted = useMemo(
    () =>
      show.entryCloseDate
        ? new Date(show.entryCloseDate + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })
        : null,
    [show.entryCloseDate]
  );

  const detailItems = useMemo(
    () =>
      [
        show.chairman && { label: 'Chairman', value: show.chairman },
        show.secretary && { label: 'Secretary', value: show.secretary },
        show.chiefSteward && { label: 'Chief Steward', value: show.chiefSteward },
        show.dayOfShowFee && { label: 'Day-of-Show Fee', value: show.dayOfShowFee },
        show.maxEntriesPerDog && {
          label: 'Max Entries per Dog',
          value: String(show.maxEntriesPerDog),
        },
        show.maxTotalEntries && { label: 'Max Total Entries', value: String(show.maxTotalEntries) },
        show.allowNonOwnerHandlers != null && {
          label: 'Non-Owner Handlers',
          value: show.allowNonOwnerHandlers ? 'Allowed' : 'Not Allowed',
        },
      ].filter(Boolean) as { label: string; value: string }[],
    [
      show.chairman,
      show.secretary,
      show.chiefSteward,
      show.dayOfShowFee,
      show.maxEntriesPerDog,
      show.maxTotalEntries,
      show.allowNonOwnerHandlers,
    ]
  );

  return (
    <div className="max-w-3xl mx-auto min-h-screen">
      {/* Branded Hero */}
      <ShowBrandedHero
        showName={show.name}
        location={show.location}
        startDate={show.startDate}
        endDate={show.endDate}
        clubName={show.clubName}
        organization={show.organization}
        status={show.status}
        logo={show.logoUrl || null}
        coverImage={show.coverImageUrl || null}
        accentColor={show.accentColor || null}
      />
      {/* Share + org badges (moved outside hero) */}
      <div className="max-w-3xl mx-auto px-6 pt-4 flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          {show.organization && (
            <span className="text-xs font-semibold tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary">
              {show.organization}
            </span>
          )}
        </div>
        <ShareButton shareData={shareData} />
      </div>

      {/* Entry CTA */}
      {show.status !== 'draft' && show.status !== 'cancelled' && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-border">
          <div className="text-sm text-muted-foreground">
            Pre-entry fee: <strong className="text-foreground">{show.preEntryFee}</strong>
            {entryCloseFormatted && (
              <>
                {' '}
                · Entries close <strong className="text-foreground">{entryCloseFormatted}</strong>
              </>
            )}
          </div>
          {show.status === 'accepting_entries' && (
            <Button onClick={onRegister} size="lg">
              Register Now
            </Button>
          )}
          {show.status === 'closed' && (
            <span className="text-sm font-medium text-muted-foreground">Entries Closed</span>
          )}
        </div>
      )}

      {/* Schedule Summary */}
      {schedule && schedule.length > 0 && (
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-bold text-foreground mb-4">Schedule</h2>
          {schedule.map(day => (
            <div key={day.date} className="mb-5 last:mb-0">
              <div className="text-sm font-semibold text-primary mb-2 pb-1.5 border-b border-border">
                {formatDayDate(day.date)}
              </div>
              {day.disciplines.map(disc => (
                <div key={disc.name} className="flex justify-between items-baseline py-1.5 text-sm">
                  <span className="font-medium text-foreground">{disc.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {disc.name === 'Other'
                      ? disc.classNames.join(', ')
                      : [
                          disc.elements.length > 0 ? disc.elements.join(', ') : null,
                          disc.levels.length > 0 ? formatLevelRange(disc.levels) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Show Details */}
      {detailItems.length > 0 && (
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-bold text-foreground mb-4">Show Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {detailItems.map(item => (
              <div key={item.label}>
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {item.label}
                </div>
                <div className="text-sm text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-6 text-center text-xs text-muted-foreground">
        Powered by{' '}
        <Link to="/shows" className="text-primary hover:underline">
          myK9
        </Link>
        {' · '}
        <Link to="/shows" className="text-primary hover:underline">
          Browse more shows
        </Link>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/shows/ShareButton';
import { useScheduleSummary } from '@/hooks/queries/useScheduleSummary';
import { formatDateRange } from '@/utils/date-format';
import { getInitials } from '@/lib/utils';
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

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  accepting_entries: { label: 'Accepting Entries', className: 'bg-green-500/10 text-green-400' },
  published: { label: 'Coming Soon', className: 'bg-blue-500/10 text-blue-400' },
  closed: { label: 'Entries Closed', className: 'bg-yellow-500/10 text-yellow-400' },
  in_progress: { label: 'In Progress', className: 'bg-purple-500/10 text-purple-400' },
  completed: { label: 'Completed', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-red-500/10 text-red-400' },
};

const baseUrl = (import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? window.location.origin;

export function PublicShowView({ show, onRegister }: PublicShowViewProps) {
  const { data: schedule } = useScheduleSummary(show.id);
  const dateRange = formatDateRange(show.startDate, show.endDate);
  const statusInfo = STATUS_LABELS[show.status] ?? STATUS_LABELS.published;

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
      {/* Hero */}
      <div
        className="relative border-b border-border p-6 pb-5 overflow-hidden"
        style={{ borderLeft: `5px solid ${show.accentColor || '#14b8a6'}` }}
      >
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-2.5">
            {show.logoUrl ? (
              <img src={show.logoUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                {getInitials(show.clubName)}
              </div>
            )}
            <span className="text-sm text-muted-foreground">{show.clubName}</span>
          </div>
          <div className="flex items-center gap-2.5">
            {show.organization && (
              <span className="text-xs font-semibold tracking-wider px-3 py-1 rounded-full bg-primary/10 text-primary">
                {show.organization}
              </span>
            )}
            <ShareButton shareData={shareData} />
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-foreground mb-3 leading-tight">
          {show.name}
        </h1>
        <div className="flex flex-wrap gap-5 text-muted-foreground text-sm">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {dateRange}
          </span>
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {show.location}
          </span>
        </div>
        <span
          className={`inline-block mt-3 text-xs font-semibold px-3 py-1 rounded-full ${statusInfo.className}`}
        >
          {statusInfo.label}
        </span>
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

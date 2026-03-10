import { Calendar, MapPin, Building2 } from 'lucide-react';
import { getShowPlaceholder } from './show-card-placeholders';
import { generatePalette } from '../../lib/branding';

interface ShowBrandedHeroProps {
  showName: string;
  location: string;
  startDate: string;
  endDate: string;
  clubName: string;
  organization?: string;
  status?: string;
  logo?: string | null;
  coverImage?: string | null;
  accentColor?: string | null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(w => w.length > 0 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase())
    .slice(0, 2)
    .map(w => w[0])
    .join('');
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = startDate.toLocaleDateString('en-US', opts);
  if (start === end) return `${startStr}, ${startDate.getFullYear()}`;
  const endStr = endDate.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
  return `${startStr}–${endStr}`;
}

function statusLabel(status?: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    published: 'Published',
    accepting_entries: 'Accepting Entries',
    closed: 'Entries Closed',
    completed: 'Completed',
    cancelled: 'Cancelled',
  };
  return labels[status ?? ''] ?? status ?? '';
}

function statusColorClass(status?: string): string {
  switch (status) {
    case 'accepting_entries':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'published':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'draft':
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    case 'cancelled':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'completed':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
  }
}

export function ShowBrandedHero({
  showName,
  location,
  startDate,
  endDate,
  clubName,
  organization,
  status,
  logo,
  coverImage,
  accentColor,
}: ShowBrandedHeroProps) {
  const palette = accentColor ? generatePalette(accentColor) : null;
  const placeholder = getShowPlaceholder(organization, showName);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Accent color bar */}
      {palette && (
        <div
          data-testid="accent-bar"
          className="absolute left-0 right-0 top-0 z-10 h-[3px]"
          style={{ backgroundColor: palette.primary }}
        />
      )}

      {/* Cover area */}
      <div className="relative h-[180px] overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt="Show cover" className="h-full w-full object-cover" />
        ) : (
          <div
            data-testid="gradient-placeholder"
            className={`h-full w-full bg-gradient-to-br ${placeholder.gradient} ${placeholder.pattern}`}
          />
        )}
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />

        {/* Status badge */}
        {status && (
          <div className="absolute right-4 top-4">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusColorClass(status)}`}
            >
              {statusLabel(status)}
            </span>
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="relative bg-[#1a1a2e] px-6 pb-5 pt-10">
        {/* Floating logo */}
        <div className="absolute -top-8 left-6">
          {logo ? (
            <img
              src={logo}
              alt="Club logo"
              className="h-16 w-16 rounded-xl border-[3px] border-[#1a1a2e] object-cover shadow-lg"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl border-[3px] border-[#1a1a2e] shadow-lg"
              style={{
                backgroundColor: palette?.primaryDark ?? '#1e293b',
              }}
            >
              <span
                className="text-lg font-bold"
                style={{ color: palette?.onPrimary ?? '#94a3b8' }}
              >
                {getInitials(clubName)}
              </span>
            </div>
          )}
        </div>

        {/* Show details */}
        <h1 className="text-xl font-bold text-white">{showName}</h1>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-400">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            {location}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {formatDateRange(startDate, endDate)}
          </span>
          <span className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {clubName}
          </span>
        </div>
      </div>
    </div>
  );
}

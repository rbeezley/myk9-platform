/**
 * Show info inside the ringside menu (MYK9-1508): who to call or write, where
 * the venue is, and the weather. Tap targets only; the full show page, with the
 * venue map, stays one link away.
 */
import { CloudSun, Mail, MapPin } from 'lucide-react';
import { useShowOfficials, type ShowOfficial } from '@/hooks/queries/useShowOfficials';
import { buildVenueMapsUrls } from '@/utils/venueMaps';

const LINK_CLASS =
  'flex min-h-12 items-center gap-3 rounded-md px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function officialName(official: ShowOfficial): string {
  return `${official.firstName} ${official.lastName}`.trim() || 'Show official';
}

export function RingsideShowInfo({
  showId,
  location,
  isOnline,
}: {
  showId: string | undefined;
  location: string | null;
  isOnline: boolean;
}) {
  const { data: officials } = useShowOfficials(isOnline ? showId : undefined);
  const contacts = [
    ...(officials?.secretaries ?? []).map(person => ({ person, role: 'Secretary' })),
    ...(officials?.chairmen ?? []).map(person => ({ person, role: 'Chairman' })),
  ].filter(({ person }) => person.email);

  return (
    <div className="space-y-1 border-t border-border/50 pt-2" data-testid="ringside-show-info">
      {contacts.map(({ person, role }) => (
        <a
          key={`${role}-${person.personId}`}
          href={`mailto:${person.email}`}
          className={LINK_CLASS}
        >
          <Mail className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate font-medium">{officialName(person)}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {role} · {person.email}
            </span>
          </span>
        </a>
      ))}
      {!isOnline && contacts.length === 0 && (
        <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
          Secretary and chairman contacts need a connection.
        </p>
      )}
      {location && (
        <>
          <a
            href={buildVenueMapsUrls(location).viewOnMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            <MapPin className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium">{location}</span>
              <span className="block text-xs text-muted-foreground">Open in Maps</span>
            </span>
          </a>
          <a
            href={`https://www.google.com/search?q=${encodeURIComponent(`weather ${location}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_CLASS}
          >
            <CloudSun className="h-4 w-4 shrink-0" aria-hidden />
            Weather
          </a>
        </>
      )}
    </div>
  );
}

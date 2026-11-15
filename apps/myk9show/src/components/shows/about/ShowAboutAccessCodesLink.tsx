import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound } from 'lucide-react';
import { SHOW_DESK_TOOL_PARAM } from '@/features/actions/showToolActions';

const ACCESS_CODES_TOOL_ID = 'access-codes';

/** Show Desk with the Access codes panel open: the same `?tool=` link the Actions menu row uses. */
function getAccessCodesHref(showId: string): string {
  const params = new URLSearchParams({ [SHOW_DESK_TOOL_PARAM]: ACCESS_CODES_TOOL_ID });
  return `/shows/${encodeURIComponent(showId)}?${params.toString()}`;
}

/**
 * About's manager row for the access codes (MYK9-1987). A link, not a second copy: the codes and
 * Regenerate stay on Show Desk (MYK9-954). Hidden when "Judges score on devices" is explicitly off,
 * like the Actions entry (`hiddenShowDeskToolIds`); an unknown value keeps it.
 */
export function ShowAboutAccessCodesLink({
  showId,
  usesDeviceScoring,
}: {
  showId: string;
  usesDeviceScoring: boolean | undefined;
}) {
  if (usesDeviceScoring === false) return null;
  return (
    <Link
      to={getAccessCodesHref(showId)}
      className="flex min-h-11 items-center gap-3 rounded-lg border bg-card p-3 shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">Access codes</span>
        <span className="block text-sm text-muted-foreground">
          Codes for judges and ringside phones
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </Link>
  );
}

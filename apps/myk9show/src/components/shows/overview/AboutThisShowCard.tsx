import { useMemo } from 'react';
import { ChevronDown, Eye, Pencil } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ShowOfficials } from '@/components/shows/overview/ShowOfficials';
import { JudgesList } from '@/components/shows/overview/JudgesList';
import { ShareEvent } from '@/components/shows/overview/ShareEvent';
import { getShowPreviewHref } from '@/components/shows/showPreviewRoutes';
import { mergeSearchOnlyHref } from '@/features/actions/actionRegistry';
import type { ShowJudgeAssignment } from '@/types/judge-types';
import type { Show } from '@/types/show-types';

const baseUrl =
  (import.meta.env.VITE_PUBLIC_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : '');

/**
 * The show's facts on the secretary's home (MYK9-955): folded by default so
 * the schedule leads, one tap to venue, officials, judges and sharing. "Edit
 * show" opens the existing edit panel; "View as exhibitor" is the public
 * preview, which carries its own way back.
 */
export function AboutThisShowCard({
  show,
  judges,
}: {
  show: Show;
  judges?: ShowJudgeAssignment[] | undefined;
}) {
  const location = useLocation();
  const shareData = useMemo(
    () => ({
      title: show.name,
      text: `${show.organization ? `${show.organization} ` : ''}Dog Show in ${show.location} · ${show.clubName}`,
      url: `${baseUrl}/shows/${show.id}`,
    }),
    [show.id, show.name, show.organization, show.location, show.clubName]
  );

  return (
    <Collapsible className="rounded-xl border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        <CollapsibleTrigger className="group flex min-h-11 flex-1 items-center justify-start gap-2 py-2 text-left font-semibold hover:no-underline">
          <span aria-hidden="true" className="shrink-0">
            <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground transition-transform group-data-[panel-open]:rotate-0" />
          </span>
          About this show
          {show.location ? (
            <span className="truncate text-sm font-normal text-muted-foreground">
              · {show.location}
            </span>
          ) : null}
        </CollapsibleTrigger>
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-2">
          <Link to={mergeSearchOnlyHref('?edit=true', location.search)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit show
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="min-h-11 gap-2">
          <Link to={getShowPreviewHref(show.id, `${location.pathname}${location.search}`)}>
            <Eye className="h-4 w-4" aria-hidden="true" />
            View as exhibitor
          </Link>
        </Button>
      </div>
      <CollapsibleContent className="border-t">
        <div className="grid gap-6 p-4 md:grid-cols-3">
          <ShowOfficials showId={show.id} />
          <JudgesList judges={judges ?? show.assignedJudges} />
          <ShareEvent shareData={shareData} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

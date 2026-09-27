import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resolvePreviewReturnHref } from '@/components/shows/showPreviewRoutes';

interface PreviewExitBarProps {
  showId: string;
}

/**
 * The manager's way out of the show Preview (MYK9-856). Preview renders as a
 * full route swap to the public landing, not a dialog, so it had no exit
 * control at all: Escape did nothing, and a secretary on an installed PWA has
 * no browser chrome to fall back on. This bar is the fix — visible at every
 * width, wired to the button and to Escape, both landing back on the setup
 * step `returnTo` names (falling back to the show overview if it is missing
 * or fails validation).
 */
export function PreviewExitBar({ showId }: PreviewExitBarProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const exitHref =
    resolvePreviewReturnHref(searchParams.get('returnTo'), showId) ?? `/shows/${showId}`;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      navigate(exitHref);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exitHref, navigate]);

  return (
    <div className="sticky top-[var(--app-top-inset,3rem)] z-40 mb-4 w-full border-b bg-background px-4 py-2 shadow-sm sm:px-6">
      <Link
        to={exitHref}
        className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to setup
      </Link>
    </div>
  );
}

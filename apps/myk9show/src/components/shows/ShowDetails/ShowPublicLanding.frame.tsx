import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/** Opens the page at the top: a show opened from the Find Shows list must not inherit its scroll. */
export function useScrollToTopOnShow(showId: string): void {
  useEffect(() => {
    if (typeof window.scrollTo !== 'function') return;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      // jsdom and a few embedded webviews implement scrollTo as a throwing stub.
    }
  }, [showId]);
}

/** The one way back to Find Shows, kept quiet so the page still feels like the club's. */
export function AllShowsBar() {
  return (
    <nav aria-label="Show page" className="mx-auto w-full max-w-5xl px-4">
      <Link
        to="/shows"
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All shows
      </Link>
    </nav>
  );
}

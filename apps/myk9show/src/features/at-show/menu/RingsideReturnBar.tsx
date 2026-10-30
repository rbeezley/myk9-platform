/**
 * "Back to ringside" bar, shown on a ringside menu destination (MYK9-1508).
 *
 * It is the way back IN to the screen the menu was opened from, not an exit:
 * the Up control (MYK9-1500) stays the only way out of ringside.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { currentHistoryIdx, isRingsidePath, useRingsideReturnStore } from './ringsideReturnStore';

export function RingsideReturnBar() {
  const target = useRingsideReturnStore(s => s.target);
  const clear = useRingsideReturnStore(s => s.clear);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const atRingside = isRingsidePath(pathname);

  // Back in ringside: the trip is over.
  useEffect(() => {
    if (atRingside && target) clear();
  }, [atRingside, target, clear]);

  if (!target || atRingside) return null;
  if (pathname !== target.scope && !pathname.startsWith(`${target.scope}/`)) return null;

  const goBack = () => {
    const delta = currentHistoryIdx() - target.originIdx;
    clear();
    if (delta > 0) navigate(-delta);
    else navigate(target.returnTo);
  };

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-card px-3 py-1">
      <button
        type="button"
        onClick={goBack}
        className="inline-flex min-h-12 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to ringside
      </button>
    </div>
  );
}

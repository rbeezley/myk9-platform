import { lazy, Suspense } from 'react';

import { LoadingSkeleton } from '@/components/common/LoadingSkeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const ResultsControlPage = lazy(() => import('@/pages/secretary/ResultsControlPage'));

/**
 * "Visibility settings" (MYK9-1031): the existing result-visibility defaults and per-trial and
 * per-class overrides, mounted as they are on `ResultsControlPage` rather than rebuilt. Mounted
 * only while open, so the page's queries do not run for a secretary who never opens it.
 */
export function ResultsVisibilitySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle>Visibility settings</SheetTitle>
          <SheetDescription>
            Who can see placements, qualifications, times and faults, and when.
          </SheetDescription>
        </SheetHeader>
        {open && (
          <div className="mt-4">
            <Suspense fallback={<LoadingSkeleton variant="cards" count={2} />}>
              <ResultsControlPage embedded />
            </Suspense>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

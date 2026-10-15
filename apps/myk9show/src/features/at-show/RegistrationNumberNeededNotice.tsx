import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * MYK9-1162: shown in place of the live scoresheet for an entry awaiting a
 * registration number. The dog keeps its run-order place; only scoring is
 * locked until the secretary adds the number. The server refuses the write too.
 */
export function RegistrationNumberNeededNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="ringside-root container max-w-2xl mx-auto px-4 py-6">
      <div role="alert" className="rounded-xl border bg-card p-6 text-center">
        <ShieldAlert className="h-12 w-12 text-warning mx-auto mb-4" aria-hidden />
        <p className="text-lg font-medium">Registration number needed</p>
        <p className="text-muted-foreground">See the secretary</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Entry List
        </Button>
      </div>
    </div>
  );
}

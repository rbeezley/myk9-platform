import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * A tab was opened on a class it cannot show (a stale id, a class outside its scope). It says so
 * and selects nothing: quietly opening a different class is how the wrong class gets changed on
 * show day (MYK9-1996).
 */
export function CarriedClassNotice({ className, name }: { className?: string; name?: string }) {
  return (
    <Alert className={className} data-testid="carried-class-notice">
      <AlertDescription>
        {name ?? 'That class'} isn&apos;t shown here. Pick a class.
      </AlertDescription>
    </Alert>
  );
}

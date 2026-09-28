import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export function CartFeeQuoteUnavailable({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
      <Alert variant="destructive" role="alert">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          {message} We cannot show or charge an unconfirmed amount.
        </AlertDescription>
      </Alert>
      <div className="flex gap-3">
        <Button onClick={onRetry} size="touch">
          Try again
        </Button>
        <Button onClick={onBack} variant="outline" size="touch">
          Back to show
        </Button>
      </div>
    </div>
  );
}

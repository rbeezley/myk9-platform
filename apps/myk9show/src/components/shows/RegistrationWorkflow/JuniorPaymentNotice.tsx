import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function JuniorPaymentNotice({
  showId,
  feePending,
}: {
  showId: string;
  feePending: boolean;
}) {
  return (
    <Alert>
      <Info className="h-4 w-4" />
      <AlertDescription>
        {feePending ? 'Sync this entry to confirm its fee. ' : 'The entry fee is confirmed. '}
        Collect payment after confirmation, then{' '}
        <Link to={`/shows/${showId}/entries`} className="underline font-medium">
          record it in Entries Management
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}

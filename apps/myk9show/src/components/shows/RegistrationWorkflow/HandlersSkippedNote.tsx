import React from 'react';
import { UserCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * MYK9-2020: said on Classes, the step before, when Next will go past Handlers
 * because every dog is handled by its owner (`canSkipHandlerStep`).
 */
export const HandlersSkippedNote: React.FC = () => (
  <Alert className="mt-4">
    <UserCheck className="h-4 w-4" />
    <AlertDescription>
      Each dog is handled by its owner, so Next goes straight to Payment. To change a handler, press
      Back on Payment.
    </AlertDescription>
  </Alert>
);

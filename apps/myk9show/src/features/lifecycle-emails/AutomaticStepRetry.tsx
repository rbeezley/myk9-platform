import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { retryAutomaticLifecycleEmails, type LifecycleEmailFunctionsClient } from './api';

interface AutomaticStepRetryProps {
  showId: string;
  failedCount: number;
}

/**
 * An automatic email that the provider refused three times stays failed. This is the one way
 * to try again: the server queues them and its next run sends them (MYK9-2124).
 */
export function AutomaticStepRetry({ showId, failedCount }: AutomaticStepRetryProps) {
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () =>
      retryAutomaticLifecycleEmails({
        supabase: supabase as unknown as LifecycleEmailFunctionsClient,
        showId,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['show-lifecycle-emails', showId] }),
    retry: false,
  });

  if (failedCount <= 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs text-amber-900">
        {failedCount === 1
          ? '1 email could not be sent.'
          : `${failedCount} emails could not be sent.`}
      </p>
      {retry.isError ? (
        <p role="alert" className="text-xs text-amber-900">
          Could not send again. Nothing was lost; try again.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 w-full"
        disabled={retry.isPending}
        onClick={() => retry.mutate()}
      >
        {retry.isPending ? 'Sending...' : 'Send again'}
      </Button>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { cacheStrategies } from '@/lib/queryClient';
import {
  getVisibilitySettings,
  visibilityKeys,
} from '@/services/database/visibility';
export {
  getDefaultShowSettings,
  visibilityKeys,
  type ClassVisibilityRow,
  type OverrideRow,
  type ShowVisibilityRow,
  type TrialVisibilityRow,
  type VisibilityData,
} from '@/services/database/visibility';

export function useVisibilitySettings(showId: string | undefined) {
  return useQuery({
    queryKey: visibilityKeys.show(showId ?? ''),
    queryFn: () => getVisibilitySettings(showId!),
    enabled: !!showId,
    ...cacheStrategies.moderate,
  });
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase-client';
import {
  buildMessageShowClassLabel,
  type MessageShowClassOption,
} from '@/features/show-workbench/messageShow';

interface UseMessageShowClassOptionsOptions {
  enabled?: boolean;
}

export function useMessageShowClassOptions(
  showId: string | null | undefined,
  options: UseMessageShowClassOptionsOptions = {}
) {
  return useQuery<MessageShowClassOption[]>({
    queryKey: ['show-classes-for-messages', showId],
    queryFn: async () => {
      if (!showId) return [];

      const { data } = await supabase
        .from('classes')
        .select('id, class_number, name, element, level, section, trials!inner(show_id)')
        .eq('trials.show_id' as string, showId)
        .order('class_number');

      return Promise.all(
        (data ?? []).map(async cls => {
          const { count } = await supabase
            .from('entries')
            .select('id', { count: 'exact', head: true })
            .eq('class_id', cls.id)
            .is('deleted_at', null);

          return {
            id: cls.id,
            label: buildMessageShowClassLabel({
              name: cls.name,
              element: cls.element,
              level: cls.level,
              section: cls.section,
            }),
            entryCount: count ?? 0,
          };
        })
      );
    },
    enabled: !!showId && (options.enabled ?? true),
  });
}

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

      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('id, class_number, name, element, level, section, trials!inner(show_id)')
        .eq('trials.show_id' as string, showId)
        .order('class_number');

      if (classesError) throw classesError;
      if (!classes?.length) return [];

      const { data: entryCounts, error: entryCountsError } = await supabase.rpc(
        'get_message_class_entry_counts',
        {
          p_class_ids: classes.map(cls => cls.id),
        }
      );

      if (entryCountsError) throw entryCountsError;

      const entryCountsByClass = new Map<string, number>();
      for (const row of entryCounts ?? []) {
        entryCountsByClass.set(row.class_id, Number(row.entry_count));
      }

      return classes.map(cls => ({
        id: cls.id,
        label: buildMessageShowClassLabel({
          name: cls.name,
          element: cls.element,
          level: cls.level,
          section: cls.section,
        }),
        entryCount: entryCountsByClass.get(cls.id) ?? 0,
      }));
    },
    enabled: !!showId && (options.enabled ?? true),
  });
}

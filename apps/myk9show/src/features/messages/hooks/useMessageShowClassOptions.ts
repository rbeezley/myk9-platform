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

      const classIds = classes.map(cls => cls.id);
      const { data: entries, error: entriesError } = await supabase
        .from('entries')
        .select('class_id')
        .in('class_id', classIds)
        .is('deleted_at', null);

      if (entriesError) throw entriesError;

      const entryCounts = new Map<string, number>();
      for (const entry of entries ?? []) {
        if (!entry.class_id) continue;
        entryCounts.set(entry.class_id, (entryCounts.get(entry.class_id) ?? 0) + 1);
      }

      return classes.map(cls => ({
        id: cls.id,
        label: buildMessageShowClassLabel({
          name: cls.name,
          element: cls.element,
          level: cls.level,
          section: cls.section,
        }),
        entryCount: entryCounts.get(cls.id) ?? 0,
      }));
    },
    enabled: !!showId && (options.enabled ?? true),
  });
}

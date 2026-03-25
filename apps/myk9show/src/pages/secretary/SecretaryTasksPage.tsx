/**
 * Secretary Tasks Page — Kanban board for day-of task management.
 * Persists tasks to localStorage per show.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PageShell } from '@/components/common/PageShell';
import { KanbanBoard } from '@/components/secretary/kanban';
import { supabase } from '@/services/database/supabaseClient';
import { useAuthContext } from '@/hooks/useAuthContext';

function useSecretaryShows() {
  const { user } = useAuthContext();
  return useQuery({
    queryKey: ['secretary', 'shows', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shows')
        .select('id, name, start_date')
        .is('deleted_at', null)
        .order('start_date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export default function SecretaryTasksPage() {
  const { data: shows = [], isLoading } = useSecretaryShows();
  const [selectedShowId, setSelectedShowId] = useState<string | undefined>();

  // Auto-select first show
  const showId = selectedShowId || shows[0]?.id;

  return (
    <PageShell>
      <h1 className="mb-4 text-xl font-semibold">Tasks</h1>

      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-muted-foreground">Show:</label>
        {isLoading ? (
          <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        ) : (
          <Select value={showId || ''} onValueChange={setSelectedShowId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select a show" />
            </SelectTrigger>
            <SelectContent>
              {shows.map(show => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {showId ? (
        <KanbanBoard showId={showId} />
      ) : (
        <div className="py-12 text-center text-muted-foreground">
          <p>Select a show to manage tasks.</p>
        </div>
      )}
    </PageShell>
  );
}

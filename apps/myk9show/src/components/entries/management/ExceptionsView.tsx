import { useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MoveUpRequestsTab } from '@/components/entries/MoveUpRequestsTab';
import { PullManagementTab } from '@/components/entries/PullManagementTab';
import { isExceptionQueue, type ExceptionQueue } from './entryManagementFilters';

interface ExceptionsViewProps {
  showId: string;
  /** Reload entries after a move-up / pull is processed. */
  onRefresh: () => void;
}

/**
 * Exceptions surface for the Entry Management page.
 *
 * Hosts the two exception queues — move-up requests and pulls / no-shows — that
 * used to masquerade as `attention` filter chips (each silently swapped the
 * whole content pane). Phase C lifts them onto their own top-level "Exceptions"
 * tab so the surface-swap reads as an intentional navigation, not a filter. The
 * sub-switch below picks which queue and syncs to `?queue=` (`move-ups` is the
 * default and stays out of the URL; `pulled` is explicit).
 */
export function ExceptionsView({ showId, onRefresh }: ExceptionsViewProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawQueue = searchParams.get('queue');
  const queue: ExceptionQueue = isExceptionQueue(rawQueue) ? rawQueue : 'move-ups';

  const setQueue = (next: string) => {
    setSearchParams(
      prev => {
        const params = new URLSearchParams(prev);
        if (next === 'move-ups') params.delete('queue');
        else params.set('queue', next);
        return params;
      },
      { replace: true }
    );
  };

  return (
    <Tabs value={queue} onValueChange={setQueue} className="space-y-4">
      <TabsList>
        <TabsTrigger value="move-ups">Move-ups</TabsTrigger>
        <TabsTrigger value="pulled">Pulls</TabsTrigger>
      </TabsList>

      <TabsContent value="move-ups">
        <Card>
          <CardContent className="pt-6">
            <MoveUpRequestsTab showId={showId} onRefresh={onRefresh} />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="pulled">
        <Card>
          <CardContent className="pt-6">
            <PullManagementTab showId={showId} onRefresh={onRefresh} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

export default ExceptionsView;

/**
 * Day-of Operations Page
 *
 * Secretary page for managing day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-ups
 * - Pulled entries
 */

import { useMemo, useState } from 'react';
import { useUrlTab } from '@/hooks/useUrlTab';
import { formatDate } from '@/utils/entryManagementUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TabsContent } from '@/components/ui/tabs';
import { PrimaryTabs, type PrimaryTabDef } from '@/components/common/PrimaryTabs';
import { UserPlus, ArrowUpCircle, XCircle, RefreshCw, UserCheck, GitBranch } from 'lucide-react';

const DAY_OF_OPS_TABS: PrimaryTabDef[] = [
  { id: 'pipeline', label: 'Pipeline', icon: GitBranch },
  { id: 'entries', label: 'Day of Show Entries', icon: UserPlus },
  { id: 'moveups', label: 'Move-Ups', icon: ArrowUpCircle },
  { id: 'scratches', label: 'Pulled', icon: XCircle },
  { id: 'check-in', label: 'Check-In', icon: UserCheck },
];
import { PipelineTab } from './PipelineTab';

import CheckInReportPage from '../CheckInReportPage';

import { useDayOfOperationsData } from './useDayOfOperationsData';
import { ClassAvailabilityTable } from './ClassAvailabilityTable';
import { MoveUpEntriesTable } from './MoveUpEntriesTable';
import { PullEntriesTable } from './PullEntriesTable';
import { DayOfEntryDialog } from './DayOfEntryDialog';
import { PullDialog } from './PullDialog';
import { MoveUpDialog } from './MoveUpDialog';
import { updateReplicatedDayOfScratch } from '@/services/show-day/checkInStatus';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/utils/errorMessages';
import type { DayOfOperationEntry, PullableEntry } from './types';

export default function DayOfOperationsPage() {
  const {
    userId,
    shows,
    selectedShowId,
    setSelectedShowId,
    isLoading,
    classes,
    pullableEntries,
    moveUpEntries,
    loadData,
  } = useDayOfOperationsData();

  const [activeTab, handleTabChange] = useUrlTab(
    ['pipeline', 'entries', 'moveups', 'scratches', 'check-in'] as const,
    'pipeline'
  );

  const [isPullingDirect, setIsPullingDirect] = useState(false);

  // Dialog state
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [showPullDialog, setShowPullDialog] = useState(false);
  const [showMoveUpDialog, setShowMoveUpDialog] = useState(false);
  const [entryToPull, setEntryToPull] = useState<PullableEntry | null>(null);
  const [entryToMoveUp, setEntryToMoveUp] = useState<DayOfOperationEntry | null>(null);

  const handlePullClick = (entry: PullableEntry) => {
    setEntryToPull(entry);
    setShowPullDialog(true);
  };

  const handlePullDirect = async (entry: PullableEntry) => {
    if (isPullingDirect) return;
    setIsPullingDirect(true);
    try {
      await updateReplicatedDayOfScratch(entry.id, 'Marked pulled from Day of Show');
      toast.success('Entry pulled');
      loadData();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsPullingDirect(false);
    }
  };

  const handleMoveUpClick = (entry: DayOfOperationEntry) => {
    setEntryToMoveUp(entry);
    setShowMoveUpDialog(true);
  };

  const handleDialogSuccess = () => {
    loadData();
  };

  const selectedShowLabel = useMemo(() => {
    const show = shows.find(s => s.id === selectedShowId);
    if (!show) return null;
    return show.name + (show.start_date ? ` (${formatDate(show.start_date)})` : '');
  }, [shows, selectedShowId]);

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Day of Show</h1>
          <p className="text-muted-foreground">Manage walk-in entries, move-ups, and pulled entries</p>
        </div>
        <Button onClick={loadData} variant="outline" disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Show</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedShowId} onValueChange={setSelectedShowId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Select a show">{selectedShowLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {shows.map(show => (
                <SelectItem key={show.id} value={show.id}>
                  {show.name}
                  {show.start_date && ` (${formatDate(show.start_date)})`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedShowId && (
        <PrimaryTabs
          tabs={DAY_OF_OPS_TABS}
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-4"
        >

          <TabsContent value="pipeline">
            <PipelineTab showId={selectedShowId} />
          </TabsContent>

          <TabsContent value="entries" className="space-y-4">
            <ClassAvailabilityTable classes={classes} onAddEntry={() => setShowEntryDialog(true)} />
          </TabsContent>

          <TabsContent value="moveups" className="space-y-4">
            <MoveUpEntriesTable entries={moveUpEntries} onMoveUp={handleMoveUpClick} />
          </TabsContent>

          <TabsContent value="scratches" className="space-y-4">
            <PullEntriesTable
              entries={pullableEntries}
              onPull={handlePullClick}
              onPullDirect={handlePullDirect}
            />
          </TabsContent>

          <TabsContent value="check-in">
            <CheckInReportPage showId={selectedShowId} />
          </TabsContent>
        </PrimaryTabs>
      )}

      <DayOfEntryDialog
        open={showEntryDialog}
        onOpenChange={setShowEntryDialog}
        showId={selectedShowId}
        userId={userId}
        classes={classes}
        onSuccess={handleDialogSuccess}
      />

      <PullDialog
        open={showPullDialog}
        onOpenChange={setShowPullDialog}
        entry={entryToPull}
        onSuccess={handleDialogSuccess}
      />

      <MoveUpDialog
        open={showMoveUpDialog}
        onOpenChange={setShowMoveUpDialog}
        entry={entryToMoveUp}
        classes={classes}
        onSuccess={handleDialogSuccess}
      />
    </div>
  );
}

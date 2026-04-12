/**
 * Day-of Operations Page
 *
 * Secretary page for managing day-of-show operations:
 * - Day-of entries (walk-in registrations)
 * - Move-ups
 * - Scratches
 */

import { useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserPlus, ArrowUpCircle, XCircle, RefreshCw, UserCheck } from 'lucide-react';

import CheckInReportPage from '../CheckInReportPage';

import { useDayOfOperationsData } from './useDayOfOperationsData';
import { ClassAvailabilityTable } from './ClassAvailabilityTable';
import { MoveUpEntriesTable } from './MoveUpEntriesTable';
import { ScratchEntriesTable } from './ScratchEntriesTable';
import { DayOfEntryDialog } from './DayOfEntryDialog';
import { ScratchDialog } from './ScratchDialog';
import { MoveUpDialog } from './MoveUpDialog';
import { scratchEntry } from '@/services/database/queries/dayOfOperationsQueries';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/utils/errorMessages';
import type { ScratchableEntry } from './types';

export default function DayOfOperationsPage() {
  const {
    userId,
    shows,
    selectedShowId,
    setSelectedShowId,
    isLoading,
    classes,
    scratchableEntries,
    moveUpEntries,
    loadData,
  } = useDayOfOperationsData();

  const [activeTab, handleTabChange] = useUrlTab(
    ['entries', 'moveups', 'scratches', 'check-in'] as const,
    'entries'
  );

  const [isScratchingDirect, setIsScratchingDirect] = useState(false);

  // Dialog state
  const [showEntryDialog, setShowEntryDialog] = useState(false);
  const [showScratchDialog, setShowScratchDialog] = useState(false);
  const [showMoveUpDialog, setShowMoveUpDialog] = useState(false);
  const [entryToScratch, setEntryToScratch] = useState<ScratchableEntry | null>(null);
  const [entryToMoveUp, setEntryToMoveUp] = useState<ScratchableEntry | null>(null);

  const handleScratchClick = (entry: ScratchableEntry) => {
    setEntryToScratch(entry);
    setShowScratchDialog(true);
  };

  const handleScratchDirect = async (entry: ScratchableEntry) => {
    if (isScratchingDirect) return;
    setIsScratchingDirect(true);
    try {
      const { error } = await scratchEntry(entry.id, undefined);
      if (error) {
        toast.error(getUserFriendlyError(error));
      } else {
        toast.success('Entry scratched');
        loadData();
      }
    } finally {
      setIsScratchingDirect(false);
    }
  };

  const handleMoveUpClick = (entry: ScratchableEntry) => {
    setEntryToMoveUp(entry);
    setShowMoveUpDialog(true);
  };

  const handleDialogSuccess = () => {
    loadData();
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Day-of Operations</h1>
          <p className="text-muted-foreground">Manage walk-in entries, move-ups, and scratches</p>
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
              <SelectValue placeholder="Select a show" />
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
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
          <TabsList>
            <TabsTrigger value="entries" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Day-of Entries
            </TabsTrigger>
            <TabsTrigger value="moveups" className="flex items-center gap-2">
              <ArrowUpCircle className="h-4 w-4" />
              Move-Ups
            </TabsTrigger>
            <TabsTrigger value="scratches" className="flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Scratches
            </TabsTrigger>
            <TabsTrigger value="check-in" className="flex items-center gap-2">
              <UserCheck className="h-4 w-4" />
              Check-In
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entries" className="space-y-4">
            <ClassAvailabilityTable classes={classes} onAddEntry={() => setShowEntryDialog(true)} />
          </TabsContent>

          <TabsContent value="moveups" className="space-y-4">
            <MoveUpEntriesTable entries={moveUpEntries} onMoveUp={handleMoveUpClick} />
          </TabsContent>

          <TabsContent value="scratches" className="space-y-4">
            <ScratchEntriesTable
              entries={scratchableEntries}
              onScratch={handleScratchClick}
              onScratchDirect={handleScratchDirect}
            />
          </TabsContent>

          <TabsContent value="check-in">
            <CheckInReportPage showId={selectedShowId} />
          </TabsContent>
        </Tabs>
      )}

      <DayOfEntryDialog
        open={showEntryDialog}
        onOpenChange={setShowEntryDialog}
        showId={selectedShowId}
        userId={userId}
        classes={classes}
        onSuccess={handleDialogSuccess}
      />

      <ScratchDialog
        open={showScratchDialog}
        onOpenChange={setShowScratchDialog}
        entry={entryToScratch}
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

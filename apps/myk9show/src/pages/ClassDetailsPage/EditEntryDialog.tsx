/**
 * Edit Entry Dialog
 *
 * Combined handler and results editing dialog
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ShowEntry } from './types';

interface Dog {
  id: string;
  name: string;
  callName?: string;
}

interface EditEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string | null;
  rawEntries: unknown[];
  dogs: Dog[];
  onSave: (data: Record<string, unknown>) => void;
}

export function EditEntryDialog({
  open,
  onOpenChange,
  entryId,
  rawEntries,
  dogs,
  onSave,
}: EditEntryDialogProps) {
  const entry = entryId
    ? (rawEntries.find((e) => (e as ShowEntry).id === entryId) as ShowEntry | undefined)
    : undefined;
  const dog = entry ? dogs.find((d) => d.id === entry.dogId) : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Entry & Results</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-4">
          {!entry ? (
            <div>Entry not found</div>
          ) : (
            <div className="space-y-4">
              {/* Entry Info Header */}
              <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                <div>
                  <h3 className="font-semibold">
                    {dog?.callName || dog?.name || 'Unknown Dog'}
                  </h3>
                  <p className="text-sm text-muted-foreground">Entry ID: {entry.id}</p>
                </div>
              </div>

              {/* Handler Information */}
              <div className="space-y-3">
                <h4 className="font-medium">Handler Information</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Handler Name</label>
                    <input
                      type="text"
                      defaultValue={entry.registrationData?.handler || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="Handler name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Armband</label>
                    <input
                      type="text"
                      defaultValue={entry.registrationData?.armband || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="A101"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Special Requests</label>
                  <textarea
                    defaultValue={entry.registrationData?.specialRequests || ''}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    placeholder="Any special requests or notes"
                  />
                </div>
              </div>

              {/* Results Section */}
              <div className="space-y-3">
                <h4 className="font-medium">Competition Results</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Score</label>
                    <input
                      type="text"
                      defaultValue={entry.competitionData?.score || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="85"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Time</label>
                    <input
                      type="text"
                      defaultValue={entry.competitionData?.time || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="2:45"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Placement</label>
                    <input
                      type="text"
                      defaultValue={entry.competitionData?.placement || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Status</label>
                    <select
                      defaultValue={entry.competitionData?.qualified ? 'Qualified' : 'Not Qualified'}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="Qualified">Qualified</option>
                      <option value="Not Qualified">Not Qualified</option>
                      <option value="Withdrawn">Withdrawn</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Judge Notes</label>
                  <textarea
                    defaultValue={entry.competitionData?.judgeNotes || ''}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    placeholder="Judge comments or notes"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave({})}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

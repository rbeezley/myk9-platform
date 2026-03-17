/**
 * Edit Entry Dialog
 *
 * Combined handler and results editing dialog
 */

import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/common/FormField';
import type { ShowEntry } from './types';

interface Dog {
  id: string;
  name: string;
  callName?: string | undefined;
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
  const formRef = useRef<HTMLFormElement>(null);

  const entry = entryId
    ? (rawEntries.find((e) => (e as ShowEntry).id === entryId) as ShowEntry | undefined)
    : undefined;
  const dog = entry ? dogs.find((d) => d.id === entry.dogId) : undefined;

  const handleSave = () => {
    if (!formRef.current || !entry) return;

    const formData = new FormData(formRef.current);
    const data: Record<string, unknown> = {
      registrationData: {
        handler: formData.get('handler') as string,
        armband: formData.get('armband') as string,
        specialRequests: formData.get('specialRequests') as string,
      },
      competitionData: {
        score: formData.get('score') as string,
        time: formData.get('time') as string,
        placement: formData.get('placement') as string,
        qualified: (formData.get('status') as string) === 'Qualified',
        qualification: formData.get('status') as string,
        judgeNotes: formData.get('judgeNotes') as string,
      },
    };
    onSave(data);
  };

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
            <form ref={formRef} className="space-y-4">
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
                  <FormField label="Handler Name" fieldId="handler">
                    <input
                      type="text"
                      id="handler"
                      name="handler"
                      defaultValue={entry.registrationData?.handler || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="Handler name"
                    />
                  </FormField>
                  <FormField label="Armband" fieldId="armband">
                    <input
                      type="text"
                      id="armband"
                      name="armband"
                      defaultValue={entry.registrationData?.armband || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="A101"
                    />
                  </FormField>
                </div>
                <FormField label="Special Requests" fieldId="specialRequests">
                  <textarea
                    id="specialRequests"
                    name="specialRequests"
                    defaultValue={entry.registrationData?.specialRequests || ''}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    placeholder="Any special requests or notes"
                  />
                </FormField>
              </div>

              {/* Results Section */}
              <div className="space-y-3">
                <h4 className="font-medium">Competition Results</h4>
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Score" fieldId="score">
                    <input
                      type="text"
                      id="score"
                      name="score"
                      defaultValue={entry.competitionData?.score || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="85"
                    />
                  </FormField>
                  <FormField label="Time" fieldId="time">
                    <input
                      type="text"
                      id="time"
                      name="time"
                      defaultValue={entry.competitionData?.time || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="2:45"
                    />
                  </FormField>
                  <FormField label="Placement" fieldId="placement">
                    <input
                      type="text"
                      id="placement"
                      name="placement"
                      defaultValue={entry.competitionData?.placement || ''}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                      placeholder="1"
                    />
                  </FormField>
                  <FormField label="Status" fieldId="status">
                    <select
                      id="status"
                      name="status"
                      defaultValue={entry.competitionData?.qualified ? 'Qualified' : 'Not Qualified'}
                      className="w-full px-3 py-2 border rounded-md text-sm"
                    >
                      <option value="Qualified">Qualified</option>
                      <option value="Not Qualified">Not Qualified</option>
                      <option value="Withdrawn">Withdrawn</option>
                      <option value="Absent">Absent</option>
                    </select>
                  </FormField>
                </div>
                <FormField label="Judge Notes" fieldId="judgeNotes">
                  <textarea
                    id="judgeNotes"
                    name="judgeNotes"
                    defaultValue={entry.competitionData?.judgeNotes || ''}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    rows={2}
                    placeholder="Judge comments or notes"
                  />
                </FormField>
              </div>
            </form>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/common/FormField';
import type { DogStatus } from '@/types/dog-types';

interface DogStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dogName: string;
  currentStatus: DogStatus;
  currentDeceasedDate?: string | undefined;
  onSave: (status: DogStatus, deceasedDate?: string) => void;
}

/** Inner form that mounts fresh each time the dialog opens */
function StatusForm({
  dogName,
  currentStatus,
  currentDeceasedDate,
  onSave,
  onCancel,
}: {
  dogName: string;
  currentStatus: DogStatus;
  currentDeceasedDate?: string | undefined;
  onSave: (status: DogStatus, deceasedDate?: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<DogStatus>(currentStatus);
  const [deceasedDate, setDeceasedDate] = useState(currentDeceasedDate || '');

  const handleSave = () => {
    onSave(status, status === 'deceased' ? deceasedDate || undefined : undefined);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Change Status</DialogTitle>
        <DialogDescription>
          Update {dogName}&apos;s status. This preserves all records and competition history.
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-6">
        <RadioGroup value={status} onValueChange={val => setStatus(val as DogStatus)}>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="active" id="status-active" />
            <Label htmlFor="status-active" className="cursor-pointer">
              <span className="font-medium">Active</span>
              <p className="text-sm text-muted-foreground">
                Currently showing and eligible for entries
              </p>
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="retired" id="status-retired" />
            <Label htmlFor="status-retired" className="cursor-pointer">
              <span className="font-medium">Retired</span>
              <p className="text-sm text-muted-foreground">
                No longer showing but records are preserved
              </p>
            </Label>
          </div>
          <div className="flex items-center space-x-3">
            <RadioGroupItem value="deceased" id="status-deceased" />
            <Label htmlFor="status-deceased" className="cursor-pointer">
              <span className="font-medium">Deceased</span>
              <p className="text-sm text-muted-foreground">
                Preserves {dogName}&apos;s records and competition history
              </p>
            </Label>
          </div>
        </RadioGroup>

        {status === 'deceased' && (
          <div className="pl-7">
            <FormField label="Date of Passing" fieldId="deceased-date">
              <Input
                id="deceased-date"
                type="date"
                value={deceasedDate}
                onChange={e => setDeceasedDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
            </FormField>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogFooter>
    </>
  );
}

const DogStatusDialog: React.FC<DogStatusDialogProps> = ({
  open,
  onOpenChange,
  dogName,
  currentStatus,
  currentDeceasedDate,
  onSave,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        {open && (
          <StatusForm
            dogName={dogName}
            currentStatus={currentStatus}
            currentDeceasedDate={currentDeceasedDate}
            onSave={(status, deceasedDate) => {
              onSave(status, deceasedDate);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DogStatusDialog;

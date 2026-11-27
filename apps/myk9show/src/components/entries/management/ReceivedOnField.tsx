import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ReceivedOnFieldProps {
  id: string;
  value: string;
  /** Today on the show's calendar: the latest day money can have arrived. */
  max: string;
  onChange: (value: string) => void;
}

/**
 * MYK9-677: the day the money was received, on the show's calendar. Defaults
 * to today; a check that arrived by mail weeks ago keeps its real day, so the
 * closeout card does not count it as desk money.
 */
export const ReceivedOnField: React.FC<ReceivedOnFieldProps> = ({ id, value, max, onChange }) => (
  <div className="space-y-1">
    <Label htmlFor={id}>Received on</Label>
    <Input id={id} type="date" value={value} max={max} onChange={e => onChange(e.target.value)} />
  </div>
);

/**
 * AreaCountSelectionDialog — choose the number of search areas for a
 * flexible-area class (MYK9-1625).
 *
 * Saving writes through the class replica, so the count applies on this device at
 * once and queues for upload when offline. The scoresheet and Max Time read it from
 * the class. It can be dismissed (prompt, don't block); the class menu reopens it.
 */
import { useState } from 'react';
import type React from 'react';
import type { AreaCountSelectionDialogProps } from '@myk9/ringside';
import { Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { replicatedClassesTable } from '@/services/replication';
import { ClassDialogShell } from './ClassDialogShell';

export const AreaCountSelectionDialog: React.FC<AreaCountSelectionDialogProps> = ({
  isOpen,
  onClose,
  classData,
  areaCountRequirements,
  onSave,
}) => {
  const [savingCount, setSavingCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!isOpen) return null;

  const counts: number[] = [];
  for (let n = areaCountRequirements.min; n <= areaCountRequirements.max; n++) {
    counts.push(n);
  }

  const choose = async (count: number) => {
    setError(null);
    setSavingCount(count);
    try {
      await replicatedClassesTable.updateClass(classData.id, { areaCount: count });
      onSave(count);
    } catch {
      setError("Couldn't save the area count on this device. Try again.");
    } finally {
      setSavingCount(null);
    }
  };

  return (
    <ClassDialogShell
      icon={Layers}
      eyebrow="Select areas"
      className={classData.class_name}
      onClose={onClose}
      closeLabel="Not now"
    >
      <p className="text-sm text-muted-foreground">
        Choose between {areaCountRequirements.min} and {areaCountRequirements.max} search areas for
        this class. The scoresheet needs the count.
      </p>
      {counts.map(count => (
        <Button
          key={count}
          variant="outline"
          className="min-h-11"
          disabled={savingCount !== null}
          onClick={() => void choose(count)}
        >
          {count} {count === 1 ? 'Area' : 'Areas'}
        </Button>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </ClassDialogShell>
  );
};

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import StandardDialog from '@/components/common/StandardDialog';
import type { AnyConflict, BaseConflict } from '@/types/conflict-types';

interface ConflictResolutionDialogProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  onCancel?: () => void;
  conflict: AnyConflict | null;
  onResolve: (resolution: 'local' | 'remote' | 'merge', mergedData?: Record<string, unknown>) => void;
  isResolving?: boolean;
}

/** The live conflict-notification surface needs a small, dependable resolver. */
export function ConflictResolutionDialog({
  open,
  isOpen,
  onOpenChange,
  onClose,
  onCancel,
  conflict,
  onResolve,
  isResolving = false,
}: ConflictResolutionDialogProps) {
  const dialogOpen = open ?? isOpen ?? false;
  const fields = useMemo(() => conflict?.conflictFields ?? [], [conflict]);

  if (!conflict) return null;

  const close = () => {
    onOpenChange?.(false);
    onClose?.();
    onCancel?.();
  };

  const resolve = (strategy: 'local' | 'remote' | 'merge') => {
    const mergedData = strategy === 'merge'
      ? fields.reduce<Record<string, unknown>>(
          (data, field) => ({ ...data, [field]: conflict.localData[field] }),
          { ...conflict.remoteData },
        )
      : undefined;
    onResolve(strategy, mergedData);
  };

  return (
    <StandardDialog
      open={dialogOpen}
      onClose={close}
      onSave={close}
      title={`Resolve ${conflict.entityName ?? conflict.entityType} conflict`}
      description="Choose which version should remain on this device and in the shared record."
      hideSave
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <ConflictVersion label="Your changes" data={conflict.localData} fields={fields} />
          <ConflictVersion label="Shared changes" data={conflict.remoteData} fields={fields} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={close}>Cancel</Button>
          <Button disabled={isResolving} onClick={() => resolve('local')}>Keep mine</Button>
          <Button disabled={isResolving} onClick={() => resolve('remote')}>Keep shared</Button>
          <Button disabled={isResolving} onClick={() => resolve('merge')}>Merge</Button>
        </div>
      </div>
    </StandardDialog>
  );
}

function ConflictVersion({
  label,
  data,
  fields,
}: {
  label: string;
  data: BaseConflict['localData'];
  fields: string[];
}) {
  return (
    <div className="rounded-md border p-3">
      <h3 className="mb-2 font-medium">{label}</h3>
      <dl className="space-y-2 text-sm">
        {fields.map(field => (
          <div key={field}>
            <dt className="font-medium text-muted-foreground">{field}</dt>
            <dd className="break-words">{String(data[field] ?? '—')}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

import { createContext, useContext, type CSSProperties, type ReactNode } from 'react';
import { ClipboardCheck, GripVertical, Pencil, X, CheckCircle2 } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CHECKIN_STATUSES, getCheckinStatusConfig, type CheckInStatus } from '@myk9/core';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/base/Chip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { RunSheetEntry } from './types';

const PLACEMENT_LABELS = ['1st', '2nd', '3rd', '4th'];
const PLACEMENT_COLORS = ['#f59e0b', '#9ca3af', '#d97706', '#6366f1'];

interface RunSheetRowProps {
  entry: RunSheetEntry;
  position: number;
  onScoreEntry: () => void;
  onCheckInStatus: (status: CheckInStatus) => void;
  isMine?: boolean;
  draggable?: boolean;
}

interface DragHandleContextValue {
  listeners: ReturnType<typeof useSortable>['listeners'];
}

const STATUS_CLASS_BY_VALUE: Partial<Record<CheckInStatus, string>> = {
  'no-status': 'border-border bg-background text-muted-foreground',
  'checked-in': 'border-emerald-300 bg-emerald-950/20 text-emerald-300',
  'at-gate': 'border-sky-300 bg-sky-950/20 text-sky-300',
  'come-to-gate': 'border-amber-300 bg-amber-950/20 text-amber-300',
  conflict: 'border-red-300 bg-red-950/20 text-red-300',
  pulled: 'border-red-300 bg-red-950/20 text-red-300',
  'in-ring': 'border-violet-300 bg-violet-950/20 text-violet-300',
  completed: 'border-green-300 bg-green-950/20 text-green-300',
};

function statusLabel(status: CheckInStatus): string {
  return getCheckinStatusConfig(status)?.label ?? 'No Status';
}

const DragHandleContext = createContext<DragHandleContextValue | null>(null);

function SortableCard({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !enabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <DragHandleContext.Provider value={{ listeners }}>
      <div ref={setNodeRef} style={style} {...attributes}>
        {children}
      </div>
    </DragHandleContext.Provider>
  );
}

function DragHandle({ position, enabled }: { position: number; enabled: boolean }) {
  const ctx = useContext(DragHandleContext);

  return (
    <button
      type="button"
      aria-label={`Drag run order position ${position}`}
      disabled={!enabled}
      className={cn(
        'flex h-11 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors',
        enabled && 'cursor-grab hover:bg-muted hover:text-foreground active:cursor-grabbing',
        !enabled && 'cursor-not-allowed opacity-35'
      )}
      style={{ touchAction: 'none' }}
      {...(enabled && ctx ? ctx.listeners : {})}
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function RunSheetRow({
  entry,
  position,
  onScoreEntry,
  onCheckInStatus,
  isMine = false,
  draggable = true,
}: RunSheetRowProps) {
  const { isScored, isScratched, result } = entry;
  const statusClass =
    STATUS_CLASS_BY_VALUE[entry.checkInStatus] ?? STATUS_CLASS_BY_VALUE['no-status'];

  return (
    <SortableCard id={entry.id} enabled={draggable}>
      <div
        className={cn(
          'overflow-hidden rounded-md border bg-card transition-opacity',
          isScored && 'border-green-200',
          isScratched && 'border-red-200 opacity-60',
          !isScored && !isScratched && (isMine ? 'border-primary/50' : 'border-border')
        )}
      >
        <div className="grid min-h-[92px] grid-cols-[32px_64px_minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-4">
          <DragHandle position={position} enabled={draggable} />

          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-lg font-bold text-primary-foreground shadow-sm',
              isScratched && 'bg-destructive/80'
            )}
          >
            {entry.armband || '-'}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-base font-bold text-foreground">{entry.dogName}</span>
              {isMine && (
                <Chip color="purple" size="sm">
                  Your dog
                </Chip>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              <p className="truncate text-sm text-muted-foreground">
                {entry.breed ?? 'Unknown breed'}
              </p>
              {entry.ownerName && (
                <p className="truncate text-sm text-muted-foreground">{entry.ownerName}</p>
              )}
            </div>
            <div className="mt-1 text-xs text-muted-foreground/70">
              Run {entry.runOrder || position}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {isScored && result && (
              <>
                <Chip
                  color={result.qualified ? 'green' : 'red'}
                  size="sm"
                  leadingIcon={result.qualified ? <CheckCircle2 size={12} /> : <X size={12} />}
                >
                  {result.qualified ? 'Qualified' : 'NQ'}
                </Chip>
                {result.timeStr && (
                  <span className="font-mono text-sm font-bold text-foreground">
                    {result.timeStr}
                  </span>
                )}
                {result.placement && (
                  <span
                    className="text-xs font-bold font-mono px-2 py-0.5 rounded-full text-white"
                    style={{ background: PLACEMENT_COLORS[result.placement - 1] }}
                  >
                    {PLACEMENT_LABELS[result.placement - 1]}
                  </span>
                )}
              </>
            )}
            <Select
              value={entry.checkInStatus}
              onValueChange={value => onCheckInStatus(value as CheckInStatus)}
            >
              <SelectTrigger
                aria-label={`Check-in status for ${entry.dogName}`}
                className={cn('h-11 min-w-[148px] rounded-full border font-semibold', statusClass)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHECKIN_STATUSES.map(status => (
                  <SelectItem key={status} value={status}>
                    {statusLabel(status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            {!isScratched && (
              <Button
                size="sm"
                variant={isScored ? 'outline' : 'default'}
                onClick={onScoreEntry}
                className="gap-1.5"
              >
                {isScored ? (
                  <>
                    <Pencil size={13} /> Edit result
                  </>
                ) : (
                  <>
                    <ClipboardCheck size={13} /> Enter result
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </SortableCard>
  );
}

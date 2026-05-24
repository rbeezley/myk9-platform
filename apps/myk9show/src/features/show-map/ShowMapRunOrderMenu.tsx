import {
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  GripVertical,
  ListOrdered,
  Shuffle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ShowMapAutoSortKind } from './showMapRunOrderAutoSort';

interface ShowMapRunOrderMenuProps {
  classId: string;
  classLabel: string;
  entryCount: number;
  onAutoSort: (input: { classId: string; kind: ShowMapAutoSortKind; classLabel: string }) => void;
  isAutoSorting: boolean;
  // When provided, the menu shows a "Reorder manually..." item that enters
  // drag-and-drop reorder mode. Omitted in read-only/browse contexts.
  onEnterReorderMode?:
    | ((input: { classId: string; classLabel: string }) => void)
    | undefined;
  isReordering?: boolean | undefined;
}

interface PresetDef {
  kind: ShowMapAutoSortKind;
  label: string;
  icon: typeof ArrowUpNarrowWide;
}

const PRESETS: PresetDef[] = [
  { kind: 'armband-asc', label: 'Armband ↑', icon: ArrowUpNarrowWide },
  { kind: 'armband-desc', label: 'Armband ↓', icon: ArrowDownNarrowWide },
  { kind: 'random', label: 'Random', icon: Shuffle },
];

// INTENT: Sorting a 0- or 1-entry class is meaningless, so the trigger is
// hidden entirely rather than rendered as a disabled affordance. Matches the
// 0/1-entry edge case in the plan's deferred-polish list.
export function ShowMapRunOrderMenu({
  classId,
  classLabel,
  entryCount,
  onAutoSort,
  isAutoSorting,
  onEnterReorderMode,
  isReordering = false,
}: ShowMapRunOrderMenuProps) {
  if (entryCount < 2) return null;
  const disabled = isAutoSorting || isReordering;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild nativeButton>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={`Run order for ${classLabel}`}
        >
          <ListOrdered className="h-4 w-4" />
          Run order
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {PRESETS.map(preset => (
          <DropdownMenuItem
            key={preset.kind}
            disabled={disabled}
            onClick={() => onAutoSort({ classId, kind: preset.kind, classLabel })}
            className="items-center gap-3"
          >
            <preset.icon className="h-4 w-4" />
            <span className="text-sm font-medium">{preset.label}</span>
          </DropdownMenuItem>
        ))}
        {onEnterReorderMode && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={disabled}
              onClick={() => onEnterReorderMode({ classId, classLabel })}
              className="items-center gap-3"
            >
              <GripVertical className="h-4 w-4" />
              <span className="text-sm font-medium">Reorder manually...</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

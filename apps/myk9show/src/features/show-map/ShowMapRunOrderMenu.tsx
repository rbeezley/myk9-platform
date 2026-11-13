import { ArrowDownNarrowWide, ArrowUpNarrowWide, Shuffle } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { ShowMapAutoSortKind } from './showMapRunOrderAutoSort';

interface RunOrderPresetItemsProps {
  classId: string;
  classLabel: string;
  onAutoSort: (input: { classId: string; kind: ShowMapAutoSortKind; classLabel: string }) => void;
  disabled: boolean;
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

/** The three auto-sort presets, shared with the Show Desk class header's Actions menu. */
export function RunOrderPresetItems({
  classId,
  classLabel,
  onAutoSort,
  disabled,
}: RunOrderPresetItemsProps) {
  return PRESETS.map(preset => (
    <DropdownMenuItem
      key={preset.kind}
      disabled={disabled}
      onClick={() => onAutoSort({ classId, kind: preset.kind, classLabel })}
      className="items-center gap-3"
    >
      <preset.icon className="h-4 w-4" />
      <span className="text-sm font-medium">{preset.label}</span>
    </DropdownMenuItem>
  ));
}

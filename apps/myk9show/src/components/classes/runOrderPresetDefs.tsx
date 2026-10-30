import React from 'react';
import { ArrowUpDown, Shuffle, GripVertical } from 'lucide-react';
import type { RunOrderPreset } from '@/lib/runOrderUtils';

export interface PresetDef {
  preset: RunOrderPreset;
  label: string;
  description: string;
  icon: React.ReactNode;
}

export interface PresetGroup {
  label: string;
  presets: PresetDef[];
}

const sortIcon = <ArrowUpDown className="h-5 w-5" />;
const shuffleIcon = <Shuffle className="h-5 w-5" />;

const LOW_TO_HIGH = 'Armband Low to High';
const HIGH_TO_LOW = 'Armband High to Low';

export const MANUAL_PRESET: PresetDef = {
  preset: 'manual',
  label: 'Manual Drag and Drop',
  description: 'Manually reorder entries by dragging',
  icon: <GripVertical className="h-5 w-5" />,
};

// Classes without A/B sections: one flat list.
export const BASIC_PRESETS: PresetDef[] = [
  {
    preset: 'armband-asc',
    label: LOW_TO_HIGH,
    description: 'Sort entries by armband number (ascending)',
    icon: sortIcon,
  },
  {
    preset: 'armband-desc',
    label: HIGH_TO_LOW,
    description: 'Sort entries by armband number (descending)',
    icon: sortIcon,
  },
  {
    preset: 'random',
    label: 'Random Shuffle',
    description: 'Completely randomize entry order',
    icon: shuffleIcon,
  },
  MANUAL_PRESET,
];

// Combined A/B classes, scope "All" (v3's grouping).
export const COMBINED_PRESET_GROUPS: PresetGroup[] = [
  {
    label: 'Combined (ignore sections)',
    presets: [
      {
        preset: 'combined-asc',
        label: LOW_TO_HIGH,
        description: 'All entries by armband (ascending), ignoring sections',
        icon: sortIcon,
      },
      {
        preset: 'combined-desc',
        label: HIGH_TO_LOW,
        description: 'All entries by armband (descending), ignoring sections',
        icon: sortIcon,
      },
    ],
  },
  {
    label: 'Section A then B',
    presets: [
      {
        preset: 'a-then-b-asc',
        label: LOW_TO_HIGH,
        description: 'A section first (ascending), then B section (ascending)',
        icon: sortIcon,
      },
      {
        preset: 'a-then-b-desc',
        label: HIGH_TO_LOW,
        description: 'A section first (descending), then B section (descending)',
        icon: sortIcon,
      },
    ],
  },
  {
    label: 'Section B then A',
    presets: [
      {
        preset: 'b-then-a-asc',
        label: LOW_TO_HIGH,
        description: 'B section first (ascending), then A section (ascending)',
        icon: sortIcon,
      },
      {
        preset: 'b-then-a-desc',
        label: HIGH_TO_LOW,
        description: 'B section first (descending), then A section (descending)',
        icon: sortIcon,
      },
    ],
  },
  {
    label: 'Other',
    presets: [
      {
        preset: 'random',
        label: 'Random Shuffle (all dogs)',
        description: 'Randomize every entry, ignoring sections',
        icon: shuffleIcon,
      },
      {
        preset: 'random-sections',
        label: 'Random Shuffle (within sections)',
        description: 'Randomize A section, then randomize B section',
        icon: shuffleIcon,
      },
      MANUAL_PRESET,
    ],
  },
];

// Scoped presets: applied to a single section only. No manual option: drag
// mode reorders the whole list, so a drag could renumber the other section too.
export const SCOPED_PRESETS: PresetDef[] = [
  {
    preset: 'armband-asc',
    label: LOW_TO_HIGH,
    description: 'Sort this section by armband (ascending)',
    icon: sortIcon,
  },
  {
    preset: 'armband-desc',
    label: HIGH_TO_LOW,
    description: 'Sort this section by armband (descending)',
    icon: sortIcon,
  },
  {
    preset: 'random',
    label: 'Random Shuffle',
    description: 'Randomly shuffle this section',
    icon: shuffleIcon,
  },
];

# @myk9/scoring-ui

Shared UI hooks and components for dog show scoring interfaces.

## Overview

`@myk9/scoring-ui` provides presentation-layer components and hooks for building scoring interfaces. It bridges the gap between `@myk9/scoring` (business logic) and the UI layer, offering reusable hooks for timers, entry list management, drag-and-drop, and pre-built scoresheet components.

### Key Features

- Stopwatch hooks with auto-stop and warning states
- Entry list filtering and sorting hooks
- Drag-and-drop entry reordering
- Pre-built scoresheet components for AKC, UKC, and ASCA
- Time formatting utilities optimized for UI display
- React Query integration support
- Type-safe hooks with full TypeScript support

## Installation

This package is part of the myK9 Platform monorepo:

```bash
pnpm install
```

## Quick Start

### 1. Stopwatch Timer

```typescript
import { useStopwatch } from '@myk9/scoring-ui';

function Timer() {
  const stopwatch = useStopwatch({
    maxTime: "3:00",
    level: "Novice",
    onTimeExpired: (time) => {
      console.log('Time expired:', time);
      handleSubmit();
    },
  });

  return (
    <div>
      <p className={stopwatch.warningClass}>
        {stopwatch.displayTime}
      </p>
      <button onClick={stopwatch.start}>Start</button>
      <button onClick={stopwatch.stop}>Stop</button>
      <button onClick={stopwatch.reset}>Reset</button>
    </div>
  );
}
```

### 2. Entry List Filtering

```typescript
import { useEntryListFilters } from '@myk9/scoring-ui';

function EntryList({ entries }: { entries: Entry[] }) {
  const {
    filteredEntries,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    filterTab,
    setFilterTab
  } = useEntryListFilters({
    entries,
    prioritizeInRing: true,
  });

  return (
    <div>
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search..."
      />

      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
        <option value="armband">Armband</option>
        <option value="dog-name">Dog Name</option>
        <option value="handler">Handler</option>
      </select>

      {filteredEntries.map(entry => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
```

### 3. Drag and Drop Reordering

```typescript
import { useDragAndDropEntries } from '@myk9/scoring-ui';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';

function ReorderableEntryList({ entries }: { entries: Entry[] }) {
  const [localEntries, setLocalEntries] = useState(entries);

  const {
    sensors,
    handleDragStart,
    handleDragEnd
  } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries: entries,
    onUpdateOrder: async (reorderedEntries) => {
      await saveEntryOrder(reorderedEntries);
    },
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={localEntries.map(e => e.id)}
        strategy={verticalListSortingStrategy}
      >
        {localEntries.map(entry => (
          <SortableEntry key={entry.id} entry={entry} />
        ))}
      </SortableContext>
    </DndContext>
  );
}
```

### 4. Pre-built Scoresheets

```typescript
import { AKCScentWorkScoresheet } from '@myk9/scoring-ui';

function ScoringPage() {
  return (
    <AKCScentWorkScoresheet
      entry={currentEntry}
      level="Novice"
      element="Container"
      maxTime="3:00"
      onSubmit={handleSubmit}
      onSkip={handleSkip}
    />
  );
}
```

## Hooks

### useStopwatch

Stopwatch with auto-stop, warnings, and max time handling.

#### Options

```typescript
interface StopwatchOptions {
  maxTime?: string;           // Max time (e.g., "3:00")
  level?: string;             // Competition level
  autoStop?: boolean;         // Auto-stop at max time
  warningThreshold?: number;  // Warning at N seconds remaining
  onTimeExpired?: (time: string) => void;
  onWarning?: () => void;
}
```

#### Return Value

```typescript
interface StopwatchReturn {
  // Time values
  time: number;               // Milliseconds
  displayTime: string;        // Formatted (MM:SS.ss)
  isRunning: boolean;
  isPaused: boolean;

  // Warning state
  warningState: 'normal' | 'warning' | 'expired' | null;
  warningClass: string;       // CSS class for styling

  // Controls
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;

  // Max time info
  maxTimeMs: number | null;
  remainingTime: number | null;
}
```

#### Example

```typescript
import { useStopwatch } from '@myk9/scoring-ui';

function ScentWorkTimer() {
  const stopwatch = useStopwatch({
    maxTime: "3:00",
    level: "Novice",
    autoStop: true,
    warningThreshold: 30, // Warn at 30 seconds
    onTimeExpired: (time) => {
      console.log('Time up!', time);
      submitScore({ time, qualifying: 'NQ' });
    },
    onWarning: () => {
      playWarningSound();
    }
  });

  return (
    <div>
      <div className={`timer ${stopwatch.warningClass}`}>
        <p className="time">{stopwatch.displayTime}</p>
        {stopwatch.maxTimeMs && (
          <p className="remaining">
            Remaining: {formatTimeDisplay(stopwatch.remainingTime)}
          </p>
        )}
      </div>

      <div className="controls">
        {!stopwatch.isRunning ? (
          <button onClick={stopwatch.start}>Start</button>
        ) : (
          <>
            <button onClick={stopwatch.stop}>Stop</button>
            {!stopwatch.isPaused ? (
              <button onClick={stopwatch.pause}>Pause</button>
            ) : (
              <button onClick={stopwatch.resume}>Resume</button>
            )}
          </>
        )}
        <button onClick={stopwatch.reset}>Reset</button>
      </div>
    </div>
  );
}
```

### useElementTimer

Multi-element timer for AKC Scent Work Nationals.

#### Options

```typescript
interface ElementTimerOptions {
  elements: string[];          // Element names
  maxTimePerElement?: number;  // Max time in ms
  onElementComplete?: (element: string, time: number) => void;
  onAllComplete?: (times: Record<string, number>) => void;
}
```

#### Return Value

```typescript
interface ElementTimerReturn {
  currentElement: string | null;
  elementTimes: Record<string, number>;

  startElement: (element: string) => void;
  stopElement: (element: string) => void;
  getCurrentTime: () => number;
  getTotalTime: () => number;
  reset: () => void;
}
```

#### Example

```typescript
import { useElementTimer } from '@myk9/scoring-ui';

function NationalsTimer() {
  const timer = useElementTimer({
    elements: ['Container', 'Buried', 'Interior', 'Exterior'],
    maxTimePerElement: 180000, // 3 minutes
    onElementComplete: (element, time) => {
      console.log(`${element} completed in ${time}ms`);
    },
    onAllComplete: (times) => {
      const total = Object.values(times).reduce((a, b) => a + b, 0);
      submitScore({ elementTimes: times, totalTime: total });
    }
  });

  return (
    <div>
      {timer.elements.map(element => (
        <div key={element}>
          <h3>{element}</h3>
          <p>{formatTimeDisplay(timer.elementTimes[element] || 0)}</p>
          <button onClick={() => timer.startElement(element)}>
            Start
          </button>
          <button onClick={() => timer.stopElement(element)}>
            Stop
          </button>
        </div>
      ))}
      <p>Total: {formatTimeDisplay(timer.getTotalTime())}</p>
    </div>
  );
}
```

### useEntryListFilters

Entry list filtering, sorting, and search.

#### Options

```typescript
interface EntryListFiltersOptions<T extends BaseEntry> {
  entries: T[];
  prioritizeInRing?: boolean;   // Sort in-ring entries first
  defaultSort?: SortType;
  defaultTab?: TabType;
  searchFields?: string[];      // Fields to search
}
```

#### Return Value

```typescript
interface EntryListFiltersReturn<T> {
  // Filtered data
  filteredEntries: T[];

  // Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  // Sorting
  sortBy: SortType;
  setSortBy: (sort: SortType) => void;

  // Tab filtering
  filterTab: TabType;
  setFilterTab: (tab: TabType) => void;

  // Section filtering
  sectionFilter: SectionFilter;
  setSectionFilter: (filter: SectionFilter) => void;

  // Computed
  totalCount: number;
  scoredCount: number;
  unscoredCount: number;
}
```

#### Example

```typescript
import { useEntryListFilters } from '@myk9/scoring-ui';

function EntryList({ entries }: { entries: Entry[] }) {
  const {
    filteredEntries,
    searchTerm,
    setSearchTerm,
    sortBy,
    setSortBy,
    filterTab,
    setFilterTab,
    scoredCount,
    unscoredCount
  } = useEntryListFilters({
    entries,
    prioritizeInRing: true,
    defaultSort: 'armband',
    defaultTab: 'all',
    searchFields: ['armband', 'dog_name', 'handler_name']
  });

  return (
    <div>
      {/* Search */}
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search by armband, dog, or handler"
      />

      {/* Tabs */}
      <div className="tabs">
        <button
          className={filterTab === 'all' ? 'active' : ''}
          onClick={() => setFilterTab('all')}
        >
          All ({entries.length})
        </button>
        <button
          className={filterTab === 'unscored' ? 'active' : ''}
          onClick={() => setFilterTab('unscored')}
        >
          Unscored ({unscoredCount})
        </button>
        <button
          className={filterTab === 'scored' ? 'active' : ''}
          onClick={() => setFilterTab('scored')}
        >
          Scored ({scoredCount})
        </button>
      </div>

      {/* Sort */}
      <select
        value={sortBy}
        onChange={(e) => setSortBy(e.target.value as SortType)}
      >
        <option value="armband">Armband</option>
        <option value="dog-name">Dog Name</option>
        <option value="handler">Handler Name</option>
        <option value="run-order">Run Order</option>
      </select>

      {/* Results */}
      <div className="entries">
        {filteredEntries.map(entry => (
          <EntryCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}
```

### useDragAndDropEntries

Drag-and-drop entry reordering with @dnd-kit.

#### Options

```typescript
interface DragAndDropOptions<T extends BaseEntry> {
  localEntries: T[];
  setLocalEntries: (entries: T[]) => void;
  currentEntries: T[];
  onUpdateOrder: (entries: T[]) => Promise<void>;
  optimisticUpdate?: boolean;
}
```

#### Return Value

```typescript
interface DragAndDropReturn {
  sensors: SensorDescriptor<any>[];
  handleDragStart: (event: DragStartEvent) => void;
  handleDragEnd: (event: DragEndEvent) => void;
  handleDragCancel: () => void;
  activeId: string | null;
}
```

#### Example

```typescript
import { useDragAndDropEntries } from '@myk9/scoring-ui';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';

function EntryList({ entries }: { entries: Entry[] }) {
  const [localEntries, setLocalEntries] = useState(entries);

  const {
    sensors,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    activeId
  } = useDragAndDropEntries({
    localEntries,
    setLocalEntries,
    currentEntries: entries,
    onUpdateOrder: async (reorderedEntries) => {
      // Update server
      await updateEntryOrder(reorderedEntries.map(e => e.id));
    },
    optimisticUpdate: true
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext
        items={localEntries.map(e => e.id)}
        strategy={verticalListSortingStrategy}
      >
        {localEntries.map(entry => (
          <SortableEntry
            key={entry.id}
            entry={entry}
            isActive={activeId === entry.id}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// Sortable entry component
function SortableEntry({ entry, isActive }: {
  entry: Entry;
  isActive: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={isActive ? 'dragging' : ''}
    >
      <EntryCard entry={entry} />
    </div>
  );
}
```

## Components

### AKC Scoresheets

#### AKCScentWorkScoresheet

```typescript
import { AKCScentWorkScoresheet } from '@myk9/scoring-ui';

<AKCScentWorkScoresheet
  entry={currentEntry}
  level="Novice"
  element="Container"
  maxTime="3:00"
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

#### AKCNationalsScoresheet

```typescript
import { AKCNationalsScoresheet } from '@myk9/scoring-ui';

<AKCNationalsScoresheet
  entry={currentEntry}
  element="Container"
  competitionDay={1}
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

#### AKCFastCatScoresheet

```typescript
import { AKCFastCatScoresheet } from '@myk9/scoring-ui';

<AKCFastCatScoresheet
  entry={currentEntry}
  yardage={100}
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

### UKC Scoresheets

#### UKCNoseworkScoresheet

```typescript
import { UKCNoseworkScoresheet } from '@myk9/scoring-ui';

<UKCNoseworkScoresheet
  entry={currentEntry}
  maxTime="3:00"
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

#### UKCRallyScoresheet

```typescript
import { UKCRallyScoresheet } from '@myk9/scoring-ui';

<UKCRallyScoresheet
  entry={currentEntry}
  perfectScore={200}
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

#### UKCObedienceScoresheet

```typescript
import { UKCObedienceScoresheet } from '@myk9/scoring-ui';

<UKCObedienceScoresheet
  entry={currentEntry}
  perfectScore={200}
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

### ASCA Scoresheets

#### ASCAScentDetectionScoresheet

```typescript
import { ASCAScentDetectionScoresheet } from '@myk9/scoring-ui';

<ASCAScentDetectionScoresheet
  entry={currentEntry}
  level="Novice"
  element="Container"
  maxTime="3:00"
  onSubmit={(score) => handleSubmit(score)}
  onSkip={() => handleSkip()}
/>
```

## Utilities

### Time Formatting

```typescript
import {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
  parseTimeToMs,
  formatTimeInputToMMSS
} from '@myk9/scoring-ui';

// Format milliseconds to display
formatMilliseconds(125450); // "2:05.45"

// Format seconds to MM:SS
formatSecondsToMMSS(125); // "2:05"

// Format seconds to readable time
formatSecondsToTime(125); // "2 min 5 sec"

// Convert time string to seconds
convertTimeToSeconds("2:05"); // 125

// Format time for display (handles various formats)
formatTimeForDisplay(125); // "2:05"

// Format time limit
formatTimeLimitSeconds(180); // "3:00"

// Parse time to milliseconds
parseTimeToMs("2:05.45"); // 125450

// Format input to MM:SS (for controlled inputs)
formatTimeInputToMMSS("205"); // "2:05"
```

## Types

### Base Entry

```typescript
interface BaseEntry {
  id: string | number;
  armband: number | string;
  dog_name?: string;
  handler_name?: string;
  status?: string;
  run_order?: number;
  // ... other fields
}
```

### Hook Types

```typescript
type TabType = 'all' | 'unscored' | 'scored' | 'in-ring';
type SortType = 'armband' | 'dog-name' | 'handler' | 'run-order';
type SectionFilter = 'all' | string;

interface TimerFormatOptions {
  showMilliseconds?: boolean;
  showHours?: boolean;
  padMinutes?: boolean;
}
```

## Package Structure

```
packages/scoring-ui/
├── src/
│   ├── hooks/
│   │   ├── useStopwatch.ts
│   │   ├── useElementTimer.ts
│   │   ├── useEntryListFilters.ts
│   │   ├── useDragAndDropEntries.ts
│   │   └── index.ts
│   ├── components/
│   │   └── scoresheets/
│   │       ├── AKC/
│   │       │   ├── AKCScentWorkScoresheet.tsx
│   │       │   ├── AKCNationalsScoresheet.tsx
│   │       │   └── AKCFastCatScoresheet.tsx
│   │       ├── UKC/
│   │       │   ├── UKCNoseworkScoresheet.tsx
│   │       │   ├── UKCRallyScoresheet.tsx
│   │       │   └── UKCObedienceScoresheet.tsx
│   │       └── ASCA/
│   │           └── ASCAScentDetectionScoresheet.tsx
│   ├── utils/
│   │   ├── timeUtils.ts
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts
│   └── index.ts
├── package.json
└── README.md
```

## API Reference

### Hooks

```typescript
export { useStopwatch } from './hooks/useStopwatch';
export { useElementTimer } from './hooks/useElementTimer';
export { useEntryListFilters } from './hooks/useEntryListFilters';
export { useDragAndDropEntries } from './hooks/useDragAndDropEntries';
```

### Components

```typescript
// AKC
export { AKCScentWorkScoresheet } from './components/scoresheets/AKC/AKCScentWorkScoresheet';
export { AKCNationalsScoresheet } from './components/scoresheets/AKC/AKCNationalsScoresheet';
export { AKCFastCatScoresheet } from './components/scoresheets/AKC/AKCFastCatScoresheet';

// UKC
export { UKCNoseworkScoresheet } from './components/scoresheets/UKC/UKCNoseworkScoresheet';
export { UKCRallyScoresheet } from './components/scoresheets/UKC/UKCRallyScoresheet';
export { UKCObedienceScoresheet } from './components/scoresheets/UKC/UKCObedienceScoresheet';

// ASCA
export { ASCAScentDetectionScoresheet } from './components/scoresheets/ASCA/ASCAScentDetectionScoresheet';
```

### Utils

```typescript
export {
  formatMilliseconds,
  formatSecondsToMMSS,
  formatSecondsToTime,
  convertTimeToSeconds,
  formatTimeForDisplay,
  formatTimeLimitSeconds,
  parseTimeToMs,
  formatTimeInputToMMSS
} from './utils/timeUtils';
```

### Types

```typescript
export type {
  BaseEntry,
  TimerFormatOptions,
  StopwatchOptions,
  StopwatchReturn,
  ElementTimerReturn,
  TabType,
  SortType,
  SectionFilter,
  EntryListFiltersOptions,
  EntryListFiltersReturn,
  DragAndDropOptions,
  DragAndDropReturn
} from './types';
```

## Development

### Building

```bash
pnpm build
```

### Watch Mode

```bash
pnpm dev
```

### Type Checking

```bash
pnpm typecheck
```

## Dependencies

### Runtime Dependencies

- **@myk9/core** (workspace:*) - Core utilities
- **@myk9/ui** (workspace:*) - UI components

### Peer Dependencies

- **@dnd-kit/core** (^6.0.0) - Drag and drop (optional)
- **@dnd-kit/sortable** (^8.0.0 || ^9.0.0) - Sortable lists (optional)
- **@tanstack/react-query** (^5.0.0) - Server state (optional)
- **lucide-react** (>=0.300.0) - Icons
- **react** (^18.0.0 || ^19.0.0)

### Dev Dependencies

- **typescript** (~5.9.3)
- **tsup** (^8.5.1)

## Used By

- **@myk9/q** - myK9Q application (primary user)
- **@myk9/show** - myK9Show application (scoring features)

## Contributing

When contributing to `@myk9/scoring-ui`:

1. **UI-focused** - Keep business logic in `@myk9/scoring`
2. **Reusable hooks** - Extract common patterns
3. **Type-safe** - Full TypeScript with generics
4. **Accessible** - Follow ARIA standards
5. **Tested** - Test hooks with React Testing Library
6. **Documented** - Add examples to this README

### Adding a New Hook

1. Create hook file in `src/hooks/`
2. Export from `src/hooks/index.ts`
3. Export from `src/index.ts`
4. Add TypeScript types
5. Document with examples in this README
6. Test with real-world usage

### Adding a New Scoresheet

1. Determine organization (AKC, UKC, ASCA)
2. Create component in appropriate folder
3. Use existing scoresheets as template
4. Export from folder index and main index
5. Document props and usage
6. Test with real entry data

## Best Practices

### 1. Use Hooks for Logic

```typescript
// Good: Reusable hook
const stopwatch = useStopwatch({ maxTime: "3:00" });

// Avoid: Local state management
const [time, setTime] = useState(0);
```

### 2. Leverage Peer Dependencies

```typescript
// Good: Use React Query for data
const { data: entries } = useQuery(['entries', classId], fetchEntries);
const { filteredEntries } = useEntryListFilters({ entries });

// Works: Hook handles undefined gracefully
```

### 3. Combine with @myk9/scoring

```typescript
// Good: Use both packages together
import { useScoringStore } from '@myk9/scoring';
import { useStopwatch, AKCScentWorkScoresheet } from '@myk9/scoring-ui';

const { submitScore } = useScoringStore();
const stopwatch = useStopwatch({ maxTime: "3:00" });
```

### 4. Type Your Entries

```typescript
// Good: Extend BaseEntry with your fields
interface MyEntry extends BaseEntry {
  breed: string;
  level: string;
}

const { filteredEntries } = useEntryListFilters<MyEntry>({
  entries: myEntries
});
```

## Troubleshooting

### Peer Dependency Warnings

Some peer dependencies are optional. Install only what you need:

```bash
# Drag and drop
pnpm add @dnd-kit/core @dnd-kit/sortable

# React Query
pnpm add @tanstack/react-query

# Icons
pnpm add lucide-react
```

### Timer Not Starting

1. Check that `maxTime` format is correct (MM:SS)
2. Ensure component is mounted
3. Verify `autoStop` setting
4. Check console for errors

### Drag and Drop Not Working

1. Install `@dnd-kit/core` and `@dnd-kit/sortable`
2. Wrap in `<DndContext>`
3. Use `<SortableContext>` for list
4. Check `useSortable()` setup in items

## License

Private - myK9 Platform

## Support

For questions or issues related to `@myk9/scoring-ui`:
- Review this README and source code
- Check hook implementation examples
- See usage in myK9Q and myK9Show apps
- Consult project CLAUDE.md for patterns
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03

# @myk9/scoring

Scoring logic, stores, hooks, and utilities for dog show scoring across multiple organizations.

## Overview

`@myk9/scoring` provides a comprehensive scoring framework for managing dog show competitions. It includes Zustand stores for state management, scoring logic for multiple organizations (AKC, UKC, ASCA), and utilities for time calculations and nationals scoring.

### Supported Organizations & Sports

- **AKC Scent Work** - Regular and Nationals
- **AKC Fast CAT** - Health checks and speed calculations
- **UKC Obedience** - Points and deductions
- **UKC Rally** - Score and fault tracking
- **UKC Nosework** - Time and qualifying results
- **ASCA Scent Detection** - Multi-area timing

## Installation

This package is part of the myK9 Platform monorepo:

```bash
pnpm install
```

## Quick Start

### 1. Initialize Scoring Store

```typescript
import { useScoringStore } from '@myk9/scoring';

function ScoringPage() {
  const {
    startScoringSession,
    submitScore,
    currentSession,
    isScoring
  } = useScoringStore();

  // Start a scoring session
  const handleStart = () => {
    startScoringSession(
      classId: 123,
      className: 'Novice A Container',
      competitionType: 'AKC_SCENT_WORK',
      judgeId: 'judge-123',
      totalEntries: 15
    );
  };

  // Submit a score
  const handleScore = () => {
    submitScore({
      entryId: 456,
      armband: 101,
      time: '2:30.45',
      qualifying: 'Q',
      areas: {
        'Container': '2:30.45'
      }
    });
  };

  return (
    <div>
      {!isScoring ? (
        <button onClick={handleStart}>Start Scoring</button>
      ) : (
        <div>Scoring in progress...</div>
      )}
    </div>
  );
}
```

### 2. Use Timer Store

```typescript
import { useTimerStore } from '@myk9/scoring';

function MultiAreaTimer() {
  const {
    startTimer,
    stopTimer,
    getAreaTime,
    areas
  } = useTimerStore();

  const handleStartArea = (areaName: string) => {
    startTimer(areaName, { maxTime: 180000 }); // 3 minutes
  };

  const handleStopArea = (areaName: string) => {
    stopTimer(areaName);
    const time = getAreaTime(areaName);
    console.log(`${areaName} completed in ${time}ms`);
  };

  return (
    <div>
      {Object.values(areas).map((area) => (
        <div key={area.id}>
          <h3>{area.name}</h3>
          <p>Time: {area.elapsedTime}ms</p>
          {!area.isRunning ? (
            <button onClick={() => handleStartArea(area.name)}>
              Start
            </button>
          ) : (
            <button onClick={() => handleStopArea(area.name)}>
              Stop
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 3. Calculate Times and Points

```typescript
import {
  calculateTotalAreaTime,
  formatTimeDisplay,
  calculateFastCatMph,
  calculateNationalsPoints
} from '@myk9/scoring';

// Calculate total time across multiple areas
const totalMs = calculateTotalAreaTime({
  'Container': '1:15.23',
  'Interior': '2:30.45',
  'Exterior': '1:45.67'
});

// Format time for display
const displayTime = formatTimeDisplay(totalMs); // "5:31.35"

// Calculate Fast CAT speed
const mph = calculateFastCatMph(18.5, 100); // 18.5 seconds for 100 yards
console.log(`Speed: ${mph} mph`);

// Calculate Nationals points
const points = calculateNationalsPoints(
  correctCount: 3,
  incorrectCount: 1,
  finishCallErrors: 0,
  totalTime: 125000, // ms
  maxTime: 180000,   // ms
  competitionDay: 1
);
```

## Features

### Scoring Store

Zustand store for managing scoring sessions and score records.

#### State

```typescript
interface ScoringState {
  currentSession: ScoringSession | null;
  isScoring: boolean;
  lastScoredEntry: Score | null;
}
```

#### Actions

```typescript
// Session management
startScoringSession(classId, className, competitionType, judgeId, totalEntries)
endScoringSession()
clearSession()

// Score management
submitScore(score)
updateScoreSync(entryId, syncStatus)
undoLastScore()

// Navigation
moveToNextEntry()
moveToPreviousEntry()
```

#### Usage Example

```typescript
import { useScoringStore } from '@myk9/scoring';

function ScoringComponent() {
  const {
    currentSession,
    isScoring,
    lastScoredEntry,
    startScoringSession,
    submitScore,
    moveToNextEntry,
    undoLastScore,
    endScoringSession
  } = useScoringStore();

  // Start session
  const handleStart = () => {
    startScoringSession(
      123,
      'Novice A',
      'AKC_SCENT_WORK',
      'judge-id',
      20
    );
  };

  // Submit score with optimistic UI update
  const handleSubmit = async (scoreData) => {
    // Add to store immediately (optimistic)
    submitScore(scoreData);

    // Sync to server
    try {
      await syncToServer(scoreData);
      updateScoreSync(scoreData.entryId, 'synced');
    } catch (error) {
      updateScoreSync(scoreData.entryId, 'error');
    }
  };

  // Progress tracking
  const progress = currentSession
    ? `${currentSession.currentEntryIndex + 1} / ${currentSession.totalEntries}`
    : '';

  return (
    <div>
      <p>Progress: {progress}</p>
      {lastScoredEntry && (
        <button onClick={undoLastScore}>Undo Last Score</button>
      )}
      <button onClick={handleSubmit}>Submit Score</button>
      <button onClick={moveToNextEntry}>Next Entry</button>
      <button onClick={endScoringSession}>Finish Session</button>
    </div>
  );
}
```

### Timer Store

Zustand store for managing multi-area timers (scent work).

#### State

```typescript
interface TimerState {
  areas: Record<string, TimerArea>;
  activeAreaId: string | null;
}
```

#### Actions

```typescript
// Timer control
startTimer(areaId, options?)
stopTimer(areaId)
pauseTimer(areaId)
resumeTimer(areaId)
resetTimer(areaId)

// Area management
addArea(areaId, name, maxTime?)
removeArea(areaId)
clearAllAreas()

// Getters
getAreaTime(areaId): number
getAreaStatus(areaId): TimerArea
getTotalTime(): number
```

#### Usage Example

```typescript
import { useTimerStore } from '@myk9/scoring';

function ScentWorkTimer() {
  const {
    areas,
    startTimer,
    stopTimer,
    pauseTimer,
    addArea,
    getAreaTime,
    getTotalTime
  } = useTimerStore();

  useEffect(() => {
    // Setup areas for a 4-element search
    addArea('container', 'Container', 180000); // 3 min max
    addArea('interior', 'Interior', 180000);
    addArea('exterior', 'Exterior', 180000);
    addArea('buried', 'Buried', 180000);
  }, []);

  const handleAreaStart = (areaId: string) => {
    startTimer(areaId);
  };

  const handleAreaStop = (areaId: string) => {
    stopTimer(areaId);
    const time = getAreaTime(areaId);
    console.log(`Area time: ${time}ms`);
  };

  return (
    <div>
      {Object.values(areas).map((area) => (
        <div key={area.id}>
          <h3>{area.name}</h3>
          <p>{area.elapsedTime}ms</p>
          <button onClick={() => handleAreaStart(area.id)}>
            Start
          </button>
          <button onClick={() => handleAreaStop(area.id)}>
            Stop
          </button>
          {area.isRunning && (
            <button onClick={() => pauseTimer(area.id)}>
              Pause
            </button>
          )}
        </div>
      ))}
      <div>Total Time: {getTotalTime()}ms</div>
    </div>
  );
}
```

## Utilities

### Calculation Utils

#### Time Calculations

```typescript
import {
  calculateTotalAreaTime,
  formatTimeDisplay,
  formatSecondsDisplay,
  calculateRemainingTime
} from '@myk9/scoring';

// Calculate total time from area times
const total = calculateTotalAreaTime({
  'Container': '1:30.25',
  'Interior': '2:15.50'
});
// Returns: 225750 (milliseconds)

// Format milliseconds to display string
const display = formatTimeDisplay(225750);
// Returns: "3:45.75"

// Format seconds to display string
const seconds = formatSecondsDisplay(125);
// Returns: "2:05"

// Calculate remaining time
const remaining = calculateRemainingTime(125000, 180000);
// Returns: 55000 (milliseconds remaining)
```

#### Fast CAT Calculations

```typescript
import { calculateFastCatMph } from '@myk9/scoring';

// Calculate speed in mph
const mph = calculateFastCatMph(
  timeSeconds: 18.5,
  yardage: 100
);
// Returns: 10.96 mph

// Example with different yardage
const mphLong = calculateFastCatMph(27.3, 150);
// Returns: 11.44 mph
```

#### Nationals Points Calculation

```typescript
import { calculateNationalsPoints } from '@myk9/scoring';

// Calculate points for AKC Scent Work Nationals
const points = calculateNationalsPoints({
  correctCount: 3,      // Number of correct alerts
  incorrectCount: 1,    // Number of incorrect alerts
  finishCallErrors: 0,  // Finish call errors
  totalTime: 125000,    // Total time in ms
  maxTime: 180000,      // Max time in ms
  competitionDay: 1     // Day 1, 2, or 3
});
// Returns: calculated points based on AKC formula
```

### Nationals Utils

#### Element Type Mapping

```typescript
import {
  mapElementToNationalsType,
  getNationalsElementDisplayName,
  getAllNationalsElementTypes,
  isValidNationalsElement
} from '@myk9/scoring';

// Map database element to nationals type
const type = mapElementToNationalsType('Container');
// Returns: 'CONTAINER'

// Get display name
const name = getNationalsElementDisplayName('CONTAINER');
// Returns: 'Container'

// Get all element types
const types = getAllNationalsElementTypes();
// Returns: ['CONTAINER', 'BURIED', 'INTERIOR', 'EXTERIOR', 'HD_CHALLENGE']

// Validate element
const valid = isValidNationalsElement('CONTAINER');
// Returns: true
```

#### Max Time Configuration

```typescript
import {
  getNationalsMaxTime,
  getNationalsMaxTimeFormatted
} from '@myk9/scoring';

// Get max time in milliseconds
const maxMs = getNationalsMaxTime('CONTAINER', 1);
// Returns: 180000 (3 minutes for day 1)

// Get formatted max time
const maxFormatted = getNationalsMaxTimeFormatted('BURIED', 2);
// Returns: "3:00" (for day 2)
```

#### Competition Day Utils

```typescript
import {
  isValidCompetitionDay,
  getCompetitionDayName
} from '@myk9/scoring';

// Validate competition day
const valid = isValidCompetitionDay(1);
// Returns: true

// Get day name
const dayName = getCompetitionDayName(1);
// Returns: "Day 1"
```

## Types

### Core Types

```typescript
// Qualifying results
type QualifyingResult =
  | 'Q'           // Qualified
  | 'NQ'          // Not Qualified
  | 'EX'          // Excused
  | 'DQ'          // Disqualified
  | 'E'           // Eliminated
  | 'ABS'         // Absent
  | 'WD'          // Withdrawn
  | 'Qualified'   // Alternative format
  | 'Excused'
  | 'Withdrawn'
  | 'Eliminated'
  | 'Absent'
  | null;

// Competition types
type CompetitionType =
  | 'UKC_OBEDIENCE'
  | 'UKC_RALLY'
  | 'UKC_NOSEWORK'
  | 'AKC_SCENT_WORK'
  | 'AKC_SCENT_WORK_NATIONAL'
  | 'AKC_FASTCAT'
  | 'ASCA_SCENT_DETECTION';

// Sync status
type SyncStatus = 'pending' | 'synced' | 'error';

// Timer warning state
type TimerWarningState = 'normal' | 'warning' | 'expired' | null;
```

### Score Record

```typescript
interface Score {
  entryId: number;
  armband: number;
  points?: number;
  time?: string;
  faults?: number;
  qualifying: QualifyingResult;
  nonQualifyingReason?: string;

  // Multi-area times (scent work)
  areas?: { [key: string]: string };

  // Fast CAT specific
  healthCheckPassed?: boolean;
  mph?: number;

  // Rally specific
  score?: number;
  deductions?: number;

  // Nationals specific
  correctCount?: number;
  incorrectCount?: number;
  finishCallErrors?: number;

  // Metadata
  scoredAt: string;
  syncStatus: SyncStatus;
}
```

### Scoring Session

```typescript
interface ScoringSession {
  classId: number;
  className: string;
  competitionType: CompetitionType;
  judgeId: string;
  startedAt: string;
  currentEntryIndex: number;
  totalEntries: number;
  scores: Score[];
}
```

### Timer Area

```typescript
interface TimerArea {
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  elapsedTime: number;
  isRunning: boolean;
  isPaused: boolean;
  maxTime?: number; // milliseconds
}
```

### Nationals Types

```typescript
type NationalsElementType =
  | 'CONTAINER'
  | 'BURIED'
  | 'INTERIOR'
  | 'EXTERIOR'
  | 'HD_CHALLENGE';

type CompetitionDay = 1 | 2 | 3;
```

## Package Structure

```
packages/scoring/
├── src/
│   ├── stores/
│   │   ├── scoringStore.ts        # Scoring session store
│   │   ├── timerStore.ts          # Multi-area timer store
│   │   └── index.ts
│   ├── types/
│   │   └── index.ts               # Type definitions
│   ├── utils/
│   │   ├── calculationUtils.ts    # Time and score calculations
│   │   ├── nationalsUtils.ts      # Nationals-specific logic
│   │   └── index.ts
│   └── index.ts                   # Public API
├── package.json
└── README.md
```

## API Reference

### Stores

```typescript
// Scoring store
export {
  useScoringStore,
  createScoringStore,
  type ScoringState
}

// Timer store
export {
  useTimerStore,
  createTimerStore,
  type TimerState
}
```

### Utils - Calculations

```typescript
export {
  calculateTotalAreaTime,
  formatTimeDisplay,
  formatSecondsDisplay,
  calculateRemainingTime,
  calculateFastCatMph,
  calculateNationalsPoints
}
```

### Utils - Nationals

```typescript
export {
  mapElementToNationalsType,
  getNationalsElementDisplayName,
  getAllNationalsElementTypes,
  isValidNationalsElement,
  getNationalsMaxTime,
  getNationalsMaxTimeFormatted,
  isValidCompetitionDay,
  getCompetitionDayName
}
```

### Types

```typescript
export type {
  QualifyingResult,
  CompetitionType,
  SyncStatus,
  Score,
  ScoringSession,
  TimerArea,
  NationalsElementType,
  CompetitionDay,
  TimerWarningState
}
```

## Usage Examples

### Complete Scoring Workflow

```typescript
import {
  useScoringStore,
  useTimerStore,
  calculateTotalAreaTime,
  formatTimeDisplay,
  type Score
} from '@myk9/scoring';

function ScentWorkScoring() {
  const { submitScore, currentSession } = useScoringStore();
  const { areas, stopTimer, getTotalTime } = useTimerStore();

  const handleFinish = async () => {
    // Stop all timers
    Object.keys(areas).forEach(areaId => stopTimer(areaId));

    // Calculate times
    const areaTimes = Object.values(areas).reduce((acc, area) => {
      acc[area.name] = formatTimeDisplay(area.elapsedTime);
      return acc;
    }, {} as Record<string, string>);

    const totalMs = getTotalTime();
    const totalTime = formatTimeDisplay(totalMs);

    // Submit score
    const score: Omit<Score, 'scoredAt' | 'syncStatus'> = {
      entryId: currentEntry.id,
      armband: currentEntry.armband,
      time: totalTime,
      qualifying: 'Q',
      areas: areaTimes
    };

    submitScore(score);

    // Sync to server
    await syncToDatabase(score);
  };

  return (
    <div>
      {/* Timer UI */}
      {Object.values(areas).map(area => (
        <div key={area.id}>
          <h3>{area.name}</h3>
          <p>{formatTimeDisplay(area.elapsedTime)}</p>
        </div>
      ))}
      <button onClick={handleFinish}>Finish</button>
    </div>
  );
}
```

### Fast CAT Scoring

```typescript
import {
  useScoringStore,
  calculateFastCatMph,
  type Score
} from '@myk9/scoring';

function FastCatScoring() {
  const { submitScore } = useScoringStore();
  const [time, setTime] = useState('');
  const [healthCheck, setHealthCheck] = useState(true);

  const handleSubmit = () => {
    const timeSeconds = parseFloat(time);
    const mph = calculateFastCatMph(timeSeconds, 100);

    const score: Omit<Score, 'scoredAt' | 'syncStatus'> = {
      entryId: entry.id,
      armband: entry.armband,
      time: time,
      mph: mph,
      healthCheckPassed: healthCheck,
      qualifying: healthCheck && timeSeconds > 0 ? 'Q' : 'NQ'
    };

    submitScore(score);
  };

  return (
    <div>
      <input
        type="number"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        placeholder="Time (seconds)"
      />
      <label>
        <input
          type="checkbox"
          checked={healthCheck}
          onChange={(e) => setHealthCheck(e.target.checked)}
        />
        Health Check Passed
      </label>
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
```

### Nationals Scoring

```typescript
import {
  useScoringStore,
  calculateNationalsPoints,
  getNationalsMaxTime,
  type Score
} from '@myk9/scoring';

function NationalsScoring({ element, day }: {
  element: string;
  day: 1 | 2 | 3;
}) {
  const { submitScore } = useScoringStore();
  const [correct, setCorrect] = useState(0);
  const [incorrect, setIncorrect] = useState(0);
  const [finishErrors, setFinishErrors] = useState(0);
  const [totalTime, setTotalTime] = useState(0);

  const maxTime = getNationalsMaxTime(element, day);

  const handleSubmit = () => {
    const points = calculateNationalsPoints({
      correctCount: correct,
      incorrectCount: incorrect,
      finishCallErrors: finishErrors,
      totalTime: totalTime,
      maxTime: maxTime,
      competitionDay: day
    });

    const score: Omit<Score, 'scoredAt' | 'syncStatus'> = {
      entryId: entry.id,
      armband: entry.armband,
      time: formatTimeDisplay(totalTime),
      points: points,
      correctCount: correct,
      incorrectCount: incorrect,
      finishCallErrors: finishErrors,
      qualifying: points > 0 ? 'Q' : 'NQ'
    };

    submitScore(score);
  };

  return (
    <div>
      <h2>{element} - Day {day}</h2>
      <input
        type="number"
        value={correct}
        onChange={(e) => setCorrect(parseInt(e.target.value))}
        placeholder="Correct alerts"
      />
      <input
        type="number"
        value={incorrect}
        onChange={(e) => setIncorrect(parseInt(e.target.value))}
        placeholder="Incorrect alerts"
      />
      <input
        type="number"
        value={finishErrors}
        onChange={(e) => setFinishErrors(parseInt(e.target.value))}
        placeholder="Finish call errors"
      />
      <button onClick={handleSubmit}>Submit</button>
    </div>
  );
}
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

- **zustand** (^5.0.10) - State management

### Peer Dependencies

- **react** (^18.0.0 or ^19.0.0)

### Dev Dependencies

- **typescript** (~5.9.3)
- **tsup** (^8.5.1)

## Used By

- **@myk9/q** - myK9Q application (primary user)
- **@myk9/show** - myK9Show application (scoring features)
- **@myk9/scoring-ui** - Scoring UI components layer

## Contributing

When contributing to `@myk9/scoring`:

1. **Accuracy first** - Scoring calculations must match official rules
2. **Type safety** - Full TypeScript coverage with strict types
3. **Organization support** - Add new organizations carefully
4. **Store patterns** - Follow Zustand best practices
5. **Pure utilities** - Calculation functions should be pure
6. **Test calculations** - Add tests for scoring formulas

### Adding a New Organization

1. Add competition type to `CompetitionType`
2. Create scoring logic in utils
3. Add specific fields to `Score` type if needed
4. Update this README with examples
5. Test with real-world data

## Best Practices

### 1. Use Stores for Session Management

```typescript
// Good: Use the scoring store
const { startScoringSession } = useScoringStore();

// Avoid: Local state for session
const [session, setSession] = useState(null);
```

### 2. Optimistic Updates with Sync Status

```typescript
// Submit immediately (optimistic)
submitScore(scoreData);

// Sync in background
try {
  await syncToServer(scoreData);
  updateScoreSync(entryId, 'synced');
} catch (error) {
  updateScoreSync(entryId, 'error');
  // Show retry option
}
```

### 3. Use Timer Store for Multi-Area

```typescript
// Good: Use timer store for scent work
const { startTimer, stopTimer } = useTimerStore();

// Avoid: Local timers
const [startTime, setStartTime] = useState(null);
```

## License

Private - myK9 Platform

## Support

For questions or issues related to `@myk9/scoring`:
- Review this README and source code
- Check organization-specific rules
- Consult project CLAUDE.md for patterns
- Test calculations with known results
- Ask in team chat

---

**Version:** 0.0.1
**Last Updated:** 2026-02-03

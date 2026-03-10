# Exhibitor Notifications Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared `@myk9/notifications` package and wire show-day alerts for myK9Show exhibitors — sound, voice, vibration, toast, and push notifications.

**Architecture:** Pure TypeScript package (`@myk9/notifications`) holds all notification logic with zero React dependency. myK9Show consumes it via a Zustand store + React hooks that watch `useShowDayData` for trigger conditions and deliver alerts through multiple channels.

**Tech Stack:** TypeScript, Zustand (persist middleware), Web Audio API, Web Speech API, Web Push API, Sonner (toasts), vite-plugin-pwa (service worker), Supabase Edge Functions (push delivery).

**Spec:** `docs/superpowers/specs/2026-03-09-exhibitor-notifications-design.md`

**Reference code:** myK9Q notification services in `apps/myk9q/src/services/notification*.ts` and `apps/myk9q/src/utils/notification-voice.ts` — use as design reference, not copy-paste.

---

## Chunk 1: Package Scaffold + Types + Suppression + Handlers

### Task 1: Scaffold `@myk9/notifications` package

**Files:**

- Create: `packages/notifications/package.json`
- Create: `packages/notifications/tsconfig.json`
- Create: `packages/notifications/tsup.config.ts`
- Create: `packages/notifications/vitest.config.ts`
- Create: `packages/notifications/src/index.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@myk9/notifications",
  "version": "0.0.1",
  "description": "Notification logic for dog show alerts — sound, voice, push, suppression",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "devDependencies": {
    "@myk9/test-utils": "workspace:*",
    "@vitest/coverage-v8": "^4.0.18",
    "tsup": "^8.5.1",
    "typescript": "~5.9.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "composite": false
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

Note: No `jsx` setting — this package is pure TypeScript, no React.

- [ ] **Step 3: Create `tsup.config.ts`**

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  treeshake: true,
  splitting: false,
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
      exclude: ['node_modules/', '**/*.d.ts', '**/*.config.*'],
    },
  },
});
```

Note: `jsdom` environment because modules use browser APIs (AudioContext, SpeechSynthesis, etc.).

- [ ] **Step 5: Create empty barrel export**

Create `packages/notifications/src/index.ts`:

```typescript
// @myk9/notifications — public API
// Modules will be re-exported here as they are built.
```

- [ ] **Step 6: Install dependencies and verify build**

```bash
cd /path/to/myk9-platform
pnpm install
cd packages/notifications && pnpm build && pnpm typecheck
```

Expected: Clean build with empty `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 7: Commit**

```bash
git add packages/notifications/
git commit -m "feat(notifications): scaffold @myk9/notifications package"
```

---

### Task 2: Types module

**Files:**

- Create: `packages/notifications/src/types.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
/** Notification event types triggered by show-day activity */
export type NotificationType =
  | 'your_turn'
  | 'results_posted'
  | 'class_starting'
  | 'check_in_reminder'
  | 'announcement';

/** Audio/visual urgency tier */
export type NotificationPriority = 'normal' | 'high' | 'urgent';

/** Payload delivered through all channels (toast, sound, voice, push) */
export interface NotificationPayload {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  data?: Record<string, unknown>;
  timestamp: number;
}

/** User's per-device notification preferences (persisted to localStorage) */
export interface NotificationPreferences {
  /** Master on/off toggle */
  enabled: boolean;
  /** How many dogs ahead triggers "your turn" alert (1-5) */
  leadDogs: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
  pushEnabled: boolean;
}

/** Default preferences for new users */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  leadDogs: 3,
  soundEnabled: true,
  voiceEnabled: false,
  vibrationEnabled: true,
  pushEnabled: false,
};

/** Context passed to suppression checks */
export interface SuppressionContext {
  isInRing: boolean;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Update `packages/notifications/src/index.ts`:

```typescript
// @myk9/notifications — public API
export type {
  NotificationType,
  NotificationPriority,
  NotificationPayload,
  NotificationPreferences,
  SuppressionContext,
} from './types';

export { DEFAULT_PREFERENCES } from './types';
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/notifications && pnpm typecheck
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/notifications/src/types.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add core types and default preferences"
```

---

### Task 3: Suppression module (TDD)

**Files:**

- Create: `packages/notifications/src/suppression.ts`
- Create: `packages/notifications/src/suppression.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/suppression.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { shouldSuppress } from './suppression';
import type { NotificationPreferences, SuppressionContext } from './types';
import { DEFAULT_PREFERENCES } from './types';

describe('shouldSuppress', () => {
  const defaultContext: SuppressionContext = { isInRing: false };

  it('returns false when enabled and not in ring', () => {
    expect(shouldSuppress(DEFAULT_PREFERENCES, defaultContext)).toBe(false);
  });

  it('returns true when master toggle is off', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, enabled: false };
    expect(shouldSuppress(prefs, defaultContext)).toBe(true);
  });

  it('returns true when dog is in ring', () => {
    const context: SuppressionContext = { isInRing: true };
    expect(shouldSuppress(DEFAULT_PREFERENCES, context)).toBe(true);
  });

  it('returns true when both disabled and in ring', () => {
    const prefs: NotificationPreferences = { ...DEFAULT_PREFERENCES, enabled: false };
    const context: SuppressionContext = { isInRing: true };
    expect(shouldSuppress(prefs, context)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

Expected: FAIL — `shouldSuppress` not found.

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/suppression.ts`:

```typescript
import type { NotificationPreferences, SuppressionContext } from './types';

/**
 * Determines whether notifications should be suppressed.
 * Returns true if the master toggle is off or the exhibitor's dog is currently in the ring.
 */
export function shouldSuppress(
  preferences: NotificationPreferences,
  context: SuppressionContext
): boolean {
  if (!preferences.enabled) return true;
  if (context.isInRing) return true;
  return false;
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export { shouldSuppress } from './suppression';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd packages/notifications && pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/suppression.ts packages/notifications/src/suppression.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add suppression logic with tests"
```

---

### Task 4: Handlers module (TDD)

Builds `NotificationPayload` objects for each notification type. Reference: `apps/myk9q/src/services/notificationHandlers.ts`.

**Files:**

- Create: `packages/notifications/src/handlers.ts`
- Create: `packages/notifications/src/handlers.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/handlers.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
  buildAnnouncementPayload,
} from './handlers';

// Mock crypto.randomUUID for deterministic IDs
beforeEach(() => {
  let counter = 0;
  vi.spyOn(crypto, 'randomUUID').mockImplementation(
    () => `test-uuid-${++counter}` as `${string}-${string}-${string}-${string}-${string}`
  );
});

describe('buildYourTurnPayload', () => {
  it('builds urgent payload with dogs-away count', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Bella',
      className: 'Open Agility',
      dogsAhead: 2,
      armband: '42',
    });

    expect(payload.type).toBe('your_turn');
    expect(payload.priority).toBe('urgent');
    expect(payload.title).toContain('Bella');
    expect(payload.body).toContain('2');
    expect(payload.body).toContain('Open Agility');
    expect(payload.data).toEqual(expect.objectContaining({ dogName: 'Bella', armband: '42' }));
  });

  it('says "you\'re up next" when 0 dogs ahead', () => {
    const payload = buildYourTurnPayload({
      dogName: 'Max',
      className: 'Novice Standard',
      dogsAhead: 0,
      armband: '7',
    });

    expect(payload.body).toMatch(/up next|your turn/i);
  });
});

describe('buildClassStartingPayload', () => {
  it('builds high priority payload', () => {
    const payload = buildClassStartingPayload({
      className: 'Novice Standard',
    });

    expect(payload.type).toBe('class_starting');
    expect(payload.priority).toBe('high');
    expect(payload.title).toContain('Novice Standard');
  });
});

describe('buildResultsPostedPayload', () => {
  it('builds normal priority payload', () => {
    const payload = buildResultsPostedPayload({
      dogName: 'Bella',
      className: 'Open Agility',
    });

    expect(payload.type).toBe('results_posted');
    expect(payload.priority).toBe('normal');
    expect(payload.body).toContain('Bella');
    expect(payload.body).toContain('Open Agility');
  });
});

describe('buildCheckInReminderPayload', () => {
  it('builds high priority payload', () => {
    const payload = buildCheckInReminderPayload({
      dogName: 'Max',
      className: 'Novice Standard',
    });

    expect(payload.type).toBe('check_in_reminder');
    expect(payload.priority).toBe('high');
    expect(payload.body).toContain('Max');
    expect(payload.body).toContain('Novice Standard');
  });
});

describe('buildAnnouncementPayload', () => {
  it('builds normal priority by default', () => {
    const payload = buildAnnouncementPayload({
      title: 'Gate change',
      body: 'Ring 2 moved to gate B',
    });

    expect(payload.type).toBe('announcement');
    expect(payload.priority).toBe('normal');
    expect(payload.title).toBe('Gate change');
    expect(payload.body).toBe('Ring 2 moved to gate B');
  });

  it('accepts custom priority', () => {
    const payload = buildAnnouncementPayload({
      title: 'Emergency',
      body: 'Show paused',
      priority: 'urgent',
    });

    expect(payload.priority).toBe('urgent');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

Expected: FAIL — handler functions not found.

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/handlers.ts`:

```typescript
import type { NotificationPayload, NotificationPriority } from './types';

interface YourTurnInput {
  dogName: string;
  className: string;
  dogsAhead: number;
  armband: string | null;
  ringNumber?: number;
}

interface ClassStartingInput {
  className: string;
  ringNumber?: number;
}

interface ResultsPostedInput {
  dogName: string;
  className: string;
}

interface CheckInReminderInput {
  dogName: string;
  className: string;
}

interface AnnouncementInput {
  title: string;
  body: string;
  priority?: NotificationPriority;
}

function makePayload(partial: Omit<NotificationPayload, 'id' | 'timestamp'>): NotificationPayload {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...partial,
  };
}

export function buildYourTurnPayload(input: YourTurnInput): NotificationPayload {
  const isNext = input.dogsAhead <= 0;
  const title = isNext
    ? `${input.dogName} — You're up!`
    : `${input.dogName} — ${input.dogsAhead} dogs away`;

  const ringSuffix = input.ringNumber ? ` (Ring ${input.ringNumber})` : '';
  const body = isNext
    ? `Your turn in ${input.className}${ringSuffix}`
    : `${input.dogsAhead} dogs ahead in ${input.className}${ringSuffix}`;

  return makePayload({
    type: 'your_turn',
    title,
    body,
    priority: 'urgent',
    data: {
      dogName: input.dogName,
      className: input.className,
      dogsAhead: input.dogsAhead,
      armband: input.armband,
      ringNumber: input.ringNumber ?? null,
    },
  });
}

export function buildClassStartingPayload(input: ClassStartingInput): NotificationPayload {
  const ringSuffix = input.ringNumber ? ` — Ring ${input.ringNumber}` : '';
  return makePayload({
    type: 'class_starting',
    title: `${input.className} starting${ringSuffix}`,
    body: `${input.className} is now in progress`,
    priority: 'high',
    data: { className: input.className, ringNumber: input.ringNumber ?? null },
  });
}

export function buildResultsPostedPayload(input: ResultsPostedInput): NotificationPayload {
  return makePayload({
    type: 'results_posted',
    title: 'Results posted',
    body: `${input.dogName} — ${input.className}`,
    priority: 'normal',
    data: { dogName: input.dogName, className: input.className },
  });
}

export function buildCheckInReminderPayload(input: CheckInReminderInput): NotificationPayload {
  return makePayload({
    type: 'check_in_reminder',
    title: 'Check in now',
    body: `${input.dogName} — ${input.className} check-in is open`,
    priority: 'high',
    data: { dogName: input.dogName, className: input.className },
  });
}

export function buildAnnouncementPayload(input: AnnouncementInput): NotificationPayload {
  return makePayload({
    type: 'announcement',
    title: input.title,
    body: input.body,
    priority: input.priority ?? 'normal',
  });
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
  buildAnnouncementPayload,
} from './handlers';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/notifications && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/handlers.ts packages/notifications/src/handlers.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add notification payload handlers with tests"
```

---

## Chunk 2: Sound + Voice + Voice-Text

### Task 5: Voice-text module (TDD)

Pure text generators — no browser APIs. Reference: `apps/myk9q/src/utils/notification-voice.ts`.

**Files:**

- Create: `packages/notifications/src/voice-text.ts`
- Create: `packages/notifications/src/voice-text.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/voice-text.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateVoiceText } from './voice-text';
import type { NotificationPayload } from './types';

function makePayload(
  overrides: Partial<NotificationPayload> & { type: NotificationPayload['type'] }
): NotificationPayload {
  return {
    id: 'test-id',
    title: '',
    body: '',
    priority: 'normal',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('generateVoiceText', () => {
  it('generates your-turn text with dogs ahead', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'your_turn',
        data: { dogName: 'Bella', dogsAhead: 2, className: 'Open Agility', armband: '42' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Bella');
    expect(result!.text).toContain('2');
    expect(result!.priority).toBe('high');
  });

  it('generates your-turn text for "up next"', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'your_turn',
        data: { dogName: 'Max', dogsAhead: 0, className: 'Novice Standard', armband: '7' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toMatch(/up next|your turn/i);
    expect(result!.priority).toBe('high');
  });

  it('generates results-posted text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'results_posted',
        data: { dogName: 'Bella', className: 'Open Agility' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Bella');
    expect(result!.priority).toBe('normal');
  });

  it('generates class-starting text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'class_starting',
        data: { className: 'Novice Standard' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Novice Standard');
    expect(result!.priority).toBe('normal');
  });

  it('generates check-in reminder text', () => {
    const result = generateVoiceText(
      makePayload({
        type: 'check_in_reminder',
        data: { dogName: 'Max', className: 'Open Agility' },
      })
    );

    expect(result).not.toBeNull();
    expect(result!.text).toContain('Max');
    expect(result!.text).toContain('check in');
  });

  it('returns null for announcement type', () => {
    const result = generateVoiceText(makePayload({ type: 'announcement' }));

    expect(result).toBeNull();
  });

  it('handles missing data gracefully', () => {
    const result = generateVoiceText(makePayload({ type: 'your_turn' }));

    expect(result).not.toBeNull();
    expect(result!.text.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/voice-text.ts`:

```typescript
import type { NotificationPayload } from './types';

export interface VoiceAnnouncementText {
  text: string;
  priority: 'normal' | 'high';
}

/**
 * Generates spoken-word text for a notification payload.
 * Returns null for types that shouldn't be spoken (e.g., announcements).
 */
export function generateVoiceText(payload: NotificationPayload): VoiceAnnouncementText | null {
  const data = payload.data ?? {};

  switch (payload.type) {
    case 'your_turn':
      return {
        text: generateYourTurnText(
          (data.dogName as string) ?? 'Your dog',
          (data.armband as string) ?? '',
          (data.dogsAhead as number) ?? 0
        ),
        priority: 'high',
      };

    case 'results_posted':
      return {
        text: `Results posted for ${(data.dogName as string) ?? 'your dog'} in ${(data.className as string) ?? 'class'}`,
        priority: 'normal',
      };

    case 'class_starting':
      return {
        text: `${(data.className as string) ?? 'Class'} is starting now`,
        priority: 'normal',
      };

    case 'check_in_reminder':
      return {
        text: `Time to check in ${(data.dogName as string) ?? 'your dog'} for ${(data.className as string) ?? 'class'}`,
        priority: 'normal',
      };

    case 'announcement':
      // Announcements are text-heavy; TTS would be noisy. Skip.
      return null;

    default:
      return null;
  }
}

function generateYourTurnText(dogName: string, armband: string, dogsAhead: number): string {
  const armbandSuffix = armband ? `, number ${armband}` : '';

  if (dogsAhead <= 0) {
    return `${dogName}${armbandSuffix}, you're up next`;
  }

  const dogWord = dogsAhead === 1 ? 'dog' : 'dogs';
  return `${dogName}${armbandSuffix}, you're ${dogsAhead} ${dogWord} away`;
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export type { VoiceAnnouncementText } from './voice-text';
export { generateVoiceText } from './voice-text';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/voice-text.ts packages/notifications/src/voice-text.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add voice text generators with tests"
```

---

### Task 6: Sound module (TDD)

Web Audio API tone synthesis. Reference: `apps/myk9q/src/services/notificationSoundService.ts`.

**Files:**

- Create: `packages/notifications/src/sound.ts`
- Create: `packages/notifications/src/sound.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/sound.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playNotificationSound, testSound } from './sound';
import type { NotificationPriority } from './types';

// Mock Web Audio API — use factory so each AudioContext instance shares tracked mocks
const createOscillator = vi.fn(() => ({
  type: 'sine' as OscillatorType,
  frequency: { setValueAtTime: vi.fn() },
  connect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
}));

const createGain = vi.fn(() => ({
  gain: {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  },
  connect: vi.fn(),
}));

const resume = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset module-level audioContext singleton between tests
  vi.resetModules();
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => ({
      state: 'running' as AudioContextState,
      currentTime: 0,
      destination: {},
      resume,
      createOscillator,
      createGain,
    }))
  );
});

describe('playNotificationSound', () => {
  it.each<NotificationPriority>(['normal', 'high', 'urgent'])(
    'creates oscillators for %s priority',
    async priority => {
      await playNotificationSound(priority);

      expect(createOscillator).toHaveBeenCalled();
      expect(createGain).toHaveBeenCalled();
    }
  );

  it('resumes suspended audio context', async () => {
    vi.resetModules();
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => ({
        state: 'suspended' as AudioContextState,
        currentTime: 0,
        destination: {},
        resume,
        createOscillator,
        createGain,
      }))
    );

    const { playNotificationSound: play } = await import('./sound');
    await play('normal');

    expect(resume).toHaveBeenCalled();
  });

  it('does not throw when AudioContext is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined);

    await expect(playNotificationSound('normal')).resolves.not.toThrow();
  });
});

describe('testSound', () => {
  it('plays a normal priority sound by default', async () => {
    await testSound();

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });

  it('plays specified priority', async () => {
    await testSound('urgent');

    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/sound.ts`:

```typescript
import type { NotificationPriority } from './types';

let audioContext: AudioContext | null = null;
let lastPlayTime = 0;
const THROTTLE_MS = 1000;

function getAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

async function ensureResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
}

function playTone(
  ctx: AudioContext,
  frequency: number,
  startOffset: number,
  duration: number,
  volume: number
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + startOffset);

  gain.gain.setValueAtTime(0, ctx.currentTime + startOffset);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + startOffset + 0.02);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + startOffset + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(ctx.currentTime + startOffset);
  oscillator.stop(ctx.currentTime + startOffset + duration);
}

/**
 * Plays a synthesized notification chime.
 * - normal: gentle two-tone chime
 * - high: ascending three-tone alert
 * - urgent: rapid ascending pattern with repeat
 */
export async function playNotificationSound(priority: NotificationPriority): Promise<void> {
  const now = Date.now();
  if (now - lastPlayTime < THROTTLE_MS) return;
  lastPlayTime = now;

  const ctx = getAudioContext();
  if (!ctx) return;

  await ensureResumed(ctx);

  switch (priority) {
    case 'normal':
      // Gentle two-tone chime: A5 → C6
      playTone(ctx, 880, 0, 0.15, 0.3);
      playTone(ctx, 1047, 0.15, 0.2, 0.3);
      break;

    case 'high':
      // Ascending three-tone: G5 → B5 → D6
      playTone(ctx, 784, 0, 0.12, 0.4);
      playTone(ctx, 988, 0.12, 0.12, 0.4);
      playTone(ctx, 1175, 0.24, 0.18, 0.4);
      break;

    case 'urgent':
      // Rapid ascending with repeat
      playTone(ctx, 784, 0, 0.1, 0.5);
      playTone(ctx, 988, 0.1, 0.1, 0.5);
      playTone(ctx, 1175, 0.2, 0.1, 0.5);
      playTone(ctx, 784, 0.4, 0.1, 0.5);
      playTone(ctx, 988, 0.5, 0.1, 0.5);
      playTone(ctx, 1175, 0.6, 0.15, 0.5);
      break;
  }
}

/** Plays a test sound at the specified priority (defaults to normal). */
export async function testSound(priority: NotificationPriority = 'normal'): Promise<void> {
  // Bypass throttle for test sounds
  lastPlayTime = 0;
  await playNotificationSound(priority);
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export { playNotificationSound, testSound } from './sound';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/sound.ts packages/notifications/src/sound.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add Web Audio tone synthesis with tests"
```

---

### Task 7: Voice module (TDD)

SpeechSynthesis wrapper. Reference: `apps/myk9q/src/services/voiceAnnouncementService.ts`.

**Files:**

- Create: `packages/notifications/src/voice.ts`
- Create: `packages/notifications/src/voice.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/voice.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { speak, cancelSpeech, isSpeechSupported } from './voice';

const mockUtterance = {
  text: '',
  lang: '',
  rate: 1,
  pitch: 1,
  volume: 1,
};

const mockSpeechSynthesis = {
  speak: vi.fn(),
  cancel: vi.fn(),
  speaking: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    vi.fn(() => ({ ...mockUtterance }))
  );
  vi.stubGlobal('speechSynthesis', { ...mockSpeechSynthesis });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isSpeechSupported', () => {
  it('returns true when SpeechSynthesis is available', () => {
    expect(isSpeechSupported()).toBe(true);
  });

  it('returns false when SpeechSynthesis is unavailable', () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(isSpeechSupported()).toBe(false);
  });
});

describe('speak', () => {
  it('creates utterance and calls speechSynthesis.speak', () => {
    speak('Hello world');
    vi.advanceTimersByTime(100); // Chrome bug workaround delay

    expect(SpeechSynthesisUtterance).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('cancels current speech before speaking', () => {
    vi.stubGlobal('speechSynthesis', { ...mockSpeechSynthesis, speaking: true });

    speak('New text');
    vi.advanceTimersByTime(100);

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
  });

  it('does nothing when speech is not supported', () => {
    vi.stubGlobal('speechSynthesis', undefined);

    expect(() => speak('Test')).not.toThrow();
  });
});

describe('cancelSpeech', () => {
  it('calls speechSynthesis.cancel', () => {
    cancelSpeech();

    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/voice.ts`:

```typescript
/**
 * Checks whether the browser supports SpeechSynthesis.
 */
export function isSpeechSupported(): boolean {
  return typeof speechSynthesis !== 'undefined';
}

/**
 * Speaks the given text using the Web Speech API.
 * Cancels any in-progress speech before starting.
 */
export function speak(text: string): void {
  if (!isSpeechSupported()) return;

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;

  // Chrome bug: small delay after cancel before speaking
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 100);
}

/**
 * Cancels any in-progress speech.
 */
export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  speechSynthesis.cancel();
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export { speak, cancelSpeech, isSpeechSupported } from './voice';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/voice.ts packages/notifications/src/voice.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add SpeechSynthesis voice wrapper with tests"
```

---

## Chunk 3: Push Subscription + DB Migration + Edge Function

### Task 8: Push subscription module (TDD)

VAPID subscription lifecycle. Reference: `apps/myk9q/src/services/pushNotificationService.ts`.

**Files:**

- Create: `packages/notifications/src/push.ts`
- Create: `packages/notifications/src/push.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/notifications/src/push.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from './push';

const mockSubscription = {
  endpoint: 'https://push.example.com/sub/123',
  toJSON: () => ({
    endpoint: 'https://push.example.com/sub/123',
    keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

const mockPushManager = {
  getSubscription: vi.fn().mockResolvedValue(null),
  subscribe: vi.fn().mockResolvedValue(mockSubscription),
};

const mockRegistration = {
  pushManager: mockPushManager,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  });
  vi.stubGlobal('navigator', {
    serviceWorker: {
      ready: Promise.resolve(mockRegistration),
    },
  });
});

describe('isPushSupported', () => {
  it('returns true when all APIs are available', () => {
    expect(isPushSupported()).toBe(true);
  });

  it('returns false when serviceWorker is missing', () => {
    vi.stubGlobal('navigator', {});
    expect(isPushSupported()).toBe(false);
  });
});

describe('requestPushPermission', () => {
  it('returns granted when user allows', async () => {
    const result = await requestPushPermission();
    expect(result).toBe('granted');
  });

  it('returns current permission if already decided', async () => {
    vi.stubGlobal('Notification', { permission: 'denied' });
    const result = await requestPushPermission();
    expect(result).toBe('denied');
  });
});

describe('subscribeToPush', () => {
  it('subscribes with VAPID key and returns subscription data', async () => {
    const result = await subscribeToPush('test-vapid-key');

    expect(mockPushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        userVisibleOnly: true,
        applicationServerKey: expect.any(Uint8Array),
      })
    );
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });

  it('returns existing subscription if already subscribed', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await subscribeToPush('test-vapid-key');

    expect(mockPushManager.subscribe).not.toHaveBeenCalled();
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });
});

describe('unsubscribeFromPush', () => {
  it('unsubscribes existing subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await unsubscribeFromPush();

    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('returns false when no subscription exists', async () => {
    const result = await unsubscribeFromPush();
    expect(result).toBe(false);
  });
});

describe('getExistingSubscription', () => {
  it('returns null when no subscription exists', async () => {
    const result = await getExistingSubscription();
    expect(result).toBeNull();
  });

  it('returns subscription data when one exists', async () => {
    mockPushManager.getSubscription.mockResolvedValueOnce(mockSubscription);

    const result = await getExistingSubscription();
    expect(result).toEqual({
      endpoint: 'https://push.example.com/sub/123',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 3: Write implementation**

Create `packages/notifications/src/push.ts`:

```typescript
export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Checks whether the browser supports push notifications.
 */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof Notification !== 'undefined'
  );
}

/**
 * Requests notification permission from the user.
 * Returns the resulting permission state.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/**
 * Converts a base64-encoded VAPID key to Uint8Array for the Push API.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from(rawData, char => char.charCodeAt(0));
}

/**
 * Subscribes to push notifications using VAPID key.
 * Returns subscription data to be saved server-side, or existing subscription.
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscriptionData> {
  const registration = await navigator.serviceWorker.ready;

  // Check for existing subscription
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return extractSubscriptionData(existing);
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  return extractSubscriptionData(subscription);
}

/**
 * Unsubscribes from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;
  return subscription.unsubscribe();
}

/**
 * Returns the current push subscription data, or null if not subscribed.
 */
export async function getExistingSubscription(): Promise<PushSubscriptionData | null> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  return extractSubscriptionData(subscription);
}

function extractSubscriptionData(subscription: PushSubscription): PushSubscriptionData {
  const json = subscription.toJSON();
  return {
    endpoint: json.endpoint!,
    keys: {
      p256dh: json.keys!.p256dh as string,
      auth: json.keys!.auth as string,
    },
  };
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Add to `packages/notifications/src/index.ts`:

```typescript
export type { PushSubscriptionData } from './push';
export {
  isPushSupported,
  requestPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getExistingSubscription,
} from './push';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/notifications && pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add packages/notifications/src/push.ts packages/notifications/src/push.test.ts packages/notifications/src/index.ts
git commit -m "feat(notifications): add push subscription lifecycle with tests"
```

---

### Task 9: Database migration for `push_subscriptions`

**Files:**

- Create: `supabase/migrations/007_push_subscriptions.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Push notification subscriptions for Web Push API
-- Used by both myK9Show and myK9Q (shared Supabase project)

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  keys jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);

create index idx_push_subscriptions_user_id on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

create policy "Users manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Verify migration syntax**

```bash
cd /path/to/myk9-platform && supabase migration list
```

Check that the next migration number is 007. If not, adjust the filename accordingly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_push_subscriptions.sql
git commit -m "feat(notifications): add push_subscriptions table migration"
```

**Note:** Do NOT run `supabase db push` yet — apply after the full feature is ready to deploy.

---

### Task 10: Edge Function for sending push notifications

**Files:**

- Create: `supabase/functions/send-push-notification/index.ts`

- [ ] **Step 1: Create edge function**

Look at existing edge functions in `supabase/functions/` for pattern reference (auth handling, CORS, response format).

**Deno compatibility note:** The `web-push` npm package relies on Node.js `crypto` module internals. In Deno/Supabase Edge Functions, use `web-push` via `npm:` specifier (Supabase supports Node.js built-ins in Edge Functions) or implement Web Push protocol directly with `crypto.subtle`. The implementation below uses the `npm:` specifier approach. If it doesn't work at deploy time, the fallback is to use `crypto.subtle` directly for VAPID JWT signing and payload encryption — reference the Web Push protocol spec (RFC 8291).

Create `supabase/functions/send-push-notification/index.ts`:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!;
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@myk9show.com';

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user_id, payload } = await req.json();

    if (!user_id || !payload) {
      return new Response(JSON.stringify({ error: 'user_id and payload are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, keys')
      .eq('user_id', user_id);

    if (error) throw error;
    if (!subscriptions?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'No subscriptions found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    const errors: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired — clean up
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
        errors.push(`${sub.endpoint}: ${(err as Error).message}`);
      }
    }

    return new Response(JSON.stringify({ sent, errors: errors.length ? errors : undefined }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-push-notification/
git commit -m "feat(notifications): add send-push-notification edge function"
```

**Note:** Deployment requires VAPID env vars to be set in Supabase dashboard first. Do not deploy until keys are configured.

---

## Chunk 4: myK9Show Stub Cleanup + ShowDayClass Update

### Task 11: Delete unwired notification stubs

Before building new notification code, remove the stubs that will be replaced. This prevents import confusion during development.

**Files:**

- Delete: `apps/myk9show/src/services/NotificationService.ts`
- Delete: `apps/myk9show/src/services/EnhancedNotificationService.ts`
- Delete: `apps/myk9show/src/components/common/NotificationCenter.tsx`
- Delete: `apps/myk9show/src/hooks/useSmartNotifications.ts`
- Delete: `apps/myk9show/src/types/notification-types.ts`
- Modify: All files that import the deleted modules (see list below)

**Important:** These stubs are imported in several files. Each import site must be updated to remove the dead import. Some files may use the imports (e.g., `AppHeader` renders `NotificationCenter`) — those sites need a temporary placeholder or removal.

- [ ] **Step 1: Search for all import sites**

```bash
cd apps/myk9show
grep -rn "from.*NotificationService\|from.*EnhancedNotificationService\|from.*NotificationCenter\|from.*useSmartNotifications\|from.*notification-types" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | grep -v ".test."
```

Document every file and line that imports from the deleted modules. The research found these key import sites:

**NotificationService imports:**

- `src/services/EnhancedNotificationService.ts` (being deleted — OK)
- `src/pages/MyEntriesPage/modules/useMyEntriesData.ts`
- `src/pages/BrowseShowsPage.tsx`
- `src/pages/JudgeDashboard.tsx`
- `src/services/ImpersonationService.ts`
- `src/pages/secretary/WaitlistManagementPage/useWaitlistManagementData.ts`
- `src/hooks/live-competition/eventListeners.ts`
- `src/hooks/live-competition/types.ts`
- `src/hooks/useLiveCompetition.ts`

**NotificationCenter imports:**

- `src/components/layout/AppHeader.tsx`
- `src/components/sync/overview/ComprehensiveSyncDashboard.tsx`
- `src/components/sync/index.ts`
- `src/components/sync/ConflictResolutionManager.tsx`
- `src/components/alerts/index.ts`

**useSmartNotifications imports:**

- `src/components/common/NotificationCenter.tsx` (being deleted — OK)

**notification-types imports:**

- `src/services/notifications/NotificationTemplates.ts`

- [ ] **Step 2: Remove imports from each file**

For each file above, open it and:

1. Remove the import line referencing the deleted module
2. Remove any usage of the imported symbol (likely dead code, since these stubs were unwired)
3. If removing usage leaves the file empty or broken, use `// TODO: Phase 6 notifications` placeholder

For `AppHeader.tsx` specifically: remove the `<NotificationCenter />` render and its import. The `NotificationBell` component will be added in Task 16. **Note:** Between Task 11 and Task 16, the header will have no notification UI — this is an intentional temporary regression during development.

- [ ] **Step 3: Delete the stub files**

```bash
rm apps/myk9show/src/services/NotificationService.ts
rm apps/myk9show/src/services/EnhancedNotificationService.ts
rm apps/myk9show/src/components/common/NotificationCenter.tsx
rm apps/myk9show/src/hooks/useSmartNotifications.ts
rm apps/myk9show/src/types/notification-types.ts
```

- [ ] **Step 4: Also delete the test file for EnhancedNotificationService**

```bash
rm apps/myk9show/src/test/services/EnhancedNotificationService.test.ts
```

- [ ] **Step 5: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Fix any remaining broken imports. Expected: some files may have used `NotificationService` types — remove those usages.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(myk9show): remove unwired notification stubs (Phase 6 prep)"
```

---

### Task 12: Add `ringNumber` to `ShowDayClass`

The voice-text module needs ring number for context-rich announcements.

**Files:**

- Modify: `apps/myk9show/src/types/show-day-types.ts`
- Modify: `apps/myk9show/src/hooks/queries/useShowDayData.ts`

- [ ] **Step 1: Add `ringNumber` to `ShowDayClass` type**

In `apps/myk9show/src/types/show-day-types.ts`, add to the `ShowDayClass` interface after line 63 (`estimatedTimeMinutes`):

```typescript
ringNumber: number | null;
```

- [ ] **Step 2: Add `ringNumber` to `ShowDayDetailRow`**

In the same file, add `ring_number` to the `class` object in `ShowDayDetailRow` (after line 111, `scored_count`):

```typescript
ring_number: number | null;
```

- [ ] **Step 3: Update the `useShowDayData` hook**

In `apps/myk9show/src/hooks/queries/useShowDayData.ts`, find where `ShowDayClass` objects are constructed from `ShowDayDetailRow` data. Add `ringNumber: row.class.ring_number` to the mapped object.

Also update the Supabase select query to include `ring_number` in the class fields.

- [ ] **Step 4: Add a test for ringNumber mapping**

In the existing `useShowDayData` test file, add a test verifying `ringNumber` is mapped from `row.class.ring_number`:

```typescript
it('maps ring_number to ringNumber in ShowDayClass', () => {
  // Add a test that verifies the mapping.
  // The exact test depends on how useShowDayData is tested (mock Supabase response).
  // Verify: when the query returns ring_number: 3, the mapped ShowDayClass has ringNumber: 3.
  // When ring_number is null, ringNumber should be null.
});
```

- [ ] **Step 5: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Run show-day tests**

```bash
cd apps/myk9show && pnpm test -- --grep "useShowDayData\|show-day"
```

Expected: All tests pass including the new ringNumber test.

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/types/show-day-types.ts apps/myk9show/src/hooks/queries/useShowDayData.ts
git commit -m "feat(myk9show): add ringNumber to ShowDayClass type and query"
```

---

## Chunk 5: Notification Store + Delivery Hook + Alert Trigger Hook

### Task 13: Notification store (Zustand)

**Files:**

- Create: `apps/myk9show/src/store/notificationStore.ts`
- Create: `apps/myk9show/src/store/__tests__/notificationStore.test.ts`

**Dependencies:** `@myk9/notifications` package must be installed in `apps/myk9show`. Add to `apps/myk9show/package.json`:

```json
"@myk9/notifications": "workspace:*"
```

Then run:

```bash
pnpm install
cd packages/notifications && pnpm build  # Must build package before app can import it
```

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/store/__tests__/notificationStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useNotificationStore } from '../notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(id: string): NotificationPayload {
  return {
    id,
    type: 'your_turn',
    title: 'Test',
    body: 'Test body',
    priority: 'urgent',
    timestamp: Date.now(),
  };
}

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      permissionStatus: 'default' as NotificationPermission,
      isInRing: false,
      recentAlerts: [],
    });
  });

  it('initializes with default preferences', () => {
    const state = useNotificationStore.getState();
    expect(state.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(state.isInRing).toBe(false);
    expect(state.recentAlerts).toEqual([]);
  });

  it('updates preferences partially', () => {
    useNotificationStore.getState().updatePreferences({ leadDogs: 5 });
    const state = useNotificationStore.getState();
    expect(state.preferences.leadDogs).toBe(5);
    expect(state.preferences.enabled).toBe(true); // unchanged
  });

  it('clamps leadDogs to 1-5 range', () => {
    useNotificationStore.getState().updatePreferences({ leadDogs: 0 });
    expect(useNotificationStore.getState().preferences.leadDogs).toBe(1);

    useNotificationStore.getState().updatePreferences({ leadDogs: 10 });
    expect(useNotificationStore.getState().preferences.leadDogs).toBe(5);
  });

  it('sets isInRing', () => {
    useNotificationStore.getState().setInRing(true);
    expect(useNotificationStore.getState().isInRing).toBe(true);
  });

  it('adds alert to recent list as unread', () => {
    const payload = makePayload('1');
    useNotificationStore.getState().addAlert(payload);

    const alerts = useNotificationStore.getState().recentAlerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].payload).toEqual(payload);
    expect(alerts[0].read).toBe(false);
  });

  it('limits recent alerts to 10', () => {
    for (let i = 0; i < 12; i++) {
      useNotificationStore.getState().addAlert(makePayload(`id-${i}`));
    }

    expect(useNotificationStore.getState().recentAlerts).toHaveLength(10);
    // Most recent should be first
    expect(useNotificationStore.getState().recentAlerts[0].payload.id).toBe('id-11');
  });

  it('marks all alerts as read', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    useNotificationStore.getState().markAllRead();

    const alerts = useNotificationStore.getState().recentAlerts;
    expect(alerts.every(a => a.read)).toBe(true);
  });

  it('counts unread alerts', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    useNotificationStore.getState().markAllRead();
    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && pnpm test -- src/store/__tests__/notificationStore.test.ts
```

- [ ] **Step 3: Write implementation**

Create `apps/myk9show/src/store/notificationStore.ts`:

```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { NotificationPayload, NotificationPreferences } from '@myk9/notifications';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

interface AlertEntry {
  payload: NotificationPayload;
  read: boolean;
}

interface NotificationState {
  preferences: NotificationPreferences;
  permissionStatus: NotificationPermission;
  isInRing: boolean;
  recentAlerts: AlertEntry[];
  unreadCount: number;

  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  requestPermission: () => Promise<void>;
  setInRing: (value: boolean) => void;
  addAlert: (payload: NotificationPayload) => void;
  markAllRead: () => void;
}

const MAX_RECENT_ALERTS = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    set => ({
      preferences: { ...DEFAULT_PREFERENCES },
      permissionStatus: 'default' as NotificationPermission,
      isInRing: false,
      recentAlerts: [],
      unreadCount: 0,

      updatePreferences: prefs =>
        set(state => {
          const updated = { ...state.preferences, ...prefs };
          if ('leadDogs' in prefs) {
            updated.leadDogs = clamp(updated.leadDogs, 1, 5);
          }
          return { preferences: updated };
        }),

      requestPermission: async () => {
        if (typeof Notification === 'undefined') {
          set({ permissionStatus: 'denied' });
          return;
        }
        if (Notification.permission !== 'default') {
          set({ permissionStatus: Notification.permission });
          return;
        }
        const result = await Notification.requestPermission();
        set({ permissionStatus: result });
      },

      setInRing: value => set({ isInRing: value }),

      addAlert: payload =>
        set(state => {
          const entry: AlertEntry = { payload, read: false };
          const updated = [entry, ...state.recentAlerts].slice(0, MAX_RECENT_ALERTS);
          return {
            recentAlerts: updated,
            unreadCount: updated.filter(a => !a.read).length,
          };
        }),

      markAllRead: () =>
        set(state => ({
          recentAlerts: state.recentAlerts.map(a => ({ ...a, read: true })),
          unreadCount: 0,
        })),
    }),
    {
      name: 'myk9-notification-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: state => ({
        preferences: state.preferences,
      }),
    }
  )
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/myk9show && pnpm test -- src/store/__tests__/notificationStore.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/store/notificationStore.ts apps/myk9show/src/store/__tests__/notificationStore.test.ts apps/myk9show/package.json pnpm-lock.yaml
git commit -m "feat(myk9show): add notification Zustand store with tests"
```

---

### Task 14: Delivery hook (`useNotificationDelivery`)

Orchestrates multi-channel delivery: toast + sound + voice + vibration + push.

**Files:**

- Create: `apps/myk9show/src/hooks/useNotificationDelivery.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNotificationDelivery } from '../useNotificationDelivery';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

// Mock @myk9/notifications
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return {
    ...actual,
    shouldSuppress: vi.fn(() => false),
    playNotificationSound: vi.fn(),
    speak: vi.fn(),
    generateVoiceText: vi.fn(() => ({ text: 'test voice text', priority: 'normal' })),
  };
});

// Mock Sonner toast
vi.mock('@/lib/notifications', () => ({
  notifications: {
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

import { shouldSuppress, playNotificationSound, speak } from '@myk9/notifications';
import { notifications as toastNotifications } from '@/lib/notifications';

const mockPayload: NotificationPayload = {
  id: 'test-1',
  type: 'your_turn',
  title: 'Test Title',
  body: 'Test Body',
  priority: 'urgent',
  timestamp: Date.now(),
};

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('useNotificationDelivery', () => {
  it('delivers toast notification', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(toastNotifications.warning).toHaveBeenCalled();
  });

  it('plays sound when soundEnabled', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(playNotificationSound).toHaveBeenCalledWith('urgent');
  });

  it('skips sound when soundEnabled is false', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, soundEnabled: false },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('speaks when voiceEnabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(speak).toHaveBeenCalledWith('test voice text');
  });

  it('suppresses all channels when shouldSuppress returns true', () => {
    vi.mocked(shouldSuppress).mockReturnValueOnce(true);

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(toastNotifications.info).not.toHaveBeenCalled();
    expect(toastNotifications.warning).not.toHaveBeenCalled();
    expect(playNotificationSound).not.toHaveBeenCalled();
  });

  it('vibrates when vibrationEnabled', () => {
    const mockVibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate: mockVibrate });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(mockVibrate).toHaveBeenCalled();
  });

  it('skips vibration when vibrationEnabled is false', () => {
    const mockVibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate: mockVibrate });
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, vibrationEnabled: false },
    });

    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it('adds alert to store', () => {
    const { result } = renderHook(() => useNotificationDelivery());

    act(() => {
      result.current.deliver(mockPayload);
    });

    const state = useNotificationStore.getState();
    expect(state.recentAlerts).toHaveLength(1);
    expect(state.recentAlerts[0].payload.id).toBe('test-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && pnpm test -- src/hooks/__tests__/useNotificationDelivery.test.ts
```

- [ ] **Step 3: Write implementation**

Create `apps/myk9show/src/hooks/useNotificationDelivery.ts`:

```typescript
import { useCallback } from 'react';
import type { NotificationPayload } from '@myk9/notifications';
import {
  shouldSuppress,
  playNotificationSound,
  speak,
  generateVoiceText,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { notifications } from '@/lib/notifications';

/**
 * Returns a `deliver` function that sends a notification through all enabled channels:
 * toast, sound, voice, vibration, and push (background tab).
 */
export function useNotificationDelivery() {
  const preferences = useNotificationStore(s => s.preferences);
  const isInRing = useNotificationStore(s => s.isInRing);
  const addAlert = useNotificationStore(s => s.addAlert);

  const deliver = useCallback(
    (payload: NotificationPayload) => {
      // Check suppression
      if (shouldSuppress(preferences, { isInRing })) return;

      // Always add to store (for bell dropdown)
      addAlert(payload);

      // Toast (always)
      const toastMethod =
        payload.priority === 'urgent'
          ? notifications.warning
          : payload.priority === 'high'
            ? notifications.warning
            : notifications.info;
      toastMethod(payload.title, { description: payload.body });

      // Sound
      if (preferences.soundEnabled) {
        playNotificationSound(payload.priority);
      }

      // Voice
      if (preferences.voiceEnabled) {
        const voiceText = generateVoiceText(payload);
        if (voiceText) {
          speak(voiceText.text);
        }
      }

      // Vibration
      if (preferences.vibrationEnabled && navigator.vibrate) {
        const pattern = payload.priority === 'urgent' ? [200, 100, 200, 100, 200] : [150];
        navigator.vibrate(pattern);
      }
    },
    [preferences, isInRing, addAlert]
  );

  return { deliver };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && pnpm test -- src/hooks/__tests__/useNotificationDelivery.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationDelivery.ts apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts
git commit -m "feat(myk9show): add useNotificationDelivery hook with tests"
```

---

### Task 15: Alert trigger hook (`useShowDayAlerts`)

Watches `useShowDayData` and fires notifications. This is the core integration point.

**Files:**

- Create: `apps/myk9show/src/hooks/useShowDayAlerts.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useShowDayAlerts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/hooks/__tests__/useShowDayAlerts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useShowDayAlerts } from '../useShowDayAlerts';
import type { ShowDayData, ShowDayClass } from '@/types/show-day-types';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock the delivery hook
const mockDeliver = vi.fn();
vi.mock('../useNotificationDelivery', () => ({
  useNotificationDelivery: () => ({ deliver: mockDeliver }),
}));

function makeClass(overrides: Partial<ShowDayClass> = {}): ShowDayClass {
  return {
    classId: 'class-1',
    className: 'Open Agility',
    element: null,
    level: null,
    dogCallName: 'Bella',
    dogId: 'dog-1',
    armband: '42',
    entryId: 'entry-1',
    totalEntries: 20,
    scoredEntries: 15,
    currentDogInRing: null,
    myRunningOrder: 18,
    estimatedTimeMinutes: 9,
    entryStatus: 'checked-in',
    isScored: false,
    resultStatus: null,
    classStatus: 'in_progress',
    showId: 'show-1',
    showName: 'Test Show',
    trialDate: '2026-03-09',
    ringNumber: null,
    ...overrides,
  };
}

function makeShowDayData(overrides: Partial<ShowDayData> = {}): ShowDayData {
  return {
    isShowDay: true,
    activeShows: [],
    activeShow: null,
    myClasses: [],
    nextUp: null,
    completedToday: [],
    stats: { total: 0, completed: 0, qualified: 0 },
    isLoading: false,
    error: null,
    isStale: false,
    lastUpdated: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('useShowDayAlerts', () => {
  it('does nothing when loading', () => {
    const data = makeShowDayData({ isLoading: true });
    renderHook(() => useShowDayAlerts(data));

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  it('does nothing when error', () => {
    const data = makeShowDayData({ error: new Error('fail') });
    renderHook(() => useShowDayAlerts(data));

    expect(mockDeliver).not.toHaveBeenCalled();
  });

  // NOTE: The hook seeds "already seen" sets on initial mount and skips firing.
  // Tests that check for notifications must use a two-render pattern:
  // 1st render with initial state (seeds sets, no notifications fired)
  // 2nd render with changed state (detects transition, fires notification)

  it('fires your_turn when dog moves within leadDogs threshold', () => {
    // Initial: dog is far away (8 dogs ahead, beyond default leadDogs=3)
    const clsInitial = makeClass({ scoredEntries: 10, myRunningOrder: 18 });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    expect(mockDeliver).not.toHaveBeenCalled(); // Initial mount: no fire

    // Update: dog is now 3 away (within threshold)
    const clsUpdated = makeClass({ scoredEntries: 15, myRunningOrder: 18 });
    const dataUpdated = makeShowDayData({ myClasses: [clsUpdated] });
    rerender({ data: dataUpdated });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'your_turn' }));
  });

  it('does not fire your_turn when dog is beyond leadDogs threshold', () => {
    const cls = makeClass({ scoredEntries: 10, myRunningOrder: 18 }); // 8 ahead
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });

    // Still far away on second render
    const cls2 = makeClass({ scoredEntries: 11, myRunningOrder: 18 }); // 7 ahead
    rerender({ data: makeShowDayData({ myClasses: [cls2] }) });

    expect(mockDeliver).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'your_turn' }));
  });

  it('fires class_starting when class transitions to in_progress', () => {
    // Initial: class is not yet started
    const clsInitial = makeClass({ classStatus: 'scheduled' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    expect(mockDeliver).not.toHaveBeenCalled();

    // Transition: class starts
    const clsStarted = makeClass({ classStatus: 'in_progress' });
    rerender({ data: makeShowDayData({ myClasses: [clsStarted] }) });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'class_starting' }));
  });

  it('does not fire class_starting for classes already in_progress on mount', () => {
    const cls = makeClass({ classStatus: 'in_progress' });
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });
    rerender({ data }); // Same data, second render

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'class_starting' })
    );
  });

  it('fires check_in_reminder when check-in opens', () => {
    // Initial: class not open for check-in yet
    const clsInitial = makeClass({ classStatus: 'scheduled', entryStatus: 'no-status' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: check-in opens
    const clsOpen = makeClass({ classStatus: 'check_in_open', entryStatus: 'no-status' });
    rerender({ data: makeShowDayData({ myClasses: [clsOpen] }) });

    expect(mockDeliver).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'check_in_reminder' })
    );
  });

  it('does not fire check_in_reminder when already checked in', () => {
    const clsInitial = makeClass({ classStatus: 'scheduled', entryStatus: 'checked-in' });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    const clsOpen = makeClass({ classStatus: 'check_in_open', entryStatus: 'checked-in' });
    rerender({ data: makeShowDayData({ myClasses: [clsOpen] }) });

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'check_in_reminder' })
    );
  });

  it('fires results_posted when isScored transitions to true', () => {
    // Initial: not scored
    const clsInitial = makeClass({ isScored: false });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: scored
    const clsScored = makeClass({ isScored: true });
    rerender({ data: makeShowDayData({ myClasses: [clsScored] }) });

    expect(mockDeliver).toHaveBeenCalledWith(expect.objectContaining({ type: 'results_posted' }));
  });

  it('does not fire results_posted for classes already scored on mount', () => {
    const cls = makeClass({ isScored: true });
    const data = makeShowDayData({ myClasses: [cls] });

    const { rerender } = renderHook(({ data: d }) => useShowDayAlerts(d), {
      initialProps: { data },
    });
    rerender({ data }); // Same data, second render

    expect(mockDeliver).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'results_posted' })
    );
  });

  it('does not fire duplicate notifications on re-render', () => {
    // Initial: far away
    const clsInitial = makeClass({ scoredEntries: 10, myRunningOrder: 18 });
    const dataInitial = makeShowDayData({ myClasses: [clsInitial] });

    const { rerender } = renderHook(({ data }) => useShowDayAlerts(data), {
      initialProps: { data: dataInitial },
    });

    // Transition: within threshold
    const clsClose = makeClass({ scoredEntries: 15, myRunningOrder: 18 });
    const dataClose = makeShowDayData({ myClasses: [clsClose] });
    rerender({ data: dataClose });
    rerender({ data: dataClose }); // Third render with same data

    const yourTurnCalls = mockDeliver.mock.calls.filter(call => call[0].type === 'your_turn');
    expect(yourTurnCalls).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && pnpm test -- src/hooks/__tests__/useShowDayAlerts.test.ts
```

- [ ] **Step 3: Write implementation**

Create `apps/myk9show/src/hooks/useShowDayAlerts.ts`:

```typescript
import { useEffect, useRef } from 'react';
import type { ShowDayData, ShowDayClass } from '@/types/show-day-types';
import {
  buildYourTurnPayload,
  buildClassStartingPayload,
  buildResultsPostedPayload,
  buildCheckInReminderPayload,
} from '@myk9/notifications';
import { useNotificationStore } from '@/store/notificationStore';
import { useNotificationDelivery } from './useNotificationDelivery';

/**
 * Watches show-day data and fires notifications when trigger conditions are met.
 * Each trigger fires at most once per entry/class (tracked by ref sets).
 * On initial mount, pre-populates "already seen" sets to avoid false positives
 * for classes that are already in_progress or already scored.
 */
export function useShowDayAlerts(showDayData: ShowDayData): void {
  const { deliver } = useNotificationDelivery();
  const leadDogs = useNotificationStore(s => s.preferences.leadDogs);

  // Track which notifications have already fired (prevents duplicates)
  const firedYourTurn = useRef(new Set<string>());
  const firedClassStarting = useRef(new Set<string>());
  const firedCheckInReminder = useRef(new Set<string>());
  const firedResultsPosted = useRef(new Set<string>());
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (showDayData.isLoading || showDayData.error) return;

    // On first data load, seed "already seen" sets with current state
    // to avoid firing notifications for pre-existing conditions
    if (isInitialMount.current) {
      isInitialMount.current = false;
      for (const cls of showDayData.myClasses) {
        if (cls.classStatus === 'in_progress') {
          firedClassStarting.current.add(cls.classId);
        }
        if (cls.isScored) {
          firedResultsPosted.current.add(cls.entryId);
        }
        if (!cls.isScored && cls.myRunningOrder !== null) {
          const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
          if (dogsAhead <= leadDogs) {
            firedYourTurn.current.add(`${cls.entryId}-${dogsAhead}`);
          }
        }
      }
      return; // Don't fire on initial mount
    }

    for (const cls of showDayData.myClasses) {
      checkYourTurn(cls);
      checkClassStarting(cls);
      checkCheckInReminder(cls);
      checkResultsPosted(cls);
    }

    function checkYourTurn(cls: ShowDayClass) {
      if (cls.isScored || cls.myRunningOrder === null) return;

      const dogsAhead = cls.myRunningOrder - cls.scoredEntries;
      if (dogsAhead > leadDogs) return;

      const key = `${cls.entryId}-${dogsAhead}`;
      if (firedYourTurn.current.has(key)) return;
      firedYourTurn.current.add(key);

      deliver(
        buildYourTurnPayload({
          dogName: cls.dogCallName,
          className: cls.className,
          dogsAhead: Math.max(0, dogsAhead),
          armband: cls.armband,
          ringNumber: cls.ringNumber ?? undefined,
        })
      );
    }

    function checkClassStarting(cls: ShowDayClass) {
      if (cls.classStatus !== 'in_progress') return;
      if (firedClassStarting.current.has(cls.classId)) return;
      firedClassStarting.current.add(cls.classId);

      deliver(
        buildClassStartingPayload({
          className: cls.className,
          ringNumber: cls.ringNumber ?? undefined,
        })
      );
    }

    function checkCheckInReminder(cls: ShowDayClass) {
      if (cls.classStatus !== 'check_in_open') return;
      if (cls.entryStatus !== 'no-status') return;
      if (firedCheckInReminder.current.has(cls.entryId)) return;
      firedCheckInReminder.current.add(cls.entryId);

      deliver(
        buildCheckInReminderPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }

    function checkResultsPosted(cls: ShowDayClass) {
      if (!cls.isScored) return;
      if (firedResultsPosted.current.has(cls.entryId)) return;
      firedResultsPosted.current.add(cls.entryId);

      deliver(
        buildResultsPostedPayload({
          dogName: cls.dogCallName,
          className: cls.className,
        })
      );
    }
  }, [showDayData, deliver, leadDogs]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/myk9show && pnpm test -- src/hooks/__tests__/useShowDayAlerts.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useShowDayAlerts.ts apps/myk9show/src/hooks/__tests__/useShowDayAlerts.test.ts
git commit -m "feat(myk9show): add useShowDayAlerts trigger hook with tests"
```

---

## Chunk 6: UI Components

### Task 16: NotificationBell component

Header bell icon with unread badge and dropdown.

**Files:**

- Create: `apps/myk9show/src/components/notifications/NotificationBell.tsx`
- Create: `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`
- Modify: `apps/myk9show/src/components/layout/AppHeader.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/notifications/__tests__/NotificationBell.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationBell } from '../NotificationBell';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';
import type { NotificationPayload } from '@myk9/notifications';

function makePayload(id: string, type: NotificationPayload['type'] = 'your_turn'): NotificationPayload {
  return {
    id,
    type,
    title: `Alert ${id}`,
    body: `Body for ${id}`,
    priority: 'normal',
    timestamp: Date.now(),
  };
}

beforeEach(() => {
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    render(<NotificationBell />);
    expect(screen.getByRole('button', { name: /notification/i })).toBeInTheDocument();
  });

  it('shows unread badge when there are unread alerts', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));
    useNotificationStore.getState().addAlert(makePayload('2'));

    render(<NotificationBell />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('hides badge when no unread alerts', () => {
    render(<NotificationBell />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));

    expect(screen.getByText('Alert 1')).toBeInTheDocument();
  });

  it('shows empty state when no alerts', () => {
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));

    expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
  });

  it('marks all read when button clicked', () => {
    useNotificationStore.getState().addAlert(makePayload('1'));

    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notification/i }));
    fireEvent.click(screen.getByText(/mark all read/i));

    expect(useNotificationStore.getState().unreadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && pnpm test -- src/components/notifications/__tests__/NotificationBell.test.tsx
```

- [ ] **Step 3: Write implementation**

Create `apps/myk9show/src/components/notifications/NotificationBell.tsx`:

Build a Tailwind-styled bell icon button with:

- Bell icon (from lucide-react)
- Red badge with unread count (hidden when 0)
- Click opens a dropdown panel (use a simple state toggle + absolute positioning, or use Base UI Popover if already available)
- Dropdown shows `recentAlerts` from store, newest first
- Each alert shows: title, body, relative timestamp
- "Mark all read" button at bottom
- "No notifications" empty state
- Close dropdown when clicking outside

Reference `apps/myk9show/src/components/layout/AppHeader.tsx` for header component patterns and styling conventions.

- [ ] **Step 4: Wire into AppHeader**

In `apps/myk9show/src/components/layout/AppHeader.tsx`:

- Add `import { NotificationBell } from '@/components/notifications/NotificationBell'`
- Replace the removed `<NotificationCenter />` with `<NotificationBell />`

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && pnpm test -- src/components/notifications/__tests__/NotificationBell.test.tsx
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/notifications/ apps/myk9show/src/components/layout/AppHeader.tsx
git commit -m "feat(myk9show): add NotificationBell component with tests"
```

---

### Task 17: NotificationSettings component

Rewrite of the existing stub with working Zustand store integration.

**Files:**

- Rewrite: `apps/myk9show/src/components/notifications/NotificationSettings.tsx` (new location — old was `preferences/`)
- Create: `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`
- Modify: `apps/myk9show/src/pages/PreferencesPage.tsx` (update import)
- Modify: `apps/myk9show/src/components/preferences/PreferencesDialog.tsx` (update import)

- [ ] **Step 1: Write failing tests**

Create `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock sound test
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return { ...actual, testSound: vi.fn() };
});

import { testSound } from '@myk9/notifications';

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationSettings', () => {
  it('renders master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/enable notifications/i)).toBeInTheDocument();
  });

  it('toggles master switch updates store', () => {
    render(<NotificationSettings />);
    const toggle = screen.getByLabelText(/enable notifications/i);
    fireEvent.click(toggle);

    expect(useNotificationStore.getState().preferences.enabled).toBe(false);
  });

  it('renders lead dogs slider', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/dogs ahead/i)).toBeInTheDocument();
  });

  it('renders channel toggles', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/sound/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vibration/i)).toBeInTheDocument();
  });

  it('fires test notification on button click', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByText(/test notification/i));

    expect(testSound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/myk9show && pnpm test -- src/components/notifications/__tests__/NotificationSettings.test.tsx
```

- [ ] **Step 3: Write implementation**

Create `apps/myk9show/src/components/notifications/NotificationSettings.tsx`:

Build a Tailwind-styled settings panel with:

- Master toggle: "Enable notifications" switch
- Lead dogs slider: label "Alert when this many dogs ahead", range input 1-5, showing current value
- Channel section: Sound, Voice, Vibration toggles
- Push section: Push notification toggle (calls `requestPushPermission` when enabled, shows permission state)
- Test button: "Test notification" that calls `testSound('normal')`
- All toggles read from and write to `useNotificationStore`
- Follow existing settings patterns in the codebase (check `PreferencesPage.tsx` for layout conventions)

- [ ] **Step 4: Delete old stub and update imports**

```bash
rm apps/myk9show/src/components/preferences/NotificationSettings.tsx
```

Update imports in:

- `apps/myk9show/src/pages/PreferencesPage.tsx` — change import path from `@/components/preferences/NotificationSettings` to `@/components/notifications/NotificationSettings`. Also remove old props (`preferences`, `onUpdate`, `onReset`) — the new component reads from the store directly.
- `apps/myk9show/src/components/preferences/PreferencesDialog.tsx` — same import update.

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/myk9show && pnpm test -- src/components/notifications/__tests__/NotificationSettings.test.tsx
```

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(myk9show): add NotificationSettings component with tests"
```

---

## Chunk 7: Service Worker / PWA + Integration Wiring

### Task 18: Service worker setup with vite-plugin-pwa

**Files:**

- Modify: `apps/myk9show/package.json` (add `vite-plugin-pwa` dependency)
- Create: `apps/myk9show/src/sw-custom.ts`
- Modify: `apps/myk9show/vite.config.ts`

- [ ] **Step 1: Install vite-plugin-pwa**

```bash
cd apps/myk9show && pnpm add -D vite-plugin-pwa
```

- [ ] **Step 2: Create service worker**

Create `apps/myk9show/src/sw-custom.ts`:

```typescript
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Handle push notifications when app is in background
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || 'myK9Show';
    const options: NotificationOptions = {
      body: payload.body || '',
      icon: '/icon-192.png',
      badge: '/icon-badge.png',
      tag: payload.type || 'default',
      data: payload,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // Non-JSON push data — ignore
  }
});

// Handle notification click — focus or open the app
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing window if available
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow('/');
    })
  );
});
```

- [ ] **Step 3: Configure vite-plugin-pwa in vite.config.ts**

In `apps/myk9show/vite.config.ts`, add the VitePWA plugin:

```typescript
import { VitePWA } from 'vite-plugin-pwa';

// Add to plugins array:
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw-custom.ts',
  injectRegister: null,
  manifest: false, // We don't need a web app manifest for now
  devOptions: {
    enabled: false,
  },
});
```

- [ ] **Step 4: Typecheck and build**

```bash
cd apps/myk9show && pnpm typecheck && pnpm build
```

Expected: Clean build. Service worker compiled into dist.

**Testing note:** Per the spec, service worker push events are tested manually and via E2E later — no unit tests for `sw-custom.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/sw-custom.ts apps/myk9show/vite.config.ts apps/myk9show/package.json pnpm-lock.yaml
git commit -m "feat(myk9show): add service worker for background push notifications"
```

---

### Task 19: Wire `useShowDayAlerts` into ExhibitorDashboard

Connect the alert trigger hook to the exhibitor dashboard where `useShowDayData` is already consumed.

**Files:**

- Modify: The page/component that calls `useShowDayData` (likely `apps/myk9show/src/pages/ExhibitorDashboard.tsx` or similar)

- [ ] **Step 1: Find where `useShowDayData` is called**

```bash
grep -rn "useShowDayData" apps/myk9show/src/ --include="*.tsx" --include="*.ts" | grep -v test | grep -v __tests__
```

- [ ] **Step 2: Add the alert hook**

In the component that calls `useShowDayData`, add:

```typescript
import { useShowDayAlerts } from '@/hooks/useShowDayAlerts';

// Inside the component, after the useShowDayData call:
const showDayData = useShowDayData();
useShowDayAlerts(showDayData);
```

- [ ] **Step 3: Wire `isInRing` into the notification store**

In the same component (or in `useShowDayAlerts` itself), sync the exhibitor's in-ring status to the store:

```typescript
import { useNotificationStore } from '@/store/notificationStore';

// In a useEffect watching showDayData:
const setInRing = useNotificationStore(s => s.setInRing);
useEffect(() => {
  const anyInRing = showDayData.myClasses.some(cls => cls.entryStatus === 'in-ring');
  setInRing(anyInRing);
}, [showDayData.myClasses, setInRing]);
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/
git commit -m "feat(myk9show): wire useShowDayAlerts into exhibitor dashboard"
```

---

### Task 20: Final integration test + full build verification

- [ ] **Step 1: Run all package tests**

```bash
cd packages/notifications && pnpm test
```

Expected: All tests pass.

- [ ] **Step 2: Run all myK9Show tests**

```bash
cd apps/myk9show && pnpm test
```

Expected: All tests pass, including new notification tests.

- [ ] **Step 3: Full monorepo typecheck + lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: Zero errors.

- [ ] **Step 4: Full build**

```bash
pnpm build
```

Expected: Clean build across all packages and apps.

- [ ] **Step 5: Test coverage for package**

```bash
cd packages/notifications && pnpm test:coverage
```

Expected: Coverage meets thresholds (80% statements/lines/functions, 75% branches).

- [ ] **Step 6: Commit any final fixes**

If any tests or type errors needed fixing, commit them:

```bash
git add -A
git commit -m "fix(notifications): address integration issues from final verification"
```

---

## Summary

| Chunk | Tasks | What it delivers                                     |
| ----- | ----- | ---------------------------------------------------- |
| 1     | 1-4   | Package scaffold, types, suppression, handlers       |
| 2     | 5-7   | Voice-text, sound, voice modules                     |
| 3     | 8-10  | Push subscription, DB migration, edge function       |
| 4     | 11-12 | Stub cleanup, ringNumber addition                    |
| 5     | 13-15 | Notification store, delivery hook, alert triggers    |
| 6     | 16-17 | NotificationBell, NotificationSettings UI            |
| 7     | 18-20 | Service worker, dashboard wiring, final verification |

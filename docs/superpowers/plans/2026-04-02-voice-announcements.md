# Voice Announcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-category text-to-speech voice announcements to myK9Show's notification system, with a smart voice picker that nudges users toward enhanced OS voices.

**Architecture:** Extend `@myk9/notifications` package with a configurable `speak()` that accepts voice name and rate. Update `voice-text.ts` to handle announcements (currently returns null for them). Add voice preferences to `notificationStore` in myK9Show. Extend `NotificationSettings` with a Voice Announcements card (master toggle, 4 category toggles, voice picker with quality grouping, speed slider, platform-specific enhanced voice nudge). Wire voice into the existing `useNotificationDelivery` hook. Remove `ScoringSettings` entirely.

**Tech Stack:** Web Speech API, Zustand (persist middleware), React, shadcn/ui, Vitest

**Spec:** `docs/superpowers/specs/2026-04-02-voice-announcements-design.md`

---

## File Map

### Modified

| File                                                                  | Responsibility                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/notifications/src/voice.ts`                                 | Add `speakWithConfig()` accepting voice name + rate                 |
| `packages/notifications/src/voice-text.ts`                            | Handle `announcement` type (strip emoji/URGENT prefix, return text) |
| `packages/notifications/src/voice-text.test.ts`                       | Add announcement tests, placement results tests                     |
| `packages/notifications/src/types.ts`                                 | Add `VoiceCategories` and `VoiceConfig` types                       |
| `packages/notifications/src/index.ts`                                 | Export new types and `speakWithConfig`                              |
| `apps/myk9show/src/store/notificationStore.ts`                        | Add voice preference fields to state and defaults                   |
| `apps/myk9show/src/components/notifications/NotificationSettings.tsx` | Restructure: move Push into Channels, add Voice Announcements card  |
| `apps/myk9show/src/hooks/useNotificationDelivery.ts`                  | Use per-category voice checks + `speakWithConfig`                   |
| `apps/myk9show/src/pages/PreferencesPage.tsx`                         | Remove Scoring section/tab                                          |
| `apps/myk9show/src/stores/settingsStore.ts`                           | Remove voice-related fields                                         |

### New

| File                                                  | Responsibility                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `apps/myk9show/src/lib/voice-utils.ts`                | Platform detection, voice classification (recommended vs other), voice list helpers |
| `apps/myk9show/src/lib/__tests__/voice-utils.test.ts` | Tests for platform detection and voice classification                               |

### Removed

| File                                                                          | Reason                      |
| ----------------------------------------------------------------------------- | --------------------------- |
| `apps/myk9show/src/components/preferences/ScoringSettings.tsx`                | Scoring voice is myK9Q only |
| `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx` | Tests for removed component |

---

## Task 1: Extend `@myk9/notifications` — configurable speak + announcement voice text

**Files:**

- Modify: `packages/notifications/src/types.ts`
- Modify: `packages/notifications/src/voice.ts`
- Modify: `packages/notifications/src/voice-text.ts`
- Modify: `packages/notifications/src/voice-text.test.ts`
- Modify: `packages/notifications/src/index.ts`

- [ ] **Step 1: Add types to `packages/notifications/src/types.ts`**

Add after the `SuppressionContext` interface:

```typescript
/** Per-category voice toggle map */
export interface VoiceCategories {
  runOrder: boolean;
  results: boolean;
  classStarting: boolean;
  announcements: boolean;
}

/** Voice configuration for speech synthesis */
export interface VoiceConfig {
  voiceName: string; // '' = browser default
  voiceRate: number; // 0.5–2.0
}

/** Maps NotificationType to VoiceCategories key */
export const NOTIFICATION_TYPE_TO_VOICE_CATEGORY: Record<string, keyof VoiceCategories | null> = {
  your_turn: 'runOrder',
  results_posted: 'results',
  class_starting: 'classStarting',
  announcement: 'announcements',
  check_in_reminder: null, // no voice category for check-in reminders
};
```

- [ ] **Step 2: Add `speakWithConfig` to `packages/notifications/src/voice.ts`**

Add below the existing `speak` function (keep `speak` for backwards compat):

```typescript
/**
 * Speaks text using the Web Speech API with user-selected voice and rate.
 * Cancels any in-progress speech before starting.
 */
export function speakWithConfig(
  text: string,
  config: { voiceName: string; voiceRate: number }
): void {
  if (!isSpeechSupported()) return;

  if (speechSynthesis.speaking) {
    speechSynthesis.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = config.voiceRate;
  utterance.pitch = 1;
  utterance.volume = 1;

  if (config.voiceName) {
    const voices = speechSynthesis.getVoices();
    const match = voices.find(v => v.name === config.voiceName);
    if (match) utterance.voice = match;
  }

  // Chrome bug: small delay after cancel before speaking
  setTimeout(() => {
    speechSynthesis.speak(utterance);
  }, 100);
}
```

- [ ] **Step 3: Update `voice-text.ts` to handle announcements**

Replace the `case 'announcement'` block in `generateVoiceText`:

```typescript
    case 'announcement': {
      const title = (payload.title || '').replace(/^[\u{1F300}-\u{1FAF8}\u{2600}-\u{27BF}]+\s*/u, '').replace(/^URGENT:\s*/i, '').trim();
      if (!title) return null;
      return {
        text: title,
        priority: payload.priority === 'urgent' ? 'high' : 'normal',
      };
    }
```

- [ ] **Step 4: Add announcement and placement result templates to voice-text tests**

Add these test cases to `packages/notifications/src/voice-text.test.ts`:

```typescript
it('generates announcement text, stripping emoji prefix', () => {
  const result = generateVoiceText(
    makePayload({
      type: 'announcement',
      title: '🚨 Ring 3 is moving to the south building',
      body: 'Please adjust accordingly',
    })
  );

  expect(result).not.toBeNull();
  expect(result!.text).toBe('Ring 3 is moving to the south building');
  expect(result!.priority).toBe('normal');
});

it('generates announcement text, stripping URGENT prefix', () => {
  const result = generateVoiceText(
    makePayload({
      type: 'announcement',
      title: 'URGENT: Weather delay — all rings paused',
      body: '',
      priority: 'urgent',
    })
  );

  expect(result).not.toBeNull();
  expect(result!.text).toBe('Weather delay — all rings paused');
  expect(result!.priority).toBe('high');
});

it('returns null for announcement with empty title', () => {
  const result = generateVoiceText(makePayload({ type: 'announcement', title: '' }));
  expect(result).toBeNull();
});
```

- [ ] **Step 5: Export new items from `packages/notifications/src/index.ts`**

Add to existing exports:

```typescript
export type { VoiceCategories, VoiceConfig } from './types';
export { NOTIFICATION_TYPE_TO_VOICE_CATEGORY } from './types';
export { speakWithConfig } from './voice';
```

- [ ] **Step 6: Run tests**

Run: `cd packages/notifications && npx vitest run`
Expected: All tests pass including the new announcement tests.

- [ ] **Step 7: Commit**

```bash
git add packages/notifications/src/
git commit -m "feat(notifications): add speakWithConfig, announcement voice text, voice category types"
```

---

## Task 2: Create voice utilities — platform detection + voice classification

**Files:**

- Create: `apps/myk9show/src/lib/voice-utils.ts`
- Create: `apps/myk9show/src/lib/__tests__/voice-utils.test.ts`

- [ ] **Step 1: Write tests for voice classification and platform detection**

Create `apps/myk9show/src/lib/__tests__/voice-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classifyVoice, detectPlatform, getEnhancedVoiceInstructions } from '../voice-utils';

describe('classifyVoice', () => {
  it('marks Premium voices as recommended', () => {
    expect(classifyVoice('Samantha (Premium)')).toBe('recommended');
  });

  it('marks Enhanced voices as recommended', () => {
    expect(classifyVoice('Alex (Enhanced)')).toBe('recommended');
  });

  it('marks Google voices as recommended', () => {
    expect(classifyVoice('Google US English')).toBe('recommended');
  });

  it('marks plain voices as other', () => {
    expect(classifyVoice('Samantha')).toBe('other');
  });

  it('marks Microsoft Online voices as recommended', () => {
    expect(classifyVoice('Microsoft Aria Online (Natural)')).toBe('recommended');
  });
});

describe('detectPlatform', () => {
  it('detects Mac from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('mac');
  });

  it('detects iPhone from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
  });

  it('detects iPad from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('ios');
  });

  it('detects Android from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
  });

  it('detects Windows from user agent', () => {
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('windows');
  });

  it('returns unknown for unrecognized user agent', () => {
    expect(detectPlatform('SomeBot/1.0')).toBe('unknown');
  });
});

describe('getEnhancedVoiceInstructions', () => {
  it('returns Mac instructions for mac platform', () => {
    const result = getEnhancedVoiceInstructions('mac');
    expect(result.platform).toBe('Mac');
    expect(result.steps).toHaveLength(5);
    expect(result.steps[0]).toContain('System Settings');
  });

  it('returns iOS instructions for ios platform', () => {
    const result = getEnhancedVoiceInstructions('ios');
    expect(result.platform).toBe('iPhone / iPad');
    expect(result.steps[0]).toContain('Settings');
  });

  it('returns Android instructions for android platform', () => {
    const result = getEnhancedVoiceInstructions('android');
    expect(result.platform).toBe('Android');
  });

  it('returns Windows instructions for windows platform', () => {
    const result = getEnhancedVoiceInstructions('windows');
    expect(result.platform).toBe('Windows');
  });

  it('returns null for unknown platform', () => {
    expect(getEnhancedVoiceInstructions('unknown')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/lib/__tests__/voice-utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement voice utilities**

Create `apps/myk9show/src/lib/voice-utils.ts`:

```typescript
type VoiceQuality = 'recommended' | 'other';
type Platform = 'mac' | 'ios' | 'android' | 'windows' | 'unknown';

/**
 * Classifies a voice by name as recommended (enhanced/premium/neural) or other (basic).
 */
export function classifyVoice(voiceName: string): VoiceQuality {
  const name = voiceName.toLowerCase();
  if (
    name.includes('premium') ||
    name.includes('enhanced') ||
    name.includes('google') ||
    name.includes('natural') ||
    name.includes('neural')
  ) {
    return 'recommended';
  }
  return 'other';
}

/**
 * Returns true if at least one voice in the list is classified as recommended.
 */
export function hasRecommendedVoice(voices: SpeechSynthesisVoice[]): boolean {
  return voices.some(v => classifyVoice(v.name) === 'recommended');
}

/**
 * Groups and sorts voices: recommended first, then other. Each group sorted alphabetically.
 */
export function groupVoices(voices: SpeechSynthesisVoice[]): {
  recommended: SpeechSynthesisVoice[];
  other: SpeechSynthesisVoice[];
} {
  const recommended: SpeechSynthesisVoice[] = [];
  const other: SpeechSynthesisVoice[] = [];

  for (const voice of voices) {
    if (classifyVoice(voice.name) === 'recommended') {
      recommended.push(voice);
    } else {
      other.push(voice);
    }
  }

  recommended.sort((a, b) => a.name.localeCompare(b.name));
  other.sort((a, b) => a.name.localeCompare(b.name));

  return { recommended, other };
}

/**
 * Detects user platform from user agent string.
 */
export function detectPlatform(userAgent: string): Platform {
  const ua = userAgent.toLowerCase();
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'mac';
  if (ua.includes('android')) return 'android';
  if (ua.includes('windows')) return 'windows';
  return 'unknown';
}

interface VoiceInstructions {
  platform: string;
  steps: string[];
}

/**
 * Returns platform-specific numbered instructions for downloading enhanced voices.
 * Returns null for unknown platforms.
 */
export function getEnhancedVoiceInstructions(
  platform: Platform | string
): VoiceInstructions | null {
  switch (platform) {
    case 'mac':
      return {
        platform: 'Mac',
        steps: [
          'Open System Settings on your Mac',
          'Go to Accessibility > Spoken Content',
          'Click System Voice > Manage Voices',
          'Download any voice marked "Premium"',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'ios':
      return {
        platform: 'iPhone / iPad',
        steps: [
          'Open Settings on your device',
          'Go to Accessibility > Spoken Content > Voices',
          'Tap English',
          'Download any voice marked "Enhanced" or "Premium"',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'android':
      return {
        platform: 'Android',
        steps: [
          'Open Settings on your device',
          'Go to General Management > Text-to-Speech',
          'Tap Install voice data',
          'Download the high-quality English voices',
          'Come back here and tap Check for new voices',
        ],
      };
    case 'windows':
      return {
        platform: 'Windows',
        steps: [
          'Open Settings on your PC',
          'Go to Time & Language > Speech',
          'Click Manage voices and add English voices',
          'Come back here and tap Check for new voices',
        ],
      };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/lib/__tests__/voice-utils.test.ts`
Expected: All pass.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/lib/voice-utils.ts apps/myk9show/src/lib/__tests__/voice-utils.test.ts
git commit -m "feat: add voice classification and platform detection utilities"
```

---

## Task 3: Add voice preferences to `notificationStore`

**Files:**

- Modify: `packages/notifications/src/types.ts` (already has `VoiceCategories` from Task 1)
- Modify: `apps/myk9show/src/store/notificationStore.ts`

- [ ] **Step 1: Extend `NotificationPreferences` in `packages/notifications/src/types.ts`**

Add voice fields to `NotificationPreferences` interface:

```typescript
export interface NotificationPreferences {
  /** Master on/off toggle */
  enabled: boolean;
  /** How many dogs ahead triggers "your turn" alert (1-5) */
  leadDogs: number;
  soundEnabled: boolean;
  voiceEnabled: boolean;
  vibrationEnabled: boolean;
  pushEnabled: boolean;
  /** Per-category voice toggles */
  voiceCategories: VoiceCategories;
  /** Selected voice name ('' = browser default) */
  voiceName: string;
  /** Speech rate 0.5–2.0 */
  voiceRate: number;
}
```

Update `DEFAULT_PREFERENCES`:

```typescript
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: true,
  leadDogs: 3,
  soundEnabled: true,
  voiceEnabled: false,
  vibrationEnabled: true,
  pushEnabled: false,
  voiceCategories: {
    runOrder: true,
    results: true,
    classStarting: true,
    announcements: true,
  },
  voiceName: '',
  voiceRate: 1.0,
};
```

- [ ] **Step 2: Run package tests to verify nothing broke**

Run: `cd packages/notifications && npx vitest run`
Expected: All pass — the new fields are additive with defaults.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/types.ts
git commit -m "feat(notifications): add voice category and config fields to preferences"
```

---

## Task 4: Wire voice into `useNotificationDelivery`

**Files:**

- Modify: `apps/myk9show/src/hooks/useNotificationDelivery.ts`
- Modify: `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`

- [ ] **Step 1: Update `useNotificationDelivery.ts`**

Replace the voice section in the `deliver` callback:

```typescript
import {
  shouldSuppress,
  playNotificationSound,
  speakWithConfig,
  generateVoiceText,
  NOTIFICATION_TYPE_TO_VOICE_CATEGORY,
} from '@myk9/notifications';
```

Replace the `// Voice` block:

```typescript
// Voice
if (preferences.voiceEnabled) {
  const categoryKey = NOTIFICATION_TYPE_TO_VOICE_CATEGORY[payload.type];
  const categoryEnabled = categoryKey ? preferences.voiceCategories[categoryKey] : false;

  if (categoryEnabled) {
    try {
      const voiceText = generateVoiceText(payload);
      if (voiceText) {
        speakWithConfig(voiceText.text, {
          voiceName: preferences.voiceName,
          voiceRate: preferences.voiceRate,
        });
      }
    } catch {
      /* voice failure is non-fatal */
    }
  }
}
```

Also remove the unused `speak` import (only `speakWithConfig` is needed now).

- [ ] **Step 2: Update delivery tests**

Update the mock in `apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts`:

Replace the `vi.mock('@myk9/notifications'` block:

```typescript
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual<typeof import('@myk9/notifications')>('@myk9/notifications');
  return {
    ...actual,
    playNotificationSound: vi.fn(),
    speakWithConfig: vi.fn(),
    generateVoiceText: vi.fn(() => ({ text: 'Test voice', priority: 'normal' })),
  };
});
```

Add these tests:

```typescript
it('calls speakWithConfig when voice is enabled and category matches', () => {
  const { speakWithConfig } = require('@myk9/notifications');
  useNotificationStore.setState({
    preferences: {
      ...DEFAULT_PREFERENCES,
      voiceEnabled: true,
      voiceCategories: { runOrder: true, results: true, classStarting: true, announcements: true },
      voiceName: 'Samantha',
      voiceRate: 1.2,
    },
  });

  const { result } = renderHook(() => useNotificationDelivery());
  act(() => {
    result.current.deliver(makePayload('1'));
  });

  expect(speakWithConfig).toHaveBeenCalledWith('Test voice', {
    voiceName: 'Samantha',
    voiceRate: 1.2,
  });
});

it('does not speak when voice master toggle is off', () => {
  const { speakWithConfig } = require('@myk9/notifications');
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: false },
  });

  const { result } = renderHook(() => useNotificationDelivery());
  act(() => {
    result.current.deliver(makePayload('1'));
  });

  expect(speakWithConfig).not.toHaveBeenCalled();
});

it('does not speak when category toggle is off', () => {
  const { speakWithConfig } = require('@myk9/notifications');
  useNotificationStore.setState({
    preferences: {
      ...DEFAULT_PREFERENCES,
      voiceEnabled: true,
      voiceCategories: { runOrder: false, results: true, classStarting: true, announcements: true },
    },
  });

  const { result } = renderHook(() => useNotificationDelivery());
  act(() => {
    result.current.deliver(makePayload('1')); // type: 'your_turn' → category: runOrder
  });

  expect(speakWithConfig).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && npx vitest run src/hooks/__tests__/useNotificationDelivery.test.ts`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/hooks/useNotificationDelivery.ts apps/myk9show/src/hooks/__tests__/useNotificationDelivery.test.ts
git commit -m "feat: wire per-category voice announcements into notification delivery"
```

---

## Task 5: Restructure `NotificationSettings` — move Push into Channels, add Voice Announcements card

**Files:**

- Modify: `apps/myk9show/src/components/notifications/NotificationSettings.tsx`
- Modify: `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`

- [ ] **Step 1: Rewrite `NotificationSettings.tsx`**

Replace the entire file. The new structure has three cards:

1. **Enable notifications** (existing — master toggle + lead dogs slider)
2. **Channels** (restructured — Sound, Vibration, Push with explanation)
3. **Voice Announcements** (new — master toggle, 4 category toggles, voice picker with grouping, speed slider, enhanced voice nudge, test button)
4. **Test notification** button (existing)

```typescript
import { useState, useEffect, useCallback } from 'react';
import { useNotificationStore } from '@/store/notificationStore';
import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';
import { testSound, isSpeechSupported, speakWithConfig } from '@myk9/notifications';
import type { VoiceCategories } from '@myk9/notifications';
import {
  classifyVoice,
  groupVoices,
  hasRecommendedVoice,
  detectPlatform,
  getEnhancedVoiceInstructions,
} from '@/lib/voice-utils';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Bell, Volume2, Smartphone, Send, Mic, RefreshCw } from 'lucide-react';

const CHANNEL_TOGGLES = [
  { key: 'soundEnabled', label: 'Sound', desc: 'Play an alert tone', icon: Volume2 },
  { key: 'vibrationEnabled', label: 'Vibration', desc: 'Vibrate on alert', icon: Smartphone },
] as const;

const VOICE_CATEGORIES: Array<{
  key: keyof VoiceCategories;
  label: string;
  example: string;
}> = [
  { key: 'runOrder', label: 'Run order alerts', example: '"Max, number 42, you\'re up next"' },
  { key: 'results', label: 'Results posted', example: '"Bella, second place, qualified"' },
  { key: 'classStarting', label: 'Class starting', example: '"Novice A starting soon"' },
  { key: 'announcements', label: 'Announcements', example: 'Secretary broadcasts (high/urgent)' },
];

export function NotificationSettings() {
  const preferences = useNotificationStore(s => s.preferences);
  const permissionStatus = useNotificationStore(s => s.permissionStatus);
  const updatePreferences = useNotificationStore(s => s.updatePreferences);
  const { subscribe, unsubscribe, isSupported: isPushSupported } = usePushSubscription();
  const [isPushLoading, setIsPushLoading] = useState(false);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const speechSupported = isSpeechSupported();

  const loadVoices = useCallback(() => {
    if (!speechSupported) return;
    const allVoices = speechSynthesis.getVoices();
    setVoices(allVoices.filter(v => v.lang.startsWith('en')));
  }, [speechSupported]);

  useEffect(() => {
    if (!speechSupported) return;
    loadVoices();
    speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [speechSupported, loadVoices]);

  const grouped = groupVoices(voices);
  const showNudge = speechSupported && voices.length > 0 && !hasRecommendedVoice(voices);
  const platform = detectPlatform(navigator.userAgent);
  const instructions = getEnhancedVoiceInstructions(platform);

  async function handlePushToggle(checked: boolean) {
    setIsPushLoading(true);
    try {
      if (checked) {
        const result = await subscribe();
        if (!result.ok) {
          if (result.reason === 'permission-denied') {
            notifications.warning('Push notifications blocked. Check browser settings.');
          } else {
            notifications.error('Failed to enable push notifications.');
          }
        }
      } else {
        const result = await unsubscribe();
        if (!result.ok) {
          notifications.error('Failed to disable push notifications.');
        }
      }
    } finally {
      setIsPushLoading(false);
    }
  }

  function handleTestVoice() {
    if (!speechSupported) return;
    speakWithConfig('This is a test of your selected voice.', {
      voiceName: preferences.voiceName,
      voiceRate: preferences.voiceRate,
    });
  }

  function updateVoiceCategory(key: keyof VoiceCategories, value: boolean) {
    updatePreferences({
      voiceCategories: { ...preferences.voiceCategories, [key]: value },
    });
  }

  return (
    <div className="space-y-4">
      {/* Enable notifications */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">
                  <label htmlFor="notif-enabled">Enable notifications</label>
                </CardTitle>
                <CardDescription className="text-xs">
                  Receive ring-call and scheduling alerts
                </CardDescription>
              </div>
            </div>
            <Switch
              id="notif-enabled"
              checked={preferences.enabled}
              onCheckedChange={checked => updatePreferences({ enabled: checked })}
            />
          </div>
        </CardHeader>
        <CardContent>
          <label htmlFor="lead-dogs" className="block text-sm font-medium mb-2">
            Alert when this many dogs ahead: {preferences.leadDogs}
          </label>
          <Slider
            id="lead-dogs"
            min={1}
            max={5}
            step={1}
            value={[preferences.leadDogs]}
            onValueChange={([v]) => updatePreferences({ leadDogs: v })}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>1</span>
            <span>5</span>
          </div>
        </CardContent>
      </Card>

      {/* Channels */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Channels</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CHANNEL_TOGGLES.map(({ key, label, desc, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <label htmlFor={key} className="text-sm font-medium">
                    {label}
                  </label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <Switch
                id={key}
                checked={preferences[key]}
                onCheckedChange={checked => updatePreferences({ [key]: checked })}
              />
            </div>
          ))}

          <Separator />

          {/* Push — now inline as a channel */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2 flex-1 mr-3">
              <Send className="h-4 w-4 text-muted-foreground mt-0.5" />
              <div>
                <label htmlFor="push-enabled" className="text-sm font-medium">
                  Push notifications
                </label>
                <p className="text-xs text-muted-foreground">
                  Receive alerts even when the app isn't open. Notifications appear on your lock
                  screen and in your notification center, just like texts or email.
                </p>
                {permissionStatus === 'denied' && (
                  <p className="text-xs text-destructive mt-1">Blocked in browser settings</p>
                )}
                {!isPushSupported && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Not supported on this browser
                  </p>
                )}
              </div>
            </div>
            <Switch
              id="push-enabled"
              checked={preferences.pushEnabled}
              disabled={!isPushSupported || isPushLoading}
              onCheckedChange={handlePushToggle}
            />
          </div>
        </CardContent>
      </Card>

      {/* Voice Announcements */}
      {speechSupported && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">
                    <label htmlFor="voice-enabled">Voice Announcements</label>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Read notifications aloud using text-to-speech
                  </CardDescription>
                </div>
              </div>
              <Switch
                id="voice-enabled"
                checked={preferences.voiceEnabled}
                onCheckedChange={checked => updatePreferences({ voiceEnabled: checked })}
              />
            </div>
          </CardHeader>

          {preferences.voiceEnabled && (
            <CardContent className="space-y-4">
              {/* Per-category toggles */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Announce
                </Label>
              </div>
              {VOICE_CATEGORIES.map(({ key, label, example }) => (
                <div key={key} className="flex items-center justify-between pl-2">
                  <div>
                    <label htmlFor={`voice-cat-${key}`} className="text-sm font-medium">
                      {label}
                    </label>
                    <p className="text-xs text-muted-foreground">{example}</p>
                  </div>
                  <Switch
                    id={`voice-cat-${key}`}
                    checked={preferences.voiceCategories[key]}
                    onCheckedChange={checked => updateVoiceCategory(key, checked)}
                  />
                </div>
              ))}

              <Separator />

              {/* Voice config */}
              <div>
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Voice
                </Label>
              </div>

              <div className="space-y-1">
                <Label htmlFor="voice-select" className="font-medium">
                  Voice
                </Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select system voice for announcements
                </p>
                <select
                  id="voice-select"
                  aria-label="Voice"
                  value={preferences.voiceName}
                  onChange={e => updatePreferences({ voiceName: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Browser Default</option>
                  {grouped.recommended.length > 0 && (
                    <optgroup label="Recommended">
                      {grouped.recommended.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {grouped.other.length > 0 && (
                    <optgroup label={grouped.recommended.length > 0 ? 'Other' : 'Available'}>
                      {grouped.other.map(voice => (
                        <option key={voice.name} value={voice.name}>
                          {voice.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Enhanced voice nudge */}
              {showNudge && instructions && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    Want better-sounding voices?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Your device has free high-quality voices you can download. They sound much more
                    natural than the default.
                  </p>
                  <div className="rounded-md bg-background/80 p-3">
                    <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide mb-2">
                      {instructions.platform}
                    </p>
                    <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                      {instructions.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadVoices}>
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Check for new voices
                  </Button>
                </div>
              )}

              <div className="space-y-1">
                <Label className="font-medium">Speed</Label>
                <p className="text-xs text-muted-foreground mb-2">Speaking rate</p>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">0.5x</span>
                  <Slider
                    value={[preferences.voiceRate]}
                    onValueChange={([value]) => updatePreferences({ voiceRate: value })}
                    min={0.5}
                    max={2.0}
                    step={0.1}
                    className="flex-1"
                  />
                  <span className="text-xs text-muted-foreground">2x</span>
                </div>
              </div>

              <Button variant="outline" size="sm" onClick={handleTestVoice}>
                <Volume2 className="h-4 w-4 mr-2" />
                Test Voice
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      <Button variant="outline" className="w-full" onClick={() => testSound('normal')}>
        Test notification
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Update `NotificationSettings` tests**

Replace `apps/myk9show/src/components/notifications/__tests__/NotificationSettings.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NotificationSettings } from '../NotificationSettings';
import { useNotificationStore } from '@/store/notificationStore';
import { DEFAULT_PREFERENCES } from '@myk9/notifications';

// Mock sound/voice modules
vi.mock('@myk9/notifications', async () => {
  const actual = await vi.importActual('@myk9/notifications');
  return {
    ...actual,
    testSound: vi.fn(),
    speakWithConfig: vi.fn(),
    isSpeechSupported: vi.fn(() => true),
  };
});

import { testSound, speakWithConfig } from '@myk9/notifications';

const mockSubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));
const mockUnsubscribe = vi.fn(() => Promise.resolve({ ok: true as const }));

vi.mock('@/hooks/usePushSubscription', () => ({
  usePushSubscription: vi.fn(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  })),
}));

vi.mock('@/lib/notifications', () => ({
  notifications: {
    warning: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock speechSynthesis for voice picker
const mockVoices = [
  { name: 'Samantha (Premium)', lang: 'en-US' },
  { name: 'Google US English', lang: 'en-US' },
  { name: 'Alex', lang: 'en-US' },
] as SpeechSynthesisVoice[];

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    getVoices: () => mockVoices,
    speak: vi.fn(),
    cancel: vi.fn(),
    speaking: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
  writable: true,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: class {
    text: string;
    lang = 'en-US';
    rate = 1;
    pitch = 1;
    volume = 1;
    voice: SpeechSynthesisVoice | null = null;
    constructor(text: string) {
      this.text = text;
    }
  },
  writable: true,
});

import { usePushSubscription } from '@/hooks/usePushSubscription';
import { notifications } from '@/lib/notifications';

const mockedUsePushSubscription = vi.mocked(usePushSubscription);

beforeEach(() => {
  vi.clearAllMocks();
  mockedUsePushSubscription.mockImplementation(() => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    isSupported: true,
  }));
  mockSubscribe.mockResolvedValue({ ok: true });
  mockUnsubscribe.mockResolvedValue({ ok: true });
  useNotificationStore.setState({
    preferences: { ...DEFAULT_PREFERENCES },
    isInRing: false,
    recentAlerts: [],
    unreadCount: 0,
    permissionStatus: 'default' as NotificationPermission,
  });
});

describe('NotificationSettings', () => {
  // --- Master toggle ---
  it('renders master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/enable notifications/i)).toBeInTheDocument();
  });

  it('toggles master switch updates store', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByLabelText(/enable notifications/i));
    expect(useNotificationStore.getState().preferences.enabled).toBe(false);
  });

  it('renders lead dogs slider', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/dogs ahead/i)).toBeInTheDocument();
  });

  // --- Channels ---
  it('renders channel toggles (sound, vibration)', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/soundEnabled/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/vibrationEnabled/i)).toBeInTheDocument();
  });

  it('renders push as a channel with explanation', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/push notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/lock screen/i)).toBeInTheDocument();
  });

  it('calls subscribe when push is toggled on', async () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByLabelText(/push notifications/i));
    await waitFor(() => expect(mockSubscribe).toHaveBeenCalledTimes(1));
  });

  it('shows warning when push permission denied', async () => {
    mockSubscribe.mockResolvedValueOnce({ ok: false, reason: 'permission-denied' });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByLabelText(/push notifications/i));
    await waitFor(() =>
      expect(notifications.warning).toHaveBeenCalledWith(
        'Push notifications blocked. Check browser settings.'
      )
    );
  });

  // --- Voice Announcements ---
  it('renders voice announcements master toggle', () => {
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/voice announcements/i)).toBeInTheDocument();
  });

  it('shows category toggles when voice is enabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/voice-cat-runOrder/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice-cat-results/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice-cat-classStarting/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/voice-cat-announcements/i)).toBeInTheDocument();
  });

  it('hides category toggles when voice is disabled', () => {
    render(<NotificationSettings />);
    expect(screen.queryByLabelText(/voice-cat-runOrder/i)).not.toBeInTheDocument();
  });

  it('toggles a voice category', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByLabelText(/voice-cat-runOrder/i));
    expect(useNotificationStore.getState().preferences.voiceCategories.runOrder).toBe(false);
  });

  it('renders voice picker with grouped options', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByLabelText(/voice$/i)).toBeInTheDocument();
  });

  it('renders speed slider when voice enabled', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true },
    });
    render(<NotificationSettings />);
    expect(screen.getByText('Speed')).toBeInTheDocument();
  });

  it('test voice button calls speakWithConfig', () => {
    useNotificationStore.setState({
      preferences: { ...DEFAULT_PREFERENCES, voiceEnabled: true, voiceName: 'Alex', voiceRate: 1.5 },
    });
    render(<NotificationSettings />);
    fireEvent.click(screen.getByRole('button', { name: /test voice/i }));
    expect(speakWithConfig).toHaveBeenCalledWith('This is a test of your selected voice.', {
      voiceName: 'Alex',
      voiceRate: 1.5,
    });
  });

  // --- Test notification ---
  it('fires test notification on button click', () => {
    render(<NotificationSettings />);
    fireEvent.click(screen.getByText(/test notification/i));
    expect(testSound).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd apps/myk9show && npx vitest run src/components/notifications/__tests__/NotificationSettings.test.tsx`
Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/notifications/
git commit -m "feat: restructure NotificationSettings with voice announcements card"
```

---

## Task 6: Remove `ScoringSettings` and clean up `PreferencesPage`

**Files:**

- Delete: `apps/myk9show/src/components/preferences/ScoringSettings.tsx`
- Delete: `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx`
- Modify: `apps/myk9show/src/pages/PreferencesPage.tsx`
- Modify: `apps/myk9show/src/stores/settingsStore.ts`

- [ ] **Step 1: Remove Scoring section from `PreferencesPage.tsx`**

In `PreferencesPage.tsx`, remove the scoring section from `settingsGroups`:

Remove this object from the `alerts` group's `sections` array:

```typescript
      {
        id: 'scoring',
        label: 'Scoring',
        icon: Volume2,
        description: 'Voice announcements and audio during scoring',
        roleRequired: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.STEWARD, UserRole.SITE_ADMIN],
      },
```

Remove `'scoring'` from the `TabValue` type.

Remove the `case 'scoring'` from `renderContent()`:

```typescript
      case 'scoring':
        return <ScoringSettings />;
```

Remove the `ScoringSettings` import:

```typescript
import { ScoringSettings } from '@/components/preferences/ScoringSettings';
```

Remove unused `Volume2` from lucide imports (if no longer used elsewhere in the file — check first).

- [ ] **Step 2: Remove voice fields from `settingsStore.ts`**

In `apps/myk9show/src/stores/settingsStore.ts`:

Remove from `AppSettings` interface:

```typescript
// Scoring (judges/stewards/admins only)
voiceAnnouncements: boolean;

// Voice configuration (shared by notifications and scoring)
voiceName: string;
voiceRate: number;
```

Remove from `defaultSettings`:

```typescript
  // Scoring
  voiceAnnouncements: false,

  // Voice configuration
  voiceName: '',
  voiceRate: 1.0,
```

Also remove `voiceNotifications` from the interface and defaults (this is now `voiceEnabled` in `notificationStore`):

```typescript
voiceNotifications: boolean;
```

- [ ] **Step 3: Delete `ScoringSettings.tsx` and its test**

Delete `apps/myk9show/src/components/preferences/ScoringSettings.tsx`.
Delete `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx`.

- [ ] **Step 4: Run typecheck and tests**

Run: `cd apps/myk9show && npx tsc --noEmit && npx vitest run`

If there are compile errors from other files referencing `voiceAnnouncements`, `voiceName`, `voiceRate`, or `voiceNotifications` from settingsStore, fix those references to use `notificationStore` preferences instead.

Expected: Typecheck passes, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove ScoringSettings, migrate voice config to notificationStore"
```

---

## Task 7: Final integration test + typecheck

**Files:** None new — verification only.

- [ ] **Step 1: Run full typecheck**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm typecheck`
Expected: No errors.

- [ ] **Step 2: Run all myK9Show tests**

Run: `cd apps/myk9show && pnpm test`
Expected: All pass. If tests hang past 30 seconds, stop and report.

- [ ] **Step 3: Run notifications package tests**

Run: `cd packages/notifications && npx vitest run`
Expected: All pass.

- [ ] **Step 4: Build**

Run: `cd "/Users/richardbeezley/AI Projects/myk9-platform" && pnpm build`
Expected: Builds successfully.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve integration issues from voice announcements feature"
```

Only commit if there were fixes. Skip if everything passed cleanly.

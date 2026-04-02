# Voice Announcements for myK9Show

**Date:** 2026-04-02
**Status:** Approved
**Context:** Port exhibitor-relevant voice features from myK9Q to myK9Show. Scoring/timer voice stays in myK9Q (ringside only).

---

## Overview

Add text-to-speech voice announcements to myK9Show so exhibitors hear personalized spoken alerts for run order, results, class starts, and secretary announcements. Voice settings live in the Notification Settings section of the Preferences page, with per-category toggles and a smart voice picker that nudges users toward higher-quality OS voices.

## Settings UI

### Location

Extend the existing `NotificationSettings` component. No new pages or routes.

### Layout Changes

The Notification Settings section gets restructured:

1. **Enable notifications** card (existing) -- master toggle + dogs-ahead slider
2. **Channels** card (restructured) -- Sound, Vibration, and Push notifications as peer toggles. Push moves here from its separate card, with an explanation: "Receive alerts even when the app isn't open. Notifications appear on your lock screen and in your notification center, just like texts or email."
3. **Voice Announcements** card (new) -- see below
4. **Test notification** button (existing)

The separate Push card at the bottom is removed. The old single "Voice announcements" toggle is removed from the Channels card.

### Voice Announcements Card

**Master toggle:** "Voice Announcements" -- on/off for all voice. Description: "Read notifications aloud using text-to-speech."

**Per-category toggles** (under "Announce" label, indented):

| Category         | Label              | Example spoken text                |
| ---------------- | ------------------ | ---------------------------------- |
| Run order alerts | "Run order alerts" | "Max, number 42, you're up next"   |
| Results posted   | "Results posted"   | "Bella, second place, qualified"   |
| Class starting   | "Class starting"   | "Novice A starting soon"           |
| Announcements    | "Announcements"    | Secretary broadcasts (high/urgent) |

Chat messages are excluded from voice -- reading private messages aloud at a show is a privacy problem.

**Voice configuration** (under "Voice" label):

- **Voice picker dropdown** -- lists English voices from `speechSynthesis.getVoices()`, grouped into "Recommended" and "Other":
  - Recommended: voices with "Premium", "Enhanced", or "Google" in the name
  - Other: everything else
  - Recommended voices sort to the top
- **Speed slider** -- 0.5x to 2x, default 1.0
- **Test Voice button** -- speaks "This is a test of your selected voice" using current config

**Enhanced voice nudge** -- shown when no recommended voices are detected:

- Amber card with heading: "Want better-sounding voices?"
- Body: "Your device has free high-quality voices you can download. They sound much more natural than the default."
- Platform-specific numbered steps (detected from user agent):
  - **Mac:** Open System Settings > Accessibility > Spoken Content > System Voice > Manage Voices. Download voices marked "Premium."
  - **iPhone/iPad:** Open Settings > Accessibility > Spoken Content > Voices > English. Download voices marked "Enhanced" or "Premium."
  - **Android:** Open Settings > General Management > Text-to-Speech > Install voice data. Download high-quality English voices.
  - **Windows:** Open Settings > Time & Language > Speech > Manage voices. Add English voices.
- "Check for new voices" button -- calls `speechSynthesis.getVoices()` again to detect newly installed voices
- Nudge disappears once at least one recommended voice is detected

### Cleanup

- Remove `ScoringSettings` component and its section from PreferencesPage (scoring voice is myK9Q only)
- Remove the Scoring tab from the Alerts & Sound group if it becomes empty
- Migrate `voiceAnnouncements`, `voiceName`, `voiceRate` from `settingsStore` to `notificationStore`

## Voice Text Generation

Each notification type maps to a spoken phrase template. Personalized data (dog name, armband number, placement) comes from the notification payload.

### Templates

**Run order -- up next:**

> "{dogName}, number {armband}, you're up next"

**Run order -- N dogs away:**

> "{dogName}, number {armband}, you're {count} dogs away"

**Results -- with placement:**

> "{dogName}, {placement}, {qualifyingStatus}"
> e.g., "Bella, second place, qualified"

**Results -- score only (no placement):**

> "Results posted for {dogName}"

**Class starting:**

> "{className} starting soon"

**Announcements:**

> Reads the announcement title, stripping emoji prefixes and "URGENT:" prefix

### Fallbacks

If dog name or armband number is unavailable, fall back to generic phrasing:

- "You're up next" instead of "Max, number 42, you're up next"
- "Results posted" instead of "Results posted for Max"

## Voice Service

Lightweight Web Speech API wrapper. Not a port of the full myK9Q `voiceAnnouncementService` (which is 447 lines, half scoring logic).

### Responsibilities

- `speak(text: string)` -- cancel any current speech, apply voice config (selected voice, rate), speak the text
- Chrome bug workaround: 100ms delay after `cancel()` before calling `speak()` (Chrome silently drops the utterance otherwise)
- Browser support detection: `hasSpeechSynthesis()` check; voice UI hidden entirely when unsupported
- Voice list management: load voices, re-load on `voiceschanged` event, classify as recommended/other

### What it does NOT do

- No priority queue (myK9Q needed this because scoring and notifications competed; myK9Show has only notifications)
- No scoring context tracking (`isScoringInProgress`, `setScoringActive`)
- No singleton pattern -- export plain functions, let the notification store manage state

### Integration

The existing notification processing pipeline (where push/toast/sound happen) gains a voice step:

1. Notification arrives (push, realtime subscription, etc.)
2. Existing processing: show toast, play sound, vibrate
3. **New:** Check if voice master toggle is on AND the notification's category toggle is on
4. If yes, generate voice text from the notification payload using the template
5. Call `speak()` with the generated text

## State Management

All voice preferences live in `notificationStore` (Zustand with localStorage persist), extending the existing notification preferences:

```typescript
// Added to existing notification preferences
voiceEnabled: boolean; // master toggle
voiceCategories: {
  runOrder: boolean; // default: true
  results: boolean; // default: true
  classStarting: boolean; // default: true
  announcements: boolean; // default: true
}
voiceName: string; // selected voice name, '' = browser default
voiceRate: number; // 0.5 - 2.0, default 1.0
```

## Browser Support

- Chrome/Edge: full support
- Safari: full support
- Firefox: partial (limited voice selection)
- If `speechSynthesis` is not available, the entire Voice Announcements card is hidden

## Files Changed

### Modified

- `apps/myk9show/src/components/notifications/NotificationSettings.tsx` -- add Voice Announcements card, restructure Channels card to include Push
- `apps/myk9show/src/store/notificationStore.ts` -- add voice preference fields
- `apps/myk9show/src/pages/PreferencesPage.tsx` -- remove ScoringSettings section/tab
- `apps/myk9show/src/stores/settingsStore.ts` -- remove voice-related fields

### New

- `apps/myk9show/src/lib/voice.ts` -- voice service (speak, detect voices, classify quality)
- `apps/myk9show/src/lib/voice-text.ts` -- notification-to-speech text generation templates
- `apps/myk9show/src/lib/voice.test.ts` -- voice service tests
- `apps/myk9show/src/lib/voice-text.test.ts` -- voice text generation tests

### Removed

- `apps/myk9show/src/components/preferences/ScoringSettings.tsx`

## Testing

- Voice text generation: unit tests for all templates, fallback cases, edge cases (missing dog name, missing armband, emoji stripping)
- Voice service: unit tests for `speak()`, voice classification (recommended vs other), browser detection, Chrome cancel workaround
- NotificationSettings: component tests for render, toggle interactions, voice picker grouping, nudge visibility logic
- Integration: test that notification pipeline calls `speak()` when voice is enabled for a category and skips when disabled

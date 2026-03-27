# Comprehensive Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize PreferencesPage into grouped sidebar categories and add Scoring, Install App, and General settings sections, plus wire up the placeholder cache clear button.

**Architecture:** Refactor the flat `tabs` array in PreferencesPage into a `SettingsGroup[]` structure with 4 functional categories. Add 3 new panel components following the existing pattern (Card-based, reads/writes settingsStore). Fix the non-functional cache clear button in DataSettings. Role-gate the Scoring section via `useAuth().hasRole()`.

**Tech Stack:** React, TypeScript, Zustand (settingsStore), Web Speech API, shadcn/ui components, Tailwind CSS, Vitest + React Testing Library

**Spec:** `docs/superpowers/specs/2026-03-27-comprehensive-settings-design.md`

---

## File Map

### New files

- `apps/myk9show/src/components/preferences/GeneralSettings.tsx` — Haptic feedback toggle
- `apps/myk9show/src/components/preferences/ScoringSettings.tsx` — Voice announcements + voice config
- `apps/myk9show/src/components/preferences/InstallAppSettings.tsx` — PWA install status + instructions
- `apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx`
- `apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx`

### Modified files

- `apps/myk9show/src/pages/PreferencesPage.tsx` — Grouped sidebar, new tab values, mobile two-level nav, import new components
- `apps/myk9show/src/components/preferences/DataSettings.tsx` — Wire cache clear button with confirmation dialog

---

### Task 1: GeneralSettings Component (TDD)

**Files:**

- Create: `apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx`
- Create: `apps/myk9show/src/components/preferences/GeneralSettings.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { GeneralSettings } from '../GeneralSettings';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock the haptic feedback hook
vi.mock('@myk9/scoring-ui', () => ({
  useHapticFeedback: () => ({
    light: vi.fn(),
    medium: vi.fn(),
    isSupported: true,
  }),
}));

describe('GeneralSettings', () => {
  beforeEach(() => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: true });
  });

  it('renders haptic feedback toggle', () => {
    render(<GeneralSettings />);
    expect(screen.getByText('Haptic Feedback')).toBeInTheDocument();
    expect(screen.getByText(/vibrate on touch/i)).toBeInTheDocument();
  });

  it('reads haptic feedback state from settings store', () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    render(<GeneralSettings />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('writes haptic feedback state to settings store on toggle', async () => {
    useSettingsStore.getState().updateSettings({ hapticFeedback: false });
    const { user } = render(<GeneralSettings />);
    const toggle = screen.getByRole('switch');
    await user.click(toggle);
    expect(useSettingsStore.getState().settings.hapticFeedback).toBe(true);
  });

  it('shows section title and description', () => {
    render(<GeneralSettings />);
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText(/app behavior and interaction/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/GeneralSettings.test.tsx`
Expected: FAIL — `GeneralSettings` module not found

- [ ] **Step 3: Implement GeneralSettings**

```tsx
// apps/myk9show/src/components/preferences/GeneralSettings.tsx
import { Vibrate } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useSettingsStore } from '@/stores/settingsStore';
import { useHapticFeedback } from '@myk9/scoring-ui';

export function GeneralSettings() {
  const hapticFeedback = useSettingsStore(s => s.settings.hapticFeedback);
  const updateSettings = useSettingsStore(s => s.updateSettings);
  const haptic = useHapticFeedback(() => true);

  const handleHapticToggle = (checked: boolean) => {
    updateSettings({ hapticFeedback: checked });
    if (checked && haptic.isSupported) {
      haptic.light();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="text-sm text-muted-foreground">App behavior and interaction preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Vibrate className="h-5 w-5" />
            Interaction
          </CardTitle>
          <CardDescription>Control how the app responds to your actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Haptic Feedback</Label>
              <div className="text-sm text-muted-foreground">
                Vibrate on touch interactions (mobile)
              </div>
            </div>
            <Switch checked={hapticFeedback} onCheckedChange={handleHapticToggle} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/GeneralSettings.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/preferences/GeneralSettings.tsx apps/myk9show/src/components/preferences/__tests__/GeneralSettings.test.tsx
git commit -m "feat: add GeneralSettings component with haptic feedback toggle"
```

---

### Task 2: ScoringSettings Component (TDD)

**Files:**

- Create: `apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx`
- Create: `apps/myk9show/src/components/preferences/ScoringSettings.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx
import { render, screen, within } from '@/test/utils/testUtils';
import { ScoringSettings } from '../ScoringSettings';
import { useSettingsStore } from '@/stores/settingsStore';

// Mock speechSynthesis
const mockVoices = [
  { name: 'Samantha', lang: 'en-US', default: true, localService: true, voiceURI: 'Samantha' },
  { name: 'Daniel', lang: 'en-GB', default: false, localService: true, voiceURI: 'Daniel' },
  { name: 'Thomas', lang: 'fr-FR', default: false, localService: true, voiceURI: 'Thomas' },
] as SpeechSynthesisVoice[];

const mockSpeak = vi.fn();
const mockCancel = vi.fn();

Object.defineProperty(window, 'speechSynthesis', {
  value: {
    getVoices: () => mockVoices,
    speak: mockSpeak,
    cancel: mockCancel,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    onvoiceschanged: null,
  },
  writable: true,
});

describe('ScoringSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettingsStore.getState().updateSettings({
      voiceAnnouncements: false,
      voiceName: '',
      voiceRate: 1.0,
    });
  });

  it('renders voice announcements toggle', () => {
    render(<ScoringSettings />);
    expect(screen.getByText('Voice Announcements')).toBeInTheDocument();
    expect(screen.getByText(/30-second warning/i)).toBeInTheDocument();
  });

  it('toggles voice announcements in store', async () => {
    const { user } = render(<ScoringSettings />);
    const toggles = screen.getAllByRole('switch');
    // First toggle is voice announcements
    await user.click(toggles[0]);
    expect(useSettingsStore.getState().settings.voiceAnnouncements).toBe(true);
  });

  it('renders voice selection dropdown with English voices only', () => {
    render(<ScoringSettings />);
    const select = screen.getByLabelText(/voice$/i);
    expect(select).toBeInTheDocument();
    // Should have Samantha and Daniel (English), not Thomas (French)
    const options = within(select).getAllByRole('option');
    const optionTexts = options.map(o => o.textContent);
    expect(optionTexts).toContain('Samantha');
    expect(optionTexts).toContain('Daniel');
    expect(optionTexts).not.toContain('Thomas');
  });

  it('renders speed slider', () => {
    render(<ScoringSettings />);
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('0.5x')).toBeInTheDocument();
    expect(screen.getByText('2x')).toBeInTheDocument();
  });

  it('updates voice name in store', async () => {
    const { user } = render(<ScoringSettings />);
    const select = screen.getByLabelText(/voice$/i);
    await user.selectOptions(select, 'Daniel');
    expect(useSettingsStore.getState().settings.voiceName).toBe('Daniel');
  });

  it('test voice button speaks sample text', async () => {
    const { user } = render(<ScoringSettings />);
    const testBtn = screen.getByRole('button', { name: /test voice/i });
    await user.click(testBtn);
    expect(mockSpeak).toHaveBeenCalledTimes(1);
    const utterance = mockSpeak.mock.calls[0][0];
    expect(utterance.text).toBe('This is a test of your selected voice.');
  });

  it('renders section title', () => {
    render(<ScoringSettings />);
    expect(screen.getByText('Scoring')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/ScoringSettings.test.tsx`
Expected: FAIL — `ScoringSettings` module not found

- [ ] **Step 3: Implement ScoringSettings**

```tsx
// apps/myk9show/src/components/preferences/ScoringSettings.tsx
import { useState, useEffect } from 'react';
import { Volume2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useSettingsStore } from '@/stores/settingsStore';

export function ScoringSettings() {
  const voiceAnnouncements = useSettingsStore(s => s.settings.voiceAnnouncements);
  const voiceName = useSettingsStore(s => s.settings.voiceName);
  const voiceRate = useSettingsStore(s => s.settings.voiceRate);
  const updateSettings = useSettingsStore(s => s.updateSettings);

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // [EXPANDED] Guard against browsers without Web Speech API
  const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!hasSpeechSynthesis) return;

    const loadVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();
      setVoices(allVoices.filter(v => v.lang.startsWith('en')));
    };

    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, [hasSpeechSynthesis]);

  const handleTestVoice = () => {
    if (!hasSpeechSynthesis) return; // [ADDED] guard
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('This is a test of your selected voice.');
    const selectedVoice = voices.find(v => v.name === voiceName);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = voiceRate;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Scoring</h2>
        <p className="text-sm text-muted-foreground">
          Voice announcements and audio during scoring
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            Announcements
          </CardTitle>
          <CardDescription>Configure voice announcements for scoring sessions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="font-medium">Voice Announcements</Label>
              <div className="text-sm text-muted-foreground">
                Announce 30-second warning aloud during scoring
              </div>
            </div>
            <Switch
              checked={voiceAnnouncements}
              onCheckedChange={checked => updateSettings({ voiceAnnouncements: checked })}
            />
          </div>

          <Separator />

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Voice Configuration
            </Label>
          </div>

          <div className="space-y-1">
            <Label htmlFor="voice-select" className="font-medium">
              Voice
            </Label>
            <div className="text-sm text-muted-foreground mb-2">
              Select system voice for announcements
            </div>
            <select
              id="voice-select"
              aria-label="Voice"
              value={voiceName}
              onChange={e => updateSettings({ voiceName: e.target.value })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Browser Default</option>
              {voices.map(voice => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label className="font-medium">Speed</Label>
            <div className="text-sm text-muted-foreground mb-2">Speaking rate</div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">0.5x</span>
              <Slider
                value={[voiceRate]}
                onValueChange={([value]) => updateSettings({ voiceRate: value })}
                min={0.5}
                max={2.0}
                step={0.1}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">2x</span>
            </div>
          </div>

          {/* [ADDED] Disable voice controls when speechSynthesis unavailable */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestVoice}
            disabled={!hasSpeechSynthesis}
          >
            <Volume2 className="h-4 w-4 mr-2" />
            Test Voice
          </Button>

          {!hasSpeechSynthesis && (
            <p className="text-xs text-muted-foreground mt-2">
              Voice features are not available in this browser.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/ScoringSettings.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/preferences/ScoringSettings.tsx apps/myk9show/src/components/preferences/__tests__/ScoringSettings.test.tsx
git commit -m "feat: add ScoringSettings component with voice announcements and voice config"
```

---

### Task 3: InstallAppSettings Component (TDD)

**Files:**

- Create: `apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx`
- Create: `apps/myk9show/src/components/preferences/InstallAppSettings.tsx`

- [ ] **Step 1: Write the test file**

```tsx
// apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { InstallAppSettings } from '../InstallAppSettings';

const mockUsePWAInstall = vi.fn();

vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => mockUsePWAInstall(),
}));

const defaultPWAState = {
  isInstalled: false,
  wasInstalledBefore: false,
  canInstall: true,
  isDismissed: false,
  isIOSSafari: false,
  promptInstall: vi.fn().mockResolvedValue(true),
  dismissInstallPrompt: vi.fn(),
  getInstallInstructions: vi.fn().mockReturnValue('Click the install button in the address bar'),
};

describe('InstallAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePWAInstall.mockReturnValue(defaultPWAState);
  });

  it('renders section title and description', () => {
    render(<InstallAppSettings />);
    expect(screen.getByText('Install App')).toBeInTheDocument();
    expect(screen.getByText(/add myK9Show to your home screen/i)).toBeInTheDocument();
  });

  it('shows installed status when app is installed', () => {
    mockUsePWAInstall.mockReturnValue({ ...defaultPWAState, isInstalled: true });
    render(<InstallAppSettings />);
    expect(screen.getByText(/app installed/i)).toBeInTheDocument();
  });

  it('shows install button when install is available', () => {
    render(<InstallAppSettings />);
    expect(screen.getByRole('button', { name: /install/i })).toBeInTheDocument();
  });

  it('calls promptInstall when install button is clicked', async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    mockUsePWAInstall.mockReturnValue({ ...defaultPWAState, promptInstall });
    const { user } = render(<InstallAppSettings />);
    await user.click(screen.getByRole('button', { name: /install/i }));
    expect(promptInstall).toHaveBeenCalled();
  });

  it('shows iOS instructions when on iOS Safari', () => {
    mockUsePWAInstall.mockReturnValue({
      ...defaultPWAState,
      canInstall: false,
      isIOSSafari: true,
      getInstallInstructions: vi.fn().mockReturnValue('Tap Share then Add to Home Screen'),
    });
    render(<InstallAppSettings />);
    expect(screen.getByText(/share/i)).toBeInTheDocument();
  });

  it('shows benefits list', () => {
    render(<InstallAppSettings />);
    expect(screen.getByText(/push notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/offline access/i)).toBeInTheDocument();
    expect(screen.getByText(/faster loading/i)).toBeInTheDocument();
  });

  it('hides install button when neither canInstall nor isIOSSafari', () => {
    mockUsePWAInstall.mockReturnValue({
      ...defaultPWAState,
      canInstall: false,
      isIOSSafari: false,
    });
    render(<InstallAppSettings />);
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/InstallAppSettings.test.tsx`
Expected: FAIL — `InstallAppSettings` module not found

- [ ] **Step 3: Implement InstallAppSettings**

```tsx
// apps/myk9show/src/components/preferences/InstallAppSettings.tsx
import { Download, CheckCircle2, Share2, Smartphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function InstallAppSettings() {
  const { isInstalled, canInstall, isIOSSafari, promptInstall, getInstallInstructions } =
    usePWAInstall();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Install App</h2>
        <p className="text-sm text-muted-foreground">Add myK9Show to your home screen</p>
      </div>

      {/* Status */}
      {isInstalled ? (
        <Alert className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription>
            <span className="font-medium">App Installed</span> — Running as standalone app
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Benefits
          </CardTitle>
          <CardDescription>Why install myK9Show as an app?</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Push notifications when your dogs are up
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Offline access at trial grounds
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Faster loading
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
              Full-screen experience
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Install Action */}
      {canInstall && (
        <Card>
          <CardContent className="pt-6">
            {/* [EXPANDED] Catch prompt rejection (user cancels or browser error) */}
            <Button onClick={() => promptInstall().catch(() => {})} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Install myK9Show
            </Button>
          </CardContent>
        </Card>
      )}

      {/* iOS Safari Instructions */}
      {isIOSSafari && !isInstalled && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              How to Install
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{getInstallInstructions()}</p>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal list-inside">
              <li>
                Tap the <strong>Share</strong> button in Safari's toolbar
              </li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>
              </li>
              <li>
                Tap <strong>Add</strong> in the top-right corner
              </li>
            </ol>
          </CardContent>
        </Card>
      )}

      {/* No install available */}
      {!canInstall && !isIOSSafari && !isInstalled && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Your browser doesn't support app installation. Try opening myK9Show in Chrome, Edge,
              or Safari on iOS.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/InstallAppSettings.test.tsx`
Expected: 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/preferences/InstallAppSettings.tsx apps/myk9show/src/components/preferences/__tests__/InstallAppSettings.test.tsx
git commit -m "feat: add InstallAppSettings component with PWA install status and instructions"
```

---

### Task 4: Wire Up Cache Clear in DataSettings (TDD)

**Files:**

- Create: `apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx`
- Modify: `apps/myk9show/src/components/preferences/DataSettings.tsx:287-289`

- [ ] **Step 1: Write the test file**

```tsx
// apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx
import { render, screen } from '@/test/utils/testUtils';
import { DataSettings } from '../DataSettings';

// Mock queryClient
const mockClear = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  queryClient: { clear: mockClear },
  queryKeys: {},
  cacheStrategies: {},
}));

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock location.reload
const mockReload = vi.fn();
Object.defineProperty(window, 'location', {
  value: { ...window.location, reload: mockReload },
  writable: true,
});

describe('DataSettings cache clear', () => {
  const defaultProps = {
    preferences: undefined,
    onUpdate: vi.fn(),
    onReset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('renders clear cache button', () => {
    render(<DataSettings {...defaultProps} />);
    expect(screen.getByRole('button', { name: /clear cache/i })).toBeInTheDocument();
  });

  it('shows confirmation before clearing', async () => {
    mockConfirm.mockReturnValue(false);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(mockConfirm).toHaveBeenCalledWith(expect.stringContaining('clear'));
    expect(mockClear).not.toHaveBeenCalled();
  });

  it('clears React Query cache and reloads on confirm', async () => {
    mockConfirm.mockReturnValue(true);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));
    expect(mockClear).toHaveBeenCalled();
    expect(mockReload).toHaveBeenCalled();
  });

  it('preserves settings and auth keys in localStorage', async () => {
    localStorage.setItem('myK9Q_settings', '{"theme":"dark"}');
    localStorage.setItem('supabase.auth.token', '{"access_token":"abc"}');
    localStorage.setItem('myk9-notification-preferences', '{"enabled":true}');
    localStorage.setItem('scroll_shows', '150');

    mockConfirm.mockReturnValue(true);
    const { user } = render(<DataSettings {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /clear cache/i }));

    // Preserved
    expect(localStorage.getItem('myK9Q_settings')).toBe('{"theme":"dark"}');
    expect(localStorage.getItem('supabase.auth.token')).toBe('{"access_token":"abc"}');
    // Cleared
    expect(localStorage.getItem('myk9-notification-preferences')).toBeNull();
    expect(localStorage.getItem('scroll_shows')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/DataSettings.test.tsx`
Expected: FAIL — clear cache button click does nothing (no confirm called, no clear called)

- [ ] **Step 3: Implement cache clear in DataSettings**

In `apps/myk9show/src/components/preferences/DataSettings.tsx`, add the import and handler, then wire the button:

Add import at top of file:

```tsx
import { queryClient } from '@/lib/queryClient';
```

Add handler function inside the `DataSettings` component, after the existing handlers:

```tsx
const PRESERVED_KEYS = ['myK9Q_settings', 'supabase.auth.token'];

const handleClearCache = () => {
  const confirmed = window.confirm(
    'This will clear all cached data and reload the app. Your settings and login will be preserved. Continue?'
  );
  if (!confirmed) return;

  // Clear localStorage except preserved keys
  const preserved = new Map<string, string>();
  for (const key of PRESERVED_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) preserved.set(key, value);
  }
  localStorage.clear();
  for (const [key, value] of preserved) {
    localStorage.setItem(key, value);
  }

  // Clear React Query cache
  queryClient.clear();

  // [EXPANDED] Clear IndexedDB — databases() not in Firefox; fallback to known names
  if (window.indexedDB?.databases) {
    window.indexedDB
      .databases()
      .then(dbs => {
        for (const db of dbs) {
          if (db.name) window.indexedDB.deleteDatabase(db.name);
        }
      })
      .catch(() => {});
  } else if (window.indexedDB) {
    window.indexedDB.deleteDatabase('myK9Q_Replication');
  }

  window.location.reload();
};
```

Replace the placeholder button (line ~287-289) with:

```tsx
<Button variant="outline" size="sm" className="text-xs h-6" onClick={handleClearCache}>
  Clear Cache
</Button>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/DataSettings.test.tsx`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/preferences/DataSettings.tsx apps/myk9show/src/components/preferences/__tests__/DataSettings.test.tsx
git commit -m "fix: wire up cache clear button in DataSettings with confirmation and reload"
```

---

### Task 5: Refactor PreferencesPage Sidebar Into Grouped Layout

**Files:**

- Modify: `apps/myk9show/src/pages/PreferencesPage.tsx`

> **[ADDED] Preservation note:** The sidebar footer (Export, Import, Sync Now, Reset All buttons + device badge, lines 277-346) and the content area alert banners (error, actionError, successMessage, lines 440-459) MUST be preserved as-is. Only the sidebar `<nav>` and the mobile nav toggle are rewritten.

- [ ] **Step 1: Define the grouped data structure**

Replace the `TabValue` type and `tabs` array (lines 37-90) in `PreferencesPage.tsx` with:

```tsx
import { useAuth } from '@/context/AuthContext';
import { UserRole } from '@/types/auth-types';
import { GeneralSettings } from '@/components/preferences/GeneralSettings';
import { ScoringSettings } from '@/components/preferences/ScoringSettings';
import { InstallAppSettings } from '@/components/preferences/InstallAppSettings';
import {
  Monitor,
  Bell,
  Settings,
  Wifi,
  Shield,
  Lock,
  Smartphone,
  SlidersHorizontal,
  Volume2,
  Trophy,
  Download as DownloadIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type TabValue =
  | 'theme'
  | 'general'
  | 'notifications'
  | 'scoring'
  | 'competition'
  | 'privacy'
  | 'security'
  | 'data'
  | 'devices'
  | 'install';

interface SettingsSection {
  id: TabValue;
  label: string;
  icon: LucideIcon;
  description: string;
  roleRequired?: UserRole[];
}

interface SettingsGroup {
  id: string;
  label: string;
  sections: SettingsSection[];
}

const settingsGroups: SettingsGroup[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    sections: [
      {
        id: 'theme',
        label: 'Theme & Display',
        icon: Monitor,
        description: 'Customize colors, layout, and visual preferences',
      },
      {
        id: 'general',
        label: 'General',
        icon: SlidersHorizontal,
        description: 'App behavior and interaction preferences',
      },
    ],
  },
  {
    id: 'alerts',
    label: 'Alerts & Sound',
    sections: [
      {
        id: 'notifications',
        label: 'Notifications',
        icon: Bell,
        description: 'Manage notification preferences and timing',
      },
      {
        id: 'scoring',
        label: 'Scoring',
        icon: Volume2,
        description: 'Voice announcements and audio during scoring',
        roleRequired: [UserRole.JUDGE, UserRole.SECRETARY, UserRole.STEWARD, UserRole.SITE_ADMIN],
      },
    ],
  },
  {
    id: 'events',
    label: 'Events',
    sections: [
      {
        id: 'competition',
        label: 'Competition',
        icon: Trophy,
        description: 'Set defaults for competition views and filters',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & Data',
    sections: [
      {
        id: 'privacy',
        label: 'Privacy',
        icon: Shield,
        description: 'Manage privacy and data sharing settings',
      },
      {
        id: 'security',
        label: 'Security',
        icon: Lock,
        description: 'Change your password and security settings',
      },
      {
        id: 'data',
        label: 'Data & Sync',
        icon: Wifi,
        description: 'Control data synchronization and performance',
      },
      {
        id: 'devices',
        label: 'Devices',
        icon: Smartphone,
        description: 'Manage connected devices and sync status',
      },
      {
        id: 'install',
        label: 'Install App',
        icon: DownloadIcon,
        description: 'Add myK9Show to your home screen',
      },
    ],
  },
];
```

- [ ] **Step 2: Add role filtering and auth hook**

Inside `PreferencesPage()`, add after the existing hooks:

```tsx
const { hasRole } = useAuth();

// Filter sections by role
const visibleGroups = settingsGroups
  .map(group => ({
    ...group,
    sections: group.sections.filter(
      section => !section.roleRequired || section.roleRequired.some(role => hasRole(role))
    ),
  }))
  .filter(group => group.sections.length > 0);

// Helper to find active section's label/description
const activeSection = visibleGroups.flatMap(g => g.sections).find(s => s.id === activeTab);

// Find which group the active tab belongs to
const activeGroupId =
  visibleGroups.find(g => g.sections.some(s => s.id === activeTab))?.id || visibleGroups[0]?.id;
```

- [ ] **Step 3: Rewrite the desktop sidebar nav**

Replace the `sidebarContent` variable's `<nav>` section (lines ~252-274) with:

```tsx
{
  /* Navigation Items — grouped */
}
<nav className="flex-1 overflow-y-auto p-2 space-y-4">
  {visibleGroups.map(group => (
    <div key={group.id}>
      <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {group.label}
      </div>
      <div className="space-y-0.5">
        {group.sections.map(section => (
          <button
            key={section.id}
            onClick={() => {
              setActiveTab(section.id);
              setMobileNavOpen(false);
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors text-sm',
              activeTab === section.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'hover:bg-muted/50 text-foreground'
            )}
          >
            <section.icon className="h-4 w-4 flex-shrink-0" />
            <span>{section.label}</span>
          </button>
        ))}
      </div>
    </div>
  ))}
</nav>;
```

- [ ] **Step 4: Rewrite the mobile nav**

Replace the mobile nav section (lines ~414-422) with a two-level nav:

```tsx
{
  /* Mobile nav — two-level: group pills + section chips */
}
<div className="md:hidden border-b border-border">
  {/* Group pills */}
  <div className="flex gap-1 px-4 pt-3 pb-2 overflow-x-auto">
    {visibleGroups.map(group => (
      <button
        key={group.id}
        onClick={() => {
          // Switch to first section of this group
          setActiveTab(group.sections[0].id);
        }}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
          activeGroupId === group.id
            ? 'bg-primary/10 text-primary'
            : 'bg-muted/50 text-muted-foreground'
        )}
      >
        {group.label}
      </button>
    ))}
  </div>
  {/* Section chips within active group */}
  {(() => {
    const activeGroup = visibleGroups.find(g => g.id === activeGroupId);
    if (!activeGroup || activeGroup.sections.length <= 1) return null;
    return (
      <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto">
        {activeGroup.sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveTab(section.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs whitespace-nowrap transition-colors border',
              activeTab === section.id
                ? 'border-primary/30 bg-primary/10 text-primary font-medium'
                : 'border-border bg-background text-muted-foreground'
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
    );
  })()}
</div>;
```

- [ ] **Step 5: Update content header and renderContent switch**

Update the content header to use `activeSection`:

```tsx
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-2xl font-semibold tracking-tight">{activeSection?.label}</h1>
    <p className="text-muted-foreground">{activeSection?.description}</p>
  </div>
  <SyncStatusIndicator syncState={syncState} compact />
</div>
```

Add new cases to the `renderContent` switch:

```tsx
      case 'general':
        return <GeneralSettings />;
      case 'scoring':
        return <ScoringSettings />;
      case 'install':
        return <InstallAppSettings />;
```

- [ ] **Step 6: Clean up unused imports**

Remove the old `Settings` icon import if no longer used (replaced by `SlidersHorizontal` and `Trophy`). Remove the old `tabs` constant reference. Ensure no unused variables remain.

- [ ] **Step 7: Run typecheck and lint**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck && pnpm lint`
Expected: Both pass with no errors

- [ ] **Step 8: Commit**

```bash
git add apps/myk9show/src/pages/PreferencesPage.tsx
git commit -m "refactor: reorganize PreferencesPage into grouped sidebar with 4 functional categories"
```

---

### Task 6: PreferencesPage Integration Tests

**Files:**

- Create: `apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx`

- [ ] **Step 1: Write integration tests**

```tsx
// apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx
import { render, screen, within } from '@/test/utils/testUtils';
import PreferencesPage from '@/pages/PreferencesPage';

// Mock auth context with configurable roles
const mockHasRole = vi.fn();
vi.mock('@/context/AuthContext', async () => {
  const actual = await vi.importActual('@/context/AuthContext');
  return {
    ...actual,
    useAuth: () => ({
      user: { id: 'test-user', email: 'test@test.com' },
      loading: false,
      hasRole: mockHasRole,
      hasPermission: () => false,
      getUserRoles: () => [],
      isAdmin: false,
      isSecretary: false,
      isExhibitor: true,
      isJudge: false,
    }),
  };
});

// Mock useAuthUser
vi.mock('@/hooks/useAuthUser', () => ({
  useAuthUser: () => ({ id: 'test-user', email: 'test@test.com' }),
}));

// Mock useUserPreferences
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    preferences: null,
    loading: false,
    error: null,
    syncState: 'idle',
    devices: [],
    updatePreferences: vi.fn(),
    resetToDefaults: vi.fn(),
    exportPreferences: vi.fn(),
    importPreferences: vi.fn(),
    forceSync: vi.fn(),
  }),
}));

// Mock PWA hook
vi.mock('@/hooks/usePWAInstall', () => ({
  usePWAInstall: () => ({
    isInstalled: false,
    canInstall: false,
    isIOSSafari: false,
    promptInstall: vi.fn(),
    dismissInstallPrompt: vi.fn(),
    getInstallInstructions: vi.fn(),
  }),
}));

// Mock scoring-ui
vi.mock('@myk9/scoring-ui', () => ({
  useHapticFeedback: () => ({ light: vi.fn(), isSupported: false }),
}));

describe('PreferencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRole.mockReturnValue(false);
  });

  it('renders grouped sidebar with category labels', () => {
    render(<PreferencesPage />);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Alerts & Sound')).toBeInTheDocument();
    expect(screen.getByText('Events')).toBeInTheDocument();
    expect(screen.getByText('Account & Data')).toBeInTheDocument();
  });

  it('renders all non-gated sections in sidebar', () => {
    render(<PreferencesPage />);
    expect(screen.getByText('Theme & Display')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Competition')).toBeInTheDocument();
    expect(screen.getByText('Install App')).toBeInTheDocument();
  });

  it('hides Scoring section for exhibitor role', () => {
    mockHasRole.mockReturnValue(false);
    render(<PreferencesPage />);
    const sidebar = screen.getByRole('navigation');
    expect(within(sidebar).queryByText('Scoring')).not.toBeInTheDocument();
  });

  it('shows Scoring section for judge role', () => {
    mockHasRole.mockImplementation((role: string) => role === 'judge');
    render(<PreferencesPage />);
    const sidebar = screen.getByRole('navigation');
    expect(within(sidebar).getByText('Scoring')).toBeInTheDocument();
  });

  it('navigates between sections on click', async () => {
    const { user } = render(<PreferencesPage />);
    const sidebar = screen.getByRole('navigation');

    // Click General
    await user.click(within(sidebar).getByText('General'));
    // Content area should show General heading
    expect(screen.getByRole('heading', { level: 2, name: 'General' })).toBeInTheDocument();

    // Click Install App
    await user.click(within(sidebar).getByText('Install App'));
    expect(screen.getByRole('heading', { level: 2, name: 'Install App' })).toBeInTheDocument();
  });

  it('defaults to Theme & Display section', () => {
    render(<PreferencesPage />);
    expect(screen.getByRole('heading', { level: 1, name: /theme & display/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd apps/myk9show && npx vitest run src/components/preferences/__tests__/PreferencesPage.test.tsx`
Expected: 6 tests PASS (some may need minor adjustments to selectors based on actual DOM)

- [ ] **Step 3: Fix any failing tests**

Adjust selectors or mocks based on actual rendered output. Common fixes: heading level mismatch, navigation role not present (add `<nav>` tag if missing from sidebar), or mock returns needing adjustment.

- [ ] **Step 4: Run full test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All existing + new tests pass. If any existing PreferencesPage-related tests break, fix them.

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/preferences/__tests__/PreferencesPage.test.tsx
git commit -m "test: add PreferencesPage integration tests for grouped sidebar and role gating"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run typecheck across monorepo**

Run: `pnpm typecheck`
Expected: Zero errors

- [ ] **Step 2: Run lint across monorepo**

Run: `pnpm lint`
Expected: Zero errors

- [ ] **Step 3: Run full myK9Show test suite**

Run: `cd apps/myk9show && pnpm test`
Expected: All tests pass, including new ones

- [ ] **Step 4: Visual smoke test**

Run: `pnpm dev:show`
Navigate to `/preferences` and verify:

- Desktop: grouped sidebar renders with 4 categories
- Sections navigate correctly on click
- General section shows haptic toggle
- Install App section shows PWA status
- Scoring section visible when logged in as judge/secretary (hidden for exhibitor)
- Clear Cache button in Data & Sync shows confirmation dialog
- Mobile: group pills + section chips render and navigate

- [ ] **Step 5: Commit any final fixes**

If any visual issues found, fix and commit.

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

// Mock SpeechSynthesisUtterance — not available in jsdom
class MockSpeechSynthesisUtterance {
  text: string;
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  constructor(text: string) {
    this.text = text;
  }
}
Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  value: MockSpeechSynthesisUtterance,
  writable: true,
});

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
    await user.click(toggles[0]);
    expect(useSettingsStore.getState().settings.voiceAnnouncements).toBe(true);
  });

  it('renders voice selection dropdown with English voices only', () => {
    render(<ScoringSettings />);
    const select = screen.getByLabelText(/voice$/i);
    expect(select).toBeInTheDocument();
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

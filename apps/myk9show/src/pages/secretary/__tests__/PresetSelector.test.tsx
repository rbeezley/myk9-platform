import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PresetSelector } from '../ResultsControlPage/PresetSelector';
import type { ShowSettings } from '@/hooks/queries/useShowSettingsDatabase';

// Mock mutation hooks
const mockMutate = vi.fn();
vi.mock('@/hooks/mutations/useShowSettingsMutations', () => ({
  useUpdateShowVisibility: () => ({ mutate: mockMutate, isPending: false }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

const defaultSettings: ShowSettings = {
  visibility: {
    placement: 'class_complete',
    qualification: 'immediate',
    time: 'class_complete',
    faults: 'class_complete',
    inheritedFrom: 'show',
    preset: 'standard',
  },
  selfCheckinEnabled: true,
  hasExplicitSettings: true,
};

function renderPresetSelector(props?: Partial<{ showId: string; settings: ShowSettings }>) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PresetSelector
        showId={props?.showId ?? 'show-1'}
        settings={props?.settings ?? defaultSettings}
      />
    </QueryClientProvider>
  );
}

describe('PresetSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders three preset cards', () => {
    renderPresetSelector();
    expect(screen.getByText('Immediately')).toBeInTheDocument();
    expect(screen.getByText('After Class')).toBeInTheDocument();
    expect(screen.getByText('After Review')).toBeInTheDocument();
  });

  it('highlights the active preset', () => {
    renderPresetSelector();
    // Standard preset should have the ring class
    const standardCard = screen.getByText('After Class').closest('[class*="card"]');
    expect(standardCard?.className).toContain('ring-2');
  });

  it('calls mutation when clicking a preset', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    await user.click(screen.getByText('Immediately'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', preset: 'open' }),
      expect.any(Object)
    );
  });

  it('shows advanced accordion when toggled', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByText('Placement')).toBeInTheDocument();
    expect(screen.getByText('Qualification')).toBeInTheDocument();
  });

  it('exposes preset cards as keyboard-operable buttons', () => {
    renderPresetSelector();
    const card = screen.getByRole('button', { name: 'Apply "After Class" preset' });
    expect(card).toHaveAttribute('tabindex', '0');
    // "standard" (After Class) is the active preset for defaultSettings
    expect(card).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies a preset when activated via the keyboard (Enter)', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    const card = screen.getByRole('button', { name: 'Apply "Immediately" preset' });
    card.focus();
    await user.keyboard('{Enter}');
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ showId: 'show-1', preset: 'open' }),
      expect.any(Object)
    );
  });

  it('gives each advanced timing select an accessible name', async () => {
    const user = userEvent.setup();
    renderPresetSelector();
    await user.click(screen.getByRole('button', { name: /advanced/i }));
    expect(screen.getByLabelText('Placement visibility timing')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualification visibility timing')).toBeInTheDocument();
  });
});

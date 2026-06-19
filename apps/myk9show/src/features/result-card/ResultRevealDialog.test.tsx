import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@/test/utils/testUtils';
import type { ResultCardModel } from './resultCardModel';
import { ResultRevealDialog } from './ResultRevealDialog';

const confettiMock = vi.hoisted(() => {
  const mock = vi.fn();
  return Object.assign(mock, {
    create: vi.fn(() => mock),
  });
});
vi.mock('canvas-confetti', () => ({ default: confettiMock }));
vi.mock('./renderResultCardImage', () => ({
  renderResultCardImage: vi.fn(() => Promise.resolve(new Blob(['png'], { type: 'image/png' }))),
}));
vi.mock('@/utils/share', async () => {
  const actual = await vi.importActual<typeof import('@/utils/share')>('@/utils/share');
  return { ...actual, shareFile: vi.fn(() => Promise.resolve('shared')) };
});

function makeModel(overrides: Partial<ResultCardModel> = {}): ResultCardModel {
  return {
    entryId: 'entry-1',
    releaseKey: 'entry-1:release',
    dogName: 'Ditto',
    showName: 'Rocky Mountain Classic',
    showDateLabel: '9/14/2026',
    className: 'Container Novice A',
    resultLabel: 'Q',
    placement: 1,
    placementLabel: '1st',
    timeLabel: '42.18s',
    faultsLabel: '0 faults',
    shareTitle: 'Ditto qualified',
    shareText: 'Ditto earned a Q.',
    shareEnabled: true,
    ...overrides,
  };
}

describe('ResultRevealDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  it('renders a dog-first qualifying reveal and marks it seen', () => {
    const onSeen = vi.fn();
    render(
      <ResultRevealDialog open onOpenChange={vi.fn()} model={makeModel()} onSeen={onSeen} />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Ditto')).toBeInTheDocument();
    expect(screen.getByText('Q')).toBeInTheDocument();
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(onSeen).toHaveBeenCalledWith('entry-1:release');
  });

  it('shares the rendered PNG when Share is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ResultRevealDialog open onOpenChange={vi.fn()} model={makeModel()} onSeen={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Share/i }));

    const { renderResultCardImage } = await import('./renderResultCardImage');
    const { shareFile } = await import('@/utils/share');
    expect(renderResultCardImage).toHaveBeenCalledWith(expect.objectContaining({ dogName: 'Ditto' }));
    expect(shareFile).toHaveBeenCalledWith(expect.any(Blob), {
      title: 'Ditto qualified',
      text: 'Ditto earned a Q.',
      fileName: 'ditto-result.png',
    });
  });

  it('[ADDED] skips confetti when reduced motion is requested', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(
      <ResultRevealDialog open onOpenChange={vi.fn()} model={makeModel()} onSeen={vi.fn()} />
    );

    const confetti = (await import('canvas-confetti')).default;
    expect(confetti).not.toHaveBeenCalled();
  });

  it('creates confetti without a worker so strict CSP allows the reveal', async () => {
    render(
      <ResultRevealDialog open onOpenChange={vi.fn()} model={makeModel()} onSeen={vi.fn()} />
    );

    const confetti = (await import('canvas-confetti')).default;
    expect(confetti.create).toHaveBeenCalledWith(undefined, { useWorker: false });
    expect(confetti).toHaveBeenCalledWith(
      expect.objectContaining({
        particleCount: 80,
      })
    );
  });

  it('[ADDED] keeps the result visible and explains when sharing fails', async () => {
    const user = userEvent.setup();
    const { shareFile } = await import('@/utils/share');
    vi.mocked(shareFile).mockRejectedValueOnce(new Error('Share failed'));
    render(
      <ResultRevealDialog open onOpenChange={vi.fn()} model={makeModel()} onSeen={vi.fn()} />
    );

    await user.click(screen.getByRole('button', { name: /Share/i }));

    expect(
      await screen.findByText("We couldn't prepare the share card. Your result is still here.")
    ).toBeInTheDocument();
    expect(screen.getByText('Ditto')).toBeInTheDocument();
  });
});

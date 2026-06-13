import { screen } from '@testing-library/react';
import { PlayCircle } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@/test/utils/testUtils';
import {
  ClassPrimaryActionButton,
  DogEntryIdentity,
  EntryIdentity,
  ProgressCell,
  StatusCell,
} from '../ShowMapStructureCells';
import type { ShowMapAction } from '../showMapActions';
import type { ShowMapNode } from '../showMapTypes';

function makeNode(overrides: Partial<ShowMapNode>): ShowMapNode {
  return {
    id: 'entry:entry-1',
    type: 'entry',
    label: 'Entry 1',
    childrenCount: 0,
    ...overrides,
  };
}

describe('ShowMapStructureCells', () => {
  it('renders entry dog and handler navigation as buttons when onNavigate exists', async () => {
    const onNavigate = vi.fn();
    const node = makeNode({
      entryDisplay: {
        armband: '12',
        dogName: 'Bella',
        breed: 'Labrador Retriever',
        handler: 'Jane Handler',
        dogHref: '/dogs/dog-12',
        handlerHref: '/people/person-12',
      },
    });

    const { user } = render(<EntryIdentity node={node} onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Bella' }));
    expect(onNavigate).toHaveBeenCalledWith('/dogs/dog-12');

    await user.click(screen.getByRole('button', { name: 'Jane Handler' }));
    expect(onNavigate).toHaveBeenCalledWith('/people/person-12');
  });

  it('renders entry identity as plain text when onNavigate is omitted', () => {
    const node = makeNode({
      entryDisplay: {
        armband: '12',
        dogName: 'Bella',
        breed: 'Labrador Retriever',
        handler: 'Jane Handler',
        dogHref: '/dogs/dog-12',
        handlerHref: '/people/person-12',
      },
    });

    render(<EntryIdentity node={node} />);

    expect(screen.getByText('Bella')).toBeInTheDocument();
    expect(screen.getByText('Jane Handler')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bella' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jane Handler' })).not.toBeInTheDocument();
  });

  it('renders dog-entry identity with class context', () => {
    const node = makeNode({
      id: 'dog-entry:entry-1',
      type: 'dog-entry',
      label: '#12 Bella',
      subtitle: 'Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30',
      dogEntryDisplay: {
        entryId: 'entry-1',
        classId: 'class-attention',
        classLabel: 'Interior Novice A',
      },
    });

    render(<DogEntryIdentity node={node} />);

    expect(screen.getByText('Interior Novice A')).toBeInTheDocument();
    expect(
      screen.getByText('Spring Trial · 2026-05-11 · Ring 2 · Judge Judy · 09:30')
    ).toBeInTheDocument();
  });

  it('renders status and progress fallback text', () => {
    const node = makeNode({});

    render(
      <>
        <StatusCell node={node} attentionCount={0} present={[]} />
        <ProgressCell node={node} />
      </>
    );

    expect(screen.getAllByText('-')).toHaveLength(2);
  });

  it('calls onAction for class primary mutation actions', async () => {
    const action: ShowMapAction = {
      id: 'mark-class-started',
      nodeId: 'class:class-future',
      label: 'Mark Class Started',
      why: 'Class has not started yet',
      priority: 62,
      classId: 'class-future',
      icon: PlayCircle,
    };
    const onAction = vi.fn();
    const onNavigate = vi.fn();

    const { user } = render(
      <ClassPrimaryActionButton
        action={action}
        progressPercent={undefined}
        onNavigate={onNavigate}
        onAction={onAction}
      />
    );

    await user.click(screen.getByRole('button', { name: /mark class started/i }));

    expect(onAction).toHaveBeenCalledWith(
      action,
      expect.objectContaining({
        kind: 'mutation',
        mutation: 'mark-class-started',
      })
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

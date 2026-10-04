import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClassChecklistStrip } from './ClassChecklistStrip';

describe('ClassChecklistStrip', () => {
  it('draws each item in order with its own state, and counts unknown apart from done', () => {
    render(
      <ClassChecklistStrip
        summary={{ done: 1, total: 4, unknown: 1, states: ['done', 'reprint', 'unknown', 'todo'] }}
      />
    );

    const squares = [
      ...screen.getByTestId('class-checklist-strip').querySelectorAll('[data-state]'),
    ];
    expect(squares.map(square => square.getAttribute('data-state'))).toEqual([
      'done',
      'reprint',
      'unknown',
      'todo',
    ]);
    // Unknown is an outline, never a fill that could read as done or not done.
    expect(squares[2]).toHaveClass('border-dashed');
    expect(squares[2]?.className).not.toMatch(/\bbg-/);
    expect(screen.getByText('1 of 4 steps done · 1 unknown')).toBeInTheDocument();
  });

  it('leaves out the unknown count when nothing is unknown', () => {
    render(
      <ClassChecklistStrip summary={{ done: 2, total: 2, unknown: 0, states: ['done', 'done'] }} />
    );

    expect(screen.getByText('2 of 2 steps done')).toBeInTheDocument();
  });
});

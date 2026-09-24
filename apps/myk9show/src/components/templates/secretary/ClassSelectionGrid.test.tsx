import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { createMockTemplate } from '@/test/utils/mockData';
import { ClassSelectionGrid } from './ClassSelectionGrid';

const template = createMockTemplate({
  templateName: 'AKC Scent Work',
  classDefinitions: [
    {
      className: 'Container Novice A',
      element: 'Container',
      level: 'Novice',
      section: 'A',
      displayOrder: 1,
    },
  ],
  defaults: { judgingTimeEstimate: 7 },
});

const selectedClass = template.classDefinitions[0]!;

function renderGrid(entryCountState: {
  status: 'loading' | 'unavailable' | 'ready';
  count: number;
}) {
  return render(
    <ClassSelectionGrid
      template={template}
      selectedClasses={[selectedClass]}
      onSelectionChange={() => undefined}
      entryCountState={entryCountState}
    />
  );
}

describe('ClassSelectionGrid judge-time estimate', () => {
  it.each([
    ['zero', { status: 'ready', count: 0 }],
    ['unavailable', { status: 'unavailable', count: 3 }],
    ['loading', { status: 'loading', count: 3 }],
  ] as const)('hides the estimate when current entry counts are %s', (_state, entryCountState) => {
    renderGrid(entryCountState);

    expect(screen.queryByText(/estimated judging time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/based on current entries/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear selection/i })).toBeInTheDocument();
  });

  it('multiplies minutes per run by the current entry count', () => {
    renderGrid({ status: 'ready', count: 3 });

    expect(screen.getByText(/21\s+minutes/)).toBeInTheDocument();
    expect(
      screen.getByText(/estimated judging time based on current entries/i)
    ).toBeInTheDocument();
  });

  it('shows per-run minutes, not per-class minutes, in the template summary', () => {
    renderGrid({ status: 'ready', count: 3 });

    expect(screen.getByText('7 min per run')).toBeInTheDocument();
    expect(screen.queryByText(/min per class/i)).not.toBeInTheDocument();
  });

  it('hides the estimate when the template has no minutes-per-run value', () => {
    render(
      <ClassSelectionGrid
        template={{ ...template, defaults: {} }}
        selectedClasses={[selectedClass]}
        onSelectionChange={() => undefined}
        entryCountState={{ status: 'ready', count: 3 }}
      />
    );

    expect(screen.queryByText(/estimated judging time/i)).not.toBeInTheDocument();
  });

  it('recalculates the estimate as current counts change', () => {
    const view = renderGrid({ status: 'ready', count: 1 });
    expect(screen.getByText(/7\s+minutes/)).toBeInTheDocument();

    view.rerender(
      <ClassSelectionGrid
        template={template}
        selectedClasses={[selectedClass]}
        onSelectionChange={() => undefined}
        entryCountState={{ status: 'ready', count: 0 }}
      />
    );

    expect(screen.queryByText(/based on current entries/i)).not.toBeInTheDocument();

    view.rerender(
      <ClassSelectionGrid
        template={template}
        selectedClasses={[selectedClass]}
        onSelectionChange={() => undefined}
        entryCountState={{ status: 'ready', count: 4 }}
      />
    );

    expect(screen.getByText(/28\s+minutes/)).toBeInTheDocument();
  });
});

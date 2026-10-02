import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/testUtils';
import { ClassCompactHeader } from '../ClassCompactHeader';
import type { ClassData } from '../types/classTypes';
import type { Trial } from '@/components/trials/types/trial.types';

function makeClassData(overrides: Partial<ClassData> = {}): ClassData {
  return {
    id: 'cls-1',
    trialId: 'trial-1',
    trial: 'Trial 1',
    trialDate: '2026-03-21',
    trialNumber: '1',
    classOrder: '1',
    status: 'Scheduled',
    judge: 'Jane Smith',
    element: 'Container',
    level: 'Novice',
    entryFee: 30,
    maxEntries: 40,
    timeLimit1: '2:30',
    ...overrides,
  };
}

function makeTrial(overrides: Partial<Trial> = {}): Trial {
  return {
    id: 'trial-1',
    showId: 'show-1',
    showName: 'Spring Classic',
    trialDate: '2026-03-21',
    trialNumber: 'Saturday Trial 1',
    status: 'Scheduled',
    trialType: 'Standard',
    ...overrides,
  };
}

describe('ClassCompactHeader', () => {
  it('renders class name from element and level', () => {
    render(<ClassCompactHeader parentShow={undefined} classData={makeClassData()} />);
    // The hero owns the page's one h1 (the header renders no second title).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Container Novice');
  });

  it('renders status badge with correct variant', () => {
    const { container, rerender } = render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ status: 'In Progress' })}
      />
    );
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(
      container.querySelector('[data-family="class"][data-shape="in-progress"]')
    ).not.toBeNull();

    rerender(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ status: 'Completed' })}
      />
    );
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(container.querySelector('[data-family="class"][data-shape="complete"]')).not.toBeNull();

    rerender(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ status: 'Scheduled' })}
      />
    );
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(
      container.querySelector('[data-family="class"][data-shape="not-started"]')
    ).not.toBeNull();
  });

  it('renders section label for Novice level', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ level: 'Novice', section: 'A' })}
      />
    );
    expect(screen.getByText('Section A')).toBeInTheDocument();
  });

  it('hides section label for non-Novice levels', () => {
    const { rerender } = render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ level: 'Advanced', section: 'A' })}
      />
    );
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();

    rerender(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ level: 'Excellent', section: 'A' })}
      />
    );
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();

    rerender(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ level: 'Master', section: 'A' })}
      />
    );
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });

  it('hides section label for Detective element', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ element: 'Detective', level: undefined, section: 'A' })}
      />
    );
    expect(screen.queryByText('Section A')).not.toBeInTheDocument();
  });

  it('renders metadata strip with all fields', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData()}
        parentTrial={makeTrial()}
        viewer="account"
      />
    );

    expect(screen.getByText('Judge')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();

    // The trial is the hero's parent link now, not a facts-strip cell.
    expect(screen.getByRole('link', { name: 'Saturday Trial 1' })).toBeInTheDocument();

    expect(screen.getByText('Date')).toBeInTheDocument();
    // The date should be formatted via toLocaleDateString

    expect(screen.getByText('Entry Fee')).toBeInTheDocument();
    expect(screen.getByText('$30.00')).toBeInTheDocument();

    expect(screen.getByText('Max Entries')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();

    expect(screen.getByText('Time Limit')).toBeInTheDocument();
    expect(screen.getByText('2:30')).toBeInTheDocument();
  });

  it('handles missing optional fields gracefully', () => {
    const minimal: ClassData = {
      id: 'cls-2',
      trialId: 'trial-2',
      trial: 'Trial 2',
      trialDate: '2026-03-22',
      trialNumber: '2',
      classOrder: '2',
      status: 'Scheduled',
      judge: '',
    };

    // Should not crash
    const { container } = render(<ClassCompactHeader parentShow={undefined} classData={minimal} />);
    expect(container).toBeTruthy();

    // Owner decision 6: a field the secretary should fill reads "Not set"; an
    // optional blank field is hidden, not dashed.
    expect(screen.getByText('Judge').closest('[data-testid="metadata-item"]')).toHaveTextContent(
      'Not set'
    );
    expect(
      screen.getByText('Entry Fee').closest('[data-testid="metadata-item"]')
    ).toHaveTextContent('Not set');
    expect(screen.queryByText('Max Entries')).not.toBeInTheDocument();
    expect(screen.queryByText('Time Limit')).not.toBeInTheDocument();
    expect(screen.queryByText('\u2014')).not.toBeInTheDocument();
  });

  it('shows Not set in muted text', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({ judge: '', trialDate: undefined })}
      />
    );
    const notSet = screen.getAllByText('Not set');
    expect(notSet.length).toBeGreaterThanOrEqual(2);
    for (const el of notSet) expect(el).toHaveClass('text-muted-foreground');
  });

  it('renders actions slot when provided', () => {
    const actions = (
      <div>
        <button>Edit</button>
        <button>More</button>
      </div>
    );
    render(
      <ClassCompactHeader parentShow={undefined} classData={makeClassData()} actions={actions} />
    );
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('does NOT render Enter Scores button', () => {
    render(<ClassCompactHeader parentShow={undefined} classData={makeClassData()} />);
    expect(screen.queryByText('Enter Scores')).not.toBeInTheDocument();
  });

  it('renders officials in metadata strip when assigned', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData({
          gateSteward: 'Alice Johnson',
          tableSteward: 'Bob Williams',
        })}
      />
    );
    expect(screen.getByText('Gate Steward')).toBeInTheDocument();
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    expect(screen.getByText('Table Steward')).toBeInTheDocument();
    expect(screen.getByText('Bob Williams')).toBeInTheDocument();
  });

  it('does not render steward fields when not assigned', () => {
    render(<ClassCompactHeader parentShow={undefined} classData={makeClassData()} />);
    expect(screen.queryByText('Gate Steward')).not.toBeInTheDocument();
    expect(screen.queryByText('Table Steward')).not.toBeInTheDocument();
  });

  it('falls back to trial number when trialType is missing', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData()}
        parentTrial={makeTrial({ trialType: undefined, trialNumber: '3' })}
      />
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('has no parent link when no parentTrial is provided', () => {
    render(<ClassCompactHeader parentShow={undefined} classData={makeClassData()} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links the hero to the parent trial (owner decision 11, M16)', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData()}
        parentTrial={makeTrial({ id: 'trial-9' })}
        viewer="account"
      />
    );
    expect(screen.getByRole('link', { name: 'Saturday Trial 1' })).toHaveAttribute(
      'href',
      '/trials/trial-9'
    );
  });
});

describe('ClassCompactHeader trial label', () => {
  // The one shared trial label: the trial's name first, never "Trial " + a number.
  it('shows the trial name through formatTrialLabel', () => {
    render(
      <ClassCompactHeader
        parentShow={undefined}
        classData={makeClassData()}
        parentTrial={makeTrial({ name: 'Saturday AM', trialNumber: '2' })}
      />
    );
    expect(screen.getByText('Saturday AM')).toBeInTheDocument();
  });
});

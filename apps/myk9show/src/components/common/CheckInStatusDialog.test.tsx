import { render, screen } from '@/test/utils/testUtils';
import { CheckInStatusDialog } from './CheckInStatusDialog';

const entryInfo = {
  armband: '42',
  dogName: 'Ace',
  handlerName: 'Pat Handler',
  className: 'Container Novice A',
  classNumber: '101',
};

describe('CheckInStatusDialog', () => {
  it('keeps dialog description inline to avoid invalid paragraph nesting', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={entryInfo}
        onUpdateStatus={vi.fn()}
      />
    );

    const description = screen.getByText('Armband #42').closest('[class*="text-muted-foreground"]');

    expect(description).not.toBeNull();
    expect(description?.querySelector('div')).toBeNull();
  });
});

// exhibitor-show-day-access: an exhibitor updating their own check-in must see
// first-person copy, only self-service statuses, and a correctly-labeled
// identifier — not staff voice, staff-only statuses, or a mislabeled number.
describe('CheckInStatusDialog — exhibitor voice', () => {
  it('shows plainly worded self-service choices, including withdrawal', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={entryInfo}
        onUpdateStatus={vi.fn()}
        userRole="exhibitor"
      />
    );

    expect(screen.getByText('I am here')).toBeInTheDocument();
    expect(screen.getByText('I am not there yet')).toBeInTheDocument();
    expect(screen.getByText('I have a conflict — tell the secretary')).toBeInTheDocument();
    expect(screen.getByText("I won't be running this class")).toBeInTheDocument();
    expect(screen.getByText('At Gate')).toBeInTheDocument();
  });

  it('uses first-person descriptions instead of third-person staff copy', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={entryInfo}
        onUpdateStatus={vi.fn()}
        userRole="exhibitor"
      />
    );

    expect(screen.getByText("I've checked in and I'm ready")).toBeInTheDocument();
    expect(screen.queryByText('Exhibitor has checked in and is ready')).not.toBeInTheDocument();
  });

  it('still shows staff statuses and staff-voice copy for a secretary', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={entryInfo}
        onUpdateStatus={vi.fn()}
        userRole="secretary"
      />
    );

    expect(screen.getByText('Conflict')).toBeInTheDocument();
    expect(screen.getByText('Pulled')).toBeInTheDocument();
    expect(screen.getByText('Exhibitor has checked in and is ready')).toBeInTheDocument();
  });

  it('labels a real armband correctly and never shows a confirmation number as one', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={{ ...entryInfo, armband: '42', confirmationNumber: 'MK9-000056' }}
        onUpdateStatus={vi.fn()}
      />
    );

    expect(screen.getByText('Armband #42')).toBeInTheDocument();
    expect(screen.queryByText(/Armband #MK9/)).not.toBeInTheDocument();
  });

  it('falls back to a labeled confirmation number when no armband is assigned yet', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={{ ...entryInfo, armband: undefined, confirmationNumber: 'MK9-000056' }}
        onUpdateStatus={vi.fn()}
      />
    );

    expect(screen.getByText('Confirmation #MK9-000056')).toBeInTheDocument();
    expect(screen.queryByText(/^Armband #/)).not.toBeInTheDocument();
  });

  it('does not render a dangling "#" when the class has no number', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={{ ...entryInfo, classNumber: '' }}
        onUpdateStatus={vi.fn()}
      />
    );

    expect(screen.getByText('Ace • Container Novice A')).toBeInTheDocument();
  });

  it('does not render a stray leading separator when no identifier is known', () => {
    render(
      <CheckInStatusDialog
        open={true}
        onOpenChange={vi.fn()}
        currentStatus="no-status"
        entryInfo={{ ...entryInfo, armband: undefined, confirmationNumber: undefined }}
        onUpdateStatus={vi.fn()}
      />
    );

    // Handler still shows, but the standalone "•" span that separates it from
    // an identifier must not render when there is no identifier before it.
    // (The dogName/className "•" on the second line is inline text within a
    // larger node, so it is not matched as a standalone "•" element.)
    expect(screen.getByText('Pat Handler')).toBeInTheDocument();
    expect(screen.queryByText('•')).not.toBeInTheDocument();
  });
});

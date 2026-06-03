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

    const description = screen
      .getByText('Armband #42')
      .closest('[class*="text-muted-foreground"]');

    expect(description).not.toBeNull();
    expect(description?.querySelector('div')).toBeNull();
  });
});

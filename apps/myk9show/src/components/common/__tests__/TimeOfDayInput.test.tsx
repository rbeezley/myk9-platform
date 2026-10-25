import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from '@/test/utils/testUtils';
import { TimeOfDayInput } from '../TimeOfDayInput';

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return <TimeOfDayInput aria-label="Start time" value={value} onChange={setValue} />;
}

describe('TimeOfDayInput', () => {
  // MYK9-832 #14: re-editing a filled trial time appended the new time ("01:00 PM08:00 AM").
  it('replaces a filled time when the secretary clicks in and types a new one', async () => {
    const user = userEvent.setup();
    render(<Harness initial="01:00 PM" />);
    const input = screen.getByLabelText('Start time');

    await user.click(input);
    await user.keyboard('8am');
    await user.tab();

    expect(input).toHaveValue('08:00 AM');
  });

  it('keeps typing into an empty field as it was', async () => {
    const user = userEvent.setup();
    render(<Harness initial="" />);
    const input = screen.getByLabelText('Start time');

    await user.click(input);
    await user.keyboard('9:15pm');
    await user.tab();

    expect(input).toHaveValue('09:15 PM');
  });
});

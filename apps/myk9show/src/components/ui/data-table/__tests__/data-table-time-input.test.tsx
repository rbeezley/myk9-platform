import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { TimeInput } from '../data-table-time-input';

function renderTimeInput(overrides?: Partial<React.ComponentProps<typeof TimeInput>>) {
  const defaultProps: React.ComponentProps<typeof TimeInput> = {
    value: '4532',
    onChange: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return { ...render(<TimeInput {...defaultProps} />), props: defaultProps };
}

describe('TimeInput', () => {
  it('shows formatted time when not focused', () => {
    renderTimeInput({ value: '4532' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // Input starts blurred — should show formatted value
    expect(input.value).toBe('0:45.32');
  });

  it('shows the formatted time while focused, not raw digits', async () => {
    const { user } = renderTimeInput({ value: '4532' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('0:45.32');
  });

  it('keeps the formatted time on blur', async () => {
    const { user } = renderTimeInput({ value: '4532' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    fireEvent.blur(input);
    expect(input.value).toBe('0:45.32');
  });

  function ControlledTimeInput({ onValue }: { onValue?: (v: string) => void }) {
    const [value, setValue] = React.useState('');
    return (
      <TimeInput
        value={value}
        onChange={v => {
          setValue(v);
          onValue?.(v);
        }}
        onCommit={() => {}}
        onCancel={() => {}}
      />
    );
  }

  it('formats live as digits are typed', async () => {
    const { user } = render(<ControlledTimeInput />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('4');
    expect(input.value).toBe('0:00.04');
    await user.keyboard('520');
    expect(input.value).toBe('0:45.20');
  });

  it('ignores digits past six so they cannot shift into minutes', async () => {
    const onValue = vi.fn();
    const { user } = render(<ControlledTimeInput onValue={onValue} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('52105210');
    expect(input.value).toBe('52:10.52');
    expect(onValue).toHaveBeenLastCalledWith('521052');
  });

  it('only accepts numeric input (filters letters)', async () => {
    const onChange = vi.fn();
    const { user } = renderTimeInput({ value: '', onChange });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    await user.type(input, 'a1b2c3');
    // Only digits should have been passed to onChange
    const calls = onChange.mock.calls.map(call => call[0] as string);
    calls.forEach(v => expect(v).toMatch(/^\d*$/));
  });

  it('calls onCommit on Tab', async () => {
    const onCommit = vi.fn();
    const { user } = renderTimeInput({ value: '4532', onCommit });
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Tab}');
    expect(onCommit).toHaveBeenCalled();
  });

  it('calls onCommit on Enter', async () => {
    const onCommit = vi.fn();
    const { user } = renderTimeInput({ value: '4532', onCommit });
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Enter}');
    expect(onCommit).toHaveBeenCalled();
  });

  it('calls onCancel on Escape', async () => {
    const onCancel = vi.fn();
    const { user } = renderTimeInput({ value: '4532', onCancel });
    const input = screen.getByRole('textbox');
    await user.click(input);
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows formatted time for a pre-formatted value when not focused', () => {
    renderTimeInput({ value: '1:23.45' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // Pre-formatted value should display as-is when already formatted
    expect(input.value).toBe('1:23.45');
  });

  it('autofocuses and shows the formatted time when autoFocus is true', () => {
    renderTimeInput({ value: '4532', autoFocus: true });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // With autoFocus, the input should be focused and show separators
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('0:45.32');
  });
});

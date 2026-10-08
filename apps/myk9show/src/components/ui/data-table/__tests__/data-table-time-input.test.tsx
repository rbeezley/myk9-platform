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

  it('shows raw digits when focused', async () => {
    const { user } = renderTimeInput({ value: '4532' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('4532');
  });

  it('formats on blur', async () => {
    const { user } = renderTimeInput({ value: '4532' });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('4532');
    fireEvent.blur(input);
    expect(input.value).toBe('0:45.32');
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

  function ControlledTimeInput({
    onValue,
    initial = '',
  }: {
    onValue?: (v: string) => void;
    initial?: string;
  }) {
    const [value, setValue] = React.useState(initial);
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

  it('ignores digits past six so they cannot shift into minutes', async () => {
    const onValue = vi.fn();
    const { user } = render(<ControlledTimeInput onValue={onValue} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('52105210');
    expect(input.value).toBe('521052');
    expect(onValue).toHaveBeenLastCalledWith('521052');
  });

  it('typing 60000 keeps every digit (no carry re-read)', async () => {
    const { user } = render(<ControlledTimeInput />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    await user.keyboard('60000');
    expect(input.value).toBe('60000');
  });

  it('holds the raw digits of a loaded value, so select-all and type replaces it', async () => {
    const onValue = vi.fn();
    const { user } = render(<ControlledTimeInput initial="1:23.45" onValue={onValue} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    await user.click(input);
    expect(input.value).toBe('12345');
    await user.tripleClick(input);
    await user.keyboard('13000');
    expect(input.value).toBe('13000');
    expect(onValue).toHaveBeenLastCalledWith('13000');
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

  it('autofocuses and shows raw digits when autoFocus is true', () => {
    renderTimeInput({ value: '4532', autoFocus: true });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // With autoFocus, the input should be focused and show raw digits
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('4532');
  });
});

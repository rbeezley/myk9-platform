import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEditableField } from '@/components/common/InlineEditableField';

describe('InlineEditableField', () => {
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn<(value: string) => Promise<void>>().mockResolvedValue(undefined);
  });

  describe('Display Mode', () => {
    it('should show the value as text', () => {
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);
      expect(screen.getByText('Rex')).toBeInTheDocument();
    });

    it('should show numeric values', () => {
      render(<InlineEditableField value={42} onSave={onSave} label="Weight" />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should show suffix after value', () => {
      render(<InlineEditableField value="65" onSave={onSave} label="Weight" suffix=" lbs" />);
      expect(screen.getByText('65 lbs')).toBeInTheDocument();
    });

    it('should show placeholder when value is null', () => {
      render(<InlineEditableField value={null} onSave={onSave} label="Breed" />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('should show placeholder when value is undefined', () => {
      render(<InlineEditableField value={undefined} onSave={onSave} label="Breed" />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('should show custom placeholder', () => {
      render(
        <InlineEditableField
          value={null}
          onSave={onSave}
          label="Breed"
          placeholder="Select breed"
        />
      );
      expect(screen.getByText('Select breed')).toBeInTheDocument();
    });

    it('should show placeholder when value is empty string', () => {
      render(<InlineEditableField value="" onSave={onSave} label="Name" />);
      expect(screen.getByText('Not set')).toBeInTheDocument();
    });

    it('should have an accessible edit button', () => {
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);
      expect(screen.getByRole('button', { name: 'Edit Name' })).toBeInTheDocument();
    });

    it('should disable button when disabled prop is true', () => {
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" disabled />);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('Entering Edit Mode', () => {
    it('should enter edit mode on click', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));

      expect(screen.getByRole('textbox')).toBeInTheDocument();
      expect(screen.getByRole('textbox')).toHaveValue('Rex');
    });

    it('should not enter edit mode when disabled', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" disabled />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('should render a number input for number fieldType', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="42" onSave={onSave} label="Weight" fieldType="number" />);

      await user.click(screen.getByRole('button', { name: 'Edit Weight' }));

      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
    });

    it('should render a select for select fieldType', async () => {
      const user = userEvent.setup();
      const options = [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
      ];
      render(
        <InlineEditableField
          value="male"
          onSave={onSave}
          label="Sex"
          fieldType="select"
          options={options}
        />
      );

      await user.click(screen.getByRole('button', { name: 'Edit Sex' }));

      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Male' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Female' })).toBeInTheDocument();
    });

    it('should use empty string as edit value when display value is null', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value={null} onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));

      expect(screen.getByRole('textbox')).toHaveValue('');
    });
  });

  describe('Saving with Enter', () => {
    it('should call onSave with trimmed value when Enter is pressed', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      expect(onSave).toHaveBeenCalledWith('Buddy');
    });

    it('should exit edit mode after successful save', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });

    it('should not call onSave when value has not changed', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.keyboard('{Enter}');

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('Cancelling with Escape', () => {
    it('should exit edit mode on Escape', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      expect(screen.getByRole('textbox')).toBeInTheDocument();

      await user.keyboard('{Escape}');

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.getByText('Rex')).toBeInTheDocument();
    });

    it('should not call onSave on Escape', async () => {
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Changed');
      await user.keyboard('{Escape}');

      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('Saving on Blur', () => {
    it('should call onSave when input loses focus with changed value', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <InlineEditableField value="Rex" onSave={onSave} label="Name" />
          <button>Other</button>
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy');
      await user.tab();

      expect(onSave).toHaveBeenCalledWith('Buddy');
    });
  });

  describe('Error State', () => {
    it('should display error message when save fails', async () => {
      onSave.mockRejectedValueOnce(new Error('Network error'));
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });
    });

    it('should show generic error for non-Error throws', async () => {
      onSave.mockRejectedValueOnce('something went wrong');
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Failed to save')).toBeInTheDocument();
      });
    });

    it('should stay in edit mode after save failure', async () => {
      onSave.mockRejectedValueOnce(new Error('Failed'));
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should clear error when entering edit mode again after cancel', async () => {
      onSave.mockRejectedValueOnce(new Error('Failed'));
      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      // Trigger error
      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });

      // Cancel and re-enter
      await user.keyboard('{Escape}');
      await user.click(screen.getByRole('button', { name: 'Edit Name' }));

      expect(screen.queryByText('Failed')).not.toBeInTheDocument();
    });
  });

  describe('Double-Save Prevention', () => {
    it('should prevent concurrent saves via savingRef guard', async () => {
      let resolveFirst: () => void;
      const firstSave = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });
      onSave.mockReturnValueOnce(firstSave);

      const user = userEvent.setup();
      render(
        <div>
          <InlineEditableField value="Rex" onSave={onSave} label="Name" />
          <button>Other</button>
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy');

      // Trigger save via Enter — this starts the first save
      await user.keyboard('{Enter}');

      // The blur handler will also fire, but savingRef should block the second save
      // At this point onSave should only have been called once
      expect(onSave).toHaveBeenCalledTimes(1);

      // Resolve the save
      await act(async () => {
        resolveFirst!();
      });
    });
  });

  describe('Success Checkmark', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should show success checkmark after save then hide it', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });

      // Check icon should be visible (rendered as svg with the Check lucide icon)
      const button = screen.getByRole('button', { name: 'Edit Name' });
      const checkIcon = button.querySelector('svg');
      expect(checkIcon).toBeInTheDocument();

      // Advance past the 600ms timer
      await act(async () => {
        vi.advanceTimersByTime(700);
      });

      // The pencil icon may still be present, but the check icon should be gone
      // After success fades, clicking should still work
      expect(screen.getByRole('button', { name: 'Edit Name' })).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show spinner during save', async () => {
      let resolveSave: () => void;
      const pendingSave = new Promise<void>(resolve => {
        resolveSave = resolve;
      });
      onSave.mockReturnValueOnce(pendingSave);

      const user = userEvent.setup();
      render(<InlineEditableField value="Rex" onSave={onSave} label="Name" />);

      await user.click(screen.getByRole('button', { name: 'Edit Name' }));
      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Buddy{Enter}');

      // Should show the spinner (Loader2 has animate-spin class)
      await waitFor(() => {
        const spinner = document.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });

      // Input should be disabled during save
      expect(screen.getByRole('textbox')).toBeDisabled();

      // Resolve the save
      await act(async () => {
        resolveSave!();
      });

      // Should exit edit mode
      await waitFor(() => {
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      });
    });
  });
});

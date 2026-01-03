import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input/input';

describe('Input Component', () => {
  describe('Rendering', () => {
    it('should render input element', () => {
      render(<Input />);
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with placeholder', () => {
      render(<Input placeholder="Enter text here" />);
      expect(screen.getByPlaceholderText('Enter text here')).toBeInTheDocument();
    });

    it('should render with default value', () => {
      render(<Input defaultValue="Initial value" />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Initial value');
    });

    it('should render with controlled value', () => {
      render(<Input value="Controlled value" onChange={() => {}} />);
      const input = screen.getByRole('textbox') as HTMLInputElement;
      expect(input.value).toBe('Controlled value');
    });

    it('should render with custom className', () => {
      render(<Input className="custom-input" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('custom-input');
    });
  });

  describe('Input Types', () => {
    it('should render email input', () => {
      render(<Input type="email" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('type', 'email');
    });

    it('should render password input', () => {
      render(<Input type="password" />);
      const input = screen.getByDisplayValue('');
      expect(input).toHaveAttribute('type', 'password');
    });

    it('should render number input', () => {
      render(<Input type="number" />);
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should render date input', () => {
      render(<Input type="date" />);
      const input = screen.getByDisplayValue('');
      expect(input).toHaveAttribute('type', 'date');
    });

    it('should render search input', () => {
      render(<Input type="search" />);
      const input = screen.getByRole('searchbox');
      expect(input).toHaveAttribute('type', 'search');
    });
  });

  describe('States', () => {
    it('should render disabled state', () => {
      render(<Input disabled />);
      const input = screen.getByRole('textbox');
      expect(input).toBeDisabled();
    });

    it('should render readonly state', () => {
      render(<Input readOnly value="readonly value" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('readonly');
    });

    it('should render required state', () => {
      render(<Input required />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('required');
    });

    it('should render with maxLength', () => {
      render(<Input maxLength={10} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('maxLength', '10');
    });

    it('should render with minLength', () => {
      render(<Input minLength={3} />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('minLength', '3');
    });
  });

  describe('Interactions', () => {
    it('should handle onChange events', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Input onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'test input');
      expect(handleChange).toHaveBeenCalled();
      expect(input).toHaveValue('test input');
    });

    it('should handle onFocus events', () => {
      const handleFocus = vi.fn();
      render(<Input onFocus={handleFocus} />);
      
      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      expect(handleFocus).toHaveBeenCalledTimes(1);
    });

    it('should handle onBlur events', () => {
      const handleBlur = vi.fn();
      render(<Input onBlur={handleBlur} />);
      
      const input = screen.getByRole('textbox');
      fireEvent.focus(input);
      fireEvent.blur(input);
      expect(handleBlur).toHaveBeenCalledTimes(1);
    });

    it('should handle keyboard events', async () => {
      const handleKeyDown = vi.fn();
      const user = userEvent.setup();

      render(<Input onKeyDown={handleKeyDown} />);
      const input = screen.getByRole('textbox');

      await user.type(input, '{enter}');
      expect(handleKeyDown).toHaveBeenCalled();
    });

    it('should not allow input when disabled', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Input disabled onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'should not work');
      expect(handleChange).not.toHaveBeenCalled();
      expect(input).toHaveValue('');
    });

    it('should not allow input when readonly', async () => {
      const handleChange = vi.fn();
      const user = userEvent.setup();

      render(<Input readOnly value="readonly" onChange={handleChange} />);
      const input = screen.getByRole('textbox');

      await user.type(input, 'should not work');
      expect(input).toHaveValue('readonly');
    });
  });

  describe('Forward Ref', () => {
    it('should forward ref to input element', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      
      expect(ref.current).toBeInstanceOf(HTMLInputElement);
    });

    it('should allow ref methods to be called', () => {
      const ref = React.createRef<HTMLInputElement>();
      render(<Input ref={ref} />);
      
      ref.current?.focus();
      expect(ref.current).toHaveFocus();
    });
  });

  describe('Accessibility', () => {
    it('should support aria-label', () => {
      render(<Input aria-label="Custom input label" />);
      expect(screen.getByLabelText('Custom input label')).toBeInTheDocument();
    });

    it('should support aria-describedby', () => {
      render(
        <>
          <Input aria-describedby="help-text" />
          <div id="help-text">This is help text</div>
        </>
      );
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-describedby', 'help-text');
    });

    it('should support aria-invalid for error state', () => {
      render(<Input aria-invalid="true" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('should be focusable', () => {
      render(<Input />);
      const input = screen.getByRole('textbox');
      
      input.focus();
      expect(input).toHaveFocus();
    });
  });

  describe('Validation', () => {
    it('should support HTML5 validation attributes', () => {
      render(
        <Input 
          type="email" 
          required 
          pattern="[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$"
          title="Please enter a valid email address"
        />
      );
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('pattern');
      expect(input).toHaveAttribute('title');
      expect(input).toHaveAttribute('required');
    });

    it('should handle number input validation', () => {
      render(<Input type="number" min="0" max="100" step="5" />);
      
      const input = screen.getByRole('spinbutton');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '100');
      expect(input).toHaveAttribute('step', '5');
    });
  });

  describe('Error States', () => {
    it('should render with error styling', () => {
      render(<Input className="border-red-500" aria-invalid="true" />);
      const input = screen.getByRole('textbox');
      expect(input).toHaveClass('border-red-500');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });

    it('should clear error state on input', async () => {
      const TestComponent = () => {
        const [hasError, setHasError] = React.useState(true);
        return (
          <Input 
            aria-invalid={hasError}
            onChange={() => setHasError(false)}
            className={hasError ? 'border-red-500' : ''}
          />
        );
      };

      const user = userEvent.setup();
      render(<TestComponent />);
      
      const input = screen.getByRole('textbox');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      
      await user.type(input, 'test');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });
  });
});
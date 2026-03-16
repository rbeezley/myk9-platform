import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { useFormValidation } from '../useFormValidation';

const testSchema = z.object({
  name: z.string().min(1, 'Please enter a name'),
  email: z.string().email('Please enter a valid email'),
  age: z.string().optional(),
});

type TestData = z.infer<typeof testSchema>;

const initialData: TestData = { name: '', email: '', age: '' };

describe('useFormValidation', () => {
  describe('basic state', () => {
    it('returns initial data', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.data).toEqual(initialData);
    });

    it('returns no visible errors initially', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.errors).toEqual({});
      expect(result.current.getError('name')).toBeUndefined();
    });

    it('reports isValid based on schema (even before touching)', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.isValid).toBe(false);
    });

    it('reports isValid true when initial data is valid', () => {
      const validData: TestData = { name: 'Rex', email: 'rex@dog.com', age: '5' };
      const { result } = renderHook(() => useFormValidation(testSchema, validData));
      expect(result.current.isValid).toBe(true);
    });

    it('reports no changes initially', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.hasChanges).toBe(false);
    });

    it('is not submitting initially', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('setValue and setValues', () => {
    it('updates a single field', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.setValue('name', 'Rex'));
      expect(result.current.data.name).toBe('Rex');
    });

    it('updates multiple fields', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.setValues({ name: 'Rex', email: 'rex@dog.com' }));
      expect(result.current.data.name).toBe('Rex');
      expect(result.current.data.email).toBe('rex@dog.com');
    });

    it('reports hasChanges after setValue', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.setValue('name', 'Rex'));
      expect(result.current.hasChanges).toBe(true);
    });
  });

  describe('error timing', () => {
    it('does not show errors before field is touched', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      expect(result.current.getError('name')).toBeUndefined();
    });

    it('shows error after touchField (blur)', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.touchField('name'));
      expect(result.current.getError('name')).toBe('Please enter a name');
    });

    it('keeps error visible while user types invalid value (clear on valid only)', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      // Touch the field to show errors
      act(() => result.current.touchField('email'));
      expect(result.current.getError('email')).toBe('Please enter a valid email');

      // Type something still invalid — error persists
      act(() => result.current.setValue('email', 'not-an-email'));
      expect(result.current.getError('email')).toBe('Please enter a valid email');
    });

    it('clears error when field becomes valid', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.touchField('email'));
      expect(result.current.getError('email')).toBeDefined();

      act(() => result.current.setValue('email', 'valid@email.com'));
      expect(result.current.getError('email')).toBeUndefined();
    });

    it('shows all errors after handleSubmit with invalid data', async () => {
      const onSave = vi.fn();
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));

      await act(async () => {
        await result.current.handleSubmit(onSave)();
      });

      expect(result.current.getError('name')).toBe('Please enter a name');
      expect(result.current.getError('email')).toBe('Please enter a valid email');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('calls onSave with validated data on valid submit', async () => {
      const onSave = vi.fn();
      const validData: TestData = { name: 'Rex', email: 'rex@dog.com', age: '5' };
      const { result } = renderHook(() => useFormValidation(testSchema, validData));

      await act(async () => {
        await result.current.handleSubmit(onSave)();
      });

      expect(onSave).toHaveBeenCalledWith(validData);
    });

    it('sets isSubmitting while onSave is running', async () => {
      let resolvePromise: () => void;
      const onSave = vi.fn(
        () =>
          new Promise<void>(resolve => {
            resolvePromise = resolve;
          })
      );
      const validData: TestData = { name: 'Rex', email: 'rex@dog.com', age: '5' };
      const { result } = renderHook(() => useFormValidation(testSchema, validData));

      let submitPromise: Promise<void>;
      act(() => {
        submitPromise = result.current.handleSubmit(onSave)();
      });

      expect(result.current.isSubmitting).toBe(true);

      await act(async () => {
        resolvePromise!();
        await submitPromise!;
      });

      expect(result.current.isSubmitting).toBe(false);
    });
  });

  describe('reset', () => {
    it('resets to initial data', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.setValue('name', 'Rex'));
      act(() => result.current.touchField('name'));
      act(() => result.current.reset());
      expect(result.current.data).toEqual(initialData);
      expect(result.current.hasChanges).toBe(false);
      expect(result.current.errors).toEqual({});
    });

    it('resets to new data when provided', () => {
      const newData: TestData = { name: 'Buddy', email: 'buddy@dog.com', age: '3' };
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.reset(newData));
      expect(result.current.data).toEqual(newData);
      expect(result.current.hasChanges).toBe(false);
    });

    it('clears touched state and errors on reset (wizard step change)', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.touchField('name'));
      act(() => result.current.touchField('email'));
      expect(result.current.getError('name')).toBeDefined();

      const step2Data: TestData = { name: 'Pre-filled', email: 'pre@filled.com', age: '' };
      act(() => result.current.reset(step2Data));

      expect(result.current.errors).toEqual({});
      expect(result.current.getError('name')).toBeUndefined();
      expect(result.current.data).toEqual(step2Data);
      expect(result.current.isValid).toBe(true);
    });
  });

  describe('getFieldProps', () => {
    it('returns aria-invalid false when no error visible', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      const props = result.current.getFieldProps('name');
      expect(props['aria-invalid']).toBe(false);
    });

    it('returns aria-invalid true when error is visible', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      act(() => result.current.touchField('name'));
      const props = result.current.getFieldProps('name');
      expect(props['aria-invalid']).toBe(true);
    });

    it('returns aria-describedby with field-error id', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      const props = result.current.getFieldProps('name');
      expect(props['aria-describedby']).toBe('name-error');
    });

    it('provides a ref callback', () => {
      const { result } = renderHook(() => useFormValidation(testSchema, initialData));
      const props = result.current.getFieldProps('name');
      expect(typeof props.ref).toBe('function');
    });
  });
});

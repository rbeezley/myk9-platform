# Form Validation Standardization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize all myK9Show form validation with a consistent, accessible, elderly-friendly experience using two shared primitives (`useFormValidation` hook + `<FormField>` component).

**Architecture:** A `useFormValidation` hook owns all validation logic (Zod schema validation, touched state, error timing, scroll-to-error). A `<FormField>` component enforces consistent visual error display with accessibility attributes. EditPanelWrapper integrates the hook internally via a `schema` prop while preserving its existing change tracking and unsaved warnings.

**Tech Stack:** React, TypeScript, Zod (v4), Vitest, Tailwind CSS, Base UI

**Spec:** `docs/superpowers/specs/2026-03-16-form-validation-standardization-design.md`

---

## File Structure

### New files

| File                                                               | Responsibility                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `apps/myk9show/src/hooks/useFormValidation.ts`                     | Form validation hook — state, Zod integration, error timing, scroll-to-error |
| `apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts`      | Hook unit tests                                                              |
| `apps/myk9show/src/components/common/FormField.tsx`                | Visual wrapper — label, error message, accessibility, red border CSS         |
| `apps/myk9show/src/components/common/__tests__/FormField.test.tsx` | Component unit tests                                                         |
| `apps/myk9show/src/styles/form-field.css`                          | CSS for `.form-field[data-error]` border rule and pulse animation            |

### Modified files

| File                                                            | Changes                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `apps/myk9show/src/index.css`                                   | Add `@import './styles/form-field.css'`                                          |
| `apps/myk9show/src/components/panels/edit/useEditPanel.ts`      | Add `form` property to context type                                              |
| `apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx` | Add `schema` prop, use hook internally, remove error banner, always-enabled Save |
| `apps/myk9show/src/App.tsx`                                     | Remove `FormErrorProvider` import and wrapper                                    |
| `apps/myk9show/src/providers/FormErrorProvider.tsx`             | Delete                                                                           |
| `apps/myk9show/src/lib/validation.ts`                           | Update error messages to plain language, add missing schemas                     |

---

## Chunk 1: Core Primitives

### Task 1: `useFormValidation` Hook — Types and Basic State

**Files:**

- Create: `apps/myk9show/src/hooks/useFormValidation.ts`
- Create: `apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts`

- [ ] **Step 1: Write failing tests for hook types and basic state**

In `apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts`:

```typescript
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/useFormValidation.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hook — types, basic state, setValue, setValues, hasChanges**

In `apps/myk9show/src/hooks/useFormValidation.ts`:

```typescript
import { useState, useCallback, useRef, useMemo } from 'react';
import { z } from 'zod';

export interface FormFieldInputProps {
  'aria-invalid': boolean;
  'aria-describedby': string;
  ref: React.RefCallback<HTMLElement>;
}

export interface FormValidation<T> {
  data: T;
  errors: Record<string, string>;
  setValue: (field: keyof T, value: unknown) => void;
  setValues: (partial: Partial<T>) => void;
  getError: (field: keyof T) => string | undefined;
  getFieldProps: (field: keyof T) => FormFieldInputProps;
  touchField: (field: keyof T) => void;
  handleSubmit: (onSave: (data: T) => Promise<void> | void) => () => void;
  isSubmitting: boolean;
  isValid: boolean;
  reset: (data?: T) => void;
  hasChanges: boolean;
}

export function useFormValidation<T extends Record<string, unknown>>(
  schema: z.ZodSchema<T>,
  initialData: T
): FormValidation<T> {
  const [data, setData] = useState<T>(initialData);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const initialDataRef = useRef(initialData);
  const fieldRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Validate entire form against schema
  const validationErrors = useMemo(() => {
    const result = schema.safeParse(data);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    result.error.issues.forEach(issue => {
      if (issue.path.length > 0) {
        const key = issue.path[0] as string;
        if (!errors[key]) errors[key] = issue.message;
      }
    });
    return errors;
  }, [data, schema]);

  const isValid = Object.keys(validationErrors).length === 0;

  // Visible errors: only show for touched or submitted fields
  const errors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [field, message] of Object.entries(validationErrors)) {
      if (touched.has(field) || submitted) {
        visible[field] = message;
      }
    }
    return visible;
  }, [validationErrors, touched, submitted]);

  const hasChanges = JSON.stringify(data) !== JSON.stringify(initialDataRef.current);

  const setValue = useCallback((field: keyof T, value: unknown) => {
    setData(prev => ({ ...prev, [field]: value }));
  }, []);

  const setValues = useCallback((partial: Partial<T>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  const getError = useCallback(
    (field: keyof T): string | undefined => errors[field as string],
    [errors]
  );

  const touchField = useCallback((field: keyof T) => {
    setTouched(prev => {
      const next = new Set(prev);
      next.add(field as string);
      return next;
    });
  }, []);

  const getFieldProps = useCallback(
    (field: keyof T): FormFieldInputProps => {
      const fieldStr = field as string;
      const hasError = !!errors[fieldStr];
      return {
        'aria-invalid': hasError,
        'aria-describedby': `${fieldStr}-error`,
        ref: (el: HTMLElement | null) => {
          if (el) fieldRefs.current.set(fieldStr, el);
          else fieldRefs.current.delete(fieldStr);
        },
      };
    },
    [errors]
  );

  const handleSubmit = useCallback(
    (onSave: (data: T) => Promise<void> | void) => {
      return async () => {
        setSubmitted(true);
        // Mark all fields as touched
        const allFields = Object.keys(data);
        setTouched(new Set(allFields));

        const result = schema.safeParse(data);
        if (!result.success) {
          // Find first error field and scroll to it
          const firstErrorField = result.error.issues[0]?.path[0] as string;
          if (firstErrorField) {
            const el = fieldRefs.current.get(firstErrorField);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              if (
                el instanceof HTMLInputElement ||
                el instanceof HTMLSelectElement ||
                el instanceof HTMLTextAreaElement
              ) {
                el.focus();
              }
              // Trigger pulse animation on error message
              const errorEl = document.getElementById(`${firstErrorField}-error`);
              if (errorEl) {
                errorEl.classList.remove('animate-pulse-error');
                // Force reflow to restart animation
                void errorEl.offsetWidth;
                errorEl.classList.add('animate-pulse-error');
              }
            }
          }
          return;
        }

        try {
          setIsSubmitting(true);
          await onSave(result.data);
        } finally {
          setIsSubmitting(false);
        }
      };
    },
    [data, schema]
  );

  const reset = useCallback((newData?: T) => {
    const resetTo = newData ?? initialDataRef.current;
    setData(resetTo);
    setTouched(new Set());
    setSubmitted(false);
    if (newData) initialDataRef.current = newData;
  }, []);

  return {
    data,
    errors,
    setValue,
    setValues,
    getError,
    getFieldProps,
    touchField,
    handleSubmit,
    isSubmitting,
    isValid,
    reset,
    hasChanges,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/useFormValidation.test.ts`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/hooks/useFormValidation.ts apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts
git commit -m "feat(myk9show): add useFormValidation hook with basic state and setValue"
```

---

### Task 2: `useFormValidation` Hook — Error Timing (Blur, Change, Submit)

**Files:**

- Modify: `apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts`

- [ ] **Step 1: Write failing tests for error timing**

Append to the test file:

```typescript
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
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/useFormValidation.test.ts`
Expected: All tests PASS (the implementation from Task 1 already handles these behaviors)

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts
git commit -m "test(myk9show): add error timing and reset tests for useFormValidation"
```

---

### Task 3: `useFormValidation` Hook — getFieldProps and Accessibility

**Files:**

- Modify: `apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts`

- [ ] **Step 1: Write failing tests for getFieldProps**

Append to the test file:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/hooks/__tests__/useFormValidation.test.ts`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/myk9show/src/hooks/__tests__/useFormValidation.test.ts
git commit -m "test(myk9show): add getFieldProps accessibility tests for useFormValidation"
```

---

### Task 4: `<FormField>` Component

**Files:**

- Create: `apps/myk9show/src/components/common/FormField.tsx`
- Create: `apps/myk9show/src/components/common/__tests__/FormField.test.tsx`
- Create: `apps/myk9show/src/styles/form-field.css`
- Modify: `apps/myk9show/src/index.css`

- [ ] **Step 1: Write failing tests for FormField**

In `apps/myk9show/src/components/common/__tests__/FormField.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FormField } from '../FormField';

describe('FormField', () => {
  it('renders label text', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.getByText('Dog Name')).toBeInTheDocument();
  });

  it('renders required asterisk when required', () => {
    render(
      <FormField label="Dog Name" fieldId="name" required>
        <input id="name" />
      </FormField>
    );
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByText('(required)')).toHaveClass('sr-only');
  });

  it('does not render asterisk when not required', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders error message when error is provided', () => {
    render(
      <FormField label="Dog Name" fieldId="name" error="Please enter a name">
        <input id="name" />
      </FormField>
    );
    const errorEl = screen.getByText('Please enter a name');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl).toHaveAttribute('id', 'name-error');
  });

  it('does not render error message when error is undefined', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    expect(screen.queryByText('Please enter a name')).not.toBeInTheDocument();
  });

  it('sets data-error attribute when error is present', () => {
    const { container } = render(
      <FormField label="Dog Name" fieldId="name" error="Please enter a name">
        <input id="name" />
      </FormField>
    );
    const wrapper = container.querySelector('.form-field');
    expect(wrapper).toHaveAttribute('data-error');
  });

  it('does not set data-error attribute when no error', () => {
    const { container } = render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    const wrapper = container.querySelector('.form-field');
    expect(wrapper).not.toHaveAttribute('data-error');
  });

  it('renders hint text when provided', () => {
    render(
      <FormField label="Date of Birth" fieldId="dob" hint="Format: YYYY-MM-DD">
        <input id="dob" />
      </FormField>
    );
    expect(screen.getByText('Format: YYYY-MM-DD')).toBeInTheDocument();
  });

  it('renders label with htmlFor matching fieldId', () => {
    render(
      <FormField label="Dog Name" fieldId="name">
        <input id="name" />
      </FormField>
    );
    const label = screen.getByText('Dog Name');
    expect(label.closest('label')).toHaveAttribute('for', 'name');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/myk9show && pnpm vitest run src/components/common/__tests__/FormField.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create the CSS file**

In `apps/myk9show/src/styles/form-field.css`:

```css
/* Form field error styling — targets standard HTML inputs within errored FormField */
.form-field[data-error] input,
.form-field[data-error] select,
.form-field[data-error] textarea {
  @apply border-destructive focus-visible:ring-destructive;
}

/* Pulse animation for error messages on submit */
@keyframes pulse-error {
  0% {
    opacity: 1;
  }
  25% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  75% {
    opacity: 0.6;
  }
  100% {
    opacity: 1;
  }
}

.animate-pulse-error {
  animation: pulse-error 0.6s ease-in-out;
}
```

- [ ] **Step 4: Import the CSS file**

In `apps/myk9show/src/index.css`, add after the existing style imports (after line 11):

```css
@import './styles/form-field.css';
```

- [ ] **Step 5: Implement FormField component**

In `apps/myk9show/src/components/common/FormField.tsx`:

```tsx
import React from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  label: string;
  fieldId: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  fieldId,
  required = false,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div
      className={`form-field space-y-1.5 ${className ?? ''}`}
      {...(error ? { 'data-error': '' } : {})}
    >
      <Label htmlFor={fieldId}>
        {label}
        {required && (
          <>
            <span className="text-destructive ml-0.5" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {children}

      {error && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/myk9show && pnpm vitest run src/components/common/__tests__/FormField.test.tsx`
Expected: All 9 tests PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/common/FormField.tsx apps/myk9show/src/components/common/__tests__/FormField.test.tsx apps/myk9show/src/styles/form-field.css apps/myk9show/src/index.css
git commit -m "feat(myk9show): add FormField component with accessible error display"
```

---

### Task 5: EditPanelWrapper Integration

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/useEditPanel.ts`
- Modify: `apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx`

- [ ] **Step 1: Update the context type in useEditPanel.ts**

In `apps/myk9show/src/components/panels/edit/useEditPanel.ts`, update the interface to include the optional `form` property:

```typescript
import React from 'react';
import { FormValidation } from '@/hooks/useFormValidation';

export interface EditPanelContextValue<T = Record<string, unknown>> {
  // Form validation (present when schema is provided to EditPanelWrapper)
  form?: FormValidation<T>;

  // Legacy accessors (delegate to form when schema is provided)
  data: T;
  updateData: (updates: Partial<T>) => void;
  setData: (data: T) => void;

  // Existing (unchanged)
  hasChanges: boolean;
  isValid: boolean;
  errors: string[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const EditPanelContext = React.createContext<EditPanelContextValue | null>(null);

export const useEditPanel = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(): EditPanelContextValue<T> => {
  const context = React.useContext(EditPanelContext);
  if (!context) {
    throw new Error('useEditPanel must be used within EditPanelWrapper');
  }
  return context as EditPanelContextValue<T>;
};
```

- [ ] **Step 2: Update EditPanelWrapper to accept `schema` prop and integrate useFormValidation**

In `apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx`:

Key changes:

1. Add `schema?: z.ZodSchema` to props
2. When `schema` is provided, create `useFormValidation` instance — this owns the data state
3. When `schema` is NOT provided (legacy path), keep existing `useState` behavior
4. Log console warning when `validateData` is used
5. Remove error banner from the panel body
6. Change Save button: remove `!isValid` from disabled — use `handleSubmit` which validates on click
7. Footer error count stays (read from `form.errors` or legacy `errors`)
8. Expose `form` on context

The full implementation replaces the existing component. Key sections to change:

**Props:** Add `schema` to the interface:

```typescript
import { z } from 'zod';
import { useFormValidation, FormValidation } from '@/hooks/useFormValidation';

export interface EditPanelWrapperProps<T = Record<string, unknown>> {
  // ... existing props ...
  schema?: z.ZodSchema<T>; // NEW: Zod schema for validation
  validateData?: (data: T) => string[] | null; // LEGACY: console warning when used
  // ... rest unchanged ...
}
```

**Internal state:** Both hooks are always called (React rules of hooks), but only one is used:

```typescript
// Always call both hooks to satisfy rules of hooks — only one is used based on schema presence
const form = useFormValidation(schema ?? (z.object({}) as z.ZodSchema<T>), initialData);
const [legacyData, setLegacyData] = useState<T>(initialData);

// When schema is provided, useFormValidation is the source of truth
const useSchemaPath = !!schema;
const data = useSchemaPath ? form.data : legacyData;
const hasChanges = useSchemaPath
  ? form.hasChanges
  : JSON.stringify(legacyData) !== JSON.stringify(initialData);
```

The legacy `useState` path is inert when `schema` is provided (its state is never read). The `useFormValidation` call with a dummy schema is inert when no schema is provided (its return value is ignored).

**Save button:** Always enabled when there are changes:

```typescript
<Button
  onClick={form ? form.handleSubmit(onSave) : handleLegacySave}
  disabled={(!hasChanges && !forceHasChanges) || isLoading}
  className="gap-2 transition-all duration-200 hover:scale-105 active:scale-95"
>
```

**Error display:** Remove the error banner `<div>` block from the panel body. Keep the footer error count:

```typescript
{Object.keys(form?.errors ?? {}).length > 0 && (
  <div className="flex items-center gap-1 text-sm text-destructive">
    <AlertCircle className="h-3 w-3" />
    <span>{Object.keys(form!.errors).length} error{Object.keys(form!.errors).length !== 1 ? 's' : ''}</span>
  </div>
)}
```

**Console warning for legacy prop:**

```typescript
if (validateData && !schema) {
  console.warn(
    'EditPanelWrapper: validateData is deprecated. Use schema prop with a Zod schema instead.'
  );
}
```

**Context value:**

```typescript
const contextValue: EditPanelContextValue<Record<string, unknown>> = {
  form: form as FormValidation<Record<string, unknown>> | undefined,
  data: data as Record<string, unknown>,
  updateData: form
    ? updates => form.setValues(updates as Partial<T>)
    : (updateData as (updates: Partial<Record<string, unknown>>) => void),
  setData: form
    ? newData => form.reset(newData as T)
    : (setCompleteData as (data: Record<string, unknown>) => void),
  hasChanges,
  isValid: form ? form.isValid : isValid,
  errors: form ? Object.values(form.errors) : errors,
  isLoading,
  setIsLoading,
};
```

**Implementation approach:** Rather than partial snippets, read the full `EditPanelWrapper.tsx` file, apply changes section by section, and typecheck after each major change:

1. Add imports and `schema` prop to interface
2. Replace internal state with dual-hook pattern
3. Update `handleSave` to delegate to `form.handleSubmit` when schema is present
4. Remove the error banner `<div>` block from the panel body
5. Update Save button disabled condition (remove `!isValid`)
6. Update footer error count to read from `form.errors`
7. Update context value to include `form`

- [ ] **Step 3: Write integration tests for EditPanelWrapper**

In `apps/myk9show/src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { EditPanelWrapper } from '../EditPanelWrapper';
import { useEditPanel } from '../useEditPanel';
import { FormField } from '@/components/common/FormField';
import { Input } from '@/components/ui/input';

const testSchema = z.object({
  name: z.string().min(1, 'Please enter a name'),
});

function TestFormFields() {
  const { form } = useEditPanel<{ name: string }>();
  if (!form) return null;
  return (
    <FormField label="Name" required error={form.getError('name')} fieldId="name">
      <Input
        id="name"
        value={form.data.name}
        onChange={e => form.setValue('name', e.target.value)}
        onBlur={() => form.touchField('name')}
        {...form.getFieldProps('name')}
      />
    </FormField>
  );
}

describe('EditPanelWrapper with schema', () => {
  it('exposes form on context when schema is provided', () => {
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={vi.fn()}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  it('Save button is not disabled when form has errors', () => {
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={vi.fn()}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('does not call onSave when form is invalid', async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <EditPanelWrapper
        open={true}
        onClose={vi.fn()}
        title="Test"
        initialData={{ name: '' }}
        schema={testSchema}
        onSave={onSave}
        forceHasChanges
      >
        <TestFormFields />
      </EditPanelWrapper>
    );
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run typecheck and tests**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck && cd apps/myk9show && pnpm vitest run src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/useEditPanel.ts apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx apps/myk9show/src/components/panels/edit/__tests__/EditPanelWrapper.test.tsx
git commit -m "feat(myk9show): integrate useFormValidation into EditPanelWrapper with schema prop"
```

---

### Task 6: Delete FormErrorProvider

**Files:**

- Modify: `apps/myk9show/src/App.tsx`
- Delete: `apps/myk9show/src/providers/FormErrorProvider.tsx`

- [ ] **Step 1: Remove FormErrorProvider from App.tsx**

In `apps/myk9show/src/App.tsx`:

- Remove the `import { FormErrorProvider } from '@/providers/FormErrorProvider'` line
- Remove the `<FormErrorProvider>` and `</FormErrorProvider>` wrapper tags from the JSX tree

- [ ] **Step 2: Delete the file**

```bash
rm apps/myk9show/src/providers/FormErrorProvider.tsx
```

- [ ] **Step 3: Search for any remaining references**

Search for `FormErrorProvider` and `useFormError` across `apps/myk9show/src/` in `.ts` and `.tsx` files.
Expected: No results (file was unused). If any references remain, remove them.

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/App.tsx && git rm apps/myk9show/src/providers/FormErrorProvider.tsx
git commit -m "refactor(myk9show): remove unused FormErrorProvider"
```

---

### Task 7: Update Zod Error Messages to Plain Language

**Files:**

- Modify: `apps/myk9show/src/lib/validation.ts`

- [ ] **Step 1: Update error messages in validation.ts**

Update `commonValidations` and all schema error messages to follow the pattern: "Please [action] [what]" for missing fields, "[What] must [constraint]" for invalid values.

Current → new messages for `commonValidations`:

- `name`: "Name is required" → "Please enter a name" (already correct in current code)
- `required`: "This field is required" → "Please fill in this field"
- `positiveNumber`: "Must be a positive number" → "Please enter a positive number"
- `date`: keep "Please enter a valid date (YYYY-MM-DD)" — already good

Current → new for `dogSchemas.basic`:

- `gender` message: keep "Please select a gender" — already good
- Review all field messages, update any that say "required" or "is required"

Current → new for `showSchemas.basic`:

- `type` message: keep "Please select a show type" — already good
- `endDate` refine: keep "End date must be after start date" — matches "[What] must [constraint]" pattern
- `preEntryFee`: "Please enter a valid fee amount" — already good

Current → new for `clubSchemas.basic`:

- `phone`: "Phone number is required" → "Please enter a phone number"
- `street`: "Street address is required" → "Please enter a street address"
- `city`: "City is required" → "Please enter a city"
- `state`: "State/Province is required" → "Please select a state/province"
- `zipCode`: "ZIP/Postal code is required" → "Please enter a ZIP/postal code"
- `country`: "Please select a country" — already good

For each schema, open `validation.ts`, find the current message string, and replace with the plain-language version above.

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Run existing tests and fix any message assertion failures**

Run: `cd apps/myk9show && pnpm vitest run`

**Note:** The `useFormValidation` tests (Tasks 1-3) use a local `testSchema` with inline messages, so they won't break. However, any existing tests that import schemas from `validation.ts` and assert specific message strings will need their assertions updated to match the new messages. Fix any such failures before committing.

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/lib/validation.ts
git commit -m "refactor(myk9show): update Zod error messages to plain language"
```

---

## Chunk 2: Form Migrations

> Migration note: Steps 2-4 of the migration order cover ~20 high-priority forms. Remaining ~90 forms are migrated opportunistically as they are touched in future work.

### Task 8: Migrate AddDogPanel (Panel — Highest Priority)

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/index.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/BasicInfoTab.tsx` (contains form fields)
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/RegistrationTab.tsx` (contains form fields)
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/AdditionalInfoTab.tsx` (contains form fields)
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/useAddDogForm.ts` (replace with useFormValidation)
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/types.ts` (may need type updates)
- Modify: `apps/myk9show/src/components/panels/edit/AddDogPanel/validation.ts` (may need schema updates)

> **Note:** This is a multi-file, tabbed panel. Each tab component contains form fields that need `<FormField>` wrapping. The custom `useAddDogForm.ts` hook manages form state and will likely be replaced by or integrated with `useFormValidation`. Read all 7 files before making changes.

- [ ] **Step 1: Read the current AddDogPanel to understand its structure**

Read all files in `apps/myk9show/src/components/panels/edit/AddDogPanel/`:

- `index.tsx` — panel shell, tab navigation
- `BasicInfoTab.tsx` — name, breed, gender, DOB fields
- `RegistrationTab.tsx` — registration number, organization fields
- `AdditionalInfoTab.tsx` — optional fields
- `useAddDogForm.ts` — current form state management hook
- `types.ts` — form data types
- `validation.ts` — current validation logic

Understand: What fields exist in each tab, how `useAddDogForm` manages state, what Zod schemas are needed.

- [ ] **Step 2: Ensure Zod schema covers all fields**

Check that `dogSchemas.basic` in `src/lib/validation.ts` (or a local schema in `AddDogPanel/validation.ts`) covers every field in the form. Add missing fields if needed.

- [ ] **Step 3: Update AddDogPanel to use schema prop on EditPanelWrapper**

Replace `validateData` callback with `schema` prop. Replace manual error display with `<FormField>` components. Children should use `useEditPanel()` to access `form`.

Pattern for each field:

```tsx
const { form } = useEditPanel<DogBasicInput>();

<FormField label="Dog Name" required error={form?.getError('name')} fieldId="name">
  <Input
    id="name"
    value={form?.data.name ?? ''}
    onChange={e => form?.setValue('name', e.target.value)}
    onBlur={() => form?.touchField('name')}
    {...form?.getFieldProps('name')}
  />
</FormField>;
```

- [ ] **Step 4: Remove old validation state (manual errors, hasSubmitted, etc.)**

Delete any `useState` for validation errors, `hasSubmitted` flags, `validateForm` functions, and manual error display JSX.

- [ ] **Step 5: Run typecheck**

Run: `cd /Users/richardbeezley/AI\ Projects/myk9-platform && pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Run existing tests**

Run: `cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/AddDogPanel/
git commit -m "refactor(myk9show): migrate AddDogPanel to useFormValidation + FormField"
```

---

### Task 9: Migrate DogEditPanel

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/DogEditPanel.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/DogEditPanel.sections.tsx` (contains form fields)
- Modify: `apps/myk9show/src/components/panels/edit/DogEditPanel.helpers.ts` (may contain validation helpers to remove)
- Possibly modify: `apps/myk9show/src/components/panels/edit/DogEditPanel.types.ts`

> **Note:** This panel is split across multiple files. Read all `DogEditPanel.*` files before making changes. The `.sections.tsx` file contains the actual form fields that need `<FormField>` wrapping. The `.helpers.ts` file may contain validation logic to be replaced.

- [ ] **Step 1: Read current DogEditPanel files**

Read all DogEditPanel files (`DogEditPanel.tsx`, `.sections.tsx`, `.helpers.ts`, `.types.ts`) to understand structure, fields, and current validation.

- [ ] **Step 2: Update to use schema prop and FormField components**

Replace `validateData` with `schema` prop on EditPanelWrapper. In `.sections.tsx`, wrap each form field with `<FormField>` and access `form` via `useEditPanel()`. Remove any validation helpers in `.helpers.ts` that are replaced by the Zod schema. Run typecheck between each file change to catch issues early.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/DogEditPanel*
git commit -m "refactor(myk9show): migrate DogEditPanel to useFormValidation + FormField"
```

---

### Task 10: Migrate ClubEditPanel and UserEditPanel

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx`
- Modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.tsx`
- Possibly modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.helpers.ts`
- Possibly modify: `apps/myk9show/src/components/panels/edit/UserEditPanel.types.ts`

- [ ] **Step 1: Read current panels**

Read all files for both panels (including any `.helpers.ts` and `.types.ts` companions) to understand structure and current validation.

- [ ] **Step 2: Ensure Zod schemas exist for both**

Check `clubSchemas.basic` and `personSchemas.basic` in `validation.ts`. Add missing fields if needed.

- [ ] **Step 3: Migrate ClubEditPanel**

Replace `validateData` with `schema`, replace manual error display with `<FormField>`.

- [ ] **Step 4: Migrate UserEditPanel**

Same pattern.

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/ClubEditPanel.tsx apps/myk9show/src/components/panels/edit/UserEditPanel.tsx
git commit -m "refactor(myk9show): migrate ClubEditPanel and UserEditPanel to FormField"
```

---

### Task 11: Migrate Simple Dialogs (Batch 1)

**Files:**

- Modify: `apps/myk9show/src/components/dogs/DogDetails/HealthRecords/Medications/AddMedicationDialog.tsx`
- Modify: `apps/myk9show/src/components/dogs/DogDetails/Competitions/Achievements/AddAchievementDialog.tsx`
- Modify: `apps/myk9show/src/components/dogs/DogDetails/Competitions/UpcomingShows/AddExternalShowDialog.tsx`

These dialogs use `useFormValidation` directly (not EditPanelWrapper).

- [ ] **Step 1: Read current dialog files**

Read all three dialogs to understand fields and current validation.

- [ ] **Step 2: Create Zod schemas for any dialogs missing them**

Add schemas to `validation.ts` (e.g., `medicationSchema`, `achievementSchema`, `externalShowSchema`) if they don't exist yet.

- [ ] **Step 3: Migrate AddMedicationDialog**

Replace manual useState + validation with `useFormValidation(medicationSchema, INITIAL_DATA)`. Replace manual error display with `<FormField>`. Wire `handleSubmit` to the Save button. Remove `disabled` prop from Save button.

- [ ] **Step 4: Migrate AddAchievementDialog**

Same pattern.

- [ ] **Step 5: Migrate AddExternalShowDialog**

Same pattern. Remove `touched` state tracking — `useFormValidation` handles this internally.

- [ ] **Step 6: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/myk9show/src/components/dogs/ apps/myk9show/src/lib/validation.ts
git commit -m "refactor(myk9show): migrate medication, achievement, and external show dialogs to FormField"
```

---

### Task 12: Migrate Simple Dialogs (Batch 2)

**Files:**

- Modify: `apps/myk9show/src/components/dogs/DogDetails/TrainingJournal/AddTrainingEntryDialog.tsx`
- Modify: `apps/myk9show/src/components/dogs/AddEditRegistrationDialog.tsx`
- Modify: `apps/myk9show/src/components/trials/AddTrialDialog.tsx`

- [ ] **Step 1: Read current dialog files**

Read all three dialogs.

- [ ] **Step 2: Create Zod schemas for any dialogs missing them**

Add to `validation.ts` as needed (e.g., `trainingEntrySchema`). `showSchemas.trial` already exists for AddTrialDialog.

- [ ] **Step 3: Migrate each dialog**

Same pattern as Task 11: `useFormValidation` + `<FormField>` + always-enabled Save.

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/myk9show/src/components/dogs/ apps/myk9show/src/components/trials/ apps/myk9show/src/lib/validation.ts
git commit -m "refactor(myk9show): migrate training, registration, and trial dialogs to FormField"
```

---

### Task 13: Final Cleanup

**Files:**

- Modify: `apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx` (remove legacy `validateData` if all panels migrated)

- [ ] **Step 1: Search for remaining `validateData` usage**

Run: `grep -r "validateData" apps/myk9show/src/ --include="*.tsx" --include="*.ts" -l`

If any files still use `validateData`, do NOT remove the legacy prop. Note them for future migration.

- [ ] **Step 2: If no remaining usage, remove validateData prop (unlikely in this phase)**

Since only ~20 high-priority forms are migrated in this plan and ~90 remain, it is very likely some unmigrated panels still use `validateData`. If so, leave the legacy prop in place — it will be removed in a future cleanup when all forms are migrated. Only remove it if the grep in Step 1 returns zero results.

- [ ] **Step 3: Run full test suite**

Run: `pnpm typecheck && cd apps/myk9show && pnpm vitest run`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/myk9show/src/components/panels/edit/EditPanelWrapper.tsx
git commit -m "refactor(myk9show): remove deprecated validateData prop from EditPanelWrapper"
```

- [ ] **Step 5: Final verification**

Run: `pnpm typecheck && pnpm lint && cd apps/myk9show && pnpm vitest run`
Expected: All PASS

---

### Deferred to Future Work

The following forms from the spec's migration order are intentionally deferred:

- **DogStatusDialog** — radio-button-only form, minimal validation needed. Migrate opportunistically.
- **ShowCreationWizardPage** — complex multi-step wizard. Migrate as a separate task after the primitives are battle-tested on simpler forms.
- **~90 remaining form components** — migrated opportunistically as they are touched in future work.

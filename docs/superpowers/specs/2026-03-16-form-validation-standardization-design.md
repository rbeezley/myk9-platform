# Form Validation Standardization

Standardize form validation across all myK9Show forms (dialogs, panels, wizards) with a consistent, accessible, elderly-friendly experience.

## Problem

The app has ~111 form components using 5 different validation patterns: manual useState, Zod schemas, touched/blur tracking, EditPanelWrapper callbacks, and no validation at all. This creates inconsistent error timing, inconsistent error messages, disabled Save buttons (confusing for elderly users), and zero accessibility attributes.

## Design Decisions

| Decision           | Choice                                                          | Rationale                                                                  |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Architecture       | Hook + Component (two primitives)                               | Consistency via `<FormField>`, flexibility via hook, fits all form types   |
| Validation library | Zod schemas required for all forms                              | Already installed, type-safe, schemas already exist for major domains      |
| EditPanelWrapper   | Layer validation on top (keep change tracking/unsaved warnings) | Separated concerns, least disruption                                       |
| Save button        | Always enabled                                                  | Disabled buttons are invisible to elderly users; validate on click instead |
| Error timing       | Show on blur, clear when valid                                  | Errors appear after leaving a field; persist as a guide until fixed        |
| Error display      | Inline below field, red border, red text                        | Industry standard, no hunting for errors                                   |
| Error clearing     | Clear when field passes validation (not on change)              | Acts as real-time guide; disappears as positive reinforcement              |
| Submit with errors | Scroll to first error + focus + pulse                           | Simple, clear, no extra noise (no toast summary)                           |
| Accessibility      | `aria-invalid` + `aria-describedby` on all fields               | Screen reader support, WCAG compliance                                     |
| FormErrorProvider  | Delete                                                          | 600+ lines, unused, duplicates Zod                                         |

## Primitive 1: `useFormValidation` Hook

**Location:** `src/hooks/useFormValidation.ts`

**Signature:**

```typescript
function useFormValidation<T>(schema: z.ZodSchema<T>, initialData: T): FormValidation<T>;
```

**Returned API:**

| Property/Method          | Type                                             | Purpose                                                                                                                      |
| ------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `data`                   | `T`                                              | Current form data (reactive)                                                                                                 |
| `errors`                 | `Record<string, string>`                         | Field name to error message (respects touched/submitted state)                                                               |
| `setValue(field, value)` | `(keyof T, unknown) => void`                     | Update a single field                                                                                                        |
| `setValues(partial)`     | `(Partial<T>) => void`                           | Update multiple fields                                                                                                       |
| `getError(field)`        | `(keyof T) => string \| undefined`               | Get visible error for a field                                                                                                |
| `getFieldProps(field)`   | `(keyof T) => FormFieldInputProps`               | Returns `{ 'aria-invalid': boolean, 'aria-describedby': string, ref: React.RefCallback<HTMLElement> }` to spread onto inputs |
| `touchField(field)`      | `(keyof T) => void`                              | Mark field as touched (call on blur)                                                                                         |
| `handleSubmit(onSave)`   | `(fn: (data: T) => Promise<void>) => () => void` | Returns click handler: validates all, scrolls to first error if invalid, calls onSave if valid                               |
| `isSubmitting`           | `boolean`                                        | True while onSave is running                                                                                                 |
| `isValid`                | `boolean`                                        | True if no validation errors exist (even untouched fields)                                                                   |
| `reset(data?)`           | `(T?) => void`                                   | Reset to initial data or new data                                                                                            |
| `hasChanges`             | `boolean`                                        | True if data differs from initialData (deep comparison via `JSON.stringify`, matching existing EditPanelWrapper behavior)    |

**Validation timing:**

- **On blur:** Validate the blurred field. If invalid and field is touched, show error.
- **On change (after field is touched):** Re-validate the changed field. Error clears only when the field passes validation. Error persists while the user is fixing it.
- **On submit (handleSubmit):** Validate all fields. Mark all as touched. Show all errors. Scroll to and focus the first errored field with a brief pulse animation.

**Scroll-to-error behavior:**

`handleSubmit` collects refs via `getFieldProps`. On validation failure, it finds the first field with an error, scrolls it into view (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), focuses the input, and triggers a CSS pulse animation on the error message.

## Primitive 2: `<FormField>` Component

**Location:** `src/components/common/FormField.tsx`

**Props:**

| Prop       | Type                  | Default  | Purpose                                                 |
| ---------- | --------------------- | -------- | ------------------------------------------------------- |
| `label`    | `string`              | required | Label text, displayed above the field                   |
| `required` | `boolean`             | `false`  | Shows red asterisk + sr-only "(required)"               |
| `error`    | `string \| undefined` | —        | Error message to display below the field                |
| `fieldId`  | `string`              | required | Used to generate `id` and `aria-describedby` attributes |
| `hint`     | `string`              | —        | Optional helper text below the label                    |
| `children` | `ReactNode`           | required | The input element                                       |

**Renders (top to bottom):**

1. **Label** — `<Label htmlFor={fieldId}>` with red asterisk if required, always above the field (never as placeholder)
2. **Hint** — optional muted text below the label (e.g., "Format: YYYY-MM-DD")
3. **Children** — the input element
4. **Error message** — `<p>` with red text, linked via `id={fieldId}-error}` for `aria-describedby`. Brief pulse animation on first appearance. Only rendered when `error` is truthy.

**Automatic behavior:**

- Adds red border via CSS parent selector: `FormField` applies a `data-error` attribute on its wrapper div when `error` is truthy, and a CSS rule `.form-field[data-error] input, .form-field[data-error] select, .form-field[data-error] textarea { @apply border-destructive; }` targets standard HTML elements. This avoids cloning children and works with any input type.
- Generates `aria-describedby={fieldId}-error` linking input to error text
- Red asterisk on required fields with `<span className="sr-only">(required)</span>` for screen readers

## EditPanelWrapper Integration

**Changes to EditPanelWrapper:**

1. **New prop:** `schema?: z.ZodSchema` — when provided, creates a `useFormValidation` instance internally.
2. **Legacy prop:** `validateData` still accepted during migration, with console warning.
3. **Remove error banner** at top of panel — errors are now inline via `<FormField>` in children.
4. **Save button always enabled** when there are changes. Remove `!isValid` from disabled condition. Clicking Save when invalid triggers `handleSubmit` which scrolls to first error.
5. **Footer error count** stays — shows "2 errors" badge as a quick indicator.
6. **Expose form via context** — `useEditPanel()` returns the updated context value (see type below).

**Single source of truth:** When `schema` is provided, `useFormValidation` owns all form data state. EditPanelWrapper's internal `useState<T>` is removed in favor of the hook's `data`/`setValue`/`setValues`. The existing `updateData(partial)` method on the context delegates to `form.setValues(partial)` for backward compatibility. When using the legacy `validateData` prop (no schema), EditPanelWrapper keeps its current `useState` behavior.

**Updated context type:**

```typescript
interface EditPanelContextValue<T> {
  // Form validation (new — only present when schema is provided)
  form: FormValidation<T>;

  // Legacy accessors (delegate to form internally, kept for backward compat during migration)
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
```

**What stays the same:** `hasChanges` tracking (now delegated to `form.hasChanges`), unsaved warning on close, auto-save, `forceHasChanges`, loading state, `onDataChange` callback.

**Before:**

```tsx
<EditPanelWrapper
  validateData={data => {
    const errors = [];
    if (!data.name) errors.push('Name is required');
    return errors.length > 0 ? errors : null;
  }}
  onSave={handleSave}
>
  <Input value={data.name} />
</EditPanelWrapper>
```

**After:**

```tsx
<EditPanelWrapper schema={dogSchemas.basic} onSave={handleSave}>
  <DogFormFields />
</EditPanelWrapper>;

function DogFormFields() {
  const { form } = useEditPanel();
  return (
    <FormField label="Dog Name" required error={form.getError('name')} fieldId="name">
      <Input
        value={form.data.name}
        onChange={e => form.setValue('name', e.target.value)}
        onBlur={() => form.touchField('name')}
        {...form.getFieldProps('name')}
      />
    </FormField>
  );
}
```

## Simple Dialogs

Use the hook + component directly, no wrapper:

```tsx
function AddMedicationDialog({ open, onClose }) {
  const form = useFormValidation(medicationSchema, INITIAL_DATA);

  return (
    <StandardDialog open={open} onClose={onClose} title="Add Medication">
      <FormField label="Medication Name" required error={form.getError('name')} fieldId="name">
        <Input
          value={form.data.name}
          onChange={e => form.setValue('name', e.target.value)}
          onBlur={() => form.touchField('name')}
          {...form.getFieldProps('name')}
        />
      </FormField>

      <DialogFooterButtons
        onCancel={onClose}
        onSave={form.handleSubmit(saveMedication)}
        isLoading={form.isSubmitting}
      />
    </StandardDialog>
  );
}
```

`DialogFooterButtons` Save button is always enabled. `handleSubmit` handles validation and scroll-to-error.

## Wizards

One `useFormValidation` per step with per-step schemas:

```tsx
const wizardSchemas = {
  step1: showSchemas.basic,
  step2: trialSchema,
  step3: classesSchema,
};

const stepForm = useFormValidation(wizardSchemas[currentStep], stepData);

// "Next" button validates current step before advancing:
<Button onClick={stepForm.handleSubmit(goToNextStep)}>Next</Button>;
```

Each step validates independently. The user cannot advance past a step with errors. Step data is preserved in the wizard's parent state — navigating back restores the previously entered data for that step. Each step's `useFormValidation` receives the preserved data as `initialData`.

## Migration Strategy

### What gets deleted

- `src/providers/FormErrorProvider.tsx` — unused, duplicates Zod

### What gets created

- `src/hooks/useFormValidation.ts`
- `src/components/common/FormField.tsx`

### What gets modified

- `EditPanelWrapper.tsx` — add `schema` prop, remove error banner, always-enabled Save
- `validation.ts` — add missing schemas as forms are migrated (existing schemas kept as-is)

### Migration order

1. **Build primitives** — `useFormValidation` hook, `<FormField>` component, update EditPanelWrapper
2. **Panels** (highest usage) — AddDogPanel, DogEditPanel, ClubEditPanel, UserEditPanel, AddRegistrationPanel
3. **Simple dialogs** — AddMedicationDialog, AddAchievementDialog, AddEditRegistrationDialog, AddExternalShowDialog, AddTrainingEntryDialog, AddTrialDialog, DogStatusDialog
4. **Wizards** — ShowCreationWizardPage
5. **Cleanup** — remove `validateData` prop from EditPanelWrapper, delete FormErrorProvider

Steps 2-4 cover the high-priority forms (~20 components). The remaining ~90 form components are migrated opportunistically as they are touched in future work.

### Backward compatibility

During migration, EditPanelWrapper accepts both `schema` (new) and `validateData` (legacy). A console warning fires if `validateData` is used. Once all panels are migrated, `validateData` is removed.

Forms not yet migrated continue working as-is. No big-bang rewrite.

## Error Message Standards

All error messages are defined **inline in the Zod schema definitions** in `src/lib/validation.ts` (and any domain-specific schema files like `AddDogPanel/validation.ts`). This is where they already live — no separate message map. When migrating a form that has hardcoded error strings, move them into the Zod schema.

Messages use plain language, addressed to the user:

- "Please enter your dog's name" (not "Required" or "Name is required")
- "Please select a gender"
- "Please enter a valid email address"
- "End date must be after start date"

Pattern: "Please [action] [what]" for missing fields, "[What] must [constraint]" for invalid values.

## Testing

- Unit tests for `useFormValidation` hook — validation timing, error state management, scroll-to-error, reset, hasChanges
- Unit tests for `<FormField>` component — renders label/error/hint, accessibility attributes, required indicator
- Integration test for EditPanelWrapper — schema-based validation, always-enabled Save, scroll-to-error on submit
- Each migrated form gets a test verifying validation behavior (error on blur, clear on valid, submit blocked with errors)

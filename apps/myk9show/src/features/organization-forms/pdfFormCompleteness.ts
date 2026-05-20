import type { PdfFormFillValues } from './pdfForm';

export interface PdfFormMissingField {
  fieldName: string;
  label: string;
}

export function findMissingPdfRequiredFields(
  requiredFields: readonly string[],
  values: PdfFormFillValues
): PdfFormMissingField[] {
  return requiredFields
    .filter(fieldName => !hasFilledField(fieldName, values))
    .map(fieldName => ({
      fieldName,
      label: formatPdfFieldLabel(fieldName),
    }));
}

export function findMissingPdfRequiredFieldLabels(
  requiredFields: readonly string[],
  values: PdfFormFillValues
): string[] {
  return findMissingPdfRequiredFields(requiredFields, values).map(field => field.label);
}

export function formatPdfFieldLabel(fieldName: string): string {
  return fieldName
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasFilledField(fieldName: string, values: PdfFormFillValues): boolean {
  const textValue = values.text?.[fieldName];
  if (typeof textValue === 'number') return Number.isFinite(textValue);
  if (typeof textValue === 'string') return textValue.trim().length > 0;

  const radioValue = values.radioGroups?.[fieldName];
  if (typeof radioValue === 'string') return radioValue.trim().length > 0;

  if (values.checkboxes && Object.prototype.hasOwnProperty.call(values.checkboxes, fieldName)) {
    return typeof values.checkboxes[fieldName] === 'boolean';
  }

  return false;
}

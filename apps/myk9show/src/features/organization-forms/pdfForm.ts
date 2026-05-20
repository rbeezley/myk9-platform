import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';

export type PdfFormFieldType =
  | 'checkbox'
  | 'dropdown'
  | 'option-list'
  | 'radio-group'
  | 'text'
  | 'unknown';

export interface PdfFormFieldSummary {
  name: string;
  type: PdfFormFieldType;
}

export interface PdfFormFillValues {
  checkboxes?: Record<string, boolean>;
  radioGroups?: Record<string, string>;
  text?: Record<string, string | number | null | undefined>;
}

function fieldType(field: unknown): PdfFormFieldType {
  if (field instanceof PDFCheckBox) return 'checkbox';
  if (field instanceof PDFDropdown) return 'dropdown';
  if (field instanceof PDFOptionList) return 'option-list';
  if (field instanceof PDFRadioGroup) return 'radio-group';
  if (field instanceof PDFTextField) return 'text';
  return 'unknown';
}

export async function listPdfFormFields(pdfBytes: Uint8Array): Promise<PdfFormFieldSummary[]> {
  const pdf = await PDFDocument.load(pdfBytes);
  return pdf
    .getForm()
    .getFields()
    .map(field => ({
      name: field.getName(),
      type: fieldType(field),
    }));
}

export async function fillPdfForm(
  pdfBytes: Uint8Array,
  values: PdfFormFillValues,
  options: { flatten?: boolean } = {}
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const form = pdf.getForm();

  for (const [name, value] of Object.entries(values.text ?? {})) {
    if (value == null || value === '') continue;
    form.getTextField(name).setText(String(value));
  }

  for (const [name, checked] of Object.entries(values.checkboxes ?? {})) {
    const field = form.getCheckBox(name);
    if (checked) field.check();
    else field.uncheck();
  }

  for (const [name, option] of Object.entries(values.radioGroups ?? {})) {
    form.getRadioGroup(name).select(option);
  }

  if (options.flatten) form.flatten();

  return pdf.save();
}

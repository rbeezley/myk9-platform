import type { HealthItemType } from './AddHealthItemDialog';

export type ImportableHealthItemType = Extract<
  HealthItemType,
  'vaccination' | 'medication' | 'allergy' | 'vet_visit'
>;

export interface ParsedHealthImportRow {
  type: ImportableHealthItemType;
  data: Record<string, unknown>;
}

export interface HealthImportResult {
  records: ParsedHealthImportRow[];
  errors: string[];
}

export interface HealthImportOutcome {
  succeeded: number;
  failed: number;
  errors: string[];
}

const typeAliases: Record<string, ImportableHealthItemType> = {
  vaccination: 'vaccination',
  vaccine: 'vaccination',
  'vet visit': 'vet_visit',
  vet_visit: 'vet_visit',
  checkup: 'vet_visit',
  medication: 'medication',
  medicine: 'medication',
  allergy: 'allergy',
};

const normalizeKey = (key: string) => key.trim().toLowerCase().replace(/\s+/g, '_');

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const toIsoDate = (value: string | undefined): string | null => {
  if (!value) return null;
  if (!isoDatePattern.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const isExactDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day;

  return isExactDate ? value : null;
};

const getValue = (row: Record<string, string>, keys: string[]) =>
  keys.map(key => row[normalizeKey(key)]).find(Boolean);

const getOptionalDate = (
  row: Record<string, string>,
  keys: string[],
  label: string
): string | null | string => {
  const rawValue = getValue(row, keys);
  if (!rawValue) return null;

  const parsed = toIsoDate(rawValue);
  return parsed || `${label} must use YYYY-MM-DD`;
};

const toHealthData = (
  type: ImportableHealthItemType,
  row: Record<string, string>,
  dogId: string
): Record<string, unknown> | string => {
  const title = getValue(row, ['title', 'name']);
  const rawDate = getValue(row, ['date', 'date given', 'visit date', 'start date']);
  const date = toIsoDate(rawDate);
  const notes = getValue(row, ['notes', 'description']);
  const vetName = getValue(row, ['veterinarian', 'vet name', 'vet']);
  const clinic = getValue(row, ['clinic', 'clinic name']);

  if (!title) return 'missing title';

  if (type === 'vaccination') {
    if (!date) return 'date must use YYYY-MM-DD';
    const expirationDate = getOptionalDate(
      row,
      ['expiration date', 'expiration'],
      'expiration date'
    );
    if (expirationDate && !isoDatePattern.test(expirationDate)) return expirationDate;

    return {
      dog_id: dogId,
      vaccine_name: title,
      date_given: date,
      expiration_date: expirationDate,
      vet_name: vetName,
      clinic_name: clinic,
      lot_number: getValue(row, ['lot number', 'lot']),
      notes,
    };
  }

  if (type === 'vet_visit') {
    if (!date) return 'date must use YYYY-MM-DD';
    return {
      dog_id: dogId,
      visit_date: date,
      reason: title,
      diagnosis: getValue(row, ['diagnosis']),
      treatment: getValue(row, ['treatment']),
      vet_name: vetName,
      clinic_name: clinic,
      cost: Number(getValue(row, ['cost'])) || undefined,
      notes,
    };
  }

  if (type === 'medication') {
    if (rawDate && !date) return 'date must use YYYY-MM-DD';
    const endDate = getOptionalDate(row, ['end date'], 'end date');
    if (endDate && !isoDatePattern.test(endDate)) return endDate;

    return {
      dog_id: dogId,
      medication_name: title,
      start_date: date || undefined,
      end_date: endDate || undefined,
      dosage: getValue(row, ['dosage']),
      frequency: getValue(row, ['frequency']),
      notes,
    };
  }

  if (rawDate && !date) return 'date must use YYYY-MM-DD';

  return {
    dog_id: dogId,
    allergen: title,
    reaction: getValue(row, ['reaction', 'description']),
    severity: getValue(row, ['severity']) || undefined,
    discovered_date: date || undefined,
    notes,
  };
};

export const parseHealthRecordsCsv = (csv: string, dogId: string): HealthImportResult => {
  const lines = csv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { records: [], errors: ['CSV needs a header row and at least one record.'] };
  }

  const headers = parseCsvLine(lines[0]).map(normalizeKey);
  const errors: string[] = [];
  const records: ParsedHealthImportRow[] = [];

  lines.slice(1).forEach((line, index) => {
    const values = parseCsvLine(line);
    const row = headers.reduce<Record<string, string>>((next, header, valueIndex) => {
      next[header] = values[valueIndex] || '';
      return next;
    }, {});

    const typeValue = getValue(row, ['type']);
    const type = typeValue ? typeAliases[typeValue.toLowerCase()] : undefined;
    const rowNumber = index + 2;

    if (!type) {
      errors.push(`Row ${rowNumber}: type must be vaccination, vet visit, medication, or allergy.`);
      return;
    }

    const data = toHealthData(type, row, dogId);
    if (typeof data === 'string') {
      errors.push(`Row ${rowNumber}: ${data}.`);
      return;
    }

    records.push({ type, data });
  });

  return { records, errors };
};

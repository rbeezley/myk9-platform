import type { ExportDataSet, ExportableRecord } from './data-export-import-types';

/**
 * Parse a single CSV line, handling quoted values and escaped quotes
 */
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

/**
 * Export data to CSV format with section headers
 */
export function exportToCSV(data: ExportDataSet): string {
  const csvLines: string[] = [];

  // Export each data type as a separate section
  for (const [dataType, records] of Object.entries(data)) {
    if (records.length === 0) continue;

    // Section header
    csvLines.push(`# ${dataType.toUpperCase()}`);

    // Get all unique keys from records
    const keys = new Set<string>();
    records.forEach(record => {
      if (typeof record === 'object' && record !== null) {
        Object.keys(record).forEach(key => keys.add(key));
      }
    });

    // Header row
    const headers = Array.from(keys);
    csvLines.push(headers.map(h => `"${h}"`).join(','));

    // Data rows
    records.forEach(record => {
      const recordObj = record as Record<string, unknown>;
      const values = headers.map(header => {
        const value = recordObj[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvLines.push(values.join(','));
    });

    csvLines.push(''); // Empty line between sections
  }

  return csvLines.join('\n');
}

/**
 * Parse CSV content with section headers back into a dataset
 */
export function parseCSV(content: string): ExportDataSet {
  const data: ExportDataSet = {};
  const lines = content.split('\n').filter(line => line.trim());

  let currentType = '';
  let headers: string[] = [];
  let records: ExportableRecord[] = [];

  for (const line of lines) {
    // Section header
    if (line.startsWith('#')) {
      if (currentType && records.length > 0) {
        data[currentType] = records;
      }
      currentType = line.substring(1).trim().toLowerCase();
      records = [];
      headers = [];
      continue;
    }

    // Header row
    if (headers.length === 0) {
      headers = parseCSVLine(line);
      continue;
    }

    // Data row
    const values = parseCSVLine(line);
    const record: ExportableRecord = {};

    headers.forEach((header, index) => {
      let value: unknown = values[index];

      // Try to parse JSON values
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          value = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      record[header] = value;
    });

    records.push(record);
  }

  // Add last section
  if (currentType && records.length > 0) {
    data[currentType] = records;
  }

  return data;
}

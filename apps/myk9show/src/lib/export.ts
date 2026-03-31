// Export utilities for various formats

export interface ExportOptions {
  filename?: string;
  includeHeaders?: boolean;
  dateFormat?: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY';
}

// Convert data to CSV format
export function convertToCSV<T extends Record<string, unknown>>(
  data: T[],
  options: ExportOptions = {}
): string {
  if (data.length === 0) return '';

  const { includeHeaders = true } = options;

  // Get headers from first object
  const headers = Object.keys(data[0]);

  // Convert objects to CSV rows
  const csvRows: string[] = [];

  if (includeHeaders) {
    csvRows.push(headers.map(header => `"${header}"`).join(','));
  }

  data.forEach(row => {
    const values = headers.map(header => {
      const value = row[header];
      // Handle different data types
      if (value === null || value === undefined) return '""';
      if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
      if (value instanceof Date) return `"${formatDate(value, options.dateFormat)}"`;
      return `"${String(value)}"`;
    });
    csvRows.push(values.join(','));
  });

  return csvRows.join('\n');
}

// Convert data to JSON format
export function convertToJSON<T>(data: T[], formatted = true): string {
  return JSON.stringify(data, null, formatted ? 2 : 0);
}

// Format date based on options
function formatDate(date: Date, format: ExportOptions['dateFormat'] = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  switch (format) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

// Download file utility
export function downloadFile(content: string, filename: string, contentType = 'text/plain'): void {
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Export to CSV and download
export function exportToCSV<T extends Record<string, unknown>>(
  data: T[],
  filename: string,
  options: ExportOptions = {}
): void {
  const csv = convertToCSV(data, options);
  const fullFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  downloadFile(csv, fullFilename, 'text/csv');
}

// Export to JSON and download
export function exportToJSON<T>(data: T[], filename: string, formatted = true): void {
  const json = convertToJSON(data, formatted);
  const fullFilename = filename.endsWith('.json') ? filename : `${filename}.json`;
  downloadFile(json, fullFilename, 'application/json');
}

// Entity-specific export functions
export const entityExports = {
  dogs: (dogs: Array<Record<string, unknown>>, options?: ExportOptions) => {
    const exportData = dogs.map(dog => ({
      Name: dog.name,
      'Call Name': dog.callName || '',
      Breed: dog.breed,
      Gender: dog.gender || '',
      'Date of Birth': dog.dateOfBirth || '',
      Color: dog.color || '',
      Weight: dog.weight || '',
      Height: dog.height || '',
      Microchip: dog.microchip || '',
      Description: dog.description || '',
      'Owner Name': dog.owner
        ? `${(dog.owner as Record<string, unknown>).firstName || ''} ${(dog.owner as Record<string, unknown>).lastName || ''}`
        : '',
      'Owner Email': (dog.owner as Record<string, unknown>)?.email || '',
    }));

    exportToCSV(
      exportData,
      options?.filename || `dogs-export-${new Date().toISOString().split('T')[0]}`,
      options
    );
  },

  people: (people: Array<Record<string, unknown>>, options?: ExportOptions) => {
    const exportData = people.map(person => ({
      'First Name': person.firstName,
      'Last Name': person.lastName,
      Email: person.email || '',
      Phone: person.phone || '',
      'Street Address': person.streetAddress || '',
      City: person.city || '',
      State: person.state || '',
      'ZIP Code': person.zipCode || '',
    }));

    exportToCSV(
      exportData,
      options?.filename || `people-export-${new Date().toISOString().split('T')[0]}`,
      options
    );
  },

  shows: async (shows: Array<Record<string, unknown>>, options?: ExportOptions) => {
    const { getShowOfficials } = await import('@/hooks/queries/useShowOfficials');
    const formatName = (o: { firstName: string; lastName: string }) =>
      `${o.firstName} ${o.lastName}`.trim();

    const exportData = await Promise.all(
      shows.map(async show => {
        const officials = show.id
          ? await getShowOfficials(show.id as string).catch(() => null)
          : null;
        return {
          Name: show.name,
          Organization: show.organization,
          'Start Date': show.startDate,
          'End Date': show.endDate,
          Location: show.location,
          Status: show.status || '',
          'Entry Open': show.entryOpenDate || '',
          'Entry Close': show.entryCloseDate || '',
          'Pre-Entry Fee': show.preEntryFee || '',
          Chairman: officials?.chairmen.map(formatName).join(', ') || '',
          Secretary: officials?.secretaries.map(formatName).join(', ') || '',
          'Chief Steward': officials?.stewards.map(formatName).join(', ') || '',
        };
      })
    );

    exportToCSV(
      exportData,
      options?.filename || `shows-export-${new Date().toISOString().split('T')[0]}`,
      options
    );
  },

  registrations: (registrations: Array<Record<string, unknown>>, options?: ExportOptions) => {
    const exportData = registrations.map(reg => ({
      Organization: reg.organization,
      'Registered Name': reg.registeredName,
      Breed: reg.breed,
      Variety: reg.variety || '',
      'Registration Number': reg.registrationNumber || '',
      Status: reg.status || '',
      'Application Number': reg.applicationNumber || '',
      'Submission Date': reg.submissionDate || '',
      'Registration Date': reg.registrationDate || '',
    }));

    exportToCSV(
      exportData,
      options?.filename || `registrations-export-${new Date().toISOString().split('T')[0]}`,
      options
    );
  },

  healthRecords: (records: Array<Record<string, unknown>>, options?: ExportOptions) => {
    const exportData = records.map(record => ({
      Type: record.type,
      Name: record.name,
      Date: record.date,
      Veterinarian: record.vetName || '',
      Notes: record.notes || '',
      'Next Due': record.expiration || '',
      'Dog Name': record.dogName || '',
    }));

    exportToCSV(
      exportData,
      options?.filename || `health-records-export-${new Date().toISOString().split('T')[0]}`,
      options
    );
  },
};

import { vi } from 'vitest';

export interface CsvCapture {
  getCsv: () => Promise<string>;
  restore: () => void;
}

export function setupCsvCapture(blobUrl = 'blob:table-export'): CsvCapture {
  let exportedBlob: Blob | undefined;
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
    exportedBlob = blob as Blob;
    return blobUrl;
  });
  const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

  return {
    getCsv: async () => {
      if (!exportedBlob) {
        throw new Error('No CSV Blob was captured');
      }
      return readBlobText(exportedBlob);
    },
    restore: () => {
      clickSpy.mockRestore();
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
    },
  };
}

async function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

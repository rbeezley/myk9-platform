import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { render } from '@/test/utils/testUtils';
import { HealthTimeline, type HealthEvent } from './HealthTimeline';
import { downloadFile, exportToCSV } from '@/lib/export';

vi.mock('@/lib/export', () => ({
  downloadFile: vi.fn(),
  exportToCSV: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const exportToCSVMock = vi.mocked(exportToCSV);
const downloadFileMock = vi.mocked(downloadFile);

describe('HealthTimeline export', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00Z'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('exports health events as a calm CSV timeline', () => {
    const events: HealthEvent[] = [
      {
        id: 'event-1',
        type: 'vaccination',
        title: 'Rabies Vaccination',
        description: 'Three-year rabies vaccine',
        date: new Date('2026-02-14T12:00:00Z'),
        vetName: 'Miller',
        clinic: 'Oak Street Vet',
        cost: 42.5,
        status: 'completed',
        notes: 'Certificate on file',
        expiration: new Date('2029-02-14T12:00:00Z'),
        attachments: [
          {
            id: 'attachment-1',
            name: 'rabies-certificate.pdf',
            type: 'document',
            url: '/rabies-certificate.pdf',
            uploadedAt: new Date('2026-02-14T12:30:00Z'),
          },
        ],
      },
    ];

    render(<HealthTimeline dogId="dog-123" events={events} />);

    fireEvent.click(screen.getByRole('button', { name: /export timeline/i }));

    expect(exportToCSVMock).toHaveBeenCalledWith(
      [
        {
          Date: new Date('2026-02-14T12:00:00Z'),
          Type: 'Vaccination',
          Title: 'Rabies Vaccination',
          Status: 'Completed',
          Description: 'Three-year rabies vaccine',
          Veterinarian: 'Miller',
          Clinic: 'Oak Street Vet',
          Cost: 42.5,
          'Expiration Date': new Date('2029-02-14T12:00:00Z'),
          Notes: 'Certificate on file',
          Attachments: 'rabies-certificate.pdf',
        },
      ],
      'dog-123-health-timeline-2026-05-09',
      { dateFormat: 'YYYY-MM-DD' }
    );
  });

  it('exports an empty timeline with headers', () => {
    render(<HealthTimeline dogId="dog-empty" events={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /export timeline/i }));

    expect(downloadFileMock).toHaveBeenCalledWith(
      '"Date","Type","Title","Status","Description","Veterinarian","Clinic","Cost","Expiration Date","Notes","Attachments"',
      'dog-empty-health-timeline-2026-05-09.csv',
      'text/csv'
    );
    expect(exportToCSVMock).not.toHaveBeenCalled();
  });
});

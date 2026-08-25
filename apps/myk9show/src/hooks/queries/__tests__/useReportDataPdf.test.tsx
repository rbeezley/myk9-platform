import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { fromAny } from '@total-typescript/shoehorn';
import { getReportById } from '@/lib/reports/reportRegistry';
import { toScoresheetModel } from '@/lib/reports/toScoresheetModel';
import type { DbClass, DbEntry, DbTrial } from '@/types/database-mappings';
import type { Show } from '@/types/show-types';
import { useReportData } from '../useReportData';

vi.mock('@/services/database/trials', () => ({ getTrialsByShow: vi.fn() }));
vi.mock('@/services/database/classes', () => ({ getClassesByTrialId: vi.fn() }));
vi.mock('@/services/database/entries', () => ({
  getEntriesByClass: vi.fn(),
  getEntriesByShow: vi.fn(),
}));
vi.mock('@/services/database/dogs/reads', () => ({ loadDogRegistrations: vi.fn() }));

import { getTrialsByShow } from '@/services/database/trials';
import { getClassesByTrialId } from '@/services/database/classes';
import { getEntriesByClass, getEntriesByShow } from '@/services/database/entries';
import { loadDogRegistrations } from '@/services/database/dogs/reads';

const mockGetTrialsByShow = vi.mocked(getTrialsByShow);
const mockGetClassesByTrialId = vi.mocked(getClassesByTrialId);
const mockGetEntriesByClass = vi.mocked(getEntriesByClass);
const mockGetEntriesByShow = vi.mocked(getEntriesByShow);
const mockLoadDogRegistrations = vi.mocked(loadDogRegistrations);

const show = {
  id: 'show-1',
  name: 'Spring Trial 2026',
  organization: 'AKC',
  clubName: 'Calm Canine Club',
  startDate: '2026-04-12',
  endDate: '2026-04-12',
} as Show;

const cachedTrial = fromAny<DbTrial, unknown>({
  id: 'trial-1',
  show_id: 'show-1',
  name: 'Saturday Trial',
  trial_number: 1,
  date: '2026-04-12',
  registry_id: 'AKC',
});

const cachedClass = fromAny<DbClass, unknown>({
  id: 'class-1',
  trial_id: 'trial-1',
  name: 'Container Novice A',
  element: 'Container',
  level: 'Novice',
  section: 'A',
  display_order: 1,
  start_time: '08:00',
  time_limit_seconds: 120,
  time_limit_area2_seconds: null,
  time_limit_area3_seconds: null,
  num_areas: 1,
});

const cachedEntry = fromAny<DbEntry, unknown>({
  id: 'entry-1',
  show_id: 'show-1',
  class_id: 'class-1',
  dog_id: 'dog-1',
  armband: 101,
  run_order: 1,
  check_in_status: 'checked-in',
  is_scored: false,
  result_status: null,
  search_time_seconds: null,
  total_faults: null,
  final_placement: null,
  entry_status: 'accepted',
  entry_fee: 25,
  payment_status: 'paid',
  payment_method: 'online',
  entry_source: 'myk9',
  dog: {
    id: 'dog-1',
    call_name: 'Rocket',
    breed: 'All-American Dog',
  },
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        refetchOnMount: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function decodePdfBytes(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

async function expectRenderedReportPdf(input: {
  trial: DbTrial;
  classData: DbClass;
  entry: DbEntry;
  reportId: 'check-in-sheet' | 'scoresheet';
  expectedPaperText: readonly string[];
}) {
  const dataset = {
    show,
    pages: [{ trial: input.trial, classData: input.classData, entries: [input.entry] }],
  };
  const model = toScoresheetModel(dataset, 'run-order');
  expect(model.pages.some(page => page.entries.some(entry => entry.id === 'entry-1'))).toBe(true);
  expect(model.pages.some(page => page.entries.some(entry => entry.armband === '101'))).toBe(true);

  const bytes = getReportById(input.reportId)?.buildPdf?.(dataset, 'run-order');
  expect(bytes).toBeInstanceOf(Uint8Array);
  const pdf = await PDFDocument.load(bytes as Uint8Array);
  expect(pdf.getPageCount()).toBeGreaterThan(0);
  const paperText = pdf
    .getPages()
    .flatMap(page => {
      const contents = page.node.Contents();
      if (!(contents instanceof PDFRawStream)) return [];
      return [decodePdfBytes(decodePDFRawStream(contents).decode())];
    })
    .join('\n')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')');
  for (const expected of input.expectedPaperText) expect(paperText).toContain(expected);
}

describe('useReportData cached-row PDF integration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders a whole-show check-in PDF when the registration server is offline', async () => {
    mockGetTrialsByShow.mockResolvedValue({ data: [cachedTrial], error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [cachedClass], error: null } as never);
    mockGetEntriesByShow.mockResolvedValue({ data: [cachedEntry], error: null } as never);
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map(),
      serverError: new Error('registration transport offline'),
      registrationsReadComplete: false,
    });

    const { result } = renderHook(() => useReportData({ show, trialId: 'all', classId: 'all' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.dataState).toBe('ready'));
    expect(result.current.registrationsReadComplete).toBe(false);
    expect(result.current.entries?.map(entry => entry.id)).toEqual(['entry-1']);
    await expectRenderedReportPdf({
      trial: result.current.trials?.[0] as DbTrial,
      classData: result.current.classes?.[0] as DbClass,
      entry: result.current.entries?.[0] as DbEntry,
      reportId: 'check-in-sheet',
      expectedPaperText: ['101', 'Rocket'],
    });
  });

  it('renders a class scoresheet with local registrations when the server leg fails', async () => {
    const localRegistration = {
      id: 'registration-local',
      dog_id: 'dog-1',
      organization: 'AKC',
      registration_number: 'LOCAL-101',
    };
    mockGetTrialsByShow.mockResolvedValue({ data: [cachedTrial], error: null } as never);
    mockGetClassesByTrialId.mockResolvedValue({ data: [cachedClass], error: null } as never);
    mockGetEntriesByClass.mockResolvedValue({ data: [cachedEntry], error: null } as never);
    mockLoadDogRegistrations.mockResolvedValue({
      byDog: new Map([['dog-1', [localRegistration]]]),
      serverError: new Error('registration transport offline'),
      registrationsReadComplete: false,
    });

    const { result } = renderHook(
      () => useReportData({ show, trialId: 'trial-1', classId: 'class-1' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.dataState).toBe('ready'));
    expect(result.current.registrationsReadComplete).toBe(false);
    expect(result.current.entries?.[0]?.dog?.registrations).toEqual([localRegistration]);
    await expectRenderedReportPdf({
      trial: result.current.trials?.[0] as DbTrial,
      classData: result.current.classes?.[0] as DbClass,
      entry: result.current.entries?.[0] as DbEntry,
      reportId: 'scoresheet',
      expectedPaperText: ['101', 'Rocket', 'LOCAL-101'],
    });
  });
});

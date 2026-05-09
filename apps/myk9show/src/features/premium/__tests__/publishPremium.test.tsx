import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeneratedPremium } from '../../../types/premium-types';

const toBlobMock = vi.fn();
const pdfSpy = vi.fn(() => ({ toBlob: toBlobMock }));
const uploadMock = vi.fn();
const updateEqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: updateEqMock }));
const fromMock = vi.fn();

vi.mock('@react-pdf/renderer', () => ({
  pdf: (...args: unknown[]) => pdfSpy(...args),
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Image: () => null,
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/abc.pdf' } }),
      }),
    },
    from: (...args: unknown[]) => {
      fromMock(...args);
      return { update: updateMock };
    },
  },
}));

vi.mock('../pdf/AKCPremiumTemplate', () => ({
  AKCPremiumTemplate: function AKCMock() {
    return null;
  },
}));
vi.mock('../pdf/UKCPremiumTemplate', () => ({
  UKCPremiumTemplate: function UKCMock() {
    return null;
  },
}));

import { AKCPremiumTemplate as AKCMock } from '../pdf/AKCPremiumTemplate';
import { UKCPremiumTemplate as UKCMock } from '../pdf/UKCPremiumTemplate';

interface ReactElementLike {
  type: unknown;
  props: { inkSaver?: boolean; premium?: GeneratedPremium };
}

function lastRenderedElement(): ReactElementLike {
  const args = pdfSpy.mock.calls.at(-1) ?? [];
  return args[0] as unknown as ReactElementLike;
}

import { publishPremium } from '../publishPremium';

const basePremium: GeneratedPremium = {
  org: 'AKC',
  style: 'monogram',
  templateId: null,
  show: {
    name: 'Test Show',
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    venue: '',
    entryOpenDate: '2026-04-01',
    entryCloseDate: '2026-05-15',
    preEntryFee: 20,
    dayOfFee: 25,
    acceptChecks: true,
    acceptCash: false,
  },
  club: { name: 'Club', logoUrl: null },
  secretary: { name: 'S', email: 's@x.com', phone: null },
  officials: [],
  trials: [],
  supplemental: {
    vetClinic: null,
    accommodations: [],
    hospitalityNotes: null,
    awardsDescription: null,
    additionalNotes: null,
  },
  narratives: { showHours: '', trialInformation: '' },
};

describe('publishPremium', () => {
  beforeEach(() => {
    toBlobMock.mockReset();
    pdfSpy.mockClear();
    uploadMock.mockReset();
    updateEqMock.mockReset();
    updateMock.mockClear();
    fromMock.mockReset();
    toBlobMock.mockResolvedValue(new Blob(['pdf']));
    uploadMock.mockResolvedValue({ error: null });
    updateEqMock.mockResolvedValue({ error: null });
  });

  it('passes inkSaver=true into the rendered template', async () => {
    await publishPremium('show-1', basePremium, { inkSaver: true });
    const el = lastRenderedElement();
    expect(el.type).toBe(AKCMock);
    expect(el.props.inkSaver).toBe(true);
  });

  it('defaults inkSaver to false when no opts passed', async () => {
    await publishPremium('show-1', basePremium);
    const el = lastRenderedElement();
    expect(el.props.inkSaver).toBe(false);
  });

  it('does not update DB columns when render fails', async () => {
    toBlobMock.mockRejectedValueOnce(new Error('render boom'));
    await expect(publishPremium('show-1', basePremium, { inkSaver: false })).rejects.toThrow(
      'render boom'
    );
    expect(uploadMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('does not update DB columns when upload fails', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'upload boom' } });
    await expect(publishPremium('show-1', basePremium)).rejects.toBeTruthy();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('updates DB columns only after a successful render+upload', async () => {
    await publishPremium('show-1', basePremium);
    expect(uploadMock).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
  });

  it('routes UKC org to the UKC template', async () => {
    await publishPremium('show-1', { ...basePremium, org: 'UKC' }, { inkSaver: true });
    const el = lastRenderedElement();
    expect(el.type).toBe(UKCMock);
    expect(el.props.inkSaver).toBe(true);
  });
});

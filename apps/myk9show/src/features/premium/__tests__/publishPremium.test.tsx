import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GeneratedPremium } from '../../../types/premium-types';

const toBlobMock = vi.fn();
const pdfSpy = vi.fn((_element: unknown) => ({ toBlob: toBlobMock }));
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://example.com/abc.pdf' } }));
const fromMock = vi.fn();

vi.mock('@react-pdf/renderer', () => ({
  pdf: (element: unknown) => pdfSpy(element),
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
        getPublicUrl: getPublicUrlMock,
      }),
    },
    from: (...args: unknown[]) => {
      fromMock(...args);
      return { update: vi.fn() };
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
  secretary: { name: 'S', email: 's@x.com', phone: null, mailingAddress: null },
  officials: { chairman: null },
  trials: [],
  supplemental: {
    vetClinic: null,
    accommodations: [],
    coverImageUrl: null,
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
    getPublicUrlMock.mockClear();
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.com');
    fromMock.mockReset();
    toBlobMock.mockResolvedValue(new Blob(['pdf']));
    uploadMock.mockResolvedValue({ error: null });
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
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('does not update DB columns when upload fails', async () => {
    uploadMock.mockResolvedValueOnce({ error: { message: 'upload boom' } });
    await expect(publishPremium('show-1', basePremium)).rejects.toMatchObject({
      stage: 'pdf-upload',
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('uses one immutable versioned artifact path for a safe retry', async () => {
    await publishPremium('show-1', basePremium, { artifactId: 'artifact-1' });
    await publishPremium('show-1', basePremium, { artifactId: 'artifact-1' });

    expect(uploadMock).toHaveBeenNthCalledWith(
      1,
      'show-1/artifact-1.pdf',
      expect.any(Blob),
      expect.objectContaining({ upsert: false, contentType: 'application/pdf' })
    );
    expect(uploadMock).toHaveBeenNthCalledWith(
      2,
      'show-1/artifact-1.pdf',
      expect.any(Blob),
      expect.objectContaining({ upsert: false, contentType: 'application/pdf' })
    );
  });

  it('returns the staged artifact without a client publication timestamp', async () => {
    const result = await publishPremium('show-1', basePremium, { artifactId: 'artifact-1' });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
    expect(getPublicUrlMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      path: 'show-1/artifact-1.pdf',
    });
  });

  it('treats an already-staged artifact as safe retry progress', async () => {
    uploadMock.mockResolvedValueOnce({
      error: { status: 409, message: 'The resource already exists' },
    });

    await expect(
      publishPremium('show-1', basePremium, { artifactId: 'artifact-1' })
    ).resolves.toMatchObject({ path: 'show-1/artifact-1.pdf' });
  });

  it('routes UKC org to the UKC template', async () => {
    await publishPremium('show-1', { ...basePremium, org: 'UKC' }, { inkSaver: true });
    const el = lastRenderedElement();
    expect(el.type).toBe(UKCMock);
    expect(el.props.inkSaver).toBe(true);
  });
});

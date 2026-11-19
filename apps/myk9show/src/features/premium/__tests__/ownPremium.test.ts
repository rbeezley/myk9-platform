/**
 * MYK9-2054: the club's own premium. Link normalization, the upload-then-commit sequence and
 * the unpublish call, with only the Supabase transport stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/services/database/supabaseClient', () => ({
  supabase: {
    storage: { from: fromMock },
    rpc: rpcMock,
  },
}));

import {
  normalizePremiumLink,
  OWN_PREMIUM_MAX_BYTES,
  OWN_PREMIUM_PDF_ONLY,
  OWN_PREMIUM_PDF_TOO_LARGE,
  saveOwnPremiumFile,
  saveOwnPremiumLink,
  unpublishPremium,
  validateOwnPremiumFile,
} from '../ownPremium';

const SHOW_ID = '00000000-0000-0000-0000-000000205411';

describe('normalizePremiumLink', () => {
  it.each([
    ['https://club.org/premium.pdf', 'https://club.org/premium.pdf'],
    ['  http://club.org/p  ', 'http://club.org/p'],
    ['club.org/premium.pdf', 'https://club.org/premium.pdf'],
  ])('accepts %s', (input, expected) => {
    expect(normalizePremiumLink(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'javascript:alert(1)',
    'ftp://club.org/p.pdf',
    'https://has space.org/p',
    'localhost',
    'not a link',
  ])('rejects %j', input => {
    expect(normalizePremiumLink(input)).toBeNull();
  });

  it('rejects a link over 2000 characters', () => {
    expect(normalizePremiumLink(`https://club.org/${'a'.repeat(2000)}`)).toBeNull();
  });
});

describe('validateOwnPremiumFile', () => {
  it('accepts a PDF', () => {
    expect(
      validateOwnPremiumFile(new File(['x'], 'premium.pdf', { type: 'application/pdf' }))
    ).toBe(null);
  });

  it('rejects a non-PDF', () => {
    expect(validateOwnPremiumFile(new File(['x'], 'premium.docx', { type: 'text/plain' }))).toBe(
      OWN_PREMIUM_PDF_ONLY
    );
  });

  it('rejects a PDF over 25 MB', () => {
    const big = new File(['x'], 'premium.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: OWN_PREMIUM_MAX_BYTES + 1 });
    expect(validateOwnPremiumFile(big)).toBe(OWN_PREMIUM_PDF_TOO_LARGE);
  });
});

describe('saving and unpublishing', () => {
  beforeEach(() => {
    uploadMock.mockReset().mockResolvedValue({ error: null });
    fromMock.mockReset().mockReturnValue({ upload: uploadMock });
    rpcMock.mockReset().mockResolvedValue({ error: null });
  });

  it('stages the PDF under the show folder, then commits that exact path and URL', async () => {
    await saveOwnPremiumFile(
      SHOW_ID,
      new File(['pdf'], 'premium.pdf', { type: 'application/pdf' })
    );

    expect(fromMock).toHaveBeenCalledWith('premium-published');
    const [path, , options] = uploadMock.mock.calls[0] as [string, File, { upsert: boolean }];
    expect(path).toMatch(new RegExp(`^${SHOW_ID}/[0-9a-f-]{36}\\.pdf$`));
    expect(options.upsert).toBe(false);
    // An extension-accepted PDF reporting an empty type is still sent as application/pdf.
    const body = uploadMock.mock.calls[0]![1] as Blob;
    expect(body.type).toBe('application/pdf');
    expect(rpcMock).toHaveBeenCalledWith('set_own_premium', {
      p_show_id: SHOW_ID,
      p_storage_path: path,
      p_public_url: expect.stringMatching(
        new RegExp(`/storage/v1/object/public/premium-published/${path}$`)
      ),
    });
    expect(uploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      rpcMock.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('commits nothing when the upload fails', async () => {
    uploadMock.mockResolvedValue({ error: new Error('storage down') });
    await expect(
      saveOwnPremiumFile(SHOW_ID, new File(['pdf'], 'premium.pdf', { type: 'application/pdf' }))
    ).rejects.toThrow('storage down');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('refuses a non-PDF before touching storage', async () => {
    await expect(
      saveOwnPremiumFile(SHOW_ID, new File(['x'], 'premium.txt', { type: 'text/plain' }))
    ).rejects.toThrow(OWN_PREMIUM_PDF_ONLY);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('saves a link through the RPC', async () => {
    await saveOwnPremiumLink(SHOW_ID, 'https://club.org/premium.pdf');
    expect(rpcMock).toHaveBeenCalledWith('set_own_premium', {
      p_show_id: SHOW_ID,
      p_link: 'https://club.org/premium.pdf',
    });
  });

  it('surfaces an RPC refusal', async () => {
    rpcMock.mockResolvedValue({ error: new Error('Not authorized') });
    await expect(saveOwnPremiumLink(SHOW_ID, 'https://club.org/p')).rejects.toThrow(
      'Not authorized'
    );
  });

  it('unpublishes through the RPC', async () => {
    await unpublishPremium(SHOW_ID);
    expect(rpcMock).toHaveBeenCalledWith('unpublish_premium', { p_show_id: SHOW_ID });
  });
});

export interface PremiumDownloadRow {
  id: unknown;
  status: unknown;
  deleted_at: unknown;
  published_premium_path?: unknown;
  published_premium_url?: unknown;
}

export interface PremiumDownloadBackend {
  readVersioned(
    showId: string
  ): Promise<{ data: PremiumDownloadRow | null; error: unknown | null }>;
  readLegacy(showId: string): Promise<{ data: PremiumDownloadRow | null; error: unknown | null }>;
  canPreview(showId: string, authorizationHeader: string | null): Promise<boolean>;
  sign(
    path: string,
    expiresIn: number
  ): Promise<{
    data: { signedUrl?: string | null } | null;
    error: unknown | null;
  }>;
}

export const PREMIUM_DOWNLOAD_URL_TTL_SECONDS = 120;

export function preventPremiumDownloadResponseCaching(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, private');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const PUBLIC_SHOW_STATUSES = new Set(['published', 'upcoming', 'in_progress', 'completed']);
const PUBLIC_STORAGE_BASES = [
  'https://sojmvhhwsjxmfistvzbe.supabase.co/storage/v1/object/public/premium-published/',
  'http://127.0.0.1:54321/storage/v1/object/public/premium-published/',
];
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function isMissingPremiumPathColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  if (record.code !== 'PGRST204' && record.code !== '42703') return false;
  return [record.message, record.details, record.hint].some(
    value =>
      typeof value === 'string' &&
      value.includes('published_premium_path') &&
      /column|schema cache/i.test(value)
  );
}

function resolveCommittedPath(showId: string, row: PremiumDownloadRow | null): string | null {
  if (!row || row.id !== showId || row.deleted_at !== null) return null;

  const versionedPath = row.published_premium_path;
  if (typeof versionedPath === 'string') {
    const exactVersionedPath = new RegExp(`^${showId}/${UUID_PATTERN}\\.pdf$`, 'i');
    return exactVersionedPath.test(versionedPath) ? versionedPath : null;
  }

  const legacyPath = `${showId}.pdf`;
  return PUBLIC_STORAGE_BASES.some(base => row.published_premium_url === `${base}${legacyPath}`)
    ? legacyPath
    : null;
}

export async function createPremiumDownload(
  showId: string,
  backend: PremiumDownloadBackend,
  authorizationHeader: string | null = null
): Promise<string | null> {
  if (!new RegExp(`^${UUID_PATTERN}$`, 'i').test(showId)) return null;

  let { data, error } = await backend.readVersioned(showId);
  if (error && isMissingPremiumPathColumn(error)) {
    ({ data, error } = await backend.readLegacy(showId));
  }
  if (error) throw error;

  if (!data || data.id !== showId || data.deleted_at !== null) return null;
  if (
    !PUBLIC_SHOW_STATUSES.has(String(data.status)) &&
    !(await backend.canPreview(showId, authorizationHeader))
  ) {
    return null;
  }

  const path = resolveCommittedPath(showId, data);
  if (!path) return null;

  const signed = await backend.sign(path, PREMIUM_DOWNLOAD_URL_TTL_SECONDS);
  if (signed.error) throw signed.error;
  return signed.data?.signedUrl ?? null;
}

export async function requestPremiumDownload(
  body: unknown,
  backend: PremiumDownloadBackend,
  authorizationHeader: string | null = null
): Promise<string | null> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const showId = (body as Record<string, unknown>).show_id;
  if (typeof showId !== 'string') return null;
  return createPremiumDownload(showId, backend, authorizationHeader);
}

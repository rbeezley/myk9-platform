export function getNotificationActionUrl(data: unknown, origin: string): string {
  const rawActionUrl = readActionUrl(data);
  const path = typeof rawActionUrl === 'string' && rawActionUrl.trim() ? rawActionUrl : '/';

  try {
    const url = new URL(path, origin);
    return url.origin === origin ? url.href : new URL('/', origin).href;
  } catch {
    return new URL('/', origin).href;
  }
}

function readActionUrl(data: unknown): unknown {
  if (!data || typeof data !== 'object') return undefined;

  if ('actionUrl' in data) {
    return (data as { actionUrl?: unknown }).actionUrl;
  }

  const nestedData = (data as { data?: unknown }).data;
  if (nestedData && typeof nestedData === 'object' && 'actionUrl' in nestedData) {
    return (nestedData as { actionUrl?: unknown }).actionUrl;
  }

  return undefined;
}

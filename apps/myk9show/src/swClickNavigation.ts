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

type NotificationWindowClient = {
  url?: string;
  focus?: () => Promise<unknown>;
  navigate?: (url: string) => Promise<NotificationWindowClient | null>;
};

export async function routeNotificationClick(
  clients: NotificationWindowClient[],
  targetUrl: string,
  openWindow: (url: string) => Promise<NotificationWindowClient | null>
): Promise<unknown> {
  for (const client of clients) {
    if (!client.focus || !client.navigate) continue;

    if (client.url === targetUrl) {
      return client.focus();
    }

    try {
      const navigatedClient = await client.navigate(targetUrl);
      if (navigatedClient?.focus) {
        return navigatedClient.focus();
      }
    } catch {
      // Try the next client, then fall back to opening a fresh window.
    }
  }

  const openedClient = await openWindow(targetUrl);
  return openedClient?.focus?.() ?? openedClient;
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

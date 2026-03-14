import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ShowData {
  id: string;
  name: string;
  organization: string | null;
  start_date: string;
  end_date: string;
  location: string;
  status: string;
  entry_close_date: string | null;
  accent_color: string | null;
  logo_url: string | null;
  club_name: string;
}

function getBaseUrl(): string {
  if (process.env.VITE_PUBLIC_URL) return process.env.VITE_PUBLIC_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:5173';
}

// Duplicated from src/utils/date-format.ts — API functions can't import from src/
function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' };

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', opts);
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

function getStatusText(status: string, entryCloseDate: string | null): string {
  switch (status) {
    case 'accepting_entries': {
      if (!entryCloseDate) return 'Accepting entries';
      const date = new Date(entryCloseDate + 'T00:00:00');
      return `Entries close ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
    }
    case 'closed':
      return 'Entries closed';
    case 'completed':
      return 'Show completed';
    case 'in_progress':
      return 'Show in progress';
    case 'cancelled':
      return 'Show cancelled';
    case 'published':
      return 'Entry dates TBA';
    default:
      return '';
  }
}

function buildOgHtml(show: ShowData, baseUrl: string): string {
  const dateRange = formatDateRange(show.start_date, show.end_date);
  const title = `${show.name} — ${dateRange}`;
  const orgPrefix = show.organization ? `${show.organization} Dog Show in ` : 'Dog Show in ';
  const statusText = getStatusText(show.status, show.entry_close_date);
  const descParts = [`${orgPrefix}${show.location}`, show.club_name, statusText].filter(Boolean);
  const description = descParts.join(' · ');
  const imageUrl = `${baseUrl}/api/og-show-image?id=${show.id}`;
  const canonicalUrl = `${baseUrl}/shows/${show.id}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <meta property="og:title" content="${escapeAttr(title)}">
  <meta property="og:description" content="${escapeAttr(description)}">
  <meta property="og:image" content="${escapeAttr(imageUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${escapeAttr(canonicalUrl)}">
  <meta property="og:type" content="event">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeAttr(title)}">
  <meta name="twitter:description" content="${escapeAttr(description)}">
  <meta name="twitter:image" content="${escapeAttr(imageUrl)}">
  <meta http-equiv="refresh" content="0;url=${escapeAttr(canonicalUrl)}">
</head>
<body>
  <p>Redirecting to <a href="${escapeAttr(canonicalUrl)}">${escapeHtml(show.name)}</a>...</p>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { id } = req.query;
  const showId = Array.isArray(id) ? id[0] : id;

  if (!showId || !UUID_RE.test(showId)) {
    return res.status(400).send('Invalid show ID');
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send('Server configuration error');
  }

  try {
    const query = `id,name,organization,start_date,end_date,location,status,entry_close_date,accent_color,logo_url,clubs(name,logo_url)`;
    const response = await fetch(
      `${supabaseUrl}/rest/v1/shows?id=eq.${showId}&status=neq.draft&deleted_at=is.null&select=${encodeURIComponent(query)}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      return res.status(502).send('Database error');
    }

    const data = (await response.json()) as Record<string, unknown>[];

    if (!data || data.length === 0) {
      return res.status(404).send('Show not found');
    }

    const row = data[0] as Record<string, unknown>;
    const clubs = row.clubs as Record<string, unknown> | null;
    const show: ShowData = {
      id: row.id as string,
      name: row.name as string,
      organization: row.organization as string | null,
      start_date: row.start_date as string,
      end_date: row.end_date as string,
      location: row.location as string,
      status: row.status as string,
      entry_close_date: row.entry_close_date as string | null,
      accent_color: row.accent_color as string | null,
      logo_url: (row.logo_url as string | null) ?? (clubs?.logo_url as string | null) ?? null,
      club_name: (clubs?.name as string) ?? '',
    };

    const baseUrl = getBaseUrl();
    const html = buildOgHtml(show, baseUrl);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
    return res.status(200).send(html);
  } catch {
    const baseUrl = getBaseUrl();
    const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>myK9 Dog Show</title>
  <meta property="og:title" content="myK9 Dog Show">
  <meta property="og:description" content="View show details on myK9">
  <meta property="og:url" content="${baseUrl}/shows/${showId}">
  <meta property="og:type" content="website">
  <meta http-equiv="refresh" content="0;url=${baseUrl}/shows/${showId}">
</head>
<body><p>Redirecting...</p></body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=3600');
    return res.status(200).send(fallbackHtml);
  }
}

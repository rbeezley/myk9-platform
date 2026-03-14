import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

// Duplicated from src/utils/date-format.ts — API functions can't import from src/
function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');

  if (startDate === endDate) {
    return start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}–${end.getDate()}, ${end.getFullYear()}`;
  }

  return `${start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
}

function getStatusText(status: string, entryCloseDate: string | null): string | null {
  if (status !== 'accepting_entries' || !entryCloseDate) return null;
  const date = new Date(entryCloseDate + 'T00:00:00');
  return `Entries close ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 3)
    .map(w => w[0])
    .join('')
    .toUpperCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORG_COLORS: Record<string, string> = {
  AKC: '#14b8a6',
  UKC: '#f97316',
  ASCA: '#3b82f6',
};

function fallbackImageResponse(cacheTtl: number = 3600) {
  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ fontSize: '28px', fontWeight: 700, color: '#9ca3af' }}>myK9</div>
      <div style={{ fontSize: '16px', color: '#9ca3af', marginTop: '8px' }}>
        Dog Show Management
      </div>
    </div>,
    { width: 1200, height: 630, headers: { 'Cache-Control': `public, s-maxage=${cacheTtl}` } }
  );
}

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const showId = url.searchParams.get('id');

  if (!showId || !UUID_RE.test(showId)) {
    return new Response('Invalid show ID', { status: 400 });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response('Server configuration error', { status: 500 });
  }

  try {
    const showQuery = `id,name,organization,start_date,end_date,location,status,entry_close_date,accent_color,logo_url,clubs(name,logo_url)`;

    // Fetch show data and trials in parallel — they're independent queries
    const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
    const discQuery = `trial_type,classes(competition_type)`;
    const [showResp, discResp] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/shows?id=eq.${showId}&status=neq.draft&deleted_at=is.null&select=${encodeURIComponent(showQuery)}`,
        { headers }
      ),
      fetch(
        `${supabaseUrl}/rest/v1/trials?show_id=eq.${showId}&select=${encodeURIComponent(discQuery)}`,
        { headers }
      ),
    ]);

    const showData = (await showResp.json()) as Record<string, unknown>[];
    if (!showData || showData.length === 0) {
      return fallbackImageResponse();
    }

    const show = showData[0] as Record<string, unknown>;
    const clubs = show.clubs as Record<string, unknown> | null;
    const clubName: string = (clubs?.name as string) ?? '';
    const logoUrl: string | null =
      (show.logo_url as string | null) ?? (clubs?.logo_url as string | null) ?? null;
    const org: string | null = show.organization as string | null;
    const accentColor: string =
      (show.accent_color as string | null) ?? (org ? ORG_COLORS[org] : undefined) ?? '#14b8a6';

    const trials = (await discResp.json()) as Record<string, unknown>[];

    const disciplines = new Set<string>();
    if (Array.isArray(trials)) {
      for (const trial of trials) {
        if (trial.trial_type) {
          disciplines.add(trial.trial_type as string);
        } else if (Array.isArray(trial.classes)) {
          for (const cls of trial.classes as Record<string, unknown>[]) {
            if (cls.competition_type) disciplines.add(cls.competition_type as string);
          }
        }
      }
    }
    const disciplineList = [...disciplines].sort().join(' · ');

    const dateRange = formatDateRange(show.start_date as string, show.end_date as string);
    const statusText = getStatusText(show.status as string, show.entry_close_date as string | null);
    const initials = getInitials(clubName);

    return new ImageResponse(
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '40px',
          background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
          fontFamily: 'Inter, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '8px',
            background: accentColor,
          }}
        />

        {/* Paw print watermark */}
        <svg
          viewBox="0 0 100 100"
          style={{
            position: 'absolute',
            right: '-20px',
            bottom: '-20px',
            width: '200px',
            height: '200px',
            opacity: 0.06,
          }}
        >
          <ellipse cx="30" cy="25" rx="10" ry="13" fill="#111827" />
          <ellipse cx="50" cy="18" rx="9" ry="12" fill="#111827" />
          <ellipse cx="70" cy="25" rx="10" ry="13" fill="#111827" />
          <ellipse cx="50" cy="55" rx="20" ry="22" fill="#111827" />
          <ellipse cx="22" cy="48" rx="9" ry="11" fill="#111827" />
          <ellipse cx="78" cy="48" rx="9" ry="11" fill="#111827" />
        </svg>

        {/* Top row: club logo + myK9 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingLeft: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {logoUrl ? (
              <img
                src={logoUrl}
                width={48}
                height={48}
                style={{ borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${accentColor}, ${accentColor}dd)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '16px',
                }}
              >
                {initials}
              </div>
            )}
            <span style={{ color: '#6b7280', fontSize: '14px' }}>{clubName}</span>
          </div>
          <div
            style={{ color: '#9ca3af', fontSize: '14px', fontWeight: 600, letterSpacing: '1px' }}
          >
            myK9
          </div>
        </div>

        {/* Center: show name + details */}
        <div
          style={{
            paddingLeft: '16px',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#111827',
              lineHeight: 1.2,
            }}
          >
            {show.name as string}
          </div>
          <div
            style={{
              display: 'flex',
              gap: '24px',
              color: '#4b5563',
              fontSize: '16px',
              marginTop: '8px',
            }}
          >
            <span>📅 {dateRange}</span>
            <span>📍 {show.location as string}</span>
          </div>
        </div>

        {/* Bottom: entry badge + org/disciplines */}
        <div
          style={{
            paddingLeft: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          {statusText ? (
            <div
              style={{
                background: '#dbeafe',
                color: '#1d4ed8',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              {statusText}
            </div>
          ) : (
            <div />
          )}
          <div
            style={{
              textAlign: 'right',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
            }}
          >
            {org && (
              <div
                style={{
                  color: '#6b7280',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '2px',
                }}
              >
                {org}
              </div>
            )}
            {disciplineList && (
              <div style={{ color: '#9ca3af', fontSize: '12px' }}>{disciplineList}</div>
            )}
          </div>
        </div>
      </div>,
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=86400, max-age=86400',
        },
      }
    );
  } catch {
    return fallbackImageResponse();
  }
}

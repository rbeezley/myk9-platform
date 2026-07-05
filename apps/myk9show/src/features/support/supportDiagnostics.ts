import { UserRole } from '@/types/auth-types';

const MAX_ERROR_ENTRIES = 10;
const MAX_TEXT_LENGTH = 500;
const SECRET_PATTERN =
  /(access_token|refresh_token|authorization|apikey|api_key|secret|password|stripe|payment_intent|client_secret)=([^&\s]+)/gi;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SupportClientError {
  message: string;
  name?: string;
  source?: string;
  stack?: string;
  timestamp: string;
}

export interface SupportReplicationDiagnostics {
  status?: string;
  lastSyncAt?: string | Date | null;
  queueSize?: number | null;
  conflictCount?: number | null;
  errorCount?: number | null;
  watermark?: string | number | null;
}

export interface SupportDiagnosticInput {
  userId?: string | null;
  databaseUserId?: string | null;
  role?: UserRole | string | null;
  route?: string | null;
  showId?: string | null;
  trialId?: string | null;
  entryId?: string | null;
  appVersion?: string | null;
  online?: boolean | null;
  replication?: SupportReplicationDiagnostics | null;
  clientErrors?: SupportClientError[] | null;
}

export interface SupportDiagnosticBundle {
  user: {
    authUserId: string | null;
    databaseUserId: string | null;
    role: string | null;
  };
  route: string | null;
  context: {
    showId: string | null;
    trialId: string | null;
    entryId: string | null;
  };
  app: {
    version: string | null;
    capturedAt: string;
  };
  connectivity: {
    online: boolean | null;
    replication: {
      status: string | null;
      lastSyncAt: string | null;
      queueSize: number | null;
      conflictCount: number | null;
      errorCount: number | null;
      watermark: string | number | null;
    };
  };
  clientErrors: SupportClientError[];
}

let clientErrorRing: SupportClientError[] = [];
let globalCaptureTeardown: (() => void) | null = null;

function redact(value: string): string {
  return value
    .replace(SECRET_PATTERN, '$1=[redacted]')
    .replace(/Bearer\s+[-._~+/=A-Za-z0-9]+/g, 'Bearer [redacted]');
}

function truncate(value: string): string {
  const redacted = redact(value);
  return redacted.length > MAX_TEXT_LENGTH ? `${redacted.slice(0, MAX_TEXT_LENGTH)}...` : redacted;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? truncate(trimmed) : null;
}

function normalizeUuid(value: string | null | undefined): string | null {
  if (!value) return null;
  return UUID_PATTERN.test(value) ? value : null;
}

function normalizeDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function captureSupportClientError(error: unknown, source?: string): SupportClientError {
  const asError = error instanceof Error ? error : new Error(String(error));
  const entry: SupportClientError = {
    message: truncate(asError.message || 'Unknown error'),
    timestamp: new Date().toISOString(),
    ...(asError.name ? { name: truncate(asError.name) } : {}),
    ...(source ? { source: truncate(source) } : {}),
    ...(asError.stack ? { stack: truncate(asError.stack) } : {}),
  };

  clientErrorRing = [...clientErrorRing, entry].slice(-MAX_ERROR_ENTRIES);
  return entry;
}

export function getSupportClientErrors(): SupportClientError[] {
  return [...clientErrorRing];
}

export function clearSupportClientErrors(): void {
  clientErrorRing = [];
}

export function installSupportErrorCapture(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (globalCaptureTeardown) return globalCaptureTeardown;

  const handleError = (event: ErrorEvent) => {
    captureSupportClientError(event.error ?? event.message, event.filename || 'window.error');
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    captureSupportClientError(event.reason, 'unhandledrejection');
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  globalCaptureTeardown = () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    globalCaptureTeardown = null;
  };

  return globalCaptureTeardown;
}

export function buildDiagnosticBundle(input: SupportDiagnosticInput): SupportDiagnosticBundle {
  try {
    const replication = input.replication ?? {};
    return {
      user: {
        authUserId: normalizeUuid(input.userId),
        databaseUserId: normalizeUuid(input.databaseUserId),
        role: normalizeString(input.role),
      },
      route: normalizeString(input.route),
      context: {
        showId: normalizeUuid(input.showId),
        trialId: normalizeUuid(input.trialId),
        entryId: normalizeUuid(input.entryId),
      },
      app: {
        version: normalizeString(input.appVersion),
        capturedAt: new Date().toISOString(),
      },
      connectivity: {
        online: typeof input.online === 'boolean' ? input.online : null,
        replication: {
          status: normalizeString(replication.status),
          lastSyncAt: normalizeDate(replication.lastSyncAt),
          queueSize: normalizeNumber(replication.queueSize),
          conflictCount: normalizeNumber(replication.conflictCount),
          errorCount: normalizeNumber(replication.errorCount),
          watermark:
            typeof replication.watermark === 'string' || typeof replication.watermark === 'number'
              ? replication.watermark
              : null,
        },
      },
      clientErrors: (input.clientErrors ?? getSupportClientErrors()).slice(-MAX_ERROR_ENTRIES),
    };
  } catch (error) {
    captureSupportClientError(error, 'buildDiagnosticBundle');
    return {
      user: { authUserId: null, databaseUserId: null, role: null },
      route: null,
      context: { showId: null, trialId: null, entryId: null },
      app: { version: null, capturedAt: new Date().toISOString() },
      connectivity: {
        online: null,
        replication: {
          status: null,
          lastSyncAt: null,
          queueSize: null,
          conflictCount: null,
          errorCount: null,
          watermark: null,
        },
      },
      clientErrors: getSupportClientErrors(),
    };
  }
}

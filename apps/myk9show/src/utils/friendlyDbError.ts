import { logger } from '@/services/LoggingService';

const DEFAULT_DB_ERROR = "We couldn't save that change. Please try again.";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  status?: unknown;
  statusCode?: unknown;
  name?: unknown;
};

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') {
    return error as ErrorLike;
  }
  return {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function statusValue(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function toError(error: unknown, message: string): Error {
  return error instanceof Error ? error : new Error(message);
}

export function friendlyDbError(error: unknown, fallbackMessage = DEFAULT_DB_ERROR): string {
  const err = asErrorLike(error);
  const message =
    stringValue(err.message) ?? (typeof error === 'string' ? error : 'Unknown database error');
  const code = stringValue(err.code);
  const details = stringValue(err.details);
  const hint = stringValue(err.hint);
  const status = statusValue(err.status) ?? statusValue(err.statusCode);
  const normalized = `${code ?? ''} ${message} ${details ?? ''} ${hint ?? ''}`.toLowerCase();

  logger.error(
    'Database operation failed',
    'database',
    { code, status, name: stringValue(err.name), message, details, hint },
    toError(error, message)
  );

  if (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    normalized.includes('row-level security') ||
    normalized.includes('permission denied') ||
    normalized.includes('unauthorized') ||
    normalized.includes('not authorized')
  ) {
    return "You don't have permission to make that change.";
  }

  if (code === '23505' || normalized.includes('duplicate key')) {
    return 'That record already exists.';
  }

  if (code === '23503' || normalized.includes('foreign key')) {
    return 'This change references data that is no longer available.';
  }

  if (code === '23502' || normalized.includes('not-null')) {
    return 'A required field is missing.';
  }

  return fallbackMessage;
}

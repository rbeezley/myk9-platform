import { isUuidShaped, isValidTrialDate } from './delivery.ts';

/**
 * The pure half of the judge's record email (MYK9-1924 phase 2b): what the request may say,
 * who it may go to, and what the message and file are called. Nothing here touches the database,
 * so every rule that decides a recipient is testable without a client.
 */

/** A judge's record is a few dozen pages; this is far above that and well under the bucket's cap. */
export const MAX_JUDGE_RECORD_BYTES = 8 * 1024 * 1024;

export interface JudgeRecordPayload {
  /** `preview` says who would receive it; `send` sends. Neither takes a recipient. */
  action: 'preview' | 'send';
  showId: string;
  /** The judge's person id: the key that `judge_assignments.person_id` resolves. */
  judgeId: string;
  /** The trial day the record covers, `YYYY-MM-DD`. */
  day: string;
  /** The record PDF, base64. Required for `send`. */
  pdfBase64?: string;
  /** Send a record the judge already has, on purpose. One id per button press. */
  sendAgain?: boolean;
  attemptId?: string;
}

/** The request holds a day that exists, ids that are ids, and no address anywhere. */
export function isValidJudgeRecordPayload(body: JudgeRecordPayload): boolean {
  if (!body || typeof body !== 'object') return false;
  if (body.action !== 'preview' && body.action !== 'send') return false;
  if (typeof body.showId !== 'string' || !isUuidShaped(body.showId)) return false;
  if (typeof body.judgeId !== 'string' || !isUuidShaped(body.judgeId)) return false;
  if (typeof body.day !== 'string' || !body.day || !isValidTrialDate(body.day)) return false;
  if (body.action === 'send') {
    if (typeof body.pdfBase64 !== 'string' || body.pdfBase64.length === 0) return false;
    if (body.sendAgain !== undefined && typeof body.sendAgain !== 'boolean') return false;
    if (body.sendAgain && (typeof body.attemptId !== 'string' || !isUuidShaped(body.attemptId))) {
      return false;
    }
  }
  return true;
}

/** The PDF bytes from base64, or null when it is not a PDF or is over the limit. */
export function decodeJudgeRecordPdf(pdfBase64: string): Uint8Array | null {
  // 4 base64 characters carry 3 bytes: refuse before decoding something enormous.
  if (pdfBase64.length > Math.ceil((MAX_JUDGE_RECORD_BYTES * 4) / 3) + 4) return null;
  let binary: string;
  try {
    binary = atob(pdfBase64);
  } catch {
    return null;
  }
  if (binary.length === 0 || binary.length > MAX_JUDGE_RECORD_BYTES) return null;
  if (!binary.startsWith('%PDF-')) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Under the show's folder, which is what the bucket's own policies key on. */
export function judgeRecordStoragePath(
  showId: string,
  judgeId: string,
  day: string,
  sha256: string
): string {
  return `${showId}/judge-records/${judgeId}-${day}-${sha256.slice(0, 16)}.pdf`;
}

/**
 * One key per show, judge and day, never per content: the PDF's bytes change on every build
 * (print time, creation dates), so a content key would let a rebuilt PDF email the judge again.
 */
export function judgeRecordIdempotencyKey(input: {
  showId: string;
  judgeId: string;
  day: string;
}): string {
  return `judge-record-${input.showId}-${input.judgeId}-${input.day}`;
}

/** `email_log.related_id` is a uuid: a stable one from the key, so the send-once check can find it. */
export async function uuidFromKey(key: string): Promise<string> {
  const hex = await sha256Hex(new TextEncoder().encode(key));
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

export interface JudgeAssignmentFact {
  classId: string | null;
  status: string | null;
  classDeletedAt: string | null;
  /** The trial date of the assigned class. */
  classDate: string | null;
}

export interface JudgePersonFact {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  deletedAt: string | null;
}

export type JudgeRecordRecipient =
  | { kind: 'send'; email: string; judgeName: string; classCount: number }
  | { kind: 'download'; reason: 'not_assigned' | 'no_email'; judgeName: string };

function judgeNameOf(person: JudgePersonFact | null): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || 'The judge';
}

/**
 * Who a judge's record goes to: the person assigned to classes on that day, at the email on file,
 * and nobody else. The judge is the one in `judge_assignments`, never a value from the request;
 * an assignment that is not confirmed, a deleted class, or a different day does not count. A judge
 * with no usable email yields a download and no send.
 */
export function resolveJudgeRecordRecipient(input: {
  assignments: readonly JudgeAssignmentFact[];
  person: JudgePersonFact | null;
  day: string;
}): JudgeRecordRecipient {
  const judgeName = judgeNameOf(input.person);
  const classCount = input.assignments.filter(
    item =>
      item.classId !== null &&
      item.status === 'confirmed' &&
      !item.classDeletedAt &&
      item.classDate === input.day
  ).length;
  if (!input.person || input.person.deletedAt || classCount === 0) {
    return { kind: 'download', reason: 'not_assigned', judgeName };
  }
  const email = input.person.email?.trim() ?? '';
  if (!email.includes('@')) return { kind: 'download', reason: 'no_email', judgeName };
  return { kind: 'send', email, judgeName, classCount };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** What the judge's browser saves the file as. Becomes a header, so it is sanitised hard. */
export function buildJudgeRecordDownloadFilename(showName: string, day: string): string {
  return `${slug(showName) || 'show'}-${slug(day) || 'day'}-judges-record.pdf`;
}

export function buildJudgeRecordSubject(showName: string, day: string): string {
  return `${showName}: your judge's record for ${day}`;
}

/** "December 7, 2026" from the stored `expires_at` instant, in UTC so the date matches the link. */
export function formatExpiryDate(expiresAt: string): string {
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return expiresAt;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildJudgeRecordEmailHtml(input: {
  showName: string;
  day: string;
  signedUrl: string;
  expiresAt: string;
}): string {
  const showName = escapeHtml(input.showName);
  const day = escapeHtml(input.day);
  const signedUrl = escapeHtml(input.signedUrl);
  const expires = escapeHtml(formatExpiryDate(input.expiresAt));
  return `<!doctype html>
<html lang="en">
  <body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5">
    <h1 style="font-size:22px">Your judge's record for ${showName}</h1>
    <p>This is your record for ${day}: a cover sheet, your classes and the scores as they stand.</p>
    <p><a href="${signedUrl}" style="display:inline-block;background:#172033;color:#fff;padding:12px 18px;text-decoration:none">Open your judge's record</a></p>
    <p><strong>Save the file.</strong> The link stops working on ${expires}. Keep the saved file for one year.</p>
    <p>This is a convenience copy. The signed paper is the official record.</p>
    <p>Please do not forward the link. If it stops working, ask the secretary to send it again.</p>
  </body>
</html>`;
}

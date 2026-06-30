/**
 * Shared diagnostic envelope returned by every MCP tool.
 *
 * The envelope is deliberately stable: callers (Codex/Claude) key off `state`
 * and never parse raw rows. `envLabel` is stamped on every result so an admin
 * always knows which database an answer came from (local/staging/production).
 */
import type { EnvLabel } from '../config';
import { redactEvidenceValue } from './redaction';

export type DiagnosticState =
  | 'found'
  | 'not_found'
  | 'ambiguous'
  | 'insufficient_data'
  | 'source_unavailable'
  | 'error';

export interface DiagnosticEvidence {
  label: string;
  value: string | number | boolean | null;
  source: string;
}

export interface DiagnosticLink {
  label: string;
  url: string;
}

export interface DiagnosticResult<
  TSummary extends Record<string, unknown> = Record<string, unknown>,
> {
  state: DiagnosticState;
  envLabel: EnvLabel;
  summary: TSummary;
  evidence: DiagnosticEvidence[];
  links: DiagnosticLink[];
  limitations: string[];
}

export interface DiagnosticResultInit<TSummary extends Record<string, unknown>> {
  summary?: TSummary;
  evidence?: DiagnosticEvidence[];
  links?: DiagnosticLink[];
  limitations?: string[];
}

/**
 * Build a fully-populated diagnostic envelope, stamping `envLabel` and
 * defaulting the array/summary fields so every tool returns the same shape.
 *
 * Evidence values are passed through {@link redactEvidenceValue} here, at the
 * boundary, so secret-shaped strings are scrubbed even when a caller forgets
 * to redact. This is the single enforcement point for the redaction guarantee.
 */
export function createDiagnosticResult<
  TSummary extends Record<string, unknown> = Record<string, unknown>,
>(
  envLabel: EnvLabel,
  state: DiagnosticState,
  init: DiagnosticResultInit<TSummary> = {},
): DiagnosticResult<TSummary> {
  return {
    state,
    envLabel,
    summary: (init.summary ?? {}) as TSummary,
    evidence: (init.evidence ?? []).map((entry) => ({
      ...entry,
      value: redactEvidenceValue(entry.value),
    })),
    links: init.links ?? [],
    limitations: init.limitations ?? [],
  };
}

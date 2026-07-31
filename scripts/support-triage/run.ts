import { CANNED_ANSWERS, findAutoSendableAnswer, type CannedAnswer } from './answers';
import { carveOutFor } from './carveOuts';
import { classifyThread, type Classification } from './classify';
import { detectClusters } from './cluster';
import {
  buildThreads,
  createSupabaseSource,
  needsReply,
  sendOperatorReply,
  type SupportDataSource,
} from './gateway';
import { renderClusterEmail, renderDraftEmail, sendEmail } from './notify';
import { clusterKey, readState, writeState, type TriageState } from './state';
import type { TicketThread } from './types';

export interface RunDeps {
  source: SupportDataSource;
  classify: (thread: TicketThread) => Promise<Classification>;
  notify: (subject: string, html: string) => Promise<void>;
  state: TriageState;
  now: Date;
  appUrl: string;
  operatorUserId: string;
  answers?: CannedAnswer[];
  maxAutoSends?: number;
}

export interface RunSummary {
  considered: number;
  autoSent: number;
  drafted: number;
  carvedOut: number;
  clustersAlerted: number;
  capReached: boolean;
  state: TriageState;
}

// INTENT: Bounds the blast radius of both a bug and a successful prompt injection.
// Exceeding the cap sends nothing further in this pass rather than continuing.
const DEFAULT_MAX_AUTO_SENDS = 3;

export async function runPass(deps: RunDeps): Promise<RunSummary> {
  const answers = deps.answers ?? CANNED_ANSWERS;
  const maxAutoSends = deps.maxAutoSends ?? DEFAULT_MAX_AUTO_SENDS;

  const tickets = await deps.source.openTickets();
  const messages = await deps.source.messagesFor(tickets.map(ticket => ticket.id));
  const threads = buildThreads(tickets, messages).filter(needsReply);

  const drafted = new Set(deps.state.draftedMessageIds);
  const alerted = new Set(deps.state.alertedClusterKeys);

  const summary: RunSummary = {
    considered: threads.length,
    autoSent: 0,
    drafted: 0,
    carvedOut: 0,
    clustersAlerted: 0,
    capReached: false,
    state: deps.state,
  };

  for (const thread of threads) {
    const carveOut = carveOutFor(thread);
    if (carveOut) summary.carvedOut += 1;

    const classification = await deps.classify(thread);

    // INTENT: A carved-out ticket can never reach the send path, regardless of what
    // the model returned. The check lives here in code, not in the model prompt.
    const promoted =
      carveOut === null && classification.kind === 'canned'
        ? findAutoSendableAnswer(classification.answerId, answers)
        : null;

    if (promoted) {
      if (summary.autoSent >= maxAutoSends) {
        summary.capReached = true;
        continue;
      }
      const result = await sendOperatorReply(
        thread,
        promoted.reply,
        deps.operatorUserId,
        deps.source
      );
      if (result === 'sent') summary.autoSent += 1;
      continue;
    }

    const latest = latestExhibitorMessageId(thread);
    if (!latest || drafted.has(latest)) continue;

    const draftText =
      classification.kind === 'novel'
        ? classification.draft
        : '(A canned answer matched but is not yet promoted for auto-send.)';
    const label =
      classification.kind === 'novel' ? classification.clusterLabel : classification.answerId;

    const email = renderDraftEmail(thread.ticket, draftText, label, deps.appUrl);
    await deps.notify(email.subject, email.html);
    drafted.add(latest);
    summary.drafted += 1;
  }

  for (const cluster of detectClusters(tickets, deps.now)) {
    const key = clusterKey(cluster.showId, cluster.newestCreatedAt);
    if (alerted.has(key)) continue;
    const email = renderClusterEmail(cluster, deps.appUrl);
    await deps.notify(email.subject, email.html);
    alerted.add(key);
    summary.clustersAlerted += 1;
  }

  summary.state = {
    draftedMessageIds: [...drafted],
    alertedClusterKeys: [...alerted],
  };
  return summary;
}

function latestExhibitorMessageId(thread: TicketThread): string | null {
  const exhibitor = thread.messages
    .filter(message => !message.is_from_operator)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return exhibitor.length > 0 ? (exhibitor[exhibitor.length - 1]?.id ?? null) : null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function main(): Promise<void> {
  const statePath = process.env.SUPPORT_TRIAGE_STATE_PATH ?? '.support-triage/state.json';
  const notifyConfig = {
    apiKey: requireEnv('RESEND_API_KEY'),
    from: requireEnv('SUPPORT_TRIAGE_FROM_EMAIL'),
    to: requireEnv('SUPPORT_OPERATOR_EMAIL'),
    appUrl: requireEnv('MYK9_APP_URL'),
  };

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });

  const source = createSupabaseSource(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  );

  const summary = await runPass({
    source,
    classify: thread =>
      classifyThread(thread, {
        createMessage: async request =>
          (await anthropic.messages.create(
            request as Parameters<typeof anthropic.messages.create>[0]
          )) as unknown as { content: Array<{ type: string; text?: string }> },
      }),
    notify: (subject, html) => sendEmail(notifyConfig, subject, html),
    state: await readState(statePath),
    now: new Date(),
    appUrl: notifyConfig.appUrl,
    operatorUserId: requireEnv('SUPPORT_OPERATOR_USER_ID'),
  });

  await writeState(statePath, summary.state);
  console.log(
    `support-triage: considered=${summary.considered} autoSent=${summary.autoSent} drafted=${summary.drafted} carvedOut=${summary.carvedOut} clusters=${summary.clustersAlerted} capReached=${summary.capReached}`
  );
}

// INTENT: Fail loud in the log but safe in the queue. Nobody is watching this run, so a
// failed pass must simply stop — the next tick retries, and unanswered tickets remain
// exactly where the operator can still see them.
if (process.env.VITEST !== 'true' && process.argv[1]?.includes('support-triage')) {
  main().catch((error: unknown) => {
    console.error('support-triage pass failed:', error);
    process.exitCode = 1;
  });
}

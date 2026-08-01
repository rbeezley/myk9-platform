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
import {
  renderCapReachedEmail,
  renderCarveOutEmail,
  renderClusterEmail,
  renderDraftEmail,
  sendEmail,
} from './notify';
import { clusterKey, readState, writeState, type TriageState } from './state';
import type { TicketOwner, TicketThread } from './types';

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

  // One lookup for the whole pass, so naming the exhibitor in an email costs no
  // per-ticket round-trip.
  const owners = new Map<string, TicketOwner>();
  for (const owner of await deps.source.ownersFor(threads.map(t => t.ticket.owner_id))) {
    owners.set(owner.auth_user_id, owner);
  }

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
    const latest = latestExhibitorMessageId(thread);
    const carveOut = carveOutFor(thread);

    // INTENT: A carved-out ticket can never auto-send, so there is nothing for the
    // model to decide. Skipping the call here also keeps payment-related ticket text
    // out of the API entirely.
    if (carveOut) {
      summary.carvedOut += 1;
      if (latest && !drafted.has(latest)) {
        const email = renderCarveOutEmail(
          thread.ticket,
          carveOut,
          deps.appUrl,
          owners.get(thread.ticket.owner_id) ?? null
        );
        await deps.notify(email.subject, email.html);
        drafted.add(latest);
        summary.drafted += 1;
      }
      continue;
    }

    // Already drafted on an earlier pass and still unanswered — the operator has the
    // draft. Skipping before classify avoids a model call per ticket per 15 minutes,
    // for as long as the ticket stays open.
    if (!latest || drafted.has(latest)) continue;

    const classification = await deps.classify(thread);

    const promoted =
      classification.kind === 'canned'
        ? findAutoSendableAnswer(classification.answerId, answers)
        : null;

    if (promoted) {
      if (summary.autoSent >= maxAutoSends) {
        summary.capReached = true;
        continue;
      }
      // INTENT: The carve-out above was evaluated against a snapshot taken before the
      // classification round-trip. Re-check it against the freshly-read thread so a
      // carve-out trigger that arrived mid-pass still blocks the send.
      const result = await sendOperatorReply(
        thread,
        promoted.reply,
        deps.operatorUserId,
        deps.source,
        fresh => carveOutFor(fresh) === null
      );
      if (result === 'sent') summary.autoSent += 1;
      continue;
    }

    const draftText =
      classification.kind === 'novel'
        ? classification.draft
        : '(A canned answer matched but is not yet promoted for auto-send.)';
    const label =
      classification.kind === 'novel' ? classification.clusterLabel : classification.answerId;

    const email = renderDraftEmail(
      thread.ticket,
      draftText,
      label,
      deps.appUrl,
      owners.get(thread.ticket.owner_id) ?? null
    );
    await deps.notify(email.subject, email.html);
    drafted.add(latest);
    summary.drafted += 1;
  }

  // INTENT: The cap exists to bound a runaway, and a runaway is exactly when the
  // operator most needs to hear about it. Without this the only signal is a line in a
  // CI log nobody reads.
  if (summary.capReached) {
    const email = renderCapReachedEmail(summary.autoSent, deps.appUrl);
    await deps.notify(email.subject, email.html);
  }

  // Cluster over tickets still awaiting a reply, not every open ticket — a ticket the
  // agent already answered is not evidence that users are currently blocked.
  const unanswered = threads.map(thread => thread.ticket);
  for (const cluster of detectClusters(unanswered, deps.now)) {
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
    // Log message and stack only. Some SDK error objects carry request headers as
    // properties; logging the object wholesale could put a credential in CI output.
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    console.error('support-triage pass failed:', detail);
    process.exitCode = 1;
  });
}

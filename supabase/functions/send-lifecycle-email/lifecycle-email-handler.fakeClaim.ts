type Row = Record<string, unknown>;

interface ClaimStore {
  jobs: Row[];
  ties: Row[];
  newId: () => string;
  newAttemptId: () => string;
  uniqueViolation: (candidate: Row) => boolean;
}

const norm = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * A job is active while its lease runs, whoever wrote it: a pre-migration send has a
 * lease and no attempt_id, and must still answer busy. attempt_id only decides who
 * may record the outcome.
 */
export const isActiveAttempt = (row: Row) =>
  row.claimed_until != null && Date.parse(String(row.claimed_until)) > Date.now();

/**
 * Test double for public.claim_registration_number_needed_job: the SAME decision
 * table the SQL function implements (supabase/tests/myk9_1212_*.sql proves the SQL),
 * run over an in-memory jobs table so the handler's dispatch is exercised end to end.
 * A write that would violate a unique index returns the 23505 error and changes nothing.
 */
export function claimRegistrationNumberNeededJob(store: ClaimStore, args: Row) {
  const answer = (outcome: string, jobId: unknown, attemptId: unknown, recovered = false) => ({
    data: { outcome, job_id: jobId, attempt_id: attemptId, recovered },
    error: null,
  });
  const busy = () => answer('busy', null, null);
  const { jobs, ties } = store;
  const key = args.p_request_key;
  const email = norm(args.p_recipient_email);
  const lease = args.p_lease_until;
  if (lease == null || Date.parse(String(lease)) <= Date.now()) {
    return { data: null, error: { code: '22023', message: 'a future lease is required' } };
  }
  const now = new Date().toISOString();
  const attempt = store.newAttemptId();
  const own = (row: Row) =>
    Object.assign(row, { attempt_id: attempt, claimed_until: lease, updated_by: args.p_user_id });
  const supersede = (row: Row) =>
    Object.assign(row, {
      status: 'skipped',
      skipped_at: now,
      updated_by: args.p_user_id,
      attempt_id: null,
      claimed_until: null,
    });

  let idempotencyKey = String(key);
  // A Map lookup, as the tie table's primary key (show_id, request_key) indexes it.
  const tieIndex = new Map(ties.map(row => [`${row.show_id}\u0000${row.request_key}`, row]));
  const tie = tieIndex.get(`${args.p_show_id}\u0000${key}`);
  const tied = tie ? jobs.find(row => row.id === tie.job_id) : undefined;
  let repoint: Row | undefined;
  if (tie && tied) {
    if (tied.status === 'sent') return answer('sent', tied.id, null);
    if (tied.status !== 'ready' && tied.status !== 'failed') return busy();
    // Nothing touches an active attempt, not even this request's own replay.
    if (isActiveAttempt(tied)) return busy();
    if (norm(tied.recipient_email) === email) {
      own(tied);
      return answer('send', tied.id, attempt);
    }
    // The address changed: supersede and re-point ONLY this request's tie.
    supersede(tied);
    repoint = tie;
    idempotencyKey = `${String(key)}:to:${store.newId()}`;
  } else {
    const outstanding = jobs.filter(
      row =>
        row.show_id === args.p_show_id &&
        row.step_type === 'registration_number_needed' &&
        row.entry_id === args.p_entry_id &&
        (row.status === 'ready' || row.status === 'failed')
    );
    if (outstanding.some(isActiveAttempt)) return busy();
    const same = outstanding.find(row => norm(row.recipient_email) === email);
    if (same) {
      // Recovery ADDS a tie; every earlier request keeps resolving to this job.
      ties.push({ show_id: args.p_show_id, request_key: key, job_id: same.id });
      own(same);
      return answer('send', same.id, attempt, true);
    }
    outstanding.forEach(supersede);
  }

  const row: Row = {
    id: store.newId(),
    show_id: args.p_show_id,
    step_id: args.p_step_id,
    step_type: 'registration_number_needed',
    status: 'ready',
    recipient_scope: 'entry',
    entry_id: args.p_entry_id,
    recipient_email: String(args.p_recipient_email).trim(),
    recipient_name: args.p_recipient_name,
    subject: args.p_subject,
    body: args.p_body,
    secretary_note: args.p_secretary_note,
    idempotency_key: idempotencyKey,
    attempt_id: attempt,
    claimed_until: lease,
    due_at: now,
    created_at: now,
    created_by: args.p_user_id,
    updated_by: args.p_user_id,
  };
  if (store.uniqueViolation(row)) {
    return { data: null, error: { code: '23505', message: 'duplicate key value' } };
  }
  jobs.push(row);
  if (repoint) repoint.job_id = row.id;
  else ties.push({ show_id: args.p_show_id, request_key: key, job_id: row.id });
  return answer('send', row.id, attempt);
}

/**
 * Test double for public.finish_registration_number_needed_attempt: a compare-and-set
 * on attempt_id. Only the attempt that owns a ready/failed job records its outcome.
 */
export function finishRegistrationNumberNeededAttempt(jobs: Row[], args: Row) {
  if (args.p_status !== 'sent' && args.p_status !== 'failed') {
    return { data: null, error: { code: '22023', message: 'an attempt finishes sent or failed' } };
  }
  const job = jobs.find(
    row =>
      row.id === args.p_job_id &&
      row.step_type === 'registration_number_needed' &&
      row.attempt_id === args.p_attempt_id &&
      (row.status === 'ready' || row.status === 'failed')
  );
  if (!job) return { data: false, error: null };
  Object.assign(job, {
    status: args.p_status,
    ...(args.p_status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    email_log_id: args.p_email_log_id,
    rendered_subject: args.p_rendered_subject,
    rendered_body: args.p_rendered_body,
    rendered_secretary_note: args.p_rendered_secretary_note,
    updated_by: args.p_user_id,
    attempt_id: null,
    claimed_until: null,
  });
  return { data: true, error: null };
}

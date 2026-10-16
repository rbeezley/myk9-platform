type Row = Record<string, unknown>;

interface ClaimStore {
  jobs: Row[];
  ties: Row[];
  newId: () => string;
  uniqueViolation: (candidate: Row) => boolean;
}

const norm = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

/**
 * Test double for public.claim_registration_number_needed_job: the SAME decision
 * table the SQL function implements (supabase/tests/myk9_1212_*.sql proves the SQL),
 * run over an in-memory jobs table so the handler's dispatch is exercised end to end.
 * A write that would violate a unique index returns the 23505 error and changes nothing.
 */
export function claimRegistrationNumberNeededJob(store: ClaimStore, args: Row) {
  const ok = (outcome: string, jobId: unknown, recovered = false) => ({
    data: { outcome, job_id: jobId, recovered },
    error: null,
  });
  const { jobs, ties } = store;
  const key = args.p_request_key;
  const email = norm(args.p_recipient_email);
  const staleBefore = Date.parse(String(args.p_stale_before));
  const isStale = (row: Row) => !row.created_at || Date.parse(String(row.created_at)) < staleBefore;
  const now = new Date().toISOString();
  // The in-flight lease this claim stamps on the job it answers `send` for (null from
  // a pre-lease caller, as the SQL default).
  const lease = args.p_lease_until ?? null;
  const stamp = (row: Row) => Object.assign(row, { claimed_until: lease });
  // An ACTIVE send: a live lease, or (no lease at all) a recent ready job.
  const isActive = (row: Row) =>
    row.claimed_until != null
      ? Date.parse(String(row.claimed_until)) > Date.now()
      : row.status === 'ready' && !isStale(row);

  const supersede = (row: Row) =>
    Object.assign(row, { status: 'skipped', skipped_at: now, updated_by: args.p_user_id });

  let idempotencyKey = String(key);
  // A Map lookup, as the tie table's primary key (show_id, request_key) indexes it.
  const tieIndex = new Map(ties.map(row => [`${row.show_id}\u0000${row.request_key}`, row]));
  const tie = tieIndex.get(`${args.p_show_id}\u0000${key}`);
  let tieRow = tie;
  let tied = tie ? jobs.find(row => row.id === tie.job_id) : undefined;
  if (!tied) {
    // Lazy adoption: a job the PREVIOUS handler made on the plain key has no tie yet.
    const byIdempotency = new Map(jobs.map(row => [String(row.idempotency_key), row]));
    const legacy = byIdempotency.get(String(key));
    if (
      legacy &&
      legacy.show_id === args.p_show_id &&
      legacy.step_type === 'registration_number_needed' &&
      legacy.entry_id === args.p_entry_id
    ) {
      tied = legacy;
      tieRow = { show_id: args.p_show_id, request_key: key, job_id: legacy.id };
      ties.push(tieRow);
    }
  }
  let newTie: Row | undefined;
  if (tied) {
    if (tied.status === 'sent') return ok('sent', tied.id);
    if (tied.status !== 'ready' && tied.status !== 'failed') return ok('busy', null);
    if (norm(tied.recipient_email) === email) {
      // Same key, address and text: provider-idempotent, so allowed under a live lease.
      stamp(tied);
      return ok('send', tied.id);
    }
    // An active send is awaiting the provider: never replace it.
    if (isActive(tied)) return ok('busy', null);
    // The address changed: supersede and re-point ONLY this request's tie.
    supersede(tied);
    newTie = tieRow;
    idempotencyKey = `${String(key)}:to:${store.newId()}`;
  } else {
    const outstanding = jobs.filter(
      row =>
        row.show_id === args.p_show_id &&
        row.step_type === 'registration_number_needed' &&
        row.entry_id === args.p_entry_id &&
        (row.status === 'ready' || row.status === 'failed')
    );
    if (outstanding.some(isActive)) return ok('busy', null);
    const same = outstanding.find(row => norm(row.recipient_email) === email);
    if (same) {
      // Recovery ADDS a tie; every earlier request keeps resolving to this job.
      ties.push({ show_id: args.p_show_id, request_key: key, job_id: same.id });
      stamp(same);
      return ok('send', same.id, true);
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
  if (newTie) newTie.job_id = row.id;
  else ties.push({ show_id: args.p_show_id, request_key: key, job_id: row.id });
  return ok('send', row.id);
}

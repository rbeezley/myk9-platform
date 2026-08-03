import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;
type ApiResponse<T = unknown> = {
  status: number;
  body: T | null;
};
type FixtureUser = {
  email: string;
  password: string;
  personId: string;
  authUserId?: string;
  accessToken?: string;
};
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error(
    'VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required'
  );
}

const prefix = `myk9-147-${Date.now()}`;
const password = `M9!${randomUUID()}a`;
const clubId = randomUUID();
const showId = randomUUID();
const assignmentId = randomUUID();
const enrollmentId = randomUUID();
const handlerId = randomUUID();

const users: Record<'steward' | 'secretary' | 'clubAdmin' | 'siteAdmin', FixtureUser> = {
  steward: fixtureUser('steward'),
  secretary: fixtureUser('secretary'),
  clubAdmin: fixtureUser('club-admin'),
  siteAdmin: fixtureUser('site-admin'),
};

function fixtureUser(label: string): FixtureUser {
  return {
    email: `${prefix}-${label}@example.test`,
    password,
    personId: randomUUID(),
  };
}
function authHeaders(key: string, includeJson = false): HeadersInit {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
  };
}
async function parseBody(response: Response): Promise<unknown | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
async function request<T = unknown>(
  path: string,
  init: RequestInit,
  key: string
): Promise<ApiResponse<T>> {
  const response = await fetch(`${supabaseUrl}${path}`, init);
  return {
    status: response.status,
    body: (await parseBody(response)) as T | null,
  };
}

function jsonInit(method: string, body: unknown, key: string, prefer?: string): RequestInit {
  return {
    method,
    headers: {
      ...authHeaders(key, true),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: JSON.stringify(body),
  };
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertStatus(response: ApiResponse, expected: number[], label: string): void {
  const body = response.body == null ? '' : ` (${JSON.stringify(response.body)})`;
  assert(
    expected.includes(response.status),
    `${label}: expected ${expected.join('/')} got ${response.status}${body}`
  );
}

async function createAuthUser(user: FixtureUser): Promise<void> {
  const response = await request<JsonObject>(
    '/auth/v1/admin/users',
    jsonInit(
      'POST',
      { email: user.email, password: user.password, email_confirm: true },
      serviceRoleKey
    ),
    serviceRoleKey
  );
  assertStatus(response, [200], `create ${user.email}`);
  const created = (response.body?.user ?? response.body) as JsonObject | undefined;
  user.authUserId = typeof created?.id === 'string' ? created.id : undefined;
  assert(user.authUserId, `create ${user.email}: response did not include an auth user id`);

  const login = await request<JsonObject>(
    '/auth/v1/token?grant_type=password',
    jsonInit('POST', { email: user.email, password: user.password }, anonKey),
    anonKey
  );
  assertStatus(login, [200], `login ${user.email}`);
  user.accessToken =
    typeof login.body?.access_token === 'string' ? login.body.access_token : undefined;
  assert(user.accessToken, `login ${user.email}: response did not include an access token`);
}

async function rest<T = unknown>(
  path: string,
  init: RequestInit = {},
  key = serviceRoleKey
): Promise<ApiResponse<T>> {
  const headers = new Headers(authHeaders(key));
  for (const [name, value] of Object.entries(init.headers ?? {})) {
    headers.set(name, String(value));
  }
  return request<T>(`/rest/v1${path}`, { ...init, headers }, key);
}

async function userRest<T = unknown>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<ApiResponse<T>> {
  const headers = new Headers({
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  });
  for (const [name, value] of Object.entries(init.headers ?? {})) {
    if (name.toLowerCase() === 'apikey' || name.toLowerCase() === 'authorization') continue;
    headers.set(name, String(value));
  }
  return request<T>(`/rest/v1${path}`, { ...init, headers }, accessToken);
}

async function callHelper(user: FixtureUser): Promise<boolean> {
  const response = await userRest<boolean>(
    '/rpc/is_show_office_manager',
    user.accessToken ?? anonKey,
    jsonInit('POST', { check_show_id: showId }, anonKey)
  );
  assertStatus(response, [200], `is_show_office_manager for ${user.email}`);
  return response.body === true;
}

async function getRow<T extends JsonObject>(
  table: string,
  id: string,
  select: string
): Promise<T | null> {
  const response = await rest<T[]>(`/${table}?id=eq.${id}&select=${encodeURIComponent(select)}`);
  assertStatus(response, [200], `read ${table} ${id}`);
  return Array.isArray(response.body) && response.body.length > 0 ? response.body[0] : null;
}

async function expectStewardDenials(): Promise<void> {
  const token = users.steward.accessToken ?? anonKey;
  const insertAssignment = await userRest(
    '/judge_assignments?select=id',
    token,
    jsonInit(
      'POST',
      { person_id: handlerId, show_id: showId, status: 'invited' },
      anonKey,
      'return=representation'
    )
  );
  assert(
    insertAssignment.status >= 400,
    `steward judge-assignment insert unexpectedly returned ${insertAssignment.status}`
  );

  const updateAssignment = await userRest(
    `/judge_assignments?id=eq.${assignmentId}&select=id,version`,
    token,
    jsonInit('PATCH', { notes: 'steward overwrite' }, anonKey, 'return=representation')
  );
  assertStatus(updateAssignment, [200, 204, 403], 'steward judge-assignment update response');
  assert(
    (await getRow<JsonObject>('judge_assignments', assignmentId, 'notes'))?.notes === 'private',
    'steward changed judge assignment'
  );

  const deleteAssignment = await userRest(
    `/judge_assignments?id=eq.${assignmentId}&select=id`,
    token,
    {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }
  );
  assertStatus(deleteAssignment, [200, 204, 403], 'steward judge-assignment delete response');
  assert(
    await getRow<JsonObject>('judge_assignments', assignmentId, 'id'),
    'steward deleted judge assignment'
  );

  const insertEnrollment = await userRest(
    '/enrollments?select=id',
    token,
    jsonInit(
      'POST',
      { confirmation_number: `${prefix}-steward`, show_id: showId, handler_id: handlerId },
      anonKey,
      'return=representation'
    )
  );
  assert(
    insertEnrollment.status >= 400,
    `steward enrollment insert unexpectedly returned ${insertEnrollment.status}`
  );

  const updateEnrollment = await userRest(
    `/enrollments?id=eq.${enrollmentId}&select=id`,
    token,
    jsonInit('PATCH', { notes: 'steward overwrite' }, anonKey, 'return=representation')
  );
  assertStatus(updateEnrollment, [200, 204, 403], 'steward enrollment update response');
  assert(
    (await getRow<JsonObject>('enrollments', enrollmentId, 'notes'))?.notes === 'private',
    'steward changed enrollment'
  );
}

async function expectManagerPositives(): Promise<void> {
  for (const [label, user] of Object.entries(users)) {
    if (label === 'steward') continue;
    const token = user.accessToken ?? anonKey;
    const assignment = await userRest(
      '/judge_assignments?select=id',
      token,
      jsonInit(
        'POST',
        { person_id: handlerId, show_id: showId, status: 'invited' },
        anonKey,
        'return=representation'
      )
    );
    assertStatus(assignment, [201], `${label} judge-assignment insert`);

    const enrollment = await userRest(
      '/enrollments?select=id',
      token,
      jsonInit(
        'POST',
        { confirmation_number: `${prefix}-${label}`, show_id: showId, handler_id: user.personId },
        anonKey,
        'return=representation'
      )
    );
    assertStatus(enrollment, [201], `${label} enrollment insert`);
  }
}

async function cleanup(): Promise<void> {
  const cleanupRequest = async (
    label: string,
    action: () => Promise<ApiResponse>
  ): Promise<void> => {
    try {
      await action();
    } catch (error) {
      console.error(`cleanup ${label} failed`);
      if (error instanceof Error) console.error(error.message);
    }
  };

  await cleanupRequest('show', () => rest(`/shows?id=eq.${showId}`, { method: 'DELETE' }));
  const authUserIds = Object.values(users)
    .map(user => user.authUserId)
    .filter((id): id is string => Boolean(id));
  if (authUserIds.length > 0) {
    await cleanupRequest('roles', () =>
      rest(`/user_roles?auth_user_id=in.(${authUserIds.join(',')})`, { method: 'DELETE' })
    );
  }
  await cleanupRequest('people', () =>
    rest(
      `/people?id=in.(${[...Object.values(users).map(user => user.personId), handlerId].join(',')})`,
      {
        method: 'DELETE',
      }
    )
  );
  await cleanupRequest('club', () => rest(`/clubs?id=eq.${clubId}`, { method: 'DELETE' }));
  for (const user of Object.values(users)) {
    if (user.authUserId) {
      await cleanupRequest(`auth user ${user.email}`, () =>
        request(
          `/auth/v1/admin/users/${user.authUserId}`,
          { method: 'DELETE', headers: authHeaders(serviceRoleKey) },
          serviceRoleKey
        )
      );
    }
  }
}

async function main(): Promise<void> {
  try {
    const rolesResponse = await rest<Array<{ id: string; name: string }>>(
      '/roles?name=in.(steward,secretary,club_admin,site_admin)&select=id,name'
    );
    assertStatus(rolesResponse, [200], 'role lookup');
    const roleIds = new Map((rolesResponse.body ?? []).map(role => [role.name, role.id]));
    for (const role of ['steward', 'secretary', 'club_admin', 'site_admin']) {
      assert(roleIds.has(role), `missing role ${role}`);
    }

    assertStatus(
      await rest(
        '/clubs',
        jsonInit('POST', { id: clubId, name: `${prefix} club` }, serviceRoleKey, 'return=minimal')
      ),
      [201],
      'club fixture'
    );
    assertStatus(
      await rest(
        '/people',
        jsonInit(
          'POST',
          [
            ...Object.values(users).map(user => ({
              id: user.personId,
              first_name: prefix,
              last_name: user.email.split('-').at(-1)?.split('@')[0] ?? 'fixture',
              email: user.email,
              auth_user_id: null,
            })),
            {
              id: handlerId,
              first_name: prefix,
              last_name: 'handler',
              email: `${prefix}-handler@example.test`,
              auth_user_id: null,
            },
          ],
          serviceRoleKey,
          'return=minimal'
        )
      ),
      [201],
      'people fixtures'
    );

    for (const user of Object.values(users)) await createAuthUser(user);
    for (const user of Object.values(users)) {
      assertStatus(
        await rest(
          `/people?id=eq.${user.personId}`,
          jsonInit('PATCH', { auth_user_id: user.authUserId }, serviceRoleKey, 'return=minimal')
        ),
        [204],
        `link ${user.email}`
      );
    }

    assertStatus(
      await rest(
        '/shows',
        jsonInit(
          'POST',
          {
            id: showId,
            name: `${prefix} show`,
            organization: 'AKC',
            start_date: '2026-08-02',
            end_date: '2026-08-02',
            club_id: clubId,
            status: 'published',
          },
          serviceRoleKey,
          'return=minimal'
        )
      ),
      [201],
      'show fixture'
    );

    assertStatus(
      await rest(
        '/user_roles',
        jsonInit(
          'POST',
          [
            {
              user_id: users.steward.personId,
              role_id: roleIds.get('steward'),
              club_id: clubId,
              show_id: showId,
              is_active: true,
              auth_user_id: users.steward.authUserId,
            },
            {
              user_id: users.secretary.personId,
              role_id: roleIds.get('secretary'),
              club_id: clubId,
              show_id: showId,
              is_active: true,
              auth_user_id: users.secretary.authUserId,
            },
            {
              user_id: users.clubAdmin.personId,
              role_id: roleIds.get('club_admin'),
              club_id: clubId,
              show_id: null,
              is_active: true,
              auth_user_id: users.clubAdmin.authUserId,
            },
            {
              user_id: users.siteAdmin.personId,
              role_id: roleIds.get('site_admin'),
              club_id: null,
              show_id: null,
              is_active: true,
              auth_user_id: users.siteAdmin.authUserId,
            },
          ],
          serviceRoleKey,
          'return=minimal'
        )
      ),
      [201],
      'role fixtures'
    );

    assertStatus(
      await rest(
        '/judge_assignments',
        jsonInit(
          'POST',
          {
            id: assignmentId,
            person_id: handlerId,
            show_id: showId,
            status: 'invited',
            fee: 100,
            notes: 'private',
          },
          serviceRoleKey,
          'return=minimal'
        )
      ),
      [201],
      'judge-assignment seed'
    );
    assertStatus(
      await rest(
        '/enrollments',
        jsonInit(
          'POST',
          {
            id: enrollmentId,
            confirmation_number: `${prefix}-seed`,
            show_id: showId,
            handler_id: handlerId,
            notes: 'private',
          },
          serviceRoleKey,
          'return=minimal'
        )
      ),
      [201],
      'enrollment seed'
    );

    assert((await callHelper(users.steward)) === false, 'steward helper unexpectedly authorized');
    assert((await callHelper(users.secretary)) === true, 'secretary helper denied');
    assert((await callHelper(users.clubAdmin)) === true, 'club-admin helper denied');
    assert((await callHelper(users.siteAdmin)) === true, 'site-admin helper denied');

    await expectStewardDenials();
    await expectManagerPositives();
    console.log('PASS MYK9-147 applied PostgREST steward denials and office-manager positives');
  } finally {
    await cleanup();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : 'MYK9-147 replay failed');
  process.exitCode = 1;
});

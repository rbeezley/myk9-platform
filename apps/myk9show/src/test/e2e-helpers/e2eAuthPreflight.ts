export type AuthPreflightRole = 'secretary' | 'admin' | 'judge';

interface RoleEnv {
  email: string;
  password: string;
}

export interface AuthPreflightCredential {
  role: AuthPreflightRole;
  email: string;
  password: string;
}

export interface AuthPreflightConfig {
  supabaseUrl: string;
  anonKey: string;
  credentials: AuthPreflightCredential[];
}

const ROLE_ENV: Record<AuthPreflightRole, RoleEnv> = {
  secretary: {
    email: 'E2E_SECRETARY_EMAIL',
    password: 'E2E_SECRETARY_PASSWORD',
  },
  admin: {
    email: 'E2E_ADMIN_EMAIL',
    password: 'E2E_ADMIN_PASSWORD',
  },
  judge: {
    email: 'E2E_JUDGE_EMAIL',
    password: 'E2E_JUDGE_PASSWORD',
  },
};

function isAuthPreflightRole(role: string): role is AuthPreflightRole {
  return role in ROLE_ENV;
}

export function resolveAuthPreflightConfig(
  env: NodeJS.ProcessEnv,
  roles: readonly string[]
): AuthPreflightConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  const missingBase = [
    !supabaseUrl ? 'VITE_SUPABASE_URL' : null,
    !anonKey ? 'VITE_SUPABASE_ANON_KEY' : null,
  ].filter(Boolean);

  if (missingBase.length > 0) {
    throw new Error(`Missing E2E auth preflight secret(s): ${missingBase.join(', ')}`);
  }
  if (!supabaseUrl || !anonKey) {
    throw new Error('Missing base E2E auth preflight configuration');
  }

  const credentials = roles.map(role => {
    if (!isAuthPreflightRole(role)) {
      throw new Error(`Unsupported E2E auth preflight role: ${role}`);
    }

    const envNames = ROLE_ENV[role];
    const email = env[envNames.email];
    const password = env[envNames.password];
    const missingRoleSecrets = [
      !email ? envNames.email : null,
      !password ? envNames.password : null,
    ].filter(Boolean);

    if (missingRoleSecrets.length > 0) {
      throw new Error(
        `Missing E2E auth preflight secret(s) for ${role}: ${missingRoleSecrets.join(', ')}`
      );
    }
    if (!email || !password) {
      throw new Error(`Missing E2E auth preflight credentials for ${role}`);
    }

    return {
      role,
      email,
      password,
    };
  });

  return {
    supabaseUrl,
    anonKey,
    credentials,
  };
}

export async function verifyE2EAuthCredentials(
  config: AuthPreflightConfig,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const tokenUrl = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/token?grant_type=password`;

  for (const credential of config.credentials) {
    const response = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: credential.email,
        password: credential.password,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `E2E auth preflight failed for ${credential.role}: Supabase rejected the configured credentials (HTTP ${response.status}). Refresh ${ROLE_ENV[credential.role].email}/${ROLE_ENV[credential.role].password} and reset the Supabase auth user password.`
      );
    }

    const body = (await response.json().catch(() => null)) as { access_token?: unknown } | null;
    if (typeof body?.access_token !== 'string' || body.access_token.length === 0) {
      throw new Error(
        `E2E auth preflight failed for ${credential.role}: Supabase returned no access token. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.`
      );
    }
  }
}

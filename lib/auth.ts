export const SESSION_COOKIE = 'exam_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 48; // 48 hours

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Signs `${username}:${password}:${expiresAt}` so the token is self-verifying
 * and carries its own expiry - no server-side session store needed. */
async function signExpiry(expiresAt: number): Promise<string | null> {
  const username = process.env.app_username;
  const password = process.env.app_password;
  if (!username || !password) return null;
  return sha256Hex(`${username}:${password}:${expiresAt}`);
}

export function verifyCredentials(username: string, password: string): boolean {
  return username === process.env.app_username && password === process.env.app_password;
}

export async function createSessionToken(): Promise<string | null> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const signature = await signExpiry(expiresAt);
  if (!signature) return null;
  return `${expiresAt}.${signature}`;
}

export async function isValidSession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const [expiresAtRaw, signature] = token.split('.');
  const expiresAt = Number(expiresAtRaw);
  if (!signature || !Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  const expected = await signExpiry(expiresAt);
  return expected !== null && signature === expected;
}

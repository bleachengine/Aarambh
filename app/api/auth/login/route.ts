import { NextRequest, NextResponse } from 'next/server';
import { verifyCredentials, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from '@/lib/auth';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface LoginPayload {
  username?: string;
  password?: string;
}

export async function POST(req: NextRequest) {
  let payload: LoginPayload;
  try {
    payload = (await req.json()) as LoginPayload;
  } catch {
    const body: ApiError = { error: 'Invalid request body. JSON expected.' };
    return NextResponse.json(body, { status: 400 });
  }

  const { username, password } = payload;
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    const body: ApiError = { error: 'Username and password are required.' };
    return NextResponse.json(body, { status: 400 });
  }

  if (!verifyCredentials(username, password)) {
    const body: ApiError = { error: 'Invalid username or password.' };
    return NextResponse.json(body, { status: 401 });
  }

  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

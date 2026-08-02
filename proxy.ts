import { NextRequest, NextResponse } from 'next/server';
import { isValidSession, SESSION_COOKIE } from '@/lib/auth';

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidSession(token)) {
    return NextResponse.next();
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/login', req.url));
}

export const config = {
  matcher: [
    '/((?!api/auth/login|login|_next/static|_next/image|icon.svg|apple-icon|opengraph-image|robots.txt|sitemap.xml|favicon.ico).*)',
  ],
};

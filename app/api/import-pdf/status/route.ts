import { NextRequest, NextResponse } from 'next/server';
import { checkPdfFileStatus, isGeminiConfigured } from '@/lib/gemini';
import type { ApiError } from '@/lib/types';

// ---- PDF question-paper import (separate feature, additive only) ----
// Step 2 of 3. A single, near-instant status check - the client calls this
// repeatedly (every couple seconds) until it reports ACTIVE or FAILED. Each
// call is fast on its own, so however many times it needs to be polled,
// no individual request risks a platform duration timeout.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface StatusPayload {
  fileName?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = { error: 'Gemini API key is not configured.' };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: StatusPayload;
    try {
      payload = (await req.json()) as StatusPayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (typeof payload.fileName !== 'string' || !payload.fileName) {
      const body: ApiError = { error: '"fileName" is required.' };
      return NextResponse.json(body, { status: 400 });
    }

    const result = await checkPdfFileStatus(payload.fileName);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to check the PDF processing status.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

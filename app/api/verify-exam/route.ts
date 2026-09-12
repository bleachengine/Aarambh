import { NextRequest, NextResponse } from 'next/server';
import { verifyExamAnswers, isGeminiConfigured } from '@/lib/gemini';
import { generatedExamSchema } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import type { ApiError, GeneratedExam } from '@/lib/types';

// ---- AI-generated exam answer verification (separate feature, additive only) ----
// Same dedicated re-solve pass used for imported PDF papers
// (see app/api/import-pdf/verify), applied to freshly AI-generated exams too.
// Runs as its own request AFTER /api/generate has already returned the exam,
// so the exam is never lost even if this fails - a failure here just leaves
// the (already functional) generation-pass answers in place. The client
// awaits this before letting the user start answering, since a generated
// exam is taken once immediately - unlike a reusable PYQ paper, there's no
// later point to defer the correction to.
//
// Accepts the exam directly in the body rather than fetching it by id: the
// client already holds the full exam in memory right after generation, so
// there is nothing to gain from a redundant DB round trip. `historyId` is
// optional and only used to best-effort persist the correction for the
// history/resume feature - never required for verification itself.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface VerifyPayload {
  exam?: unknown;
  historyId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = { error: 'Gemini API key is not configured.' };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: VerifyPayload;
    try {
      payload = (await req.json()) as VerifyPayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    const examParse = generatedExamSchema.safeParse(payload.exam);
    if (!examParse.success) {
      const body: ApiError = {
        error: 'Invalid exam payload.',
        details: examParse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
      return NextResponse.json(body, { status: 400 });
    }

    let result;
    try {
      result = await verifyExamAnswers(examParse.data as GeneratedExam);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isQuota = message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
      // Non-fatal: the exam already exists with generation-pass answers, so
      // report the failure but let the client carry on with those answers.
      const body: ApiError = {
        error: isQuota
          ? 'Could not double-check answers right now (AI quota). Continuing with the initial answers.'
          : 'Could not double-check answers. Continuing with the initial answers.',
        details: message,
      };
      return NextResponse.json(body, { status: isQuota ? 429 : 502 });
    }

    // Best-effort only: DB persistence here only matters for the history/
    // resume feature, never for the immediate exam the client already holds
    // in memory - a write failure must never turn an otherwise-successful
    // verification into an error response.
    if (result.changedCount > 0 && payload.historyId && supabase) {
      try {
        await supabase.from('exam_history').update({ exam: result.exam }).eq('id', payload.historyId);
      } catch {
        /* best-effort only */
      }
    }

    return NextResponse.json({ ok: true, changedCount: result.changedCount, exam: result.exam });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to verify the answers.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

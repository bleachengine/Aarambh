import { NextRequest, NextResponse } from 'next/server';
import { verifyExamAnswers, isGeminiConfigured } from '@/lib/gemini';
import { generatedExamSchema } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import type { ApiError, GeneratedExam, PYQPaper } from '@/lib/types';

// ---- PDF question-paper import (separate feature, additive only) ----
// Optional 4th step. Runs AFTER extract has already saved the paper, so the
// paper is never lost even if this fails - a verify failure just leaves the
// (already functional) extraction-pass answers in place. Re-solves every MCQ
// on a stronger text-only model and updates the saved answers in place. Only
// worth running for papers WITHOUT an official answer key (printed keys are
// ground truth); the client gates on has_answer_key.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface VerifyPayload {
  paperId?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = { error: 'Gemini API key is not configured.' };
      return NextResponse.json(body, { status: 503 });
    }
    if (!supabase) {
      const body: ApiError = { error: 'Supabase is not configured.' };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: VerifyPayload;
    try {
      payload = (await req.json()) as VerifyPayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }
    if (typeof payload.paperId !== 'string' || !payload.paperId) {
      const body: ApiError = { error: '"paperId" is required.' };
      return NextResponse.json(body, { status: 400 });
    }

    const { data: row, error: fetchError } = await supabase
      .from('pyq_papers')
      .select('exam')
      .eq('id', payload.paperId)
      .single();
    if (fetchError || !row) {
      const body: ApiError = { error: 'Paper not found for verification.', details: fetchError?.message };
      return NextResponse.json(body, { status: 404 });
    }

    const examParse = generatedExamSchema.safeParse(row.exam);
    if (!examParse.success) {
      const body: ApiError = { error: 'Stored paper is not in a verifiable format.' };
      return NextResponse.json(body, { status: 422 });
    }

    let result;
    try {
      result = await verifyExamAnswers(examParse.data as GeneratedExam);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isQuota = message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
      // Non-fatal: the paper already exists with extraction-pass answers, so
      // report the failure but let the client treat the import as succeeded.
      const body: ApiError = {
        error: isQuota
          ? 'Could not double-check answers right now (AI quota). The paper was imported with its initial answers.'
          : 'Could not double-check answers. The paper was imported with its initial answers.',
        details: message,
      };
      return NextResponse.json(body, { status: isQuota ? 429 : 502 });
    }

    // Nothing changed - skip the write entirely.
    if (result.changedCount === 0) {
      return NextResponse.json({ ok: true, changedCount: 0, exam: result.exam });
    }

    const { data: updated, error: updateError } = await supabase
      .from('pyq_papers')
      .update({ exam: result.exam })
      .eq('id', payload.paperId)
      .select('id, title, exam_name, year, description, question_count, source_filename, has_answer_key, created_at, exam')
      .single();
    if (updateError || !updated) {
      const body: ApiError = {
        error: 'Verified the answers but could not save the corrections.',
        details: updateError?.message,
      };
      return NextResponse.json(body, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      changedCount: result.changedCount,
      paper: updated as PYQPaper,
      exam: result.exam,
    });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to verify the answers.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

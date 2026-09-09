import { NextRequest, NextResponse } from 'next/server';
import { extractQuestionsFromUploadedPdf, isGeminiConfigured } from '@/lib/gemini';
import { supabase } from '@/lib/supabase';
import type { ApiError, PYQPaper } from '@/lib/types';

// ---- PDF question-paper import (separate feature, additive only) ----
// Step 3 of 3. Called once the status endpoint reports ACTIVE. This is the
// one step that can't be split further (a single generateContent call), but
// measured timings (10-25s for 20-80 questions) comfortably fit a 60s
// ceiling now that it's not sharing that budget with upload/processing-wait
// time. Produces a PYQPaper whose `exam` field is a standard GeneratedExam,
// so the existing ExamRunner and /api/evaluate handle it with zero changes.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface ExtractPayload {
  fileName?: string;
  originalFilename?: string;
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = { error: 'Gemini API key is not configured.' };
      return NextResponse.json(body, { status: 503 });
    }

    if (!supabase) {
      const body: ApiError = {
        error: 'Supabase is not configured.',
        details: 'PDF import requires Supabase to store the imported paper.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: ExtractPayload;
    try {
      payload = (await req.json()) as ExtractPayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (typeof payload.fileName !== 'string' || !payload.fileName) {
      const body: ApiError = { error: '"fileName" is required.' };
      return NextResponse.json(body, { status: 400 });
    }

    let extraction;
    try {
      extraction = await extractQuestionsFromUploadedPdf(payload.fileName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isQuota = message.includes('RESOURCE_EXHAUSTED') || message.includes('"code":429');
      const body: ApiError = {
        error: isQuota
          ? 'Gemini quota exceeded. Please try again later.'
          : 'Failed to extract questions from the PDF.',
        details: message,
      };
      return NextResponse.json(body, { status: isQuota ? 429 : 502 });
    }

    const { data, error } = await supabase
      .from('pyq_papers')
      .insert({
        title: extraction.exam.metadata.title,
        exam_name: extraction.examName,
        year: extraction.year,
        description: extraction.exam.metadata.description,
        question_count: extraction.exam.questions.length,
        source_filename: payload.originalFilename ?? null,
        has_answer_key: extraction.hasAnswerKey,
        exam: extraction.exam,
      })
      .select('id, title, exam_name, year, description, question_count, source_filename, has_answer_key, created_at, exam')
      .single();

    if (error || !data) {
      const body: ApiError = {
        error: 'Extracted the questions but failed to save the paper.',
        details: error?.message,
      };
      return NextResponse.json(body, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      paper: data as PYQPaper,
      warnings: extraction.warnings,
    });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to import the question paper.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

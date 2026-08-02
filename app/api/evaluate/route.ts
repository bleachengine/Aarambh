import { NextRequest, NextResponse, after } from 'next/server';
import { evaluateExam, isGeminiConfigured } from '@/lib/gemini';
import { generatedExamSchema, submittedAnswersSchema } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import type { ApiError } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface EvaluatePayload {
  exam: unknown;
  answers: Record<string, string | null>;
  historyId?: string | null;
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = {
        error: 'Gemini API key is not configured.',
        details:
          'Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your environment variables to enable evaluation.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: EvaluatePayload;
    try {
      payload = await req.json() as EvaluatePayload;
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    if (!payload || typeof payload !== 'object' || !('exam' in payload) || !('answers' in payload)) {
      const body: ApiError = { error: 'Request must include "exam" and "answers".' };
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

    const answersParse = submittedAnswersSchema.safeParse(payload.answers ?? {});
    if (!answersParse.success) {
      const body: ApiError = {
        error: 'Invalid answers payload.',
        details: '"answers" must be an object mapping question id to a string answer or null.',
      };
      return NextResponse.json(body, { status: 400 });
    }
    const answers = answersParse.data;

    const result = await evaluateExam(examParse.data, answers);

    if (supabase && payload.historyId) {
      // Doesn't feed the response - deferred so the client gets its graded
      // result immediately instead of waiting on this write to finish.
      const historyId = payload.historyId;
      after(async () => {
        try {
          await supabase!
            .from('exam_history')
            .update({
              answers,
              evaluation: result,
              status: 'evaluated',
              evaluated_at: new Date().toISOString(),
            })
            .eq('id', historyId);
        } catch {
          // best-effort only
        }
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to evaluate exam.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

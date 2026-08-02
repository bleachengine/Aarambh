import { NextRequest, NextResponse, after } from 'next/server';
import { generateExam, isGeminiConfigured } from '@/lib/gemini';
import { embedTexts } from '@/lib/embeddings';
import { examConfigSchema } from '@/lib/validation';
import { supabase } from '@/lib/supabase';
import type { ApiError, GeneratedExam } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SIMILARITY_THRESHOLD = 0.86;

interface EmbedCheckResult {
  embeddings: number[][];
  duplicateTexts: string[];
}

/** Embeds every question in one API call, then checks each against past
 * questions for the same topic via a single indexed DB lookup per question
 * (no LLM calls involved in the check itself). Returns the embeddings so
 * callers can reuse them for storage without re-embedding. */
async function embedAndCheckDuplicates(topic: string, exam: GeneratedExam): Promise<EmbedCheckResult> {
  const texts = exam.questions.map((q) => q.question);
  const embeddings = await embedTexts(texts);

  const matches = await Promise.all(
    embeddings.map(async (embedding) => {
      try {
        const { data } = await supabase!.rpc('match_question', {
          query_embedding: embedding,
          match_topic: topic,
          match_threshold: SIMILARITY_THRESHOLD,
        });
        return data && data.length > 0 ? data[0] : null;
      } catch {
        return null;
      }
    }),
  );

  const duplicateTexts = texts.filter((_, i) => matches[i] !== null);
  return { embeddings, duplicateTexts };
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      const body: ApiError = {
        error: 'Gemini API key is not configured.',
        details:
          'Add GEMINI_API_KEY (or GOOGLE_API_KEY) to your environment variables to enable exam generation.',
      };
      return NextResponse.json(body, { status: 503 });
    }

    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      const body: ApiError = { error: 'Invalid request body. JSON expected.' };
      return NextResponse.json(body, { status: 400 });
    }

    const parsed = examConfigSchema.safeParse(payload);
    if (!parsed.success) {
      const body: ApiError = {
        error: 'Invalid exam configuration.',
        details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      };
      return NextResponse.json(body, { status: 400 });
    }

    const config = parsed.data;

    if (config.mcqCount === 0 && config.descriptiveCount === 0) {
      const body: ApiError = { error: 'Request at least one MCQ or descriptive question.' };
      return NextResponse.json(body, { status: 400 });
    }

    let exam = await generateExam(config);

    let embedCheck: EmbedCheckResult | null = null;
    if (supabase) {
      try {
        embedCheck = await embedAndCheckDuplicates(config.topic, exam);
        if (embedCheck.duplicateTexts.length > 0) {
          // One targeted retry: regenerate the whole exam, explicitly telling
          // the model which questions it just proposed are near-duplicates
          // of past ones. If the retry still collides, we accept it rather
          // than looping - a rare edge case, not worth extra latency/cost.
          exam = await generateExam({ ...config, avoidQuestions: embedCheck.duplicateTexts });
          embedCheck = await embedAndCheckDuplicates(config.topic, exam);
        }
      } catch {
        embedCheck = null; // best-effort: duplicate detection must never block generation
      }
    }

    let historyId: string | null = null;
    if (supabase) {
      const { data } = await supabase
        .from('exam_history')
        .insert({
          topic: config.topic,
          difficulty: config.difficulty,
          mcq_count: config.mcqCount,
          descriptive_count: config.descriptiveCount,
          expansion: config.expansion,
          exam,
          status: 'generated',
        })
        .select('id')
        .single();
      historyId = data?.id ?? null;

      if (embedCheck) {
        // Doesn't feed the response - deferred so the client gets its exam
        // immediately instead of waiting on this extra round trip.
        const rows = exam.questions.map((q, i) => ({
          exam_history_id: historyId,
          topic: config.topic,
          question: q.question,
          embedding: embedCheck!.embeddings[i],
        }));
        after(async () => {
          try {
            await supabase!.from('question_embeddings').insert(rows);
          } catch {
            // best-effort only
          }
        });
      }
    }

    return NextResponse.json({ ok: true, exam, historyId });
  } catch (err) {
    const body: ApiError = {
      error: 'Failed to generate exam.',
      details: err instanceof Error ? err.message : String(err),
    };
    return NextResponse.json(body, { status: 500 });
  }
}

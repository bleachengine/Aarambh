import { supabase } from './supabase';
import type { PYQPaper, GeneratedExam } from './types';

const PYQ_UPLOADS_BUCKET = 'pyq-uploads';

// ---- Previous-Year Question Paper import (separate feature, additive only) ----
// Mirrors the style of lib/history.ts. Does not read or write exam_history
// except for startPyqAttempt(), which inserts a brand-new row there - the
// exact same shape a fresh AI generation would create - so the rest of the
// app (ExamRunner, /api/evaluate, ExamHistory) needs zero changes to handle
// PYQ attempts.

/** Lean by design - does not select `exam` or `description`. The list view
 * only ever renders title/exam_name/year/question_count/has_answer_key/date,
 * so fetching every question's full text for every paper here would be pure
 * waste, especially as the number of imported papers grows. Use
 * fetchPyqPaperExam() to get the full exam right before starting an attempt. */
export async function fetchPyqPapers(limit = 50): Promise<PYQPaper[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pyq_papers')
    .select('id, title, exam_name, year, question_count, source_filename, has_answer_key, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as PYQPaper[];
}

/** Fetches just the full exam JSON for one paper - called on-demand right
 * before starting an attempt (not part of the list fetch, see above). */
export async function fetchPyqPaperExam(id: string): Promise<GeneratedExam | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('pyq_papers').select('exam').eq('id', id).single();
  if (error || !data) return null;
  return data.exam as GeneratedExam;
}

export async function deletePyqPaper(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pyq_papers').delete().eq('id', id);
  return !error;
}

/** Step 1 of the PDF import flow: uploads the file DIRECTLY from the browser
 * to Supabase Storage, bypassing this app's own server entirely. This exists
 * because Vercel enforces a hard ~4.5MB request body limit at the
 * infrastructure level (confirmed in production) - a request that never
 * reaches a Vercel function isn't subject to it. The server picks the file
 * up from Storage in the next step (see /api/import-pdf/upload).
 *
 * A single direct `.upload()` call, not the two-step signed-upload-URL dance
 * (create URL, then upload to it) - this app's anon key already has full
 * insert/select/delete access to this bucket via RLS (same fully-open,
 * single-tenant model as every other table here), so the extra round trip
 * signed URLs exist for (granting upload rights to a caller that otherwise
 * has none) buys nothing here, only costs one full network round trip. */
export async function uploadPdfDirectToStorage(file: File): Promise<{ storagePath: string } | null> {
  if (!supabase) return null;
  const path = `${crypto.randomUUID()}.pdf`;
  const { data, error } = await supabase.storage
    .from(PYQ_UPLOADS_BUCKET)
    .upload(path, file, { contentType: 'application/pdf' });
  if (error || !data) return null;
  return { storagePath: data.path };
}

/** Starts a fresh attempt at an imported paper by inserting a new
 * exam_history row (status 'generated', no answers yet) - identical to what
 * happens when a normal exam is freshly generated. Each call creates an
 * independent row, so retaking a paper never reuses a previous attempt's
 * answers/progress.
 *
 * Takes `exam` explicitly (rather than reading `paper.exam`) since the list
 * view's PYQPaper objects don't carry it - the caller is responsible for
 * having it already (fresh from import) or fetching it via
 * fetchPyqPaperExam() first. */
export async function startPyqAttempt(
  paper: Pick<PYQPaper, 'title' | 'question_count'>,
  exam: GeneratedExam,
): Promise<{ historyId: string; exam: GeneratedExam } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('exam_history')
    .insert({
      topic: paper.title,
      difficulty: exam.metadata.difficulty,
      mcq_count: paper.question_count,
      descriptive_count: 0,
      expansion: 0,
      exam,
      status: 'generated',
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return { historyId: data.id as string, exam };
}

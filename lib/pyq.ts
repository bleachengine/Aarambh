import { supabase } from './supabase';
import type { PYQPaper, GeneratedExam } from './types';

// ---- Previous-Year Question Paper import (separate feature, additive only) ----
// Mirrors the style of lib/history.ts. Does not read or write exam_history
// except for startPyqAttempt(), which inserts a brand-new row there - the
// exact same shape a fresh AI generation would create - so the rest of the
// app (ExamRunner, /api/evaluate, ExamHistory) needs zero changes to handle
// PYQ attempts.

export async function fetchPyqPapers(limit = 50): Promise<PYQPaper[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('pyq_papers')
    .select('id, title, exam_name, year, description, question_count, source_filename, has_answer_key, created_at, exam')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as PYQPaper[];
}

export async function deletePyqPaper(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('pyq_papers').delete().eq('id', id);
  return !error;
}

/** Starts a fresh attempt at an imported paper by inserting a new
 * exam_history row (status 'generated', no answers yet) - identical to what
 * happens when a normal exam is freshly generated. Each call creates an
 * independent row, so retaking a paper never reuses a previous attempt's
 * answers/progress. */
export async function startPyqAttempt(
  paper: PYQPaper,
): Promise<{ historyId: string; exam: GeneratedExam } | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('exam_history')
    .insert({
      topic: paper.title,
      difficulty: paper.exam.metadata.difficulty,
      mcq_count: paper.question_count,
      descriptive_count: 0,
      expansion: 0,
      exam: paper.exam,
      status: 'generated',
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return { historyId: data.id as string, exam: paper.exam };
}
